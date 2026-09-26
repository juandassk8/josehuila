// El vocabulario del banco, para que la UI pueda explicar cada etiqueta.
//
// Hasta ahora los filtros solo sabían el NOMBRE de una etiqueta y cuántos
// conceptos la usaban. Con eso, "Óptica 21" y "Cabello 16" son dos palabras
// sueltas: no dicen qué significan, de qué nicho cuelgan, ni por qué "Oferta"
// es un concepto y no un ángulo.
//
// Las tablas `tax_*` sí lo saben — varias descripciones son textuales del curso
// de despliegue creativo. Esto las trae una vez y las deja en un mapa
// `eje → nombre → {descripcion, padre, grupo}` para que el selector las muestre.
//
// Se cachea en memoria: el vocabulario cambia cuando alguien lo edita a mano,
// no en medio de una sesión de filtrado.

import { database } from "../lib/backend.js";

let cache = null;
let enVuelo = null;

/** Mapa vacío con la forma correcta, para no tener que chequear null en la UI. */
function vacio() {
  return { concepto: {}, nicho: {}, subnicho: {}, angulo: {}, momento: {}, conciencia: {}, hook: {} };
}

export async function cargarTaxonomia() {
  if (cache) return cache;
  if (enVuelo) return enVuelo;

  enVuelo = (async () => {
    const out = vacio();
    try {
      const [conceptos, nichos, subnichos, angulos, momentos, conciencia, hooks] = await Promise.all([
        database.from("tax_conceptos").select("nombre, descripcion, etapa_tipica, formato_tipico, del_curso").eq("activo", true),
        database.from("tax_nichos").select("id, nombre").eq("activo", true),
        database.from("tax_subnichos").select("nombre, nicho_id").eq("activo", true),
        database.from("tax_angulos").select("nombre, grupo").eq("activo", true),
        database.from("tax_momentos").select("nombre, descripcion"),
        database.from("tax_conciencia").select("nivel, nombre, descripcion"),
        database.from("tax_hooks").select("nombre, ejemplo"),
      ]);

      for (const c of conceptos.data || []) {
        out.concepto[c.nombre] = {
          descripcion: c.descripcion,
          // La etapa y el formato son SUGERENCIAS: un UGC vive en TOFU, MOFU y
          // BOFU en el banco real. Por eso dice "suele ser", no "es".
          nota: [c.etapa_tipica?.toUpperCase(), c.formato_tipico === "estatico" ? "estático" : c.formato_tipico]
            .filter(Boolean).join(" · "),
          delCurso: c.del_curso,
        };
      }

      const nichoPorId = Object.fromEntries((nichos.data || []).map((n) => [n.id, n.nombre]));
      for (const n of nichos.data || []) out.nicho[n.nombre] = {};
      for (const s of subnichos.data || []) {
        out.subnicho[s.nombre] = { padre: nichoPorId[s.nicho_id] || null };
      }

      const GRUPOS = {
        dolor: "Dolor o miedo", deseo: "Deseo o aspiración",
        practicidad: "Practicidad", confianza: "Confianza",
      };
      for (const a of angulos.data || []) out.angulo[a.nombre] = { grupo: GRUPOS[a.grupo] || a.grupo };

      for (const m of momentos.data || []) out.momento[m.nombre] = { descripcion: m.descripcion };
      for (const c of conciencia.data || []) {
        out.conciencia[c.nombre] = { descripcion: c.descripcion, nota: `Nivel ${c.nivel}` };
      }
      for (const h of hooks.data || []) out.hook[h.nombre] = { descripcion: h.ejemplo };
    } catch {
      // Sin vocabulario la UI sigue funcionando: muestra los nombres pelados,
      // que es exactamente lo que hacía antes. No vale la pena romper el filtro.
    }
    cache = out;
    return out;
  })();

  return enVuelo;
}

/** Para tests y para cuando alguien edita el vocabulario. */
export function olvidarTaxonomia() { cache = null; enVuelo = null; }
