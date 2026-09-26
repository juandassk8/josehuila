// Cuántos creativos producir por semana, y cómo repartirlos.
//
// Son TRES pasos encadenados, y hasta ahora faltaba el del medio. El sistema
// calculaba el tope y le aplicaba el reparto del embudo directo, así que
// prescribía 2,5 veces la producción que corresponde.
//
//   1. tope       = presupuesto de testeo ÷ (CPA × multiplicador de prueba)
//   2. producción = tope × 40%                          <-- este faltaba
//   3. reparto    = producción × (60 / 30 / 10)
//
// ── Los dos porcentajes que se confunden ─────────────────────────────
//
// Hay un 30% y un 40% en juego y NO son alternativas, son pasos distintos:
//
//   30% (`pctTesteo`)  — porción de la PLATA que va a probar creativos nuevos.
//                        El otro 70% se invierte en escalar los que ya ganan.
//   40% (`pctCadencia`)— porción del TOPE que conviene producir de verdad.
//
// Uno reparte dinero, el otro reparte trabajo. El primero decide cuántos
// creativos podrías pagar; el segundo, cuántos conviene hacer bien.
//
// ── Por qué 40% y no 100% ────────────────────────────────────────────
//
// Llegar al tope suena a "más pruebas, mejor", pero produce dos daños: baja la
// calidad —30 creativos bien hechos le ganan a 75 apurados, y uno malo no prueba
// nada— y consume el músculo que hacía falta para escalar lo que ya funciona.
// El 40% es el punto de partida sano, no un techo: quien tiene presupuesto y
// equipo puede subir, pero nunca a costa de la calidad.

export const PCT_CADENCIA_DEFAULT = 40;
export const REPARTO_DEFAULT = { tofu: 60, mofu: 30, bofu: 10 };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Paso 1 — el máximo físico que el presupuesto de testeo puede pagar.
//
// `Math.floor` a propósito: prometer un creativo que no se puede pagar completo
// es peor que prometer uno menos. Un creativo a medio financiar no llega a
// gastar su presupuesto de prueba, así que no prueba nada.
export function calcularTope({ pautaSemanal, pctTesteo, cpaObjetivo, multiplicadorPrueba }) {
  const presupuestoTesteo = num(pautaSemanal) * (num(pctTesteo) / 100);
  const porCreativo = num(cpaObjetivo) * num(multiplicadorPrueba);
  if (presupuestoTesteo <= 0 || porCreativo <= 0) return 0;
  return Math.floor(presupuestoTesteo / porCreativo);
}

// Paso 2 — lo que conviene producir.
//
// Redondea al entero más cercano, no hacia abajo: acá no se está repartiendo
// plata que pueda faltar, se está fijando una meta de trabajo. Con un tope de 1,
// bajar a 0 dejaría a la cuenta sin producir nada.
export function calcularProduccion(tope, pctCadencia = PCT_CADENCIA_DEFAULT) {
  const t = Math.max(0, num(tope));
  if (!t) return 0;
  return Math.max(1, Math.round(t * (num(pctCadencia) / 100)));
}

// Paso 3 — repartir la producción por etapa del embudo.
//
// Se reparte la PRODUCCIÓN, no el tope. Aplicarlo al tope —que es lo que se
// venía haciendo— prescribe una carga de trabajo que nadie va a alcanzar, y una
// meta imposible se ignora entera en vez de cumplirse a medias.
//
// El resto de la división entera va a TOFU, que es donde más volumen se gasta.
export function repartirPorEmbudo(produccion, reparto = REPARTO_DEFAULT) {
  const total = Math.max(0, Math.round(num(produccion)));
  if (!total) return { tofu: 0, mofu: 0, bofu: 0 };
  const mofu = Math.round(total * (num(reparto.mofu) / 100));
  const bofu = Math.round(total * (num(reparto.bofu) / 100));
  return { tofu: Math.max(0, total - mofu - bofu), mofu, bofu };
}

// Los tres pasos, para quien solo quiere el resultado.
//
// `reservaParaEscalar` es el 60% que NO se produce: no es sobra, es el músculo
// con el que se escala lo que ya gana. Se devuelve explícito porque, mostrado,
// se entiende que el 40% no es un recorte sino una decisión.
export function planDeCadencia({
  pautaSemanal, pctTesteo, cpaObjetivo, multiplicadorPrueba,
  pctCadencia = PCT_CADENCIA_DEFAULT, reparto = REPARTO_DEFAULT,
} = {}) {
  const tope = calcularTope({ pautaSemanal, pctTesteo, cpaObjetivo, multiplicadorPrueba });
  const produccion = calcularProduccion(tope, pctCadencia);
  return {
    tope,
    produccion,
    reservaParaEscalar: Math.max(0, tope - produccion),
    porEtapa: repartirPorEmbudo(produccion, reparto),
  };
}
