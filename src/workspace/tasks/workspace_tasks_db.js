import { database } from "../../lib/backend.js";
import { calculateNextDate } from "../../lib/recurrence.js";

// Data layer de tareas por empresa. Espejo de src/team/data/db.js, pero
// aislado por company_id y con FK a company_team_members. Usado por todos los
// componentes de src/workspace/tasks/.

// ---- Spaces (buckets internos por empresa) ----

export async function listSpaces(companyId) {
  return database
    .from("company_task_spaces")
    .select("*")
    .eq("company_id", companyId)
    .eq("archived", false)
    .order("sort_order", { ascending: true });
}

export async function createSpace(companyId, payload) {
  return database
    .from("company_task_spaces")
    .insert({ ...payload, company_id: companyId })
    .select()
    .single();
}

export async function updateSpace(id, patch) {
  return database
    .from("company_task_spaces")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
}

export async function archiveSpace(id) {
  return database
    .from("company_task_spaces")
    .update({ archived: true })
    .eq("id", id);
}

// Reordena varios spaces en batch. updates: [{id, sort_order}, ...]
export async function reorderSpaces(updates) {
  if (!updates?.length) return { data: [], error: null };
  const results = await Promise.all(
    updates.map((u) =>
      database
        .from("company_task_spaces")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id)
    )
  );
  const error = results.find((r) => r.error)?.error || null;
  return { data: results.map((r) => r.data).filter(Boolean), error };
}

// ---- Tasks ----

export async function listTasks(companyId) {
  return database
    .from("company_tasks")
    .select("*, assignees:company_task_assignees(member_id)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function listTrashedTasks(companyId) {
  return database
    .from("company_tasks")
    .select("*, assignees:company_task_assignees(member_id)")
    .eq("company_id", companyId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
}

export async function createTask(companyId, payload, assigneeIds = []) {
  const { data, error } = await database
    .from("company_tasks")
    .insert({ ...payload, company_id: companyId })
    .select()
    .single();
  if (error) return { data: null, error };
  if (assigneeIds.length) {
    const rows = assigneeIds.map((mid) => ({ task_id: data.id, member_id: mid }));
    const { error: aErr } = await database.from("company_task_assignees").insert(rows);
    if (aErr) return { data, error: aErr };
  }
  return { data, error: null };
}

export async function updateTask(id, patch) {
  return database.from("company_tasks").update(patch).eq("id", id).select().single();
}

export async function setTaskStatus(id, status, memberId) {
  const patch = { status };
  if (status === "completado") {
    patch.completed_at = new Date().toISOString();
    if (memberId) patch.completed_by = memberId;
    // Auto-pausa del timer si estaba corriendo.
    const { data: current } = await database
      .from("company_tasks")
      .select("timer_started_at, time_spent_seconds")
      .eq("id", id)
      .single();
    if (current?.timer_started_at) {
      const started = new Date(current.timer_started_at).getTime();
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      patch.timer_started_at = null;
      patch.time_spent_seconds = (current.time_spent_seconds || 0) + elapsed;
    }
  } else {
    patch.completed_at = null;
    patch.completed_by = null;
  }

  const result = await database
    .from("company_tasks")
    .update(patch)
    .eq("id", id)
    .select("*, assignees:company_task_assignees(member_id)")
    .single();

  // Recurrencia: si se completó y está activa, creamos la siguiente instancia.
  if (status === "completado" && result.data?.recurrence_active && result.data?.recurrence_pattern) {
    const task = result.data;
    const nextDueDate = calculateNextDate(task.due_date, task.recurrence_pattern, task.recurrence_interval || 1);
    const newStatus = task.recurrence_next_status || "pendiente";

    // Extraer solo los campos "plantilla" — ignoramos id/created_at/completed_*.
    const { assignees, id: _id, created_at, updated_at, completed_at, completed_by, ...rest } = task;
    const assigneeIds = (assignees || []).map((a) => a.member_id);

    const { data: newTask } = await database
      .from("company_tasks")
      .insert({
        ...rest,
        due_date: nextDueDate,
        status: newStatus,
        recurrence_parent_id: task.recurrence_parent_id || task.id,
        time_spent_seconds: 0,
        timer_started_at: null,
      })
      .select()
      .single();

    if (newTask && assigneeIds.length) {
      await database
        .from("company_task_assignees")
        .insert(assigneeIds.map((mid) => ({ task_id: newTask.id, member_id: mid })));
    }
  }

  return result;
}

// Soft delete — mueve a papelera.
export async function deleteTask(id) {
  return database
    .from("company_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}

export async function restoreTask(id) {
  return database
    .from("company_tasks")
    .update({ deleted_at: null })
    .eq("id", id);
}

// Hard delete — eliminación definitiva.
export async function hardDeleteTask(id) {
  return database.from("company_tasks").delete().eq("id", id);
}

export async function emptyTrash(companyId) {
  return database
    .from("company_tasks")
    .delete()
    .eq("company_id", companyId)
    .not("deleted_at", "is", null);
}

// Limpieza automática: borra tareas en papelera con más de 30 días.
export async function purgeOldTrash(companyId) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return database
    .from("company_tasks")
    .delete()
    .eq("company_id", companyId)
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
}

// ---- Task Timer ----

export async function startTaskTimer(taskId, options = {}) {
  const { data: current } = await database
    .from("company_tasks")
    .select("timer_started_at, timer_mode, timer_duration_seconds")
    .eq("id", taskId)
    .single();
  if (current?.timer_started_at) return { data: current, error: null };

  const patch = { timer_started_at: new Date().toISOString() };
  if (options.mode) patch.timer_mode = options.mode;
  if (options.durationSeconds != null) patch.timer_duration_seconds = options.durationSeconds;
  return database
    .from("company_tasks")
    .update(patch)
    .eq("id", taskId)
    .select()
    .single();
}

export async function pauseTaskTimer(taskId) {
  const { data: current, error: fetchErr } = await database
    .from("company_tasks")
    .select("timer_started_at, time_spent_seconds")
    .eq("id", taskId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };
  if (!current?.timer_started_at) return { data: current, error: null };
  const started = new Date(current.timer_started_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const total = (current.time_spent_seconds || 0) + elapsed;
  return database
    .from("company_tasks")
    .update({ timer_started_at: null, time_spent_seconds: total })
    .eq("id", taskId)
    .select()
    .single();
}

export async function resetTaskTimer(taskId) {
  return database
    .from("company_tasks")
    .update({
      timer_started_at: null,
      time_spent_seconds: 0,
      timer_mode: null,
      timer_duration_seconds: null,
    })
    .eq("id", taskId)
    .select()
    .single();
}

// ---- Assignees ----

export async function replaceAssignees(taskId, memberIds) {
  await database.from("company_task_assignees").delete().eq("task_id", taskId);
  if (!memberIds.length) return { data: [], error: null };
  const rows = memberIds.map((mid) => ({ task_id: taskId, member_id: mid }));
  return database.from("company_task_assignees").insert(rows);
}

// ---- Activity feed ----

export async function listTaskActivity(companyId, limit = 50) {
  return database
    .from("company_task_activity")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

// ---- Member current_task_id helper ----

export async function setCurrentTask(memberId, taskId) {
  return database
    .from("company_team_members")
    .update({ current_task_id: taskId })
    .eq("id", memberId);
}
