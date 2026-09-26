import { useEffect, useMemo, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { ConceptBankCard } from "./ConceptBankCard.jsx";
import { ConceptBankBoardView } from "./ConceptBankBoardView.jsx";
import { ConceptDetailDrawer } from "./ConceptDetailDrawer.jsx";
import { ImportToCompanyModal } from "./ImportToCompanyModal.jsx";
import { ExcludeConfirmModal } from "./ExcludeConfirmModal.jsx";
import { MergeConceptsModal } from "./MergeConceptsModal.jsx";
import { AddConceptModal } from "./AddConceptModal.jsx";
import { useRefAnalysisQueue } from "./useRefAnalysisQueue.js";
import { listBankConcepts, listBankVariations, listBankNicheLabels, excludeConceptsFromBank, deleteConceptCompletely, completeBankRefs, reclassifyBankLabelsBulk, translateBankTranscriptsBulk, repairBankMediaBulk, repairBankCoversFromVideo, repairAllBankCovers, connectCoversAcrossBoards, BANK_REFS_COMPANY_ID, BANK_REFS_COMPANY_NAME } from "./db.js";
import { canManageBank, canOperateBank } from "../lib/permissions.js";
import { backupAllMissingDrive } from "../inbox/inboxDb.js";
import { LabelManagerModal } from "./LabelManagerModal.jsx";
import { ConfirmarAccion } from "../../lib/ConfirmarAccion.jsx";
import { mapaEtiquetasPorConcepto, opcionesPorCategoria, conceptoPasaEtiquetas, textoBuscable, CATS_FILTRO } from "./bankFilters.js";
import { LABEL_CATEGORIES } from "../../despliegue/labels.js";
import { EtiquetasMultiSelect } from "./EtiquetasMultiSelect.jsx";
import { toast } from "../../lib/toast.js";
import { logger } from "../../lib/logger.js";

// IMPORTANTE: usar hex puros — el patrón `${color}22` no funciona con rgba.
// El chip "Todos" antes usaba DS.textMuted que en dark es rgba(...) y rompía
// el background al activarse (quedaba blanco semitransparente).
const STAGES = [
  { key: "all",  label: "Todos",  color: "#6B7280" },
  { key: "tofu", label: "TOFU",   color: DS.blue },
  { key: "mofu", label: "MOFU",   color: DS.amber },
  { key: "bofu", label: "BOFU",   color: DS.green },
];

const FORMATS = [
  { key: "all",    label: "Todos" },
  { key: "static", label: "Estático" },
  { key: "video",  label: "Video" },
];

// Top-level: separa el Banco de creativos (ads) del Banco de contenido (orgánico).
// Reusa el pipeline_type de los boards que ya trae listBankConcepts.
const BOARD_KINDS = [
  { key: "ads",     label: "Banco de creativos", title: "Banco de creativos",  subtitle: "Conceptos TOFU/MOFU/BOFU de todas las empresas" },
  { key: "organic", label: "Banco de contenido", title: "Banco de contenido", subtitle: "Referencias de contenido orgánico de todas las empresas" },
];

const VIEWS = [
  { key: "grid",  label: "Grid" },
  { key: "board", label: "Tablero" },
];

export function ConceptBankPage({ currentMember = null }) {
  // Seleccionar y analizar en lote es trabajo del equipo; crear, esconder o
  // borrar conceptos es estructura del banco y se queda en admin.
  const puedeOperar = canOperateBank(currentMember);
  const canManage = canManageBank(currentMember);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Board de nivel superior: creativos (ads) vs contenido (organic)
  const [boardKind, setBoardKind] = useState("ads");

  // Vista
  const [view, setView] = useState("grid");

  // Filtros
  const [stageFilter, setStageFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  // Nicho / Tag ahora es MULTI-selección. [] = todos. Se puede marcar calzado
  // Y ropa a la vez, por ejemplo.
  // De "solo nicho" a las cinco categorías: { marca: [], nicho: [], ... }.
  const [labelFilters, setLabelFilters] = useState({});
  const [sortDir, setSortDir] = useState("desc"); // desc = más reciente primero
  const [search, setSearch] = useState("");

  // Selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modales
  const [detailOpen, setDetailOpen] = useState(null);
  const [importOpen, setImportOpen] = useState(null);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [addConceptOpen, setAddConceptOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBankConcepts();
      setItems(data);
    } catch (e) {
      logger.error("[ConceptBank] load failed", e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  // Recarga silenciosa (sin loader full-screen) — para refrescar durante la cola.
  const refreshItems = async () => { try { setItems(await listBankConcepts()); } catch { /* noop */ } };

  // Cola de análisis con IA (compartida). Analiza TODAS las referencias de los
  // conceptos seleccionados, omitiendo las que ya tienen guion (ahorra tokens).
  const { enqueue, queueCount, analyzeMsg, setAnalyzeMsg } = useRefAnalysisQueue({ onAfterEach: refreshItems });
  const analyzeSelectedConcepts = async () => {
    const conceptIds = new Set(selectedIds);
    setAnalyzeMsg("Buscando referencias…");
    let all = [];
    try { all = await listBankVariations(boardKind); }
    catch (e) { setError(e?.message || String(e)); setAnalyzeMsg(null); return; }
    const inSel = all.filter((v) => conceptIds.has(v.concept_id));
    const pending = inSel.filter((v) => !(v.transcript && v.transcript.trim()));
    const skipped = inSel.length - pending.length;
    exitSelectionMode();
    if (!pending.length) { setAnalyzeMsg(`Nada para analizar (${skipped} ya tenían guion).`); return; }
    setAnalyzeMsg(`Encolando ${pending.length}${skipped ? ` · ${skipped} ya analizadas omitidas` : ""}…`);
    enqueue(pending);
  };

  // 🔖 Re-clasifica SOLO las etiquetas (barato): re-etiqueta las referencias de
  // los conceptos seleccionados usando la transcripción guardada, sin re-analizar
  // ni re-bajar el video. Junta todas las variaciones de cada concepto y las pasa
  // a reclassifyBankLabelsBulk.
  const [retagBusy, setRetagBusy] = useState(false);
  const reclassifyLabelsOfSelectedConcepts = async () => {
    const conceptIds = new Set(selectedIds);
    setRetagBusy(true);
    setAnalyzeMsg("Buscando referencias…");
    let all = [];
    try { all = await listBankVariations(boardKind); }
    catch (e) { setError(e?.message || String(e)); setAnalyzeMsg(null); setRetagBusy(false); return; }
    const targets = all.filter((v) => conceptIds.has(v.concept_id));
    exitSelectionMode();
    if (!targets.length) { setAnalyzeMsg("No hay referencias en los conceptos seleccionados."); setRetagBusy(false); return; }
    setAnalyzeMsg(`Reorganizando etiquetas de ${targets.length}… (sin re-analizar el video)`);
    try {
      const { updated, skipped, failed, sampleReason } = await reclassifyBankLabelsBulk(targets, {
        onProgress: (m) => setAnalyzeMsg(m),
      });
      setAnalyzeMsg(`✓ ${updated} re-etiquetada(s).` + (skipped ? ` · ${skipped} sin transcripción` : "") + (failed ? ` · ⚠ ${failed} con error` : "") + (sampleReason && (skipped || failed) ? ` · motivo: ${sampleReason}` : ""));
      await reload();
    } catch (e) {
      setAnalyzeMsg(null);
      setError(`Reorganizar etiquetas falló: ${e?.message || e}`);
    } finally {
      setRetagBusy(false);
    }
  };

  // 🇪🇸 Traduce a español los guiones (transcript) de las referencias de los
  // conceptos seleccionados que estén en otro idioma. Barato: no re-baja ni
  // re-transcribe el video, solo traduce el texto guardado. Sigue el mismo patrón
  // que reclassifyLabelsOfSelectedConcepts.
  const [translateBusy, setTranslateBusy] = useState(false);
  const translateTranscriptsOfSelected = async () => {
    const conceptIds = new Set(selectedIds);
    setTranslateBusy(true);
    setAnalyzeMsg("Buscando referencias…");
    let all = [];
    try { all = await listBankVariations(boardKind); }
    catch (e) { setError(e?.message || String(e)); setAnalyzeMsg(null); setTranslateBusy(false); return; }
    const targets = all.filter((v) => conceptIds.has(v.concept_id) && v.transcript && v.transcript.trim());
    exitSelectionMode();
    if (!targets.length) { setAnalyzeMsg("No hay guiones para traducir en los conceptos seleccionados."); setTranslateBusy(false); return; }
    setAnalyzeMsg(`Traduciendo ${targets.length} guion(es) a español…`);
    try {
      const { translated, unchanged, skipped, failed } = await translateBankTranscriptsBulk(targets, {
        onProgress: (m) => setAnalyzeMsg(m),
      });
      setAnalyzeMsg(`🇪🇸 ${translated} traducido(s).` + (unchanged ? ` · ${unchanged} ya en español` : "") + (skipped ? ` · ${skipped} sin guion` : "") + (failed ? ` · ⚠ ${failed} con error` : ""));
      await reload();
    } catch (e) {
      setAnalyzeMsg(null);
      setError(`Traducir guiones falló: ${e?.message || e}`);
    } finally {
      setTranslateBusy(false);
    }
  };

  // 🔧 Repara portadas/videos ROTOS de las referencias de los conceptos
  // seleccionados: re-busca el anuncio en Meta (Apify por marca) y arregla la
  // portada expirada (fbcdn → Storage) y/o el video faltante. Mejor esfuerzo:
  // solo se recuperan anuncios que sigan publicados en Meta.
  const [repairBusy, setRepairBusy] = useState(false);
  const repairMediaOfSelected = async () => {
    const conceptIds = new Set(selectedIds);
    setRepairBusy(true);
    setAnalyzeMsg("Buscando referencias…");
    let all = [];
    try { all = await listBankVariations(boardKind); }
    catch (e) { setError(e?.message || String(e)); setAnalyzeMsg(null); setRepairBusy(false); return; }
    const targets = all.filter((v) => conceptIds.has(v.concept_id));
    exitSelectionMode();
    if (!targets.length) { setAnalyzeMsg("No hay referencias en los conceptos seleccionados."); setRepairBusy(false); return; }
    setAnalyzeMsg(`Reparando portadas/videos de ${targets.length}…`);
    try {
      // PASO 1 (confiable, sin Meta): regenerar portadas rotas desde el VIDEO de
      // respaldo en Storage. Recupera la mayoría sin depender de que el anuncio
      // siga vivo ni de que el scrape por marca lo encuentre.
      const fromVideo = await repairBankCoversFromVideo(targets, {
        onProgress: (m) => setAnalyzeMsg(m),
      });
      // PASO 2 (mejor esfuerzo, vía Meta): lo que quedó roto y NO tenía video en
      // Storage (portadas sin respaldo, o videos faltantes) → re-scrape por marca.
      const viaMeta = await repairBankMediaBulk(targets, {
        onProgress: (m) => setAnalyzeMsg(m),
      });
      const coversFixed = fromVideo.coversFixed + viaMeta.coversFixed;
      const videosFixed = viaMeta.videosFixed;
      const failed = viaMeta.failed; // los fallos del paso 1 se reintentan en el paso 2
      const notLive = viaMeta.notLive;
      setAnalyzeMsg(`🔧 ${coversFixed} portada(s) y ${videosFixed} video(s) reparados.` + (fromVideo.coversFixed ? ` · ${fromVideo.coversFixed} desde el video de respaldo` : "") + (notLive ? ` · ${notLive} no se hallaron en Meta` : "") + (failed ? ` · ⚠ ${failed} con error` : ""));
      await reload();
    } catch (e) {
      setAnalyzeMsg(null);
      setError(`Reparar portadas/videos falló: ${e?.message || e}`);
    } finally {
      setRepairBusy(false);
    }
  };

  // ☁ Respaldar a Drive TODAS las referencias del banco que no tienen link de Drive
  // (de todos los conceptos). Agrupa por marca → una corrida de Apify por marca.
  const [driveBusy, setDriveBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [labelMgrOpen, setLabelMgrOpen] = useState(false);
  // Las acciones masivas se confirman DENTRO del portal. Con `confirm()` la caja
  // era del sistema operativo y, peor, congelaba la pestaña entera hasta que
  // alguien la cerrara a mano — con procesos de minutos sobre miles de
  // referentes, eso deja el portal muerto sin explicación.
  const [accion, setAccion] = useState(null);
  // ✅ Completa guion (Whisper) + notas (Claude mínimo) de todo el banco, solo lo que falta.
  const handleCompleteRefs = () => setAccion({
    titulo: "Completar guiones y notas de todo el banco",
    detalle: "Transcribe los videos que no tienen guion y le genera notas a los referentes que no tienen. Solo toca lo que falta: no vuelve a analizar lo que ya está.",
    ok: "Completar",
    onOk: correrCompleteRefs,
  });
  const correrCompleteRefs = async () => {
    setCompleteBusy(true); setError(null); setAnalyzeMsg("Completando…");
    try {
      const r = await completeBankRefs({ pipelineType: boardKind, onProgress: (m) => setAnalyzeMsg(`✅ ${m}`) });
      await reload();
      setAnalyzeMsg(null);
      toast(`${r.transcribed} guion(es) transcritos · ${r.notesAdded} notas generadas` +
        (r.noAudio ? ` · ${r.noAudio} sin diálogo` : "") + (r.tFailed || r.nFailed ? ` · ${(r.tFailed || 0) + (r.nFailed || 0)} con error` : ""), "success");
    } catch (e) { setAnalyzeMsg(null); setError(`Completar falló: ${e?.message || e}`); }
    finally { setCompleteBusy(false); }
  };
  // 🖼️ Recupera las portadas rotas de TODO el banco principal sacando un fotograma
  // del video de respaldo. No toca Meta ni Apify: no cuesta plata y no depende de
  // que el anuncio siga publicado. Lo que no tiene video queda para el drag & drop.
  const [coversBusy, setCoversBusy] = useState(false);
  const handleRepairCovers = () => setAccion({
    titulo: "Recuperar las portadas rotas del banco",
    detalle: "Le saca un fotograma al video de respaldo de cada referente que perdió la portada. No usa Meta ni consume crédito de Apify, y podés seguir trabajando mientras corre.",
    ok: "Recuperar",
    onOk: correrRepairCovers,
  });
  const correrRepairCovers = async () => {
    setCoversBusy(true); setError(null); setAnalyzeMsg("Recuperando portadas…");
    try {
      const r = await repairAllBankCovers({ pipelineType: boardKind, onProgress: (m) => setAnalyzeMsg(`🖼️ ${m}`) });
      await reload();
      setAnalyzeMsg(null);
      toast(`${r.coversFixed} de ${r.total} portadas recuperadas` +
        (r.failed ? ` · ${r.failed} con error` : "") +
        (r.manual ? ` · ${r.manual} sin video de respaldo, hay que arrastrarles la imagen a mano` : ""), "success");
    } catch (e) { setAnalyzeMsg(null); setError(`Recuperar portadas falló: ${e?.message || e}`); }
    finally { setCoversBusy(false); }
  };

  // 🔗 Conecta las portadas del banco con las copias que tienen los clientes. Sin
  // esto, una portada arreglada acá no se veía en el portal del cliente hasta
  // reimportar el concepto a mano.
  const [connectBusy, setConnectBusy] = useState(false);
  const handleConnectCovers = () => setAccion({
    titulo: "Conectar las portadas con las copias de los clientes",
    detalle: "Rellena las que están sin portada usando la del mismo anuncio en otro tablero. Nunca pisa una portada que ya funciona.",
    ok: "Conectar",
    onOk: correrConnectCovers,
  });
  const correrConnectCovers = async () => {
    setConnectBusy(true); setError(null); setAnalyzeMsg("Conectando portadas…");
    try {
      const r = await connectCoversAcrossBoards({ onProgress: (m) => setAnalyzeMsg(`🔗 ${m}`) });
      await reload();
      setAnalyzeMsg(null);
      toast(`${r.connected} de ${r.total} portadas conectadas`, "success");
    } catch (e) { setAnalyzeMsg(null); setError(`Conectar portadas falló: ${e?.message || e}`); }
    finally { setConnectBusy(false); }
  };

  const [labelVars, setLabelVars] = useState([]);   // variaciones (con bank_labels) para el filtro de nicho real
  const handleBackupAllDrive = () => setAccion({
    titulo: "Respaldar a Google Drive todo lo que falta",
    detalle: "Busca en Meta, por marca, el video de cada referencia que todavía no tiene respaldo en Drive.",
    aviso: "Puede tardar y consume crédito de Apify.",
    ok: "Respaldar",
    onOk: correrBackupAllDrive,
  });
  const correrBackupAllDrive = async () => {
    setDriveBusy(true); setError(null); setAnalyzeMsg("Respaldando a Drive…");
    try {
      const res = await backupAllMissingDrive(boardKind, (m) => setAnalyzeMsg(`☁ ${m}`));
      await reload();
      const diag = [];
      if (res.noAdId) diag.push(`${res.noAdId} sin link de Meta (subir a mano)`);
      if (res.notInMeta) diag.push(`${res.notInMeta} ya no están en Meta`);
      if (res.foundNoVideo) diag.push(`${res.foundNoVideo} sin video`);
      setAnalyzeMsg(null);
      toast(`${res.done} de ${res.total} respaldadas en Drive` + (res.failed ? ` · ${res.failed} con error` : "") +
        (diag.length ? ` · no se pudo: ${diag.join(", ")}` : ""), res.done ? "success" : "error");
      // El detalle del fallo va al log: en un toast no se lee y es lo que sirve
      // para diagnosticar por qué Apify no devolvió nada.
      if (res.failed && res.backupReason) logger.error("[banco] respaldo Drive:", res.backupReason);
      if (res.scrapedTotal === 0 && res.apifyReason) logger.error("[banco] Apify:", res.apifyReason);
    } catch (e) { setAnalyzeMsg(null); setError(`Respaldo falló: ${e?.message || e}`); }
    finally { setDriveBusy(false); }
  };

  useEffect(() => { reload(); }, []);
  // Carga SOLO {concept_id, bank_labels} del board activo → nichos reales del
  // filtro. Query liviana (sin transcript/notes) — era la causa #1 de la lentitud.
  useEffect(() => {
    let cancel = false;
    listBankNicheLabels(boardKind).then((vs) => { if (!cancel) setLabelVars(vs || []); }).catch(() => {});
    return () => { cancel = true; };
  }, [boardKind]);

  // Conceptos del board activo (ads | organic). Todos los filtros/opciones se
  // derivan de este subconjunto para que empresa/nicho/counts sean del board.
  const kindItems = useMemo(
    () => items.filter((it) => it.pipeline_type === boardKind),
    [items, boardKind]
  );

  const companyOptions = useMemo(() => {
    const map = new Map();
    for (const it of kindItems) {
      if (it.company_id && !map.has(it.company_id)) {
        map.set(it.company_id, { id: it.company_id, name: it.company_name });
      }
    }
    return [{ id: "all", name: "Todas" }, ...Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))];
  }, [kindItems]);

  // Concepto → sus etiquetas, subidas desde las referencias. Antes esto existía
  // solo para nicho, aunque la consulta ya traía las cinco categorías.
  const conceptLabels = useMemo(() => mapaEtiquetasPorConcepto(labelVars), [labelVars]);

  // Opciones por categoría, con en cuántos conceptos aparece cada valor. El nicho
  // suma los `bank_tags` del etiquetado viejo, que si no desaparecerían.
  const labelOptions = useMemo(() => {
    const ops = opcionesPorCategoria(conceptLabels);
    const tags = new Set();
    for (const it of kindItems) for (const t of it.bank_tags || []) if (t) tags.add(t);
    const yaEstan = new Set(ops.nicho.map((o) => o.valor.toLowerCase()));
    for (const t of tags) if (!yaEstan.has(t.toLowerCase())) ops.nicho.push({ valor: t, n: 0 });
    return ops;
  }, [conceptLabels, kindItems]);

  // Todos los tags usados en el board — para autocompletar en el modal de edición.
  const allTags = useMemo(() => {
    const set = new Set();
    for (const it of kindItems) for (const t of it.bank_tags || []) set.add(t);
    return Array.from(set).sort();
  }, [kindItems]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out = kindItems.filter((it) => {
      if (stageFilter !== "all" && it.stage !== stageFilter) return false;
      if (formatFilter !== "all" && it.format !== formatFilter) return false;
      if (companyFilter !== "all" && it.company_id !== companyFilter) return false;
      const sets = conceptLabels.get(it.id);
      if (!conceptoPasaEtiquetas(sets, labelFilters, { bankTags: it.bank_tags || [] })) return false;
      if (term && !textoBuscable(it, sets).includes(term)) return false;
      return true;
    });
    out.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return out;
  }, [kindItems, stageFilter, formatFilter, companyFilter, labelFilters, sortDir, search, conceptLabels]);

  const stageCounts = useMemo(() => {
    const counts = { all: kindItems.length, tofu: 0, mofu: 0, bofu: 0 };
    for (const it of kindItems) {
      if (counts[it.stage] != null) counts[it.stage]++;
    }
    return counts;
  }, [kindItems]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  const toggleSelection = (item) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleCardClick = (item) => {
    if (selectionMode) toggleSelection(item);
    else setDetailOpen(item);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleExcluded = (count) => {
    setExcludeOpen(false);
    exitSelectionMode();
    reload();
  };

  const handleMerged = () => {
    setMergeOpen(false);
    exitSelectionMode();
    reload();
  };

  // Ocultar un formato del banco (soft, reversible) desde el menú ⋮ de la card.
  const handleHideConcept = async (it) => {
    try {
      await excludeConceptsFromBank([it.id]);
      reload();
    } catch (e) {
      toast(`No se pudo ocultar: ${e?.message || e}`);
    }
  };

  // Eliminar definitivamente un formato (concepto + refs, también del despliegue).
  const handleDeleteConcept = (it) => setAccion({
    titulo: `¿Eliminar "${it.name || "este formato"}"?`,
    detalle: `Se borra el formato y todas sus referencias, también del despliegue de ${it.company_name}.`,
    aviso: "Esto no se puede deshacer.",
    ok: "Eliminar",
    peligro: true,
    onOk: () => borrarConcepto(it),
  });
  const borrarConcepto = async (it) => {
    try {
      const { count } = await deleteConceptCompletely(it.id);
      if (count === 0) {
        toast("No se borró nada (0 filas). Puede ser un tema de permisos en la base.");
        return;
      }
      reload();
    } catch (e) {
      toast(`No se pudo eliminar: ${e?.message || e}`);
    }
  };

  const activeKind = BOARD_KINDS.find((k) => k.key === boardKind) || BOARD_KINDS[0];

  return (
    <div style={{ paddingBottom: selectionMode && selectedIds.size > 0 ? 80 : 0 }}>
      <Topbar
        title={activeKind.title}
        subtitle={activeKind.subtitle}
        accent={DS.purple}
      />

      {/* Barra de controles sticky: board · vista · acción primaria · Opciones.
          Todo lo que antes eran 6 botones sueltos ahora vive en "Opciones"
          agrupado (Organizar / Enriquecer / Respaldos) — nada se perdió. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: DS.bg, paddingTop: 6, paddingBottom: 12, marginBottom: 12,
        borderBottom: DS.border,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        {/* Board: Creativos vs Contenido */}
        <div style={{ display: "inline-flex", padding: 4, borderRadius: 12, background: DS.bgCard, border: DS.border }}>
          {BOARD_KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => { setBoardKind(k.key); setCompanyFilter("all"); setLabelFilters({}); setStageFilter("all"); }}
              style={{
                padding: "7px 16px", borderRadius: 9, border: "none",
                background: boardKind === k.key ? DS.bgSide : "transparent",
                color: boardKind === k.key ? DS.textPrimary : DS.textSecondary,
                boxShadow: boardKind === k.key ? "var(--shadow)" : "none",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                letterSpacing: "-0.01em",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Vista: Grid vs Tablero */}
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 12, background: DS.bgCard, border: DS.border }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                padding: "6px 14px", borderRadius: 9, border: "none",
                background: view === v.key ? DS.bgSide : "transparent",
                color: view === v.key ? DS.textPrimary : DS.textSecondary,
                boxShadow: view === v.key ? "var(--shadow)" : "none",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                letterSpacing: "-0.01em",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        {/* Crear conceptos es estructura del banco: se queda en admin. Seleccionar
            y enriquecer es trabajo, y lo hace todo el equipo — el menú se arma según
            quién esté mirando en vez de esconderse entero. */}
        {canManage && !selectionMode && (
          <button
            onClick={() => setAddConceptOpen(true)}
            style={{
              padding: "9px 16px", borderRadius: 12, border: "none", background: DS.green, color: "#fff",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
            }}
          >
            + Agregar {boardKind === "organic" ? "contenido" : "concepto"}
          </button>
        )}

        {puedeOperar && !selectionMode && (
          <OptionsMenu groups={[
            { label: "Organizar", items: [
              ...(canManage ? [{ label: "Gestor de etiquetas", onClick: () => setLabelMgrOpen(true) }] : []),
              { label: "Seleccionar varios", onClick: () => setSelectionMode(true) },
            ] },
            { label: "Enriquecer", items: [
              { label: completeBusy ? "Completando guiones y notas…" : "Completar guiones y notas", onClick: handleCompleteRefs, disabled: completeBusy },
              { label: coversBusy ? "Recuperando portadas…" : "Recuperar portadas", onClick: handleRepairCovers, disabled: coversBusy },
              { label: connectBusy ? "Conectando portadas…" : "Conectar portadas con clientes", onClick: handleConnectCovers, disabled: connectBusy },
            ] },
            { label: "Respaldos", items: [
              { label: driveBusy ? "Respaldando en Drive…" : "Respaldar todo en Drive", onClick: handleBackupAllDrive, disabled: driveBusy },
            ] },
          ]} />
        )}

        {puedeOperar && selectionMode && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: DS.amber }}>
              ✓ Seleccionando · {selectedIds.size}
            </span>
            {filtered.length > 0 && (
              <button
                onClick={() => {
                  const allSel = filtered.every((it) => selectedIds.has(it.id));
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (allSel) { for (const it of filtered) next.delete(it.id); }
                    else { for (const it of filtered) next.add(it.id); }
                    return next;
                  });
                }}
                style={{
                  padding: "8px 14px", borderRadius: 12, border: DS.border,
                  background: "transparent", color: DS.textSecondary,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}
              >
                {filtered.every((it) => selectedIds.has(it.id)) ? "Quitar todos" : `Seleccionar todo (${filtered.length})`}
              </button>
            )}
            <button
              onClick={exitSelectionMode}
              style={{
                padding: "8px 14px", borderRadius: 12, border: DS.border,
                background: "transparent", color: DS.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}
            >
              Salir
            </button>
          </>
        )}
      </div>

      {/* Filtros — en vista Tablero ocultamos los chips de stage (el canvas
          ya muestra todos los stages como buckets) y mostramos solo los
          filtros que sí aplican: empresa, nicho, search. */}
      {view !== "refs" && (
      <div style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {view === "grid" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {STAGES.map((s) => (
              <Chip
                key={s.key}
                label={`${s.label}${s.key !== "all" ? ` · ${stageCounts[s.key]}` : ` · ${stageCounts.all}`}`}
                active={stageFilter === s.key}
                color={s.color}
                onClick={() => setStageFilter(s.key)}
              />
            ))}
            <span style={{ flex: 1 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar concepto, empresa, marca, etiqueta…"
              style={{
                padding: "8px 12px", borderRadius: 50,
                border: DS.border, background: "rgba(0,0,0,0.25)",
                color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
                outline: "none", minWidth: 240,
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {view === "grid" && (
            <Select label="Formato" value={formatFilter} onChange={setFormatFilter}
                    options={FORMATS.map((f) => ({ value: f.key, label: f.label }))} />
          )}
          <Select label="Empresa" value={companyFilter} onChange={setCompanyFilter}
                  options={companyOptions.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Orden" value={sortDir} onChange={setSortDir}
                  options={[{ value: "desc", label: "Más reciente" }, { value: "asc", label: "Más antiguo" }]} />
          <EtiquetasMultiSelect options={labelOptions} selected={labelFilters} onChange={setLabelFilters} />
          {view === "board" && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar concepto, empresa, marca, etiqueta…"
              style={{
                padding: "8px 12px", borderRadius: 50,
                border: DS.border, background: "rgba(0,0,0,0.25)",
                color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
                outline: "none", minWidth: 240,
              }}
            />
          )}
          <span style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: DS.textMuted }}>
            {filtered.length} de {kindItems.length} conceptos
          </div>
        </div>
      </div>
      )}

      {/* Indicador de la cola de análisis con IA */}
      {(queueCount > 0 || analyzeMsg) && (
        <div style={{ marginBottom: 14 }}>
          {queueCount > 0 ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: DS.purple, padding: "6px 14px", borderRadius: 50, background: withAlpha(DS.purple, "14"), border: `1px solid ${withAlpha(DS.purple, "44")}` }}>
              ⏳ {queueCount} en cola · analizando en segundo plano — podés seguir trabajando
            </span>
          ) : (
            <span style={{ fontSize: 11, color: DS.green }}>{analyzeMsg}</span>
          )}
        </div>
      )}

      {/* Contenido según vista */}
      {loading && view !== "refs" && (
        <div style={{ padding: 60, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
          Cargando banco…
        </div>
      )}
      {error && (
        <div style={{
          padding: 18, background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)",
          borderRadius: 10, color: DS.red, fontSize: 13,
        }}>
          {error}
          {error.includes("bank_hidden") && (
            <div style={{ marginTop: 8, fontSize: 12, color: DS.textSecondary }}>
              Falta correr la migración <code>db/concept_bank_hidden.sql</code> en Supabase.
            </div>
          )}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && view === "grid" && (
        <div style={{
          padding: 60, textAlign: "center",
          background: DS.bgCard, border: DS.borderDash, borderRadius: 14,
          color: DS.textMuted, fontSize: 13,
        }}>
          {kindItems.length === 0
            ? (boardKind === "organic"
                ? "Todavía no hay contenido orgánico en el banco. Cuando crees conceptos en un despliegue orgánico van a aparecer acá."
                : "Todavía no hay conceptos en el banco. Cuando crees conceptos en el despliegue de cualquier empresa van a aparecer acá.")
            : "Ningún concepto matchea los filtros activos."}
        </div>
      )}

      {!loading && !error && view === "grid" && filtered.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {filtered.map((it) => (
            <ConceptBankCard
              key={it.id}
              item={it}
              selectionMode={selectionMode}
              selected={selectedIds.has(it.id)}
              canManage={canManage}
              onClick={() => handleCardClick(it)}
              onImportClick={() => setImportOpen(it)}
              onHide={handleHideConcept}
              onDeleteForever={handleDeleteConcept}
            />
          ))}
        </div>
      )}

      {!loading && !error && view === "board" && (
        <ConceptBankBoardView
          items={filtered}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onCardClick={handleCardClick}
          onCardImport={(it) => setImportOpen(it)}
        />
      )}

      {/* Floating selection toolbar */}
      {selectionMode && selectedIds.size > 0 && (
        <SelectionToolbar
          count={selectedIds.size}
          onAnalyze={puedeOperar ? analyzeSelectedConcepts : null}
          onRetag={puedeOperar ? reclassifyLabelsOfSelectedConcepts : null}
          retagBusy={retagBusy}
          onTranslate={puedeOperar ? translateTranscriptsOfSelected : null}
          translateBusy={translateBusy}
          onRepair={puedeOperar ? repairMediaOfSelected : null}
          repairBusy={repairBusy}
          onImport={() => setBulkImportOpen(true)}
          onExclude={() => setExcludeOpen(true)}
          onMerge={() => setMergeOpen(true)}
          onCancel={exitSelectionMode}
        />
      )}

      {detailOpen && (
        <ConceptDetailDrawer
          item={detailOpen}
          currentMember={currentMember}
          allTags={allTags}
          onConceptChanged={reload}
          onClose={() => setDetailOpen(null)}
          onImport={() => { setImportOpen(detailOpen); setDetailOpen(null); }}
        />
      )}
      {importOpen && (
        <ImportToCompanyModal
          item={importOpen}
          initialLabelFilter={{ nicho: labelFilters.nicho || [] }}
          onClose={() => setImportOpen(null)}
          onImported={() => { setImportOpen(null); }}
        />
      )}
      {excludeOpen && (
        <ExcludeConfirmModal
          items={selectedItems}
          onClose={() => setExcludeOpen(false)}
          onDone={handleExcluded}
        />
      )}
      {mergeOpen && (
        <MergeConceptsModal
          items={selectedItems}
          onClose={() => setMergeOpen(false)}
          onDone={handleMerged}
        />
      )}
      {bulkImportOpen && (
        <ImportToCompanyModal
          items={selectedItems}
          initialLabelFilter={{ nicho: labelFilters.nicho || [] }}
          onClose={() => { setBulkImportOpen(false); exitSelectionMode(); }}
          onImported={() => {}}
        />
      )}
      {addConceptOpen && (
        <AddConceptModal
          pipelineType={boardKind}
          existingTags={allTags}
          onClose={() => setAddConceptOpen(false)}
          onCreated={(concept) => {
            reload();
            // Abrir el nuevo concepto para poder agregarle referencias enseguida.
            if (concept?.id) {
              setDetailOpen({
                ...concept,
                bank_tags: concept.bank_tags || [],
                pipeline_type: boardKind,
                company_id: BANK_REFS_COMPANY_ID,
                company_name: BANK_REFS_COMPANY_NAME,
                is_bank_ref: true,
                niche: null,
                variations_count: 0,
              });
            }
          }}
        />
      )}

      {labelMgrOpen && (
        <LabelManagerModal onClose={() => setLabelMgrOpen(false)} onChanged={reload} />
      )}

      <ConfirmarAccion accion={accion} onCancel={() => setAccion(null)} />
    </div>
  );
}

// Desplegable "Opciones" (CLAUDE.md §6/§7): agrupa las acciones que antes eran
// botones sueltos. Cierra al hacer click afuera (ignora [data-menu-root]).
function OptionsMenu({ groups }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!e.target.closest("[data-menu-root]")) setOpen(false); };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [open]);
  return (
    <div data-menu-root style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "9px 16px", borderRadius: 12,
          border: DS.border, background: DS.bgCard, color: DS.textSecondary,
          fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
        }}
      >
        Opciones
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5l6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          minWidth: 280, padding: 6, borderRadius: 14,
          background: DS.bgSide, border: DS.border, boxShadow: "var(--shadow-lg)",
        }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ marginBottom: gi < groups.length - 1 ? 4 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: DS.textHint, padding: "8px 10px 4px", letterSpacing: "0.02em" }}>{g.label}</div>
              {g.items.map((it, ii) => (
                <button
                  key={ii}
                  disabled={it.disabled}
                  onClick={() => { setOpen(false); it.onClick(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 10px", borderRadius: 8, border: "none",
                    background: "transparent", color: it.disabled ? DS.textMuted : DS.textSecondary,
                    fontSize: 12.5, fontWeight: 500, fontFamily: DS.font, letterSpacing: "-0.01em",
                    cursor: it.disabled ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectionToolbar({ count, onAnalyze, onRetag, retagBusy, onTranslate, translateBusy, onRepair, repairBusy, onImport, onExclude, onMerge, onCancel }) {
  return (
    <div style={{
      position: "fixed",
      bottom: 22, left: "50%", transform: "translateX(-50%)",
      zIndex: 9998,
      display: "flex", gap: 8, alignItems: "center",
      padding: "10px 14px", borderRadius: 50,
      background: "rgba(20,20,28,0.96)", backdropFilter: "blur(12px)",
      border: `1px solid ${DS.textHint}`,
      boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
      fontFamily: DS.font,
    }}>
      <span style={{
        fontSize: 12, fontWeight: 700, color: DS.textPrimary,
        padding: "4px 10px",
      }}>
        {count} seleccionado{count === 1 ? "" : "s"}
      </span>
      <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />

      {onAnalyze && (
        <ToolbarBtn onClick={onAnalyze} color={DS.purple} title="Analiza con IA las referencias de los conceptos seleccionados">
          ✨ Analizar con IA
        </ToolbarBtn>
      )}
      {onRetag && (
        <ToolbarBtn onClick={onRetag} disabled={retagBusy} color={DS.blue} title="Re-clasifica SOLO las etiquetas usando la transcripción guardada — barato, no re-analiza el video.">
          {retagBusy ? "🔖 Reorganizando…" : "🔖 Reorganizar etiquetas"}
        </ToolbarBtn>
      )}
      {onTranslate && (
        <ToolbarBtn onClick={onTranslate} disabled={translateBusy} color={DS.green} title="Traduce a español los guiones que estén en otro idioma. Barato — no re-baja ni re-transcribe el video.">
          {translateBusy ? "🇪🇸 Traduciendo…" : "🇪🇸 Traducir guiones a español"}
        </ToolbarBtn>
      )}
      {onRepair && (
        <ToolbarBtn onClick={onRepair} disabled={repairBusy} color={DS.amber} title="Re-busca el anuncio en Meta y repara portadas/videos rotos. Solo funciona si el anuncio sigue publicado en Meta.">
          {repairBusy ? "🔧 Reparando…" : "🔧 Reparar portadas/videos"}
        </ToolbarBtn>
      )}
      <ToolbarBtn onClick={onImport} color={DS.green}>
        ↓ Importar a empresa
      </ToolbarBtn>
      <ToolbarBtn onClick={onMerge} disabled={count < 2} color={DS.blue} title="Combinar requiere 2+ conceptos">
        🔗 Combinar
      </ToolbarBtn>
      <ToolbarBtn onClick={onExclude} color={DS.red}>
        🗑 Eliminar
      </ToolbarBtn>

      <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
      <ToolbarBtn onClick={onCancel} ghost>
        Cancelar
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({ children, onClick, color, ghost, disabled, title }) {
  const bg = ghost ? "transparent" : disabled ? "rgba(255,255,255,0.06)" : `${color || DS.green}22`;
  const fg = ghost ? DS.textSecondary : disabled ? DS.textMuted : (color || DS.green);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
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

function Chip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 50,
        border: active ? `1px solid ${color}` : DS.border,
        background: active ? withAlpha(color, "22") : "transparent",
        color: active ? color : DS.textSecondary,
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        cursor: "pointer", fontFamily: DS.font,
      }}
    >
      {label}
    </button>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.textMuted }}>
      <span style={{ letterSpacing: "0.04em" }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 10px", borderRadius: 8,
          border: DS.border, background: "rgba(0,0,0,0.25)",
          color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
          outline: "none", cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
