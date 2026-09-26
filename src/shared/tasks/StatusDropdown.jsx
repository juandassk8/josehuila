import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";

const STATUSES = [
  { value: "pendiente", label: "PENDIENTE", icon: "○", color: "#9B9A97", group: "No iniciado" },
  { value: "en_curso", label: "EN CURSO", icon: "◐", color: DS.blue, group: "Activo" },
  { value: "completado", label: "COMPLETADO", icon: "●", color: DS.green, group: "Cerrado" },
];

export function StatusDropdown({ value, onChange, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const groups = {};
  STATUSES.forEach((s) => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }}
      >
        {children}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 6, minWidth: 220, fontFamily: DS.font,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.1em", padding: "4px 8px" }}>
            ESTADO
          </div>
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} style={{ marginTop: 4 }}>
              <div style={{ fontSize: 9, color: DS.textMuted, padding: "4px 8px", letterSpacing: "0.08em" }}>
                {groupName}
              </div>
              {items.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { onChange(s.value); setOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 6,
                    background: value === s.value ? DS.bgCard : "transparent",
                    border: "none", cursor: "pointer", fontFamily: DS.font,
                    fontSize: 12, color: DS.textPrimary, fontWeight: value === s.value ? 700 : 500,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (value !== s.value) e.currentTarget.style.background = DS.bgCard; }}
                  onMouseLeave={(e) => { if (value !== s.value) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 14, color: s.color }}>{s.icon}</span>
                  <span style={{ flex: 1 }}>{s.label}</span>
                  {value === s.value && <span style={{ color: DS.textSecondary }}>✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
