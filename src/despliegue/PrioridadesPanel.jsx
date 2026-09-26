import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DS } from "../lib/design.js";
import { CATEGORIAS_PRIORIZABLES, CATEGORY_BY_KEY, distinctValues, normLabel } from "./labels.js";

// "Mis prioridades": en qué orden esta cuenta quiere ver sus referencias.
//
// Las opciones NO salen de una lista fija: salen de las etiquetas que esta
// empresa usa de verdad (`distinctValues` sobre sus propias referencias). Una
// cuenta de mascotas no tiene por qué elegir entre nichos que nunca va a ver.
//
// El arrastre es nativo (HTML5 drag & drop) a propósito: dnd-kit ya está en el
// proyecto para el tablero de briefs, pero acá se ordenan seis nombres en una
// columna. Traer una librería para eso es cargar peso sin ganar nada.

const flechaArriba = "M12 19V5M5 12l7-7 7 7";
const flechaAbajo = "M12 5v14M19 12l-7 7-7-7";

function Flecha({ d, size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Columna({ categoria, opciones, elegidas, onChange }) {
  const meta = CATEGORY_BY_KEY[categoria] || { label: categoria, color: DS.blue };
  const [arrastrando, setArrastrando] = useState(null);

  const clave = (v) => normLabel(v);
  const sueltas = opciones.filter((o) => !elegidas.some((e) => clave(e) === clave(o)));

  const mover = (desde, hacia) => {
    if (hacia < 0 || hacia >= elegidas.length) return;
    const next = [...elegidas];
    const [x] = next.splice(desde, 1);
    next.splice(hacia, 0, x);
    onChange(next);
  };
  const sumar = (v) => onChange([...elegidas, v]);
  const sacar = (i) => onChange(elegidas.filter((_, k) => k !== i));

  return (
    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-2)" }}>
          {meta.label}
        </span>
      </div>

      {elegidas.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Sin prioridad: se ven en el orden de siempre.
        </p>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {elegidas.map((v, i) => (
          <li key={clave(v)}
            draggable
            onDragStart={() => setArrastrando(i)}
            onDragOver={(e) => { e.preventDefault(); if (arrastrando !== null && arrastrando !== i) { mover(arrastrando, i); setArrastrando(i); } }}
            onDragEnd={() => setArrastrando(null)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--surface)", cursor: "grab",
              opacity: arrastrando === i ? 0.5 : 1,
            }}>
            <span className="mono" style={{ fontSize: 11, color: meta.color, fontWeight: 700, width: 14, flex: "none" }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
            {/* Las flechas no son decoración: sin ellas, esto no se puede usar con
                teclado ni en un celular, donde arrastrar no funciona. */}
            <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0}
              title="Subir" aria-label={`Subir ${v}`}
              style={{ ...btnMini, opacity: i === 0 ? 0.25 : 1, cursor: i === 0 ? "default" : "pointer" }}>
              <Flecha d={flechaArriba} />
            </button>
            <button type="button" onClick={() => mover(i, i + 1)} disabled={i === elegidas.length - 1}
              title="Bajar" aria-label={`Bajar ${v}`}
              style={{ ...btnMini, opacity: i === elegidas.length - 1 ? 0.25 : 1, cursor: i === elegidas.length - 1 ? "default" : "pointer" }}>
              <Flecha d={flechaAbajo} />
            </button>
            <button type="button" onClick={() => sacar(i)} title="Quitar de prioridades" aria-label={`Quitar ${v}`}
              style={{ ...btnMini, color: "var(--brand)" }}>✕</button>
          </li>
        ))}
      </ol>

      {sueltas.length > 0 && (
        <div style={{ marginTop: elegidas.length ? 12 : 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 7 }}>
            {elegidas.length ? "El resto — tocá para priorizar" : "Tocá para priorizar"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sueltas.map((v) => (
              <button key={clave(v)} type="button" onClick={() => sumar(v)}
                style={{
                  fontFamily: DS.font, fontSize: 12, color: "var(--ink-3)", background: "var(--chip)",
                  border: "1px solid var(--line)", borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const btnMini = {
  width: 22, height: 22, flex: "none", display: "grid", placeItems: "center",
  borderRadius: 6, border: "none", background: "transparent", color: "var(--ink-3)",
  fontFamily: DS.font, fontSize: 12, cursor: "pointer",
};

export function PrioridadesModal({ variations, prioridades, onGuardar, onClose }) {
  const inicial = prioridades || {};
  const [valores, setValores] = useState(() =>
    Object.fromEntries(CATEGORIAS_PRIORIZABLES.map((c) => [c, [...(inicial[c] || [])]])));
  const [solo, setSolo] = useState(!!inicial.soloPrioridades);
  const [guardando, setGuardando] = useState(false);

  // Las etiquetas que esta cuenta realmente tiene. Se calcula una vez: la lista
  // de referencias no cambia mientras el modal está abierto.
  const opciones = useMemo(
    () => Object.fromEntries(CATEGORIAS_PRIORIZABLES.map((c) => [c, distinctValues(variations, c)])),
    [variations],
  );

  const vacio = CATEGORIAS_PRIORIZABLES.every((c) => (opciones[c] || []).length === 0);
  const algoElegido = CATEGORIAS_PRIORIZABLES.some((c) => valores[c].length > 0);

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar({ ...valores, soloPrioridades: solo });
      onClose?.();
    } finally { setGuardando(false); }
  };

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font,
      }}>
      <div style={{
        width: "min(680px, 100%)", maxHeight: "88vh", overflowY: "auto", background: "var(--surface)",
        border: "1px solid var(--line)", borderRadius: 18, padding: "24px 26px", color: "var(--ink)",
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>Mis prioridades</h3>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--ink-3)", maxWidth: "60ch" }}>
          El orden en que querés ver las referencias. Manda el nicho: primero salen las de tu
          nicho número 1 y, dentro de ese, las del ángulo que pusiste arriba.
        </p>

        {vacio ? (
          <p style={{ margin: "22px 0 0", fontSize: 13, color: "var(--ink-4)" }}>
            Todavía no hay referencias etiquetadas por nicho o ángulo en esta cuenta. Cuando las haya,
            acá vas a poder ordenarlas.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 22 }}>
              {CATEGORIAS_PRIORIZABLES.map((c) => (
                <Columna key={c} categoria={c} opciones={opciones[c]} elegidas={valores[c]}
                  onChange={(next) => setValores((v) => ({ ...v, [c]: next }))} />
              ))}
            </div>

            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10, marginTop: 24, paddingTop: 18,
              borderTop: "1px solid var(--line)", cursor: algoElegido ? "pointer" : "default",
              opacity: algoElegido ? 1 : 0.45,
            }}>
              <input type="checkbox" checked={solo} disabled={!algoElegido}
                onChange={(e) => setSolo(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: "var(--sel)", flex: "none" }} />
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                <b style={{ fontWeight: 700 }}>Mostrar solo lo que prioricé</b>
                <span style={{ display: "block", color: "var(--ink-4)", fontSize: 12, marginTop: 2 }}>
                  {solo
                    ? "El resto no se va a ver, ni acá ni al elegir referencias para un anuncio."
                    : "Apagado: el resto se sigue viendo, al final."}
                </span>
              </span>
            </label>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onClose}
            style={{ padding: "9px 16px", borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontSize: 13,
              fontWeight: 600, background: "transparent", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || vacio}
            style={{ padding: "9px 18px", borderRadius: 10, fontFamily: DS.font, fontSize: 13, fontWeight: 700,
              background: "var(--sel)", border: "none", color: "#fff",
              opacity: (guardando || vacio) ? 0.5 : 1, cursor: (guardando || vacio) ? "default" : "pointer" }}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
