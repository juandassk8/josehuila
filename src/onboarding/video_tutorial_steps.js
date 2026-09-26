// Configuración de los videos tutoriales del onboarding.
// El orden importa — es el orden en que se le muestran al cliente.
//
// `sectionKey` matchea las keys del NAV_ITEMS en CompanyWorkspace.jsx —
// el sidebar destaca el ítem cuyo key coincide cuando el video se reproduce.
// Si sectionKey es null, no se highlightea nada (caso intro).
// Si es array, se highlightean varios items simultáneamente.

import { BACKEND_URL } from "../lib/backend.js";

const STORAGE_BASE = `${BACKEND_URL}/storage/v1/object/public/tutorials`;

// Helper: encodea cada filename respetando espacios y caracteres especiales.
const url = (filename) => `${STORAGE_BASE}/${encodeURIComponent(filename)}`;

export const VIDEO_TUTORIAL_STEPS = [
  {
    sectionKey: null, // intro general — no highlight de sidebar
    title: "Introducción",
    description: "Bienvenido a Inforce. En este tutorial te muestro cómo funciona toda la plataforma para que puedas sacarle el máximo provecho.",
    videoUrl: url("01 - Introduccion.MOV"),
  },
  {
    sectionKey: "home",
    title: "Resumen",
    description: "Tour por las secciones principales de la plataforma. Mirá el panorama completo antes de entrar en detalle a cada herramienta.",
    videoUrl: url("02 - Resumen.MOV"),
  },
  {
    sectionKey: "reportes",
    title: "Reportes",
    description: "Cómo leer los dashboards de performance: ROAS, CPA, CTR, CPM. Identificación automática de ganadores y bleeders por campaña, conjunto y creativo.",
    videoUrl: url("03 - Reportes.MOV"),
  },
  {
    sectionKey: "despliegue",
    title: "Despliegue Creativo",
    description: "Tu sistema de planificación creativa por etapas (TOFU/MOFU/BOFU): conceptos, ángulos, simulador de escala y revisión de slots.",
    videoUrl: url("04 - Despliegue creativo.MOV"),
  },
  {
    sectionKey: "pipeline",
    title: "Content Pipeline",
    description: "El flujo completo de producción: de la idea a la publicación. Seguí cada etapa, asignaciones y deadlines del equipo.",
    videoUrl: url("05 - Content Pipeline.MOV"),
  },
  {
    // Este video cubre 3 secciones — el sidebar resalta las 3 simultáneamente.
    sectionKey: ["tareas", "equipo", "papelera"],
    title: "Tareas, Equipo y Papelera",
    description: "Tu sistema de tareas con espacios y subespacios, asignados, recurrencias y timer. Vista de equipo y papelera para recuperar tareas eliminadas.",
    videoUrl: url("06 - Tareas.MOV"),
  },
];

export const TUTORIAL_TOTAL_STEPS = VIDEO_TUTORIAL_STEPS.length;
