// La barra que aparece abajo cuando hay contenidos elegidos.
//
// Sale de BriefView por dos razones: ahí adentro ya era el bloque más largo de un
// archivo que no para de crecer, y acá se puede mirar sola —que es lo único que
// permite comprobar cómo se acomoda cuando trae seis selectores y no tres.
//
// ─── Por qué los campos y no solo la etapa ───────────────────────────────────
//
// Planear un brief es llenar diez o veinte slots que comparten casi todo: mismo
// producto, mismo ángulo, mismo concepto, misma UGC. Hacerlo de a uno es abrir la
// fila, elegir seis cosas, cerrarla, y repetir veinte veces. Los campos son los
// mismos que muestra la fila abierta y van en el mismo orden, para que la barra se
// lea como el contenido que está modificando y no como una lista aparte.
//
// Lo que NO está acá es todo lo que distingue un creativo de otro —referencia,
// Loom, referentes, guion—. Eso no se pone en tanda porque ponerlo igual en veinte
// es exactamente lo contrario de para qué existen.

import { DS } from "../../lib/design.js";
import { STAGE_META, NIVELES, NIVEL_COLOR } from "./pipelineConstants.js";

const CHIP = {
  fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)",
  background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 10,
  padding: "7px 13px", cursor: "pointer", flex: "none",
};

const Separador = () => (
  <span style={{ width: 1, height: 22, background: "var(--line)", flex: "none" }} />
);

/**
 * Un campo del lote.
 *
 * El nombre del campo va en el `<span>` y el `<select>` arranca en un guion, no en
 * "— poner —". Con tres selectores el texto largo se leía bien; con seis, la barra
 * pasaba de una pantalla de ancho y se partía en tres renglones. El nombre al lado
 * ya dice qué hace, y el guion alcanza para que se vea que no hay nada elegido.
 *
 * Vuelve al guion cada vez que se suelta: el selector dice qué se va a APLICAR, no
 * qué tienen los elegidos, que casi nunca es lo mismo entre todos.
 */
function Campo({ label, opciones, onChange }) {
  const vacio = !opciones.length;
  return (
    <label
      title={vacio ? `No hay ${label.toLowerCase()} cargados para estos contenidos` : undefined}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 10,
        background: "var(--surface-2)", border: "1px solid var(--line)", flex: "none",
        opacity: vacio ? 0.45 : 1 }}>
      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{label}</span>
      <select
        value="" disabled={vacio}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        style={{ appearance: "none", border: "none", background: "transparent", outline: "none",
          cursor: vacio ? "not-allowed" : "pointer", fontFamily: DS.font, fontSize: 12.5,
          fontWeight: 600, color: "var(--ink-2)", maxWidth: 120, paddingRight: 2 }}>
        <option value="">—</option>
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function BarraLote({
  cuantos, etapas, productos, angulos, conceptos, creadores,
  onAplicar, onTexto, onEliminar, onListo,
}) {
  return (
    // Arriba de donde salen los toasts (bottom 22), no encima: si no, el aviso de
    // "3 contenidos eliminados" tapa la barra que lo produjo.
    <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 78, zIndex: 9997,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 12px",
      borderRadius: 14, background: "var(--surface-solid)", border: "1px solid var(--line)",
      boxShadow: "var(--shadow-lg)", fontFamily: DS.font, maxWidth: "calc(100vw - 44px)",
      flexWrap: "wrap", rowGap: 8 }}>

      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: "none" }}>
        {cuantos} {cuantos === 1 ? "elegido" : "elegidos"}
      </span>

      <Separador />

      {/* Siempre `(campo, valor)`. La barra no sabe que elegir producto arrastra su
          id ni que elegir concepto puede traer el nivel de conciencia: eso lo arma
          quien tiene los catálogos a mano. Acá solo se dice qué se tocó. */}
      <Campo label="Etapa" onChange={(v) => onAplicar("stage", v)}
        opciones={etapas.map((k) => ({ value: k, label: STAGE_META[k].label }))} />
      <Campo label="Producto" onChange={(v) => onAplicar("producto", v)}
        opciones={productos.map((p) => ({ value: p, label: p }))} />
      <Campo label="Ángulo" onChange={(v) => onAplicar("angulo", v)}
        opciones={angulos.map((a) => ({ value: a, label: a }))} />
      <Campo label="Concepto" onChange={(v) => onAplicar("concepto", v)}
        opciones={conceptos.map((c) => ({ value: c, label: c }))} />
      <Campo label="Conciencia" onChange={(v) => onAplicar("nivel_conciencia", v)}
        opciones={NIVELES.map((n) => ({ value: n.key, label: n.label, color: NIVEL_COLOR[n.key] }))} />
      <Campo label="UGC" onChange={(v) => onAplicar("creador", v)}
        opciones={creadores.map((c) => ({ value: c, label: c }))} />

      {/* Los dos campos de texto van como botón: hay que escribirlos, no elegirlos.
          La nota la pidió un caso concreto — siete contenidos frenados porque la
          misma UGC no contestó. Ponerla de a uno son siete veces abrir, escribir y
          cerrar, y al final nadie la pone y el board queda mintiendo sobre por qué
          no avanza. */}
      <button type="button" onClick={() => onTexto("desc")} style={CHIP}>Descripción</button>
      <button type="button" onClick={() => onTexto("notas")} style={CHIP}>Nota</button>

      <Separador />

      <button type="button" onClick={onEliminar}
        style={{ ...CHIP, fontWeight: 700, color: "var(--brand)", background: "var(--brand-soft)",
          border: "1px solid rgba(226,75,74,0.35)" }}>
        Eliminar
      </button>
      <button type="button" onClick={onListo} title="Salir del modo selección (Escape)" style={CHIP}>
        Listo
      </button>
    </div>
  );
}
