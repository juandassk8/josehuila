// Wrappers Supabase del time tracker. Todos retornan { data, error }
// (mismo shape que src/team/data/db.js).

import { database } from "../../../lib/backend.js";
import { logger } from "../../../lib/logger.js";

// ---- Categorías ----

export async function listCategories(ownerId) {
  return database
    .from("time_tracker_categories")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("archived", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function createCategory(ownerId, payload) {
  return database
    .from("time_tracker_categories")
    .insert({
      owner_id: ownerId,
      name: payload.name,
      color: payload.color || "#378ADD",
      icon: payload.icon || "⏱",
      sort_order: payload.sort_order ?? 999,
    })
    .select()
    .single();
}

export async function updateCategory(id, patch) {
  return database
    .from("time_tracker_categories")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
}

export async function archiveCategory(id) {
  return database
    .from("time_tracker_categories")
    .update({ archived: true })
    .eq("id", id);
}

// Reordena un set de categorías de forma transaccional (paralelo).
export async function reorderCategories(ordered) {
  return Promise.all(
    ordered.map((c, i) =>
      database
        .from("time_tracker_categories")
        .update({ sort_order: (i + 1) * 10 })
        .eq("id", c.id)
    )
  );
}

// ---- Sesiones ----

// Carga sesiones del usuario que tocan el rango [from, to). Incluye
// activas (ended_at null) si su started_at es anterior a `to`.
export async function listSessions(ownerId, fromIso, toIso) {
  let q = database
    .from("time_tracker_sessions")
    .select("*")
    .eq("owner_id", ownerId)
    .order("started_at", { ascending: false });
  if (toIso) q = q.lt("started_at", toIso);
  // Filtramos by ended_at >= fromIso o (ended_at null y started_at < toIso).
  // PostgREST: usamos `.or` con condicional explícito.
  if (fromIso) {
    q = q.or(`ended_at.gte.${fromIso},ended_at.is.null`);
  }
  return q;
}

export async function getActiveSession(ownerId) {
  return database
    .from("time_tracker_sessions")
    .select("*")
    .eq("owner_id", ownerId)
    .is("ended_at", null)
    .maybeSingle();
}

// opts: { spaceId, note, taskId, taskKind, taskLabel } — todos opcionales.
//   spaceId: el space al que pertenece esta sesion (root o subspace).
//   taskKind: 'personal' (tasks team) | 'company' (company_tasks) | null.
//   taskLabel: snapshot del titulo al momento (sobrevive rename/delete).
//
// Nota: category_id queda nulo en sesiones nuevas (la columna sigue existiendo
// pero solo se usa para backward-compat con sesiones legacy creadas antes
// del refactor de spaces).
export async function startSession(ownerId, opts = {}) {
  return database
    .from("time_tracker_sessions")
    .insert({
      owner_id: ownerId,
      category_id: null,
      space_id: opts.spaceId || null,
      note: opts.note || null,
      task_id: opts.taskId || null,
      task_kind: opts.taskKind || null,
      task_label: opts.taskLabel || null,
    })
    .select()
    .single();
}

export async function endSession(sessionId, endedAt = null) {
  return database
    .from("time_tracker_sessions")
    .update({ ended_at: endedAt || new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();
}

export async function endActiveSession(ownerId, endedAt = null) {
  return database
    .from("time_tracker_sessions")
    .update({ ended_at: endedAt || new Date().toISOString() })
    .eq("owner_id", ownerId)
    .is("ended_at", null);
}

// Atomicidad: cierra la activa actual y abre una nueva, en una sola tx.
// opts: { spaceId, taskId, taskKind, taskLabel } — todos opcionales.
export async function switchSession(ownerId, opts = {}) {
  return database.rpc("switch_time_session", {
    p_owner: ownerId,
    p_space: opts.spaceId || null,
    p_task_id: opts.taskId || null,
    p_task_kind: opts.taskKind || null,
    p_task_label: opts.taskLabel || null,
  });
}

export async function updateSession(id, patch) {
  return database
    .from("time_tracker_sessions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
}

export async function deleteSession(id) {
  return database.from("time_tracker_sessions").delete().eq("id", id);
}

// ---- Tareas para el picker del time tracker ----

// Lista tareas abiertas (no completadas, no archivadas, no en papelera) para
// alimentar el TaskPicker del time tracker.
//
// opts.scope:
//   'all'  → TODAS las tareas abiertas del sistema (default — usado por admin).
//   'mine' → sólo las que el miembro tiene asignadas.
//
// Retorna: [{ id, kind, title, due_date, scope_label, assigned }]
//   kind: 'personal' (tasks team) | 'company' (company_tasks).
//   scope_label: nombre del space o empresa, o 'Personal'.
//   assigned: true si el miembro está en task_assignees / company_task_assignees.
export async function listOpenTasksForPicker(memberId, opts = {}) {
  if (!memberId) return [];
  const scope = opts.scope || "all";

  // 1) Tareas TEAM (tasks) + sus space names + parent_space_id (para chips
  // de jerarquía en el picker).
  // OJO: tasks NO tiene columna `archived` — eso es de `spaces`. La papelera
  // usa `deleted_at` (migration `tasks_trash_migration.sql`); como ese SQL
  // puede no estar aplicado, NO filtramos por deleted_at acá. Si una tarea
  // está en papelera, aparece — edge case menor.
  let teamTasks = [];
  if (scope === "all") {
    const { data, error } = await database
      .from("tasks")
      .select("id, title, status, due_date, space_id, company_id, spaces(id, name, parent_space_id)")
      .neq("status", "completado");
    if (error) logger.warn("[picker] tasks query failed:", error.message);
    teamTasks = data || [];
  } else {
    const { data, error } = await database
      .from("task_assignees")
      .select("tasks!inner(id, title, status, due_date, space_id, company_id, spaces(id, name, parent_space_id))")
      .eq("member_id", memberId);
    if (error) logger.warn("[picker] task_assignees query failed:", error.message);
    teamTasks = (data || [])
      .map((r) => r.tasks)
      .filter((t) => t && t.status !== "completado");
  }

  // Identificar a cuáles está asignado el miembro (para el flag `assigned`).
  let assignedTeamIds = new Set();
  if (scope === "all" && teamTasks.length > 0) {
    const { data: aData } = await database
      .from("task_assignees")
      .select("task_id")
      .eq("member_id", memberId)
      .in("task_id", teamTasks.map((t) => t.id));
    assignedTeamIds = new Set((aData || []).map((r) => r.task_id));
  }

  const teamMapped = teamTasks.map((t) => ({
    id: t.id,
    kind: "personal",
    title: t.title,
    due_date: t.due_date,
    scope_label: t.spaces?.name || "Personal",
    space_id: t.space_id || null,
    parent_space_id: t.spaces?.parent_space_id || null,
    company_id: null,
    assigned: scope === "mine" ? true : assignedTeamIds.has(t.id),
  }));

  // 2) Tareas COMPANY (company_tasks).
  let compTasksRaw = [];
  if (scope === "all") {
    const { data } = await database
      .from("company_tasks")
      .select("id, title, status, due_date, company_id, archived, deleted_at")
      .neq("status", "completado")
      .eq("archived", false)
      .is("deleted_at", null);
    compTasksRaw = data || [];
  } else {
    const { data } = await database
      .from("company_task_assignees")
      .select("company_tasks!inner(id, title, status, due_date, company_id, archived, deleted_at)")
      .eq("member_id", memberId);
    compTasksRaw = (data || [])
      .map((r) => r.company_tasks)
      .filter((t) => t && t.status !== "completado" && !t.archived && !t.deleted_at);
  }

  let assignedCompIds = new Set();
  if (scope === "all" && compTasksRaw.length > 0) {
    const { data: aData } = await database
      .from("company_task_assignees")
      .select("task_id")
      .eq("member_id", memberId)
      .in("task_id", compTasksRaw.map((t) => t.id));
    assignedCompIds = new Set((aData || []).map((r) => r.task_id));
  }

  // Resolver nombres de empresas.
  const companyIds = [...new Set(compTasksRaw.map((t) => t.company_id).filter(Boolean))];
  let companyMap = {};
  if (companyIds.length > 0) {
    const { data: companies } = await database
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    companyMap = Object.fromEntries((companies || []).map((c) => [c.id, c.name]));
  }

  const compMapped = compTasksRaw.map((t) => ({
    id: t.id,
    kind: "company",
    title: t.title,
    due_date: t.due_date,
    scope_label: companyMap[t.company_id] || "Empresa",
    space_id: null,
    parent_space_id: null,
    company_id: t.company_id || null,
    assigned: scope === "mine" ? true : assignedCompIds.has(t.id),
  }));

  // Sort: asignadas a mí primero, luego por due_date, luego por título.
  return [...teamMapped, ...compMapped].sort((a, b) => {
    if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;
    const da = a.due_date || "9999-12-31";
    const db = b.due_date || "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    return (a.title || "").localeCompare(b.title || "");
  });
}

// Alias retrocompatible — el hook lo llama así.
export const listMyOpenTasks = (memberId) => listOpenTasksForPicker(memberId, { scope: "all" });

// Marca una tarea como completada (status='completado'). taskKind decide
// qué tabla: 'personal' → tasks, 'company' → company_tasks.
// Usado por el botón "Finalizar tarea" del time tracker para señalar que
// la tarea quedó cerrada (distinto de "Pausar" que sólo cierra la sesión).
export async function markTaskCompleted(taskId, taskKind) {
  if (!taskId || !taskKind) return { error: new Error("taskId y taskKind requeridos") };
  const table = taskKind === "company" ? "company_tasks" : "tasks";
  return database
    .from(table)
    .update({ status: "completado", completed_at: new Date().toISOString() })
    .eq("id", taskId);
}

// Revierte un quick-complete: regresa la tarea a status='pendiente'.
// Soporta el toast de "Deshacer" en el TaskPicker.
export async function markTaskUncompleted(taskId, taskKind) {
  if (!taskId || !taskKind) return { error: new Error("taskId y taskKind requeridos") };
  const table = taskKind === "company" ? "company_tasks" : "tasks";
  return database
    .from(table)
    .update({ status: "pendiente", completed_at: null })
    .eq("id", taskId);
}

// ---- Timer real por tarea (Fase 1) ----

// Cierra la sesión indicando CÓMO terminó:
//   endKind: 'pausa' | 'terminada' | 'cambio'. reason: nota rápida (opcional).
export async function endSessionWith(sessionId, { endKind = "pausa", reason = null, pauseKind = null } = {}) {
  return database
    .from("time_tracker_sessions")
    .update({
      ended_at: new Date().toISOString(),
      end_kind: endKind,
      pause_kind: endKind === "pausa" ? pauseKind : null,
      pause_reason: reason?.trim() || null,
    })
    .eq("id", sessionId)
    .is("ended_at", null)
    .select()
    .single();
}

// Cierra lo que esté corriendo del usuario (para arrancar otra tarea).
export async function closeActiveAs(ownerId, endKind = "cambio") {
  return database
    .from("time_tracker_sessions")
    .update({ ended_at: new Date().toISOString(), end_kind: endKind })
    .eq("owner_id", ownerId)
    .is("ended_at", null);
}

// Al completar una tarea desde cualquier lado, cierra sus sesiones abiertas.
export async function closeTaskSessions(taskId, endKind = "terminada") {
  return database
    .from("time_tracker_sessions")
    .update({ ended_at: new Date().toISOString(), end_kind: endKind })
    .eq("task_id", taskId)
    .is("ended_at", null);
}

// Segundos reales acumulados por tarea (RPC task_session_totals).
export async function getTaskSessionTotals() {
  return database.rpc("task_session_totals");
}

// Completa (o corrige) después la nota de una pausa ya registrada.
export async function setPauseNote(sessionId, note) {
  return database
    .from("time_tracker_sessions")
    .update({ pause_reason: note?.trim() || null })
    .eq("id", sessionId);
}

// ---- Pausas medidas (work_pauses): descanso o interrupción con inicio, fin y nota ----
export async function getActivePause(ownerId) {
  return database.from("work_pauses").select("*").eq("owner_id", ownerId).is("ended_at", null).maybeSingle();
}
export async function startPause(ownerId, { kind, taskId = null, taskLabel = null, note = null }) {
  await database.from("work_pauses").update({ ended_at: new Date().toISOString() }).eq("owner_id", ownerId).is("ended_at", null);
  return database.from("work_pauses")
    .insert({ owner_id: ownerId, kind, task_id: taskId, task_label: taskLabel, note: note?.trim() || null })
    .select().single();
}
export async function endPause(pauseId) {
  return database.from("work_pauses").update({ ended_at: new Date().toISOString() }).eq("id", pauseId).is("ended_at", null);
}
export async function setPauseRowNote(pauseId, note) {
  return database.from("work_pauses").update({ note: note?.trim() || null }).eq("id", pauseId);
}
export async function listPausesBetween(ownerId, fromIso, toIso) {
  return database.from("work_pauses").select("*").eq("owner_id", ownerId)
    .gte("started_at", fromIso).lt("started_at", toIso).order("started_at", { ascending: false });
}
