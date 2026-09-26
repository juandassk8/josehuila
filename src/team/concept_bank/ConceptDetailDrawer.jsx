import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { getBankConceptDetail } from "./db.js";
import { deleteVariation } from "../../despliegue/db.js";
import { MoveVariationModal } from "./MoveVariationModal.jsx";
import { BankVariationDetailModal, LinkBadges } from "./BankVariationDetailModal.jsx";
import { ConceptEditModal } from "./ConceptEditModal.jsx";
import { AddVariationModal } from "./AddVariationModal.jsx";
import { BulkTagRefsModal } from "./BulkTagRefsModal.jsx";
import { deleteVariationsBulk } from "./db.js";
import { useRefAnalysisQueue } from "./useRefAnalysisQueue.js";
import { returnVariationsToInbox, backupBankVariationsToDrive } from "../inbox/inboxDb.js";
import { ReferenceFilterBar, LabelChips } from "../../despliegue/ReferenceLabelUI.jsx";
import { groupVariations, variationMatches, hasActiveFilters, CATEGORY_BY_KEY, suggestionsByCategory, NO_LABEL } from "../../despliegue/labels.js";
import { canDeleteBankConcept, canManageBank, canOperateBank } from "../lib/permissions.js";

// 4 niveles de zoom para el grid de referencias.
// Defaults: L2 (lo que veías ahora). El user puede ir hacia arriba (más grande)
// o hacia abajo (más chiquito, más por fila).
const ZOOM_LEVELS = [
  { key: 1, label: "Grande",  minPx: 280 },
  { key: 2, label: "Mediano", minPx: 220 },
  { key: 3, label: "Chico",   minPx: 170 },
  { key: 4, label: "Mini",    minPx: 130 },
];
const ZOOM_STORAGE_KEY = "concept_drawer_zoom_level";

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const FORMAT_LABEL = { static: "Estático", video: "Video" };
const PIPELINE_LABEL = { ads: "Ads", organic: "Orgánico" };

// Modal full-screen-ish con detalle del concepto + grid de todas sus variations.
// Si el concepto pertenece a un grupo cross-empresa, muestra refs de todos los
// miembros (sus propias primero) con badge admin de empresa origen.
export function ConceptDetailDrawer({ item, onClose, onImport, currentMember = null, onConceptChanged, allTags = [] }) {
  const canDelete = canDeleteBankConcept(currentMember);
  const canManage = canManageBank(currentMember);
  // Sumar una variación es traer material, no reorganizar el banco.
  const puedeOperar = canOperateBank(currentMember);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moveTarget, setMoveTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addVarOpen, setAddVarOpen] = useState(false);

  // Selección múltiple de referencias (etiquetar / mover / borrar en lote)
  const [refSelectMode, setRefSelectMode] = useState(false);
  const [selectedRefIds, setSelectedRefIds] = useState(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Agrupar + filtrar/resaltar por etiquetas. Defaults: agrupar por Marca (auto
  // clusteriza por marca, la de más refs primero) y etiquetas ocultas (limpio).
  const [groupBy, setGroupBy] = useState(() => {
    try { const v = localStorage.getItem("concept_ref_groupby"); return v === null ? "marca" : v; }
    catch { return "marca"; }
  });
  const [filters, setFilters] = useState({});
  const [hlMode, setHlMode] = useState("resaltar"); // 'resaltar' | 'filtrar'
  const [showLabels, setShowLabels] = useState(() => {
    try { return localStorage.getItem("concept_ref_showlabels") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("concept_ref_groupby", groupBy); } catch { /* ignore */ } }, [groupBy]);
  useEffect(() => { try { localStorage.setItem("concept_ref_showlabels", showLabels ? "1" : "0"); } catch { /* ignore */ } }, [showLabels]);

  const toggleRef = (id) => setSelectedRefIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exitRefSelect = () => { setRefSelectMode(false); setSelectedRefIds(new Set()); };
  const afterBulk = () => { exitRefSelect(); setReloadKey((k) => k + 1); onConceptChanged?.(); };

  // Cola de análisis con IA de las referencias seleccionadas (no bloqueante).
  const { enqueue, queueCount, analyzingIds, progressById, analyzeMsg } = useRefAnalysisQueue({
    onAfterEach: () => { setReloadKey((k) => k + 1); onConceptChanged?.(); },
  });
  const analyzeSelectedRefs = () => {
    const chosen = (detail?.variations || []).filter((v) => selectedRefIds.has(v.id));
    exitRefSelect();
    enqueue(chosen);
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedRefIds];
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} referencia${ids.length === 1 ? "" : "s"}? No se puede deshacer.`)) return;
    setBulkBusy(true);
    try {
      const { count } = await deleteVariationsBulk(ids);
      if (count === 0) alert("No se borró ninguna (0 filas). Puede ser un tema de permisos.");
      afterBulk();
    } catch (e) {
      alert(`No se pudo eliminar: ${e?.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  };

  // ¿Está "incompleta"? (no analizada): sin transcripción o sin portada.
  const isIncomplete = (v) => !(v.transcript && v.transcript.trim()) || !v.file_url;
  // Sin respaldo en Drive (pero con link de Meta para re-buscar el video).
  const isNoDrive = (v) => !v.drive_url && (v.meta_ad_id || v.meta_ads_library_url);
  // Sin notas ("cómo está hecho").
  const isNoNotes = (v) => !(v.notes && v.notes.trim());

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);

  // Quick-select por criterio: entra a modo selección y marca las que cumplen.
  const quickSelect = (pred, emptyMsg) => {
    const hits = (detail?.variations || []).filter(pred);
    if (!hits.length) { alert(emptyMsg); return; }
    setRefSelectMode(true);
    setSelectedRefIds(new Set(hits.map((v) => v.id)));
  };
  const selectIncomplete = () => quickSelect(isIncomplete, "No hay referencias incompletas en este concepto.");
  const selectNoDrive = () => quickSelect(isNoDrive, "Todas las referencias con link de Meta ya tienen Drive.");
  const selectNoNotes = () => quickSelect(isNoNotes, "Todas las referencias ya tienen notas.");

  // Respalda a Drive las seleccionadas: re-busca el video por Apify (marca + ad_id)
  // y lo sube a Drive, seteando drive_url en la variación.
  const handleBackupToDrive = async () => {
    const chosen = (detail?.variations || []).filter((v) => selectedRefIds.has(v.id) && isNoDrive(v));
    if (!chosen.length) { alert("Ninguna de las seleccionadas necesita Drive (o no tiene link de Meta)."); return; }
    if (!confirm(`Respaldar a Drive ${chosen.length} referencia(s)? Busca el video en Meta por su marca. Vas a ver el avance abajo.`)) return;
    setBackupBusy(true); setBackupMsg("Respaldando…");
    try {
      const concept = { name: detail?.concept?.name ?? item.name, stage: detail?.concept?.stage ?? item.stage };
      const res = await backupBankVariationsToDrive(chosen, { concept, onProgress: setBackupMsg });
      setReloadKey((k) => k + 1); onConceptChanged?.();
      setBackupMsg(null);
      const diag = [];
      if (res.noAdId) diag.push(`${res.noAdId} sin link de Meta con id (subidos a mano → re-subir)`);
      if (res.notInMeta) diag.push(`${res.notInMeta} ya NO están en Meta (anuncio bajado)`);
      if (res.foundNoVideo) diag.push(`${res.foundNoVideo} sí están pero sin video (imagen/carrusel)`);
      alert(`☁ Drive: ${res.done} respaldada(s) de ${res.total}.` +
        (res.failed ? ` · ${res.failed} con error.` : "") +
        `\n\nBúsqueda: ${res.brands} marca(s), ${res.scrapedTotal} anuncios scrapeados (${res.scrapedWithVideo} con video).` +
        (diag.length ? `\n\nNo se pudo:\n· ${diag.join("\n· ")}` : "") +
        (res.failed && res.backupReason ? `\n\n⚠ MOTIVO DEL ERROR DE RESPALDO:\n${res.backupReason}` : "") +
        (res.scrapedTotal === 0 && res.apifyReason ? `\n\n⚠ APIFY RECHAZÓ LA BÚSQUEDA:\n${res.apifyReason}` : "") +
        (res.reason ? `\n${res.reason}` : ""));
    } catch (e) {
      setBackupMsg(null);
      alert(`No se pudo respaldar: ${e?.message || e}`);
    } finally { setBackupBusy(false); }
  };

  // Devuelve las seleccionadas a la Bandeja (las MUEVE: crea el item de inbox
  // asignado a este concepto y borra la variación pelada del banco).
  const handleReturnToInbox = async () => {
    const chosen = (detail?.variations || []).filter((v) => selectedRefIds.has(v.id));
    if (!chosen.length) return;
    if (!confirm(`Se mueven ${chosen.length} referencia${chosen.length === 1 ? "" : "s"} a la Bandeja de referentes y se quitan del banco (para re-analizarlas). ¿Seguir?`)) return;
    setBulkBusy(true);
    try {
      const concept = {
        id: item.id,
        name: detail?.concept?.name ?? item.name,
        stage: detail?.concept?.stage ?? item.stage,
        format: detail?.concept?.format ?? item.format,
        company_id: item.company_id,
        pipeline_type: item.pipeline_type,
      };
      const { returned, skipped } = await returnVariationsToInbox(chosen, concept);
      afterBulk();
      alert(`↩ ${returned} devuelta(s) a la Bandeja${skipped ? ` · ${skipped} sin link de Meta (omitidas)` : ""}.\n\nAndá a la Bandeja → "🎬 Traer videos (Apify)" para completarlas y recargarlas a este concepto.`);
    } catch (e) {
      alert(`No se pudo devolver: ${e?.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const [zoomLevel, setZoomLevel] = useState(() => {
    try {
      const v = localStorage.getItem(ZOOM_STORAGE_KEY);
      const n = v ? parseInt(v, 10) : 2;
      return ZOOM_LEVELS.find((l) => l.key === n) ? n : 2;
    } catch { return 2; }
  });
  useEffect(() => {
    try { localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel)); } catch {
      // ignore
    }
  }, [zoomLevel]);
  const zoomMinPx = ZOOM_LEVELS.find((l) => l.key === zoomLevel)?.minPx || 220;

  const handleDelete = async (v) => {
    const isOwn = v.origin_company_id === item.company_id;
    const warn = isOwn
      ? `¿Eliminar la referencia ${v.label || ""}? No se puede deshacer.`
      : `Esta referencia es de ${v.origin_company_name || "otra empresa"}. Si la borrás, se elimina también de su despliegue. ¿Continuar?`;
    if (!confirm(warn)) return;
    setDeletingId(v.id);
    try {
      await deleteVariation(v.id);
      setReloadKey((k) => k + 1);
    } catch (e) {
      alert(`No se pudo eliminar: ${e?.message || e}`);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBankConceptDetail(item.id).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id, reloadKey]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const groupMembers = detail?.groupMembers || [];
  const isGrouped = groupMembers.length > 1;
  const otherCompanies = useMemo(() => {
    if (!isGrouped) return [];
    return groupMembers
      .filter((m) => m.company_id !== item.company_id)
      .map((m) => m.company_name)
      .filter(Boolean);
  }, [isGrouped, groupMembers, item.company_id]);

  const ownVarsCount = useMemo(() => {
    if (!detail?.variations) return 0;
    return detail.variations.filter((v) => v.origin_company_id === item.company_id).length;
  }, [detail?.variations, item.company_id]);

  const totalVarsCount = detail?.variations?.length || 0;
  const duplicatesHidden = detail?.duplicatesHidden || 0;
  const incompleteCount = useMemo(
    () => (detail?.variations || []).filter((v) => v.meta_ads_library_url && isIncomplete(v)).length,
    [detail?.variations]
  );
  const noDriveCount = useMemo(() => (detail?.variations || []).filter(isNoDrive).length, [detail?.variations]);
  const noNotesCount = useMemo(() => (detail?.variations || []).filter(isNoNotes).length, [detail?.variations]);

  // Campos mutables (name/stage/format/tags/description) los tomamos del detalle
  // recién cargado si está disponible, así tras editar el header se refresca solo.
  // company/niche/pipeline vienen del item joineado del banco.
  const conceptName = detail?.concept?.name ?? item.name;
  const conceptStage = detail?.concept?.stage ?? item.stage;
  const conceptFormat = detail?.concept?.format ?? item.format;
  const conceptTags = detail?.concept?.bank_tags ?? item.bank_tags ?? [];
  // Item enriquecido para el modal de edición (necesita company_name para copies).
  const editItem = { ...item, ...(detail?.concept || {}) };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1400px, 95vw)",
          height: "min(900px, 92vh)",
          background: DS.bgSide,
          border: `1px solid ${DS.textHint}`,
          borderRadius: 16,
          color: DS.textPrimary,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header sticky */}
        <div style={{
          padding: "20px 28px 16px",
          borderBottom: `1px solid ${DS.textHint}`,
          display: "flex", alignItems: "flex-start", gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
              color: DS.textMuted, marginBottom: 6,
            }}>
              {STAGE_LABEL[conceptStage]} · {FORMAT_LABEL[conceptFormat]} · {PIPELINE_LABEL[item.pipeline_type]}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{
                fontSize: 24, fontWeight: 700, margin: 0,
                letterSpacing: "-0.01em", lineHeight: 1.2,
              }}>
                {conceptName || "Sin nombre"}
              </h2>
              {isGrouped && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#7BB6E6",
                  padding: "4px 10px", borderRadius: 50,
                  background: "rgba(59,139,212,0.16)",
                  border: "1px solid rgba(59,139,212,0.40)",
                  letterSpacing: "0.04em",
                }}>
                  🔗 Vinculado · {groupMembers.length} empresas
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: DS.textSecondary, marginTop: 6 }}>
              {item.company_name}{item.niche ? ` · ${item.niche}` : ""}
              {isGrouped && otherCompanies.length > 0 && (
                <span style={{ color: DS.textMuted }}>
                  {" · "}+ {otherCompanies.join(", ")}
                </span>
              )}
            </div>
            {isGrouped && (
              <div style={{
                fontSize: 11, color: DS.textMuted, marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}>
                {totalVarsCount} refs en total ({ownVarsCount} propias · {totalVarsCount - ownVarsCount} de otras empresas)
              </div>
            )}
            {duplicatesHidden > 0 && (
              <div style={{
                fontSize: 11, color: "#7BB6E6", marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}>
                🧹 {duplicatesHidden} {duplicatesHidden === 1 ? "copia duplicada ocultada" : "copias duplicadas ocultadas"} (mismo archivo ya presente)
              </div>
            )}
            {conceptTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {conceptTags.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, fontWeight: 700, color: "#7BB6E6",
                    padding: "3px 9px", borderRadius: 50,
                    background: "rgba(59,139,212,0.16)",
                    border: "1px solid rgba(59,139,212,0.40)",
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {canManage && (
              <button
                onClick={() => setEditOpen(true)}
                title="Editar formato"
                style={{
                  height: 32, padding: "0 14px", borderRadius: 8,
                  border: DS.border, background: "transparent",
                  color: DS.textSecondary, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font,
                }}
              >✎ Editar</button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: DS.border, background: "transparent",
                color: DS.textSecondary, cursor: "pointer", fontSize: 16,
                flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>
        </div>

        {/* Body scroll */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
          {/* CTA importar */}
          <button
            onClick={onImport}
            style={{
              width: "100%", padding: "14px 18px", borderRadius: 50,
              border: "none", background: DS.green, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: DS.font, letterSpacing: "0.02em",
              marginBottom: 22,
            }}
          >
            Importar a otra empresa →
            {isGrouped && (
              <span style={{ fontWeight: 500, opacity: 0.9, marginLeft: 8 }}>
                ({totalVarsCount} refs combinadas)
              </span>
            )}
          </button>

          {/* Descripción */}
          {detail?.concept?.description && (
            <Section title="Descripción">
              <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {detail.concept.description}
              </div>
            </Section>
          )}

          {/* Ejecución */}
          {detail?.concept?.execution && (
            <Section title="Ejecución">
              <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {detail.concept.execution}
              </div>
            </Section>
          )}

          {/* Refs */}
          <div style={{ marginBottom: 22 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, marginBottom: 10, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: DS.textMuted, fontWeight: 700,
                }}>
                  Referencias ({totalVarsCount})
                </div>
                {puedeOperar && !refSelectMode && (
                  <button
                    onClick={() => setAddVarOpen(true)}
                    style={{
                      padding: "5px 12px", borderRadius: 50, border: "none",
                      background: DS.green, color: "#fff", fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: DS.font,
                    }}
                  >+ Agregar referencia</button>
                )}
                {puedeOperar && totalVarsCount > 0 && (
                  <button
                    onClick={() => { if (refSelectMode) exitRefSelect(); else setRefSelectMode(true); }}
                    style={{
                      padding: "5px 12px", borderRadius: 50,
                      border: refSelectMode ? `1px solid ${DS.amber}` : DS.border,
                      background: refSelectMode ? `${DS.amber}18` : "transparent",
                      color: refSelectMode ? DS.amber : DS.textSecondary,
                      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                    }}
                  >{refSelectMode ? `Seleccionando (${selectedRefIds.size})` : "Seleccionar"}</button>
                )}
                {canDelete && incompleteCount > 0 && (
                  <button
                    onClick={selectIncomplete}
                    title="Selecciona las referencias no analizadas (sin portada o sin transcripción) para devolverlas a la Bandeja"
                    style={{ padding: "5px 12px", borderRadius: 50, border: `1px solid ${DS.amber}66`, background: `${DS.amber}14`, color: DS.amber, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}
                  >⚠ Seleccionar incompletas ({incompleteCount})</button>
                )}
                {canDelete && noDriveCount > 0 && (
                  <button
                    onClick={selectNoDrive}
                    title="Selecciona las referencias sin respaldo en Drive (para respaldarlas)"
                    style={{ padding: "5px 12px", borderRadius: 50, border: `1px solid ${DS.blue}66`, background: `${DS.blue}14`, color: DS.blue, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}
                  >☁ Sin Drive ({noDriveCount})</button>
                )}
                {canDelete && noNotesCount > 0 && (
                  <button
                    onClick={selectNoNotes}
                    title="Selecciona las referencias sin notas ('cómo está hecho') para regenerarlas con ✨ Analizar con IA"
                    style={{ padding: "5px 12px", borderRadius: 50, border: `1px solid ${DS.purple}66`, background: `${DS.purple}14`, color: DS.purple, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}
                  >📝 Sin notas ({noNotesCount})</button>
                )}
              </div>
              {/* Toolbar zoom */}
              {totalVarsCount > 0 && (
                <div style={{
                  display: "inline-flex", gap: 2, padding: 3,
                  background: "rgba(0,0,0,0.30)", borderRadius: 50,
                  border: `1px solid ${DS.textHint}`,
                }}>
                  {ZOOM_LEVELS.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => setZoomLevel(l.key)}
                      title={`Zoom ${l.label}`}
                      style={{
                        padding: "5px 12px", borderRadius: 50, border: "none",
                        background: zoomLevel === l.key ? DS.bgCard : "transparent",
                        color: zoomLevel === l.key ? DS.textPrimary : DS.textMuted,
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                        fontFamily: DS.font, letterSpacing: "0.04em",
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {loading && <div style={{ color: DS.textMuted, fontSize: 12 }}>Cargando…</div>}
            {!loading && totalVarsCount === 0 && (
              <div style={{ color: DS.textMuted, fontSize: 12 }}>
                Este concepto no tiene referencias cargadas.
              </div>
            )}
            {!loading && totalVarsCount > 0 && (
              <>
                {(queueCount > 0 || analyzeMsg || backupMsg) && (
                  <div style={{ marginBottom: 10 }}>
                    {backupMsg ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: DS.blue, padding: "5px 12px", borderRadius: 50, background: `${DS.blue}22`, border: `1px solid ${DS.blue}66` }}>☁ {backupMsg}</span>
                    ) : queueCount > 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: DS.purple, padding: "5px 12px", borderRadius: 50, background: `${DS.purple}22`, border: `1px solid ${DS.purple}66` }}>
                        ⏳ {queueCount} en cola · analizando en segundo plano
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: DS.green }}>{analyzeMsg}</span>
                    )}
                  </div>
                )}
                <ReferenceFilterBar
                  variations={detail.variations}
                  groupBy={groupBy} onGroupBy={setGroupBy}
                  filters={filters} onFilters={setFilters}
                  mode={hlMode} onMode={setHlMode}
                  showLabels={showLabels} onShowLabels={setShowLabels}
                />
                {renderRefGrid({
                  variations: detail.variations,
                  groupBy, filters, hlMode, zoomMinPx, zoomLevel,
                  renderCard: (v) => {
                    const filtersActive = hasActiveFilters(filters);
                    const matches = !filtersActive || variationMatches(v, filters);
                    return (
                      <VariationCard
                        key={v.id}
                        v={v}
                        zoomLevel={zoomLevel}
                        deleting={deletingId === v.id}
                        analyzing={analyzingIds.has(v.id)}
                        progress={progressById[v.id]}
                        isOwn={v.origin_company_id === item.company_id}
                        selectMode={refSelectMode}
                        selected={selectedRefIds.has(v.id)}
                        showLabels={showLabels}
                        dimmed={hlMode === "resaltar" && filtersActive && !matches}
                        highlighted={filtersActive && matches}
                        onToggleSelect={() => toggleRef(v.id)}
                        onOpen={() => setDetailTarget(v)}
                        onMove={canDelete ? () => setMoveTarget(v) : undefined}
                        onDelete={canDelete ? () => handleDelete(v) : undefined}
                      />
                    );
                  },
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Barra de acciones en lote sobre referencias seleccionadas */}
      {refSelectMode && selectedRefIds.size > 0 && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 10000, display: "flex", gap: 8, alignItems: "center",
          padding: "10px 14px", borderRadius: 50,
          background: "rgba(20,20,28,0.97)", backdropFilter: "blur(12px)",
          border: `1px solid ${DS.textHint}`, boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
          fontFamily: DS.font,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary, padding: "4px 10px" }}>
            {selectedRefIds.size} seleccionada{selectedRefIds.size === 1 ? "" : "s"}
          </span>
          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
          {canDelete && <BulkBtn onClick={analyzeSelectedRefs} color={DS.purple}>✨ Analizar con IA</BulkBtn>}
          {canDelete && <BulkBtn onClick={handleBackupToDrive} color={DS.blue} disabled={backupBusy}>{backupBusy ? (backupMsg || "Respaldando…") : "☁ Respaldar a Drive"}</BulkBtn>}
          <BulkBtn onClick={() => setBulkTagOpen(true)} color="#7BB6E6">🏷 Etiquetar</BulkBtn>
          <BulkBtn onClick={() => setBulkMoveOpen(true)} color={DS.green} disabled={!canDelete}>↗ Mover</BulkBtn>
          {canDelete && <BulkBtn onClick={handleReturnToInbox} color={DS.amber} disabled={bulkBusy}>↩ Devolver a bandeja</BulkBtn>}
          <BulkBtn onClick={handleBulkDelete} color={DS.red} disabled={bulkBusy}>🗑 Eliminar</BulkBtn>
          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
          <BulkBtn onClick={exitRefSelect} ghost>Cancelar</BulkBtn>
        </div>
      )}

      {moveTarget && (
        <MoveVariationModal
          variation={moveTarget}
          sourceConceptItem={item}
          onClose={() => setMoveTarget(null)}
          onDone={() => {
            setMoveTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {bulkMoveOpen && (
        <MoveVariationModal
          variationIds={[...selectedRefIds]}
          sourceConceptItem={item}
          onClose={() => setBulkMoveOpen(false)}
          onDone={() => { setBulkMoveOpen(false); afterBulk(); }}
        />
      )}

      {bulkTagOpen && (
        <BulkTagRefsModal
          variations={(detail?.variations || []).filter((v) => selectedRefIds.has(v.id))}
          suggestions={suggestionsByCategory(detail?.variations || [])}
          onClose={() => setBulkTagOpen(false)}
          onDone={() => { setBulkTagOpen(false); afterBulk(); }}
        />
      )}

      {detailTarget && (
        <BankVariationDetailModal
          variation={detailTarget}
          conceptName={conceptName}
          canEdit={canDelete}
          isOwnRef={detailTarget.origin_company_id === item.company_id}
          suggestions={suggestionsByCategory(detail?.variations || [])}
          onClose={() => setDetailTarget(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      {editOpen && (
        <ConceptEditModal
          item={editItem}
          existingTags={allTags}
          variations={detail?.variations || []}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setReloadKey((k) => k + 1); onConceptChanged?.(); }}
          onDeleted={() => { onConceptChanged?.(); onClose?.(); }}
        />
      )}

      {addVarOpen && (
        <AddVariationModal
          conceptId={item.id}
          conceptName={conceptName}
          isBankRef={item.is_bank_ref || item.company_id === "bank_refs"}
          companyName={item.company_name}
          onClose={() => setAddVarOpen(false)}
          onCreated={() => { setReloadKey((k) => k + 1); onConceptChanged?.(); }}
        />
      )}
    </div>
  );
}

// Renderiza el grid de referencias aplicando modo filtrar (oculta las que no
// matchean) y agrupación por etiqueta (secciones con header de color).
function renderRefGrid({ variations, groupBy, filters, hlMode, zoomMinPx, zoomLevel, renderCard }) {
  const filtersActive = hasActiveFilters(filters);
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${zoomMinPx}px, 1fr))`,
    gap: zoomLevel >= 3 ? 8 : 12,
  };
  const base = (hlMode === "filtrar" && filtersActive)
    ? variations.filter((v) => variationMatches(v, filters))
    : variations;

  if (!groupBy) {
    return <div style={gridStyle}>{base.map(renderCard)}</div>;
  }

  const groups = groupVariations(base, groupBy);
  const realGroups = groups.filter((g) => g.value !== NO_LABEL);
  // Si nada tiene etiqueta en esta categoría, grid plano sin headers (limpio).
  if (realGroups.length === 0) {
    return <div style={gridStyle}>{base.map(renderCard)}</div>;
  }
  const cat = CATEGORY_BY_KEY[groupBy];
  const color = cat?.color || DS.textMuted;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((g) => {
        const isNone = g.value === NO_LABEL;
        const c = isNone ? DS.textMuted : color;
        return (
          <div key={g.value}>
            {/* Header sutil */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: c, letterSpacing: "0.02em" }}>{g.label}</span>
              <span style={{ fontSize: 10, color: DS.textMuted }}>· {g.items.length}</span>
            </div>
            <div style={gridStyle}>{g.items.map(renderCard)}</div>
          </div>
        );
      })}
    </div>
  );
}

function BulkBtn({ children, onClick, color, ghost, disabled }) {
  const bg = ghost ? "transparent" : disabled ? "rgba(255,255,255,0.06)" : `${color || DS.green}22`;
  const fg = ghost ? DS.textSecondary : disabled ? DS.textMuted : (color || DS.green);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px", borderRadius: 50,
        border: ghost ? "1px solid rgba(255,255,255,0.12)" : "none",
        background: bg, color: fg,
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: DS.font, letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}

// Sección colapsable (toggle) — para Descripción/Ejecución: click en el título
// abre/cierra. Default cerrado para no ocupar la pantalla con textazos.
function Section({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${DS.textHint}`, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: DS.font }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.textSecondary, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 12, color: DS.textMuted }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div style={{ padding: "0 14px 14px" }}>{children}</div>}
    </div>
  );
}

function VariationCard({ v, zoomLevel, deleting, analyzing, progress, isOwn, selectMode, selected, showLabels, dimmed, highlighted, onToggleSelect, onOpen, onMove, onDelete }) {
  const compact = zoomLevel >= 3; // Mini/Chico → menos padding, badge sin texto
  const padPx = compact ? 6 : 10;
  const hasMeta = !!v.meta_ads_library_url;
  const hasDrive = !!v.drive_url;
  // En modo selección NO ponemos handler en la imagen: dejamos que el clic
  // burbujee al div exterior (que hace el toggle una sola vez). Si ponemos
  // onToggleSelect también acá, se togglea 2 veces y queda como sin efecto.
  const handleImageClick = selectMode ? undefined : onOpen;
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      style={{
        borderRadius: 10,
        border: selected
          ? `2px solid ${DS.green}`
          : highlighted ? `2px solid ${DS.amber}` : DS.border,
        background: "rgba(0,0,0,0.25)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        position: "relative",
        opacity: deleting ? 0.5 : dimmed ? 0.28 : 1,
        boxShadow: highlighted ? `0 0 0 3px ${DS.amber}33` : "none",
        transition: "opacity 0.15s, box-shadow 0.15s",
        cursor: selectMode ? "pointer" : "default",
      }}>
      <div
        onClick={handleImageClick}
        title={selectMode ? "Seleccionar" : "Ver detalle"}
        style={{
          width: "100%", aspectRatio: "1",
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          cursor: handleImageClick ? "pointer" : "default",
        }}>
        {v.file_url ? (
          <img src={v.file_url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: DS.textMuted, fontSize: 11 }}>sin imagen</span>
        )}
        {/* Badge cross-empresa overlaid sobre la imagen para no consumir espacio del footer */}
        {!isOwn && v.origin_company_name && (
          <span
            title={`Esta referencia es de la empresa ${v.origin_company_name}`}
            style={{
              position: "absolute", top: 6, left: 6,
              fontSize: 9, fontWeight: 700, color: "#fff",
              padding: "2px 7px", borderRadius: 50,
              background: "rgba(59,139,212,0.85)",
              backdropFilter: "blur(6px)",
              letterSpacing: "0.04em",
            }}
          >
            🏷 {v.origin_company_name}
          </span>
        )}
        {selectMode && (
          <span style={{
            position: "absolute", top: 8, right: 8,
            width: 24, height: 24, borderRadius: "50%",
            border: selected ? `2px solid ${DS.green}` : "2px solid rgba(255,255,255,0.5)",
            background: selected ? DS.green : "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 800,
          }}>{selected ? "✓" : ""}</span>
        )}
        {analyzing && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.62)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 3, padding: 8, textAlign: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>✨ IA</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.85)" }}>{progress || "Analizando…"}</span>
          </div>
        )}
      </div>
      <div style={{ padding: padPx }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: compact ? 0 : 4,
        }}>
          <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: DS.textPrimary }}>
            {v.label || "—"}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <LinkBadges hasMeta={hasMeta} hasDrive={hasDrive} size="sm" />
          </span>
        </div>
        {!compact && v.name && (
          <div style={{
            fontSize: 11, color: DS.textSecondary, lineHeight: 1.35,
            marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {v.name}
          </div>
        )}
        {showLabels && (
          <div style={{ marginTop: compact ? 2 : 4 }}>
            <LabelChips v={v} compact={compact} max={compact ? 3 : 6} />
          </div>
        )}
        <div style={{ display: selectMode ? "none" : "flex", alignItems: "center", gap: 6, marginTop: compact ? 2 : 4, flexWrap: "wrap" }}>
          {v.meta_ads_library_url && !compact && (
            <a
              href={v.meta_ads_library_url}
              target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 10, color: DS.blue, textDecoration: "none" }}
            >
              Meta ↗
            </a>
          )}
          {(onMove || onDelete) && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {onMove && !compact && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMove(); }}
                  style={{
                    padding: "3px 8px", borderRadius: 50,
                    border: DS.border, background: "transparent",
                    color: DS.textSecondary, fontSize: 9, fontWeight: 700,
                    cursor: "pointer", fontFamily: DS.font,
                    letterSpacing: "0.04em",
                  }}
                  title="Mover a otro concepto"
                >MOVER</button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  disabled={deleting}
                  title="Eliminar referencia"
                  style={{
                    padding: "3px 8px", borderRadius: 50,
                    border: `1px solid ${DS.red}55`, background: "transparent",
                    color: DS.red, fontSize: 10, fontWeight: 700,
                    cursor: deleting ? "default" : "pointer", fontFamily: DS.font,
                    letterSpacing: "0.04em",
                  }}
                >🗑</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
