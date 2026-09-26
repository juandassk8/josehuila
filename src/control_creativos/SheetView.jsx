// SheetView — la hoja estilo Google Sheets.
// - Letras de columna arriba (A, B, C, ...)
// - Row numbers a la izquierda
// - Header azul tipo Sheets
// - Gridlines, hover row, multi-select (click, Shift+click, Cmd+click)
// - Celdas tipadas: text / dropdown / date / link
// - Resize de columnas con drag handle en el borde derecho del header
// - Bulk edit para TODOS los tipos de columna desde la toolbar arriba
// - Atajos: Del → eliminar filas seleccionadas, Esc → deseleccionar, Cmd+A → todo

import { useEffect, useMemo, useRef, useState } from "react";
import { COLUMNS, COLUMN_LETTERS } from "./columns.js";
import { Cell } from "./Cell.jsx";

const SHEETS_HEADER_BG = "#1F4E79";
const SHEETS_HEADER_TEXT = "#FFFFFF";
const SHEETS_GRIDLINE = "#D0D7DE";
const SHEETS_GRIDLINE_DARK = "rgba(255,255,255,0.08)";
const SHEETS_ROW_HOVER = "rgba(31, 78, 121, 0.05)";
const SHEETS_ROW_SELECTED = "rgba(31, 78, 121, 0.16)";
const SHEETS_ROW_NUMBERS_BG = "#F8F9FA";
const SHEETS_ROW_NUMBERS_BG_DARK = "#16161E";

const ROW_HEIGHT = 32;
const ROW_NUMBER_WIDTH = 44;
const HEADER_HEIGHT = 28;
const COL_HEADER_HEIGHT = 36;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 600;

export function SheetView({
  items,
  columnOptions,
  editorById,            // { [memberId]: { id, name, avatar_color } } — para resolver chips de Editor
  colWidths,             // { [columnKey]: number } — override de widths del user
  onColWidthChange,      // (columnKey, newWidth) => void
  onUpdateCell,
  onBulkUpdate,
  onDeleteRows,
  onEditColumnOptions,   // (columnKey) => void  — abre el side panel editor
  isDark,
  T,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [editing, setEditing] = useState(null);
  // Última celda editada — fuente para Cmd+C. Se actualiza en cada commit
  // de Cell. Permanece marcada visualmente con borde verde claro.
  const [lastEditedCell, setLastEditedCell] = useState(null);
  // Lo que está "en el clipboard" después de un Cmd+C.
  const [copySource, setCopySource] = useState(null);
  // Toasts efímeros de feedback de copy/paste.
  const [toast, setToast] = useState("");
  const sheetRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(""), 1400);
  };

  // Opciones por columna (map key → [{ value, color }]).
  const optionsByColumn = useMemo(() => {
    const m = {};
    for (const opt of columnOptions || []) {
      (m[opt.column_key] ||= []).push(opt);
    }
    // Ordenar por position dentro de cada columna.
    for (const key in m) {
      m[key].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    return m;
  }, [columnOptions]);

  // ¿Alguna fila tiene creative_number tipeado? Si sí, ocultamos los
  // placeholders dinámicos #001/#002/... en las filas vacías.
  const anyCreativeNumberStored = useMemo(
    () => items.some((i) => i.creative_number && String(i.creative_number).trim()),
    [items],
  );

  // Selecciona todas las filas (helper para click en letra de columna).
  const selectAllRows = () => setSelectedIds(new Set(items.map((i) => i.id)));

  // Resolver width efectivo de cada columna (override > default).
  const widthFor = (col) => (colWidths?.[col.key] ?? col.width);

  // ── Atajos teclado ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isInput) return;

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setEditing(null);
        setCopySource(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        onDeleteRows(Array.from(selectedIds));
        setSelectedIds(new Set());
      }
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelectedIds(new Set(items.map((i) => i.id)));
      }
      // ── Copy (Cmd/Ctrl + C) ──
      if ((e.key === "c" || e.key === "C") && (e.metaKey || e.ctrlKey) && lastEditedCell) {
        const item = items.find((i) => i.id === lastEditedCell.rowId);
        if (!item) return;
        const value = item[lastEditedCell.columnKey];
        if (value == null) return;
        e.preventDefault();
        setCopySource({ columnKey: lastEditedCell.columnKey, value });
        // Best-effort: además al clipboard nativo (por si quiere pegar afuera).
        try { navigator.clipboard?.writeText(String(value)); } catch {}
        showToast(`Copiado: ${String(value).slice(0, 30)}${String(value).length > 30 ? "…" : ""}`);
      }
      // ── Paste (Cmd/Ctrl + V) ──
      if ((e.key === "v" || e.key === "V") && (e.metaKey || e.ctrlKey) && copySource && selectedIds.size > 0) {
        e.preventDefault();
        onBulkUpdate(Array.from(selectedIds), copySource.columnKey, copySource.value);
        showToast(`Pegado en ${selectedIds.size} fila${selectedIds.size === 1 ? "" : "s"}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedIds, lastEditedCell, copySource, onDeleteRows, onBulkUpdate]);

  // ── Selección de filas ────────────────────────────────────────────────
  const handleRowNumberClick = (e, idx, itemId) => {
    e.preventDefault();
    setEditing(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelectedIdx != null) {
        const [from, to] = lastSelectedIdx < idx ? [lastSelectedIdx, idx] : [idx, lastSelectedIdx];
        for (let i = from; i <= to; i++) {
          if (items[i]) next.add(items[i].id);
        }
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
      } else {
        if (next.size === 1 && next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.clear();
          next.add(itemId);
        }
      }
      return next;
    });
    setLastSelectedIdx(idx);
  };

  const gridline = isDark ? SHEETS_GRIDLINE_DARK : SHEETS_GRIDLINE;
  const rowNumberBg = isDark ? SHEETS_ROW_NUMBERS_BG_DARK : SHEETS_ROW_NUMBERS_BG;
  const totalWidth = ROW_NUMBER_WIDTH + COLUMNS.reduce((s, c) => s + widthFor(c), 0);

  return (
    <div ref={sheetRef} style={{
      position: "relative",
      fontFamily: '"Inter", "Helvetica Neue", sans-serif',
      fontSize: 12,
      color: isDark ? "#E8E8E8" : "#202124",
      userSelect: "none",
      minWidth: totalWidth,
    }}>
      {(selectedIds.size > 0 || copySource) && (
        <BulkToolbar
          count={selectedIds.size}
          totalRows={items.length}
          selectedIds={Array.from(selectedIds)}
          optionsByColumn={optionsByColumn}
          copySource={copySource}
          onPasteFromCopy={() => {
            if (!copySource) return;
            const targets = selectedIds.size > 0 ? Array.from(selectedIds) : items.map((i) => i.id);
            onBulkUpdate(targets, copySource.columnKey, copySource.value);
            showToast(`Pegado en ${targets.length} fila${targets.length === 1 ? "" : "s"}`);
          }}
          onPasteAllColumn={() => {
            if (!copySource) return;
            const targets = items.map((i) => i.id);
            onBulkUpdate(targets, copySource.columnKey, copySource.value);
            showToast(`Pegado en TODA la columna (${targets.length} filas)`);
          }}
          onClearCopy={() => setCopySource(null)}
          onBulkUpdate={onBulkUpdate}
          onDelete={() => { onDeleteRows(Array.from(selectedIds)); setSelectedIds(new Set()); }}
          onClear={() => setSelectedIds(new Set())}
          isDark={isDark}
          T={T}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
          background: "#1F4E79", color: "#FFFFFF",
          padding: "8px 16px", borderRadius: 50,
          fontSize: 12, fontWeight: 600, fontFamily: T.font,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          zIndex: 10, pointerEvents: "none",
        }}>{toast}</div>
      )}

      {/* ROW: letras de columna */}
      <div style={{
        position: "sticky", top: 0, zIndex: 4,
        display: "flex", height: HEADER_HEIGHT,
        background: isDark ? "#0E0E14" : "#F1F3F4",
        borderBottom: `1px solid ${gridline}`,
      }}>
        <div style={{
          width: ROW_NUMBER_WIDTH, flexShrink: 0,
          borderRight: `1px solid ${gridline}`,
          background: isDark ? "#0E0E14" : "#E8EAED",
        }} />
        {COLUMNS.map((col, i) => (
          <div
            key={col.key}
            onClick={selectAllRows}
            title="Click para seleccionar todas las filas de esta columna"
            style={{
              width: widthFor(col), flexShrink: 0,
              borderRight: `1px solid ${gridline}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 600,
              color: isDark ? "#9A9A92" : "#5F6368",
              letterSpacing: "0.04em",
              cursor: "pointer",
              userSelect: "none",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >{COLUMN_LETTERS[i] || "?"}</div>
        ))}
      </div>

      {/* ROW: header de columnas con label */}
      <div style={{
        position: "sticky", top: HEADER_HEIGHT, zIndex: 4,
        display: "flex", height: COL_HEADER_HEIGHT,
        background: SHEETS_HEADER_BG,
        color: SHEETS_HEADER_TEXT,
        borderBottom: `2px solid ${SHEETS_HEADER_BG}`,
      }}>
        <div style={{
          width: ROW_NUMBER_WIDTH, flexShrink: 0,
          borderRight: `1px solid rgba(255,255,255,0.15)`,
          background: SHEETS_HEADER_BG,
        }} />
        {COLUMNS.map((col) => (
          <ColumnHeader
            key={col.key}
            col={col}
            width={widthFor(col)}
            onEditOptions={col.type === "dropdown" && !col.teamSourced ? () => onEditColumnOptions(col.key) : null}
            onResize={(delta) => onColWidthChange(col.key, Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, widthFor(col) + delta)))}
          />
        ))}
      </div>

      {/* ROWS */}
      {items.length === 0 ? (
        <div style={{
          padding: "60px 24px", textAlign: "center",
          color: isDark ? "#9A9A92" : "#5F6368",
          fontSize: 13,
        }}>
          No hay filas todavía. Click en "+ Nueva fila" arriba.
        </div>
      ) : (
        items.map((item, idx) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <SheetRow
              key={item.id}
              item={item}
              idx={idx}
              isSelected={isSelected}
              optionsByColumn={optionsByColumn}
              editorById={editorById}
              anyCreativeNumberStored={anyCreativeNumberStored}
              onSelect={(e) => handleRowNumberClick(e, idx, item.id)}
              onUpdateCell={onUpdateCell}
              onEditColumnOptions={onEditColumnOptions}
              editing={editing}
              setEditing={setEditing}
              setLastEditedCell={setLastEditedCell}
              lastEditedCell={lastEditedCell}
              copySource={copySource}
              gridline={gridline}
              rowNumberBg={rowNumberBg}
              widthFor={widthFor}
              isDark={isDark}
              T={T}
            />
          );
        })
      )}
    </div>
  );
}

// ── ColumnHeader con resize handle ───────────────────────────────────────

function ColumnHeader({ col, width, onEditOptions, onResize }) {
  const [resizing, setResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const delta = e.clientX - startXRef.current;
      onResize(delta);
      startXRef.current = e.clientX;
    };
    const onUp = () => setResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing, onResize]);

  return (
    <div
      style={{
        width, flexShrink: 0,
        padding: "0 10px",
        display: "flex", alignItems: "center",
        borderRight: `1px solid rgba(255,255,255,0.15)`,
        fontSize: 12, fontWeight: 700,
        position: "relative",
      }}>
      <span style={{
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        cursor: onEditOptions ? "pointer" : "default",
      }}
        onClick={() => onEditOptions?.()}
        title={onEditOptions ? "Click para editar opciones" : col.label}
      >
        {col.label}
      </span>
      {onEditOptions && (
        <button
          onClick={(e) => { e.stopPropagation(); onEditOptions(); }}
          title="Editar opciones"
          style={{
            background: "transparent", border: "none",
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
            padding: "2px 4px", fontSize: 11,
          }}
        >▾</button>
      )}
      {/* Resize handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startXRef.current = e.clientX;
          startWidthRef.current = width;
          setResizing(true);
        }}
        title="Arrastrar para redimensionar"
        style={{
          position: "absolute", top: 0, right: -3, bottom: 0,
          width: 6, cursor: "col-resize",
          background: resizing ? "rgba(255,255,255,0.4)" : "transparent",
          zIndex: 2,
        }}
        onMouseEnter={(e) => { if (!resizing) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
        onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.background = "transparent"; }}
      />
    </div>
  );
}

function SheetRow({
  item, idx, isSelected, optionsByColumn, editorById, anyCreativeNumberStored,
  onSelect, onUpdateCell, onEditColumnOptions,
  editing, setEditing, setLastEditedCell, lastEditedCell, copySource,
  gridline, rowNumberBg, widthFor, isDark, T,
}) {
  const [hovering, setHovering] = useState(false);
  const rowBg = isSelected ? SHEETS_ROW_SELECTED : hovering ? SHEETS_ROW_HOVER : "transparent";

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: "flex", height: ROW_HEIGHT,
        background: rowBg,
        borderBottom: `1px solid ${gridline}`,
      }}
    >
      <div
        onMouseDown={onSelect}
        style={{
          width: ROW_NUMBER_WIDTH, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isSelected ? "#1F4E79" : rowNumberBg,
          color: isSelected ? "#FFFFFF" : (isDark ? "#9A9A92" : "#5F6368"),
          fontSize: 11, fontWeight: 500,
          borderRight: `1px solid ${gridline}`,
          cursor: "pointer",
        }}
      >
        {idx + 1}
      </div>
      {COLUMNS.map((col) => {
        const isEditing = editing?.rowId === item.id && editing?.columnKey === col.key;
        const isLastEdited = lastEditedCell?.rowId === item.id && lastEditedCell?.columnKey === col.key;
        return (
          <div key={col.key} style={{
            width: widthFor(col), flexShrink: 0,
            borderRight: `1px solid ${gridline}`,
            display: "flex", alignItems: "stretch",
            position: "relative",
            // Borde sutil para indicar la "celda fuente" del copy.
            boxShadow: isLastEdited && copySource && copySource.columnKey === col.key
              ? "inset 0 0 0 2px #1D9E75"
              : isLastEdited
                ? "inset 0 0 0 1px rgba(29,158,117,0.45)"
                : "none",
          }}>
            <Cell
              item={item}
              column={col}
              options={optionsByColumn[col.key] || []}
              editorById={editorById}
              rowIndex={idx}
              anyCreativeNumberStored={anyCreativeNumberStored}
              isEditing={isEditing}
              onStartEdit={() => setEditing({ rowId: item.id, columnKey: col.key })}
              onCommit={(value) => {
                onUpdateCell(item.id, col.key, value);
                setEditing(null);
                // Marcamos esta celda como "última editada" para Cmd+C.
                setLastEditedCell({ rowId: item.id, columnKey: col.key });
              }}
              onCancel={() => setEditing(null)}
              onEditOptions={col.type === "dropdown" && !col.teamSourced ? () => onEditColumnOptions(col.key) : null}
              isDark={isDark}
              T={T}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── BulkToolbar — soporta TODOS los tipos de columna ────────────────────

function BulkToolbar({
  count, totalRows, selectedIds, optionsByColumn, copySource,
  onPasteFromCopy, onPasteAllColumn, onClearCopy,
  onBulkUpdate, onDelete, onClear, isDark, T,
}) {
  const [columnKey, setColumnKey] = useState("");
  const [value, setValue] = useState("");

  const selectedCol = COLUMNS.find((c) => c.key === columnKey);
  const copyCol = copySource ? COLUMNS.find((c) => c.key === copySource.columnKey) : null;
  const hasSelection = count > 0;

  const apply = () => {
    if (!columnKey) return;
    // Para text/link/date, value puede ser string vacío (significa borrar).
    // Para dropdown, requerimos elección válida.
    if (selectedCol?.type === "dropdown" && !value) return;
    const payloadValue = value === "" ? null : value;
    onBulkUpdate(selectedIds, columnKey, payloadValue);
    setColumnKey(""); setValue("");
  };

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 5,
      background: isDark ? "#16161E" : "#202124",
      color: "#FFFFFF",
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "8px 16px",
      fontFamily: T.font, fontSize: 12,
    }}>
      {hasSelection && (
        <span style={{ fontWeight: 700 }}>{count} fila{count === 1 ? "" : "s"}</span>
      )}
      {!hasSelection && copySource && (
        <span style={{ opacity: 0.7 }}>
          Copiado <strong style={{ color: "#FFF" }}>{copyCol?.label || copySource.columnKey}</strong>: "{String(copySource.value).slice(0, 30)}"
        </span>
      )}

      {copySource && hasSelection && (
        <button
          onClick={onPasteFromCopy}
          title={`Pegar "${String(copySource.value).slice(0, 40)}" en columna ${copyCol?.label || copySource.columnKey}`}
          style={{
            background: "#1D9E75", color: "#FFFFFF", border: "none",
            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: T.font,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          📋 Pegar en {count} fila{count === 1 ? "" : "s"} <span style={{ opacity: 0.7, fontWeight: 500 }}>({copyCol?.label || "?"})</span>
        </button>
      )}
      {copySource && (
        <button
          onClick={onPasteAllColumn}
          title={`Pegar en TODA la columna ${copyCol?.label || ""} (${totalRows || 0} filas)`}
          style={{
            background: "transparent", color: "#FFFFFF",
            border: "1px solid rgba(255,255,255,0.4)",
            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: T.font,
          }}
        >
          📋 Pegar en TODA la columna
        </button>
      )}
      {copySource && (
        <button
          onClick={onClearCopy}
          title="Cancelar copia (Esc)"
          style={{
            background: "transparent", color: "#FFFFFF", border: "none",
            cursor: "pointer", fontSize: 14, padding: "0 4px",
            opacity: 0.7,
          }}
        >✕ copia</button>
      )}

      <span style={{ flex: 1 }} />

      {hasSelection && (
      <>
      <span style={{ opacity: 0.7 }}>Pegar mismo valor en columna</span>
      <select
        value={columnKey}
        onChange={(e) => { setColumnKey(e.target.value); setValue(""); }}
        style={selectStyle}
      >
        <option value="">elegir…</option>
        {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>

      {/* Input dinámico según tipo */}
      {selectedCol?.type === "dropdown" && (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={selectStyle}>
          <option value="">valor…</option>
          {(optionsByColumn[columnKey] || []).map((o) => (
            <option key={o.value} value={o.value}>{o.value}</option>
          ))}
        </select>
      )}
      {selectedCol?.type === "date" && (
        <input
          type="date"
          value={value} onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
      )}
      {selectedCol?.type === "link" && (
        <input
          type="url" placeholder="https://…"
          value={value} onChange={(e) => setValue(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
      )}
      {selectedCol?.type === "text" && (
        <input
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="texto…"
          style={{ ...inputStyle, width: 140 }}
        />
      )}

      <button
        onClick={apply}
        disabled={!columnKey || (selectedCol?.type === "dropdown" && !value)}
        style={{
          background: "#1D9E75", color: "#FFFFFF", border: "none",
          padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700,
          cursor: !columnKey ? "not-allowed" : "pointer",
          opacity: !columnKey ? 0.5 : 1, fontFamily: T.font,
        }}
      >Pegar</button>

      <span style={{ width: 12 }} />
      <button onClick={onDelete} style={{
        background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.3)",
        padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: T.font,
      }}>🗑 Eliminar</button>
      <button onClick={onClear} title="Deseleccionar (Esc)" style={{
        background: "transparent", color: "#FFFFFF", border: "none",
        cursor: "pointer", fontSize: 16, padding: "0 4px",
      }}>×</button>
      </>
      )}
    </div>
  );
}

const selectStyle = {
  background: "rgba(255,255,255,0.10)",
  color: "#FFFFFF",
  border: "1px solid rgba(255,255,255,0.20)",
  padding: "4px 8px", borderRadius: 4, fontSize: 12,
};
const inputStyle = {
  background: "rgba(255,255,255,0.10)",
  color: "#FFFFFF",
  border: "1px solid rgba(255,255,255,0.20)",
  padding: "4px 8px", borderRadius: 4, fontSize: 12,
  outline: "none",
};
