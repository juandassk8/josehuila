// Wrappers Supabase de "Mi rutina". Todo es por miembro (RLS: owner_id = auth.uid()).
import { database } from "../../lib/backend.js";

export const listBlocks = (ownerId) =>
  database.from("routine_blocks").select("*").eq("owner_id", ownerId).order("day").order("start_min");

export const saveBlock = (ownerId, block) => {
  const payload = {
    owner_id: ownerId,
    day: block.day,
    start_min: block.start_min,
    end_min: block.end_min,
    label: block.label.trim(),
    category: block.category,
    note: block.note?.trim() || null,
    habit_key: block.habit_key || null,
  };
  return block.id
    ? database.from("routine_blocks").update(payload).eq("id", block.id).select().single()
    : database.from("routine_blocks").insert(payload).select().single();
};

export const deleteBlock = (id) => database.from("routine_blocks").delete().eq("id", id);

export const listChecks = (ownerId, from, to) =>
  database.from("routine_checks").select("*").eq("owner_id", ownerId).gte("date", from).lte("date", to);

// value: 1 | 3 | 0 (0 = quitar la marca)
export const setCheck = (ownerId, blockId, date, value) =>
  value
    ? database.from("routine_checks").upsert(
        { owner_id: ownerId, block_id: blockId, date, value, updated_at: new Date().toISOString() },
        { onConflict: "block_id,date" }
      )
    : database.from("routine_checks").delete().eq("block_id", blockId).eq("date", date);

export const listHabits = (ownerId) =>
  database.from("habits").select("*").eq("owner_id", ownerId).eq("archived", false).order("sort_order");

export const listHabitLogs = (ownerId, from, to) =>
  database.from("habit_logs").select("*").eq("owner_id", ownerId).gte("date", from).lte("date", to);

// value: 1 | 2 | 3 | 0 (0 = quitar)
export const setHabitLog = (ownerId, habitId, date, value) =>
  value
    ? database.from("habit_logs").upsert(
        { owner_id: ownerId, habit_id: habitId, date, value, updated_at: new Date().toISOString() },
        { onConflict: "habit_id,date" }
      )
    : database.from("habit_logs").delete().eq("habit_id", habitId).eq("date", date);

export const listWeights = (ownerId) =>
  database.from("weight_logs").select("date, kg").eq("owner_id", ownerId).order("date");

export const setWeight = (ownerId, date, kg) =>
  kg
    ? database.from("weight_logs").upsert(
        { owner_id: ownerId, date, kg, updated_at: new Date().toISOString() },
        { onConflict: "owner_id,date" }
      )
    : database.from("weight_logs").delete().eq("owner_id", ownerId).eq("date", date);

// ---- Edición de hábitos ----
export const saveHabit = (ownerId, habit) => {
  const payload = {
    owner_id: ownerId,
    name: habit.name.trim(),
    grp: habit.grp?.trim() || "General",
    target: Math.max(1, Math.min(7, Number(habit.target) || 7)),
    days: habit.days && habit.days.some((d) => !d) ? habit.days.map((d) => (d ? 1 : 0)) : null,
    sort_order: habit.sort_order ?? 999,
  };
  if (habit.id) return database.from("habits").update(payload).eq("id", habit.id).select().single();
  const key = `${payload.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
  return database.from("habits").insert({ ...payload, key }).select().single();
};

// Archivar conserva el historial; el hábito solo deja de aparecer.
export const archiveHabit = (id) => database.from("habits").update({ archived: true }).eq("id", id);

// ---- Reportes ----
export const listSessionsBetween = (ownerId, fromIso, toIso) =>
  database.from("time_tracker_sessions").select("id, task_id, task_label, started_at, ended_at, duration_seconds, end_kind, pause_kind, pause_reason")
    .eq("owner_id", ownerId).gte("started_at", fromIso).lt("started_at", toIso).not("ended_at", "is", null).order("started_at");

export const listTasksByIds = (ids) =>
  ids.length
    ? database.from("tasks").select("id, title, status, estimate_minutes, work_type, time_spent_seconds").in("id", ids)
    : Promise.resolve({ data: [], error: null });

// ---- Notas del calendario (routine_settings.notes = [{ t, b }]) ----
export const getSettings = (ownerId) =>
  database.from("routine_settings").select("notes").eq("owner_id", ownerId).maybeSingle();

export const saveNotes = (ownerId, notes) =>
  database.from("routine_settings").upsert(
    { owner_id: ownerId, notes, updated_at: new Date().toISOString() },
    { onConflict: "owner_id" }
  );

// ---- Google Calendar (dirección iCal privada, solo lectura) ----
export const getCalendarUrl = (ownerId) =>
  database.from("routine_settings").select("calendar_ics_url").eq("owner_id", ownerId).maybeSingle();

export const saveCalendarUrl = (ownerId, url) =>
  database.from("routine_settings").upsert(
    { owner_id: ownerId, calendar_ics_url: url || null, updated_at: new Date().toISOString() },
    { onConflict: "owner_id" }
  );

export async function fetchCalendarEvents(fromIso, toIso) {
  const { buildApiHeaders } = await import("../../lib/apiAuth.js");
  const res = await fetch("/api/calendar-events", {
    method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ from: fromIso, to: toIso }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, connected: !!body.connected, events: body.events || [], error: body.error || null };
}
