// Validaciones que evitan basura en el diagnóstico — docs/formulario-onboarding.md.
//
// Puro. Lo corre la pantalla antes de dejar avanzar y lo vuelve a correr
// `api/onboarding-form.js` antes de guardar: el servidor nunca confía en el
// navegador. Devuelve `{ ok, valor, error }` — `valor` ya normalizado (la URL con
// https, el arroba con @, los correos en minúscula).
//
// Todo campo es obligatorio. "No lo sé" solo existe en las cuatro casillas.

import { pantalla as pantallaPorId } from "./flujo.js";
import { pesos, decimal } from "./formato.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IG_RE = /^[a-z0-9._]{1,30}$/i;

const ok = (valor) => ({ ok: true, valor });
const mal = (error) => ({ ok: false, error });
const esNum = (v) => typeof v === "number" && Number.isFinite(v);
// Un celular colombiano son 10 dígitos y empieza por 3; un fijo también son 10
// (60 + indicativo). Con +57 adelante se acepta igual. De otro país: con el + y
// su indicativo. «312918232323» (12 dígitos, sin +) pasaba derecho: ya no.
function telefonoValido(crudo) {
  const t = String(crudo ?? "").trim();
  const d = t.replace(/\D/g, "");
  if (t.startsWith("+")) return d.startsWith("57") ? /^57[36]\d{9}$/.test(d) : d.length >= 8 && d.length <= 15;
  if (/^57[36]\d{9}$/.test(d)) return true;
  return /^[36]\d{9}$/.test(d);
}

const limpio = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

function entero(v, { min = 1, max = 100000 } = {}) {
  if (!esNum(v) || !Number.isInteger(v)) return mal("Pon un número entero.");
  if (v < min) return mal(`Tiene que ser ${min} o más.`);
  if (v > max) return mal("Ese número está muy alto. Revísalo.");
  return ok(v);
}

function monto(v) {
  if (!esNum(v) || v <= 0) return mal("Pon el valor en pesos.");
  if (v >= 1e12) return mal("Esa cifra está muy alta. Revisa los ceros.");
  return ok(Math.round(v));
}

function pct(v, { decimales = 0 } = {}) {
  if (!esNum(v)) return mal("Pon un porcentaje.");
  if (v < 0 || v > 100) return mal("Tiene que estar entre 0 y 100.");
  const f = 10 ** decimales;
  return ok(Math.round(v * f) / f);
}

// El margen de una fila: en pesos no puede pasar del precio; en % no pasa de 100.
function margenFila(m, precio, etiqueta) {
  if (m?.no_lo_se) return ok({ no_lo_se: true });
  const unidad = m?.unidad === "pct" ? "pct" : "pesos";
  if (!esNum(m?.valor) || m.valor <= 0) return mal(`Falta lo que te queda de ${etiqueta}. Si no lo tienes, marca "no lo sé".`);
  if (unidad === "pct" && m.valor >= 100) return mal(`El margen de ${etiqueta} no puede ser 100% o más.`);
  if (unidad === "pesos" && esNum(precio) && m.valor > precio) return mal(`El margen de ${etiqueta} no puede ser mayor que su precio.`);
  return ok({ valor: m.valor, unidad });
}

const CONTROLES = {
  texto(v) {
    const t = limpio(v);
    if (t.length < 2) return mal("Escríbelo para seguir.");
    return ok(t.slice(0, 120));
  },

  url(v) {
    let t = String(v ?? "").trim();
    if (!t) return mal("Pega la dirección de tu página.");
    if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
    try {
      const u = new URL(t);
      if (!u.hostname.includes(".") || /\s/.test(t)) throw new Error();
      return ok(u.toString());
    } catch {
      return mal("Esa dirección no parece una página. Pégala completa, con https.");
    }
  },

  instagram(v) {
    let t = String(v ?? "").trim();
    // Mucha gente pega el link del perfil en vez del arroba.
    t = t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?].*$/, "").replace(/^@+/, "");
    if (!IG_RE.test(t)) return mal("Pon solo el arroba, sin espacios.");
    return ok(`@${t.toLowerCase()}`);
  },

  socios(v) {
    const filas = Array.isArray(v) ? v : [];
    if (filas.length === 0) return mal("Agrega al menos un dueño.");
    if (filas.length > 10) return mal("Son muchos socios. Pon los principales.");
    const vistos = new Set();
    const out = [];
    for (const [i, f] of filas.entries()) {
      const nombre = limpio(f?.nombre);
      const correo = String(f?.correo ?? "").trim().toLowerCase();
      const telefono = String(f?.telefono ?? "").replace(/[^\d+]/g, "");
      const quien = nombre || `el socio ${i + 1}`;
      if (nombre.length < 2) return mal("Falta el nombre de un socio.");
      if (!EMAIL_RE.test(correo)) return mal(`El correo de ${quien} no está bien escrito.`);
      if (vistos.has(correo)) return mal("Hay dos socios con el mismo correo. Cada uno necesita el suyo.");
      if (!telefono.replace(/\D/g, "")) return mal(`Falta el teléfono de ${quien}.`);
      if (!telefonoValido(telefono)) return mal(`El teléfono de ${quien} no cuadra: un celular son 10 dígitos. Si es de otro país, ponlo con + y el indicativo.`);
      vistos.add(correo);
      out.push({ nombre, correo, telefono, soy_yo: i === 0 });
    }
    return ok(out);
  },

  si_no(v) {
    return v === "si" || v === "no" ? ok(v) : mal("Elige una.");
  },

  tarjetas(v, p) {
    return p.opciones.some((o) => o.valor === v) ? ok(v) : mal("Elige una.");
  },

  numero(v, p) {
    // Si dijo que maneja categorías distintas, son por lo menos dos.
    return entero(v, { min: p.campo === "num_categorias" ? 2 : 1 });
  },

  productos(v) {
    const filas = Array.isArray(v) ? v : [];
    if (filas.length < 1) return mal("Pon al menos un producto.");
    if (filas.length > 3) return mal("Máximo tres productos.");
    const out = [];
    for (const f of filas) {
      const nombre = limpio(f?.nombre);
      if (nombre.length < 2) return mal("Falta el nombre de un producto.");
      const precio = monto(f?.precio);
      if (!precio.ok) return mal(`Falta el precio de ${nombre}.`);
      out.push({ nombre: nombre.slice(0, 120), precio: precio.valor });
    }
    return ok(out);
  },

  // Una fila por producto de la 2.4, en el mismo orden.
  margenes(v, p, r) {
    const productos = r.productos_principales || [];
    const filas = Array.isArray(v) ? v : [];
    if (filas.length !== productos.length) return mal("Falta el margen de un producto.");
    const out = [];
    for (const [i, m] of filas.entries()) {
      const fila = margenFila(m, productos[i]?.precio, productos[i]?.nombre || "ese producto");
      if (!fila.ok) return fila;
      out.push(fila.valor);
    }
    return ok(out);
  },

  categorias(v) {
    const filas = Array.isArray(v) ? v : [];
    if (filas.length < 1) return mal("Pon al menos una categoría.");
    if (filas.length > 30) return mal("Son muchas categorías. Agrúpalas.");
    const out = [];
    for (const f of filas) {
      const categoria = limpio(f?.categoria);
      if (categoria.length < 2) return mal("Falta el nombre de una categoría.");
      const ticket = monto(f?.ticket);
      if (!ticket.ok) return mal(`Falta el ticket promedio de ${categoria}.`);
      out.push({ categoria: categoria.slice(0, 120), ticket: ticket.valor });
    }
    return ok(out);
  },

  // { valor, unidad: pct|pesos, iva: descontado|sin_descontar|no_aplica }
  rentabilidad(v, p, r) {
    const unidad = v?.unidad === "pesos" ? "pesos" : "pct";
    // Cero es una respuesta válida: «hoy no me queda nada».
    if (!esNum(v?.valor) || v.valor < 0) return mal("Pon cuánto te queda de cada venta. Si hoy no te queda nada, pon 0.");
    if (unidad === "pct" && v.valor >= 100) return mal("No te puede quedar el 100% o más de la venta.");
    if (unidad === "pesos" && esNum(r.ticket_promedio) && v.valor >= r.ticket_promedio) return mal(`No te puede quedar más que tu ticket promedio (${pesos(r.ticket_promedio)}).`);
    if (!p.opcionesIva.some((o) => o.valor === v?.iva)) return mal("Dinos si ese número ya tiene descontado el IVA.");
    return ok({ valor: unidad === "pct" ? Math.round(v.valor * 10) / 10 : Math.round(v.valor), unidad, iva: v.iva });
  },

  // { pct, aproximado }. Un margen de 0% o de 100% no es un margen.
  margen_tienda(v) {
    const n = v?.pct;
    if (!esNum(n) || n <= 0 || n >= 100) return mal("Pon cuánto te queda. Tiene que ser más de 0 y menos de lo que vendes.");
    return ok({ pct: Math.round(n * 10) / 10, aproximado: !!v.aproximado });
  },

  pesos: (v) => monto(v),

  decimal(v) {
    if (!esNum(v) || v <= 0) return mal("Pon tu ROAS. Si no lo tienes, dale a Calcúlalo por mí.");
    // Un ROAS que redondea a 0 casi siempre es un cero de más en la inversión.
    if (v < 0.05) return mal("Ese ROAS da casi cero, y eso no cuadra. Revisa cuánto pusiste que invertiste en pauta: puede tener ceros de más.");
    if (v > 100) return mal("Ese ROAS está muy alto. Revisa cuánto pusiste que invertiste en pauta.");
    return ok(Math.round(v * 100) / 100);
  },

  porcentaje: (v, p) => pct(v, { decimales: p.decimales || 0 }),

  // Los dos porcentajes tienen que sumar 100.
  reparto(v) {
    const c = v?.contraentrega, a = v?.anticipado;
    if (!esNum(c) || !esNum(a) || c < 0 || a < 0) return mal("Mueve el control para repartir los 100 pedidos.");
    if (Math.round(c) + Math.round(a) !== 100) return mal("Los dos tienen que sumar 100.");
    return ok({ contraentrega: Math.round(c), anticipado: Math.round(a) });
  },

  opciones_pct(v) {
    if (!esNum(v) || v <= 0 || v >= 100) return mal("Elige una, o pon tu porcentaje en \"otro\".");
    return ok(Math.round(v));
  },

  // { pct, cada: { n, unidad: dias|meses|anos } }  ·  o  cada: "una_vez"
  recompra(v) {
    const p = pct(v?.pct, { decimales: 1 });
    if (!p.ok) return mal("Pon qué porcentaje te vuelve a comprar.");
    if (v?.cada === "una_vez") return ok({ pct: p.valor, cada: "una_vez" });
    const n = v?.cada?.n, unidad = v?.cada?.unidad;
    if (!esNum(n) || !Number.isInteger(n) || n < 1 || n > 999) return mal("Falta el cada cuánto: pon el número.");
    if (!["dias", "meses", "anos"].includes(unidad)) return mal("Elige si son días, meses o años.");
    return ok({ pct: p.valor, cada: { n, unidad } });
  },

  // { nombre, roles: [...], que_hace } — uno o varios roles de la lista, y/o lo que
  // hace escrito. Con alguno de los dos alcanza.
  equipo(v, p) {
    const filas = Array.isArray(v) ? v : [];
    if (filas.length < 1) return mal("Agrega al menos una persona.");
    if (filas.length > 60) return mal("Son muchas personas. Agrupa las que hacen lo mismo.");
    const validos = new Set(p.roles || []);
    const out = [];
    for (const f of filas) {
      const nombre = limpio(f?.nombre);
      const que_hace = limpio(f?.que_hace);
      const roles = [...new Set((Array.isArray(f?.roles) ? f.roles : []).filter((x) => validos.has(x)))];
      if (nombre.length < 2) return mal("Falta el nombre de una persona.");
      if (roles.length === 0 && que_hace.length < 3) return mal(`Marca qué hace ${nombre}, o escríbelo.`);
      out.push({ nombre: nombre.slice(0, 120), roles, que_hace: que_hace.slice(0, 300) });
    }
    return ok(out);
  },
};

// Valida lo que manda una pantalla. `r` son las respuestas ya guardadas (la 2.5
// necesita los precios de la 2.4). `noLoSe` solo se acepta donde hay casilla.
export function validar(idPantalla, valor, { r = {}, noLoSe = false } = {}) {
  const p = pantallaPorId(idPantalla);
  if (!p || !p.campo) return mal("Pantalla desconocida.");

  if (p.tipo === "confirmacion") {
    return esNum(valor) && valor === p.valorAlConfirmar(r) ? ok(valor) : mal("Confirma o corrige la meta.");
  }

  // Las casillas simples (4.1, 4.2, 5.1): marcarla ES la respuesta. En la 2.5 y
  // la 2.6 la casilla va por fila y se valida adentro.
  if (noLoSe) return p.noLoSe ? ok(null) : mal("Este dato es obligatorio.");

  const control = CONTROLES[p.control];
  if (!control) return mal("Pantalla desconocida.");
  const v = control(valor, p, r);
  if (v.ok && p.campo === "facturacion_3m_total" && esNum(r.facturacion_mes_pasado) && v.valor < r.facturacion_mes_pasado) {
    return mal(`Es el total de los tres meses juntos: no puede ser menos que lo del mes pasado (${pesos(r.facturacion_mes_pasado)}).`);
  }
  return v;
}

// ── Avisos: «¿estás seguro?» ────────────────────────────────────────────────
// No rechazan nada: el dato puede ser verdad. Pero un cero de más en la pauta, o
// «22» en pesos cuando era 22%, daña todos los cálculos y en el número no se ve.
// La pantalla muestra la pregunta y deja seguir con un segundo toque.
export function aviso(idPantalla, valor, r = {}) {
  const p = pantallaPorId(idPantalla);
  if (!p) return null;
  const fact = r.facturacion_mes_pasado;

  // La rentabilidad tiene que cuadrar con lo que ya dijo: lo que le queda + lo que
  // paga por la venta no puede ser casi toda la venta.
  if (p.control === "rentabilidad") {
    const t = r.ticket_promedio, v = valor?.valor;
    if (!esNum(t) || !esNum(v)) return null;
    const neto = valor.unidad === "pesos" ? v : (t * v) / 100;
    const pctNeto = (neto / t) * 100;
    if (valor.unidad === "pesos" && neto < t * 0.01) return `¿Seguro que de una venta de ${pesos(t)} te quedan ${pesos(neto)}? Si querías decir ${decimal(v, 0)}%, cámbialo a «En %».`;
    if (pctNeto === 0) return "¿Seguro que hoy no te queda nada de cada venta? Si es así, dale a seguir: justo eso es lo que vamos a arreglar.";
    if (pctNeto < 3) return `¿Seguro que solo te queda el ${decimal(pctNeto)}% de cada venta? Es muy poco.`;
    if (esNum(r.cpa_mes) && neto + r.cpa_mes > t * 0.8) return `Si te quedan ${pesos(neto)} y además pagas ${pesos(r.cpa_mes)} por conseguir la venta, el producto y el envío te estarían costando menos del 20% de lo que vendes. ¿Seguro? Es lo que te queda DESPUÉS de pagar la pauta.`;
    if (pctNeto > 50) return `¿Seguro que te queda el ${decimal(pctNeto, 0)}% de cada venta ya pagando todo? Es muy alto.`;
    return null;
  }

  if (!esNum(valor)) return null;
  switch (p.campo) {
    case "facturacion_mes_pasado":
      return valor < 1_000_000 ? `¿Seguro que facturaste ${pesos(valor)} en todo el mes? Revisa que no le falten ceros.` : null;
    case "facturacion_objetivo_3m":
      return esNum(fact) && valor > fact * 10 ? `Tu meta es más de diez veces lo que facturaste el mes pasado (${pesos(fact)}). ¿Está bien, o se fue un cero de más?` : null;
    case "ticket_promedio":
      return esNum(fact) && valor > fact / 5 ? `¿Seguro que tu ticket promedio es ${pesos(valor)}? Facturaste ${pesos(fact)} en el mes: eso serían menos de cinco pedidos.` : null;
    case "gasto_pauta_mes":
      return esNum(fact) && valor > fact ? `Pusiste que invertiste ${pesos(valor)} en pauta y que facturaste ${pesos(fact)} en el mes. ¿Seguro? Revisa que no se te haya ido un cero de más.` : null;
    case "cpa_mes":
      return esNum(r.ticket_promedio) && valor > r.ticket_promedio ? `Conseguir una venta te estaría costando ${pesos(valor)}, más que tu ticket promedio (${pesos(r.ticket_promedio)}). ¿Está bien, o hay un número mal puesto atrás?` : null;
    case "cpa_objetivo":
      return esNum(r.cpa_mes) && valor > r.cpa_mes ? `Tu CPA objetivo (${pesos(valor)}) es más alto que lo que pagas hoy (${pesos(r.cpa_mes)}). ¿Está bien? Normalmente el objetivo es pagar menos.` : null;
    default:
      return null;
  }
}

// El dato crudo de "Calcúlalo por mí".
export function validarCalculalo(idPantalla, valor) {
  const c = pantallaPorId(idPantalla)?.calculalo;
  if (!c) return mal("Pantalla desconocida.");
  if (c.control === "numero") {
    const n = entero(valor, { min: 1, max: 10_000_000 });
    return n.ok ? n : mal("Pon cuántas compras te entraron. Tiene que ser al menos una.");
  }
  return monto(valor);
}

// ¿El cliente marcó "no lo sé" en esta respuesta? En la 2.5 y la 2.6 la casilla
// va por fila: con una sola marcada ya cuenta para el 2.2.
export function marcoNoLoSe(idPantalla, valor, noLoSe) {
  return !!pantallaPorId(idPantalla)?.noLoSe && !!noLoSe;
}

// El acceso (C.1).
export function validarAcceso({ correo, clave, confirmacion }) {
  const email = String(correo ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return mal("Ese correo no está bien escrito.");
  if (String(clave ?? "").length < 8) return mal("La contraseña tiene que tener al menos 8 caracteres.");
  if (confirmacion !== undefined && clave !== confirmacion) return mal("Las dos contraseñas no coinciden.");
  return ok({ correo: email, clave: String(clave) });
}
