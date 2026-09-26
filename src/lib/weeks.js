import { startOfWeek, addDays, format, isSameDay, isBefore, startOfDay } from "date-fns";

// Monday-Saturday week (domingo excluido).
// Lunes = 1 en date-fns cuando weekStartsOn: 1.

export function weekStartMonday(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

// Returns array of 6 Date objects: Mon..Sat
export function weekDaysMonToSat(monday) {
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i));
}

// "13-18 abr" — short Spanish label
export function weekLabel(monday) {
  const days = weekDaysMonToSat(monday);
  const first = days[0];
  const last = days[5];
  const sameMonth = first.getMonth() === last.getMonth();
  if (sameMonth) {
    return `${format(first, "d")}–${format(last, "d MMM")}`;
  }
  return `${format(first, "d MMM")} – ${format(last, "d MMM")}`;
}

export function isoDate(d) {
  // YYYY-MM-DD (local time, no TZ shift)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISODate() {
  return isoDate(new Date());
}

export function yesterdayISODate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

export const DAY_LABELS_SHORT = ["L", "M", "X", "J", "V", "S"];
export const DAY_LABELS_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export { addDays, isSameDay, isBefore, startOfDay, format };
