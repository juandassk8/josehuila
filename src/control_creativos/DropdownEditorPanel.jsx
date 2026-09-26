// Side panel que se desliza desde la derecha — estilo Google Sheets, pero
// sin "Aplicar al rango" ni "Criterios". Solo edición pura de opciones.
//
// Por opción: drag handle (▲▼), swatch de color (abre paleta), nombre
// editable inline, papelera. Footer: "+ Agregar otro elemento" y "Listo".

import { useEffect, useMemo, useState } from "react";
import {
  createColumnOption, updateColumnOption, deleteColumnOption,
} from "./db.js";
import { COLUMNS_BY_KEY, COLOR_PALETTE } from "./columns.js";

export function DropdownEditorPanel({ companyId, columnKey, allOptions, onClose, onChange, isDark, T }) {
  const column = COLUMNS_BY_KEY[columnKey];
  const columnOptions = useMemo(
    () => (allOptions || [])
      .filter((o) => o.column_key === columnKey)
      .sort((a, b) => (a.position || 0) - (b.position || 0)),
    [allOptions, columnKey],
  );

  const [busy, setBusy] = useState(false);
  const [newRowValue, setNewRowValue] = useState("");
  const [newRowColor, setNewRowColor] = useState(COLOR_PALETTE[0]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!column) return null;

  // Acciones individuales por opción.
  const renameOption = async (id, value) => {
    setBusy(true);
    try {
      await updateColumnOption(id, { value: value.trim() });
      await onChange();
    } catch (e) { alert(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const changeColor = async (id, color) => {
    setBusy(true);
    try {
      await updateColumnOption(id, { color });
      await onChange();
    } catch (e) { alert(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const removeOption = async (id) => {
    if (!confirm("¿Eliminar esta opción?")) return;
    setBusy(true);
    try {
      await deleteColumnOption(id);
      await onChange();
    } catch (e) { alert(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const moveOption = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= columnOptions.length) return;
    const a = columnOptions[idx];
    const b = columnOptions[newIdx];
    setBusy(true);
    try {
      // Swap positions.
      await updateColumnOption(a.id, { position: b.position });
      await updateColumnOption(b.id, { position: a.position });
      await onChange();
    } catch (e) { alert(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const addNewRow = async () => {
    const v = newRowValue.trim();
    if (!v) return;
    if (columnOptions.some((o) => o.value.toLowerCase() === v.toLowerCase())) {
      alert("Ya existe una opción con ese nombre.");
      return;
    }
    setBusy(true);
    try {
      const maxPos = columnOptions.reduce((m, o) => Math.max(m, o.position || 0), -1);
      await createColumnOption(companyId, columnKey, {
        value: v, color: newRowColor, position: maxPos + 1,
      });
      setNewRowValue("");
      setNewRowColor(COLOR_PALETTE[0]);
      await onChange();
    } catch (e) { alert(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const bg = isDark ? "#0E0E14" : "#FFFFFF";
  const border = isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid #DADCE0";
  const sectionLabel = isDark ? "#9A9A92" : "#5F6368";

  return (
    <>
      {/* Backdrop semi-transparente */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 10018,
          background: "rgba(0,0,0,0.18)",
        }}
      />
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 380, zIndex: 10020,
          background: bg, color: T.textPrimary,
          borderLeft: border,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.10)",
          display: "flex", flexDirection: "column",
          fontFamily: T.font,
          animation: "slideInRight 220ms ease",
        }}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: border,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: sectionLabel, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Editar opciones
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
              {column.label}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: T.textMuted,
            cursor: "pointer", fontSize: 18, padding: "0 4px",
          }}>×</button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {columnOptions.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
              Sin opciones. Agregá la primera abajo.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {columnOptions.map((opt, idx) => (
                <OptionRow
                  key={opt.id}
                  opt={opt}
                  isFirst={idx === 0}
                  isLast={idx === columnOptions.length - 1}
                  onMoveUp={() => moveOption(idx, -1)}
                  onMoveDown={() => moveOption(idx, 1)}
                  onRename={(v) => renameOption(opt.id, v)}
                  onChangeColor={(c) => changeColor(opt.id, c)}
                  onRemove={() => removeOption(opt.id)}
                  busy={busy}
                  isDark={isDark}
                  T={T}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — add new */}
        <div style={{
          padding: "12px 14px", borderTop: border,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sectionLabel, letterSpacing: "0.1em" }}>
            AGREGAR OTRO ELEMENTO
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ColorSwatchButton value={newRowColor} onChange={setNewRowColor} />
            <input
              value={newRowValue}
              onChange={(e) => setNewRowValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNewRow(); }}
              placeholder="Nombre…"
              style={{
                flex: 1, padding: "7px 10px", borderRadius: 6,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#DADCE0"}`,
                background: isDark ? "rgba(255,255,255,0.02)" : "#FFFFFF",
                color: T.textPrimary, fontSize: 12, fontFamily: T.font,
                outline: "none",
              }}
            />
            <button
              onClick={addNewRow}
              disabled={busy || !newRowValue.trim()}
              style={{
                padding: "7px 14px", borderRadius: 50, border: "none",
                background: "#1D9E75", color: "#FFFFFF",
                fontSize: 11, fontWeight: 700,
                cursor: busy || !newRowValue.trim() ? "not-allowed" : "pointer",
                opacity: busy || !newRowValue.trim() ? 0.5 : 1,
                fontFamily: T.font,
              }}
            >Agregar</button>
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 4,
              padding: "9px 0", borderRadius: 50, border: "none",
              background: isDark ? "#EBEBEB" : "#1A1D1C",
              color: isDark ? "#1A1D1C" : "#FFFFFF",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
            }}
          >Listo</button>
        </div>
      </div>
    </>
  );
}

function OptionRow({ opt, isFirst, isLast, onMoveUp, onMoveDown, onRename, onChangeColor, onRemove, busy, isDark, T }) {
  const [draft, setDraft] = useState(opt.value);
  const [focused, setFocused] = useState(false);

  // Sincronizar draft si la opción cambia desde afuera (rename concurrente, etc).
  useEffect(() => { if (!focused) setDraft(opt.value); }, [opt.value, focused]);

  const commit = () => {
    setFocused(false);
    const v = draft.trim();
    if (v && v !== opt.value) onRename(v);
    else setDraft(opt.value);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 4px", borderRadius: 8,
      background: isDark ? "rgba(255,255,255,0.02)" : "#F8F9FA",
    }}>
      {/* Reorder arrows */}
      <div style={{ display: "flex", flexDirection: "column", marginRight: 2 }}>
        <button
          onClick={onMoveUp} disabled={busy || isFirst}
          title="Subir"
          style={arrowBtn(isDark, isFirst)}
        >▲</button>
        <button
          onClick={onMoveDown} disabled={busy || isLast}
          title="Bajar"
          style={arrowBtn(isDark, isLast)}
        >▼</button>
      </div>

      {/* Color */}
      <ColorSwatchButton value={opt.color} onChange={onChangeColor} />

      {/* Name */}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(opt.value); e.currentTarget.blur(); }
        }}
        style={{
          flex: 1, padding: "7px 10px", borderRadius: 6,
          border: `1px solid ${focused ? "#1A73E8" : (isDark ? "rgba(255,255,255,0.10)" : "#DADCE0")}`,
          background: isDark ? "rgba(255,255,255,0.02)" : "#FFFFFF",
          color: T.textPrimary, fontSize: 12, fontFamily: T.font,
          outline: "none",
        }}
      />

      {/* Delete */}
      <button
        onClick={onRemove}
        disabled={busy}
        title="Eliminar"
        style={{
          background: "transparent", border: "none",
          color: isDark ? "#9A9A92" : "#5F6368",
          cursor: busy ? "not-allowed" : "pointer",
          padding: "6px 6px", fontSize: 13,
        }}
      >🗑</button>
    </div>
  );
}

function arrowBtn(isDark, disabled) {
  return {
    background: "transparent", border: "none",
    color: disabled ? (isDark ? "#3B3B43" : "#DADCE0") : (isDark ? "#9A9A92" : "#5F6368"),
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "1px 4px", fontSize: 8,
    lineHeight: 1,
  };
}

function ColorSwatchButton({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Color"
        style={{
          width: 26, height: 26, borderRadius: 6,
          background: value, border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer", padding: 0, position: "relative",
        }}
      >
        <span style={{
          position: "absolute", bottom: 1, right: 1,
          fontSize: 8, color: "rgba(0,0,0,0.4)",
        }}>▾</span>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
          />
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4,
              background: "#FFFFFF", padding: 6, borderRadius: 8,
              border: "1px solid #DADCE0", boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              zIndex: 51,
            }}
          >
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: c,
                  border: c === value ? "2px solid #1A73E8" : "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer", padding: 0,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
