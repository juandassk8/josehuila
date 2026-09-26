// Guardián de salida: evita perder trabajo en curso al cambiar de sección.
//
// El problema: las secciones se montan con una cadena de if/else en TeamApp,
// así que al navegar React DESMONTA la sección anterior entera. Todo lo que
// esté a medias en memoria —una cola de análisis, un import de Apify— muere
// ahí, sin aviso.
//
// Mientras ese trabajo no viva en el servidor, al menos hay que preguntar.
// Una sección que tenga algo en curso registra un guardián; la navegación lo
// consulta antes de moverse.
//
// Es un registro de módulo y no un contexto de React a propósito: `navigate`
// vive en TeamApp, arriba de la sección que necesita bloquear, y meter un
// provider nuevo para esto obligaría a tocar el árbol entero.

let guardia = null;

/**
 * Registra el guardián de la sección actual. Devuelve la función para darlo
 * de baja — llamala en el cleanup del efecto.
 *
 * El guardián recibe `continuar` (la navegación que se quería hacer) y
 * devuelve `false` si va a encargarse él (mostrar su propio diálogo). Si
 * devuelve cualquier otra cosa, se navega de una.
 */
export function registrarGuardiaDeSalida(fn) {
  guardia = fn;
  return () => {
    if (guardia === fn) guardia = null;
  };
}

/**
 * ¿Se puede salir? `true` significa navegá tranquilo. `false` significa que
 * el guardián tomó el control y va a llamar a `continuar` si el usuario
 * confirma.
 */
export function puedeSalir(continuar) {
  if (typeof guardia !== "function") return true;
  return guardia(continuar) !== false;
}
