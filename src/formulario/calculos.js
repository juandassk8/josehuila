// Lo que el portal calcula solo — la tabla del spec (docs/formulario-onboarding.md).
//
// Funciones puras, sin React ni Supabase: las corre el navegador para pintar las
// recompensas y las corre `api/onboarding-form.js` para guardar los resultados con
// `origen = 'calculado'`. Una sola implementación para que el número que ve el
// cliente sea el mismo que después lee el diagnóstico.
//
// Entra `r`: los valores crudos por `campo` (los de flujo.js). Lo que no se puede
// calcular todavía sale `null` — nunca 0, nunca NaN. Un 0 inventado en la
// facturación daña todo lo que viene encadenado.

// 1 − 0,19 ÷ 1,19. Solo se usa si el cliente dice que su rentabilidad todavía no
// tiene descontado el IVA. El IVA se paga sobre el valor agregado, no sobre la venta
// entera: se lleva el 15,97% del margen y queda el 84,03%.
export const FACTOR_IVA = 0.8403;

// Las tres casillas "no lo sé" que existen.
// (Eran cuatro: el margen dejó de llevarla el 2026-09-21 — «ellos lo deberían saber
// sí o sí».)
export const CASILLAS_NO_LO_SE = [
  ["tasa_conversion"],
  ["porcentaje_carga"],
  ["recompra"],
];

const MILLON = 1_000_000;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const todos = (...vs) => vs.every((v) => v !== null);
// Los cortes del semáforo se comparan redondeados: 12000/30000 tiene que ser
// 40% y caer en verde, no 39,99999% por la coma flotante.
const redondear = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

// ── Rentabilidad neta (3.8) ─────────────────────────────────────────────────
// Lo que le queda al dueño de cada venta DESPUÉS DE TODO: producto, envío,
// devoluciones, pauta y lo demás. En % del ticket o en pesos; salen los dos.
//
// Antes se pedía el margen ANTES de pauta por producto y el portal le restaba IVA y
// lo que no se entrega. José lo cambió (2026-09-21): nadie tiene ese número armado
// así, él mismo lo respondió «ya contando todo» y el CPA máximo le salió en la mitad.
// No nos metemos en la logística del cliente: una sola pregunta, como él la piensa.
export function rentabilidadPorVenta(ticket, rent) {
  const t = num(ticket);
  const v = num(rent?.valor);
  if (!todos(t, v) || t <= 0) return { neto: null, pct: null };
  const bruto = rent.unidad === "pesos" ? v : (t * v) / 100;
  // Si el número que dio todavía no tiene descontado el IVA, se lo descontamos.
  const neto = rent.iva === "sin_descontar" ? bruto * FACTOR_IVA : bruto;
  return { neto, pct: (neto / t) * 100 };
}

// ── "Calcúlalo por mí" (3.6 y 3.7) ──────────────────────────────────────────
export function cpaDesdeCompras(gastoPauta, compras) {
  const g = num(gastoPauta), c = num(compras);
  return todos(g, c) && c > 0 ? g / c : null;
}

export function roasDesdeIngresos(ingresosPauta, gastoPauta) {
  const i = num(ingresosPauta), g = num(gastoPauta);
  return todos(i, g) && g > 0 ? i / g : null;
}

// ── 2.1 · Salud del margen ──────────────────────────────────────────────────
// No mide el margen: mide cuánto aire queda entre lo que paga hoy por una venta
// y su techo. Es un porcentaje, así que aguanta cualquier ticket.
export function semaforoAire(aire) {
  if (aire === null) return null;
  const a = redondear(aire);
  if (a < 0) return "rojo_profundo";
  if (a < 0.15) return "rojo";
  if (a < 0.4) return "amarillo";
  return "verde";
}

// ── 2.2 · ¿Conoce sus números? ──────────────────────────────────────────────
// Corte con tres casillas: 0 = sí · 1 = a medias · 2 o 3 = no. (Pendiente de que
// José lo confirme; con cuatro era 0 / 1–2 / 3–4.)
export function conoceSusNumeros(noLoSe = {}) {
  const marcadas = CASILLAS_NO_LO_SE.filter((campos) => campos.some((c) => noLoSe[c])).length;
  const lectura = marcadas === 0 ? "si" : marcadas === 1 ? "a_medias" : "no";
  return { marcadas, de: CASILLAS_NO_LO_SE.length, lectura };
}

// ── Nivel (sale de la 3.3) ──────────────────────────────────────────────────
// BASE si la meta es menor a 100 millones al mes, ESCALA entre 100 y 500, ÉLITE
// de 500 en adelante. Habiendo meta nunca sale null. La escala llega a 1.000
// porque es el techo de lo que se ha trabajado, no porque haya un cuarto nivel:
// por encima va `sobre_escala`, que pide una conversación aparte — eso lo maneja
// José, no el formulario.
export function nivelDeMeta(facturacionObjetivo) {
  const f = num(facturacionObjetivo);
  if (f === null || f <= 0) return null;
  const nivel = f < 100 * MILLON ? "BASE" : f < 500 * MILLON ? "ESCALA" : "ELITE";
  return { nivel, sobre_escala: f > 1000 * MILLON };
}

// ── La cadena completa ──────────────────────────────────────────────────────
// `noLoSe`: { campo: true } de las casillas marcadas.
export function calcular(r = {}, noLoSe = {}) {
  const ticket = num(r.ticket_promedio);
  const cpa = num(r.cpa_mes);

  const { neto: rentabilidad_por_venta, pct: rentabilidad_pct } = rentabilidadPorVenta(ticket, r.rentabilidad_neta);

  // El techo: lo que hoy paga por una venta MÁS lo que le queda limpio. Si el CPA
  // sube hasta ahí, esa venta ya no le deja nada. (Con el ejemplo del spec: le
  // quedan $12.000 y paga $18.000 → techo $30.000 → 40% de aire.)
  const cpa_maximo = todos(rentabilidad_por_venta, cpa) ? rentabilidad_por_venta + cpa : null;
  // Lo que deja una venta antes de pagarla: es el mismo número, visto como margen.
  const margen_antes_de_pauta = cpa_maximo;
  const roas_equilibrio = todos(ticket, cpa_maximo) && cpa_maximo > 0 ? ticket / cpa_maximo : null;

  // El CPA objetivo lo da el cliente (3.11). Lo que se deriva es qué parte de ese
  // margen le queda si llega a ese CPA. Insumo del diagnóstico; no se le menciona.
  const cpa_objetivo = num(r.cpa_objetivo);
  const margen_que_le_queda = todos(cpa_maximo, cpa_objetivo) && cpa_maximo > 0 ? 1 - cpa_objetivo / cpa_maximo : null;

  const total3m = num(r.facturacion_3m_total);
  const facturacion_promedio_3m = total3m === null ? null : total3m / 3;
  const factMes = num(r.facturacion_mes_pasado);
  const factMeta = num(r.facturacion_objetivo_3m);
  const ventas_actuales = todos(factMes, ticket) && ticket > 0 ? factMes / ticket : null;
  const ventas_necesarias = todos(factMeta, ticket) && ticket > 0 ? factMeta / ticket : null;
  const brecha_ventas = todos(ventas_necesarias, ventas_actuales) ? ventas_necesarias - ventas_actuales : null;

  const inversion_necesaria_actual = todos(ventas_necesarias, cpa) ? ventas_necesarias * cpa : null;
  const inversion_necesaria_objetivo = todos(ventas_necesarias, cpa_objetivo) ? ventas_necesarias * cpa_objetivo : null;

  // Las dos: lo que pasa si nada cambia, y lo que pasaría si llega a su CPA
  // objetivo. La diferencia entre las dos es el argumento del diagnóstico.
  const utilidad_proyectada_actual = todos(ventas_necesarias, cpa_maximo, cpa)
    ? ventas_necesarias * (cpa_maximo - cpa) : null;
  const utilidad_proyectada_objetivo = todos(ventas_necesarias, cpa_maximo, cpa_objetivo)
    ? ventas_necesarias * (cpa_maximo - cpa_objetivo) : null;

  // ROAS general del negocio (también le dicen MER): toda la facturación del mes
  // sobre toda la pauta del mes. No es el «ROAS de compras» de Meta —ese ya no se
  // pregunta—, y por eso lleva otro nombre.
  const gasto = num(r.gasto_pauta_mes);
  const roas_general = todos(factMes, gasto) && gasto > 0 ? factMes / gasto : null;

  const aire = todos(cpa_maximo, cpa) && cpa_maximo > 0 ? (cpa_maximo - cpa) / cpa_maximo : null;
  const salud_margen = aire === null ? null : { aire, semaforo: semaforoAire(aire) };

  const conoce_numeros = conoceSusNumeros(noLoSe);

  return {
    rentabilidad_por_venta,
    rentabilidad_pct,
    margen_antes_de_pauta,
    cpa_maximo,
    roas_equilibrio,
    roas_general,
    margen_que_le_queda,
    facturacion_promedio_3m,
    ventas_actuales,
    ventas_necesarias,
    brecha_ventas,
    inversion_necesaria_actual,
    inversion_necesaria_objetivo,
    utilidad_proyectada_actual,
    utilidad_proyectada_objetivo,
    salud_margen,
    conoce_numeros,
    nivel: nivelDeMeta(factMeta),
  };
}

// Qué punto del Estándar alimenta cada calculado. Los que no están acá se guardan
// sin etiqueta: son insumos del diagnóstico, no de un punto calificable.
export const PUNTOS_DE_CALCULADOS = {
  rentabilidad_por_venta: ["2.1"],
  rentabilidad_pct: ["2.1"],
  margen_antes_de_pauta: ["2.1"],
  cpa_maximo: ["2.1"],
  roas_equilibrio: ["2.1"],
  margen_que_le_queda: ["2.1"],
  salud_margen: ["2.1"],
  conoce_numeros: ["2.2"],
};

// Señales para el equipo. `paraRevisar` no tranca nada: se mira en la llamada.
// `alerta` es lo que pone rojo el badge de Empresas.
export function senales(r = {}, calculados = {}, noLoSe = {}) {
  const cpa = num(r.cpa_mes);
  const ticket = num(r.ticket_promedio);
  const motivos = [];
  // Con el modelo de rentabilidad neta el CPA ya no puede «pasar el máximo» (el
  // máximo ES lo que paga más lo que le queda). Su sucesor natural es el semáforo en
  // rojo: le queda menos del 15% de aire, o no le queda nada.
  if (["rojo", "rojo_profundo"].includes(calculados.salud_margen?.semaforo)) motivos.push("margen_en_rojo");
  // Eran «tres o más» de cuatro; con tres casillas, las tres es no conocer ninguna.
  if (conoceSusNumeros(noLoSe).marcadas >= 3) motivos.push("tres_o_mas_no_lo_se");
  return {
    paraRevisar: { cpa_mes: todos(cpa, ticket) && cpa > ticket },
    alerta: motivos.length > 0,
    motivos,
  };
}
