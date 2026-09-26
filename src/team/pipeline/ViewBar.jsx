import { DS } from "../../lib/design.js";
import { STAGES, STAGE_META, NIVELES, NIVEL_COLOR } from "./pipelineConstants.js";

const TAB_ICON = {
  funnel: "M4 5h16M4 12h16M4 19h9",
  campaign: "M4 4h16v5H4zM4 13h7v7H4zM14 13h6v7h-6z",
  brief: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5",
};

// Barra de vistas + filtros (README §A2 / prototipo): tabs Etapas / In Campaign
// (+ tab del brief), chips Todo/Videos/Estáticos, y —dentro de un brief— select
// de etapa + expandir/ocultar todos + contador a la derecha.
export function ViewBar({ view, onView, inBrief, briefName, tipoFilter, onTipo, stageFilter, onStageFilter, nivelFilter, onNivel, seleccionando, onSeleccionar, onExpandAll, scopeCount, baseCount }) {
  const tabs = [["funnel", "Etapas"], ["campaign", "In Campaign"]];
  if (inBrief) tabs.push(["brief", briefName || "Brief"]);

  const chips = [["todo", "Todo"], ["video", "Videos"], ["estatico", "Estáticos"]];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 30px 0" }}>
      {/* Tabs de vista */}
      <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
        {tabs.map(([k, label]) => {
          const on = view === k;
          return (
            <button key={k} type="button" onClick={() => onView(k)}
              style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12.5, fontWeight: on ? 600 : 500, padding: "7px 13px", borderRadius: 10, cursor: "pointer", border: "none",
                color: on ? "var(--sel)" : "var(--ink-3)", background: on ? "var(--surface)" : "transparent", boxShadow: on ? "var(--shadow)" : "none", maxWidth: 220, minWidth: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d={TAB_ICON[k]} /></svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Chips de tipo */}
      <div style={{ display: "flex", gap: 7 }}>
        {chips.map(([k, label]) => {
          const on = tipoFilter === k;
          return (
            <button key={k} type="button" onClick={() => onTipo(k)}
              style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                color: on ? "var(--sel)" : "var(--ink-2)", background: on ? "var(--sel-soft)" : "var(--chip)", border: `1px solid ${on ? "rgba(88,166,255,0.34)" : "var(--line)"}` }}>{label}</button>
          );
        })}
      </div>

      {/* Nivel de conciencia. Es la pregunta de "cuántos MOFU tengo al aire", que
          antes no se podía contestar porque el nivel vivía escrito adentro del
          concepto. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Conciencia</span>
        <select value={nivelFilter || ""} onChange={(e) => onNivel(e.target.value || null)}
          style={{ appearance: "none", border: "none", background: "transparent", outline: "none", cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: nivelFilter ? NIVEL_COLOR[nivelFilter] : DS.textSecondary }}>
          <option value="">Todas</option>
          {NIVELES.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
          <option value="__sin">Sin nivel</option>
        </select>
      </div>

      {/* Herramientas de la derecha */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {inBrief && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Etapa</span>
            <select value={stageFilter || ""} onChange={(e) => onStageFilter(e.target.value || null)}
              style={{ appearance: "none", border: "none", background: "transparent", outline: "none", cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: stageFilter ? STAGE_META[stageFilter].color : DS.textSecondary }}>
              <option value="">Todas</option>
              {STAGES.map((k) => <option key={k} value={k}>{STAGE_META[k].label}</option>)}
            </select>
          </div>
        )}
        {/* Entrar y salir del modo selección. Las casillas viven detrás de este
            botón y no pegadas a cada fila: una casilla permanente en cada
            contenido es ruido en la pantalla donde uno viene a leer, no a
            administrar. */}
        {inBrief && onSeleccionar && (
          <button type="button" onClick={() => onSeleccionar(!seleccionando)}
            style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              borderRadius: 11, padding: "7px 13px",
              color: seleccionando ? "var(--sel)" : "var(--ink-2)",
              background: seleccionando ? "var(--sel-soft)" : "var(--surface-2)",
              border: `1px solid ${seleccionando ? "rgba(88,166,255,0.34)" : "var(--line)"}` }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {seleccionando ? "Listo" : "Seleccionar"}
          </button>
        )}
        {inBrief && (
          <div style={{ display: "flex", borderRadius: 11, overflow: "hidden", border: "1px solid var(--line)" }}>
            <button type="button" title="Expandir todos" onClick={() => onExpandAll(true)}
              style={{ width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", border: "none", borderRight: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-3)" }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 9l5 5 5-5" /></svg>
            </button>
            <button type="button" title="Ocultar todos" onClick={() => onExpandAll(false)}
              style={{ width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", border: "none", background: "var(--surface-2)", color: "var(--ink-3)" }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5-5 5 5" /></svg>
            </button>
          </div>
        )}
        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {scopeCount}{inBrief && stageFilter ? ` de ${baseCount}` : ""} contenidos
        </span>
      </div>
    </div>
  );
}
