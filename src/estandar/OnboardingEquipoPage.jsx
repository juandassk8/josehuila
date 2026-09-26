// Pantalla de onboarding del equipo — `/equipo/onboarding/<companyId>`.
// Pieza 2 del roadmap (docs/roadmap-onboarding.md).
//
// Se llena EN VIVO, compartiendo pantalla con el cliente: por eso va a pantalla
// completa, sin el menú del War Room, y con la misma escena de la marca que el
// cliente acaba de ver en su formulario. José, Nath y Deison califican cada uno lo
// suyo sobre el mismo perfil; el que entra después ve lo de los anteriores.
//
// Qué se califica y cómo: catalogo.json (literal del Estándar). Las reglas: estandar.js.
// Acá solo se pinta y se guarda — una fila por punto en `standard_scores`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../formulario/formulario.css";
import "./estandar.css";
import { database } from "../lib/backend.js";
import { pesos, decimal } from "../formulario/formato.js";
import { ETIQUETAS, TIPOS, mostrar } from "./datos.js";
import {
  LLAMADAS, llamadaDe, puedeEditar, dimension, puntosDe, noAplica, estaCalificado,
  progresoDimension, progresoLlamada, datosDelFormulario, calculadoPara, pasosDe, primerPasoPendiente,
} from "./estandar.js";

// Los datos que son LISTAS (productos, categorías, dueños, equipo) van como fichitas,
// una por ítem; los demás, como una cifra grande con su rótulo arriba.
function itemsDe(campo, v) {
  if (!Array.isArray(v)) return null;
  switch (campo) {
    case "productos_principales": return v.map((p) => ({ t: p.nombre, s: pesos(p.precio) }));
    case "categorias_detalle": return v.map((c) => ({ t: c.categoria, s: `ticket ${pesos(c.ticket)}` }));
    case "socios": return v.map((x) => ({ t: x.nombre, s: x.telefono || "" }));
    case "equipo": return v.map((x) => ({ t: x.nombre, s: [...(x.roles || []), x.que_hace].filter(Boolean).join(" · ") }));
    default: return null;
  }
}

const SEMAFORO = { verde: "verde", amarillo: "ambar", rojo: "rojo", rojo_profundo: "rojo" };

function Dato({ fila }) {
  const items = fila.no_lo_se ? null : itemsDe(fila.campo, fila.valor);
  const tono = fila.campo === "salud_margen" ? SEMAFORO[fila.valor?.semaforo] : fila.no_lo_se ? "ambar" : undefined;
  return (
    <div className="est-dato" data-ancho={items ? "1" : undefined} data-tono={tono}>
      <span>{ETIQUETAS[fila.campo] || fila.campo}</span>
      {items
        ? <ul data-muchos={items.length > 6 ? "1" : undefined}>{items.map((x, i) => <li key={i}><b>{x.t}</b>{x.s && <i>{x.s}</i>}</li>)}</ul>
        : <b>{mostrar(fila.campo, fila.valor, fila.no_lo_se)}</b>}
    </div>
  );
}

// ── Los controles de calificación ───────────────────────────────────────────
function Nota({ valor, onChange, disabled }) {
  return (
    <div className="est-nota" role="group" aria-label="Nota de 1 a 10">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button key={n} type="button" disabled={disabled} aria-pressed={valor === n} data-tono={n <= 4 ? "bajo" : n <= 7 ? "medio" : "alto"}
          onClick={() => onChange(valor === n ? null : n)}>{n}</button>
      ))}
    </div>
  );
}

function SiNo({ valor, onChange, disabled }) {
  return (
    <div className="est-sino" role="group">
      {[[true, "Sí"], [false, "No"]].map(([v, t]) => (
        <button key={t} type="button" disabled={disabled} aria-pressed={valor === v} data-v={v ? "si" : "no"} onClick={() => onChange(valor === v ? null : v)}>{t}</button>
      ))}
    </div>
  );
}

// 1.7 — cinco niveles de conciencia que suman 100.
const NIVELES_CONCIENCIA = ["1 · No sabe que tiene el problema", "2 · Sabe del problema", "3 · Conoce soluciones", "4 · Conoce el producto", "5 · Listo para comprar"];
function Distribucion({ valor, onChange, disabled }) {
  const v = Array.isArray(valor) ? valor : [null, null, null, null, null];
  const suma = v.reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <div className="est-dist">
      {NIVELES_CONCIENCIA.map((t, i) => (
        <label key={t}><span>{t}</span>
          <input className="obf-input" inputMode="numeric" disabled={disabled} value={v[i] ?? ""} placeholder="0"
            onChange={(e) => { const n = e.target.value.replace(/\D/g, "").slice(0, 3); onChange(v.map((x, j) => (j === i ? (n === "" ? null : Math.min(100, Number(n))) : x))); }} /><i>%</i>
        </label>
      ))}
      <p data-ok={suma === 100 ? "1" : undefined}>Suma {suma}%{suma !== 100 ? " — tiene que dar 100" : ""}</p>
    </div>
  );
}

function Nivel5({ valor, onChange, disabled }) {
  return (
    <div className="est-nota est-nivel" role="group" aria-label="Nivel de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => (<button key={n} type="button" disabled={disabled} aria-pressed={valor === n} onClick={() => onChange(valor === n ? null : n)}>{n}</button>))}
    </div>
  );
}

// ── Una ficha por punto ─────────────────────────────────────────────────────
function Punto({ punto, nota, perfil, editable, onCambiar, guias }) {
  // La guía (qué es un 10, qué es un 1, el ejemplo) va plegada: con las 111 abiertas
  // la pantalla era un muro de texto. Se abre por punto, o todas desde arriba.
  const [abierta, setAbierta] = useState(false);
  const verGuia = guias || abierta;
  const tieneGuia = !!(punto.diez || punto.uno || (punto.ejemplo && punto.origen !== "calculado"));
  const c = nota?.calificacion || {};
  const calculado = calculadoPara(punto.id, perfil);
  const delFormulario = datosDelFormulario(perfil, { punto: punto.id }).filter((f) => f.origen === "formulario");
  const hecho = estaCalificado(punto, nota) || (punto.origen === "calculado" && calculado);
  const set = (calificacion) => onCambiar(punto.id, { calificacion: { ...c, ...calificacion } });

  let control = null;
  if (punto.origen === "calculado" && calculado) {
    control = <div className="est-calculado"><Dato fila={{ campo: punto.id === "2.1" ? "salud_margen" : "conoce_numeros", valor: calculado }} /><small>Sale solo del formulario.</small></div>;
  } else if (punto.id === "1.7") control = <Distribucion valor={c.distribucion} disabled={!editable} onChange={(distribucion) => set({ distribucion })} />;
  else if (punto.id === "1.8") control = <Nivel5 valor={c.nivel} disabled={!editable} onChange={(nivel) => set({ nivel })} />;
  else if (punto.califica === "1_10") control = <Nota valor={c.nota} disabled={!editable} onChange={(n) => set({ nota: n })} />;
  else if (punto.califica === "si_no") control = <SiNo valor={c.si} disabled={!editable} onChange={(si) => set({ si })} />;
  else if (punto.califica === "otro") {
    control = <input className="obf-input est-valor" disabled={!editable} value={c.valor ?? ""} placeholder={punto.calificaTexto}
      onChange={(e) => set({ valor: e.target.value })} />;
  }

  return (
    <article className="est-punto" data-hecho={hecho ? "1" : undefined} id={`p-${punto.id}`}>
      <header>
        <span className="est-id">{punto.id}</span>
        <h3>{punto.titulo}</h3>
        {punto.origen !== "llamada" && <span className="est-origen" data-o={punto.origen}>{{ formulario: "Del formulario", calculado: "Se calcula solo", auditoria_previa: "Se revisa antes de la llamada" }[punto.origen]}</span>}
        {tieneGuia && !guias && <button type="button" className="est-guia-btn" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>{abierta ? "Ocultar guía" : "Ver guía"}</button>}
      </header>

      {delFormulario.length > 0 && <div className="est-datos">{delFormulario.map((f) => <Dato key={f.campo} fila={f} />)}</div>}
      {control}

      {verGuia && (punto.diez || punto.uno) && (
        <div className="est-anclas">
          {punto.diez && <div data-a="10"><span>{punto.califica === "si_no" ? "Sí" : "Qué es un 10"}</span>{punto.diez}</div>}
          {punto.uno && <div data-a="1"><span>{punto.califica === "si_no" ? "No" : "Qué es un 1"}</span>{punto.uno}</div>}
        </div>
      )}
      {verGuia && punto.ejemplo && punto.origen !== "calculado" && <p className="est-ejemplo"><span>Ejemplo</span>{punto.ejemplo}</p>}

      <textarea className="obf-input est-desc" rows={1} disabled={!editable} placeholder="Descripción: lo que se vio y por qué esa nota"
        value={nota?.descripcion || ""} onChange={(e) => onCambiar(punto.id, { descripcion: e.target.value })} />
    </article>
  );
}

// ── La página ───────────────────────────────────────────────────────────────
export function OnboardingEquipoPage({ companyId, member, onVolver }) {
  const [company, setCompany] = useState(undefined);
  const [perfil, setPerfil] = useState([]);
  const [notas, setNotas] = useState({});
  const [formulario, setFormulario] = useState(null);
  // `?llamada=nath` abre directo en esa llamada (desde el modal de Empresas).
  const [llamadaId, setLlamadaId] = useState(() => {
    const pedida = new URLSearchParams(window.location.search).get("llamada");
    return LLAMADAS.some((l) => l.id === pedida) ? pedida : llamadaDe(member)?.id || "jose";
  });
  const [dimN, setDimN] = useState(null);
  const [paso, setPaso] = useState(null);         // null = «donde quedó» (primer paso pendiente)
  const topRef = useRef(null);
  const [estado, setEstado] = useState("");       // "" · "Guardando…" · "Guardado" · error
  // Preferencias de quien califica (por navegador): fondo claro u oscuro, y si las
  // guías van abiertas. Son comodidad: si el storage falla, no pasa nada.
  const pref = (k, d) => { try { return localStorage.getItem(`est:${k}`) ?? d; } catch { return d; } };
  const [tema, setTema] = useState(() => pref("tema", "oscuro"));
  const [guias, setGuias] = useState(() => pref("guias", "0") === "1");
  useEffect(() => { try { localStorage.setItem("est:tema", tema); localStorage.setItem("est:guias", guias ? "1" : "0"); } catch { /* sin storage */ } }, [tema, guias]);
  const pendientes = useRef(new Map());            // punto → { timer, patch }

  // Solo en desarrollo: `companyId = "_demo"` pinta la pantalla con datos de ejemplo
  // y sin tocar la base, para poder diseñarla sin sesión de equipo.
  const esDemo = import.meta.env.DEV && companyId === "_demo";

  useEffect(() => {
    let vivo = true;
    if (esDemo) {
      import("./demo.js").then((m) => { if (!vivo) return; setCompany(m.DEMO.company); setPerfil(m.DEMO.perfil); setNotas(m.DEMO.notas); setFormulario(m.DEMO.formulario); });
      return () => { vivo = false; };
    }
    (async () => {
      const [c, p, n, f] = await Promise.all([
        database.from("companies").select("id, name, slug").eq("id", companyId).maybeSingle(),
        database.from("brand_profile_data").select("campo, valor, no_lo_se, origen, puntos_estandar, para_revisar").eq("company_id", companyId),
        database.from("standard_scores").select("punto, calificacion, descripcion, no_aplica, origen, updated_by, updated_at").eq("company_id", companyId),
        database.from("onboarding_forms").select("status, completed_at, alerta, alerta_motivos").eq("company_id", companyId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1),
      ]);
      if (!vivo) return;
      setCompany(c.data || null);
      setPerfil(p.data || []);
      setNotas(Object.fromEntries((n.data || []).map((x) => [x.punto, x])));
      setFormulario(f.data?.[0] || null);
    })();
    return () => { vivo = false; };
  }, [companyId, esDemo]);

  useEffect(() => {
    const raiz = document.documentElement; const previo = raiz.style.background;
    raiz.style.background = tema === "claro" ? "#ffffff" : "#08080c";
    return () => { raiz.style.background = previo; };
  }, [tema]);

  // La barra de dimensiones se pega justo debajo del encabezado, mida lo que mida
  // (en pantallas angostas el encabezado ocupa dos renglones). Con un `top` fijo
  // quedaba flotando con un hueco encima.
  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const medir = () => el.parentElement?.style.setProperty("--alto-top", `${Math.round(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(medir);
    ro.observe(el); medir();
    return () => ro.disconnect();
  }, [company]);

  const tipoMarca = perfil.find((f) => f.campo === "tipo_marca")?.valor || null;
  const ctx = useMemo(() => ({ notas, tipoMarca }), [notas, tipoMarca]);
  const llamada = LLAMADAS.find((l) => l.id === llamadaId);
  const n = dimN && llamada.dimensiones.includes(dimN) ? dimN : llamada.dimensiones[0];
  const dim = dimension(n);
  const editable = puedeEditar(member, n);

  // Guarda por punto, con una pausa corta para no escribir en cada tecla.
  const guardar = useCallback(async (punto) => {
    const p = pendientes.current.get(punto);
    if (!p) return;
    pendientes.current.delete(punto);
    if (esDemo) { setEstado("Guardado (demo: no se escribe nada)"); return; }
    setEstado("Guardando…");
    const { error } = await database.from("standard_scores").upsert({
      company_id: companyId, punto, ...p.fila, origen: "equipo", updated_by: member.id, updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,punto" });
    setEstado(error ? `No se guardó el ${punto}: ${error.message}` : pendientes.current.size ? "Guardando…" : "Guardado");
  }, [companyId, member.id, esDemo]);

  const cambiar = useCallback((punto, patch) => {
    setNotas((prev) => {
      const actual = prev[punto] || { punto, calificacion: null, descripcion: "", no_aplica: false };
      const nueva = { ...actual, ...patch };
      const previo = pendientes.current.get(punto);
      if (previo) clearTimeout(previo.timer);
      const fila = { calificacion: nueva.calificacion, descripcion: nueva.descripcion || "", no_aplica: !!nueva.no_aplica };
      pendientes.current.set(punto, { fila, timer: setTimeout(() => guardar(punto), 700) });
      return { ...prev, [punto]: nueva };
    });
    setEstado("Guardando…");
  }, [guardar]);

  // Si cierra la pestaña con algo a medio guardar, se manda ya.
  useEffect(() => {
    const vaciar = () => { for (const [punto, p] of pendientes.current) { clearTimeout(p.timer); guardar(punto); } };
    window.addEventListener("pagehide", vaciar);
    return () => { window.removeEventListener("pagehide", vaciar); vaciar(); };
  }, [guardar]);

  if (company === undefined) return <div className="obf"><div className="obf-centro"><span className="obf-spin" /></div></div>;
  if (!company) return <div className="obf"><div className="obf-centro"><div><h1>No encontramos esa empresa</h1><button type="button" className="obf-btn obf-btn-sec" onClick={onVolver}>Volver a Empresas</button></div></div></div>;

  const puntos = puntosDe(n, { aspiracional: tipoMarca === "aspiracional" });
  const visibles = puntos.filter((p) => !noAplica(p.id, ctx));
  const ocultos = puntos.filter((p) => noAplica(p.id, ctx));
  const datosBase = datosDelFormulario(perfil, { dimension: n }).filter((f) => !visibles.some((p) => (f.puntos_estandar || []).includes(p.id) && f.origen === "formulario"));
  
  // Paso a paso dentro de la dimensión, y de una dimensión a la siguiente.
  const pasos = pasosDe(visibles);
  const iPaso = Math.min(paso ?? primerPasoPendiente(pasos, notas), Math.max(pasos.length - 1, 0));
  const pasoActual = pasos[iPaso] || { seccion: "", puntos: [] };
  const iDim = llamada.dimensiones.indexOf(n);
  const dimSiguiente = llamada.dimensiones[iDim + 1] ?? null;
  const dimAnterior = llamada.dimensiones[iDim - 1] ?? null;
  const subir = () => document.querySelector(".est")?.scrollTo({ top: 0, behavior: "smooth" });
  const irADim = (d, p = null) => { setDimN(d); setPaso(p); subir(); };
  const siguiente = () => { if (iPaso < pasos.length - 1) { setPaso(iPaso + 1); subir(); } else if (dimSiguiente) irADim(dimSiguiente, 0); };
  const anterior = () => { if (iPaso > 0) { setPaso(iPaso - 1); subir(); } else if (dimAnterior) irADim(dimAnterior, 9999); };
  const esElFinal = iPaso >= pasos.length - 1 && !dimSiguiente;

  // «Finalizar mi llamada»: queda como una fila más de standard_scores, con el punto
  // `llamada:<id>` (no choca con ningún punto del Estándar, que son N.M). Así el 📝 de
  // Empresas sabe qué llamadas están Pendientes, En curso o Listas sin otra tabla.
  const claveLlamada = `llamada:${llamadaId}`;
  const finalizada = !!notas[claveLlamada]?.calificacion?.finalizada;
  const puedeFinalizar = llamada.dimensiones.some((d) => puedeEditar(member, d));
  const marcarLlamada = (valor) => cambiar(claveLlamada, { calificacion: valor ? { finalizada: true, por: member.name || "", cuando: new Date().toISOString() } : { finalizada: false } });

  return (
    // Sin constelación: aquí la atención va a lo que se está leyendo y calificando.
    // Queda la escena (retícula y resplandor), quieta y más apagada. El acento lo pone
    // la llamada: José azul, Nath morado, Deison verde.
    <div className="obf est" data-llamada={llamadaId} data-tema={tema}>
      <div className="obf-fondo" />

      <header className="est-top" ref={topRef}>
        <div className="est-top-in">
          <button type="button" className="obf-back" onClick={onVolver}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>Empresas</button>
          <h1 className="est-marca">{company.name}</h1>
          <div className="est-chips">
            {tipoMarca && <span className="est-chip">{TIPOS[tipoMarca] || tipoMarca}</span>}
            <span className="est-chip" data-c={formulario?.status === "completo" ? (formulario.alerta ? "rojo" : "verde") : "gris"}>
              {formulario?.status === "completo" ? "Formulario completo" : formulario ? "Formulario a medias" : "Sin formulario"}
            </span>
          </div>
          <div className="est-ajustes">
            <button type="button" className="est-ajuste" aria-pressed={guias} onClick={() => setGuias((v) => !v)}>{guias ? "Ocultar guías" : "Mostrar guías"}</button>
            <button type="button" className="est-ajuste" onClick={() => setTema((t) => (t === "claro" ? "oscuro" : "claro"))}>{tema === "claro" ? "Fondo oscuro" : "Fondo claro"}</button>
          </div>
        </div>
        {/* Sin «3 de 64»: el avance se VE en la barra, no se cuenta. Un número así le
            dice al cliente, que está mirando, que esto va para largo. */}
        <nav className="est-llamadas">
          {LLAMADAS.map((l) => {
            const p = progresoLlamada(l, ctx);
            return (
              <button key={l.id} type="button" data-llamada={l.id} aria-pressed={l.id === llamadaId} onClick={() => { setLlamadaId(l.id); setDimN(null); setPaso(null); }}>
                <b>{l.quien}{notas[`llamada:${l.id}`]?.calificacion?.finalizada ? " ✓" : ""}</b><span>{l.titulo}</span>
                <i style={{ "--f": p.total ? p.hechos / p.total : 0 }} />
              </button>
            );
          })}
        </nav>
      </header>

      <div className="est-cuerpo">
        <aside className="est-dims">
          {llamada.dimensiones.map((d) => {
            const p = progresoDimension(d, ctx);
            const lista = p.total > 0 && p.hechos === p.total;
            return (
              <button key={d} type="button" aria-pressed={d === n} data-lista={lista ? "1" : undefined} onClick={() => irADim(d)}>
                <span className="est-id">{lista ? "✓" : d}</span>
                <span className="est-dim-nombre">{dimension(d).nombre}<i style={{ "--f": p.total ? p.hechos / p.total : 0 }} /></span>
              </button>
            );
          })}
        </aside>

        <main className="est-main">
          <div className="est-dim-head">
            <span className="obf-rotulo">{dim.grupo}</span>
            <h2 className="obf-titulo">{dim.nombre}</h2>
            {!editable && <p className="est-resumen">La llena {dim.audita}: aquí es solo lectura.</p>}
          </div>

          {iPaso === 0 && datosBase.length > 0 && (
            <section className="est-base" data-modo={datosBase.filter((f) => !Array.isArray(f.valor)).length <= 3 ? "tira" : "rejilla"}>
              <span className="obf-rotulo">Lo que ya dijo el cliente</span>
              <div className="est-datos">{datosBase.map((f) => <Dato key={f.campo} fila={f} />)}</div>
            </section>
          )}

          <section key={`${n}:${iPaso}`} className="est-paso">
            {pasoActual.seccion && <h4 className="est-seccion">{pasoActual.seccion}</h4>}
            {pasoActual.puntos.map((p) => (
              <Punto key={p.id} punto={p} nota={notas[p.id]} perfil={perfil} editable={editable} onCambiar={cambiar} guias={guias} />
            ))}
          </section>

          {iPaso === pasos.length - 1 && ocultos.length > 0 && (
            <section className="est-ocultos">
              <span className="obf-rotulo">No aplican a esta marca</span>
              {ocultos.map((p) => <p key={p.id}><b>{p.id}</b> {p.titulo} — {noAplica(p.id, ctx)}</p>)}
            </section>
          )}

          <footer className="est-nav">
            <button type="button" className="obf-btn obf-btn-sec" onClick={anterior} disabled={iPaso === 0 && !dimAnterior}>Anterior</button>
            <div className="est-puntitos" aria-label={`Parte ${iPaso + 1} de ${pasos.length}`}>
              {pasos.map((_, i) => <button key={i} type="button" aria-pressed={i === iPaso} onClick={() => { setPaso(i); subir(); }} aria-label={`Ir a la parte ${i + 1}`} />)}
            </div>
            <span className="est-estado">{estado}</span>
            {esElFinal ? (
              <button type="button" className="obf-btn" disabled={!puedeFinalizar} onClick={() => marcarLlamada(!finalizada)} data-ok={finalizada ? "1" : undefined}>
                {finalizada ? "Llamada finalizada ✓ · reabrir" : `Finalizar la llamada de ${llamada.quien}`}
              </button>
            ) : (
              <button type="button" className="obf-btn" onClick={siguiente}>
                {iPaso < pasos.length - 1 ? "Siguiente" : `Seguir con ${dimension(dimSiguiente).nombre}`}
              </button>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}

export default OnboardingEquipoPage;
