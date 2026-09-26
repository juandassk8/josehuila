// Store del tiempo real por tarea. Una sola fuente para todos los <TaskTimer>:
// la sesión activa del miembro + los segundos acumulados por tarea
// (time_tracker_sessions). Se sincroniza por realtime.
import { useSyncExternalStore } from "react";
import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";
import {
  getActiveSession,
  startSession,
  endSessionWith,
  closeActiveAs,
  getTaskSessionTotals,
  listSessions,
  getActivePause,
  startPause,
  endPause,
  setPauseRowNote,
} from "../timetrack/data/timeTrackerDb.js";

let state = { memberId: null, active: null, pause: null, totals: {}, todaySeconds: 0, ready: false };
const listeners = new Set();
let channel = null;
let reloadTimer = null;
let loadToken = 0;

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function reload() {
  const memberId = state.memberId;
  if (!memberId) return;
  const token = ++loadToken;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [activeRes, totalsRes, todayRes, pauseRes] = await Promise.all([
    getActiveSession(memberId),
    getTaskSessionTotals(),
    listSessions(memberId, dayStart.toISOString(), null),
    getActivePause(memberId),
  ]);
  if (token !== loadToken || memberId !== state.memberId) return;
  if (activeRes.error) logger.warn("[taskTime] sesión activa:", activeRes.error.message);
  if (totalsRes.error) logger.warn("[taskTime] totales:", totalsRes.error.message);
  const totals = {};
  (totalsRes.data || []).forEach((r) => { totals[r.task_id] = Number(r.seconds) || 0; });
  // Segundos trabajados HOY (sesiones cerradas; la activa se suma en vivo en la UI).
  const startMs = dayStart.getTime();
  // Las sesiones de tareas personales no cuentan como trabajo del día.
  const todayTaskIds = [...new Set((todayRes.data || []).map((s) => s.task_id).filter(Boolean))];
  let personalIds = new Set();
  if (todayTaskIds.length) {
    const { data: tt } = await database.from("tasks").select("id, work_type").in("id", todayTaskIds);
    if (token !== loadToken) return;
    personalIds = new Set((tt || []).filter((t) => t.work_type === "personal").map((t) => t.id));
  }
  const todaySeconds = (todayRes.data || []).reduce((acc, s) => {
    if (!s.ended_at || personalIds.has(s.task_id)) return acc;
    const a = Math.max(startMs, new Date(s.started_at).getTime());
    const b = new Date(s.ended_at).getTime();
    return acc + Math.max(0, Math.floor((b - a) / 1000));
  }, 0);
  set({
    active: activeRes.error ? state.active : activeRes.data || null,
    totals: totalsRes.error ? state.totals : totals,
    todaySeconds: todayRes.error ? state.todaySeconds : todaySeconds,
    pause: pauseRes.error ? state.pause : pauseRes.data || null,
    ready: true,
  });
}

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 250);
}

export function initTaskTime(memberId) {
  if (!memberId || state.memberId === memberId) return;
  if (channel) { database.removeChannel(channel); channel = null; }
  state = { memberId, active: null, pause: null, totals: {}, todaySeconds: 0, ready: false };
  reload();
  channel = database
    .channel(`task-time-${memberId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "time_tracker_sessions" }, scheduleReload)
    .subscribe();
}

// Arranca el timer de una tarea. Si había otra corriendo, la cierra como 'cambio'.
export async function startTaskSession(task) {
  const memberId = state.memberId;
  if (!memberId || !task?.id) return { error: new Error("sin miembro o tarea") };
  if (state.active?.task_id === task.id) return { data: state.active, error: null };
  const prev = state;
  const totals = { ...state.totals };
  let todaySeconds = state.todaySeconds;
  if (state.active) todaySeconds += elapsedOf(state.active);
  if (state.active?.task_id) {
    totals[state.active.task_id] = (totals[state.active.task_id] || 0) + elapsedOf(state.active);
  }
  if (state.pause) { endPause(state.pause.id).then(({ error }) => error && logger.warn("[taskTime] pausa:", error.message)); }
  set({
    pause: null,
    totals,
    todaySeconds,
    active: { id: "tmp", owner_id: memberId, task_id: task.id, started_at: new Date().toISOString() },
  });
  if (prev.active) {
    const { error: closeErr } = await closeActiveAs(memberId, "cambio");
    if (closeErr) { set({ active: prev.active, totals: prev.totals }); return { error: closeErr }; }
  }
  const { data, error } = await startSession(memberId, {
    spaceId: task.space_id || null,
    taskId: task.id,
    taskKind: "personal",
    taskLabel: task.title || null,
  });
  if (error) {
    logger.error("[taskTime] no se pudo iniciar:", error.message);
    set({ active: null });
    scheduleReload();
    return { error };
  }
  set({ active: data });
  return { data, error: null };
}

// Detiene la sesión activa. endKind: 'pausa' | 'terminada'.
export async function stopTaskSession({ endKind = "pausa", reason = null, pauseKind = null } = {}) {
  const active = state.active;
  if (!active) return { error: null };
  const totals = { ...state.totals };
  if (active.task_id) totals[active.task_id] = (totals[active.task_id] || 0) + elapsedOf(active);
  set({ active: null, totals, todaySeconds: state.todaySeconds + elapsedOf(active) });
  if (active.id === "tmp") { scheduleReload(); return { error: null }; }
  const { error } = await endSessionWith(active.id, { endKind, reason, pauseKind });
  if (error) { logger.error("[taskTime] no se pudo pausar:", error.message); scheduleReload(); }
  // Arranca el contador del descanso / la interrupción.
  if (!error && endKind === "pausa" && pauseKind) {
    const kind = pauseKind === "descanso" ? "descanso" : "interrupcion";
    set({ pause: { id: "tmp", kind, task_id: active.task_id, task_label: active.task_label, note: reason || null, started_at: new Date().toISOString() } });
    const res = await startPause(state.memberId, { kind, taskId: active.task_id, taskLabel: active.task_label, note: reason });
    if (res.error) { logger.warn("[taskTime] pausa:", res.error.message); set({ pause: null }); } else set({ pause: res.data });
  }
  return { error };
}

export function elapsedOf(session) {
  if (!session?.started_at) return 0;
  const t = new Date(session.started_at).getTime();
  return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 1000));
}

export function getTaskTimeState() { return state; }

export function useTaskTime() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state
  );
}

// Termina el descanso / la interrupción sin retomar ninguna tarea.
export async function finishPause() {
  const p = state.pause;
  if (!p) return;
  set({ pause: null });
  if (p.id !== "tmp") { const { error } = await endPause(p.id); if (error) logger.warn("[taskTime] pausa:", error.message); }
}

export async function updatePauseNote(note) {
  const p = state.pause;
  if (!p) return;
  set({ pause: { ...p, note } });
  if (p.id !== "tmp") { const { error } = await setPauseRowNote(p.id, note); if (error) logger.warn("[taskTime] nota:", error.message); }
}

// Descanso o interrupción SIN tarea corriendo (p. ej. en medio de un bloque de la rutina).
export async function startFreePause(kind, note = null) {
  const memberId = state.memberId;
  if (!memberId) return;
  if (state.active) { await stopTaskSession({ endKind: "pausa", pauseKind: kind === "descanso" ? "descanso" : "inconveniente", reason: note }); return; }
  set({ pause: { id: "tmp", kind, task_id: null, task_label: null, note: note || null, started_at: new Date().toISOString() } });
  const res = await startPause(memberId, { kind, note });
  if (res.error) { logger.warn("[taskTime] pausa:", res.error.message); set({ pause: null }); } else set({ pause: res.data });
}
