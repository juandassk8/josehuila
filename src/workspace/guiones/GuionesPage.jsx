import { useState } from "react";
import { DS, darkCard, darkBtnGhost } from "../../lib/design.js";
import { useFormats } from "./hooks/useFormats.js";
import { useScripts } from "./hooks/useScripts.js";
import { ScriptGenerator } from "./ScriptGenerator.jsx";
import { ScriptCard } from "./ScriptCard.jsx";
import { ConceptosLibrary } from "./ConceptosLibrary.jsx";
import { ProductInfoPanel } from "./ProductInfoPanel.jsx";
import { deleteScript, updateScript } from "./workspace_guiones_db.js";
import { updateSlot, createSlot } from "../../despliegue/pipeline_db.js";
import { getBoardByCompany } from "../../despliegue/db.js";
import { useCompanyId, useCurrentMemberId } from "./context.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";

// En workspace, los "content items" son slots del despliegue (despliegue_slots).
// setContentStatus mueve un slot entre status del pipeline (idea → scripting, etc).
async function setContentStatus(slotId, status) {
  try {
    const data = await updateSlot(slotId, { status });
    return { data, error: null };
  } catch (error) {
    logger.error("[setContentStatus] failed:", error);
    return { data: null, error };
  }
}
// Topbar inline (el del team module vive en ../layout y no se porta al workspace).
function Topbar({ title, subtitle, accent, children }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: DS.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: accent || DS.textPrimary, letterSpacing: "-0.01em" }}>{title}</h2>
          {subtitle && <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

const TABS = [
  { key: "ideas", label: "Ideas" },
  { key: "generate", label: "Guionizar" },
  { key: "formats", label: "Conceptos" },
  { key: "config", label: "Info del Producto" },
];

const STAGE_META = {
  tofu: { label: "TOFU", color: "#1DB97A" },
  mofu: { label: "MOFU", color: "#F5A623" },
  bofu: { label: "BOFU", color: "#E24B4A" },
};

export function GuionesPage({ contentItems, readOnly = false, onOpenDespliegue, pipelineType = "ads" }) {
  const { formats, reload: reloadFormats } = useFormats();
  const { scripts, reload: reloadScripts } = useScripts(pipelineType);
  const companyId = useCompanyId();
  const memberId = useCurrentMemberId();
  const [retitlingId, setRetitlingId] = useState(null);

  // Estado local de sub-tab (antes usaba usePathRoute del team module).
  const visibleTabs = readOnly
    ? TABS.filter((t) => t.key === "ideas" || t.key === "generate")
    : TABS;
  const validKeys = visibleTabs.map((t) => t.key);
  const defaultTab = readOnly ? "generate" : "ideas";
  const [tab, setTab] = useState(defaultTab);

  const [selectedScriptId, setSelectedScriptId] = useState(null);
  const [filter, setFilter] = useState("all");

  // Ideas from content pipeline (status = "idea"). Solo videos — los estáticos
  // no se guionizan. Historias tampoco (viven en su propio tab del team module).
  const ideas = (contentItems || []).filter((i) => i.status === "idea" && i.kind === "video");

  // State for scripting an idea
  const [scriptingIdea, setScriptingIdea] = useState(null);

  const selectedScript = scripts.find((s) => s.id === selectedScriptId) || null;

  const filteredScripts =
    filter === "all"
      ? scripts
      : scripts.filter((s) => s.status === filter);

  const handleDelete = async (id) => {
    if (selectedScriptId === id) setSelectedScriptId(null);
    await deleteScript(id);
    reloadScripts();
  };

  // Genera un nuevo título a partir del primer hook del guion. Útil para
  // guiones viejos que quedaron con "Comentario #2" / "B-Roll con voz IA #3"
  // y para los que nunca tuvieron un título descriptivo. Propaga también al
  // slot del despliegue si el guion está vinculado.
  const renameScriptFromHook = async (script) => {
    if (!script?.generated_content) return null;
    const res = await fetch("/api/title-from-hook", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({
        companyId,
        memberId,
        scriptId: script.id,
        content: script.generated_content,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }
    const { title } = await res.json();
    if (!title) return null;
    await updateScript(script.id, { title });
    if (script.content_item_id) {
      try { await updateSlot(script.content_item_id, { title }); }
      catch (e) { logger.error("[retitle] propagate slot title failed:", e?.message || e); }
    }
    return title;
  };

  const handleRetitle = async (script) => {
    if (!script?.generated_content) return;
    setRetitlingId(script.id);
    try {
      await renameScriptFromHook(script);
      reloadScripts();
    } catch (e) {
      logger.error("[retitle] threw:", e?.message || e);
    } finally {
      setRetitlingId(null);
    }
  };

  // Heurística: el título es "por defecto" si coincide con uno de los patrones
  // que el sistema asigna automáticamente:
  // - Slot del Despliegue:  `${concept_name} #${i+1}` (ej: "UGC #4")
  // - Fallback del Guionista: `Guion — ${formato}` o "Guion sin título"
  // - Idea cruda copiada del slot, que también matchea el patrón #N
  const DEFAULT_TITLE_RE = /^(?:[\p{L}\p{N}\s.\-/]+ #\d+|Guion(?:\s+sin\s+t[íi]tulo|\s+—\s+.+))$/iu;
  const isDefaultTitle = (s) => !s.title || DEFAULT_TITLE_RE.test(s.title);

  const [bulkRetitle, setBulkRetitle] = useState({ running: false, done: 0, total: 0 });
  const handleBulkRetitle = async () => {
    if (bulkRetitle.running) return;
    const candidates = scripts.filter((s) => s.generated_content && isDefaultTitle(s));
    if (candidates.length === 0) {
      // eslint-disable-next-line no-alert
      alert("No hay guiones con título por defecto para renombrar.");
      return;
    }
    // eslint-disable-next-line no-alert
    if (!confirm(`Voy a renombrar ${candidates.length} guion(es) a partir de su hook. Esto consume tokens del Guionista. ¿Continuar?`)) return;
    setBulkRetitle({ running: true, done: 0, total: candidates.length });
    let done = 0;
    for (const s of candidates) {
      try {
        await renameScriptFromHook(s);
      } catch (e) {
        logger.error("[bulkRetitle] script", s.id, "failed:", e?.message || e);
      }
      done += 1;
      setBulkRetitle({ running: true, done, total: candidates.length });
    }
    setBulkRetitle({ running: false, done: 0, total: 0 });
    reloadScripts();
  };

  // When a script is approved:
  // - Si vino desde "Guionizar esta idea" (scriptingIdea seteado): mover el slot
  //   existente a status="scripting" (era el flujo legacy).
  // - Si es free-form (+ Nuevo guion, sin content_item_id): crear un slot nuevo
  //   en status="scripting" y linkearlo al script. Una vez linkeado, futuras
  //   re-aprobaciones no duplican slots porque content_item_id queda seteado.
  const handleScriptUpdated = async () => {
    reloadScripts();
    const script = scripts.find((s) => s.id === selectedScriptId);
    if (!script || script.status !== "approved") return;

    if (scriptingIdea) {
      await setContentStatus(scriptingIdea.id, "scripting");
      setScriptingIdea(null);
      return;
    }

    if (!script.content_item_id && companyId) {
      try {
        const board = await getBoardByCompany(companyId, pipelineType);
        if (!board) {
          logger.warn("[handleScriptUpdated] No active board for company — script approved but no slot created. Setup a Despliegue board first.");
          return;
        }
        const newSlot = await createSlot({
          board_id: board.id,
          stage: "tofu",
          format: "video",
          status: "scripting",
          review_status: "approved",
          title: script.title,
        });
        if (newSlot?.id) {
          await updateScript(script.id, { content_item_id: newSlot.id });
          reloadScripts();
        }
      } catch (e) {
        logger.error("[handleScriptUpdated] failed to create scripting slot:", e?.message || e);
      }
    }
  };

  const startScriptingIdea = (idea) => {
    setScriptingIdea(idea);
    setSelectedScriptId(null);
    setTab("generate");
  };

  return (
    <div>
      <Topbar
        title="El Guionista"
        subtitle="Tu copiloto de guiones de contenido"
      />

      {/* Tab bar */}
      <div
        data-tour="info-producto"
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: DS.bgCard,
          borderRadius: 10,
          padding: 4,
          width: "fit-content",
          border: DS.border,
        }}
      >
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: tab === t.key ? DS.bg : "transparent",
              color: tab === t.key ? DS.textPrimary : DS.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: DS.font,
              transition: "all 0.15s",
              boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {t.key === "ideas" ? `Ideas (${ideas.length})` : t.label}
          </button>
        ))}
      </div>

      {/* IDEAS TAB */}
      {tab === "ideas" && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", marginBottom: 14 }}>
            IDEAS DE CONTENIDO ({ideas.length})
          </div>
          {ideas.length === 0 && (
            <div style={{ color: DS.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
              No hay ideas pendientes. Agrega ideas en la seccion de Contenido.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {ideas.map((idea) => {
              const stageMeta = idea.stage ? STAGE_META[idea.stage] : null;
              return (
              <div
                key={idea.id}
                style={{
                  background: DS.bgCard,
                  border: stageMeta ? `1px solid ${stageMeta.color}33` : DS.border,
                  borderRadius: 12,
                  padding: "14px 16px 16px",
                  cursor: readOnly ? "default" : "pointer",
                  transition: "border 0.15s, background 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  position: "relative",
                  overflow: "hidden",
                }}
                onClick={() => { if (!readOnly) startScriptingIdea(idea); }}
                onMouseEnter={(e) => { if (!readOnly) e.currentTarget.style.borderColor = stageMeta ? `${stageMeta.color}88` : DS.blue; }}
                onMouseLeave={(e) => { if (!readOnly) e.currentTarget.style.borderColor = stageMeta ? `${stageMeta.color}33` : DS.textHint; }}
              >
                {/* Stripe de stage arriba */}
                {stageMeta && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 3,
                    background: stageMeta.color, opacity: 0.75,
                  }} />
                )}

                {/* Chips: stage + concepto */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {stageMeta && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 9.5, fontWeight: 800,
                      color: stageMeta.color,
                      letterSpacing: "0.14em",
                      padding: "3px 8px", borderRadius: 50,
                      background: `${stageMeta.color}18`,
                    }}>
                      {stageMeta.label}
                    </span>
                  )}
                  {idea.concept_name && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: "3px 9px", borderRadius: 50,
                      background: stageMeta ? `${stageMeta.color}10` : "rgba(255,255,255,0.06)",
                      color: stageMeta ? stageMeta.color : DS.textSecondary,
                      border: stageMeta ? `1px solid ${stageMeta.color}33` : "none",
                      letterSpacing: "0.02em",
                    }}>
                      💡 {idea.concept_name}
                    </span>
                  )}
                  {idea.kind && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 6,
                      background: "rgba(139,92,246,0.1)", color: DS.purple,
                    }}>
                      {idea.kind === "video" ? "🎬 Video" : "🖼️ Estático"}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: DS.textPrimary, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                  {idea.title || "Sin titulo"}
                </div>
                {idea.referencia_url && (
                  <div style={{ fontSize: 11, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🔗 {idea.referencia_url}
                  </div>
                )}
                {!readOnly && (
                  <button
                    style={{
                      ...darkBtnGhost,
                      padding: "6px 14px",
                      fontSize: 11,
                      alignSelf: "flex-start",
                      marginTop: 4,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      startScriptingIdea(idea);
                    }}
                  >
                    Guionizar esta idea
                  </button>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* GENERATE TAB */}
      {tab === "generate" && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Left: script list */}
          <div
            style={{
              width: 280,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: DS.textMuted,
                  letterSpacing: "0.14em",
                }}
              >
                GUIONES ({filteredScripts.length})
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  background: "transparent",
                  border: DS.border,
                  color: DS.textSecondary,
                  fontSize: 10,
                  padding: "3px 6px",
                  borderRadius: 6,
                  fontFamily: DS.font,
                  cursor: "pointer",
                }}
              >
                <option value="all">Todos</option>
                <option value="draft">Borradores</option>
                <option value="approved">Aprobados</option>
                <option value="rejected">Rechazados</option>
              </select>
            </div>

            {!readOnly && (
              <button
                onClick={() => { setSelectedScriptId(null); setScriptingIdea(null); }}
                style={{
                  ...darkBtnGhost,
                  padding: "8px 14px",
                  fontSize: 12,
                  width: "100%",
                  textAlign: "center",
                  borderStyle: "dashed",
                }}
              >
                + Nuevo guion
              </button>
            )}

            {!readOnly && scripts.some((s) => s.generated_content && isDefaultTitle(s)) && (
              <button
                onClick={handleBulkRetitle}
                disabled={bulkRetitle.running}
                title="Renombra todos los guiones con título por defecto (UGC #4, Comentario #3, etc.) usando una versión corta de su hook. Propaga al slot del Despliegue."
                style={{
                  ...darkBtnGhost,
                  padding: "8px 14px",
                  fontSize: 11,
                  width: "100%",
                  textAlign: "center",
                  cursor: bulkRetitle.running ? "wait" : "pointer",
                  opacity: bulkRetitle.running ? 0.7 : 1,
                  background: "rgba(55,138,221,0.06)",
                  borderColor: "rgba(55,138,221,0.25)",
                }}
              >
                {bulkRetitle.running
                  ? `Renombrando ${bulkRetitle.done + 1}/${bulkRetitle.total}…`
                  : `✨ Renombrar todos desde su hook`}
              </button>
            )}

            {filteredScripts.map((s) => (
              <div key={s.id} style={{ position: "relative" }}>
                <ScriptCard
                  script={s}
                  active={selectedScriptId === s.id}
                  onClick={() => { setSelectedScriptId(s.id); setScriptingIdea(null); }}
                  onRename={readOnly ? null : async (id, title) => {
                    await updateScript(id, { title });
                    reloadScripts();
                  }}
                />
                {!readOnly && s.generated_content && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetitle(s);
                    }}
                    disabled={retitlingId === s.id}
                    title="Renombrar a partir del hook"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 28,
                      background: "transparent",
                      border: "none",
                      color: DS.textSecondary,
                      fontSize: 12,
                      cursor: retitlingId === s.id ? "wait" : "pointer",
                      padding: "2px 4px",
                      borderRadius: 4,
                      opacity: retitlingId === s.id ? 1 : 0.85,
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                    onMouseLeave={(e) => { if (retitlingId !== s.id) e.currentTarget.style.opacity = 0.85; }}
                  >
                    {retitlingId === s.id ? "…" : "✨"}
                  </button>
                )}
                {!readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id);
                    }}
                    title="Eliminar"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "transparent",
                      border: "none",
                      color: DS.textSecondary,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: 4,
                      opacity: 0.85,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.85)}
                  >
                    x
                  </button>
                )}
              </div>
            ))}

            {filteredScripts.length === 0 && (
              <div
                style={{
                  color: DS.textMuted,
                  fontSize: 12,
                  textAlign: "center",
                  padding: "24px 0",
                }}
              >
                No hay guiones aun
              </div>
            )}
          </div>

          {/* Right: generator */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <ScriptGenerator
              formats={formats}
              selectedScript={selectedScript}
              prefillIdea={scriptingIdea}
              contentItems={contentItems}
              onScriptCreated={() => { reloadScripts(); /* status only moves on approval */ }}
              onScriptUpdated={handleScriptUpdated}
              readOnly={readOnly}
              pipelineType={pipelineType}
            />
          </div>
        </div>
      )}

      {!readOnly && tab === "formats" && (
        <ConceptosLibrary
          formats={formats}
          onOpenDespliegue={onOpenDespliegue}
          onConceptUpdated={reloadFormats}
        />
      )}

      {!readOnly && tab === "config" && <ProductInfoPanel />}
    </div>
  );
}
