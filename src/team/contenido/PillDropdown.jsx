import { useEffect, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";

// Dropdown tipo "pill" — reemplaza click-cicla por popover con opciones.
// Click en pill → abre popover. Click en opción → setea y cierra. Click fuera → cierra.
//
// Props:
//   value: string | null
//   options: [{ value: string | null, label: string, color?: string }]
//   onChange: (value) => void
//   readOnly: boolean — si true, no abre popover
//   size: "sm" | "md"
//   placeholder: string — label cuando value es null/undefined
export function PillDropdown({ value, options, onChange, readOnly = false, size = "md", placeholder = "Seleccionar" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = options.find((o) => o.value === value) || null;
  const isSmall = size === "sm";

  const label = current?.label || placeholder;
  const color = current?.color || DS.textMuted;
  // withAlpha maneja correctamente tanto hex (#RGB) como rgba(...).
  // Antes hacíamos `color + "22"` que rompía con DS.textMuted (rgba) en dark
  // y dejaba el pill con fondo blanco semitransparente.
  const bg = current ? withAlpha(color, "22") : "transparent";
  const border = current ? color : DS.textHint;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!readOnly) setOpen((v) => !v);
        }}
        disabled={readOnly}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: isSmall ? "2px 10px" : "4px 14px",
          borderRadius: 50,
          background: bg,
          border: `1px solid ${border}`,
          color: current ? color : DS.textSecondary,
          fontSize: isSmall ? 10 : 12,
          fontWeight: 700,
          cursor: readOnly ? "default" : "pointer",
          fontFamily: DS.font,
          lineHeight: 1.3,
        }}
      >
        <span style={{
          width: isSmall ? 6 : 8,
          height: isSmall ? 6 : 8,
          borderRadius: "50%",
          background: current ? color : DS.textHint,
        }} />
        {label}
        {!readOnly && (
          <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▾</span>
        )}
      </button>
      {open && !readOnly && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 4, zIndex: 300, minWidth: 160,
          boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          fontFamily: DS.font,
        }}>
          {options.map((opt) => {
            const active = opt.value === value;
            const c = opt.color || DS.textSecondary;
            return (
              <button
                key={opt.value ?? "__null__"}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 10px", borderRadius: 6,
                  background: active ? withAlpha(c, "18") : "transparent",
                  border: "none", cursor: "pointer",
                  color: active ? c : DS.textPrimary,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  fontFamily: DS.font, textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = DS.bgCard; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: c, flexShrink: 0,
                }} />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && <span style={{ color: c, fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
