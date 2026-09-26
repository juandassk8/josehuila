import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";

const STATUS_STYLES = {
  draft: { label: "Borrador", color: DS.amber, bg: "rgba(245,166,35,0.1)" },
  approved: { label: "Aprobado", color: DS.green, bg: "rgba(29,185,122,0.1)" },
  rejected: { label: "Rechazado", color: DS.red, bg: "rgba(226,75,74,0.1)" },
};

export function ScriptCard({ script, active, onClick, onRename }) {
  const st = STATUS_STYLES[script.status] || STATUS_STYLES.draft;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(script.title);
  const inputRef = useRef(null);

  useEffect(() => { setName(script.title); }, [script.title]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== script.title) {
      onRename?.(script.id, name.trim());
    }
  };

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 12,
        border: active
          ? "1px solid rgba(55,138,221,0.4)"
          : DS.border,
        background: active ? "rgba(55,138,221,0.08)" : DS.bgCard,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: DS.font,
        transition: "border 0.15s, background 0.15s",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(script.title); setEditing(false); } }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${DS.blue}`,
            outline: "none",
            color: DS.textPrimary,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: DS.font,
            padding: "0 0 2px",
            width: "100%",
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          style={{
            color: DS.textPrimary,
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingRight: 52,
          }}
          title="Doble clic para renombrar"
        >
          {script.title}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: st.color,
            background: st.bg,
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          {st.label}
        </span>
        {script.format?.name && (
          <span style={{ fontSize: 10, color: DS.textMuted }}>
            {script.format.name}
          </span>
        )}
      </div>
    </button>
  );
}
