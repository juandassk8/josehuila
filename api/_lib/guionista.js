// Quién puede pedirle guiones a la IA desde el Content Pipeline.
//
// Vive en `api/_lib/` y no en `src/lib/` porque lo leen los dos lados: el portal
// para no mostrar el botón, y `api/generate-slot-script.js` para no atender la
// llamada. Una sola lista, sin copias que se desincronicen. Es el mismo camino
// que ya hace `labelVocab.js`.
//
// Generar un guion cuesta tokens de verdad, y el pool es por empresa (60k por
// hora, 150k por día, 300k por semana). Abrirle el botón a todas las cuentas de
// cliente es abrirle la factura: alguien que no sabe qué cuesta aprieta
// "Generar pendientes" sobre veinte slots y se come la semana.
//
// Por eso la regla tiene dos mitades:
//
//   · Peluna Pets es la cuenta donde el guionista está probado y en uso. Ahí lo
//     ve cualquiera, cliente incluido.
//   · En las demás, lo ve solo el equipo de Inforce. Nosotros sabemos lo que
//     gastamos; el cliente entra y ni se entera de que existe.
//
// Para sumar otra empresa alcanza con agregar su id o su slug acá abajo. Se
// aceptan los dos porque el id es el que llega en runtime y el slug es el que
// uno reconoce leyendo.
const EMPRESAS_CON_GUIONISTA = new Set([
  "1776898591543",   // Peluna Pets
  "peluna-pets",
]);

export function empresaConGuionista(companyId, slug) {
  return EMPRESAS_CON_GUIONISTA.has(String(companyId || ""))
    || EMPRESAS_CON_GUIONISTA.has(String(slug || "").toLowerCase());
}

// El botón se muestra si la empresa lo tiene habilitado o si quien mira es del
// equipo de Inforce. `esInforce` ya lo resuelve `esDeInforce()` en `permisos.js`.
export function puedeGenerarGuiones({ companyId, slug, esInforce } = {}) {
  return !!esInforce || empresaConGuionista(companyId, slug);
}
