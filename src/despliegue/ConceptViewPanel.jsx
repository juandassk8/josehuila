import { useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { STAGES } from "./constants.js";
import { ReferenceFilterBar } from "./ReferenceLabelUI.jsx";
import { variationMatches, hasActiveFilters, groupVariations } from "./labels.js";
import { ExampleThumb } from "./ConceptCard.jsx";

const SIZES = [
  { key: "s", label: "Chico", min: 120 },
  { key: "m", label: "Mediano", min: 170 },
  { key: "l", label: "Grande", min: 240 },
];

// Panel read-only de un FORMATO (concepto) para el cliente: descripción + cómo se
// hace + grid filtrable/zoomable de sus referencias. Clic en una ref → ExampleModal.
export function ConceptViewPanel({ concept, examples = [], isDark = true, canEdit = false, onOpenExample, onEditConcept, onClose }) {
  const T = DS;
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState("");
  const [mode, setMode] = useState("filtrar"); // 'filtrar' | 'resaltar'
  const [showLabels, setShowLabels] = useState(false);
  const [size, setSize] = useState("m");

  const stageInfo = STAGES.find((s) => s.key === concept?.stage) || null;
  const minPx = SIZES.find((s) => s.key === size)?.min || 170;
  const active = hasActiveFilters(filters);

  const shown = useMemo(() => {
    if (!active || mode !== "filtrar") return examples;
    return examples.filter((v) => variationMatches(v, filters));
  }, [examples, filters, active, mode]);

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div onClick={onClose} data-modal style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: T.font,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: modalBg, border: divider, borderRadius: 16, width: "min(1040px, 97vw)", maxHeight: "92vh",
        display: "flex", flexDirection: "column", color: T.textPrimary, boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.6)" : "0 24px 70px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: divider, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>{concept?.name || "Formato"}</h2>
              {stageInfo && <span style={{ fontSize: 10, fontWeight: 800, color: stageInfo.color, border: `1px solid ${stageInfo.color}55`, background: `${stageInfo.color}1A`, padding: "3px 10px", borderRadius: 50 }}>{stageInfo.label}</span>}
              <span style={{ fontSize: 11, color: T.textMuted }}>{examples.length} referencia{examples.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          {canEdit && onEditConcept && (
            <button onClick={() => { onEditConcept(concept); onClose?.(); }} style={ghost(T)}>✏️ Editar formato</button>
          )}
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: divider, background: "transparent", color: T.textSecondary, cursor: "pointer", fontSize: 17, flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 22px" }}>
          {(concept?.description || concept?.execution) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {concept?.description && (
                <Collapsible label="Por qué funciona" T={T} isDark={isDark} defaultOpen>{concept.description}</Collapsible>
              )}
              {concept?.execution && (
                <Collapsible label="Cómo se hace" T={T} isDark={isDark} defaultOpen>{concept.execution}</Collapsible>
              )}
            </div>
          )}

          {/* Controles de filtro + tamaño */}
          {examples.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <ReferenceFilterBar
                  variations={examples}
                  groupBy={groupBy} onGroupBy={setGroupBy}
                  filters={filters} onFilters={setFilters}
                  mode={mode} onMode={setMode}
                  showLabels={showLabels} onShowLabels={setShowLabels}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
                {SIZES.map((s) => (
                  <button key={s.key} onClick={() => setSize(s.key)} style={{ ...ghost(T), padding: "5px 10px", borderColor: size === s.key ? T.blue : T.textHint, color: size === s.key ? T.blue : T.textSecondary }}>{s.label}</button>
                ))}
              </div>

              {(() => {
                const renderGrid = (list) => (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minPx}px, 1fr))`, gap: 8 }}>
                    {list.map((ex) => {
                      const matches = !active || variationMatches(ex, filters);
                      return (
                        <ExampleThumb key={ex.id} example={ex} isDark={isDark} showLabels={showLabels}
                          dim={mode === "resaltar" && active && !matches}
                          onClick={() => onOpenExample?.(ex)} />
                      );
                    })}
                  </div>
                );
                // Agrupado (Organizar por marca/ángulo/formato) → secciones con encabezado.
                if (groupBy) {
                  const groups = groupVariations(shown, groupBy);
                  return groups.map((g) => (
                    <div key={g.value} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{g.label}</span>
                        <span style={{ fontSize: 11, color: T.textMuted }}>{g.items.length}</span>
                        <span style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
                      </div>
                      {renderGrid(g.items)}
                    </div>
                  ));
                }
                return renderGrid(shown);
              })()}
              {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.textMuted, fontSize: 13 }}>Ninguna referencia con esos filtros.</div>}
            </>
          )}
          {examples.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13 }}>Este formato todavía no tiene referencias.</div>}
        </div>
      </div>
    </div>
  );
}

// Sección colapsable (toggle): encabezado clickeable → abre/cierra el texto. Default
// cerrado para no ocupar la pantalla con textazos.
function Collapsible({ label, children, T, isDark, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const border = isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)";
  return (
    <div style={{ borderRadius: 10, border, overflow: "hidden", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font }}>
        <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textSecondary, fontWeight: 800 }}>{label}</span>
        <span style={{ fontSize: 12, color: T.textMuted }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div style={{ fontSize: 13.5, color: T.textSecondary, lineHeight: 1.65, whiteSpace: "pre-wrap", padding: "0 14px 14px" }}>{children}</div>}
    </div>
  );
}

function ghost(T) {
  return { padding: "6px 12px", borderRadius: 50, border: `1px solid ${T.textHint}`, background: "transparent", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font };
}
