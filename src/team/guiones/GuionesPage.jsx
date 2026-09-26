import { useState } from "react";
import { DS, darkCard, darkBtnGhost } from "../../lib/design.js";
import { useFormats } from "../hooks/useFormats.js";
import { useScripts } from "../hooks/useScripts.js";
import { Topbar } from "../layout/Topbar.jsx";
import { ScriptGenerator } from "./ScriptGenerator.jsx";
import { ScriptCard } from "./ScriptCard.jsx";
import { FormatLibrary } from "./FormatLibrary.jsx";
import { VoiceExpertisePanel } from "./VoiceExpertisePanel.jsx";
import { deleteScript, updateScript } from "../data/guionesDb.js";
import { setContentStatus } from "../data/contentDb.js";
import { usePathRoute } from "../../lib/router.jsx";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";

const TABS = [
  { key: "ideas", label: "Ideas" },
  { key: "generate", label: "Guionizar" },
  { key: "formats", label: "Formatos" },
  { key: "config", label: "Voz y Expertise" },
];

export function GuionesPage({ contentItems, readOnly = false }) {
  const { formats, reload: reloadFormats } = useFormats();
  const { scripts, reload: reloadScripts } = useScripts();

  // URL: #/guiones/<tab>
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const visibleTabs = readOnly
    ? TABS.filter((t) => t.key === "ideas" || t.key === "generate")
    : TABS;
  const validKeys = visibleTabs.map((t) => t.key);
  const defaultTab = readOnly ? "generate" : "ideas";
  const tab = validKeys.includes(segments[1]) ? segments[1] : defaultTab;
  const setTab = (t) => navigate(`/guiones/${t}`);

  const [selectedScriptId, setSelectedScriptId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [retitlingId, setRetitlingId] = useState(null);

  // Ideas from content pipeline (status = "idea"). Excluye historias: solo videos/posts se guionizan.
  const ideas = (contentItems || []).filter((i) => i.status === "idea" && i.kind !== "story");

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
  // guiones viejos que quedaron con títulos genéricos.
  const handleRetitle = async (script) => {
    if (!script?.generated_content) return;
    setRetitlingId(script.id);
    try {
      const res = await fetch("/api/title-from-hook", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({
          scriptId: script.id,
          content: script.generated_content,
        }),
      });
      if (!res.ok) {
        logger.error("[retitle] failed:", res.status);
        return;
      }
      const { title } = await res.json();
      if (title) {
        await updateScript(script.id, { title });
        reloadScripts();
      }
    } catch (e) {
      logger.error("[retitle] threw:", e?.message || e);
    } finally {
      setRetitlingId(null);
    }
  };

  // When a script linked to an idea is approved, move idea to "scripting"
  const handleScriptUpdated = async () => {
    reloadScripts();
    // Check if the current script was just approved and is linked to an idea
    if (scriptingIdea) {
      const script = scripts.find((s) => s.id === selectedScriptId);
      if (script?.status === "approved") {
        await setContentStatus(scriptingIdea.id, "scripting");
        // content will reload via realtime
        setScriptingIdea(null);
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
            {ideas.map((idea) => (
              <div
                key={idea.id}
                style={{
                  background: DS.bgCard,
                  border: DS.border,
                  borderRadius: 12,
                  padding: "16px",
                  cursor: readOnly ? "default" : "pointer",
                  transition: "border 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
                onClick={() => { if (!readOnly) startScriptingIdea(idea); }}
                onMouseEnter={(e) => { if (!readOnly) e.currentTarget.style.borderColor = DS.blue; }}
                onMouseLeave={(e) => { if (!readOnly) e.currentTarget.style.border = DS.border; }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: DS.textPrimary }}>
                  {idea.title || "Sin titulo"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {idea.tipo && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(55,138,221,0.1)", color: DS.blue }}>
                      {idea.tipo}
                    </span>
                  )}
                  {(idea.formato || []).map((f, i) => (
                    <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,0.1)", color: DS.purple }}>
                      {f}
                    </span>
                  ))}
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
            ))}
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
            />
          </div>
        </div>
      )}

      {!readOnly && tab === "formats" && (
        <FormatLibrary formats={formats} onUpdate={reloadFormats} />
      )}

      {!readOnly && tab === "config" && <VoiceExpertisePanel />}
    </div>
  );
}
