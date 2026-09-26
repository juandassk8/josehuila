// Las contraseñas que reparte un admin.
//
// Acá no hay correos. El equipo no tiene SMTP configurado, así que un flujo de
// "te mandamos un link" sería prometer algo que nunca llega. La forma que funciona
// es la que ya se usaba para dar de alta a alguien: se genera una contraseña, se
// copia y se manda por WhatsApp. Esto es lo mismo para quien YA tiene cuenta.

/**
 * Genera una contraseña de 12 caracteres.
 *
 * El alfabeto no lleva `I`, `l`, `1`, `O`, `0` a propósito: esta contraseña se dicta
 * por WhatsApp o se lee de una captura, y una ele confundida con un uno es un
 * "no me deja entrar" que cuesta otra vuelta de mensajes.
 */
export function generarClave() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const n = 12;
  // `crypto` en vez de Math.random: es una credencial real de una persona real, y
  // pedir azar de verdad no cuesta nada donde ya está disponible.
  const azar = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(n)))
    : Array.from({ length: n }, () => Math.floor(Math.random() * 0xffffffff));
  return azar.map((v) => abc[v % abc.length]).join("");
}

/** El mínimo que exige el servidor. Se repite acá para no ir hasta el servidor a que lo rebote. */
export const LARGO_MINIMO = 8;

/** Revisa la contraseña antes de mandarla. El error sale escrito para mostrar tal cual. */
export function revisarClave(clave) {
  const c = String(clave ?? "");
  if (!c.trim()) return { ok: false, error: "Escribe o genera una contraseña." };
  if (c.length < LARGO_MINIMO) {
    return { ok: false, error: `Muy corta: mínimo ${LARGO_MINIMO} caracteres.` };
  }
  return { ok: true };
}

/**
 * El texto que se copia al portapapeles.
 *
 * Va con el nombre de quien la va a usar. Cuando se cambian dos contraseñas
 * seguidas, lo único que evita mandarle a Deison la de Johan es que el mensaje
 * diga de quién es.
 */
export function textoParaMandar({ nombre, email, clave }) {
  return [
    nombre ? `Entrada a Inforce Central — ${nombre}` : "Entrada a Inforce Central",
    `Email: ${email}`,
    `Contraseña: ${clave}`,
  ].join("\n");
}
