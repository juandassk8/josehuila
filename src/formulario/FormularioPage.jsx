// Formulario de onboarding — `/inicio/<token>`. Spec: docs/formulario-onboarding.md
//
// Una pregunta por pantalla, barra de progreso arriba, guarda en cada respuesta
// y retoma donde quedó. Esta página solo PINTA y orquesta: qué dice cada
// pantalla, las ramas y el retomar viven en flujo.js; los números, en
// calculos.js; las reglas, en validaciones.js. El servidor revalida todo.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./formulario.css";
import { database } from "../lib/backend.js";
import {
  BLOQUES, pantalla as pantallaPorId, siguientePantalla, despuesDe, antesDe, pantallasActivas,
  respuestasVigentes, bloquesNavegables, progreso, texto,
} from "./flujo.js";
import { calcular, cpaDesdeCompras, roasDesdeIngresos } from "./calculos.js";
import { validar, validarCalculalo, marcoNoLoSe, aviso as avisoDe } from "./validaciones.js";
import {
  Texto, Monto, Decimal, Tarjetas, SiNo, NoLoSe, OpcionesPct, Reparto,
  Socios, Productos, Categorias, Rentabilidad, Recompra, Equipo,
} from "./Controles.jsx";
import { claveDeAcceso } from "./acceso.js";
import { Constelacion } from "./Constelacion.jsx";
import { Revelar } from "./Revelar.jsx";
import { Cifra } from "./Cifra.jsx";

const API = "/api/onboarding-form";

async function llamar(metodo, datos) {
  const url = metodo === "GET" ? `${API}?${new URLSearchParams(datos)}` : API;
  const res = await fetch(url, {
    method: metodo,
    // keepalive: si cierra la pestaña justo después de responder, el guardado llega igual.
    keepalive: metodo === "POST",
    headers: metodo === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: metodo === "POST" ? JSON.stringify(datos) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || "No pudimos guardar. Intenta de nuevo."), { status: res.status });
  return json;
}

// Guardar reintenta solo: en el celular la red se cae a cada rato y el cliente
// no tiene por qué enterarse si al segundo intento pasó.
async function guardarConReintento(datos) {
  let ultimo;
  for (const espera of [0, 900, 2200]) {
    if (espera) await new Promise((ok) => setTimeout(ok, espera));
    try { return await llamar("POST", datos); } catch (err) {
      ultimo = err;
      if (err.status && err.status < 500 && err.status !== 429) throw err;
    }
  }
  throw new Error(ultimo?.status ? ultimo.message : "Se cayó la conexión y no alcanzamos a guardar. Revisa tu internet y dale otra vez.");
}

// El borrador del campo que se está llenando, por si cierra el navegador a mitad
// de una pantalla larga (socios, equipo). Conveniencia: si falla, no pasa nada.
const borrador = {
  leer(token, id) { try { const v = localStorage.getItem(`obf:${token}:${id}`); return v ? JSON.parse(v) : undefined; } catch { return undefined; } },
  guardar(token, id, v) { try { localStorage.setItem(`obf:${token}:${id}`, JSON.stringify(v)); } catch { /* sin storage */ } },
  borrar(token, id) { try { localStorage.removeItem(`obf:${token}:${id}`); } catch { /* sin storage */ } },
};

// **negrilla** dentro de la instrucción gris: las rutas de menú.
function Rico({ children }) {
  const partes = String(children || "").split(/(\*\*[^*]+\*\*)/g);
  return partes.map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : <span key={i}>{t}</span>));
}

// ── Lo visual de la marca (BRANDING.md de inforce-auditoria) ────────────────
// «Titular en dos golpes: afirmación + remate en azul.» El copy viene del spec y no
// se toca, así que el corte se decide acá: donde la frase ya respira (dos puntos,
// punto, coma) y, si no respira, en el último 40% de las palabras.
function partirTitular(t) {
  const txt = String(t || "");
  for (const sep of [": ", ". ", "? "]) {
    const i = txt.indexOf(sep);
    if (i > 0 && i < txt.length - sep.length - 2) return [txt.slice(0, i + sep.length), txt.slice(i + sep.length)];
  }
  const coma = txt.lastIndexOf(", ");
  if (coma > 0 && txt.length - coma > txt.length * 0.3) return [txt.slice(0, coma + 2), txt.slice(coma + 2)];
  const palabras = txt.split(" ");
  if (palabras.length < 3) return [txt, ""];
  const corte = palabras.length - Math.max(1, Math.ceil(palabras.length * 0.4));
  return [`${palabras.slice(0, corte).join(" ")} `, palabras.slice(corte).join(" ")];
}

function Titular({ children, xl = false, as: Tag = "h1", azul: forzado }) {
  const entero = String(children || "");
  const i = forzado ? entero.indexOf(forzado) : -1;
  if (i >= 0) {
    return <Tag className={`obf-titulo ${xl ? "obf-titulo-xl" : ""}`}>{entero.slice(0, i)}<span className="obf-azul">{forzado}</span>{entero.slice(i + forzado.length)}</Tag>;
  }
  const [blanco, azul] = partirTitular(children);
  const largo = !xl && String(children || "").length > 62;
  return <Tag className={`obf-titulo ${xl ? "obf-titulo-xl" : ""} ${largo ? "obf-titulo-largo" : ""}`}>{blanco}{azul && <span className="obf-azul">{azul}</span>}</Tag>;
}

// La cifra del título de una ficha, contando al entrar en pantalla. Es la ÚLTIMA
// cifra del texto: en «Para facturar $80.000.000 necesitas 800 ventas» la que se
// calculó es 800; la meta la puso el cliente.
function TituloConCifra({ children }) {
  const txt = String(children || "");
  const todas = [...txt.matchAll(/(\$?)(\d[\d.]*(?:,\d+)?)/g)];
  const m = todas[todas.length - 1];
  if (!m) return <h3>{txt}</h3>;
  const [entero, dec = ""] = m[2].split(",");
  const hasta = Number(`${entero.replace(/\./g, "")}.${dec || 0}`);
  return (
    <h3>
      {txt.slice(0, m.index)}
      <span className="obf-cifra">{m[1]}<Cifra hasta={hasta} decimales={dec.length} /></span>
      {txt.slice(m.index + m[0].length)}
    </h3>
  );
}

// Iconos de trazo (nunca rellenos), en el azul de la marca.
const TRAZOS = {
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  mapa: <><path d="M12 21s-6.5-5.4-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.500 15.6 12 21 12 21z" /><circle cx="12" cy="10.8" r="2.3" /></>,
  pausa: <><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></>,
  caja: <><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.500 16z" /><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" /></>,
  grafica: <><path d="M4 20V4M4 20h16" /><path d="m7.5 15 3.5-4 3 2.5 4.500-6" /></>,
  web: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9h17M7 6.8h.01M9.5 6.8h.01" /></>,
  clientes: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.800-4.500 5.500-4.500s4.900 1.500 5.500 4.500" /><path d="M15.500 6.200a3 3 0 0 1 0 5.600M17.500 14.800c1.700.600 2.700 2 3 4.200" /></>,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  diagnostico: <><rect x="5" y="4" width="14" height="17" rx="2.500" /><path d="M9 4.500h6M8.500 13h1.800l1.200-2.500 1.700 5 1.200-2.500h1.100" /></>,
  plan: <><path d="M6 6h.01M6 12h.01M6 18h.01" /><path d="M10 6h9M10 12h9M10 18h6" /></>,
  llamadas: <><rect x="3.500" y="6.500" width="12" height="11" rx="2.500" /><path d="m15.500 10.500 5-2.500v8l-5-2.500" /></>,
  chat: <path d="M20.500 11.500a8 8 0 0 1-11.600 7.100L4 20l1.400-4.400A8 8 0 1 1 20.500 11.500z" />,
  equipo: <><circle cx="12" cy="8" r="3.2" /><path d="M5.500 19.500c.7-3.400 3.200-5 6.500-5s5.800 1.600 6.500 5" /></>,
};
const Icono = ({ nombre }) => (<svg viewBox="0 0 24 24" aria-hidden="true">{TRAZOS[nombre] || null}</svg>);

// 2.1 — el ejemplo dibujado: una marca que sí maneja categorías y una que no.
function EjemploLadoALado({ ejemplo }) {
  return (
    <div className="obf-ejemplo" aria-label="Ejemplo">
      {[["si", ejemplo.si], ["no", ejemplo.no]].map(([k, e]) => (
        <div className="obf-ejemplo-lado" data-lado={k} key={k}>
          <span className="obf-ejemplo-rotulo">Ejemplo · {e.titulo}</span>
          <b>{e.marca}</b>
          {e.grupos.map((g) => (
            <div className="obf-ejemplo-grupo" key={g.nombre}><i>{g.nombre}</i>{g.items.map((x) => <span key={x}>{x}</span>)}</div>
          ))}
          <small>{e.pie}</small>
        </div>
      ))}
    </div>
  );
}

// 4.2 — la fórmula como fracción, no como párrafo.
function Formula({ f }) {
  return (
    <div className="obf-formula" aria-label={`${f.arriba} dividido entre ${f.abajo} ${f.por}`}>
      <div className="obf-fraccion"><span>{f.arriba}</span><i /><span>{f.abajo}</span></div>
      <b>{f.por}</b>
    </div>
  );
}

const Chulo = ({ children }) => (
  <li className="obf-chulo"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg></span>{children}</li>
);

// «Aquí va a vivir todo tu proceso con Inforce: tu diagnóstico, tu plan y tus
// llamadas.» → la frase, y sus tres promesas como chulos en vez de un párrafo.
function partirPromesas(t) {
  const txt = String(t || "");
  const i = txt.indexOf(": ");
  if (i < 0) return { frase: txt, promesas: [] };
  const promesas = txt.slice(i + 2).replace(/\.$/, "").split(/,\s*|\s+y\s+/).map((x) => x.trim()).filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  return promesas.length >= 2 ? { frase: txt.slice(0, i + 1), promesas } : { frase: txt, promesas: [] };
}

const Flecha = () => (<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>);

// En celular, tocar el botón con el teclado abierto le quitaba el foco al campo: el
// teclado se cerraba, la pantalla (que va centrada) se corría, y el toque caía donde
// ya no estaba el botón — había que tocar dos veces. `preventDefault` en mousedown
// deja el foco donde está: nada se mueve y el primer toque cuenta.
const noRobarFoco = (e) => e.preventDefault();

function Boton({ children, cargando, type = "button", oro = false, ...props }) {
  return <button type={type} onMouseDown={noRobarFoco} className={`obf-btn ${oro ? "obf-btn-oro" : ""}`} {...props} disabled={props.disabled || cargando}>{cargando ? <span className="obf-spin" /> : children}</button>;
}

// ── La barra: seis bloques, en cuál va y cuántos le faltan ──────────────────
function Barra({ id, r, noLoSe, onIr, onAtras, puedeAtras, guardado }) {
  const p = progreso(id, r, noLoSe);
  const nav = bloquesNavegables(r, noLoSe);
  const activas = pantallasActivas(r).filter((x) => x.tipo === "pregunta");
  const bloque = BLOQUES.find((b) => b.n === p.bloque);
  return (
    <header className="obf-top">
      <div className="obf-top-in">
        <div className="obf-top-row">
          {puedeAtras
            ? <button type="button" className="obf-back" onClick={onAtras}><Flecha />Atrás</button>
            : <span className="obf-marca">Inforce</span>}
          <span className="obf-guardado" style={{ opacity: guardado ? 1 : 0 }}>{guardado || "Guardado"}</span>
          <span className="obf-donde obf-rotulo">{bloque ? `${bloque.titulo} · ${bloque.n} de ${BLOQUES.length}` : "Tu acceso"}</span>
        </div>
        <div className="obf-bloques">
          {nav.map((b) => {
            const delBloque = activas.filter((x) => x.bloque === b.n);
            const hechas = delBloque.filter((x) => r[x.campo] !== undefined || noLoSe[x.campo]).length;
            const f = b.n < p.bloque ? 1 : delBloque.length ? hechas / delBloque.length : 0;
            return (
              <button key={b.n} type="button" className="obf-bloque" data-nav={b.destino ? "1" : "0"} style={{ "--f": f }}
                onClick={() => b.destino && onIr(b.destino)} aria-label={`Bloque ${b.n}: ${b.titulo}`} title={b.titulo}><i /></button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ── Una pregunta ────────────────────────────────────────────────────────────
function Pregunta({ p, ctx, token, inicial, inicialNoLoSe, onGuardada, enFondo, falla }) {
  const [valor, setValor] = useState(() => borrador.leer(token, p.id) ?? inicial ?? null);
  const [noSe, setNoSe] = useState(!!inicialNoLoSe);
  const [error, setError] = useState(falla || "");
  const [guardando, setGuardando] = useState(false);
  // "Calcúlalo por mí": null = cerrado · { crudo, resultado }
  const [calc, setCalc] = useState(null);
  // «¿Estás seguro?»: el texto del aviso que ya se le mostró. Si vuelve a darle a
  // seguir sin cambiar nada, es que sí.
  const [avisado, setAvisado] = useState("");

  const cambiar = (v) => { setValor(v); setError(""); setAvisado(""); borrador.guardar(token, p.id, v); };
  const casillaSimple = !!p.noLoSe;

  const enviar = useCallback(async (forzado) => {
    if (guardando) return;
    const valorAEnviar = forzado !== undefined ? forzado : valor;
    setError("");

    // Dentro de "Calcúlalo por mí": primero calcula y muestra, después sigue.
    if (calc && calc.resultado == null) {
      const crudo = validarCalculalo(p.id, calc.crudo);
      if (!crudo.ok) return setError(crudo.error);
      const gasto = ctx.r.gasto_pauta_mes;
      const calculado = p.campo === "cpa_mes" ? cpaDesdeCompras(gasto, crudo.valor) : roasDesdeIngresos(crudo.valor, gasto);
      const v = validar(p.id, calculado, { r: ctx.r });
      if (!v.ok) return setError(v.error);
      const dudaCalc = avisoDe(p.id, v.valor, ctx.r);
      if (dudaCalc && dudaCalc !== avisado) return setAvisado(dudaCalc);
      setGuardando(true);
      try {
        const out = await guardarConReintento({ action: "guardar", token, pantalla: p.id, calculalo: crudo.valor });
        setAvisado("");
        setCalc({ ...calc, resultado: out.valor, guardado: { [p.campo]: out.valor, [p.calculalo.campo]: crudo.valor } });
      } catch (err) { setError(err.message); } finally { setGuardando(false); }
      return undefined;
    }
    if (calc?.guardado) return onGuardada(calc.guardado, {});

    const v = validar(p.id, valorAEnviar, { r: ctx.r, noLoSe: casillaSimple && noSe });
    if (!v.ok) return setError(v.error);
    const duda = avisoDe(p.id, v.valor, ctx.r);
    if (duda && duda !== avisado) return setAvisado(duda);
    // Avanza YA y guarda en segundo plano: el valor ya pasó por las mismas reglas que
    // usa el servidor, así que esperar la respuesta solo hacía sentir lento el
    // formulario. Si el guardado falla, la página lo devuelve a esta pregunta.
    const sinSaber = casillaSimple && noSe;
    enFondo(p.id, { action: "guardar", token, pantalla: p.id, valor: v.valor, noLoSe: sinSaber });
    borrador.borrar(token, p.id);
    onGuardada({ [p.campo]: v.valor }, { [p.campo]: marcoNoLoSe(p.id, v.valor, sinSaber) });
    return undefined;
  }, [guardando, calc, valor, noSe, p, ctx.r, token, casillaSimple, onGuardada, avisado, enFondo]);

  // Enter avanza. En los bloques repetibles no: ahí Enter pasa de campo en campo.
  const conEnter = !["socios", "productos", "categorias", "equipo", "recompra", "rentabilidad"].includes(p.control);
  // Es un <form>: así también avanza la tecla "ir / siguiente" del teclado del
  // celular, que dispara submit y no siempre un keydown de Enter.
  const onSubmit = (e) => { e.preventDefault(); enviar(); };
  // Elegir una tarjeta ES responder: avanza con un solo toque, sin pedir además
  // «Seguir». La única excepción es dropshipping, que cierra el formulario y no
  // tiene vuelta atrás: esa sí se confirma.
  const elegir = (v) => { cambiar(v); if (v !== "dropshipping") enviar(v); };
  const onKeyDown = (e) => { if (e.key === "Enter" && !conEnter && e.target.tagName === "INPUT") e.preventDefault(); };

  const c = calc ? p.calculalo : null;

  const control = () => {
    if (c) {
      return c.control === "numero"
        ? <Decimal key="calc" valor={calc.crudo ?? null} onChange={(crudo) => { setCalc({ crudo }); setError(""); setAvisado(""); }} entero disabled={calc.resultado != null} />
        : <Monto key="calc" valor={calc.crudo ?? null} onChange={(crudo) => { setCalc({ crudo }); setError(""); setAvisado(""); }} />;
    }
    const base = { valor, onChange: cambiar };
    switch (p.control) {
      case "texto": return <Texto {...base} autoComplete={p.campo === "contacto_nombre" ? "given-name" : "organization"} />;
      case "url": return <Texto {...base} tipo="url" inputMode="url" placeholder="https://" maxLength={300} />;
      case "instagram": return <Texto {...base} placeholder="@tumarca" maxLength={80} />;
      case "tarjetas": return <Tarjetas valor={valor} onChange={elegir} opciones={p.opciones} dos={p.opciones.length === 2} />;
      case "si_no": return <SiNo valor={valor} onChange={elegir} />;
      case "numero": return <Decimal {...base} entero />;
      case "pesos": return <Monto {...base} />;
      case "decimal": return <Decimal {...base} />;
      case "porcentaje": return <Decimal {...base} sufijo="%" entero={!p.decimales} disabled={noSe} />;
      case "opciones_pct": return <OpcionesPct {...base} opciones={p.opciones} />;
      case "reparto": return <Reparto {...base} />;
      case "socios": return <Socios {...base} agregar={p.agregar} nombre={ctx.nombre} />;
      case "productos": return <Productos {...base} agregar={p.agregar} maximo={p.maximo} />;
      case "categorias": return <Categorias {...base} cuantas={ctx.r.num_categorias || 1} />;
      case "rentabilidad": return <Rentabilidad {...base} opcionesIva={p.opcionesIva} ticket={ctx.r.ticket_promedio} />;
      case "recompra": return <Recompra {...base} disabled={noSe} />;
      case "equipo": return <Equipo {...base} agregar={p.agregar} socios={ctx.r.socios || []} roles={p.roles || []} />;
      default: return null;
    }
  };

  return (
    <form className="obf-pantalla" data-dos="1" onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
      <div className="obf-cabeza">
        <Titular>{texto(c ? c.titulo : p.titulo, ctx)}</Titular>
        {(c ? c.instruccion : p.instruccion) && <p className="obf-instr"><Rico>{texto(c ? c.instruccion : p.instruccion, ctx)}</Rico></p>}
      </div>
      {!c && p.ejemplo && <EjemploLadoALado ejemplo={p.ejemplo} />}
      {!c && p.formula && <Formula f={p.formula} />}
      <div className="obf-isla">
      <div className="obf-campo">{control()}</div>
      {casillaSimple && !c && <NoLoSe marcado={noSe} onChange={(v) => { setNoSe(v); setError(""); if (v) cambiar(null); }} />}
      {calc?.resultado != null && <div className="obf-resultado" role="status">{c.resultado(calc.resultado)}</div>}
      {error && <div className="obf-error" role="alert">{error}</div>}
      {avisado && !error && <div className="obf-aviso" role="alert">{avisado}</div>}
      <div className="obf-acciones">
        <Boton type="submit" cargando={guardando}>{avisado && !error ? "Sí, así está bien" : calc && calc.resultado == null ? "Calcular" : "Seguir"}</Boton>
        {p.calculalo && !calc && <button type="button" className="obf-btn obf-btn-sec" onClick={() => { setCalc({ crudo: null }); setError(""); }}>{p.calculalo.boton}</button>}
        {calc && calc.resultado == null && <button type="button" className="obf-btn obf-btn-link" onClick={() => { setCalc(null); setError(""); }}>Ya lo tengo, lo pongo yo</button>}
        {conEnter && <div className="obf-enter">Enter para seguir</div>}
      </div>
      </div>
    </form>
  );
}

// ── La meta más baja que el mes pasado: pantalla intermedia, no error rojo ──
function Confirmacion({ p, ctx, token, onGuardada, onIr }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const confirmar = async () => {
    setGuardando(true); setError("");
    try {
      const out = await guardarConReintento({ action: "guardar", token, pantalla: p.id, valor: p.valorAlConfirmar(ctx.r) });
      onGuardada({ [p.campo]: out.valor }, {});
    } catch (err) { setError(err.message); setGuardando(false); }
  };
  return (
    <div className="obf-pantalla" data-dos="1">
      <div className="obf-cabeza"><Titular>{texto(p.titulo, ctx)}</Titular></div>
      <div className="obf-isla">
        {error && <div className="obf-error" role="alert" style={{ marginTop: 0, marginBottom: 14 }}>{error}</div>}
        <div className="obf-acciones" style={{ marginTop: 0 }}>
          <Boton onClick={confirmar} cargando={guardando}>{p.confirmar}</Boton>
          <button type="button" className="obf-btn obf-btn-sec" onClick={() => onIr(p.vuelveA)}>{p.corregir}</button>
        </div>
        <p className="obf-instr" style={{ marginTop: 20 }}>{texto(p.instruccion, ctx)}</p>
      </div>
    </div>
  );
}

// ── Las credenciales las crea el portal, no el cliente ──────────────────────
// Decisión de José (2026-09-20): nadie escribe acá una contraseña suya. La gente
// repite la misma clave en todas partes, y no queremos ser el sitio donde alguien
// dejó la de su banco. El portal genera una, el cliente la copia y entra con esa.
// Sin caracteres que se confundan al dictarla o copiarla a mano (0/O, 1/l/I).
const azar = (n) => { const x = new Uint32Array(n); window.crypto.getRandomValues(x); return Array.from(x); };

// Un solo bloque con todo, listo para pegarlo en sus notas o mandárselo a sí mismo
// por WhatsApp.
const textoCredenciales = ({ correo, clave, slug }) =>
  `Portal Inforce\n${window.location.origin}${slug ? `/cliente/${slug}` : "/login"}\nUsuario: ${correo}\nContraseña: ${clave}`;

// La contraseña se muestra una sola vez y vive únicamente en la memoria de esta
// pestaña. Recargar exige pedir una nueva al equipo; no dejamos credenciales en el
// almacenamiento persistente del navegador.
const credencialesTemporales = new Map();
const credGuardadas = {
  leer(token) {
    return credencialesTemporales.get(token) || null;
  },
  guardar(token, correo, clave) { credencialesTemporales.set(token, { correo, clave }); },
};

async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

function Credenciales({ correo, clave, onCopiar, copiado }) {
  return (
    <div className="obf-credenciales">
      <dl>
        <div><dt>Tu usuario</dt><dd>{correo}</dd></div>
        <div><dt>Tu contraseña</dt><dd className="obf-mono">{clave}</dd></div>
      </dl>
      {onCopiar && (
        <button type="button" className="obf-copiar" onClick={onCopiar} data-ok={copiado ? "1" : undefined}>
          <span className="obf-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{copiado ? <path d="m4.5 12.5 5 5 10-11" /> : <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" /></>}</svg></span>
          {copiado ? "Copiadas" : "Copiar"}
        </button>
      )}
    </div>
  );
}

// El portal todavía no está adaptado a celular (José, 2026-09-21). El formulario sí se
// llena desde el celular, así que al final, en vez de mandarlo a un portal que se va
// a ver mal, se le dice que lo abra en un computador y se le deja copiar el link.
const esCelular = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 820px), (pointer: coarse) and (max-width: 1024px)").matches;

function EntrarAlPortal({ slug, texto: etiqueta = "Entrar al portal" }) {
  const [copiado, setCopiado] = useState(false);
  const url = `${window.location.origin}${slug ? `/cliente/${slug}` : "/login"}`;
  const entrar = () => window.location.assign(url);
  if (!esCelular()) return <div className="obf-acciones"><Boton oro onClick={entrar}>{etiqueta}</Boton></div>;
  return (
    <>
      <div className="obf-punto obf-siguiente obf-ancho" style={{ marginTop: 12 }}>
        <div><b>El portal todavía no está adaptado a celular.</b><span style={{ display: "block", marginTop: 4, fontSize: 13.5, color: "var(--ink-2)", fontWeight: 400 }}>Ábrelo desde un computador con este link: {url.replace(/^https?:\/\//, "")}</span></div>
      </div>
      <div className="obf-acciones">
        <Boton oro onClick={async () => setCopiado(await copiarTexto(url))}>{copiado ? "Link copiado" : "Copiar el link del portal"}</Boton>
        <button type="button" className="obf-btn obf-btn-link" onClick={entrar}>Entrar de todas formas</button>
      </div>
    </>
  );
}

// ── El cierre: su acceso al portal ──────────────────────────────────────────
// Titular corto + bajada: «Listo, Laura.» grande, y el resto de la frase debajo,
// en cuerpo. Es el mismo copy del spec, solo que un párrafo a tamaño de titular no
// se lee: se mira.
function TitularYBajada({ children, xl = false }) {
  const txt = String(children || "");
  const corte = txt.indexOf(". ");
  if (corte < 0) return <Titular xl={xl}>{txt}</Titular>;
  return (<><Titular xl={xl}>{txt.slice(0, corte + 1)}</Titular><p className="obf-texto">{txt.slice(corte + 2)}</p></>);
}

function Cierre({ ctx, token, yaTieneCuenta, slugInicial, usuarioPrevisto, antes }) {
  // Solo en desarrollo: `?ver=C.2` pinta la pantalla final sin crear ninguna cuenta,
  // para poder diseñarla. En producción este atajo no existe.
  const soloVer = import.meta.env.DEV && new URLSearchParams(window.location.search).get("ver") === "C.2";
  const [paso, setPaso] = useState(soloVer ? "C.2" : yaTieneCuenta ? "cerrando" : "C.1");
  const [correo, setCorreo] = useState(usuarioPrevisto || "");
  const [clave] = useState(() => claveDeAcceso(ctx.marca, azar));
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [slug, setSlug] = useState(slugInicial || "");
  const arranco = useRef(false);
  const copiar = async (s = slug) => {
    const ok = await copiarTexto(textoCredenciales({ marca: ctx.marca, correo: correo.trim().toLowerCase(), clave, slug: s }));
    setCopiado(ok);
    if (!ok) setError("No pudimos copiarlas solas. Selecciónalas y cópialas a mano antes de seguir.");
    return ok;
  };

  // Marca que ya tenía cuenta: se cierra el formulario y no se toca nada más.
  useEffect(() => {
    if (!yaTieneCuenta || arranco.current) return;
    arranco.current = true;
    Promise.resolve(antes?.()).then(() => llamar("POST", { action: "finalizar", token }))
      .then((out) => { setSlug(out.slug || ""); setPaso("C.ya"); })
      .catch((err) => { setError(err.message); setPaso("C.ya"); });
  }, [yaTieneCuenta, token]);

  const crear = async () => {
    setGuardando(true); setError("");
    // Se copian ANTES de crear: si el cliente cierra la pestaña apenas termine,
    // ya las tiene en el portapapeles.
    await copiar();
    try {
      await antes?.();   // que termine de guardarse la última respuesta antes de cerrar
      const out = await llamar("POST", { action: "finalizar", token, clave });
      setSlug(out.slug || "");
      // El usuario definitivo lo dice el servidor (si el previsto ya existía, le
      // puso un número). Si cambió, se vuelve a copiar con el bueno.
      credGuardadas.guardar(token, out.correo || correo, clave);
      // Se vuelve a copiar con lo definitivo: el usuario y el link del portal los
      // confirma el servidor (el slug de una empresa recién creada cambia con la 1.2).
      if (out.correo) {
        setCorreo(out.correo);
        copiarTexto(textoCredenciales({ marca: ctx.marca, correo: out.correo, clave, slug: out.slug }));
      }
      // Sin correo de confirmación de por medio: entra en el mismo momento.
      await database.auth.signInWithPassword({ email: out.correo || correo, password: clave }).catch(() => {});
      setPaso("C.2");
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
    return undefined;
  };

  const entrar = () => window.location.assign(slug ? `/cliente/${slug}` : "/login");

  if (paso === "cerrando") return <div className="obf-centro"><span className="obf-spin" /></div>;

  if (paso === "C.1") {
    const p = pantallaPorId("C.1");
    return (
      <div className="obf-pantalla" data-dos="1" >
        <div className="obf-cabeza"><TitularYBajada>{texto(p.titulo, ctx)}</TitularYBajada></div>
        <div className="obf-isla">
          <div className="obf-filas">
            <div><span className="obf-label">{p.etiquetaCorreo}</span><div className="obf-input obf-clave-lista">{correo}</div></div>
            <div><span className="obf-label">{p.etiquetaClave}</span><div className="obf-input obf-mono obf-clave-lista">{clave}</div></div>
          </div>
          <p className="obf-instr" style={{ marginTop: 12, fontSize: 13.5 }}>{p.ayuda}</p>
          {error && <div className="obf-error" role="alert">{error}</div>}
          <div className="obf-acciones"><Boton onClick={crear} cargando={guardando}>{p.boton}</Boton></div>
        </div>
      </div>
    );
  }

  const p = pantallaPorId(paso);
  const { frase, promesas } = partirPromesas(texto(p.texto, ctx));
  const ICONOS = ["diagnostico", "plan", "llamadas"];
  // Misma gramática visual de la bienvenida y de los cambios de sección: gráfico
  // arriba, título, bajada, bloquecitos con icono, y el botón al final.
  return (
    <div className="obf-pantalla" data-centro="1" data-tipo="final">
      <div className="obf-seccion-ic" data-ok="1"><Icono nombre="check" /></div>
      <TitularYBajada xl>{texto(p.titulo, ctx)}</TitularYBajada>
      {p.texto && <p className="obf-texto">{frase.replace(/:$/, ".")}</p>}
      {promesas.length > 0 && (
        <ul className="obf-trio">
          {promesas.map((x, i) => (
            <Revelar key={x} retraso={120 + i * 90}><li><span className="obf-punto-ic"><Icono nombre={ICONOS[i] || "check"} /></span>{x}</li></Revelar>
          ))}
        </ul>
      )}
      {paso === "C.2" && (
        <Revelar retraso={400} className="obf-ancho">
          <div className="obf-isla obf-acceso">
            <span className="obf-rotulo">Tus datos de acceso</span>
            <Credenciales correo={correo.trim().toLowerCase()} clave={clave} copiado={copiado} onCopiar={() => copiar()} />
          </div>
        </Revelar>
      )}
      {p.siguiente && (
        <Revelar retraso={480} className="obf-ancho">
          <div className="obf-punto obf-siguiente"><span className="obf-punto-ic"><Icono nombre="chat" /></span><div><b>{p.siguiente}</b></div></div>
        </Revelar>
      )}
      {error && <div className="obf-error" role="alert">{error}</div>}
      <EntrarAlPortal slug={slug} texto={p.boton} />
    </div>
  );
}

// El link después de completado: lo único que muestra es el acceso.
function YaCompleto({ usuario, clave, slug }) {
  const [copiado, setCopiado] = useState(false);
  const entrar = () => window.location.assign(slug ? `/cliente/${slug}` : "/login");
  return (
    <main className="obf-main"><div className="obf-pantalla" data-centro="1">
      <Titular xl>Ya llenaste este formulario.</Titular>
      {usuario && clave && (
        <Credenciales correo={usuario} clave={clave} copiado={copiado}
          onCopiar={async () => setCopiado(await copiarTexto(textoCredenciales({ correo: usuario, clave, slug })))} />
      )}
      {usuario && !clave && (<>
        <div className="obf-credenciales"><dl><div><dt>Tu usuario</dt><dd>{usuario}</dd></div></dl></div>
        <p className="obf-texto" style={{ fontSize: 15 }}>Si no tienes tu contraseña a la mano, escríbenos por el grupo y te generamos una nueva.</p>
      </>)}
      {!usuario && <p className="obf-texto">Entra al portal con tu correo de siempre.</p>}
      <EntrarAlPortal slug={slug} />
    </div></main>
  );
}

// ── La página ───────────────────────────────────────────────────────────────
function Formulario({ token }) {
  const [estado, setEstado] = useState(null);      // null = cargando
  const [r, setR] = useState({});
  const [noLoSe, setNoLoSe] = useState({});
  const [id, setId] = useState("1.0");
  const [guardado, setGuardado] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    llamar("GET", { token }).then((d) => {
      setR(d.respuestas || {}); setNoLoSe(d.noLoSe || {});
      // Retoma donde quedó: la primera pregunta sin responder, no el principio.
      if (d.estado === "abierto") setId(siguientePantalla(d.respuestas || {}, d.noLoSe || {}));
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("ver") === "C.2") setId("cierre");
      setEstado(d);
    }).catch((err) => setEstado({ estado: "error", error: err.message }));
  }, [token]);

  const ir = useCallback((destino) => {
    setId(destino);
    requestAnimationFrame(() => document.querySelector(".obf")?.scrollTo({ top: 0 }));
  }, []);

  // El botón atrás del celular vuelve a la pregunta anterior en vez de sacarlo
  // del formulario.
  const historial = useRef([]);
  const avanzar = useCallback((destino) => {
    historial.current.push(id);
    window.history.pushState({ obf: true }, "");
    ir(destino);
  }, [id, ir]);
  const atras = useCallback(() => {
    const previo = historial.current.pop() || (id !== "cierre" ? antesDe(id, r) : null);
    if (previo) ir(previo);
  }, [ir, id, r]);
  useEffect(() => {
    const on = () => atras();
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [atras]);

  // La cola de guardado: una respuesta detrás de otra, en orden, sin frenar al
  // cliente. `pendientes` alimenta el «Guardando…» de arriba; si una falla después
  // de reintentar, se le devuelve a esa pregunta con el motivo.
  const cola = useRef(Promise.resolve());
  const [pendientes, setPendientes] = useState(0);
  const [falla, setFalla] = useState(null);      // { id, mensaje }
  const enFondo = useCallback((idPantalla, datos) => {
    setPendientes((n) => n + 1);
    setFalla(null);
    cola.current = cola.current
      .then(() => guardarConReintento(datos))
      .then(() => { setGuardado(true); setTimeout(() => setGuardado(false), 1600); })
      .catch((err) => { setFalla({ id: idPantalla, mensaje: err.message }); setId(idPantalla); })
      .finally(() => setPendientes((n) => n - 1));
    return cola.current;
  }, []);

  const ctx = useMemo(() => ({
    nombre: r.contacto_nombre || "", marca: r.marca_nombre || "", r,
    c: calcular(respuestasVigentes(r), noLoSe), hoy: new Date(),
  }), [r, noLoSe]);

  // «Corregir» desde una recompensa: va a esa pregunta y, apenas la guarda, vuelve
  // derecho a la recompensa en vez de hacerlo pasar otra vez por todo el bloque.
  const retorno = useRef(null);      // { de: idPregunta, a: idRecompensa }
  const corregirDesde = useCallback((idRecompensa, idPregunta) => {
    retorno.current = { de: idPregunta, a: idRecompensa };
    avanzar(idPregunta);
  }, [avanzar]);

  const onGuardada = useCallback((valores, casillas) => {
    const nuevoR = { ...r };
    for (const [k, v] of Object.entries(valores)) { if (v === null || v === undefined) delete nuevoR[k]; else nuevoR[k] = v; }
    const nuevoNls = { ...noLoSe, ...casillas };
    setR(nuevoR); setNoLoSe(nuevoNls);
    const vuelve = retorno.current?.de === id ? retorno.current.a : null;
    retorno.current = null;
    // Solo vuelve si esa recompensa sigue existiendo y ya no le falta nada antes.
    const puedeVolver = vuelve && pantallasActivas(nuevoR).some((x) => x.id === vuelve)
      && !pantallasActivas(nuevoR).slice(0, pantallasActivas(nuevoR).findIndex((x) => x.id === vuelve)).some((x) => x.campo && x.tipo !== "confirmacion" && nuevoR[x.campo] === undefined && !nuevoNls[x.campo])
      && !pantallasActivas(nuevoR).some((x) => x.tipo === "confirmacion");
    avanzar(puedeVolver ? vuelve : despuesDe(id, nuevoR));
  }, [r, noLoSe, id, avanzar]);

  if (!estado) return <div className="obf-centro"><span className="obf-spin" /></div>;
  if (estado.estado === "error") return <div className="obf-centro"><div><h1>Este link no está activo</h1><p>Pídenos uno nuevo por WhatsApp y seguimos.</p></div></div>;
  if (estado.estado === "completo") {
    const local = credGuardadas.leer(token);
    const usuario = local?.correo || estado.usuario;
    return <YaCompleto usuario={usuario} clave={local?.clave} slug={estado.slug} />;
  }

  const esSalida = estado.estado === "salida" || id === "salida";
  const p = esSalida ? pantallaPorId("salida") : pantallaPorId(id);

  let cuerpo;
  if (id === "cierre" && !esSalida) {
    cuerpo = <Cierre key="cierre" ctx={ctx} token={token} antes={() => cola.current} yaTieneCuenta={!!estado.yaTieneCuenta} slugInicial={estado.slug} usuarioPrevisto={estado.usuario} />;
  } else if (p.tipo === "pregunta") {
    cuerpo = <Pregunta key={`${p.id}:${falla?.id === p.id ? "falla" : "ok"}`} p={p} ctx={ctx} token={token} inicial={r[p.campo]} inicialNoLoSe={noLoSe[p.campo]}
      onGuardada={onGuardada} enFondo={enFondo} falla={falla?.id === p.id ? falla.mensaje : ""} />;
  } else if (p.tipo === "confirmacion") {
    cuerpo = <Confirmacion key={p.id} p={p} ctx={ctx} token={token} onGuardada={onGuardada} onIr={ir} />;
  } else if (p.tipo === "salida") {
    // La primera frase es el titular; el resto, la bajada. El copy va entero.
    const completo = texto(p.texto, ctx);
    const corte = completo.indexOf(". ") + 1;
    cuerpo = (
      <div className="obf-pantalla" data-centro="1" key="salida">
        <Titular xl>{completo.slice(0, corte)}</Titular>
        <p className="obf-texto">{completo.slice(corte + 1)}</p>
      </div>
    );
  } else if (p.tipo === "recompensa") {
    const linea = p.linea ? p.linea(ctx) : null;
    cuerpo = (
      <div className="obf-pantalla" data-ancha={p.bloques ? "1" : undefined} data-centro={p.bloques ? undefined : "1"} key={p.id}>
        {p.titulo && <Titular>{texto(p.titulo, ctx)}</Titular>}
        {p.bloques && (
          <div className="obf-numeros">
            {p.bloques(ctx).map((b, i) => (
              <Revelar key={b.titulo} retraso={i * 90}><div className="obf-numero"><TituloConCifra>{b.titulo}</TituloConCifra><p>{b.texto}</p>{b.deDonde && <p className="obf-de-donde">{b.deDonde}</p>}
                {b.corregir?.length > 0 && (
                  <ul className="obf-datos">
                    {b.corregir.map((d) => (
                      <li key={d.ir}><span>{d.dato}<b>{d.valor}</b></span><button type="button" className="obf-corregir" onClick={() => corregirDesde(p.id, d.ir)}>Corregir</button></li>
                    ))}
                  </ul>
                )}
              </div></Revelar>
            ))}
          </div>
        )}
        {p.texto && <Titular>{texto(p.texto, ctx)}</Titular>}
        {linea && <Revelar retraso={300}><div className="obf-linea">{linea}</div></Revelar>}
        <div className="obf-acciones"><Boton onClick={() => avanzar(despuesDe(p.id, r))}>{p.boton}</Boton></div>
      </div>
    );
  } else {
    // bienvenida y respiros
    cuerpo = (
      <div className="obf-pantalla" data-centro="1" data-tipo={p.tipo} key={p.id} onKeyDown={(e) => { if (e.key === "Enter") avanzar(despuesDe(p.id, r)); }}>
        {p.tipo === "bienvenida" ? (<>
          <span className="obf-rotulo">Inforce Consulting</span>
          <Titular xl azul={p.azul}>{texto(p.titulo, ctx)}</Titular>
          <p className="obf-texto">{texto(p.texto, ctx)}</p>
          <ul className="obf-puntos">
            {p.puntos.map((x, i) => (
              <Revelar key={x.titulo} retraso={120 + i * 90}>
                <li className="obf-punto"><span className="obf-punto-ic"><Icono nombre={x.icono} /></span><div><b>{x.titulo}</b><span>{x.texto}</span></div></li>
              </Revelar>
            ))}
          </ul>
        </>) : (<>
          {/* Cambio de sección: se tiene que SENTIR que empieza otra cosa. */}
          <div className="obf-seccion-ic"><Icono nombre={p.icono} /><i>{p.bloque}</i></div>
          <Titular xl azul={p.azul}>{texto(p.titulo, ctx)}</Titular>
          <p className="obf-texto">{texto(p.texto, ctx)}</p>
          <div className="obf-pastilla">{(() => { const n = pantallasActivas(r).filter((x) => x.bloque === p.bloque && x.tipo === "pregunta").length; return `${n} ${n === 1 ? "pregunta" : "preguntas"}`; })()}</div>
        </>)}
        <div className="obf-acciones"><Boton autoFocus onClick={() => avanzar(despuesDe(p.id, r))}>{p.boton || "Seguir"}</Boton></div>
      </div>
    );
  }

  return (
    <>
      {!esSalida && id !== "1.0" && (
        <Barra id={id === "cierre" ? "C.1" : id} r={r} noLoSe={noLoSe} onIr={avanzar}
          onAtras={() => (historial.current.length ? window.history.back() : atras())}
          puedeAtras={id !== "cierre" && id !== "1.1" && !!antesDe(id, r)} guardado={pendientes > 0 ? "Guardando…" : guardado ? "Guardado" : ""} />
      )}
      <main className="obf-main" ref={scroller}>{cuerpo}</main>
    </>
  );
}

// Solo en desarrollo: `/inicio/_demo-onboarding` abre la pantalla de onboarding del
// equipo con datos de ejemplo, para diseñarla sin sesión. En producción no existe.
const DemoOnboarding = import.meta.env.DEV
  ? lazy(() => import("../estandar/OnboardingEquipoPage.jsx").then((m) => ({ default: m.OnboardingEquipoPage })))
  : null;

export function FormularioPage({ path }) {
  const token = decodeURIComponent(String(path || "").split("/").filter(Boolean)[0] || "");

  useEffect(() => {
    const previo = document.title;
    document.title = "Inforce · Bienvenida";
    // El rebote del iPhone deja ver lo que hay DETRÁS del documento: que sea tinta.
    const raiz = document.documentElement;
    const fondoPrevio = raiz.style.background;
    raiz.style.background = "#08080c";
    return () => { document.title = previo; raiz.style.background = fondoPrevio; };
  }, []);

  if (DemoOnboarding && token === "_demo-onboarding") {
    const quien = new URLSearchParams(window.location.search).get("como") || "Jose";
    return <Suspense fallback={null}><DemoOnboarding companyId="_demo" member={{ id: "demo", name: quien, role: quien === "Jose" ? "admin" : "member" }} onVolver={() => {}} /></Suspense>;
  }

  return (
    <div className="obf">
      <div className="obf-fondo"><Constelacion className="obf-cielo" intensidad="sutil" /></div>
      <Formulario token={token} />
    </div>
  );
}

export default FormularioPage;
