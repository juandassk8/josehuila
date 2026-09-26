import {
  differenceInCalendarDays,
  format,
  isToday,
  isValid,
  parseISO,
  addYears,
  setMonth,
  setDate,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
};

export const daysUntil = (value) => {
  const d = toDate(value);
  if (!d) return null;
  return differenceInCalendarDays(startOfDay(d), startOfDay(new Date()));
};

export const isOverdue = (value) => {
  const diff = daysUntil(value);
  return diff != null && diff < 0;
};

export const isDueToday = (value) => {
  const d = toDate(value);
  return d ? isToday(d) : false;
};

export const fmtDueDate = (value) => {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysUntil(d);
  if (diff === 0) return "Vence hoy";
  if (diff === 1) return "Vence mañana";
  if (diff === -1) return "Vencida ayer";
  if (diff < 0) return `Vencida ${Math.abs(diff)} días`;
  if (diff <= 7) return `En ${diff} días`;
  return format(d, "d MMM", { locale: es });
};

export const fmtShort = (value) => {
  const d = toDate(value);
  return d ? format(d, "d MMM", { locale: es }) : "";
};

export const fmtRelative = (value) => {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return format(d, "d MMM", { locale: es });
};

// Days until next occurrence of birthday (day/month). Null if missing.
export const daysUntilBirthday = (day, month) => {
  if (!day || !month) return null;
  const today = startOfDay(new Date());
  let next = setDate(setMonth(new Date(today.getFullYear(), 0, 1), month - 1), day);
  next = startOfDay(next);
  if (differenceInCalendarDays(next, today) < 0) next = addYears(next, 1);
  return differenceInCalendarDays(next, today);
};

export const fmtBirthday = (day, month) => {
  if (!day || !month) return "";
  const d = setDate(setMonth(new Date(2024, 0, 1), month - 1), day);
  return format(d, "d 'de' MMMM", { locale: es });
};

export const fmtTime = (timeStr) => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

export const fmtDueDateWithTime = (dateVal, timeStr) => {
  const base = fmtDueDate(dateVal);
  if (!base || !timeStr) return base;
  return `${base} ${fmtTime(timeStr)}`;
};

export const isOnlineSince = (lastSeen, thresholdMinutes = 5) => {
  const d = toDate(lastSeen);
  if (!d) return false;
  return (Date.now() - d.getTime()) / 60000 < thresholdMinutes;
};
