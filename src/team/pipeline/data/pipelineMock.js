// Content Pipeline — STORE MOCK (fixtures tipados) + puntos de integración.
//
// Respeta el modelo de estado del README. Es la fuente de datos temporal del
// módulo mientras se construye la UI a alta fidelidad. En la fase de persistencia
// se reemplaza por queries reales a Supabase (tabla briefs + slots con company_id)
// SIN cambiar la forma de los objetos que consume la UI.
//
// TODO(persistencia): mapear a Supabase. Ver pipelineConstants para el mapeo de etapas.

import { useCallback, useMemo, useState } from "react";
import { STAGES } from "../pipelineConstants.js";
import { EMPTY_SCRIPT_HTML } from "../scriptHtml.js";

// ── Catálogos (en prod: tablas de catálogo por empresa) ──────────────────────
export const CATALOGS = {
  productos: ["Fresh Breath", "Gel Dental", "Kit Dental", "Snacks Dentales"],
  angulos: ["Mal aliento", "Sarro / placa", "Ahorro vs veterinario", "Rutina fácil", "Salud a largo plazo"],
  conceptos: ["UGC Testimonio", "Antes / Después", "Educativo veterinario", "Demostración producto", "Comparativa"],
  creadores: ["Nath", "Dani", "Sin creador"],
  editores: ["Johan", "Jul", "Deison"],
};

// ── Banco creativo (conteo de uso incluido) — solo lo que "Planear creativos"
// necesita mostrar. En prod: se lee del banco real (concept_bank). ─────────────
export const BANK = [
  { id: "C-101", stage: "tofu", name: "Perro con mal aliento (gancho)", idea: "Abrir con el problema en frío", refs: 4 },
  { id: "C-102", stage: "tofu", name: "Dueña sorprendida", idea: "Reacción genuina UGC", refs: 3 },
  { id: "C-201", stage: "mofu", name: "Veterinario explica", idea: "Autoridad y confianza", refs: 5 },
  { id: "C-202", stage: "mofu", name: "Antes / Después 14 días", idea: "Prueba visual del resultado", refs: 2 },
  { id: "C-301", stage: "bofu", name: "Oferta + garantía", idea: "Cierre con incentivo", refs: 6 },
];

let _seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

// Slot con defaults del modelo del README.
export function makeSlot(brief, num, tipo, patch = {}) {
  return {
    id: uid("slot"), brief, num, tipo,
    producto: "", formato: tipo === "estatico" ? "Imagen" : "", angulo: "", concepto: "",
    nivel_conciencia: "", imagenes: [],
    creador: tipo === "video" ? "Sin creador" : "", desc: "",
    ref: "", loom: "", stage: "idea",
    script: EMPTY_SCRIPT_HTML, refs: [], notas: "",
    editor: "", due: "", drive: "", drive_raw: "", publicado: false, feedback: "",
    metrics: { gasto: "", resultados: "", cpa: "", roas: "" },
    open: false, detail: false,
    ...patch,
  };
}

// ── Semilla: 2 briefs con slots repartidos por etapa (aspecto realista) ────────
export function seed(companyId) {
  const b31 = { id: "B31", n: "Brief 31", created: "27 jul", owner: "Nath", company_id: companyId };
  const b32 = { id: "B32", n: "Brief 32", created: "30 jul", owner: "Dani", company_id: companyId };

  const slots = [
    makeSlot("B31", 1, "video", { producto: "Fresh Breath", angulo: "Mal aliento", concepto: "UGC Testimonio", creador: "Nath", desc: "gancho fuerte", stage: "campaign", drive: "", publicado: false }),
    makeSlot("B31", 2, "video", { producto: "Gel Dental", angulo: "Sarro / placa", concepto: "Educativo veterinario", creador: "Dani", desc: "explica el sarro", stage: "feedback", publicado: true, metrics: { gasto: "420", resultados: "38", cpa: "11.05", roas: "2.4" } }),
    makeSlot("B31", 3, "estatico", { producto: "Kit Dental", angulo: "Ahorro vs veterinario", concepto: "Comparativa", desc: "precio vs vet", stage: "edit", editor: "Johan", due: "" }),
    makeSlot("B31", 4, "video", { producto: "Snacks Dentales", angulo: "Rutina fácil", concepto: "Demostración producto", creador: "Nath", desc: "rutina de 10s", stage: "scripting" }),
    makeSlot("B32", 1, "video", { producto: "Fresh Breath", angulo: "Salud a largo plazo", concepto: "UGC Testimonio", creador: "Dani", desc: "", stage: "idea" }),
    makeSlot("B32", 2, "estatico", { producto: "Gel Dental", angulo: "Mal aliento", concepto: "Antes / Después", desc: "", stage: "idea" }),
    makeSlot("B32", 3, "video", { producto: "", angulo: "", concepto: "", creador: "Sin creador", desc: "", stage: "film", editor: "Jul" }),
  ];
  return { briefs: [b31, b32], slots };
}

// ── Puntos de integración (STUBS marcados TODO) ──────────────────────────────
// Interfaz estable: la UI solo llama estas funciones; en prod se cablea el backend.

// TODO(integración): Facebook Marketing API. Devuelve métricas del anuncio.
export async function fetchFacebookMetrics(/* slot */) {
  await new Promise((r) => setTimeout(r, 500));
  return { gasto: "312", resultados: "27", cpa: "11.56", roas: "2.1" };
}

// TODO(integración): Google Drive. Devuelve/crea la carpeta del creativo.
export function driveFolderUrl(slot) {
  return slot?.drive || "";
}
export function openDriveFolder(slot) {
  const url = driveFolderUrl(slot);
  if (url) window.open(url, "_blank", "noopener");
}

// TODO(integración): speech-to-text (reusar /api/transcribe con Whisper).
export async function transcribeVoiceNote(/* blob */) {
  await new Promise((r) => setTimeout(r, 800));
  return "El gancho funciona pero el CTA llega tarde; probar cerrar antes de los 8s.";
}

// ── Hook del store (una empresa) ─────────────────────────────────────────────
export function usePipelineMock(companyId) {
  const [state, setState] = useState(() => seed(companyId));

  const setSlots = useCallback((fn) => setState((s) => ({ ...s, slots: typeof fn === "function" ? fn(s.slots) : fn })), []);
  const setBriefs = useCallback((fn) => setState((s) => ({ ...s, briefs: typeof fn === "function" ? fn(s.briefs) : fn })), []);

  const updateSlot = useCallback((id, patch) => {
    setSlots((slots) => slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [setSlots]);

  const moveSlotStage = useCallback((id, stage) => updateSlot(id, { stage }), [updateSlot]);

  // Mover un brief de etapa = mover todos sus slots que estaban en la etapa origen.
  const moveBriefStage = useCallback((briefId, fromStage, toStage) => {
    setSlots((slots) => slots.map((s) =>
      s.brief === briefId && s.stage === fromStage ? { ...s, stage: toStage } : s));
  }, [setSlots]);

  const createBrief = useCallback(({ n, created, owner, plan = {} }) => {
    setState((s) => {
      const num = s.briefs.length + 1;
      const id = `B${30 + num}`;
      const brief = { id, n: n || `Brief ${num}`, created, owner, company_id: companyId };
      // N slots en blanco en etapa idea, con concepto precargado según el plan.
      const newSlots = [];
      let vNum = 0, eNum = 0;
      for (const [conceptId, counts] of Object.entries(plan)) {
        const concept = BANK.find((c) => c.id === conceptId);
        for (let i = 0; i < (counts.video || 0); i++) newSlots.push(makeSlot(id, ++vNum + eNum, "video", { concepto: concept?.name || "", stage: "idea" }));
        for (let i = 0; i < (counts.estatico || 0); i++) newSlots.push(makeSlot(id, vNum + ++eNum, "estatico", { concepto: concept?.name || "", stage: "idea" }));
      }
      if (!newSlots.length) newSlots.push(makeSlot(id, 1, "video", { stage: "idea" }));
      return { briefs: [brief, ...s.briefs], slots: [...s.slots, ...newSlots] };
    });
  }, [companyId]);

  const addBlankSlot = useCallback((briefId, tipo) => {
    setSlots((slots) => {
      const n = slots.filter((s) => s.brief === briefId).length + 1;
      return [...slots, makeSlot(briefId, n, tipo, { stage: "idea" })];
    });
  }, [setSlots]);

  // Expandir / colapsar todos los slots de un brief.
  const setAllOpen = useCallback((briefId, open) => {
    setSlots((slots) => slots.map((s) => (s.brief === briefId ? { ...s, open } : s)));
  }, [setSlots]);

  // Agregar una referencia del banco a un slot estático (máx 3). Provisional
  // hasta el modal "Elegir del banco" (F6): agrega la primera del banco que falte.
  const addBankRef = useCallback((slotId) => {
    setSlots((slots) => slots.map((s) => {
      if (s.id !== slotId || s.refs.length >= 3) return s;
      const next = BANK.find((c) => !s.refs.includes(c.id));
      return next ? { ...s, refs: [...s.refs, next.id] } : s;
    }));
  }, [setSlots]);

  const slotsByBrief = useMemo(() => {
    const map = {};
    for (const s of state.slots) (map[s.brief] ||= []).push(s);
    return map;
  }, [state.slots]);

  return {
    briefs: state.briefs, slots: state.slots, slotsByBrief,
    catalogs: CATALOGS, bank: BANK, stages: STAGES,
    updateSlot, moveSlotStage, moveBriefStage, createBrief, addBlankSlot, setBriefs,
    setAllOpen, addBankRef,
  };
}
