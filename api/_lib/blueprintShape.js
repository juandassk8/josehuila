// Normaliza la forma del blueprint que devuelve el modelo.
//
// El schema del tool dice que `beats` es un array de objetos, pero el modelo a
// veces devuelve el ARRAY SERIALIZADO como string: `"[\n  {\n \"purpose\": …"`.
// Es un fallo conocido del tool use — el valor es correcto, el tipo no.
//
// Sin esto, el string pasa el `|| []` (es truthy) y revienta en el `.map`:
//
//     (bp.beats || []).map is not a function
//
// que es exactamente el error que vio Nath. Y como el blueprint se CACHEA en
// `despliegue_variations.script_blueprint` y se reusa para siempre, uno malo
// rompe ese referente en cada generación futura hasta que alguien lo borre a
// mano. Por eso se normaliza ANTES de guardar, no solo al leer.
//
// Se normaliza también al leer (`renderBlueprint`) porque ya hay blueprints
// cacheados con la forma mala, y no se pueden re-pedir sin volver a pagar la
// llamada al modelo.

// Un valor que debería ser array. Acepta:
//   - un array de verdad          → tal cual
//   - un string con JSON adentro  → se parsea
//   - un objeto suelto            → se envuelve ({...} → [{...}])
//   - null / undefined / basura   → []
export function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // No es JSON: es texto suelto donde se esperaba una lista. Se descarta en
      // vez de meterlo como si fuera un beat — un beat que en realidad es una
      // frase de prosa desordena el guion entero.
      return [];
    }
  }
  if (typeof v === "object") return [v];
  return [];
}

// Un valor que debería ser objeto. Mismo problema, al revés.
export function asObject(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* cae al objeto vacío */ }
  }
  return {};
}

// Deja el blueprint con la forma que el resto del código da por sentada.
//
// No inventa contenido: lo que falta queda vacío, y `renderBlueprint` ya sabe
// mostrar "(sin beats)" o "—". Un blueprint incompleto produce un guion más
// flojo; uno con el tipo equivocado tira el proceso entero.
export function normalizeBlueprint(bp) {
  if (!bp || typeof bp !== "object") return null;

  const hook = asObject(bp.hook);
  const cta = asObject(bp.cta);

  return {
    ...bp,
    hook: { ...hook, devices: asArray(hook.devices) },
    // Cada beat también puede venir serializado de a uno.
    beats: asArray(bp.beats).map((b) => asObject(b)).filter((b) => Object.keys(b).length),
    cta,
  };
}
