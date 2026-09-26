import { database } from "../../lib/backend.js";
import { calculateNextDate } from "../../lib/recurrence.js";

// Thin wrappers over the database client for the team module.
// All operations return { data, error } shape.

// ---- Members ----
export async function listMembers() {
  return database
    .from("team_members")
    .select("*")
    .order("role", { ascending: true })
    .order("name", { ascending: true });
}

export async function updateMember(id, patch) {
  return database.from("team_members").update(patch).eq("id", id).select().single();
}

export async function setCurrentTask(memberId, taskId) {
  return database
    .from("team_members")
    .update({ current_task_id: taskId, last_seen_at: new Date().toISOString() })
    .eq("id", memberId);
}

export async function heartbeat(memberId) {
  return database
    .from("team_members")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", memberId);
}

// ---- Spaces ----
export async function listSpaces() {
  return database
    .from("spaces")
    .select("*")
    .eq("archived", false)
    .order("visibility", { ascending: false }) // shared first
    .order("sort_order", { ascending: true });
}

export async function createSpace(payload) {
  return database.from("spaces").insert(payload).select().single();
}

export async function updateSpace(id, patch) {
  return database.from("spaces").update(patch).eq("id", id).select().single();
}

export async function archiveSpace(id) {
  return database.from("spaces").update({ archived: true }).eq("id", id);
}

// "Eliminar" un espacio: lo saca del panel (junto con sus subespacios) y manda
// todas sus tareas a la Papelera (deleted_at) — recuperables 30 días. NO hace
// DELETE físico a propósito: la FK tasks.space_id es `on delete set null` y la
// tabla tiene `check (space_id is not null or company_id is not null)`, así que
// borrar la fila dejaría tareas en estado inválido / fallaría. Archivar +
// papelera logra el mismo efecto visual (desaparece de listSpaces, que filtra
// archived=false) de forma segura y reversible. `allSpaces` resuelve los
// subespacios vía parent_space_id (recursivo por si hubiera más de un nivel).
export async function deleteSpaceCascade(id, allSpaces = []) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of allSpaces) {
      if (s?.parent_space_id && ids.has(s.parent_space_id) && !ids.has(s.id)) {
        ids.add(s.id);
        grew = true;
      }
    }
  }
  const idList = [...ids];
  // 1. Tareas de esos espacios → Papelera (sólo las que no estén ya borradas).
  const { error: tErr } = await database
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .in("space_id", idList)
    .is("deleted_at", null);
  if (tErr) return { error: tErr };
  // 2. Espacios (+ subespacios) → archivados: desaparecen del panel.
  return database.from("spaces").update({ archived: true }).in("id", idList);
}

// ---- Tasks ----
// Order PRIMERO por status (enum order: pendiente, en_curso, completado),
// LUEGO por sort_order/created_at. Esto garantiza que las ~36 tareas activas
// siempre entren dentro del cap silencioso de 1000 filas de PostgREST,
// independientemente de cuántos completados viejos haya.
//
// Historia:
//  - Bug original: order=sort_order.asc ponía los 1009 completados con
//    sort_order=0 al inicio del cap → pendientes desaparecían.
//  - Intento con 2 queries paralelas: duplicaba filas cuando entre ambas
//    se commiteaba un cambio de status (cards triplicados en UI).
//  - Intento con .limit(5000): PostgREST tiene db-max-rows=1000 y silenciosamente
//    capa, así que el limit no se respeta.
//  - Fix actual: una sola query, simple, con status como primer order.
export async function listTasks() {
  return database
    .from("tasks")
    .select("*, assignees:task_assignees(member_id)")
    .is("deleted_at", null)
    .order("status", { ascending: true })
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function listTrashedTasks() {
  return database
    .from("tasks")
    .select("*, assignees:task_assignees(member_id)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
}

export async function createTask(payload, assigneeIds = []) {
  const { data, error } = await database.from("tasks").insert(payload).select().single();
  if (error) return { data: null, error };
  if (assigneeIds.length) {
    const rows = assigneeIds.map((mid) => ({ task_id: data.id, member_id: mid }));
    const { error: aErr } = await database.from("task_assignees").insert(rows);
    if (aErr) return { data, error: aErr };
  }
  return { data, error: null };
}

export async function updateTask(id, patch) {
  return database.from("tasks").update(patch).eq("id", id).select().single();
}

export async function setTaskStatus(id, status, memberId) {
  const patch = { status };
  if (status === "completado") {
    patch.completed_at = new Date().toISOString();
    if (memberId) patch.completed_by = memberId;
    // auto-pausa el timer si estaba corriendo
    const { data: current } = await database
      .from("tasks")
      .select("timer_started_at, time_spent_seconds")
      .eq("id", id)
      .single();
    if (current?.timer_started_at) {
      const started = new Date(current.timer_started_at).getTime();
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      patch.timer_started_at = null;
      patch.time_spent_seconds = (current.time_spent_seconds || 0) + elapsed;
    }
    // cierra también las sesiones reales abiertas de esta tarea
    await database
      .from("time_tracker_sessions")
      .update({ ended_at: new Date().toISOString(), end_kind: "terminada" })
      .eq("task_id", id)
      .is("ended_at", null);
  } else {
    patch.completed_at = null;
    patch.completed_by = null;
  }
  const result = await database.from("tasks").update(patch).eq("id", id).select("*, assignees:task_assignees(member_id)").single();

  // Tarea enlazada a un hábito: completarla marca el hábito de hoy y su bloque en Mi rutina.
  if (status === "completado" && result.data?.habit_key && memberId) {
    await markHabitFromTask(memberId, result.data.habit_key);
  }

  // Handle recurrence: if task was completed and is recurrence_active, create next instance
  if (status === "completado" && result.data?.recurrence_active && result.data?.recurrence_pattern) {
    const task = result.data;
    const nextDueDate = calculateNextDate(task.due_date, task.recurrence_pattern, task.recurrence_interval || 1, task.recurrence_days);
    const newStatus = task.recurrence_next_status || "pendiente";

    const { assignees, id: _id, created_at, completed_at, completed_by, ...rest } = task;
    const assigneeIds = (assignees || []).map((a) => a.member_id);

    const { data: newTask } = await database
      .from("tasks")
      .insert({
        ...rest,
        due_date: nextDueDate,
        status: newStatus,
        recurrence_parent_id: task.recurrence_parent_id || task.id,
        // la nueva instancia hereda estimado y tipo, pero arranca con el tiempo en cero
        time_spent_seconds: 0,
        timer_started_at: null,
      })
      .select()
      .single();

    if (newTask && assigneeIds.length) {
      await database
        .from("task_assignees")
        .insert(assigneeIds.map((mid) => ({ task_id: newTask.id, member_id: mid })));
    }
  }

  return result;
}

// Soft delete — mueve a papelera.
export async function deleteTask(id) {
  return database
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}

export async function restoreTask(id) {
  return database
    .from("tasks")
    .update({ deleted_at: null })
    .eq("id", id);
}

// Hard delete — eliminación definitiva (usado desde la papelera).
export async function hardDeleteTask(id) {
  return database.from("tasks").delete().eq("id", id);
}

export async function emptyTrash() {
  return database
    .from("tasks")
    .delete()
    .not("deleted_at", "is", null);
}

// Limpieza automática: borra tareas en papelera con más de 30 días.
export async function purgeOldTrash() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return database
    .from("tasks")
    .delete()
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
}

// ---- Task Timer ----
// Opciones: { mode: 'cronometro' | 'temporizador', durationSeconds?: number }
export async function startTaskTimer(taskId, options = {}) {
  const { data: current } = await database
    .from("tasks")
    .select("timer_started_at, timer_mode, timer_duration_seconds")
    .eq("id", taskId)
    .single();
  if (current?.timer_started_at) return { data: current, error: null };

  const patch = { timer_started_at: new Date().toISOString() };
  if (options.mode) patch.timer_mode = options.mode;
  if (options.durationSeconds != null) patch.timer_duration_seconds = options.durationSeconds;
  return database
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select()
    .single();
}

export async function pauseTaskTimer(taskId) {
  const { data: current, error: fetchErr } = await database
    .from("tasks")
    .select("timer_started_at, time_spent_seconds")
    .eq("id", taskId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };
  if (!current?.timer_started_at) return { data: current, error: null };
  const started = new Date(current.timer_started_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const total = (current.time_spent_seconds || 0) + elapsed;
  return database
    .from("tasks")
    .update({ timer_started_at: null, time_spent_seconds: total })
    .eq("id", taskId)
    .select()
    .single();
}

// Detiene + resetea todo (modo, duración, acumulado)
export async function resetTaskTimer(taskId) {
  return database
    .from("tasks")
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

export async function replaceAssignees(taskId, memberIds) {
  await database.from("task_assignees").delete().eq("task_id", taskId);
  if (!memberIds.length) return { data: [], error: null };
  const rows = memberIds.map((mid) => ({ task_id: taskId, member_id: mid }));
  return database.from("task_assignees").insert(rows);
}

// ---- Companies (read-only view of existing legacy table) ----
// `archived` se introduce en db/companies_archived.sql. Si la column no
// existe aún, database la omite — los flags caen a undefined (falsy) y
// todo se trata como activa. Por eso usamos select("*") aquí.
export async function listCompanies() {
  return database.from("companies").select("*").order("name", { ascending: true });
}

// Toggle archive flag — soft hide en las 4 superficies (panel general,
// Master Tracking, Empresas team, sidebar /admin). Reversible: cada
// superficie tiene un toggle "Ver archivadas (N)" que las desoculta.
export async function setCompanyArchived(companyId, archived) {
  return database
    .from("companies")
    .update({ archived: !!archived })
    .eq("id", companyId);
}

export async function listReportsDates() {
  return database.from("reports").select("id, company_id, created_at").order("created_at", { ascending: false });
}

// Empresa con objetivos (para el panel de anuncios read-only).
export async function getCompanyFull(companyId) {
  return database
    .from("companies")
    .select("id, name, slug, objectives, created_at")
    .eq("id", companyId)
    .maybeSingle();
}

// Todos los reportes de una empresa con el payload completo. Shape:
// `{ id, period, data, created_at }` — `data` contiene métricas, secciones, anuncios, etc.
export async function listReportsForCompany(companyId) {
  return database
    .from("reports")
    .select("id, company_id, period, data, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
}

// Todos los reportes de todas las empresas, con data completa. Usado por
// Empresas para calcular ventas agregadas por rango en cada card.
export async function listAllReports() {
  return database
    .from("reports")
    .select("id, company_id, period, data, created_at")
    .order("created_at", { ascending: false });
}

// Marca como hecho (✓) el hábito `habitKey` del miembro para HOY y los bloques de su rutina
// de hoy enlazados a ese hábito. Silencioso: si el miembro no tiene ese hábito, no hace nada.
async function markHabitFromTask(memberId, habitKey) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const day = (now.getDay() + 6) % 7;
  const stamp = now.toISOString();
  const { data: habit } = await database.from("habits").select("id").eq("owner_id", memberId).eq("key", habitKey).maybeSingle();
  if (habit) {
    await database.from("habit_logs").upsert(
      { owner_id: memberId, habit_id: habit.id, date: today, value: 1, updated_at: stamp },
      { onConflict: "habit_id,date" }
    );
  }
  const { data: blocks } = await database.from("routine_blocks").select("id").eq("owner_id", memberId).eq("day", day).eq("habit_key", habitKey);
  if (blocks?.length) {
    await database.from("routine_checks").upsert(
      blocks.map((b) => ({ owner_id: memberId, block_id: b.id, date: today, value: 1, updated_at: stamp })),
      { onConflict: "block_id,date" }
    );
  }
}
