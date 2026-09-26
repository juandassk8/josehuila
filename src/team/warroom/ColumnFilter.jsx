import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { CONTENT_STATUSES, CONTENT_STATUS_LABEL } from "../contenido/ContentCard.jsx";

const STATUS_DOT = {
  idea: "#9b9b9b",
  scripting: "#378ADD",
  to_film: "#E24B4A",
  to_edit: "#EC4899",
  to_post: "#E9C435",
  posted: "#1DB97A",
};

// Popover morado tipo "Filtro (N)" para elegir qué columnas del Content Board se ven.
// Persiste selección en localStorage como `contentBoard:columns:${userId}`.
export function ColumnFilter({ storageKey, defaultSelected, onChange }) {
  const [selected, setSelected] = useState(defaultSelected);
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  // Cargar de localStorage al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((s) => CONTENT_STATUSES.includes(s));
          if (valid.length > 0) {
            setSelected(valid);
            onChange?.(valid);
            return;
          }
        }
      }
    } catch {}
    onChange?.(defaultSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (status) => {
    const next = selected.includes(status)
      ? selected.filter((s) => s !== status)
      : [...selected, status];
    // No permitir dejar todo vacío
    if (next.length === 0) return;
    // Mantener orden canónico
    const ordered = CONTENT_STATUSES.filter((s) => next.includes(s));
    setSelected(ordered);
    try { localStorage.setItem(storageKey, JSON.stringify(ordered)); } catch {}
    onChange?.(ordered);
  };

  const count = selected.length;
  const total = CONTENT_STATUSES.length;

  return (
    <div style={{ position: "relative" }} ref={popRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "8px 14px", borderRadius: 10,
          background: open ? DS.purple + "22" : "transparent",
          border: `1px solid ${open ? DS.purple : DS.textHint}`,
          color: open ? DS.purple : DS.textSecondary,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: DS.font,
        }}
      >
        <span>⚙</span>
        <span>Columnas{count < total ? ` (${count})` : ""}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 8, zIndex: 200, minWidth: 200,
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          fontFamily: DS.font,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            color: DS.textMuted, padding: "4px 8px 6px",
          }}>
            COLUMNAS VISIBLES
          </div>
          {CONTENT_STATUSES.map((status) => {
            const checked = selected.includes(status);
            const dot = STATUS_DOT[status];
            return (
              <button
                key={status}
                onClick={() => toggle(status)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 8px", borderRadius: 6,
                  background: "transparent", border: "none", cursor: "pointer",
                  color: checked ? DS.textPrimary : DS.textMuted,
                  fontSize: 12, fontWeight: checked ? 600 : 500,
                  fontFamily: DS.font, textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 4,
                  border: `1.5px solid ${checked ? DS.purple : DS.textHint}`,
                  background: checked ? DS.purple : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 10, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {checked ? "✓" : ""}
                </span>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0,
                }} />
                <span style={{ flex: 1 }}>{CONTENT_STATUS_LABEL[status]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
