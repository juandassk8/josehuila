import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { toastSuccess } from "../../lib/toast.js";
import { SlotCard } from "./SlotCard.jsx";
import { ConfirmarAccion } from "../../lib/ConfirmarAccion.jsx";
import { isScriptEmpty } from "./scriptHtml.js";
import { isCampaignOrLater, formatNum, STAGES, STAGE_META, NIVELES, NIVEL_COLOR } from "./pipelineConstants.js";
import { dayKey, humanDay, shortDay } from "../../workspace/tasks/centerModel.js";
import { fueraDeOrden, ordenarContenidos } from "./numeracion.js";
import { patchDeCampo, opcionesDelLote } from "./loteCampos.js";
import { BarraLote } from "./BarraLote.jsx";

// Los contenidos, cortados por día de entrega y con lo urgente arriba.
//
// Una lista de 37 no dice qué hay que hacer hoy. Ordenada por fecha sí: lo
// vencido y lo de hoy primero, lo sin fecha al final —no aprieta a nadie—.
function porDia(list, hoy) {
  const m = new Map();
  for (const s of list) {
    const k = s.due || "";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] || "9999-99-99").localeCompare(b[0] || "9999-99-99"))
    .map(([due, slots]) => ({
      due,
      etiqueta: due ? humanDay(due, hoy) : "Sin fecha",
      sub: due ? shortDay(due) : "",
      // Un grupo entero en Feedback no está vencido: ahí la fecha es la que
      // quedó de campaña y ya no hay entrega que esperar. Pintar el encabezado
      // de rojo era el mismo apuro inventado que la fecha de cada fila.
      vencido: !!due && due < hoy && slots.some((s) => s.stage !== "feedback"),
      esHoy: due === hoy,
      listos: slots.filter((s) => s.stage_done).length,
      // Dentro de cada día, agrupados por concepto.
      //
      // Ordenar la VISTA es gratis y no toca ningún número. Renumerar sí los toca, y
      // los números viajan a Drive en el nombre de los archivos que suben las UGC — por
      // eso eso sigue siendo un botón que alguien aprieta a sabiendas, y esto es
      // automático: el board se ve siempre agrupado, aunque los números todavía no lo
      // estén. Lo que se rompía al guionizar era leer un animado en medio de los UGC,
      // y eso se arregla acá.
      slots: ordenarContenidos(slots),
    }));
}

// Qué se lleva por delante el borrado, en una línea. Los números van enteros —
// "#012, #013 y 3 más" — porque el número es lo único que identifica un creativo
// afuera de la plataforma: es lo que uno va a buscar en Drive para comprobar.
function resumenDeLoQueSeVa(elegidos, conTrabajo) {
  const nums = elegidos.map((s) => formatNum(s.num));
  const listado = nums.length <= 4
    ? nums.join(", ")
    : `${nums.slice(0, 3).join(", ")} y ${nums.length - 3} más`;
  const aviso = conTrabajo.length
    ? ` ${conTrabajo.length} ${conTrabajo.length === 1 ? "tiene guion escrito o ya está al aire" : "tienen guion escrito o ya están al aire"}.`
    : "";
  return `Se van ${listado}, con sus guiones, imágenes y referentes.${aviso} No se puede deshacer.`;
}

// Selección vacía por defecto: una sola instancia, para no crear un Set nuevo
// en cada render de una vista que no está seleccionando nada.
const EMPTY_SEL = new Set();

const BLOCK_ICON = {
  video: "M3 5h18v14H3zM7 5v14M17 5v14",
  estatico: "M3 4h18v16H3zM3 15l5-4 4 3 3-2 6 4",
};

// Vista Brief (README §4): bloques Videos·guiones y Estáticos con sus slots.
// Los filtros (tipo/etapa/expandir) viven en la ViewBar de la página.
export function BriefView({ slots, catalogs, bank, products = [], puedeDefinir = true, tipoFilter, stageFilter, nivelFilter, seleccionando = false, sel = EMPTY_SEL, setSel = () => {}, ultimo = null, setUltimo = () => {}, onTerminarSeleccion, onUpdateSlot, onDeleteSlot, onDeleteSlots, onUpdateSlots, onAddSlot, onPickBankRef, onOpenRef, onRemoveRef, onGenerateScript, onReviewScript, onGeneratePending, onDeleteBrief, onRenumerar }) {
  const scoped = useMemo(
    () => slots.filter((s) => (tipoFilter === "todo" || s.tipo === tipoFilter)
      && (!stageFilter || s.stage === stageFilter)
      && (!nivelFilter || (nivelFilter === "__sin" ? !s.nivel_conciencia : s.nivel_conciencia === nivelFilter))),
    [slots, tipoFilter, stageFilter, nivelFilter],
  );
  const hoy = useMemo(() => dayKey(new Date()), []);

  // Cuántos contenidos quedarían fuera de su bloque de concepto. Se calcula sobre TODOS
  // los del brief y no sobre los filtrados: renumerar los mueve a todos, y ofrecerlo
  // según lo que se ve en pantalla haría que el mismo botón dijera cosas distintas.
  const desordenados = useMemo(() => fueraDeOrden(slots), [slots]);
  const videos = scoped.filter((s) => s.tipo === "video");
  const estaticos = scoped.filter((s) => s.tipo === "estatico");

  // ── Selección múltiple ──────────────────────────────────────────────
  // Limpiar una planeación que quedó mal eran veinte confirmaciones de a una.
  //
  // Qué está elegido lo guarda la página y no esta vista: el botón que prende y
  // apaga el modo vive allá arriba, y apagarlo tiene que soltar la selección en
  // el mismo gesto. Con el estado acá abajo eso salía por un efecto que corría
  // después, y una selección que sobrevive escondida es la que borra de más.
  const [confirmando, setConfirmando] = useState(false);
  // Qué campo de texto se está poniendo en tanda: "notas", "desc" o ninguno.
  const [textoEnTanda, setTextoEnTanda] = useState(null);

  // El orden en que se ven en pantalla, aplanado. Es sobre esto que corre el
  // rango del Shift: agarra lo que hay ENTRE los dos que tocaste tal como está
  // dibujado, no en el orden en que existen en la base.
  const ordenVisible = useMemo(() => {
    const aplanar = (list) => porDia(list, hoy).flatMap((d) => d.slots.map((s) => s.id));
    return [
      ...(tipoFilter !== "estatico" ? aplanar(videos) : []),
      ...(tipoFilter !== "video" ? aplanar(estaticos) : []),
    ];
  }, [videos, estaticos, tipoFilter, hoy]);

  // Lo elegido Y visible. Si un filtro escondió algo que estaba tildado, no
  // cuenta ni se borra: se elimina lo que se está viendo, nunca de más.
  const elegidos = useMemo(() => ordenVisible.filter((id) => sel.has(id)), [ordenVisible, sel]);
  const elegidosSlots = useMemo(() => scoped.filter((s) => sel.has(s.id)), [scoped, sel]);

  const alternar = (id, conShift) => {
    setSel((prev) => {
      const next = new Set(prev);
      const prender = !prev.has(id);
      const desde = ordenVisible.indexOf(ultimo);
      const hasta = ordenVisible.indexOf(id);
      if (conShift && ultimo && ultimo !== id && desde >= 0 && hasta >= 0) {
        const [a, b] = desde < hasta ? [desde, hasta] : [hasta, desde];
        for (const x of ordenVisible.slice(a, b + 1)) { if (prender) next.add(x); else next.delete(x); }
        return next;
      }
      if (prender) next.add(id); else next.delete(id);
      return next;
    });
    setUltimo(id);
  };

  const limpiar = () => { setSel(new Set()); setUltimo(null); };

  const alternarBloque = (list) => {
    const todos = list.length > 0 && list.every((s) => sel.has(s.id));
    setSel((prev) => {
      const next = new Set(prev);
      for (const s of list) { if (todos) next.delete(s.id); else next.add(s.id); }
      return next;
    });
    setUltimo(null);
  };

  // Escape sale del modo — el mismo gesto que cierra todo lo demás.
  useEffect(() => {
    if (!seleccionando) return undefined;
    const esc = (e) => { if (e.key === "Escape") onTerminarSeleccion?.(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [seleccionando, onTerminarSeleccion]);

  // Cuánto trabajo hecho se está por perder. Con guiones escritos o anuncios ya
  // al aire de por medio, confirmar deja de ser un clic: hay que escribirlo.
  const conTrabajo = elegidosSlots.filter((s) => !isScriptEmpty(s.script) || isCampaignOrLater(s.stage));

  const borrarElegidos = async () => {
    const ids = elegidos;
    setConfirmando(false);
    limpiar();
    await onDeleteSlots(ids);
  };

  const seleccionable = seleccionando && !!onDeleteSlots;

  // Aplicarle lo mismo a todos los elegidos. La selección NO se suelta: casi
  // siempre lo que sigue es otra acción sobre la misma tanda —ponerles la etapa
  // y después la UGC— y volver a tildar veinte filas para eso es el trabajo que
  // se vino a evitar.
  const aplicar = (patch) => {
    const n = onUpdateSlots?.(elegidos, patch) ?? 0;
    if (n) toastSuccess(`${n} ${n === 1 ? "contenido actualizado" : "contenidos actualizados"}`);
  };

  // Los ángulos y creadores que se ofrecen dependen de si los elegidos comparten
  // producto. La regla está en loteCampos.js, con sus pruebas.
  const { angulos: angulosElegibles, creadores: creadoresElegibles } =
    opcionesDelLote(elegidosSlots, products, catalogs);

  // Qué etapas se pueden ofrecer para el lote. To Film desaparece si TODO lo
  // elegido es estático: no hay nada que grabar, y ofrecerlo para que el sistema
  // lo redirija por dentro a diseño es prometer una cosa y hacer otra.
  const etapasElegibles = elegidosSlots.length && elegidosSlots.every((s) => s.tipo === "estatico")
    ? STAGES.filter((k) => k !== "film")
    : STAGES;

  const block = (tipo, label, list) => (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--neon)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d={BLOCK_ICON[tipo]} /></svg>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.022em", color: DS.textPrimary }}>{label}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", background: "var(--chip)", borderRadius: 999, padding: "2px 9px" }}>{list.length}</span>
        {seleccionable && list.length > 0 && (
          <button type="button" onClick={() => alternarBloque(list)}
            style={{ fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", background: "transparent", border: "1px solid var(--line)", borderRadius: 9, padding: "4px 10px", cursor: "pointer" }}>
            {list.every((s) => sel.has(s.id)) ? "Ninguno" : "Elegir todos"}
          </button>
        )}
        {tipo === "video" && onGeneratePending && (
          <button type="button" onClick={() => onGeneratePending(list)} title="Encola los slots con referente y sin guion; se generan en segundo plano"
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 10, padding: "6px 11px", cursor: "pointer" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></svg>
            Generar pendientes
          </button>
        )}
        <button type="button" onClick={() => onAddSlot(tipo)}
          style={{ marginLeft: tipo === "video" && onGeneratePending ? 0 : "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--ink-2)", background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 11px", cursor: "pointer" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Slot en blanco
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {list.length ? porDia(list, hoy).map((d) => (
          <div key={d.due || "sin"} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 4px" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em",
                color: d.vencido ? "var(--brand)" : d.esHoy ? "var(--amber)" : "var(--ink-2)" }}>{d.etiqueta}</span>
              {d.sub && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{d.sub}</span>}
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {d.listos}/{d.slots.length}
              </span>
            </div>
            {d.slots.map((s) => (
              <SlotCard key={s.id} slot={s} catalogs={catalogs} bank={bank} products={products} hoy={hoy} puedeDefinir={puedeDefinir}
                seleccionado={sel.has(s.id)} onSeleccionar={seleccionable ? alternar : undefined}
                onUpdate={onUpdateSlot} onDelete={onDeleteSlot} onPickBankRef={onPickBankRef} onOpenRef={onOpenRef}
                onRemoveRef={onRemoveRef} onGenerateScript={onGenerateScript} onReviewScript={onReviewScript} />
            ))}
          </div>
        )) : <div style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "8px 4px" }}>Sin slots con este filtro.</div>}
      </div>
    </section>
  );

  return (
    <div style={{ padding: "0 30px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
      {tipoFilter !== "estatico" && block("video", "Videos · guiones", videos)}
      {tipoFilter !== "video" && block("estatico", "Estáticos", estaticos)}

      {/* La barra aparece solo cuando hay algo elegido, y dice cuánto se lleva
          antes de que uno apriete. Va centrada abajo: la bandeja de guiones ya
          vive en la esquina derecha. */}
      {elegidos.length > 0 && (
        <BarraLote
          cuantos={elegidos.length}
          etapas={etapasElegibles}
          productos={catalogs.productos || []}
          angulos={angulosElegibles}
          conceptos={catalogs.conceptos || []}
          creadores={creadoresElegibles}
          onAplicar={(campo, valor) => aplicar(
            patchDeCampo(campo, valor, { products, nivelPorConcepto: catalogs.nivelPorConcepto })
          )}
          onTexto={setTextoEnTanda}
          onEliminar={() => setConfirmando(true)}
          onListo={() => onTerminarSeleccion?.()}
        />
      )}

      {textoEnTanda && (
        <TextoEnTanda
          {...COPIA_TEXTO[textoEnTanda]}
          cuantos={elegidos.length}
          onCancelar={() => setTextoEnTanda(null)}
          onGuardar={(texto) => { aplicar({ [textoEnTanda]: texto }); setTextoEnTanda(null); }} />
      )}

      {confirmando && (
        <ConfirmarAccion
          accion={{
            titulo: `¿Eliminar ${elegidos.length} ${elegidos.length === 1 ? "contenido" : "contenidos"}?`,
            detalle: resumenDeLoQueSeVa(elegidosSlots, conTrabajo),
            // Con guiones escritos o anuncios al aire de por medio, un clic de
            // más no alcanza para tirar el trabajo de otra gente.
            escribir: conTrabajo.length ? "eliminar" : undefined,
            ok: `Eliminar ${elegidos.length}`,
            peligro: true,
            onOk: borrarElegidos,
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}

      {/* Borrar el brief vive acá abajo y no en el tablero: para llegar hay que
          abrirlo y pasar por encima de todo lo que se va a perder. Antes era una
          × que aparecía al pasar el mouse sobre la tarjeta que uno quería abrir. */}
      {/* Renumerar.
          Va acá abajo, con las acciones que cambian el brief entero, y no arriba entre
          los filtros: no es algo que se toque todos los días, y ponerlo a mano hace más
          probable el clic sin querer — que acá cuesta caro, porque le cambia el número a
          contenidos que las UGC ya pueden tener anotados. */}
      {onRenumerar && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>
              Renumerar desde este brief
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>
              {desordenados
                ? `Hay ${desordenados} ${desordenados === 1 ? "contenido" : "contenidos"} fuera de su bloque de concepto. Se renumera este brief y los siguientes, empezando en 001 y siguiendo corrido.`
                : "Los contenidos ya están agrupados por concepto y numerados sin saltos."}
            </div>
          </div>
          <button type="button" onClick={onRenumerar} disabled={!desordenados}
            title={desordenados
              ? "Ojo: si ya repartiste los guiones, las UGC tienen anotado el número viejo."
              : "No hay nada que reordenar"}
            style={{ flex: "none", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600,
              cursor: desordenados ? "pointer" : "default", opacity: desordenados ? 1 : 0.45,
              color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid var(--line-2)",
              borderRadius: 10, padding: "8px 14px" }}>
            Renumerar
          </button>
        </div>
      )}

      {onDeleteBrief && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>
              Eliminar este brief
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>
              {slots.length
                ? `Se van con él sus ${slots.length} ${slots.length === 1 ? "contenido" : "contenidos"}, con sus guiones y referentes. No se puede deshacer.`
                : "Todavía no tiene contenidos. No se puede deshacer."}
            </div>
          </div>
          <button type="button" onClick={onDeleteBrief}
            style={{ flex: "none", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              color: "var(--brand)", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)",
              borderRadius: 10, padding: "8px 14px" }}>
            Eliminar brief
          </button>
        </div>
      )}
    </div>
  );
}

// La copia de cada campo de texto que se pone en tanda.
//
// La descripción es el único campo del lote donde poner lo mismo en todos suele ser
// un error —son 3–6 palabras que distinguen un creativo del de al lado—, así que lo
// dice en vez de dejar que se descubra después, con diez slots llamados igual.
const COPIA_TEXTO = {
  notas: {
    titulo: "Nota",
    ayuda: "Se ve en la tarjeta sin abrirla. Reemplaza la nota que tengan hoy.",
    placeholder: "La UGC no ha grabado · esperando producto · reasignado…",
    guardar: "Poner nota",
    borrar: "Borrar la nota",
    rows: 3,
  },
  desc: {
    titulo: "Descripción",
    ayuda: "3–6 palabras. Reemplaza la que tengan hoy — si los elegidos se distinguen entre sí por la descripción, van a quedar todos iguales.",
    placeholder: "Pelo del sillón",
    guardar: "Poner descripción",
    borrar: "Borrar la descripción",
    rows: 2,
  },
};

/**
 * Poner el mismo texto a varios contenidos de una.
 *
 * Vacío BORRA el campo en todos, y por eso lo dice antes de dejar guardar: es la forma
 * de limpiar «esperando producto» cuando el producto ya llegó, pero también la forma de
 * borrar sin querer siete notas que alguien escribió.
 */
function TextoEnTanda({ titulo, ayuda, placeholder, guardar, borrar, rows, cuantos, onCancelar, onGuardar }) {
  const [texto, setTexto] = useState("");
  const vacio = !texto.trim();
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center",
        background: "rgba(9,16,30,.62)", backdropFilter: "blur(3px)", padding: 20 }}>
      <div style={{ width: "min(460px, 100%)", background: "var(--surface-solid)", border: "1px solid var(--line)",
        borderRadius: 18, padding: 22, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
          {titulo} para {cuantos} {cuantos === 1 ? "contenido" : "contenidos"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 4, lineHeight: 1.5 }}>
          {ayuda}
        </div>
        <textarea
          autoFocus value={texto} rows={rows}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          style={{ width: "100%", marginTop: 14, fontFamily: DS.font, fontSize: 13.5, lineHeight: 1.5,
            color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)",
            borderRadius: 12, padding: "10px 12px", resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancelar}
            style={{ fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)",
              background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={() => onGuardar(texto.trim())}
            title={vacio ? "Guardar vacío borra el campo en los elegidos" : undefined}
            style={{ fontFamily: DS.font, fontSize: 12.5, fontWeight: 700, color: "#FFFFFF",
              background: vacio ? "var(--ink-4)" : "var(--brand)", border: "none", borderRadius: 10,
              padding: "8px 14px", cursor: "pointer" }}>
            {vacio ? borrar : guardar}
          </button>
        </div>
      </div>
    </div>
  );
}
