import { DS } from "../../lib/design.js";

export const CONTENT_CATEGORIES = [
  { key: "referencias", label: "Referencias", icon: "💡", maxDays: 1 },
  { key: "guiones",     label: "Guiones",     icon: "✍️", maxDays: 2 },
  { key: "grabacion",   label: "Grabación",   icon: "🎬", maxDays: 3 },
  { key: "edicion",     label: "Edición",     icon: "✂️", maxDays: 3 },
  { key: "estaticos",   label: "Estáticos",   icon: "🎨", maxDays: 2 },
  { key: "entrega",     label: "Entrega",     icon: "📦", maxDays: 1 },
];

// Tipos de referencia (solo aplica a categoría 'referencias')
export const REFERENCE_TYPES = [
  { key: "video",    label: "Video",    icon: "🎬" },
  { key: "estatico", label: "Estático", icon: "🖼" },
];

// IMPORTANTE: colorHex tiene prioridad sobre `color` (que mapea a DS[...]).
// Razón: para "no_ejecutado" antes mapeábamos a DS.textMuted que en dark es
// "rgba(255,255,255,0.3)" — un rgba string. El patrón `${color}14` que se usa
// para alphas en CSS generaba "rgba(...)14" inválido y algunos browsers se
// quedaban con el rgba sin el sufijo, dejando un fondo blanco semi-transparente.
// Forzamos hex puro para que el alpha-append siempre sea CSS válido.
export const CONTENT_STATUS = [
  { key: "no_ejecutado", label: "No ejecutado",     icon: "○", colorHex: "#6B7280" },
  { key: "en_progreso",  label: "En progreso",      icon: "⏳", color: "blue" },
  { key: "riesgo",       label: "Riesgo de retraso",icon: "⚠",  color: "amber" },
  { key: "bloqueo",      label: "Bloqueo",          icon: "⛔", color: "red" },
  { key: "enviado",      label: "Enviado",          icon: "📤", color: "purple" },
  { key: "aprobado",     label: "Aprobado",         icon: "✓",  color: "green" },
];

export function contentStatusMeta(status) {
  return CONTENT_STATUS.find((s) => s.key === status) || CONTENT_STATUS[0];
}

export function contentStatusColor(status) {
  const m = contentStatusMeta(status);
  if (m.colorHex) return m.colorHex;
  return DS[m.color] || "#6B7280";
}

// Health dot (verde/amarillo/rojo) por cliente basado en avance de contenido + performance
export function clientHealthDot({ milestones, reports, sla, daysElapsed }) {
  // Contenido: % de categorías con al menos un "aprobado"
  const approvedByCat = new Set(
    milestones.filter((m) => m.status === "aprobado").map((m) => m.category)
  );
  const catCount = approvedByCat.size;
  const hasBlock = milestones.some((m) => m.status === "bloqueo");
  const hasRisk = milestones.some((m) => m.status === "riesgo");

  // Performance: reportes enviados / esperados según días transcurridos hábiles
  const expected = Math.max(0, daysElapsed) * 2;
  const sent = reports.filter((r) => r.sent_at).length;
  const perfRatio = expected ? sent / expected : 1;

  if (hasBlock) return { dot: DS.red, label: "Bloqueo activo" };
  if (catCount >= 5 && perfRatio >= 0.9) return { dot: DS.green, label: "Al día" };
  if (hasRisk || perfRatio < 0.6 || catCount < 3) return { dot: DS.red, label: "Atrasado" };
  return { dot: DS.amber, label: "En camino" };
}

// Resumen por bloque de contenido
export function contentSummary(milestones) {
  const approved = milestones.filter((m) => m.status === "aprobado").length;
  const total = milestones.length;
  const categoriesHit = new Set(
    milestones.filter((m) => m.status === "aprobado").map((m) => m.category)
  ).size;
  return { approved, total, categoriesHit, categoriesTotal: CONTENT_CATEGORIES.length };
}

// Resumen por bloque de performance
export function performanceSummary(reports, sla) {
  const sent = reports.filter((r) => r.sent_at).length;
  const total = reports.length;
  const daysWithNote = new Set(
    sla.filter((s) => s.question && s.question.trim().length > 0).map((s) => s.day_date)
  ).size;
  return { sent, total, daysWithNote };
}

// Agrupa hitos por (category, day_of_week) -> array (puede haber múltiples)
export function buildMilestoneLookup(milestones) {
  const map = new Map();
  for (const m of milestones) {
    const key = `${m.category}__${m.day_of_week}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}

export function buildReportLookup(reports) {
  const map = new Map();
  for (const r of reports) {
    const key = `${r.report_date}__${r.report_type}`;
    map.set(key, r);
  }
  return map;
}

export function buildSlaLookup(sla) {
  const map = new Map();
  for (const s of sla) {
    if (!map.has(s.day_date)) map.set(s.day_date, []);
    map.get(s.day_date).push(s);
  }
  return map;
}
