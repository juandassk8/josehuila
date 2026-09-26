import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";

// Picker compacto de estructuras de guion. Trigger = pildoritita.
// Click → modal con cards más chicas (nombre + descripción + chips).
// El template completo NO se muestra en UI; queda invisible para el AI.
export function StructurePickerCards({ structures, value, onChange }) {
  const [open, setOpen] = useState(false);
  const active = structures?.find((s) => s.id === value) || null;
  const steps = Array.isArray(active?.steps) ? active.steps : [];

  if (!structures || structures.length === 0) return null;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
      }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: active ? "6px 8px 6px 12px" : "7px 14px",
            borderRadius: 50,
            border: active ? "1px solid rgba(29,185,122,0.45)" : `1px solid ${DS.textHint}`,
            background: active ? "rgba(29,185,122,0.10)" : "transparent",
            color: active ? "#1DB97A" : DS.textSecondary,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: DS.font, letterSpacing: "0.02em",
          }}
        >
          🧱 {active ? `Estructura: ${active.name}` : "Elegir estructura de guion (opcional)"}
          {active && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              style={{
                marginLeft: 2, padding: "2px 7px", borderRadius: 50,
                background: "rgba(255,255,255,0.06)", color: DS.textMuted,
                fontSize: 10, fontWeight: 700,
              }}
              title="Quitar estructura"
            >×</span>
          )}
        </button>
        {/* Chips de pasos cuando hay activa */}
        {active && steps.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {steps.map((s, i) => (
              <span key={i} style={{
                fontSize: 9.5, fontWeight: 600,
                padding: "3px 8px", borderRadius: 50,
                background: "rgba(29,185,122,0.10)",
                color: "#1DB97A", letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}>{s.label || s}</span>
            ))}
          </div>
        )}
      </div>

      {open && (
        <StructureModal
          structures={structures}
          value={value}
          onPick={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StructureModal({ structures, value, onPick, onClose }) {
  const wrapRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: DS.font,
      }}
    >
      <div
        ref={wrapRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "82vh",
          background: DS.bgSide,
          border: `1px solid ${DS.textHint}`,
          borderRadius: 14,
          padding: "18px 22px",
          color: DS.textPrimary,
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Estructura de guion
            </div>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
              Framework de copy que la IA va a aplicar al guion. Es opcional.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 16, padding: 4,
          }}>×</button>
        </div>

        <div style={{
          overflowY: "auto", paddingRight: 4,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}>
          {structures.map((s) => {
            const active = value === s.id;
            const steps = Array.isArray(s.steps) ? s.steps : [];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${active ? "#1DB97A" : "rgba(255,255,255,0.10)"}`,
                  background: active ? "rgba(29,185,122,0.10)" : "rgba(255,255,255,0.02)",
                  color: DS.textPrimary,
                  cursor: "pointer", fontFamily: DS.font,
                  display: "flex", flexDirection: "column", gap: 6,
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: DS.textPrimary }}>
                    {s.name}
                  </span>
                  {s.is_global && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 700, color: DS.textMuted,
                      padding: "1px 6px", borderRadius: 50,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      letterSpacing: "0.04em",
                    }}>GLOBAL</span>
                  )}
                </div>
                {s.description && (
                  <div style={{
                    fontSize: 10.5, color: DS.textMuted, lineHeight: 1.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>{s.description}</div>
                )}
                {steps.length > 0 && (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                    {steps.map((step, i) => (
                      <span key={i} style={{
                        fontSize: 9, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 4,
                        background: active ? "rgba(29,185,122,0.18)" : "rgba(255,255,255,0.04)",
                        color: active ? "#1DB97A" : DS.textSecondary,
                      }}>{step.label || step}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
