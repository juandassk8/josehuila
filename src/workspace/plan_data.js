import { PLAN_ORIGIN } from "../lib/urls.js";
import { database } from "../lib/backend.js";

// ── Plan de implementación · capa de datos ───────────────────────────────
// El JSON de accionables es SOLO LECTURA para el portal (lo regenera Inforce).
// Lo único que el portal escribe es la tabla `plan_pasos` (estado por paso).

export const PLAN_JSON_URL = `${PLAN_ORIGIN}/planes-accionables.json`;

// Consultor → color, tinte, sección del documento y tema. El responsable sale
// del JSON; la sección se DERIVA de él (no hay campo nuevo en el JSON).
export const RESP = {
  "José":   { color: "var(--blue)",   tint: "rgba(74,144,226,0.13)",  seccion: "llamada-1", corta: "llamada 1", tema: "Estrategia" },
  "Nath":   { color: "var(--purple)", tint: "rgba(155,123,240,0.15)", seccion: "llamada-2", corta: "llamada 2", tema: "Creativo y copy" },
  "Deison": { color: "var(--green)",  tint: "rgba(52,192,138,0.13)",  seccion: "llamada-3", corta: "llamada 3", tema: "Tráfico y pauta" },
};

export const SECCIONES = [
  { id: "llamada-1", label: "Llamada 1", quien: "José", dot: "var(--blue)" },
  { id: "llamada-2", label: "Llamada 2", quien: "Nath", dot: "var(--purple)" },
  { id: "llamada-3", label: "Llamada 3", quien: "Deison", dot: "var(--green)" },
  { id: "estrategia", label: "Estrategia", quien: "Ángulos y objeciones", dot: "var(--neon)" },
];

const CACHE_KEY = "inforce_planes_accionables_v1";
let memoryCache = null;

// Fetch UNA sola vez por sesión: caché en memoria + sessionStorage.
export async function fetchPlanes({ force = false } = {}) {
  if (!force && memoryCache) return memoryCache;
  if (!force) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) { memoryCache = JSON.parse(raw); return memoryCache; }
    } catch { /* noop */ }
  }
  const res = await fetch(PLAN_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  memoryCache = data;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* noop */ }
  return data;
}

export function clearPlanesCache() {
  memoryCache = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

// Casa el plan por `cliente === slug` de la empresa.
export function findPlan(data, slug) {
  if (!data?.planes || !slug) return null;
  return data.planes.find((p) => p.cliente === slug) || null;
}

// Estado por paso, keyed por paso_id. Un paso_id que ya no existe en el JSON
// (huérfano) queda en el mapa pero nunca se consulta → se ignora en silencio.
export async function loadPlanPasos(cliente) {
  const { data, error } = await database.from("plan_pasos").select("*").eq("cliente", cliente);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.paso_id] = r; });
  return map;
}

// Upsert parcial: solo toca las columnas del patch, preserva el resto de la fila.
export async function upsertPlanPaso(cliente, pasoId, patch) {
  return database
    .from("plan_pasos")
    .upsert({ cliente, paso_id: pasoId, ...patch }, { onConflict: "cliente,paso_id" });
}

// ── Subtareas · estado anidado por accionable ───────────────────────────
// Igual que plan_pasos pero con clave compuesta (paso_id, sub_indice). El JSON
// es solo lectura; el portal solo escribe la tabla plan_subtareas.
export async function loadPlanSubtareas(cliente) {
  const { data, error } = await database.from("plan_subtareas").select("*").eq("cliente", cliente);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[`${r.paso_id}::${r.sub_indice}`] = r; });
  return map;
}

// Upsert parcial: preserva el resto de la fila (mismo shape que upsertPlanPaso).
export async function upsertPlanSubtarea(cliente, pasoId, subIndice, patch) {
  return database
    .from("plan_subtareas")
    .upsert({ cliente, paso_id: pasoId, sub_indice: subIndice, ...patch }, { onConflict: "cliente,paso_id,sub_indice" });
}

// ── Metas · checkpoints semanales ────────────────────────────────────────
// Mapa keyed `${meta_orden}::${semana}` → valor (0|1). "Sin marcar" = SIN FILA.
export async function loadPlanMetas(cliente) {
  const { data, error } = await database.from("plan_metas").select("*").eq("cliente", cliente);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[`${r.meta_orden}::${r.semana}`] = r.valor; });
  return map;
}

// valor null → borra la fila (sin marcar). valor 0|1 → upsert.
export async function setPlanMeta(cliente, metaOrden, semana, valor) {
  if (valor === null || valor === undefined) {
    return database
      .from("plan_metas")
      .delete()
      .match({ cliente, meta_orden: metaOrden, semana });
  }
  return database
    .from("plan_metas")
    .upsert({ cliente, meta_orden: metaOrden, semana, valor }, { onConflict: "cliente,meta_orden,semana" });
}

// "18 jul" — fecha corta en español a partir de un ISO / date string.
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
