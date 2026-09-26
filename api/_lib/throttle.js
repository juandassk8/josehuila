// Freno simple por clave, en memoria del proceso.
//
// Para `notify-password-reset`, que no tiene autenticación por diseño —nadie que
// olvidó su clave puede probar quién es— y le manda un mail a Jose por cada
// llamada. Sin freno, un script suelto le llena la casilla y quema la cuota de
// Resend.
//
// LO QUE NO ES: un rate limit de verdad. Vercel puede levantar varias instancias
// y cada una tiene su propio mapa, así que el tope real es "N por instancia".
// Para spam desde un solo origen alcanza; para un ataque repartido no. Si algún
// día hace falta de verdad, va contra una tabla, como `company_token_usage`.
// Prefiero esto explicado a un `TODO` que nadie lee.

const golpes = new Map();   // clave → [timestamps]

export function permitido(clave, { max = 3, ventanaMs = 15 * 60 * 1000, ahora = Date.now() } = {}) {
  const k = String(clave || "").trim().toLowerCase();
  if (!k) return true;   // sin clave no hay a quién frenar; el endpoint ya valida

  const previos = (golpes.get(k) || []).filter((t) => ahora - t < ventanaMs);
  if (previos.length >= max) {
    golpes.set(k, previos);
    return false;
  }
  previos.push(ahora);
  golpes.set(k, previos);

  // Barrido perezoso: sin esto el mapa crece para siempre en una instancia que
  // vive horas. Se hace acá y no con un timer para no dejar el proceso vivo.
  if (golpes.size > 500) {
    for (const [otra, ts] of golpes) {
      const vivos = ts.filter((t) => ahora - t < ventanaMs);
      if (vivos.length) golpes.set(otra, vivos); else golpes.delete(otra);
    }
  }
  return true;
}

// Para las pruebas: deja el mapa como recién arrancado.
export function _reset() { golpes.clear(); }
