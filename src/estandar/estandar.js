// La lógica de la pantalla de onboarding del equipo (pieza 2 del roadmap).
//
// Puro, sin React ni Supabase. El catálogo —qué se califica, cómo, qué es un 10 y
// qué es un 1— vive en `catalogo.json`, sacado LITERAL de docs/estandar-inforce.md.
// Acá está lo que el Estándar dice en prosa y la pantalla necesita como regla:
// quién llena qué, qué puntos se apagan, cuánto lleva cada uno.

import catalogo from "./catalogo.json";

export { catalogo };

// «Cada quien llena lo suyo: José en su llamada, Nath en la suya, Deison en la suya
// — sobre el mismo perfil.» El reparto es el del mapa de dimensiones del Estándar.
export const LLAMADAS = [
  { id: "jose", quien: "José", titulo: "Estrategia", dimensiones: [1, 2, 3, 6, 8, 9] },
  { id: "nath", quien: "Nath", titulo: "Contenido y marca", dimensiones: [4, 7] },
  { id: "deison", quien: "Deison", titulo: "Tráfico y datos", dimensiones: [5, 10] },
];

const sinTildes = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Qué llamada es la de esta persona del equipo (por nombre: «Jose» ≡ «José»).
export function llamadaDe(miembro) {
  const nombre = sinTildes(miembro?.name).split(/\s+/)[0];
  return LLAMADAS.find((l) => sinTildes(l.quien) === nombre) || null;
}

// «Cada uno edita lo suyo y lee lo de los anteriores.» Un admin puede corregir
// cualquier punto (José es admin y es quien responde por el diagnóstico entero).
export function puedeEditar(miembro, dimensionN) {
  if (!miembro) return false;
  if (miembro.role === "admin") return true;
  return !!llamadaDe(miembro)?.dimensiones.includes(dimensionN);
}

export const dimension = (n) => catalogo.dimensiones.find((d) => d.n === n) || null;

export function puntosDe(n, { aspiracional = false } = {}) {
  const d = dimension(n);
  if (!d) return [];
  // Los cuatro puntos aspiracionales solo existen si la marca es aspiracional. Van
  // al final de la dimensión 1, que es donde se decide qué es la marca.
  return n === 1 && aspiracional ? [...d.puntos, ...(catalogo.aspiracional?.puntos || [])] : d.puntos;
}

// ── Puntos que se apagan ────────────────────────────────────────────────────
// «Los puntos condicionales se ocultan solos cuando no aplican, en vez de quedar en
// blanco.» Reglas que el Estándar y el roadmap dan explícitas:
//   · marca aspiracional → el 1.5 y el 1.9 no aplican
//   · el 1.9 solo se llena si el grueso del mercado está en conciencia 1–2
//   · el 8.1 en No apaga el bloque de incentivos y canales (8.6, 8.7, 8.8)
// `notas` = { [punto]: { calificacion, descripcion, no_aplica } }
export function noAplica(puntoId, { notas = {}, tipoMarca } = {}) {
  const aspiracional = tipoMarca === "aspiracional";
  if (aspiracional && (puntoId === "1.5" || puntoId === "1.9")) return "No aplica en marcas aspiracionales.";
  if (puntoId.startsWith("A.") && !aspiracional) return "Solo aplica en marcas aspiracionales.";

  if (puntoId === "1.9") {
    const dist = notas["1.7"]?.calificacion?.distribucion;
    if (Array.isArray(dist) && dist.length >= 2) {
      const bajos = (Number(dist[0]) || 0) + (Number(dist[1]) || 0);
      if (bajos < 50) return "Solo aplica si el grueso del mercado está en conciencia 1–2.";
    }
  }

  // «El 8.1 abre o cierra la sección: si la marca no es de recompra, se salta el
  // bloque de incentivos y canales y se trabaja el AOV.» → 8.6, 8.7 y 8.8.
  if (["8.6", "8.7", "8.8"].includes(puntoId) && notas["8.1"]?.calificacion?.si === false) {
    return "La marca no es de recompra (8.1): se salta incentivos y canales, y se trabaja el AOV.";
  }
  return notas[puntoId]?.no_aplica ? "Marcado como no aplica." : null;
}

// ── ¿Está calificado? ───────────────────────────────────────────────────────
export function estaCalificado(punto, nota) {
  if (!nota) return false;
  const c = nota.calificacion;
  switch (punto.califica) {
    case "1_10": return typeof c?.nota === "number";
    case "si_no": return typeof c?.si === "boolean";
    case "descripcion": return String(nota.descripcion || "").trim().length > 0;
    default:
      return (c && Object.keys(c).length > 0) || String(nota.descripcion || "").trim().length > 0;
  }
}

// Cuánto lleva una dimensión: solo cuentan los puntos que aplican a ESTA marca.
export function progresoDimension(n, ctx = {}) {
  const puntos = puntosDe(n, { aspiracional: ctx.tipoMarca === "aspiracional" });
  const aplican = puntos.filter((p) => !noAplica(p.id, ctx));
  const hechos = aplican.filter((p) => estaCalificado(p, ctx.notas?.[p.id]));
  return { total: aplican.length, hechos: hechos.length, ocultos: puntos.length - aplican.length };
}

export function progresoLlamada(llamada, ctx = {}) {
  return llamada.dimensiones.reduce((acc, n) => {
    const p = progresoDimension(n, ctx);
    return { total: acc.total + p.total, hechos: acc.hechos + p.hechos };
  }, { total: 0, hechos: 0 });
}

// Promedio de las notas 1–10 de una dimensión (lo que ya esté calificado).
export function notaDimension(n, ctx = {}) {
  const notas = puntosDe(n, { aspiracional: ctx.tipoMarca === "aspiracional" })
    .filter((p) => p.califica === "1_10" && !noAplica(p.id, ctx))
    .map((p) => ctx.notas?.[p.id]?.calificacion?.nota)
    .filter((v) => typeof v === "number");
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}

// ── Lo que ya dijo el cliente en el formulario ──────────────────────────────
// `perfil` = filas de brand_profile_data. Cada una viene etiquetada con los puntos
// del Estándar que alimenta; los `N.0` son datos de base de la dimensión N.
export function datosDelFormulario(perfil = [], { punto, dimension: n } = {}) {
  return perfil.filter((f) => {
    const tags = f.puntos_estandar || [];
    if (punto) return tags.includes(punto);
    return tags.some((t) => t === `${n}.0` || t.startsWith(`${n}.`));
  });
}

// Los dos puntos de la D2 no se califican en la llamada: salen del formulario.
//   2.1 · salud del margen   → el semáforo del aire
//   2.2 · ¿conoce sus números? → cuántas casillas «no lo sé» marcó
export function calculadoPara(puntoId, perfil = []) {
  const valor = (campo) => perfil.find((f) => f.campo === campo)?.valor ?? null;
  if (puntoId === "2.1") return valor("salud_margen");
  if (puntoId === "2.2") return valor("conoce_numeros");
  return null;
}

// ── Paso a paso ─────────────────────────────────────────────────────────────
// La dimensión no se muestra como una lista de catorce fichas: se recorre de a
// pocas, para que el cliente —que está mirando la pantalla— sienta una conversación
// y no un interrogatorio. Un paso = una sección del Estándar; si la sección es
// larga (o la dimensión no trae secciones), se parte en tandas de `max`.
export function pasosDe(puntos = [], max = 3) {
  const pasos = [];
  let grupo = null;
  for (const p of puntos) {
    const sec = p.seccion || "";
    if (!grupo || grupo.seccion !== sec || grupo.puntos.length >= max) {
      grupo = { seccion: sec, puntos: [] };
      pasos.push(grupo);
    }
    grupo.puntos.push(p);
  }
  return pasos;
}

// Por dónde seguir: el primer paso que todavía tiene algo sin calificar.
export function primerPasoPendiente(pasos, notas = {}) {
  const i = pasos.findIndex((paso) => paso.puntos.some((p) => p.origen !== "calculado" && !estaCalificado(p, notas[p.id])));
  return i === -1 ? 0 : i;
}
