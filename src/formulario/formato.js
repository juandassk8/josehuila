// Cómo se ven los números en el formulario. Puro, sin React.

const redondo = (n) => Math.round(Number(n) || 0);

// 47000 → "$47.000". Siempre punto de miles, como se escribe en Colombia, sin
// depender del locale del celular del cliente.
export function pesos(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  const v = redondo(n);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "-" : ""}$${s}`;
}

export function miles(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return String(redondo(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// 3.3333 → "3,3" · 3 → "3" · 1.25 → "1,3". Coma decimal.
export function decimal(n, d = 1) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  const f = 10 ** d;
  return String(Math.round(Number(n) * f) / f).replace(".", ",");
}

// "45.000.000" / "$45,000,000" / "45000000" → 45000000. Lo que no sea dígito se
// ignora: en un monto en pesos no hay decimales que cuidar.
export function leerMonto(texto) {
  const d = String(texto ?? "").replace(/\D/g, "");
  return d ? Number(d) : null;
}

// "2,5" o "2.5" → 2.5
export function leerDecimal(texto) {
  const t = String(texto ?? "").trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (!t || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── La cifra en palabras ────────────────────────────────────────────────────
// "$45.000.000 — cuarenta y cinco millones". Va debajo de cada monto porque un
// cero de más en la facturación daña todos los cálculos y en números no se ve.

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

// 1..999. `apocope`: "uno" → "un" cuando le sigue "mil" o "millones"
// (veintiún mil, cuarenta y un millones).
function hasta999(n, apocope) {
  if (n === 100) return "cien";
  const partes = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 30) {
      let u = UNIDADES[resto];
      if (apocope && resto === 1) u = "un";
      if (apocope && resto === 21) u = "veintiún";
      partes.push(u);
    } else {
      const d = DECENAS[Math.floor(resto / 10)];
      const u = resto % 10;
      partes.push(u ? `${d} y ${apocope && u === 1 ? "un" : UNIDADES[u]}` : d);
    }
  }
  return partes.join(" ");
}

// 0..999.999
function hasta999999(n, apocope) {
  const m = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes = [];
  if (m === 1) partes.push("mil");
  else if (m > 1) partes.push(`${hasta999(m, true)} mil`);
  if (resto) partes.push(hasta999(resto, apocope));
  return partes.join(" ");
}

export function montoEnPalabras(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  const v = redondo(n);
  if (v < 0 || v >= 1e12) return "";
  if (v === 0) return "cero";
  const millones = Math.floor(v / 1e6);
  const resto = v % 1e6;
  const partes = [];
  if (millones === 1) partes.push("un millón");
  else if (millones > 1) partes.push(`${hasta999999(millones, true)} millones`);
  if (resto) partes.push(hasta999999(resto, false));
  return partes.join(" ");
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// El "[mes + 3]" de la 3.3.
export function mesMasTres(hoy = new Date()) {
  return MESES[(hoy.getMonth() + 3) % 12];
}
