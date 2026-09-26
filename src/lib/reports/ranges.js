// Rangos de fecha predefinidos para el panel de anuncios.
// Devuelven { from, to } con horas normalizadas (mediodía) para evitar
// sorpresas con DST.

function atNoon(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return atNoon(d);
}

function startOfMonth() {
  const d = new Date();
  return atNoon(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function rangeHoy() {
  const today = atNoon(new Date());
  return { from: today, to: today };
}

export function rangeAyer() {
  const y = daysAgo(1);
  return { from: y, to: y };
}

export function rangeSieteDias() {
  return { from: daysAgo(6), to: atNoon(new Date()) };
}

export function rangeEsteMes() {
  return { from: startOfMonth(), to: atNoon(new Date()) };
}

export function rangeTreintaDias() {
  return { from: daysAgo(29), to: atNoon(new Date()) };
}

export function rangeTodo() {
  return { from: new Date("2020-01-01T12:00:00"), to: atNoon(new Date()) };
}

export const RANGE_PRESETS = [
  { key: "hoy", label: "Hoy", getRange: rangeHoy },
  { key: "ayer", label: "Ayer", getRange: rangeAyer },
  { key: "7d", label: "7 días", getRange: rangeSieteDias },
  { key: "mes", label: "Este mes", getRange: rangeEsteMes },
  { key: "30d", label: "30 días", getRange: rangeTreintaDias },
  { key: "todo", label: "Todo", getRange: rangeTodo },
];

// Selección greedy de reportes no-solapados en un rango (copia de la lógica
// de App.jsx selectReportsForRange).
import { getReportDates } from "./periods.js";

export function selectReportsForRange(reports, from, to) {
  const parsed = reports.map((r) => {
    const dates = getReportDates(r);
    if (!dates) return null;
    const duration = (dates.to - dates.from) / 86400000;
    return { report: r, from: dates.from, to: dates.to, duration };
  }).filter(Boolean);

  const overlapping = parsed.filter((p) => p.from <= to && p.to >= from);
  overlapping.sort((a, b) => b.duration - a.duration);

  const selected = [];
  for (const item of overlapping) {
    const overlapsSelected = selected.some((s) => s.from <= item.to && s.to >= item.from);
    if (!overlapsSelected) selected.push(item);
  }
  return selected.map((s) => s.report);
}

// Parser que respeta el formato colombiano: "12.345,67" → 12345.67.
// `Number("12.345")` daría 12.345 (decimal), lo que infla los totales varios
// órdenes de magnitud si la data se guardó como string con separadores.
function toNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const parsed = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(parsed) ? parsed : 0;
}

// Agrega campos numéricos de varios reportes.
export function aggregateReports(reports) {
  const totals = {
    spend: 0,
    conversion: 0,
    purchases: 0,
    clicks: 0,
    impressions: 0,
    pageVisits: 0,
    initiatedCheckouts: 0,
  };
  let count = 0;
  for (const r of reports) {
    count++;
    totals.spend              += toNum(r.spend);
    totals.conversion         += toNum(r.conversion);
    totals.purchases          += toNum(r.purchases);
    totals.clicks             += toNum(r.clicks);
    totals.impressions        += toNum(r.impressions);
    totals.pageVisits         += toNum(r.pageVisits);
    totals.initiatedCheckouts += toNum(r.initiatedCheckouts);
  }
  return { totals, count };
}
