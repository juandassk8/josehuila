// Control de Creativos — hoja estilo Google Sheets por empresa.
// Tabs en el footer (Entregas), hoja al medio, side panel para editar opciones.

import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import {
  listDeliveries, createDelivery, updateDelivery, deleteDelivery,
  listItems, createItem, createBlankRows, updateItem, deleteItems, bulkUpdateItems,
  listColumnOptions, seedDefaultOptionsIfEmpty,
  listEditorsForCompany,
  createCreativeEditTask, updateCreativeEditTask, deleteCreativeEditTask,
  cleanupAutoAssignedCreativeNumbers,
} from "./db.js";
import { COLUMNS, COLUMNS_BY_KEY, suggestNextCreativeNumber, deliveryLabel } from "./columns.js";
import { SheetView } from "./SheetView.jsx";
import { DeliveryTabs } from "./DeliveryTabs.jsx";
import { DropdownEditorPanel } from "./DropdownEditorPanel.jsx";
import { logger } from "../lib/logger.js";

const INITIAL_BLANK_ROWS = 100;

export function ControlCreativos({ companyId, companyName, isAdmin = false, currentMember = null }) {
  const { isDark } = useTheme();
  const T = DS;

  const [deliveries, setDeliveries] = useState([]);
  const [activeDeliveryId, setActiveDeliveryId] = useState(null);
  const [items, setItems] = useState([]);
  const [columnOptions, setColumnOptions] = useState([]);  // opciones user-managed (sin Editor)
  const [editors, setEditors] = useState([]);              // miembros del equipo con rol "editor"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editingColumnKey, setEditingColumnKey] = useState(null);

  // Widths de columnas — persistidas en localStorage por empresa.
  const colWidthsKey = `control_col_widths_${companyId}`;
  const [colWidths, setColWidths] = useState(() => {
    try {
      const raw = localStorage.getItem(colWidthsKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const setColWidth = (key, width) => {
    setColWidths((prev) => {
      const next = { ...prev, [key]: width };
      try { localStorage.setItem(colWidthsKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const itemsByDeliveryRef = useRef({});

  // ── Merge: opciones user-managed + opciones sintéticas para Editor ─────
  // El dropdown de Editor se construye desde el equipo, NO desde
  // creative_column_options. Inyectamos una entry sintética por cada editor
  // del equipo para que la celda muestre el chip con su color.
  const mergedColumnOptions = useMemo(() => {
    // Filtrar fuera cualquier entry vieja de "editor" en columnOptions (placeholders
    // dummy o data legacy) — el equipo es la única fuente de verdad para Editor.
    const nonEditor = columnOptions.filter((o) => o.column_key !== "editor");
    const editorOpts = editors.map((m, idx) => ({
      id: `__team_editor_${m.id}`,
      company_id: companyId,
      column_key: "editor",
      value: m.id,            // ¡guardamos el UUID del team_member en items.editor!
      color: m.avatar_color || "#D9EAD3",
      position: idx,
      _displayName: m.name,   // shadow para que la chip muestre el nombre
    }));
    return [...nonEditor, ...editorOpts];
  }, [columnOptions, editors, companyId]);

  // Lookup editor por id (para resolver chips de filas existentes).
  const editorById = useMemo(() => {
    const m = {};
    for (const e of editors) m[e.id] = e;
    return m;
  }, [editors]);

  // ── Carga inicial ─────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        await Promise.all(
          COLUMNS.filter((c) => c.type === "dropdown" && !c.teamSourced && c.seed?.length > 0).map((c) =>
            seedDefaultOptionsIfEmpty(companyId, c.key, c.seed),
          ),
        );
        if (!alive) return;

        const [ds, opts, eds] = await Promise.all([
          listDeliveries(companyId),
          listColumnOptions(companyId),
          listEditorsForCompany(companyId),
        ]);
        if (!alive) return;
        setDeliveries(ds);
        setColumnOptions(opts);
        setEditors(eds);

        if (ds.length === 0) {
          const first = await createDelivery(companyId, { name: null });
          // creative_number queda null → la UI muestra placeholder dinámico.
          await createBlankRows(first.id, INITIAL_BLANK_ROWS);
          if (!alive) return;
          setDeliveries([first]);
          setActiveDeliveryId(first.id);
        } else {
          // Default a la última entrega (más reciente por tab_order/created_at).
          // Suponemos que ds ya viene ordenado asc por tab_order — tomamos la cola.
          const latest = ds[ds.length - 1];
          setActiveDeliveryId(latest.id);
        }
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [companyId]);

  // ── Carga items por delivery activo + cleanup + auto-pad ──────────────
  useEffect(() => {
    if (!activeDeliveryId) return;
    let alive = true;
    (async () => {
      try {
        let xs = await listItems(activeDeliveryId);
        if (!alive) return;

        // Cleanup retroactivo: nullear creative_numbers auto-asignados en
        // filas que no tienen otro contenido. Esto restaura el estado
        // "limpio" para que aparezca el placeholder dinámico #001, #002...
        xs = await cleanupAutoAssignedCreativeNumbers(xs);
        if (!alive) return;

        // Auto-pad: si todas las filas están vacías Y son menos que el target,
        // rellenamos a 100. Sin pre-asignar creative_numbers (queda null).
        if (xs.length < INITIAL_BLANK_ROWS) {
          const hasAnyContent = xs.some((i) => isRowDirty(i));
          if (!hasAnyContent) {
            const startOrder = xs.length === 0 ? 0 : Math.max(...xs.map((i) => i.row_order || 0)) + 1;
            const extras = await createBlankRows(activeDeliveryId, INITIAL_BLANK_ROWS - xs.length, startOrder);
            if (!alive) return;
            xs = [...xs, ...extras];
          }
        }

        setItems(xs);
        itemsByDeliveryRef.current[activeDeliveryId] = xs;
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [activeDeliveryId, companyId]);

  // ── Actions: deliveries ───────────────────────────────────────────────
  const onCreateDelivery = async () => {
    try {
      const d = await createDelivery(companyId);
      // Sin startNumber — los placeholders #001, #002... son dinámicos en UI.
      const blanks = await createBlankRows(d.id, INITIAL_BLANK_ROWS);
      setDeliveries((prev) => [...prev, d]);
      setActiveDeliveryId(d.id);
      setItems(blanks);
      itemsByDeliveryRef.current[d.id] = blanks;
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const onRenameDelivery = async (id, name) => {
    try {
      const updated = await updateDelivery(id, { name: (name || "").trim() || null });
      setDeliveries((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const onDeleteDelivery = async (id) => {
    if (deliveries.length <= 1) {
      alert("No podés eliminar la última entrega.");
      return;
    }
    if (!confirm("¿Eliminar esta entrega y todas sus filas? Esta acción no se puede deshacer.")) return;
    try {
      await deleteDelivery(id);
      const next = deliveries.filter((d) => d.id !== id);
      setDeliveries(next);
      if (activeDeliveryId === id) {
        setActiveDeliveryId(next[0]?.id || null);
      }
    } catch (e) { setErr(e?.message || String(e)); }
  };

  // ── Actions: items ────────────────────────────────────────────────────
  const onAddRow = async () => {
    if (!activeDeliveryId) return;
    try {
      const nextNumber = suggestNextCreativeNumber(items);
      const created = await createItem(activeDeliveryId, {
        creative_number: nextNumber || null,
      });
      setItems((prev) => [...prev, created]);
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const onAdd50Rows = async () => {
    if (!activeDeliveryId) return;
    try {
      const startOrder = items.length === 0 ? 0 : Math.max(...items.map((i) => i.row_order || 0)) + 1;
      const created = await createBlankRows(activeDeliveryId, 50, startOrder);
      setItems((prev) => [...prev, ...created]);
    } catch (e) { setErr(e?.message || String(e)); }
  };

  // ── onUpdateCell + auto-sync de tarea (editor + due_date) ─────────────
  const onUpdateCell = async (itemId, columnKey, value) => {
    // Optimistic update.
    setItems((prev) => prev.map((r) => (r.id === itemId ? { ...r, [columnKey]: value } : r)));
    try {
      await updateItem(itemId, { [columnKey]: value });
      // Si la celda tocada afecta la auto-tarea (editor, due_date, creative_number
      // o product), recomputamos el estado de la tarea.
      if (["editor", "due_date", "creative_number", "product", "hook"].includes(columnKey)) {
        // Reconstruir el item con el nuevo valor para sync.
        const item = items.find((r) => r.id === itemId);
        const next = { ...item, [columnKey]: value };
        await syncTaskForItem(next);
      }
    } catch (e) {
      setErr(e?.message || String(e));
      try {
        const xs = await listItems(activeDeliveryId);
        setItems(xs);
      } catch { /* ignore */ }
    }
  };

  const onBulkUpdate = async (itemIds, columnKey, value) => {
    setItems((prev) => prev.map((r) => (itemIds.includes(r.id) ? { ...r, [columnKey]: value } : r)));
    try {
      await bulkUpdateItems(itemIds, { [columnKey]: value });
      // Sync tasks para cada fila afectada si la columna era editor o due_date.
      if (["editor", "due_date", "creative_number", "product", "hook"].includes(columnKey)) {
        for (const id of itemIds) {
          const item = items.find((r) => r.id === id);
          if (!item) continue;
          await syncTaskForItem({ ...item, [columnKey]: value });
        }
      }
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const onDeleteRows = async (itemIds) => {
    if (!itemIds || itemIds.length === 0) return;
    if (!confirm(`¿Eliminar ${itemIds.length} fila${itemIds.length === 1 ? "" : "s"}?`)) return;
    // Borrar tasks asociadas primero.
    for (const id of itemIds) {
      const item = items.find((r) => r.id === id);
      if (item?.task_id) {
        try { await deleteCreativeEditTask(item.task_id); } catch { /* swallow */ }
      }
    }
    setItems((prev) => prev.filter((r) => !itemIds.includes(r.id)));
    try {
      await deleteItems(itemIds);
    } catch (e) { setErr(e?.message || String(e)); }
  };

  // ── Auto-sync de tarea por item ───────────────────────────────────────
  const syncTaskForItem = async (item) => {
    if (!item) return;
    const editorId = item.editor || null;
    const dueDate = item.due_date || null;
    const hasBoth = editorId && dueDate;
    const taskId = item.task_id;

    try {
      if (taskId && !hasBoth) {
        // Editor o fecha fueron limpiados → borrar tarea.
        await deleteCreativeEditTask(taskId);
        await updateItem(item.id, { task_id: null });
        setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, task_id: null } : r)));
        return;
      }
      if (!hasBoth) return;

      const title = buildTaskTitle(item, editorById);
      if (taskId) {
        await updateCreativeEditTask(taskId, { title, dueDate, editorMemberId: editorId });
      } else {
        const newTaskId = await createCreativeEditTask(companyId, {
          title, dueDate, editorMemberId: editorId,
        });
        await updateItem(item.id, { task_id: newTaskId });
        setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, task_id: newTaskId } : r)));
      }
    } catch (e) {
      // Errores de tarea NO deben tirar el banner de error principal porque
      // bloquean el flujo de edición. Log silencioso al console.
      logger.warn("Auto-task sync error:", e);
    }
  };

  // ── Opciones: refetch tras gestionar ──────────────────────────────────
  const reloadColumnOptions = async () => {
    try {
      const opts = await listColumnOptions(companyId);
      setColumnOptions(opts);
    } catch (e) { setErr(e?.message || String(e)); }
  };

  // ── Render ────────────────────────────────────────────────────────────
  const activeDelivery = deliveries.find((d) => d.id === activeDeliveryId);
  const activeLabel = activeDelivery ? deliveryLabel(activeDelivery, items) : "";

  return (
    <div style={{
      // Layout fijo del viewport: header + sheet (scrolleable) + tabs sticky.
      // Usamos height: 100vh para anclar al viewport del browser. Si en el
      // futuro el CompanyWorkspace agrega un top bar, restamos su altura aquí.
      display: "flex", flexDirection: "column",
      height: "100vh",
      width: "100%",
      overflow: "hidden",
      background: isDark ? "#0E0E14" : "#FAFAF9",
      fontFamily: T.font,
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 24px 12px",
        borderBottom: T.border,
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.textPrimary, letterSpacing: "-0.02em" }}>
            Control de Creativos
          </div>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 4 }}>
            {companyName} · {activeLabel || "—"}
          </div>
        </div>
        {activeDeliveryId && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onAddRow} style={ghostBtn(isDark, T)}>+ Fila</button>
            <button onClick={onAdd50Rows} style={ghostBtn(isDark, T)}>+ 50 filas</button>
          </div>
        )}
      </div>

      {err && (
        <div style={{
          padding: "8px 24px", background: "rgba(226,75,74,0.10)",
          color: T.red, fontSize: 12,
        }}>
          ⚠️ {err}
          <button onClick={() => setErr("")} style={{ marginLeft: 12, background: "transparent", border: "none", color: T.red, cursor: "pointer", fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Sheet body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            Cargando…
          </div>
        ) : activeDeliveryId ? (
          <SheetView
            items={items}
            columnOptions={mergedColumnOptions}
            editorById={editorById}
            colWidths={colWidths}
            onColWidthChange={setColWidth}
            onUpdateCell={onUpdateCell}
            onBulkUpdate={onBulkUpdate}
            onDeleteRows={onDeleteRows}
            onEditColumnOptions={(key) => setEditingColumnKey(key)}
            isDark={isDark}
            T={T}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            No hay entregas.
          </div>
        )}
      </div>

      {/* Tabs footer */}
      <DeliveryTabs
        deliveries={deliveries}
        activeDeliveryId={activeDeliveryId}
        getLabel={(d) => deliveryLabel(d, d.id === activeDeliveryId ? items : (itemsByDeliveryRef.current[d.id] || []))}
        onSelect={setActiveDeliveryId}
        onCreate={onCreateDelivery}
        onRename={onRenameDelivery}
        onDelete={onDeleteDelivery}
        isDark={isDark}
        T={T}
      />

      {editingColumnKey && (
        <DropdownEditorPanel
          companyId={companyId}
          columnKey={editingColumnKey}
          allOptions={columnOptions}
          onClose={() => setEditingColumnKey(null)}
          onChange={reloadColumnOptions}
          isDark={isDark}
          T={T}
        />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

// "Dirty" = el user llenó al menos un campo de contenido. Ojo: creative_number
// no cuenta porque lo pre-poblamos automáticamente — si solo está eso, la fila
// sigue siendo "vacía" desde el punto de vista del usuario.
function isRowDirty(item) {
  return !!(
    item.format || item.hook || item.product || item.tipo ||
    item.editor || item.due_date || item.script_url || item.draft_url ||
    item.creatives_url || item.ad_status || item.calidad
  );
}

function buildTaskTitle(item, editorById) {
  const parts = [];
  parts.push(item.creative_number ? `Editar ${item.creative_number}` : "Editar creativo");
  if (item.product) parts.push(item.product);
  if (item.hook) parts.push(`Hook ${item.hook.replace(/^#/, "")}`);
  return parts.join(" · ");
}

function ghostBtn(isDark, T) {
  return {
    padding: "7px 14px", borderRadius: 50,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
    background: "transparent",
    color: T.textPrimary,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
  };
}
