// Los campos del formulario de onboarding. Cada control recibe `valor` ya en la
// forma en que se guarda (flujo.js / validaciones.js) y avisa con `onChange`.
// Nada de lógica de negocio acá: validar y calcular viven en sus módulos puros.

import { useEffect, useRef, useState } from "react";
import { pesos, miles, montoEnPalabras, leerMonto, leerDecimal, decimal } from "./formato.js";

const Check = () => (<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
const Mas = () => (<span className="obf-ic"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>);

// En celular el autofocus abre el teclado encima de la pregunta antes de que se
// alcance a leer; solo se enfoca solo donde hay teclado físico.
const conTecladoFisico = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
function useAutoFocus(activo = true) {
  const ref = useRef(null);
  useEffect(() => { if (activo && conTecladoFisico()) ref.current?.focus(); }, [activo]);
  return ref;
}

export function Texto({ valor, onChange, placeholder, tipo = "text", inputMode, autoComplete, autoFocus = true, grande = true, maxLength = 120 }) {
  const ref = useAutoFocus(autoFocus);
  return (
    <input
      ref={ref} className={`obf-input ${grande ? "obf-input-grande" : ""}`} type={tipo} inputMode={inputMode}
      autoComplete={autoComplete || "off"} autoCapitalize={tipo === "text" ? "words" : "none"} autoCorrect="off" spellCheck={false}
      value={valor ?? ""} maxLength={maxLength} placeholder={placeholder} enterKeyHint="next"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Montos: separador de miles mientras escribe y la cifra en palabras debajo,
// porque un cero de más en la facturación daña todos los cálculos.
export function Monto({ valor, onChange, autoFocus = true, grande = true, placeholder = "0", palabras = true }) {
  const ref = useAutoFocus(autoFocus);
  return (
    <div>
      <div className={`obf-con-prefijo izq ${grande ? "" : "chico"}`}>
        <span>$</span>
        <input
          ref={ref} className={`obf-input ${grande ? "obf-input-grande" : ""}`} type="text" inputMode="numeric" autoComplete="off"
          value={valor === null || valor === undefined ? "" : miles(valor)} placeholder={placeholder} enterKeyHint="next"
          onChange={(e) => onChange(leerMonto(e.target.value.slice(0, 18)))}
        />
      </div>
      {palabras && (grande || !!valor) && <div className={`obf-palabras ${grande ? "" : "chica"}`}>{valor ? `${pesos(valor)} — ${montoEnPalabras(valor)}` : ""}</div>}
    </div>
  );
}

// Número con coma decimal (porcentajes, ROAS). Guarda el texto mientras se
// escribe: "2," tiene que poder existir un instante antes de ser "2,5".
export function Decimal({ valor, onChange, sufijo, autoFocus = true, grande = true, placeholder = "0", entero = false, disabled = false }) {
  const ref = useAutoFocus(autoFocus && !disabled);
  const [txt, setTxt] = useState(valor === null || valor === undefined ? "" : decimal(valor, 2));
  useEffect(() => {
    if (leerDecimal(txt) !== (valor ?? null)) setTxt(valor === null || valor === undefined ? "" : decimal(valor, 2));
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`obf-con-prefijo ${sufijo ? "der" : ""} ${grande ? "" : "chico"}`}>
      <input
        ref={ref} className={`obf-input ${grande ? "obf-input-grande" : ""}`} type="text" inputMode={entero ? "numeric" : "decimal"} autoComplete="off"
        value={txt} placeholder={placeholder} disabled={disabled} enterKeyHint="next"
        onChange={(e) => {
          const limpio = entero ? e.target.value.replace(/\D/g, "").slice(0, 7) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 7);
          setTxt(limpio);
          onChange(leerDecimal(limpio));
        }}
      />
      {sufijo && <span className="der">{sufijo}</span>}
    </div>
  );
}

export function Tarjetas({ opciones, valor, onChange, dos = false, chips = false }) {
  return (
    <div className={chips ? "obf-chips" : `obf-tarjetas ${dos ? "dos" : ""}`} role="group">
      {opciones.map((o) => (
        <button key={String(o.valor)} type="button" onMouseDown={(e) => e.preventDefault()} className="obf-tarjeta" aria-pressed={valor === o.valor} onClick={() => onChange(o.valor)}>
          <span className="punto" />
          {o.ejemplo ? <span className="obf-tarjeta-txt">{o.texto}<small><i>Ej.</i>{o.ejemplo}</small></span> : o.texto}
        </button>
      ))}
    </div>
  );
}

export const SiNo = ({ valor, onChange }) => (
  <Tarjetas dos valor={valor} onChange={onChange} opciones={[{ valor: "si", texto: "Sí" }, { valor: "no", texto: "No" }]} />
);

export function NoLoSe({ marcado, onChange }) {
  return (
    <button type="button" className="obf-check" aria-pressed={!!marcado} onClick={() => onChange(!marcado)}>
      <span className="caja"><Check /></span>No lo sé
    </button>
  );
}

// 20% · 30% · 40% · otro
export function OpcionesPct({ opciones, valor, onChange }) {
  const fijas = opciones.filter((o) => o.valor !== "otro").map((o) => o.valor);
  const [otro, setOtro] = useState(valor !== null && valor !== undefined && !fijas.includes(valor));
  return (
    <div>
      <Tarjetas chips opciones={opciones} valor={otro ? "otro" : valor}
        onChange={(v) => { if (v === "otro") { setOtro(true); onChange(null); } else { setOtro(false); onChange(v); } }} />
      {otro && <div style={{ marginTop: 12 }}><Decimal valor={valor} onChange={onChange} sufijo="%" entero /></div>}
    </div>
  );
}

// 3.9: dos números que siempre suman 100. Arranca SIN valor: si naciera en 50/50
// bastaría con darle a Seguir para dejar un dato inventado, y este reparto mueve
// el margen efectivo de toda la cadena.
export function Reparto({ valor, onChange }) {
  const tocado = valor?.contraentrega !== undefined && valor?.contraentrega !== null;
  const contra = tocado ? valor.contraentrega : 50;
  return (
    <div>
      <div className="obf-reparto-nums">
        <div className="obf-reparto-num"><b>{tocado ? contra : "—"}</b><span>Contraentrega</span></div>
        <div className="obf-reparto-num"><b>{tocado ? 100 - contra : "—"}</b><span>Anticipado</span></div>
      </div>
      <input
        className="obf-range" type="range" min="0" max="100" step="1" value={contra} style={{ "--p": tocado ? `${contra}%` : "0%" }}
        aria-label="Pedidos contraentrega de cada 100"
        onChange={(e) => { const c = Number(e.target.value); onChange({ contraentrega: c, anticipado: 100 - c }); }}
        onPointerUp={(e) => { if (!tocado) { const c = Number(e.target.value); onChange({ contraentrega: c, anticipado: 100 - c }); } }}
      />
    </div>
  );
}

// ── Bloques repetibles ──────────────────────────────────────────────────────

function Filas({ filas, onChange, nueva, agregar, maximo = 30, minimo = 1, render, cabeza }) {
  const set = (i, patch) => onChange(filas.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="obf-filas">
      {filas.map((f, i) => (
        <div className="obf-fila" key={i}>
          <div className="obf-fila-head">
            {cabeza ? cabeza(f, i) : <span className="obf-fila-sub">{i + 1}</span>}
            {filas.length > minimo && i >= minimo && (
              <button type="button" className="obf-quitar" onClick={() => onChange(filas.filter((_, j) => j !== i))}>Quitar</button>
            )}
          </div>
          {render(f, (patch) => set(i, patch), i)}
        </div>
      ))}
      {agregar && filas.length < maximo && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} className="obf-agregar" onClick={() => onChange([...filas, nueva()])}>
          <Mas />{agregar}{maximo <= 5 && <small>{filas.length} de {maximo}</small>}
        </button>
      )}
    </div>
  );
}

const inputFila = (props) => <input className="obf-input" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;

// 1.6 — la primera fila es quien llena, precargada con el nombre de la 1.1.
export function Socios({ valor, onChange, agregar, nombre }) {
  const filas = Array.isArray(valor) && valor.length ? valor : [{ nombre: nombre || "", correo: "", telefono: "" }];
  useEffect(() => { if (!Array.isArray(valor) || !valor.length) onChange(filas); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Filas
      filas={filas} onChange={onChange} agregar={agregar} maximo={10} nueva={() => ({ nombre: "", correo: "", telefono: "" })}
      cabeza={(f, i) => (i === 0 ? <span className="obf-tu">Tú</span> : <span className="obf-fila-sub">Socio {i + 1}</span>)}
      render={(f, set) => (<>
        {inputFila({ placeholder: "Nombre", value: f.nombre || "", autoCapitalize: "words", autoComplete: "name", onChange: (e) => set({ nombre: e.target.value }) })}
        {inputFila({ placeholder: "Correo", type: "email", inputMode: "email", autoCapitalize: "none", autoComplete: "email", value: f.correo || "", onChange: (e) => set({ correo: e.target.value }) })}
        {inputFila({ placeholder: "Teléfono", type: "tel", inputMode: "tel", autoComplete: "tel", value: f.telefono || "", onChange: (e) => set({ telefono: e.target.value }) })}
      </>)}
    />
  );
}

// 2.4 — uno mínimo, hasta tres.
export function Productos({ valor, onChange, agregar, maximo }) {
  const filas = Array.isArray(valor) && valor.length ? valor : [{ nombre: "", precio: null }];
  useEffect(() => { if (!Array.isArray(valor) || !valor.length) onChange(filas); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Filas
      filas={filas} onChange={onChange} agregar={agregar} maximo={maximo} nueva={() => ({ nombre: "", precio: null })}
      cabeza={(f, i) => <span className="obf-fila-sub">Producto {i + 1}</span>}
      render={(f, set) => (<>
        {inputFila({ placeholder: "Nombre del producto", value: f.nombre || "", autoCapitalize: "sentences", onChange: (e) => set({ nombre: e.target.value }) })}
        <Monto valor={f.precio ?? null} onChange={(precio) => set({ precio })} autoFocus={false} grande={false} placeholder="Precio de venta" />
      </>)}
    />
  );
}

// 2.6 — categoría + ticket promedio. Arranca con tantas filas como categorías dijo
// tener en la 2.2.
export function Categorias({ valor, onChange, cuantas = 1 }) {
  const nueva = () => ({ categoria: "", ticket: null });
  const filas = Array.isArray(valor) && valor.length ? valor : Array.from({ length: Math.min(Math.max(cuantas, 1), 30) }, nueva);
  useEffect(() => { if (!Array.isArray(valor) || !valor.length) onChange(filas); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Filas
      filas={filas} onChange={onChange} agregar="Agregar otra categoría" nueva={nueva}
      cabeza={(f, i) => <span className="obf-fila-sub">Categoría {i + 1}</span>}
      render={(f, set) => (<>
        {inputFila({ placeholder: "Nombre de la categoría", value: f.categoria || "", autoCapitalize: "sentences", onChange: (e) => set({ categoria: e.target.value }) })}
        <div><span className="obf-label">Ticket promedio</span>
          <Monto valor={f.ticket ?? null} onChange={(ticket) => set({ ticket })} autoFocus={false} grande={false} /></div>
      </>)}
    />
  );
}

// 3.8 — lo que le queda de cada venta ya pagando todo: en % (lo normal) o en pesos,
// y un selector de si ese número ya trae descontado el IVA.
export function Rentabilidad({ valor, onChange, opcionesIva, ticket }) {
  const v = valor || { unidad: "pct", valor: null, iva: null };
  const unidad = v.unidad === "pesos" ? "pesos" : "pct";
  const neto = typeof v.valor === "number" && typeof ticket === "number" ? (unidad === "pesos" ? v.valor : (ticket * v.valor) / 100) : null;
  return (
    <div className="obf-filas">
      <div>
        <div className="obf-fila-head" style={{ marginBottom: 8 }}>
          <span className="obf-label" style={{ margin: 0 }}>Lo que te queda</span>
          <div className="obf-seg" role="group" aria-label="En porcentaje o en pesos">
            <button type="button" aria-pressed={unidad === "pct"} onClick={() => onChange({ ...v, unidad: "pct", valor: null })}>En %</button>
            <button type="button" aria-pressed={unidad === "pesos"} onClick={() => onChange({ ...v, unidad: "pesos", valor: null })}>En pesos</button>
          </div>
        </div>
        {unidad === "pesos"
          ? <Monto key="pesos" valor={v.valor ?? null} onChange={(n) => onChange({ ...v, unidad, valor: n })} palabras={false} />
          : <Decimal key="pct" valor={v.valor ?? null} onChange={(n) => onChange({ ...v, unidad, valor: n })} sufijo="%" />}
        <div className="obf-palabras">{neto ? (unidad === "pct" ? `De una venta de ${pesos(ticket)} te quedan ${pesos(neto)}` : `Es el ${decimal((neto / ticket) * 100)}% de tu ticket promedio`) : ""}</div>
      </div>
      <div>
        <span className="obf-label">¿Ese número ya tiene descontado el IVA?</span>
        <Tarjetas opciones={opcionesIva} valor={v.iva} onChange={(iva) => onChange({ ...v, iva })} />
      </div>
    </div>
  );
}

// 5.1 — % + cada cuánto, seleccionable: «cada [3] [días|meses|años]», o «se compra
// una sola vez».
const UNIDADES = [["dias", "Días"], ["meses", "Meses"], ["anos", "Años"]];
export function Recompra({ valor, onChange, disabled }) {
  const v = valor || {};
  const unaVez = v.cada === "una_vez";
  const cada = unaVez || !v.cada ? { n: null, unidad: "meses" } : v.cada;
  return (
    <div className="obf-filas">
      <div><span className="obf-label">Qué porcentaje te vuelve a comprar</span>
        <Decimal valor={v.pct ?? null} onChange={(pct) => onChange({ ...v, pct })} sufijo="%" disabled={disabled} /></div>
      <div><span className="obf-label">Cada cuánto</span>
        <div className="obf-cada" data-off={unaVez || disabled ? "1" : undefined}>
          <span>Cada</span>
          <Decimal valor={cada.n} onChange={(n) => onChange({ ...v, cada: { ...cada, n } })} entero autoFocus={false} grande={false} disabled={unaVez || disabled} />
          <div className="obf-seg obf-seg-3" role="group" aria-label="Días, meses o años">
            {UNIDADES.map(([u, t]) => (
              <button key={u} type="button" disabled={unaVez || disabled} aria-pressed={!unaVez && cada.unidad === u} onClick={() => onChange({ ...v, cada: { ...cada, unidad: u } })}>{t}</button>
            ))}
          </div>
        </div>
        {!disabled && (
          <button type="button" className="obf-check" aria-pressed={unaVez} onClick={() => onChange({ ...v, cada: unaVez ? { n: null, unidad: "meses" } : "una_vez" })}>
            <span className="caja"><Check /></span>Lo mío se compra una sola vez
          </button>
        )}
      </div>
    </div>
  );
}

// 6.1 — nombre + roles (uno o varios, de la lista) + lo que hace, si quiere
// escribirlo. Arranca con los socios de la 1.6 ya puestos.
export function Equipo({ valor, onChange, agregar, socios = [], roles = [] }) {
  const nueva = () => ({ nombre: "", roles: [], que_hace: "" });
  const filas = Array.isArray(valor) && valor.length ? valor
    : (socios.length ? socios.map((s) => ({ ...nueva(), nombre: s.nombre })) : [nueva()]);
  useEffect(() => { if (!Array.isArray(valor) || !valor.length) onChange(filas); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Filas
      filas={filas} onChange={onChange} agregar={agregar} maximo={60} nueva={nueva}
      cabeza={(f, i) => <span className="obf-fila-sub">Persona {i + 1}</span>}
      render={(f, set) => {
        const suyos = Array.isArray(f.roles) ? f.roles : [];
        return (<>
          {inputFila({ placeholder: "Nombre", value: f.nombre || "", autoCapitalize: "words", onChange: (e) => set({ nombre: e.target.value }) })}
          <span className="obf-label" style={{ margin: "4px 0 0 2px" }}>Qué hace <small>· puedes marcar varios</small></span>
          <div className="obf-roles" role="group">
            {roles.map((rol) => (
              <button key={rol} type="button" className="obf-rol" aria-pressed={suyos.includes(rol)}
                onClick={() => set({ roles: suyos.includes(rol) ? suyos.filter((x) => x !== rol) : [...suyos, rol] })}>{rol}</button>
            ))}
          </div>
          {inputFila({ placeholder: "Otra cosa, o cuéntalo con tus palabras (opcional)", value: f.que_hace || "", autoCapitalize: "sentences", onChange: (e) => set({ que_hace: e.target.value }) })}
        </>);
      }}
    />
  );
}
