// Única fuente de verdad sobre las PORTADAS de los referentes
// (`despliegue_variations.file_url`).
//
// Hasta ahora esta decisión estaba escrita cinco veces, y no todas decían lo
// mismo. Cuatro copias usaban una LISTA NEGRA AL REVÉS —"solo sirve si es de
// Supabase Storage"— y el Banco usaba una lista blanca. Resultado: la misma
// portada se veía en el Banco y no en el pipeline.
//
// Peor: la versión estricta descartaba las de `r2.foreplay.co`, que funcionan
// perfectamente (verificado: HTTP 200, JPEG real). Las que sí están muertas son
// las de Meta (`fbcdn`/`fbsbx`), que devuelven 403 al poco tiempo.
//
// La regla correcta es al revés de como estaba: **se asume que una portada sirve
// salvo que sepamos que no**. Si igual falla, las tarjetas ya manejan el `onError`
// y muestran el rayado; borrarla de entrada garantiza que no se vea nunca.

// Hosts cuyas URLs caducan. Meta firma sus CDN con expiración corta.
const EXPIRING = /fbcdn|fbsbx|facebook/i;

// Alojado por nosotros → permanente, no se toca nunca.
const OWN_STORAGE = /\/storage\/v1\//i;

// ¿Vale la pena intentar mostrar esta portada?
export function isUsableCover(url) {
  const u = (url || "").toString().trim();
  if (!u) return false;
  if (OWN_STORAGE.test(u)) return true;
  return !EXPIRING.test(u);
}

// ¿Es candidata a reparación? Vacía o de un host que caduca.
// Es la negación de isUsableCover, con nombre propio porque los backfills se leen
// mejor así ("si la portada expiró, recuperala").
export function coverIsExpired(url) {
  return !isUsableCover(url);
}

// ¿Está alojada por nosotros? Se usa para decidir si hace falta re-hostearla.
export function isOwnStorage(url) {
  return OWN_STORAGE.test((url || "").toString());
}

// ¿El video se puede leer desde un <canvas> para sacarle un fotograma? Solo
// nuestro Storage manda CORS `*`; un link de Drive no se puede leer y encima
// cuelga 15s esperando un video que nunca carga.
export function videoIsCanvasReadable(url) {
  return OWN_STORAGE.test((url || "").toString());
}

// Entre dos portadas para la MISMA fila, cuál conviene conservar.
//
// Existe porque el re-import al cliente hacía `src.file_url || dest.file_url`:
// bastaba con que el banco tuviera una URL —aunque estuviera vencida— para pisar
// una portada buena que el cliente ya tenía. Era una forma silenciosa de deshacer
// trabajo ya hecho a mano.
//
// Orden: alojada por nosotros > utilizable > lo que haya.
export function bestCover(a, b) {
  const A = (a || "").trim(), B = (b || "").trim();
  if (isOwnStorage(A)) return A;
  if (isOwnStorage(B)) return B;
  if (isUsableCover(A)) return A;
  if (isUsableCover(B)) return B;
  return A || B || null;
}
