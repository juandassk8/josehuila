import { useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import {
  LABEL_CATEGORIES, distinctValues,
  LINK_FILTERS, anyCanvasFilterActive,
} from "./labels.js";

// En el despliegue no filtramos por "formato" — los creativos ya están
// organizados por formato (video/estático) en columnas, así que sería redundante.
const FILTER_CATEGORIES = LABEL_CATEGORIES.filter((c) => c.key !== "formato");

// Barra de filtros FLOTANTE del canvas de despliegue. Fixed, arriba a la
// derecha. Sirve a admin Y clientes (solo cambia estado de vista, no toca
// datos). Filtra/resalta creativos por etiquetas (marca/nicho/ángulo/formato)
// y por presencia de links (Meta/Drive), y muestra/oculta las etiquetas.
export function CanvasFilterBar({
  variations, filters, onFilters, linkFilter, onLinkFilter,
  mode, onMode, showLabels, onShowLabels,
  inline = false, showLabelsToggle = true,
}) {
  const [open, setOpen] = useState(false);

  const valuesByCat = useMemo(() => {
    const out = {};
    for (const c of FILTER_CATEGORIES) out[c.key] = distinctValues(variations, c.key);
    return out;
  }, [variations]);

  const anyValues = FILTER_CATEGORIES.some((c) => valuesByCat[c.key].length > 0);
  const active = anyCanvasFilterActive(filters, linkFilter);
  const activeCount =
    FILTER_CATEGORIES.reduce((n, c) => n + ((filters[c.key] || []).length), 0) +
    (linkFilter && linkFilter !== "all" ? 1 : 0);

  const toggleValue = (catKey, val) => {
    const cur = filters[catKey] || [];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    onFilters({ ...filters, [catKey]: next });
  };
  const clearAll = () => { onFilters({}); onLinkFilter("all"); };

  // Flotante: arriba a la DERECHA para no chocar con el panel de stats (que va
  // arriba-izquierda). El popover se ancla a la derecha para abrir hacia adentro.
  const wrapStyle = inline
    ? { position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: DS.font }
    : { position: "fixed", top: 16, right: 20, zIndex: 9998, display: "flex", alignItems: "center", gap: 8, fontFamily: DS.font };

  return (
    <div style={wrapStyle}>
      {/* Toggle ver etiquetas */}
      {showLabelsToggle && (
        <button
          onClick={() => onShowLabels(!showLabels)}
          title="Mostrar u ocultar la marca sobre cada creativo"
          style={pill(showLabels, DS.blue)}
        >🏷 Etiquetas</button>
      )}

      {/* Filtrar (popover) */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={pill(active, DS.amber)}
        >
          ▽ Filtrar{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{
              position: "absolute", top: 40, right: 0, zIndex: 41, width: 340, maxHeight: 460, overflowY: "auto",
              padding: 14, borderRadius: 12, background: DS.bgSide, border: `1px solid ${DS.textHint}`,
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", gap: 12,
            }}>
              {/* Modo */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.04em" }}>MODO</span>
                <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2 }}>
                  <MiniBtn active={mode === "resaltar"} onClick={() => onMode("resaltar")}>✨ Resaltar</MiniBtn>
                  <MiniBtn active={mode === "filtrar"} onClick={() => onMode("filtrar")}>▽ Ocultar resto</MiniBtn>
                </div>
                <span style={{ flex: 1 }} />
                {active && (
                  <button onClick={clearAll} style={{
                    padding: "4px 9px", borderRadius: 50, border: DS.border, background: "transparent",
                    color: DS.textSecondary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  }}>Limpiar</button>
                )}
              </div>

              {/* Links */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.04em" }}>LINKS</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {LINK_FILTERS.map((lf) => {
                    const on = (linkFilter || "all") === lf.key;
                    return (
                      <button key={lf.key} onClick={() => onLinkFilter(lf.key)}
                        style={{
                          padding: "4px 10px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
                          fontSize: 11, fontWeight: 700,
                          border: on ? `1px solid ${DS.blue}` : DS.border,
                          background: on ? withA(DS.blue, 0.2) : "transparent",
                          color: on ? DS.blue : DS.textSecondary,
                        }}>
                        {lf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chips por categoría de etiqueta */}
              {!anyValues && (
                <div style={{ fontSize: 11, color: DS.textMuted }}>
                  Todavía no hay etiquetas en estos creativos.
                </div>
              )}
              {FILTER_CATEGORIES.filter((c) => valuesByCat[c.key].length > 0).map((c) => (
                <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: c.color }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />{c.label}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {valuesByCat[c.key].map((val) => {
                      const on = (filters[c.key] || []).includes(val);
                      return (
                        <button key={val} onClick={() => toggleValue(c.key, val)}
                          style={{
                            padding: "4px 10px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
                            fontSize: 11, fontWeight: 700,
                            border: on ? `1px solid ${c.color}` : DS.border,
                            background: on ? withA(c.color, 0.2) : "transparent",
                            color: on ? c.color : DS.textSecondary,
                          }}>
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Contador cuando hay filtro activo */}
      {active && mode === "filtrar" && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: DS.amber, background: withA(DS.amber, 0.12),
          border: `1px solid ${withA(DS.amber, 0.35)}`, padding: "5px 10px", borderRadius: 50,
        }}>Ocultando los que no coinciden</span>
      )}
    </div>
  );
}

function pill(active, color) {
  return {
    padding: "7px 13px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
    fontSize: 11, fontWeight: 700,
    border: active ? `1px solid ${color}` : DS.border,
    background: active ? withA(color, 0.16) : (DS.bgSide || "rgba(20,20,26,0.85)"),
    color: active ? color : DS.textSecondary,
    backdropFilter: "blur(6px)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
  };
}

function MiniBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 50, border: "none",
      background: active ? DS.bgSide : "transparent",
      color: active ? DS.textPrimary : DS.textMuted,
      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
    }}>{children}</button>
  );
}

function withA(hex, a) {
  const h = (hex || "#000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}
