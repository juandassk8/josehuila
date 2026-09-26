// Celda genérica. Despacha al render apropiado según el tipo de columna.
//
// Tipos:
//   - text:     editable directo (input)
//   - dropdown: chip con color; click abre lista de opciones
//   - date:     input type="date"
//   - link:     muestra "Abrir →" si tiene URL, edita en input al click

import { useEffect, useRef, useState } from "react";

export function Cell({ item, column, options, editorById, rowIndex, anyCreativeNumberStored, isEditing, onStartEdit, onCommit, onCancel, onEditOptions, isDark, T }) {
  const value = item[column.key] ?? "";
  // Placeholder dinámico para creative_number: si NINGUNA fila tiene número
  // tipeado, mostramos "#001", "#002"... por posición. Cuando el user empieza
  // a tipear (anyCreativeNumberStored=true), los placeholders desaparecen.
  let dynamicPlaceholder = column.placeholder;
  if (column.key === "creative_number") {
    if (anyCreativeNumberStored) {
      dynamicPlaceholder = "";
    } else if (rowIndex != null) {
      dynamicPlaceholder = `#${String(rowIndex + 1).padStart(3, "0")}`;
    }
  }
  switch (column.type) {
    case "dropdown":
      return (
        <DropdownCell
          value={value} options={options} isEditing={isEditing}
          teamSourced={!!column.teamSourced}
          editorById={editorById}
          onStartEdit={onStartEdit} onCommit={onCommit} onCancel={onCancel}
          onEditOptions={onEditOptions}
          isDark={isDark} T={T} align={column.align}
        />
      );
    case "date":
      return (
        <DateCell
          value={value} isEditing={isEditing}
          onStartEdit={onStartEdit} onCommit={onCommit} onCancel={onCancel}
          isDark={isDark} T={T}
        />
      );
    case "link":
      return (
        <LinkCell
          value={value} isEditing={isEditing}
          onStartEdit={onStartEdit} onCommit={onCommit} onCancel={onCancel}
          isDark={isDark} T={T}
        />
      );
    case "text":
    default:
      return (
        <TextCell
          value={value} isEditing={isEditing} placeholder={dynamicPlaceholder}
          onStartEdit={onStartEdit} onCommit={onCommit} onCancel={onCancel}
          isDark={isDark} T={T} align={column.align}
        />
      );
  }
}

// ─── TextCell ─────────────────────────────────────────────────────────────

function TextCell({ value, isEditing, placeholder, onStartEdit, onCommit, onCancel, isDark, T, align = "left" }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (isEditing) setDraft(value); }, [isEditing, value]);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={inputBaseStyle(isDark, T, align)}
      />
    );
  }
  return (
    <div
      onDoubleClick={onStartEdit}
      onClick={onStartEdit}
      style={cellTextStyle(isDark, T, align)}
    >
      {value || <span style={{ color: isDark ? "#4B4B53" : "#BDC1C6" }}>{placeholder || ""}</span>}
    </div>
  );
}

// ─── DateCell ─────────────────────────────────────────────────────────────

function DateCell({ value, isEditing, onStartEdit, onCommit, onCancel, isDark, T }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { if (isEditing) setDraft(value || ""); }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        type="date"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft || null);
          if (e.key === "Escape") onCancel();
        }}
        style={inputBaseStyle(isDark, T)}
      />
    );
  }
  // Mostrar como dd/mm/yyyy
  const display = formatDateDisplay(value);
  return (
    <div
      onClick={onStartEdit}
      style={cellTextStyle(isDark, T)}
    >
      {display || <span style={{ color: isDark ? "#4B4B53" : "#BDC1C6" }}>dd/mm/aaaa</span>}
    </div>
  );
}

function formatDateDisplay(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ─── LinkCell ─────────────────────────────────────────────────────────────

function LinkCell({ value, isEditing, onStartEdit, onCommit, onCancel, isDark, T }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { if (isEditing) setDraft(value || ""); }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim() || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft.trim() || null);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="https://…"
        style={inputBaseStyle(isDark, T)}
      />
    );
  }
  if (!value) {
    return (
      <div
        onClick={onStartEdit}
        style={cellTextStyle(isDark, T)}
      >
        <span style={{ color: isDark ? "#4B4B53" : "#BDC1C6" }}>Inserte link</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 8px", flex: 1, gap: 6, minWidth: 0 }}>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          color: "#1A73E8", fontSize: 12, fontWeight: 500,
          textDecoration: "underline", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
        }}
      >Abrir →</a>
      <button
        onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        title="Editar URL"
        style={{
          background: "transparent", border: "none", color: isDark ? "#9A9A92" : "#5F6368",
          cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0,
        }}
      >✎</button>
    </div>
  );
}

// ─── DropdownCell ─────────────────────────────────────────────────────────

function DropdownCell({ value, options, isEditing, teamSourced, editorById, onStartEdit, onCommit, onCancel, onEditOptions, isDark, T }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => { if (isEditing) setOpen(true); }, [isEditing]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
        onCancel();
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onCancel]);

  const matched = options.find((o) => o.value === value);
  const chipBg = matched?.color || (isDark ? "rgba(255,255,255,0.06)" : "#E8EAED");
  const chipFg = "#202124"; // chip pastel: texto oscuro siempre

  // Display value: para columnas team-sourced (Editor), el value guardado es
  // el UUID del miembro; mostramos su nombre. Si no encontramos la opción
  // matcheada (editor borrado del equipo) mostramos "—".
  const displayValue = teamSourced
    ? (matched?._displayName || editorById?.[value]?.name || (value ? "—" : ""))
    : value;

  const select = (val) => {
    onCommit(val);
    setOpen(false);
  };

  return (
    <div
      ref={triggerRef}
      onClick={() => { onStartEdit(); setOpen(true); }}
      style={{
        flex: 1, padding: "4px 6px", display: "flex", alignItems: "center",
        cursor: "pointer", minWidth: 0, position: "relative",
      }}
    >
      {value ? (
        <span style={{
          padding: "2px 10px", borderRadius: 50,
          background: chipBg,
          color: chipFg,
          fontSize: 11, fontWeight: 600,
          maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{displayValue}</span>
      ) : (
        <span style={{ color: isDark ? "#4B4B53" : "#BDC1C6", fontSize: 12, paddingLeft: 4 }}>
          Seleccionar…
        </span>
      )}
      <span style={{ marginLeft: "auto", color: isDark ? "#6B6B73" : "#9AA0A6", fontSize: 10 }}>▾</span>

      {open && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 2,
            background: isDark ? "#16161E" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#DADCE0"}`,
            borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
            minWidth: 180, maxHeight: 280, overflowY: "auto",
            padding: 4, zIndex: 50,
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: 10, fontSize: 11.5, color: isDark ? "#9A9A92" : "#5F6368", textAlign: "center" }}>
              {teamSourced
                ? "Sin editores en el equipo. Agregalos en la sección Equipo con el rol Editor."
                : "Sin opciones todavía."}
            </div>
          ) : (
            <>
              {value && (
                <div
                  onClick={() => select(null)}
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    fontSize: 11.5, color: isDark ? "#9A9A92" : "#5F6368",
                    cursor: "pointer", fontStyle: "italic",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(127,127,127,0.10)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  Limpiar
                </div>
              )}
              {options.map((opt) => (
                <div
                  key={opt.id || opt.value}
                  onClick={() => select(opt.value)}
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(127,127,127,0.10)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{
                    padding: "2px 10px", borderRadius: 50,
                    background: opt.color || "#E8EAED",
                    color: "#202124",
                    fontSize: 11, fontWeight: 600,
                  }}>{opt._displayName || opt.value}</span>
                </div>
              ))}
            </>
          )}
          {/* Footer con pencil para abrir el editor lateral */}
          {onEditOptions && (
            <div style={{
              marginTop: 4, paddingTop: 6,
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#EBECEC"}`,
              display: "flex", justifyContent: "flex-end",
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onEditOptions();
                  onCancel();
                }}
                title="Editar opciones"
                style={{
                  background: "transparent", border: "none",
                  color: isDark ? "#9A9A92" : "#5F6368",
                  cursor: "pointer", padding: "4px 6px",
                  fontSize: 13,
                }}
              >✏️</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles compartidos ───────────────────────────────────────────────────

function inputBaseStyle(isDark, T, align = "left") {
  return {
    flex: 1, padding: "0 8px", border: "none", outline: `2px solid #1A73E8`,
    background: isDark ? "#0E0E14" : "#FFFFFF",
    color: isDark ? "#E8E8E8" : "#202124",
    fontSize: 12, fontFamily: T.font || '"Inter", sans-serif',
    width: "100%", textAlign: align,
  };
}

function cellTextStyle(isDark, T, align = "left") {
  return {
    flex: 1, padding: "0 8px",
    display: "flex", alignItems: "center", justifyContent: align === "center" ? "center" : "flex-start",
    fontSize: 12, color: isDark ? "#E8E8E8" : "#202124",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    cursor: "text", minWidth: 0,
  };
}
