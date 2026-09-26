// Helpers puros del time tracker. Sin React, sin Supabase.
// La precisión de display es ms; la persistida en duration_seconds es entera.

import { startOfDay, endOfDay, addDays, isSameDay, format, differenceInSeconds } from "date-fns";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

// "04:23:17" desde milisegundos.
export function formatHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// "857" — tres dígitos de milisegundos del display.
export function formatMs(ms) {
  return pad(Math.max(0, Math.floor(ms)) % 1000, 3);
}

// "2h 14m" / "14m 32s" / "47s" — para resúmenes humanos.
export function formatHumanDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m ${s % 60}s`;
  return `${h}h ${m}m`;
}

// "8h 41m 03s" — variante con segundos siempre, útil para cards.
export function formatHumanDurationLong(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h === 0 && m === 0) return `${sec}s`;
  if (h === 0) return `${m}m ${pad(sec)}s`;
  return `${h}h ${pad(m)}m`;
}

// Elapsed actual de una sesión (en ms). Si está activa, tomamos `now`.
export function getSessionElapsedMs(session, now = Date.now()) {
  if (!session) return 0;
  const start = new Date(session.started_at).getTime();
  const end = session.ended_at ? new Date(session.ended_at).getTime() : now;
  return Math.max(0, end - start);
}

// Divide una sesión en porciones por día local. Útil para distribuir
// el tiempo a la columna "Hoy" cuando la sesión cruza medianoche.
// Devuelve [{ day: Date (startOfDay local), seconds: int }].
export function splitSessionByDay(session, now = Date.now()) {
  if (!session) return [];
  const startMs = new Date(session.started_at).getTime();
  const endMs = session.ended_at ? new Date(session.ended_at).getTime() : now;
  if (endMs <= startMs) return [];

  const out = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const dayStart = startOfDay(new Date(cursor));
    const dayEnd = endOfDay(new Date(cursor)).getTime() + 1; // exclusive
    const sliceEnd = Math.min(endMs, dayEnd);
    out.push({
      day: dayStart,
      seconds: Math.round((sliceEnd - cursor) / 1000),
    });
    cursor = sliceEnd;
  }
  return out;
}

// Totales por categoría dentro de un rango (Date inclusive, Date exclusive).
// Si la sesión está activa, suma hasta `now`. Devuelve Map<categoryId, seconds>.
export function totalsByCategory(sessions, fromDate, toDate, now = Date.now()) {
  const fromMs = fromDate ? fromDate.getTime() : -Infinity;
  const toMs = toDate ? toDate.getTime() : Infinity;
  const map = new Map();

  for (const s of sessions || []) {
    const sStart = new Date(s.started_at).getTime();
    const sEnd = s.ended_at ? new Date(s.ended_at).getTime() : now;
    if (sEnd <= fromMs || sStart >= toMs) continue;
    const overlapStart = Math.max(sStart, fromMs);
    const overlapEnd = Math.min(sEnd, toMs);
    const sec = Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
    if (sec === 0) continue;
    map.set(s.category_id, (map.get(s.category_id) || 0) + sec);
  }
  return map;
}

// Total agregado de un rango (todas las categorías). En segundos.
export function totalSecondsInRange(sessions, fromDate, toDate, now = Date.now()) {
  let total = 0;
  for (const sec of totalsByCategory(sessions, fromDate, toDate, now).values()) {
    total += sec;
  }
  return total;
}

// Totales por space ROOT en un rango. Cuando una sesión tiene space_id de un
// subspace, sube por parent_space_id hasta el root y suma al root.
// Sessions sin space_id (legacy) se ignoran.
//
// Devuelve Map<spaceRootId, seconds>.
export function totalsBySpaceRoot(sessions, spaces, fromDate, toDate, now = Date.now()) {
  const fromMs = fromDate ? fromDate.getTime() : -Infinity;
  const toMs = toDate ? toDate.getTime() : Infinity;
  const map = new Map();
  // Cache: space_id → root_id
  const rootCache = new Map();
  const spaceById = new Map((spaces || []).map((s) => [s.id, s]));
  function resolveRoot(spaceId) {
    if (!spaceId) return null;
    if (rootCache.has(spaceId)) return rootCache.get(spaceId);
    let cur = spaceById.get(spaceId);
    while (cur?.parent_space_id) {
      const parent = spaceById.get(cur.parent_space_id);
      if (!parent) break;
      cur = parent;
    }
    const rootId = cur?.id || null;
    rootCache.set(spaceId, rootId);
    return rootId;
  }

  for (const s of sessions || []) {
    if (!s.space_id) continue;
    const rootId = resolveRoot(s.space_id);
    if (!rootId) continue;
    const sStart = new Date(s.started_at).getTime();
    const sEnd = s.ended_at ? new Date(s.ended_at).getTime() : now;
    if (sEnd <= fromMs || sStart >= toMs) continue;
    const overlapStart = Math.max(sStart, fromMs);
    const overlapEnd = Math.min(sEnd, toMs);
    const sec = Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
    if (sec === 0) continue;
    map.set(rootId, (map.get(rootId) || 0) + sec);
  }
  return map;
}

// Para el chart de barras apiladas: por cada día del rango, totales por categoría.
// Devuelve [{ dayKey, dayLabel, [categoryId]: seconds, total }].
export function totalsByDay(sessions, days, now = Date.now()) {
  return days.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    const map = totalsByCategory(sessions, dayStart, dayEnd, now);
    const row = {
      dayKey: format(dayStart, "yyyy-MM-dd"),
      dayLabel: format(dayStart, "EEE d"),
      total: 0,
    };
    for (const [catId, sec] of map.entries()) {
      row[catId] = sec;
      row.total += sec;
    }
    return row;
  });
}

// Helpers de rango — devuelven [from, to) Date.
export function rangeForPeriod(period, anchor = new Date()) {
  const today = startOfDay(anchor);
  if (period === "today") return [today, addDays(today, 1)];
  if (period === "week") {
    // Lunes a domingo (siguiente lunes).
    const dow = today.getDay(); // 0=Dom..6=Sáb
    const daysSinceMon = (dow + 6) % 7;
    const monday = addDays(today, -daysSinceMon);
    return [monday, addDays(monday, 7)];
  }
  if (period === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return [first, next];
  }
  // "all" — 1 año atrás hasta mañana, suficiente para MVP.
  return [addDays(today, -365), addDays(today, 1)];
}

// Lista de Date (startOfDay) para los días del período seleccionado.
export function daysOfPeriod(period, anchor = new Date()) {
  const [from, to] = rangeForPeriod(period, anchor);
  const out = [];
  let d = from;
  while (d < to) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export { isSameDay, differenceInSeconds, startOfDay, addDays, format };
