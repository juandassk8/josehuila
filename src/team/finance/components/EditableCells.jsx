// Celdas editables inline — patrón "click→input→Enter guarda" tipo Google Sheet.
// Extraído de views/Gastos.jsx para reuso en Cuaderno y futuras tablas.

import { useEffect, useRef, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { formatCOP, formatCOPDense, formatDateShort, parseCOP } from "../lib/finance_math.js";

export function useEditing(initialValue) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  useEffect(() => { setDraft(initialValue); }, [initialValue]);
  return { editing, setEditing, draft, setDraft };
}

const cellDisplayStyle = {
  padding: "3px 5px",
  borderRadius: 4,
  minHeight: 22,
  cursor: "text",
  display: "flex",
  alignItems: "center",
  transition: "background 0.1s",
};

const cellInputStyle = {
  ...darkInput,
  padding: "3px 5px",
  fontSize: 11,
  height: 24,
  width: "100%",
  boxSizing: "border-box",
};

export function EditableText({ value, onSave, placeholder }) {
  const { editing, setEditing, draft, setDraft } = useEditing(value || "");
  const commit = () => {
    setEditing(false);
    if (draft !== (value || "")) onSave(draft);
  };
  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title={value || ""}
        style={cellDisplayStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.textHint, "12"); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{
          fontSize: 11,
          color: value ? DS.textPrimary : DS.textMuted,
          fontStyle: value ? "normal" : "italic",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          minWidth: 0, flex: 1,
        }}>
          {value || placeholder}
        </span>
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
      }}
      style={cellInputStyle}
    />
  );
}

// EditableAmount soporta color por estado de pago vía prop `payStatus`:
//   { paid, total } → green si paid>=total>0, amber si parcial, gris si paid=0.
// Si payStatus es null, usa color por valor (textPrimary si non-zero, textMuted si 0).
// Display compacto ($2M, $350K, "—" para 0). Tooltip muestra valor completo.
// Input mode: valor entero ($2.000.000) para edición precisa.
export function EditableAmount({ value, onSave, align = "right", payStatus = null, dense = true }) {
  const { editing, setEditing, draft, setDraft } = useEditing(formatCOP(value));
  useEffect(() => { setDraft(formatCOP(value)); }, [value]);
  const commit = () => {
    setEditing(false);
    const n = parseCOP(draft);
    if (n !== Number(value)) onSave(n);
  };
  const color = (() => {
    if (payStatus) {
      const { paid, total } = payStatus;
      const p = Number(paid || 0), t = Number(total || 0);
      if (t > 0 && p >= t) return DS.green;
      if (p > 0 && p < t) return DS.amber;
      return DS.textMuted;
    }
    return Number(value) ? DS.textPrimary : DS.textMuted;
  })();
  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title={formatCOP(value)}
        style={{ ...cellDisplayStyle, justifyContent: align === "right" ? "flex-end" : "flex-start" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.textHint, "12"); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600,
          color,
          fontVariantNumeric: "tabular-nums",
        }}>
          {dense ? formatCOPDense(value) : formatCOP(value)}
        </span>
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(formatCOP(value)); setEditing(false); }
      }}
      onFocus={(e) => e.target.select()}
      style={{
        ...cellInputStyle,
        textAlign: align,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
      }}
    />
  );
}

export function EditableDate({ value, onSave }) {
  const ref = useRef(null);
  const { editing, setEditing, draft, setDraft } = useEditing(value || "");
  const commit = () => {
    setEditing(false);
    if (draft !== (value || "")) onSave(draft || null);
  };
  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title={value || ""}
        style={cellDisplayStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.textHint, "12"); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 10, color: value ? DS.textSecondary : DS.textMuted, whiteSpace: "nowrap" }}>
          {formatDateShort(value)}
        </span>
      </div>
    );
  }
  return (
    <input
      ref={ref}
      type="date"
      autoFocus
      value={draft || ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
      }}
      style={cellInputStyle}
    />
  );
}

export function EditableSelect({ value, onSave, options, renderDisplay }) {
  const { editing, setEditing, draft, setDraft } = useEditing(value);
  const commit = (v) => {
    setEditing(false);
    if (v !== value) onSave(v);
  };
  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={cellDisplayStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.textHint, "12"); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {renderDisplay()}
      </div>
    );
  }
  return (
    <select
      autoFocus
      value={draft ?? ""}
      onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      style={cellInputStyle}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: DS.bgSide, color: DS.textPrimary }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
