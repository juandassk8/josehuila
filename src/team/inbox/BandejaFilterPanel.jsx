import { useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";

// Panel "Opciones de filtro" de la Bandeja — mismo lenguaje que el CanvasFilterBar
// del despliegue. Botón que abre un popover de dos columnas: categorías a la
// izquierda (Concepto / Medio / Estado) y opciones a la derecha. Reemplaza el
// <select> plano + los botones de medio flotantes.
//
// Concepto y Estado comparten `conceptFilter` (single-select). Medio es aparte.
export function BandejaFilterPanel({
  conceptFilter, setConceptFilter,
  mediaFilter, setMediaFilter,
  groups,                 // { byStage:{tofu,mofu,bofu,""}, nuevos:[] }
  statusOptions = [],     // [{ key:"__done__", label, n }]
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("concepto");

  const conceptActive = conceptFilter !== "all";
  const isStatus = conceptActive && conceptFilter.startsWith("__");
  const mediaActive = mediaFilter !== "all";
  const activeCount = (conceptActive ? 1 : 0) + (mediaActive ? 1 : 0);

  // Etiqueta corta de lo activo para el botón.
  const activeLabel = (() => {
    const parts = [];
    if (conceptActive) {
      const all = [...groups.byStage.tofu, ...groups.byStage.mofu, ...groups.byStage.bofu, ...groups.byStage[""], ...groups.nuevos, ...statusOptions.map((s) => ({ key: s.key, label: s.label }))];
      const found = all.find((o) => o.key === conceptFilter);
      if (found) parts.push(found.label.replace(/\s*\(\d+\)$/, ""));
    }
    if (mediaActive) parts.push(mediaFilter === "static" ? "Imagen" : "Video");
    return parts.join(" · ");
  })();

  const setConcept = (key) => setConceptFilter(conceptFilter === key ? "all" : key);
  const clearAll = () => { setConceptFilter("all"); setMediaFilter("all"); };

  const TABS = [
    { key: "concepto", label: "Concepto" },
    { key: "medio", label: "Medio" },
    { key: "estado", label: "Estado" },
  ];
  const STAGES = [["tofu", "TOFU", DS.blue], ["mofu", "MOFU", DS.amber], ["bofu", "BOFU", DS.green], ["", "Sin etapa", DS.textMuted]];

  return (
    <div style={{ position: "relative", fontFamily: DS.font }}>
      <button onClick={() => setOpen((o) => !o)} style={pill(activeCount > 0, DS.amber)}>
        <span style={{ fontWeight: 800 }}>⚟ Opciones de filtro</span>
        {activeLabel ? <span style={{ opacity: 0.85, fontWeight: 700 }}> · {activeLabel}</span> : null}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9000 }} />
          <div style={{
            position: "absolute", top: 42, right: 0, zIndex: 9001, width: 460, maxWidth: "92vw",
            borderRadius: 16, background: DS.bgSide, border: `1px solid ${DS.textHint}`,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)", overflow: "hidden", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", minHeight: 240 }}>
              {/* Columna izquierda: categorías */}
              <div style={{ width: 140, flexShrink: 0, borderRight: `1px solid ${DS.border}`, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                {TABS.map((t) => {
                  const on = tab === t.key;
                  const badge = t.key === "medio" ? (mediaActive ? 1 : 0) : t.key === "concepto" ? (conceptActive && !isStatus ? 1 : 0) : (isStatus ? 1 : 0);
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                      textAlign: "left", padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontFamily: DS.font,
                      fontSize: 13, fontWeight: on ? 800 : 600, border: "none",
                      background: on ? withAlpha(DS.blue, "1e") : "transparent",
                      color: on ? DS.blue : DS.textSecondary,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      {t.label}{badge ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: DS.amber }} /> : null}
                    </button>
                  );
                })}
              </div>

              {/* Columna derecha: opciones */}
              <div style={{ flex: 1, padding: 14, overflowY: "auto", maxHeight: 420 }}>
                {tab === "concepto" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {STAGES.map(([st, label, color]) => (groups.byStage[st]?.length > 0) && (
                      <Section key={st || "none"} label={label} color={color}>
                        {groups.byStage[st].map((o) => (
                          <Chip key={o.key} on={conceptFilter === o.key} color={color} onClick={() => setConcept(o.key)}>{o.label} <b style={{ opacity: 0.6 }}>{o.n}</b></Chip>
                        ))}
                      </Section>
                    ))}
                    {groups.nuevos.length > 0 && (
                      <Section label="🆕 Nuevos / fuera del banco" color={DS.purple}>
                        {groups.nuevos.map((o) => (
                          <Chip key={o.key} on={conceptFilter === o.key} color={DS.purple} onClick={() => setConcept(o.key)}>{o.label} <b style={{ opacity: 0.6 }}>{o.n}</b></Chip>
                        ))}
                      </Section>
                    )}
                    {STAGES.every(([st]) => !(groups.byStage[st]?.length)) && groups.nuevos.length === 0 && (
                      <div style={{ fontSize: 12, color: DS.textMuted }}>No hay conceptos en esta vista.</div>
                    )}
                  </div>
                )}

                {tab === "medio" && (
                  <Section label="Tipo de medio" color={DS.blue}>
                    {[["all", "Todos"], ["video", "🎬 Video"], ["static", "🖼 Imagen"]].map(([k, lbl]) => (
                      <Chip key={k} on={mediaFilter === k} color={DS.blue} onClick={() => setMediaFilter(k)}>{lbl}</Chip>
                    ))}
                  </Section>
                )}

                {tab === "estado" && (
                  <Section label="Estado" color={DS.green}>
                    {statusOptions.length === 0
                      ? <span style={{ fontSize: 12, color: DS.textMuted }}>Todo al día. 👌</span>
                      : statusOptions.map((s) => (
                        <Chip key={s.key} on={conceptFilter === s.key} color={DS.green} onClick={() => setConcept(s.key)}>{s.label} <b style={{ opacity: 0.6 }}>{s.n}</b></Chip>
                      ))}
                  </Section>
                )}
              </div>
            </div>

            {/* Pie: limpiar / cerrar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: `1px solid ${DS.border}` }}>
              <span style={{ fontSize: 11, color: DS.textMuted }}>{activeCount ? `${activeCount} filtro(s) activo(s)` : "Sin filtros"}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={clearAll} disabled={!activeCount} style={{ padding: "7px 14px", borderRadius: 50, border: DS.border, background: "transparent", color: activeCount ? DS.textSecondary : DS.textHint, fontSize: 12, fontWeight: 700, cursor: activeCount ? "pointer" : "default", fontFamily: DS.font }}>Limpiar</button>
                <button onClick={() => setOpen(false)} style={{ padding: "7px 16px", borderRadius: 50, border: "none", background: DS.blue, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font }}>Listo</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ label, color, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />{label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ on, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 11px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 11.5, fontWeight: 700,
      border: on ? `1.5px solid ${color}` : DS.border,
      background: on ? withAlpha(color, "22") : "transparent",
      color: on ? color : DS.textSecondary,
    }}>{children}</button>
  );
}

function pill(active, color) {
  return {
    padding: "8px 14px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 12,
    border: active ? `1px solid ${color}` : DS.border,
    background: active ? withAlpha(color, "1e") : "transparent",
    color: active ? color : DS.textSecondary,
  };
}
