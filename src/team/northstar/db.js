import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

// Año actual y semana ISO actual — helpers para arrancar la vista en el
// mes/semana correcto. ISO weeks: lunes como primer día.
export function currentYear() {
  return new Date().getFullYear();
}

export function currentMonth() {
  return new Date().getMonth() + 1; // 1-12
}

export function currentIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function isoWeekRange(year, week) {
  // Lunes y domingo de la semana ISO dada. Útil para mostrar "5-11 May".
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday, to: sunday };
}

// ── YEAR ──────────────────────────────────────────────────────────
export async function getYear(year) {
  const { data, error } = await database
    .from("north_star_year")
    .select("*")
    .eq("year", year)
    .maybeSingle();
  if (error) logger.error("[northstar] getYear:", error);
  return data;
}

export async function upsertYear(payload) {
  const { data, error } = await database
    .from("north_star_year")
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "year" })
    .select()
    .single();
  if (error) logger.error("[northstar] upsertYear:", error);
  return data;
}

// ── MONTH ─────────────────────────────────────────────────────────
export async function getMonth(year, month) {
  const { data, error } = await database
    .from("north_star_months")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (error) logger.error("[northstar] getMonth:", error);
  return data;
}

export async function upsertMonth(payload) {
  const { data, error } = await database
    .from("north_star_months")
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "year,month" })
    .select()
    .single();
  if (error) logger.error("[northstar] upsertMonth:", error);
  return data;
}

// ── WEEK ──────────────────────────────────────────────────────────
export async function getWeek(year, weekIso) {
  const { data, error } = await database
    .from("north_star_weeks")
    .select("*")
    .eq("year", year)
    .eq("week_iso", weekIso)
    .maybeSingle();
  if (error) logger.error("[northstar] getWeek:", error);
  return data;
}

export async function listWeeks(year) {
  const { data, error } = await database
    .from("north_star_weeks")
    .select("id, year, week_iso, month, title, updated_at")
    .eq("year", year)
    .order("week_iso", { ascending: false });
  if (error) logger.error("[northstar] listWeeks:", error);
  return data || [];
}

export async function upsertWeek(payload) {
  const { data, error } = await database
    .from("north_star_weeks")
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "year,week_iso" })
    .select()
    .single();
  if (error) logger.error("[northstar] upsertWeek:", error);
  return data;
}

// Crea una semana vacía con los focos por defecto si no existe aún.
export async function ensureWeek(year, weekIso, month) {
  const existing = await getWeek(year, weekIso);
  if (existing) return existing;
  const empty = {
    year,
    week_iso: weekIso,
    month: month || null,
    title: `Semana ${weekIso}`,
    focos: DEFAULT_FOCOS,
    action_items: [],
    daily_pulse: DEFAULT_PULSE,
    retro: { what_worked: "", blocker: "", adjustment: "" },
  };
  return upsertWeek(empty);
}

// Plantilla por defecto basada en el Planificador Semanal del PDF.
export const DEFAULT_FOCOS = [
  {
    key: "marca",
    label: "Marca Personal",
    description: "Sistematizar y documentar el proceso de creación de contenido con el equipo ejecutando perfectamente.",
    items: [
      { text: "Guionizando el día que es", done: false },
      { text: "Grabando el día que es", done: false },
      { text: "Cortando el día que es", done: false },
      { text: "Editando el día que es", done: false },
      { text: "Publicando el día y a la hora que es", done: false },
    ],
    goals: [
      { label: "Videos publicados", target: 21, actual: 0 },
      { label: "Vistas generadas", target: 1000000, actual: 0 },
    ],
  },
  {
    key: "agencia",
    label: "Agencia",
    description: "Ejecutar de forma excelente la estrategia de ads en todas las empresas, demostrando resultados.",
    items: [],
    goals: [
      { label: "Videos publicados (clientes)", target: 21, actual: 0 },
      { label: "Vistas generadas (clientes)", target: 1000000, actual: 0 },
    ],
  },
  {
    key: "ingresos",
    label: "Ingresos",
    description: "Tener todo el flujo de clientes para la agencia logrando facturar 50M en este mes.",
    items: [
      { text: "Ejecutar secuencia de historias para atraer mensajes de clientes", done: false },
      { text: "Recuperar o rehacer flujo de llamada para cerrar clientes", done: false },
      { text: "Reunirme con empresas de entre 100M-200M (cobrar 10M)", done: false },
    ],
    goals: [
      { label: "Clientes cerrados", target: 2, actual: 0 },
      { label: "Facturación mes ($)", target: 20000000, actual: 0 },
    ],
  },
];

export const DEFAULT_PULSE = {
  monday:    { priority: "Reunión Squad + Planificación",      status: "" },
  tuesday:   { priority: "Día de Grabación Masiva",            status: "" },
  wednesday: { priority: "Cierre de Ventas y Seguimiento",     status: "" },
  thursday:  { priority: "Auditoría Técnica y Estrategia",     status: "" },
  friday:    { priority: "Revisión de KPIs y Retro de la semana", status: "" },
};
