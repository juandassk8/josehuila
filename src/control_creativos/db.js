import { database } from "../lib/backend.js";

// ─── Deliveries (tabs) ────────────────────────────────────────────────────

export async function listDeliveries(companyId) {
  const { data, error } = await database
    .from("creative_deliveries")
    .select("*")
    .eq("company_id", companyId)
    .order("tab_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDelivery(companyId, { name } = {}) {
  // Calculamos delivery_number = max + 1 y tab_order = max + 1.
  const existing = await listDeliveries(companyId);
  const nextNumber =
    existing.length === 0 ? 1 : Math.max(...existing.map((d) => d.delivery_number || 0)) + 1;
  const nextTabOrder =
    existing.length === 0 ? 0 : Math.max(...existing.map((d) => d.tab_order || 0)) + 1;

  const { data, error } = await database
    .from("creative_deliveries")
    .insert({
      company_id: companyId,
      delivery_number: nextNumber,
      name: name || null,
      tab_order: nextTabOrder,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateDelivery(deliveryId, patch) {
  const { data, error } = await database
    .from("creative_deliveries")
    .update(patch)
    .eq("id", deliveryId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDelivery(deliveryId) {
  const { error } = await database
    .from("creative_deliveries")
    .delete()
    .eq("id", deliveryId);
  if (error) throw error;
}

// ─── Items (filas) ────────────────────────────────────────────────────────

export async function listItems(deliveryId) {
  const { data, error } = await database
    .from("creative_items")
    .select("*")
    .eq("delivery_id", deliveryId)
    .order("row_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createItem(deliveryId, patch = {}) {
  // El nuevo va al final.
  const items = await listItems(deliveryId);
  const nextOrder =
    items.length === 0 ? 0 : Math.max(...items.map((i) => i.row_order || 0)) + 1;
  const { data, error } = await database
    .from("creative_items")
    .insert({ delivery_id: deliveryId, row_order: nextOrder, ...patch })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Crear N filas en blanco — usado para pre-poblar entregas nuevas. Si se
// pasa startNumber, las filas reciben creative_number secuencial
// "#001", "#002", ... a partir de ese valor.
export async function createBlankRows(deliveryId, count, startOrder = 0, startNumber = null) {
  if (!count || count <= 0) return [];
  const rows = Array.from({ length: count }, (_, i) => ({
    delivery_id: deliveryId,
    row_order: startOrder + i,
    creative_number:
      startNumber != null ? `#${String(startNumber + i).padStart(3, "0")}` : null,
  }));
  const { data, error } = await database
    .from("creative_items")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return data || [];
}

// Devuelve el próximo creative_number a usar en esta empresa: max global + 1.
// Si no hay ninguno asignado todavía, arranca en 1.
export async function getNextCreativeNumberForCompany(companyId) {
  // Buscar todas las entregas de la empresa.
  const { data: ds, error: dErr } = await database
    .from("creative_deliveries")
    .select("id")
    .eq("company_id", companyId);
  if (dErr) throw dErr;
  if (!ds || ds.length === 0) return 1;

  const ids = ds.map((d) => d.id);
  const { data, error } = await database
    .from("creative_items")
    .select("creative_number")
    .in("delivery_id", ids);
  if (error) throw error;

  const nums = (data || [])
    .map((r) => {
      const m = String(r.creative_number || "").match(/^#?(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n != null);

  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

// Cleanup retroactivo: cualquier fila CUYO creative_number sigue un patrón
// "#NNN" Y la fila NO tiene contenido en ninguna otra columna se considera
// "auto-asignada por el sistema viejo" y se limpia (null). Devuelve el array
// actualizado. Esto deja solo los números que el user realmente tipeó.
export async function cleanupAutoAssignedCreativeNumbers(items) {
  const toClean = (items || []).filter((i) => {
    if (!i.creative_number) return false;
    if (!/^#\d{1,5}$/.test(String(i.creative_number).trim())) return false;
    // Otras columnas dirty? Si sí, respetamos el número (el user lo tipeó).
    const hasOther = !!(
      i.format || i.hook || i.product || i.tipo || i.editor || i.due_date ||
      i.script_url || i.draft_url || i.creatives_url || i.ad_status || i.calidad
    );
    return !hasOther;
  });

  if (toClean.length === 0) return items;

  const toCleanIds = new Set(toClean.map((i) => i.id));
  await Promise.all(
    Array.from(toCleanIds).map((id) =>
      database.from("creative_items").update({ creative_number: null }).eq("id", id),
    ),
  );

  return items.map((i) => (toCleanIds.has(i.id) ? { ...i, creative_number: null } : i));
}

// Backfill: asigna creative_numbers secuenciales a filas que tienen null.
// `items` se ordena por row_order. Devuelve el array actualizado.
// (Mantenido para futuro uso; ya no se llama del flujo principal.)
export async function backfillCreativeNumbers(items, startNumber) {
  const toUpdate = (items || [])
    .filter((i) => !i.creative_number)
    .sort((a, b) => (a.row_order || 0) - (b.row_order || 0));
  if (toUpdate.length === 0) return items;

  const updMap = new Map();
  let n = startNumber;
  for (const item of toUpdate) {
    updMap.set(item.id, `#${String(n).padStart(3, "0")}`);
    n++;
  }

  await Promise.all(
    Array.from(updMap.entries()).map(([id, value]) =>
      database.from("creative_items").update({ creative_number: value }).eq("id", id),
    ),
  );

  return items.map((i) => (updMap.has(i.id) ? { ...i, creative_number: updMap.get(i.id) } : i));
}

// ─── Team members (Editor dropdown sourcing) ──────────────────────────────
// Devuelve los miembros del equipo de una empresa que tienen el rol "editor".
// Estos pueblan el dropdown de la columna Editor (no es user-managed: se
// gestiona desde la sección Equipo).
export async function listEditorsForCompany(companyId) {
  const { data, error } = await database
    .from("company_team_members")
    .select("id, name, avatar_color, roles")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).filter((m) => Array.isArray(m.roles) && m.roles.includes("editor"));
}

// ─── Auto-task creation ──────────────────────────────────────────────────
// Cuando un creative_item tiene editor + due_date ambos llenos, creamos una
// tarea en company_tasks asignada a ese editor. Persistimos el task_id en el
// row para poder updatear/borrar la tarea si el user cambia el editor o la
// fecha más tarde.

export async function createCreativeEditTask(companyId, { title, dueDate, editorMemberId }) {
  const { data: task, error } = await database
    .from("company_tasks")
    .insert({
      company_id: companyId,
      title,
      due_date: dueDate,
      status: "pendiente",
      priority: "normal",
    })
    .select("id")
    .single();
  if (error) throw error;
  if (editorMemberId) {
    const { error: aErr } = await database
      .from("company_task_assignees")
      .insert({ task_id: task.id, member_id: editorMemberId });
    if (aErr) throw aErr;
  }
  return task.id;
}

export async function updateCreativeEditTask(taskId, { title, dueDate, editorMemberId }) {
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (dueDate !== undefined) patch.due_date = dueDate;
  if (Object.keys(patch).length > 0) {
    const { error } = await database.from("company_tasks").update(patch).eq("id", taskId);
    if (error) throw error;
  }
  // Reemplazar el assignee (más simple que diffear).
  if (editorMemberId !== undefined) {
    await database.from("company_task_assignees").delete().eq("task_id", taskId);
    if (editorMemberId) {
      await database.from("company_task_assignees").insert({ task_id: taskId, member_id: editorMemberId });
    }
  }
}

export async function deleteCreativeEditTask(taskId) {
  // Borra task y cascadas (assignees) — el ON DELETE CASCADE en el schema se encarga.
  const { error } = await database.from("company_tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function updateItem(itemId, patch) {
  const { data, error } = await database
    .from("creative_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  const { error } = await database
    .from("creative_items")
    .delete()
    .in("id", itemIds);
  if (error) throw error;
}

// Bulk: aplicar el mismo patch a múltiples filas (para multi-select).
export async function bulkUpdateItems(itemIds, patch) {
  if (!itemIds || itemIds.length === 0) return;
  const { error } = await database
    .from("creative_items")
    .update(patch)
    .in("id", itemIds);
  if (error) throw error;
}

// ─── Column options (dropdowns por empresa) ───────────────────────────────

export async function listColumnOptions(companyId) {
  const { data, error } = await database
    .from("creative_column_options")
    .select("*")
    .eq("company_id", companyId)
    .order("column_key", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createColumnOption(companyId, columnKey, { value, color, position }) {
  const { data, error } = await database
    .from("creative_column_options")
    .insert({
      company_id: companyId,
      column_key: columnKey,
      value: value.trim(),
      color: color || "#E8EAED",
      position: position ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateColumnOption(optionId, patch) {
  const { data, error } = await database
    .from("creative_column_options")
    .update(patch)
    .eq("id", optionId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteColumnOption(optionId) {
  const { error } = await database
    .from("creative_column_options")
    .delete()
    .eq("id", optionId);
  if (error) throw error;
}

// Seed: si una columna no tiene opciones, sembramos los defaults. Doblemente
// idempotente:
//   1) check empty first  → no re-sembramos si el user borró opciones a propósito.
//   2) upsert ignoreDuplicates → soporta llamadas concurrentes (React StrictMode
//      ejecuta el effect dos veces y el chequeo "empty" puede dar empty en ambos
//      antes que el primer INSERT complete — sin ignoreDuplicates la segunda
//      llamada explota con `duplicate key violates unique constraint`).
export async function seedDefaultOptionsIfEmpty(companyId, columnKey, defaults) {
  const existing = await database
    .from("creative_column_options")
    .select("id")
    .eq("company_id", companyId)
    .eq("column_key", columnKey)
    .limit(1);
  if (existing.error) throw existing.error;
  if (existing.data && existing.data.length > 0) return;

  const rows = defaults.map((opt, idx) => ({
    company_id: companyId,
    column_key: columnKey,
    value: opt.value,
    color: opt.color || "#E8EAED",
    position: idx,
  }));
  if (rows.length === 0) return;
  const { error } = await database
    .from("creative_column_options")
    .upsert(rows, { onConflict: "company_id,column_key,value", ignoreDuplicates: true });
  if (error) throw error;
}
