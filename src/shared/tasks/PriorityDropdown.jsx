import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";

const PRIORITIES = [
  { value: "urgente", label: "Urgente", color: "#E24B4A" },
  { value: "alta", label: "Alta", color: "#F5A623" },
  { value: "normal", label: "Normal", color: "#378ADD" },
  { value: "baja", label: "Baja", color: "#9B9A97" },
];

// SVG flag instead of 🚩 emoji because emoji ignores CSS color in most browsers.
export function FlagIcon({ color, size = 12, outline }) {
  const fill = outline ? "none" : color;
  const stroke = color;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M5 3v18"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M5 4h12l-2.4 3.5L17 11H5z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PriorityFlag({ priority }) {
  const p = PRIORITIES.find((x) => x.value === priority);
  if (!p) return <FlagIcon color="#9B9A97" size={12} outline />;
  return <FlagIcon color={p.color} size={12} />;
}

export function PriorityDropdown({ value, onChange, children, compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = PRIORITIES.find((p) => p.value === value);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, lineHeight: 1, color: "inherit",
        }}
      >
        {children || (
          current ? (
            <span style={{
              fontSize: 11, fontWeight: 600, color: current.color,
              background: `${current.color}22`, padding: "3px 10px", borderRadius: 6,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <FlagIcon color={current.color} size={11} /> {current.label}
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", opacity: 0.5 }}>
              <FlagIcon color={DS.textMuted} size={13} outline />
            </span>
          )
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 100,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 6, minWidth: 180, fontFamily: DS.font,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.1em", padding: "4px 8px 6px" }}>
            PRIORIDAD
          </div>
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => { onChange(p.value); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 6,
                background: value === p.value ? DS.bgCard : "transparent",
                border: "none", cursor: "pointer", fontFamily: DS.font,
                fontSize: 12, color: DS.textPrimary, textAlign: "left",
              }}
              onMouseEnter={(e) => { if (value !== p.value) e.currentTarget.style.background = DS.bgCard; }}
              onMouseLeave={(e) => { if (value !== p.value) e.currentTarget.style.background = "transparent"; }}
            >
              <FlagIcon color={p.color} size={13} />
              <span style={{ flex: 1 }}>{p.label}</span>
              {value === p.value && <span style={{ color: DS.textSecondary }}>✓</span>}
            </button>
          ))}
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "7px 10px", borderRadius: 6, marginTop: 4,
              background: "transparent", border: "none", cursor: "pointer", fontFamily: DS.font,
              fontSize: 12, color: DS.textSecondary, textAlign: "left",
              borderTop: DS.border,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 14 }}>🚫</span>
            <span>Borrar</span>
          </button>
        </div>
      )}
    </div>
  );
}

export { PRIORITIES };
