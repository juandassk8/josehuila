// El vocabulario curado, para el prompt de clasificación.
//
// POR QUÉ EXISTE
//
// Hasta ahora el prompt le mostraba a la IA "las etiquetas que ya se usan en el
// banco", sacadas de contar `bank_labels`. Eso es un bucle: la IA propone un
// valor libre → se guarda → en la siguiente clasificación aparece como ejemplo
// → se legitima por repetirse. Así nacieron "Gafas" junto a "Óptica",
// "Lipodema" junto a "Lipedema", y cinco formas de decir salud digestiva canina.
//
// Las tablas `tax_*` son la lista curada. Este módulo la trae y la formatea
// para el prompt. La diferencia de fondo no es el formato: es que ahora hay
// listas CERRADAS contra las cuales converger.
//
// Qué es cerrado y qué no, y por qué:
//
//   concepto   CERRADO. Son 30 y salen del catálogo del curso más lo que se
//              acordó revisando el banco. Un concepto nuevo es una decisión de
//              metodología, no algo que se inventa clasificando un anuncio.
//   momento    CERRADO. Cuatro.
//   conciencia CERRADO. Cinco, del módulo 1 del curso.
//   hook       CERRADO. Ocho.
//   angulo     ABIERTO pero con grupo. Los ángulos concretos son del producto
//              («para piel +40»), así que la lista crece — pero cada valor tiene
//              que caber en uno de los 4 grupos del curso. Eso es lo que impide
//              que "Testimonial" o "Cabello" se vuelvan a colar acá.
//   nicho      ABIERTO. Llega un mercado nuevo y hay que poder nombrarlo.
//   subnicho   ABIERTO, colgando de un nicho.
//   marca      ABIERTO por naturaleza.
//
// Solo servidor: usa el service_role para leer el vocabulario sin depender de
// la sesión de quien disparó la clasificación (el worker no tiene ninguna).

import { serviceClient } from "./auth.js";

let cache = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;   // el vocabulario cambia cuando alguien lo edita, no a cada rato

export async function cargarVocabulario() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const sb = serviceClient();

  const [conceptos, nichos, subnichos, angulos, momentos, conciencia, hooks] = await Promise.all([
    sb.from("tax_conceptos").select("nombre, descripcion, etapa_tipica, formato_tipico").eq("activo", true).order("sort_order"),
    sb.from("tax_nichos").select("id, nombre").eq("activo", true).order("nombre"),
    sb.from("tax_subnichos").select("nombre, nicho_id").eq("activo", true).order("nombre"),
    sb.from("tax_angulos").select("nombre, grupo").eq("activo", true).order("nombre"),
    sb.from("tax_momentos").select("slug, nombre, descripcion").order("sort_order"),
    sb.from("tax_conciencia").select("nivel, nombre, descripcion").order("nivel"),
    sb.from("tax_hooks").select("slug, nombre, ejemplo").order("sort_order"),
  ]);

  const nichoPorId = Object.fromEntries((nichos.data || []).map((n) => [n.id, n.nombre]));
  const subPorNicho = {};
  for (const s of subnichos.data || []) {
    const padre = nichoPorId[s.nicho_id];
    if (!padre) continue;
    (subPorNicho[padre] ||= []).push(s.nombre);
  }

  cache = {
    conceptos: conceptos.data || [],
    nichos: (nichos.data || []).map((n) => n.nombre),
    subPorNicho,
    angulos: angulos.data || [],
    momentos: momentos.data || [],
    conciencia: conciencia.data || [],
    hooks: hooks.data || [],
  };
  cacheAt = Date.now();
  return cache;
}

/** Para que un tick del worker no arrastre vocabulario viejo tras una edición. */
export function olvidarVocabulario() { cache = null; cacheAt = 0; }

const GRUPO_ANGULO = {
  dolor: "dolor o miedo", deseo: "deseo o aspiración",
  practicidad: "practicidad", confianza: "confianza",
};

/**
 * El bloque de vocabulario del system prompt.
 *
 * Los conceptos van con su definición y no solo con su nombre: sin la
 * definición, "Venta" y "Oferta" o "UGC" y "Testimonial" son palabras que
 * suenan parecido, y el modelo elige por sonido. Con el patrón al lado, elige
 * por patrón — que es como el curso enseña a distinguirlos.
 */
export function bloqueVocabulario(v, formatoReal = null) {
  // El formato NO se le pregunta al modelo: se sabe del dato (hay video o no
  // hay). Así que en vez de pedirle coherencia, se le muestran únicamente los
  // conceptos que ese formato admite.
  //
  // Esto es lo que arregla el «de la nada un estático queda marcado como
  // concepto de video»: antes era una regla en prosa que el modelo podía
  // ignorar; ahora los conceptos incompatibles ni siquiera aparecen.
  const elegibles = formatoReal
    ? v.conceptos.filter((c) => !c.formato_tipico || c.formato_tipico === "ambos" || c.formato_tipico === formatoReal)
    : v.conceptos;

  const conceptos = elegibles
    .map((c) => {
      // El formato ya lo filtra la lista; repetirlo en cada línea es ruido.
      const etapa = c.etapa_tipica?.toUpperCase();
      return `- "${c.nombre}"${etapa ? ` (suele ser ${etapa})` : ""}${c.descripcion ? ` — ${c.descripcion}` : ""}`;
    })
    .join("\n");

  const nichos = Object.entries(v.subPorNicho)
    .map(([n, subs]) => `- ${n}: ${subs.join(", ")}`)
    .join("\n");
  const sinSub = v.nichos.filter((n) => !v.subPorNicho[n]);

  const angulos = Object.entries(
    v.angulos.reduce((acc, a) => {
      (acc[GRUPO_ANGULO[a.grupo] || a.grupo] ||= []).push(a.nombre);
      return acc;
    }, {})
  ).map(([g, xs]) => `- ${g}: ${xs.join(", ")}`).join("\n");

  return `
════ VOCABULARIO ════

CONCEPTOS${formatoReal ? ` — este anuncio es ${formatoReal === "video" ? "un VIDEO" : "una IMAGEN ESTÁTICA"}, así que abajo están SOLO los conceptos que aplican a ese formato` : ""} — lista CERRADA. Elegí EXACTAMENTE uno de estos nombres, tal cual está escrito. Si dudás entre dos, leé la definición: se elige por CÓMO ESTÁ HECHO el anuncio, no por el tema ni por cuál suena parecido. Nunca inventes un concepto nuevo ni le agregues la etapa al nombre.
${conceptos}

La ETAPA que dice cada concepto es una referencia, NO una regla: un UGC puede ser TOFU, MOFU o BOFU. Se decide mirando el anuncio y va en su propio campo.

ÁNGULO — el MOTIVO DE COMPRA: qué dolor o deseo ataca. No es la forma del anuncio ni el tema del producto.
${angulos}
Si el ángulo real del anuncio no está en la lista, proponé uno nuevo CORTO (2-4 palabras) y decí a cuál de los cuatro grupos pertenece. Si no cabe en ninguno de los cuatro, no es un ángulo: probablemente sea un concepto o un nicho, y ahí no va.

NICHO y SUBNICHO — el mercado. Estos son los que hay; si el producto es de otro mercado, nombralo.
${nichos}${sinSub.length ? `\nSin subnichos todavía: ${sinSub.join(", ")}` : ""}

MOMENTO — por qué esa campaña corre AHORA. Lista CERRADA:
${v.momentos.map((m) => `- "${m.nombre}" — ${m.descripcion}`).join("\n")}

NIVEL DE CONCIENCIA — a quién le habla. Lista CERRADA, devolvé el NÚMERO:
${v.conciencia.map((c) => `- ${c.nivel} = ${c.nombre}: ${c.descripcion}`).join("\n")}

HOOK — cómo arrancan los primeros 3 segundos. Lista CERRADA:
${v.hooks.map((h) => `- "${h.nombre}"${h.ejemplo ? ` — ${h.ejemplo}` : ""}`).join("\n")}
`.trim();
}
