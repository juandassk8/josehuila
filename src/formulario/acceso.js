// Las credenciales del portal las arma el portal, no el cliente (decisión de José,
// 2026-09-20): nadie deja acá su correo real como usuario ni una contraseña suya.
//
//   usuario:  <marca>.<nombre>@inforce.team   →  lamilenaria.jose@inforce.team
//
// `@inforce.team` es el dominio que ya usan las cuentas internas del portal
// (jose@, nath@, deison@…). No recibe correo: es solo el nombre de usuario. El
// correo REAL de cada socio sigue guardado en su ficha y en la 1.6, para contacto.

export const DOMINIO_ACCESO = "inforce.team";

const limpiar = (t) => String(t || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "");

// Solo el primer nombre: "José Manuel Huila" → jose. La marca va completa y pegada.
export function usuarioDeAcceso(marca, nombre, intento = 0) {
  const m = limpiar(marca).slice(0, 30) || "marca";
  const n = limpiar(String(nombre || "").trim().split(/\s+/)[0]).slice(0, 20) || "socio";
  return `${m}.${n}${intento ? intento + 1 : ""}@${DOMINIO_ACCESO}`;
}

// La contraseña: la marca adelante para que se reconozca de cuál portal es, y ocho
// caracteres al azar que son los que la protegen. Sin 0/O ni 1/l/I, que se
// confunden al copiarla a mano. `azar(n)` devuelve n enteros aleatorios (se inyecta
// para poder probarla; en el navegador sale de crypto.getRandomValues).
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function claveDeAcceso(marca, azar) {
  const base = limpiar(String(marca || "").trim().split(/\s+/)[0]).slice(0, 10) || "inforce";
  const letras = Array.from(azar(8), (x) => ABC[x % ABC.length]).join("");
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}-${letras.slice(0, 4)}-${letras.slice(4)}`;
}
