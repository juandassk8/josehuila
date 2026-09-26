// La numeración de los creativos.
//
// ─── Qué se rompió ───────────────────────────────────────────────────────────
//
// El número (`pipeline_slots.num`) se asigna al planear el brief, recorriendo concepto
// por concepto, así que los contenidos NACEN agrupados: los diez UGC juntos, los diez
// testimoniales juntos. Eso funciona bien.
//
// Se rompe después, por dos caminos que son parte del trabajo normal:
//
//   1. Se agregan contenidos al brief ya creado. Los nuevos se numeran al final, así
//      que un UGC agregado el martes queda después de los transformacionales.
//   2. Alguien le cambia el concepto a un slot. El número no se mueve, y ese slot
//      queda parado en medio del bloque equivocado.
//
// El board ordena por `num`, así que el desorden que se ve en pantalla no es del orden:
// son los valores los que quedaron intercalados. Por eso Nath ve un animado en medio de
// los UGC y guionizar se vuelve un caos.
//
// ─── Por qué renumerar es un acto explícito y no automático ──────────────────
//
// La tentación es reordenar solo, cada vez que algo cambia. No se puede: en cuanto Nath
// manda el link del brief, las UGC empiezan a nombrar archivos en Drive con ese número.
// Un renumerado automático les cambiaría el número por debajo y rompería el único cruce
// que hoy funciona entre la plataforma y Drive.
//
// Entonces: se renumera cuando alguien lo pide, sabiendo lo que hace, y antes de repartir
// los guiones. Después de repartir, el número es intocable.

/**
 * El orden en que se leen los contenidos de un brief.
 *
 * Tres criterios, en este orden:
 *
 *   1. Tipo — los videos antes que los estáticos. Es como se muestra el brief y como se
 *      reparte el trabajo: los videos van a las UGC, los estáticos a diseño. Un estático
 *      metido entre los guiones es ruido para las dos.
 *
 *   2. Concepto — todos los UGC juntos, todos los testimoniales juntos. El orden ENTRE
 *      conceptos no se inventa: se respeta el que ya tienen hoy, tomando el número más
 *      bajo de cada bloque. Si Nath puso los UGC primero, siguen primero.
 *
 *   3. El número actual — dentro de un concepto, no hay razón para moverlos.
 *
 * No muta la lista que recibe.
 */
export function ordenarContenidos(slots = []) {
  // El rango de cada concepto es el número más bajo que tiene hoy: así el orden entre
  // bloques es el que Nath ya eligió, no uno inventado.
  //
  // Los que NO tienen concepto son la excepción y van al final aunque su número sea
  // bajo. Un slot recién creado y sin concepto todavía suele quedar con un número
  // chico, y arrastraba a todo el bloque de los sin clasificar al principio del brief
  // —justo delante de los guiones que sí están listos para repartir.
  const orden = new Map();
  for (const s of slots) {
    const clave = claveConcepto(s);
    if (clave === SIN_CONCEPTO) { orden.set(clave, Number.MAX_SAFE_INTEGER); continue; }
    const n = numeroDe(s);
    if (!orden.has(clave) || n < orden.get(clave)) orden.set(clave, n);
  }

  return [...slots].sort((a, b) => {
    const ta = a.tipo === "estatico" ? 1 : 0;
    const tb = b.tipo === "estatico" ? 1 : 0;
    if (ta !== tb) return ta - tb;

    const ca = orden.get(claveConcepto(a)) ?? Number.MAX_SAFE_INTEGER;
    const cb = orden.get(claveConcepto(b)) ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;

    return numeroDe(a) - numeroDe(b);
  });
}

const SIN_CONCEPTO = "\u0000sin";

/** Los slots sin concepto van todos a un mismo bloque, al final, y no cada uno al suyo. */
function claveConcepto(s) {
  return (s?.concepto || "").trim().toLowerCase() || SIN_CONCEPTO;
}

/** Un slot sin número todavía se va al final, no al principio. */
function numeroDe(s) {
  const n = Number(s?.num);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Renumera una tanda de briefs, corrido y sin saltos.
 *
 * `briefs` van en el orden en que se van a numerar (el más viejo primero) y cada uno
 * trae sus contenidos. `desde` es el último número usado antes de esta tanda: 0 para
 * empezar en 001, o el número donde quedó el brief anterior para seguir de largo.
 *
 * Devuelve SOLO los slots cuyo número cambia. Los que ya están donde van no se tocan:
 * cada escritura de más es una fila que se marca como modificada sin motivo, y en un
 * board que varias personas miran a la vez eso es ruido.
 */
export function renumerar(briefs = [], desde = 0) {
  const cambios = [];
  let n = Number(desde) || 0;

  for (const brief of briefs) {
    for (const slot of ordenarContenidos(brief?.slots || [])) {
      n += 1;
      if (slot.num !== n) cambios.push({ id: slot.id, num: n, antes: slot.num ?? null });
    }
  }

  return { cambios, ultimo: n };
}

/**
 * Cuántos contenidos quedarían fuera de su bloque si no se renumera.
 *
 * Sirve para decir «hay 4 contenidos fuera de orden» antes de tocar nada, en vez de
 * ofrecer un botón que no se sabe si hace algo.
 */
export function fueraDeOrden(slots = []) {
  const ordenados = ordenarContenidos(slots);
  const actuales = [...slots].sort((a, b) => numeroDe(a) - numeroDe(b));
  let n = 0;
  for (let i = 0; i < ordenados.length; i++) {
    if (ordenados[i]?.id !== actuales[i]?.id) n += 1;
  }
  return n;
}
