import { startOfDay, isoDate } from "../../lib/weeks.js";

// Estado = 'verde' | 'naranja' | 'rojo' | 'gris'
// values: array de 'si' | 'no' | null/undefined (uno por KPI para ese día)
// date: Date del día que se está evaluando (local time)
// now: Date "ahora" (inyectable para tests)
export function dayStatus({ values, date, now = new Date() }) {
  const day = startOfDay(date);
  const today = startOfDay(now);

  if (day.getTime() > today.getTime()) return "gris";

  const total = values.length;
  const filled = values.filter((v) => v === "si" || v === "no").length;
  const allFilled = total > 0 && filled === total;
  const allSi = allFilled && values.every((v) => v === "si");
  const someNo = allFilled && values.some((v) => v === "no");

  if (day.getTime() === today.getTime()) {
    if (allSi) return "verde";
    if (allFilled && someNo) return "naranja";
    // hay celdas vacías
    const h = now.getHours();
    if (h < 18) return "gris";
    if (h < 20) return "naranja";
    return "rojo";
  }

  // día pasado
  if (allSi) return "verde";
  if (allFilled && someNo) return "naranja";
  return "rojo";
}

// Returns 0 | 1 for a given day (HITO column auto-calc)
export function dayHito(values) {
  if (!values.length) return 0;
  return values.every((v) => v === "si") ? 1 : 0;
}

// Weekly percentage of HITO achieved (días L-S con todos los KPIs en "sí")
export function weeklyHitoPct(daysValues) {
  if (!daysValues.length) return 0;
  const achieved = daysValues.filter(
    (vals) => vals.length > 0 && vals.every((v) => v === "si")
  ).length;
  return Math.round((achieved / daysValues.length) * 100);
}

// Percentage por KPI row: de los 6 días, cuántos son "sí"
export function kpiRowPct(rowValues) {
  const total = rowValues.length;
  if (!total) return 0;
  const si = rowValues.filter((v) => v === "si").length;
  return Math.round((si / total) * 100);
}

// Build a lookup: entries[kpiId][isoDate] = 'si' | 'no' | undefined
export function buildEntryLookup(entries) {
  const lookup = {};
  for (const e of entries || []) {
    if (!lookup[e.kpi_id]) lookup[e.kpi_id] = {};
    lookup[e.kpi_id][e.date] = e.value;
  }
  return lookup;
}

// Given kpis + entries + Date, return array of values for that day (order = kpis order)
export function valuesForDay(kpis, lookup, date) {
  const dateStr = isoDate(date);
  return kpis.map((k) => lookup[k.id]?.[dateStr] ?? null);
}
