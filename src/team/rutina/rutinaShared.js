import { useEffect, useSyncExternalStore } from "react";
import { listBlocks } from "./rutinaDb.js";
import { logger } from "../../lib/logger.js";

export const CATS = {
  deep: { name: "Trabajo profundo", color: "#2F5BEA", work: "profundo" },
  light: { name: "Trabajo liviano", color: "#6F93F2", work: "liviano" },
  calls: { name: "Llamadas", color: "#8B5CF6" },
  gym: { name: "Gimnasio", color: "#E4572E" },
  therapy: { name: "Terapia", color: "#0E9AA7" },
  food: { name: "Comidas", color: "#D99A00" },
  fam: { name: "Familia y mascota", color: "#D6478F" },
  sis: { name: "Transporte y vueltas", color: "#6B7491" },
  self: { name: "Arreglarme y meditar", color: "#14A37F" },
  other: { name: "Otro", color: "#8A93B0" },
};
export const CAT_ORDER = ["deep", "light", "calls", "gym", "therapy", "food", "fam", "sis", "self", "other"];
export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DAY_LETTER = ["L", "M", "X", "J", "V", "S", "D"];

export const dayIndex = (date = new Date()) => (date.getDay() + 6) % 7;
export const nowMinutes = (date = new Date()) => date.getHours() * 60 + date.getMinutes();
export const pad = (n) => String(n).padStart(2, "0");
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - dayIndex(d));
  return d;
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function fmtTime(min, withSuffix = true) {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? "pm" : "am";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)}${withSuffix ? ` ${ap}` : ""}`;
}
export function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}
export const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const fromHHMM = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ---- Bloques de la rutina, compartidos entre "Mi rutina" y el panel de Mi agenda ----
let state = { memberId: null, blocks: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function reloadRoutineBlocks(memberId = state.memberId) {
  if (!memberId) return;
  const { data, error } = await listBlocks(memberId);
  if (error) { logger.warn("[rutina] bloques:", error.message); return; }
  if (memberId !== state.memberId) return;
  state = { memberId, blocks: data || [] };
  emit();
}

export function useRoutineBlocks(memberId) {
  useEffect(() => {
    if (!memberId || state.memberId === memberId) return;
    state = { memberId, blocks: null };
    emit();
    reloadRoutineBlocks(memberId);
  }, [memberId]);
  const snap = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state
  );
  return snap.memberId === memberId ? snap.blocks : null;
}
