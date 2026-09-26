import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";

export function AssigneeDropdown({ members, selected, onChange, children }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = (members || []).filter((m) =>
    !search || m.name?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  const assignedMembers = (members || []).filter((m) => selected.includes(m.id));

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }}
      >
        {children || (
          assignedMembers.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              {assignedMembers.slice(0, 3).map((m, i) => (
                <div key={m.id} style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: m.color || DS.blue, color: "#fff",
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${DS.bg}`, marginLeft: i > 0 ? -6 : 0,
                }}>{m.name?.charAt(0).toUpperCase()}</div>
              ))}
            </div>
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: `1px dashed ${DS.textMuted}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: DS.textMuted, fontSize: 11,
            }}>+</div>
          )
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 6, minWidth: 220, fontFamily: DS.font,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{
              width: "100%", padding: "6px 10px", fontSize: 12,
              background: DS.bgCard, border: DS.border, borderRadius: 6,
              color: DS.textPrimary, outline: "none", fontFamily: DS.font,
              boxSizing: "border-box", marginBottom: 6,
            }}
          />
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.1em", padding: "4px 8px" }}>
            PERSONAS ASIGNADAS
          </div>
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 6,
                background: selected.includes(m.id) ? DS.bgCard : "transparent",
                border: "none", cursor: "pointer", fontFamily: DS.font,
                fontSize: 12, color: DS.textPrimary, textAlign: "left",
              }}
              onMouseEnter={(e) => { if (!selected.includes(m.id)) e.currentTarget.style.background = DS.bgCard; }}
              onMouseLeave={(e) => { if (!selected.includes(m.id)) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: m.color || DS.blue, color: "#fff",
                fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{m.name?.charAt(0).toUpperCase()}</div>
              <span style={{ flex: 1 }}>{m.name}</span>
              {selected.includes(m.id) && <span style={{ color: DS.blue }}>✓</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "12px", textAlign: "center", fontSize: 11, color: DS.textMuted }}>
              Sin resultados
            </div>
          )}
        </div>
      )}
    </div>
  );
}
