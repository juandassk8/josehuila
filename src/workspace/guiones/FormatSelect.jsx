import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";

export function FormatSelect({ formats, value, onChange, placeholder }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = formats.find((f) => f.id === value);
  // Bg con MUCHO más contraste contra el page bg.
  const dropdownBg = isDark ? "#1F1F26" : "#FFFFFF";
  const dropdownBorder = isDark
    ? "1px solid rgba(255,255,255,0.14)"
    : "1px solid rgba(0,0,0,0.12)";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 10,
          border: DS.border,
          background: DS.bgCard,
          color: selected ? DS.textPrimary : DS.textMuted,
          fontSize: 13,
          fontFamily: DS.font,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {selected ? (
          <>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: selected.color || "#378ADD", flexShrink: 0,
            }} />
            <span style={{ flex: 1 }}>{selected.name}</span>
          </>
        ) : (
          <span style={{ flex: 1 }}>{placeholder || "Sin concepto / libre"}</span>
        )}
        <span style={{ fontSize: 10, color: DS.textMuted }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          marginTop: 4,
          // Fondo con alto contraste contra el page bg.
          background: dropdownBg,
          border: dropdownBorder,
          borderRadius: 10,
          padding: "6px 0",
          zIndex: 1000,
          boxShadow: isDark
            ? "0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.3)"
            : "0 12px 32px rgba(0,0,0,0.18)",
          maxHeight: 240,
          overflowY: "auto",
        }}>
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            style={optionStyle(false)}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(127,127,127,0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ color: DS.textMuted, fontSize: 13 }}>Sin concepto / libre</span>
            {!value && <span style={{ color: DS.blue }}>✓</span>}
          </div>
          {formats.map((f) => (
            <div
              key={f.id}
              onClick={() => { onChange(f.id); setOpen(false); }}
              style={optionStyle(value === f.id)}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(127,127,127,0.1)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: f.color || "#378ADD", flexShrink: 0,
              }} />
              <span style={{ flex: 1, color: DS.textPrimary, fontSize: 13 }}>{f.name}</span>
              {value === f.id && <span style={{ color: DS.blue }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function optionStyle(active) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    cursor: "pointer",
    background: "transparent",
    transition: "background 0.1s",
  };
}
