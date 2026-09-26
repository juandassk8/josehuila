import { useEffect, useRef, useState } from "react";

// Texto editable in-place. Se dimensiona al contenido (no abarca el contenedor).
// - Doble click (admin) → entra en edit mode con contentEditable.
// - Enter guarda, Escape cancela, Shift+Enter nueva línea.
// - Mini-toolbar con A- / A+ para ajustar el tamaño de fuente.
export function EditableText({
  value,
  size,
  defaultSize = 24,
  minSize = 12,
  maxSize = 96,
  sizeStep = 4,
  onSave,
  isAdmin = false,
  color = "#1A1D1C",
  fontWeight = 700,
  letterSpacing = "normal",
  fontFamily = "'Inter','DM Sans',sans-serif",
  lineHeight = 1.1,
  placeholder = "Texto",
  textShadow,
}) {
  const [editing, setEditing] = useState(false);
  const [draftSize, setDraftSize] = useState(size || defaultSize);
  const editRef = useRef(null);
  const originalRef = useRef(value || "");

  useEffect(() => {
    if (!editing) setDraftSize(size || defaultSize);
  }, [size, editing, defaultSize]);

  const enterEdit = (e) => {
    if (!isAdmin) return;
    e.stopPropagation();
    originalRef.current = value || "";
    setDraftSize(size || defaultSize);
    setEditing(true);
    setTimeout(() => {
      const el = editRef.current;
      if (el) {
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }, 0);
  };

  const commit = () => {
    const newValue = (editRef.current?.innerText || "").trim();
    const newSize = Math.min(maxSize, Math.max(minSize, draftSize));
    const changed = newValue !== (value || "") || newSize !== (size || defaultSize);
    setEditing(false);
    if (changed && onSave) onSave(newValue, newSize);
  };

  const cancel = () => {
    if (editRef.current) editRef.current.innerText = originalRef.current;
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  const baseTextStyle = {
    fontSize: editing ? draftSize : (size || defaultSize),
    color,
    fontWeight,
    letterSpacing,
    fontFamily,
    lineHeight,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textShadow,
  };

  // inline-block para que el ancho se ajuste al contenido.
  const shell = {
    display: "inline-block",
    position: "relative",
  };

  if (!editing) {
    return (
      <span
        onDoubleClick={enterEdit}
        title={isAdmin ? "Doble click para editar" : undefined}
        style={{
          ...baseTextStyle,
          ...shell,
          cursor: isAdmin ? "text" : "default",
          padding: isAdmin ? "2px 6px" : 0,
          borderRadius: 4,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { if (isAdmin) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
        onMouseLeave={(e) => { if (isAdmin) e.currentTarget.style.background = "transparent"; }}
      >
        {value || (isAdmin ? placeholder : "")}
      </span>
    );
  }

  return (
    <span style={shell}>
      {/* Toolbar flotante sobre el texto */}
      <span style={{
        position: "absolute",
        top: -36,
        left: "50%",
        transform: "translateX(-50%)",
        display: "inline-flex",
        gap: 4,
        background: "#1A1D1C",
        color: "#fff",
        borderRadius: 8,
        padding: "4px 6px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "'Inter',sans-serif",
        zIndex: 10,
        boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDraftSize((s) => Math.max(minSize, s - sizeStep))}
          style={toolbarBtn()}
        >A−</button>
        <span style={{ minWidth: 24, textAlign: "center", color: "#D4D4CE" }}>{draftSize}</span>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDraftSize((s) => Math.min(maxSize, s + sizeStep))}
          style={toolbarBtn()}
        >A+</button>
        <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)", margin: "0 2px" }} />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          style={{ ...toolbarBtn(), background: "#1D9E75" }}
        >✓</button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
          style={toolbarBtn()}
        >×</button>
      </span>
      <span
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onBlur={commit}
        style={{
          ...baseTextStyle,
          display: "inline-block",
          background: "rgba(29,158,117,0.08)",
          border: "2px dashed rgba(29,158,117,0.5)",
          borderRadius: 6,
          padding: "2px 8px",
          outline: "none",
          minWidth: 40,
        }}
      >
        {value}
      </span>
    </span>
  );
}

function toolbarBtn() {
  return {
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
