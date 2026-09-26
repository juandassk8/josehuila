import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { toast, toastError, toastSuccess } from "../../lib/toast.js";
import { STAGE_META, TINT, formatosDe, NIVELES, NIVEL_COLOR, NIVEL_TINT, NIVEL_BORDE, nivelLabel, buildAdName, buildCreativeName, formatNum, isCampaignOrLater, marcarPublicado, stagesFor } from "./pipelineConstants.js";
import { uploadSlotImage, deleteExampleImage } from "../../despliegue/storage.js";
import { ScriptEditor } from "./ScriptEditor.jsx";
import { fechaTono } from "../../workspace/tasks/centerModel.js";
import { useVoiceNote } from "./useVoiceNote.js";
import { fetchFacebookMetrics } from "./data/pipelineMock.js";

const LABEL = { fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)" };
const BARE = { appearance: "none", border: "none", background: "transparent", outline: "none", cursor: "pointer", fontFamily: DS.font, width: "100%", textOverflow: "ellipsis" };
const PANEL = { borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" };

function IconBtn({ title, onClick, path, color = "var(--ink-2)", bg = "var(--chip)", border = "var(--line)" }) {
  return (
    <button type="button" title={title} onClick={onClick}
      style={{ width: 28, height: 28, flex: "none", display: "grid", placeItems: "center", borderRadius: 9, cursor: "pointer", color, background: bg, border: `1px solid ${border}` }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {path.map((d, i) => <path key={i} d={d} />)}
      </svg>
    </button>
  );
}

function CopyBtn({ slot }) {
  return <IconBtn title="Copiar nombre del anuncio" path={["M9 9h11v11H9z", "M5 15V5a2 2 0 0 1 2-2h8"]}
    onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(buildAdName(slot)); toastSuccess("Nombre copiado"); }} />;
}

function DriveBtn({ slot }) {
  const has = !!slot.drive;
  return (
    <button type="button" title={has ? "Abrir carpeta del creativo" : "Sin carpeta de Drive"}
      onClick={(e) => { e.stopPropagation(); if (has) window.open("https://" + slot.drive.replace(/^https?:\/\//, ""), "_blank", "noopener"); else toast("Este creativo todavía no tiene carpeta", "info"); }}
      style={{ width: 28, height: 28, flex: "none", display: "grid", placeItems: "center", borderRadius: 9, cursor: "pointer",
        color: has ? "var(--sel)" : "var(--ink-4)", background: has ? "var(--sel-soft)" : "var(--chip)", border: `1px solid ${has ? "rgba(88,166,255,0.3)" : "var(--line)"}` }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
    </button>
  );
}

// El chip de "ya está" — ámbar y hueco mientras falta, verde con tilde cuando se
// terminó. Es el que el trafficker viene usando para marcar publicado, y ahora
// es el mismo en todas las etapas: uno aprende un solo gesto.
//
// UN chip por fila. En campaña había dos diciendo "Pendiente" —publicado y
// listo—, que es peor que no tener ninguno, así que ahí publicar escribe también
// `stage_done`: publicar ES terminar el trabajo de esa etapa. De paso arregla que
// la tarea del trafficker cuente `stage_done` y nadie lo marcara nunca, así que
// su barra no se movía jamás.
function ListoToggle({ slot, set, compact, modo = "listo" }) {
  const esPub = modo === "publicado";
  const on = esPub ? !!slot.publicado : !!slot.stage_done;
  const texto = on ? (esPub ? "Publicado" : "Listo") : "Pendiente";
  const marcar = (v) => (esPub ? marcarPublicado(v) : { stage_done: v });
  return (
    <button type="button" title={on ? texto : `Marcar como ${esPub ? "publicado" : "listo"}`}
      onClick={(e) => { e.stopPropagation(); set(marcar(!on)); }}
      style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 999,
        padding: compact ? "4px 9px" : "5px 11px", flex: "none", border: "none",
        color: on ? "var(--green)" : "var(--amber)", background: on ? TINT.green : TINT.amber }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, display: "grid", placeItems: "center", background: on ? "var(--green)" : "transparent", border: `1.5px solid ${on ? "var(--green)" : "rgba(240,169,59,0.55)"}` }}>
        {on && <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="#04120C" strokeWidth={3.6} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
      </span>
      {texto}
    </button>
  );
}

function StageSelect({ slot, set }) {
  const meta = STAGE_META[slot.stage];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, flex: "none", background: meta.tint }}
      onClick={(e) => e.stopPropagation()}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: meta.color }} />
      <select value={slot.stage} onChange={(e) => set({ stage: e.target.value })}
        style={{ ...BARE, width: "auto", fontSize: 11.5, fontWeight: 600, color: meta.color, paddingRight: 2 }}>
        {stagesFor(slot.tipo, slot.stage).map((k) => <option key={k} value={k}>{STAGE_META[k].label}</option>)}
      </select>
    </div>
  );
}

// El nivel de conciencia, como semáforo: verde arriba del embudo, ámbar en el
// medio, rojo abajo. Es un `select` igual que antes —se cambia en el mismo clic—
// pero pintado: en una lista de treinta contenidos, cuánto hay de cada punto del
// embudo se ve sin leer una sola palabra.
function NivelChip({ value, onChange, editable = true }) {
  const puesto = !!NIVEL_COLOR[value];
  const color = puesto ? NIVEL_COLOR[value] : "var(--ink-4)";
  const fondo = puesto ? NIVEL_TINT[value] : "var(--chip)";
  const borde = puesto ? NIVEL_BORDE[value] : "var(--line)";
  const base = {
    display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999,
    padding: "3px 9px", background: fondo, border: `1px solid ${borde}`, flex: "none",
  };
  if (!editable) {
    return (
      <span style={{ ...base, fontFamily: DS.font, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", color }}>
        {puesto ? nivelLabel(value) : "—"}
      </span>
    );
  }
  return (
    <span style={base}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flex: "none" }} />
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}
        style={{ ...BARE, width: "auto", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", color, paddingRight: 2 }}>
        <option value="">— nivel —</option>
        {NIVELES.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
      </select>
    </span>
  );
}

function MetaRow({ slot, set, catalogs, products = [], puedeDefinir = true }) {
  // `options` admite strings ("Fresh Breath") o pares {value,label} — el nivel de
  // conciencia guarda 'mofu' y muestra "MOFU", el resto guarda lo que muestra.
  const cell = (label, value, options, key, accent, last, onChange) => {
    const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
    const visible = opts.find((o) => o.value === value)?.label || value;
    return (
      <div key={label} style={{ flex: "1 1 140px", minWidth: 0, padding: "9px 13px", borderRight: last ? "none" : "1px solid var(--line)" }}>
        <div style={{ ...LABEL, marginBottom: 2 }}>{label}</div>
        {/* Qué producto, qué ángulo y qué concepto es estrategia: la define quien
            conduce la tanda. Para el resto se lee, no se elige. */}
        {puedeDefinir ? (
          <select value={value || ""} onChange={onChange || ((e) => set({ [key]: e.target.value }))}
            style={{ ...BARE, fontSize: 12.5, fontWeight: 600, color: value ? (accent || "var(--ink)") : "var(--ink-4)" }}>
            <option value="">— elegir —</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: value ? (accent || "var(--ink)") : "var(--ink-4)", padding: "1px 0" }}>
            {visible || "—"}
          </div>
        )}
      </div>
    );
  };
  // Ángulos/creadores salen del PRODUCTO elegido (si hay); si no, de todos.
  const prod = products.find((p) => p.id === slot.product_id || p.name === slot.producto) || null;
  const angulos = prod ? (prod.touchpoints?.angles || []).map((a) => a.title).filter(Boolean) : catalogs.angulos;
  const creadores = prod ? (prod.creators || []) : catalogs.creadores;
  const onProducto = (e) => {
    const name = e.target.value;
    set({ producto: name, product_id: products.find((p) => p.name === name)?.id || null });
  };
  // Elegir el concepto trae su nivel de conciencia del banco. Solo cuando el
  // nivel está vacío: si alguien lo puso a mano, el concepto no se lo pisa —hay
  // creativos que se cuelan en otro punto del embudo a propósito.
  const onConcepto = (e) => {
    const name = e.target.value;
    const sugerido = catalogs.nivelPorConcepto?.[name] || "";
    set({ concepto: name, ...(slot.nivel_conciencia || !sugerido ? {} : { nivel_conciencia: sugerido }) });
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", borderRadius: 13, border: "1px solid var(--line)", background: "var(--surface-2)", overflow: "hidden" }}>
      {cell("Producto", slot.producto, catalogs.productos, "producto", undefined, false, onProducto)}
      {/* El formato solo aparece en estáticos.
          En un video no significa nada: se graba en vertical y punto, y el selector
          ofrecía "cuadrado" como si fuera una decisión que alguien tuviera que tomar.
          Un campo que siempre se responde igual no es un campo, es ruido en medio de
          los que sí hay que llenar.
          La columna `formato` NO se toca en la base: los estáticos la usan de verdad,
          y los videos que ya tengan un valor guardado lo conservan. */}
      {slot.tipo === "estatico" && cell("Formato", slot.formato, formatosDe(slot.tipo), "formato")}
      {cell("Ángulo", slot.angulo, angulos, "angulo", "var(--sel)")}
      {cell("Concepto", slot.concepto, catalogs.conceptos, "concepto", undefined, false, onConcepto)}
      {/* El nivel de conciencia es campo propio, no algo escrito adentro del
          concepto, y se ve como etiqueta de color en vez de texto suelto. */}
      <div style={{ flex: "1 1 140px", minWidth: 0, padding: "9px 13px", borderRight: "1px solid var(--line)" }}>
        <div style={{ ...LABEL, marginBottom: 3 }}>Conciencia</div>
        <NivelChip value={slot.nivel_conciencia} editable={puedeDefinir}
          onChange={(v) => set({ nivel_conciencia: v })} />
      </div>
      {cell("Creador", slot.creador, creadores, "creador")}
      <div style={{ flex: "1.4 1 190px", minWidth: 0, padding: "9px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={LABEL}>Descripción</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--neon)" }}>3–6 palabras</span>
        </div>
        <input value={slot.desc} placeholder="Pelo del sillón" onChange={(e) => set({ desc: e.target.value })}
          style={{ ...BARE, cursor: "text", fontSize: 12.5, fontWeight: 600, color: slot.desc ? "var(--ink)" : "var(--ink-4)" }} />
      </div>
    </div>
  );
}

function LinkField({ label, value, onChange, icon }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", ...PANEL, borderRadius: 11 }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={value ? "var(--sel)" : "var(--ink-4)"} strokeWidth={1.7} strokeLinecap="round" style={{ flex: "none" }}><path d={icon} /></svg>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={LABEL}>{label}</div>
        <input value={value} placeholder="Pegar link…" onChange={(e) => onChange(e.target.value)}
          style={{ ...BARE, cursor: "text", fontSize: 12, color: value ? "var(--ink)" : "var(--ink-4)", overflow: "hidden" }} />
      </div>
    </div>
  );
}

function MetricsPanel({ slot, set }) {
  const m = slot.metrics || {};
  const cell = (label, key, ph, color, last) => (
    <div key={key} style={{ flex: "1 1 110px", minWidth: 0, padding: "8px 12px", borderRight: last ? "none" : "1px solid var(--line)" }}>
      <div style={{ ...LABEL, marginBottom: 2 }}>{label}</div>
      <input className="mono" value={m[key] || ""} placeholder={ph} onChange={(e) => set({ metrics: { ...m, [key]: e.target.value } })}
        style={{ ...BARE, cursor: "text", fontSize: 14, fontWeight: 500, color: m[key] ? (color || "var(--ink)") : "var(--ink-4)" }} />
    </div>
  );
  // NOTA: aún no hay integración real con Facebook — esto rellena con datos de
  // EJEMPLO. Se pide confirmación si iba a pisar métricas ya cargadas.
  const bring = async () => {
    const hasData = ["gasto", "resultados", "cpa", "roas"].some((k) => String(m[k] || "").trim());
    if (hasData && !window.confirm("Todavía no hay conexión real con Facebook. Esto carga datos de EJEMPLO y puede pisar lo que ya escribiste. ¿Seguir?")) return;
    const r = await fetchFacebookMetrics(slot);
    set({ metrics: { ...m, ...r } });
    toastSuccess("Métricas de ejemplo cargadas");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={LABEL}>Métricas</span>
        <button type="button" onClick={bring}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 9, padding: "5px 10px", cursor: "pointer" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
          Rellenar de ejemplo
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", overflow: "hidden" }}>
        {cell("Gasto", "gasto", "$0", "var(--amber)")}
        {cell("Resultados", "resultados", "0", "var(--green)")}
        {cell("CPA", "cpa", "$0", "var(--ink)")}
        {cell("ROAS", "roas", "0x", "var(--neon)", true)}
      </div>
    </div>
  );
}

function FeedbackPanel({ slot, set }) {
  // El grabador vive en useVoiceNote — compartido con "Ajustar con IA" del panel
  // de guion, que necesitaba exactamente lo mismo.
  const { rec, busy, toggle: toggleRec } = useVoiceNote(
    (text) => set({ feedback: (slot.feedback ? slot.feedback + "\n" : "") + "· " + text }),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "9px 12px", ...PANEL }}>
        <span style={{ ...LABEL, flex: "none" }}>Anuncio publicado</span>
        <input value={slot.drive} placeholder="Link del anuncio o de la carpeta…" onChange={(e) => set({ drive: e.target.value })}
          style={{ ...BARE, cursor: "text", flex: "1 1 200px", fontSize: 12, color: slot.drive ? "var(--ink)" : "var(--ink-4)" }} />
        <DriveBtn slot={slot} /><CopyBtn slot={slot} />
      </div>
      <MetricsPanel slot={slot} set={set} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={LABEL}>Feedback creativo</span>
          <button type="button" onClick={toggleRec} disabled={busy}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, cursor: busy ? "wait" : "pointer", borderRadius: 9, padding: "5px 11px",
              color: rec ? "#fff" : "var(--ink-2)", background: rec ? "var(--brand)" : "var(--chip)", border: `1px solid ${rec ? "transparent" : "var(--line)"}`, opacity: busy ? 0.7 : 1 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {busy ? "Transcribiendo…" : rec ? "Grabando…" : "Grabar nota"}
          </button>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>se transcribe solo</span>
        </div>
        <textarea value={slot.feedback || ""} rows={4} placeholder="Qué funcionó, qué escalar, qué cortar…" onChange={(e) => set({ feedback: e.target.value })}
          style={{ fontFamily: DS.font, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px", outline: "none", resize: "vertical" }} />
      </div>
    </div>
  );
}

function CampaignPanel({ slot, set }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "9px 12px", ...PANEL }}>
      <span style={{ ...LABEL, flex: "none" }}>Carpeta del creativo</span>
      <input value={slot.drive} placeholder="Pegar link de Drive…" onChange={(e) => set({ drive: e.target.value })}
        style={{ ...BARE, cursor: "text", flex: "1 1 200px", fontSize: 12, color: slot.drive ? "var(--ink)" : "var(--ink-4)" }} />
      <DriveBtn slot={slot} /><CopyBtn slot={slot} /><ListoToggle slot={slot} set={set} modo="publicado" />
    </div>
  );
}

// Campo de carpeta de Drive: etiqueta, input y botón de abrir. Se usa dos veces
// en To Edit —de dónde saca el material y dónde deja lo terminado— así que vale
// la pena tenerlo en un solo lugar.
function FolderField({ label, hint, value, onChange, accent = "var(--sel)" }) {
  const has = !!(value || "").trim();
  return (
    <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", ...PANEL, borderRadius: 11 }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={has ? accent : "var(--ink-4)"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={LABEL}>{label}{hint ? <span style={{ textTransform: "none", fontWeight: 500, color: "var(--ink-4)" }}> — {hint}</span> : null}</div>
        <input value={value || ""} placeholder="Pegar link de la carpeta…" onChange={(e) => onChange(e.target.value)}
          style={{ ...BARE, cursor: "text", fontSize: 12, color: has ? "var(--ink)" : "var(--ink-4)" }} />
      </div>
      {has && (
        <button type="button" title="Abrir carpeta"
          onClick={(e) => { e.stopPropagation(); window.open("https://" + value.replace(/^https?:\/\//, ""), "_blank", "noopener"); }}
          style={{ width: 26, height: 26, flex: "none", display: "grid", placeItems: "center", borderRadius: 8, cursor: "pointer", color: accent, background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.28)" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>
        </button>
      )}
    </div>
  );
}

function ProductionPanel({ slot, set, catalogs }) {
  const isEdit = slot.stage === "edit";
  const rol = slot.tipo === "estatico" ? "Diseñador" : "Editor";
  return (
    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "stretch" }}>
      {/* Material crudo: se carga al filmar y el editor lo LEE. Antes compartía
          columna con la carpeta del creativo, así que al pegar la final se
          perdía el link de lo grabado. */}
      <FolderField
        label="Carpeta del material crudo"
        hint={isEdit ? "de acá lo saca el editor" : "subir acá"}
        value={slot.drive_raw} onChange={(v) => set({ drive_raw: v })} />

      {/* Y en To Edit, además, dónde tiene que DEJAR lo terminado. Es la misma
          carpeta que después se ve en In Campaign y la que viaja al despliegue. */}
      {isEdit && (
        <FolderField
          label="Carpeta del creativo" hint="acá lo deja el editor"
          value={slot.drive} onChange={(v) => set({ drive: v })} accent="var(--green)" />
      )}
      <div style={{ display: "flex", gap: 9, flex: "1 1 240px" }}>
        <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, padding: "7px 11px", ...PANEL, borderRadius: 11 }}>
          <span style={LABEL}>{rol}</span>
          <select value={slot.editor || ""} onChange={(e) => set({ editor: e.target.value })}
            style={{ ...BARE, fontSize: 12.5, fontWeight: 600, color: slot.editor ? "var(--pink)" : "var(--ink-4)" }}>
            <option value="">Sin asignar</option>
            {catalogs.editores.map((ed) => <option key={ed} value={ed}>{ed}</option>)}
          </select>
        </label>
        <label style={{ width: 118, display: "flex", flexDirection: "column", gap: 3, padding: "7px 11px", ...PANEL, borderRadius: 11 }}>
          <span style={LABEL}>Entrega</span>
          <input type="date" value={slot.due || ""} onChange={(e) => set({ due: e.target.value })}
            style={{ ...BARE, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: slot.due ? "var(--ink)" : "var(--ink-4)", colorScheme: "inherit" }} />
        </label>
      </div>
    </div>
  );
}

// Tarjeta de una referencia pegada al slot. Soporta el snapshot nuevo (objeto con
// portada/video/transcripción) y el id string legacy (thumbnail rayado, como antes).
function RefCard({ item, bank, onOpen, onRemove, onGenerate }) {
  const [broken, setBroken] = useState(false);
  const legacy = typeof item === "string";
  const name = legacy ? (bank.find((c) => c.id === item)?.name || "Referencia") : (item.name || item.concept_name || "Referencia");
  const brand = legacy ? "" : item.brand;
  const thumb = legacy || broken ? "" : item.file_url;
  const isVideo = legacy ? false : item.format === "video";
  const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <div style={{ position: "relative", flex: "0 1 150px", minWidth: 0, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", background: "var(--surface-2)" }}>
      <button type="button" onClick={legacy ? undefined : onOpen} disabled={legacy} title={legacy ? "" : "Ver referente"}
        style={{ display: "block", width: "100%", border: "none", padding: 0, background: "transparent", cursor: legacy ? "default" : "pointer" }}>
        <div style={{ position: "relative", height: 92, background: "var(--chip)" }}>
          {thumb
            ? <img src={thumb} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <div style={{ width: "100%", height: "100%", backgroundImage: "repeating-linear-gradient(135deg, var(--chip) 0 7px, transparent 7px 14px)" }} />}
          {isVideo && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center" }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "7px 10px", textAlign: "left" }}>
          {brand ? <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", ...ell }}>{brand}</div> : null}
          <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35, ...ell }}>{name}</div>
        </div>
      </button>
      {/* La acción vive pegada a SU referente: así se ve de qué anuncio sale el
          guion, en vez de un botón suelto que no dice con cuál trabaja. */}
      {onGenerate && !legacy && (
        <div style={{ padding: "0 8px 8px" }}>
          <button type="button" onClick={onGenerate} title={`Replicar la estructura de “${name}”`}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 9, padding: "6px 8px", cursor: "pointer" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></svg>
            Generar guion
          </button>
        </div>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} title="Quitar"
          style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--brand)", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)" }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}

// Bloque de referentes del slot — disponible en TODOS los slots (video y estático).
function ReferencesBlock({ slot, bank, onPick, onOpenRef, onRemoveRef, onGenerateScript }) {
  const refs = Array.isArray(slot.refs) ? slot.refs : [];
  const idOf = (r) => (typeof r === "string" ? r : r?.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={LABEL}>Referentes</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{refs.length}/3</span>
        <button type="button" onClick={() => onPick(slot)}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 10, padding: "7px 12px", cursor: "pointer" }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5" /></svg>
          Elegir del banco
        </button>
      </div>
      {refs.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {refs.map((r) => (
            <RefCard key={idOf(r)} item={r} bank={bank}
              onOpen={() => onOpenRef(slot, r)} onRemove={() => onRemoveRef(slot.id, idOf(r))}
              onGenerate={slot.tipo === "video" && onGenerateScript ? () => onGenerateScript(slot, idOf(r)) : null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Imágenes de referencia del estático ──────────────────────────────────────
// Un slot estático no tenía dónde subir nada: el video tiene su guion y el
// estático tenía un textarea de notas y listo. Por eso los estáticos que ya
// existen viven en un Drive y no en la plataforma — no había forma de meterlos.
//
// Tres formas de cargar, porque las tres son gestos que la gente ya hace con
// imágenes: elegir archivo, arrastrar encima, y pegar (⌘V) con el mouse sobre
// la zona. La última necesita escuchar en el documento —el evento `paste` no
// llega a un div que no tiene el foco— y por eso se limita a mientras el mouse
// está encima: si no, pegar una imagen le caería a los cinco slots abiertos.
const MAX_IMAGENES = 3;

function ImagenesEstatico({ slot, set }) {
  const [subiendo, setSubiendo] = useState(0);
  const [over, setOver] = useState(false);
  const [viendo, setViendo] = useState(-1);
  const [reemplazando, setReemplazando] = useState(-1);
  const inputRef = useRef(null);
  const encima = useRef(false);

  const imgs = Array.isArray(slot.imagenes) ? slot.imagenes : [];
  const libres = MAX_IMAGENES - imgs.length;
  const ocupado = subiendo > 0;

  const subir = async (files, reemplazarIdx = -1) => {
    const list = [...(files || [])].filter((f) => f && (f.type || "").startsWith("image/"));
    if (!list.length) return;
    const cupo = reemplazarIdx >= 0 ? 1 : libres;
    if (cupo <= 0) { toastError(`Un estático lleva hasta ${MAX_IMAGENES} imágenes`); return; }
    const tanda = list.slice(0, cupo);
    if (tanda.length < list.length) toast(`Solo entraban ${cupo} más`, "info");

    setSubiendo((n) => n + tanda.length);
    try {
      const urls = await Promise.all(tanda.map((f) => uploadSlotImage(f, { slotId: slot.id })));
      if (reemplazarIdx >= 0) {
        const vieja = imgs[reemplazarIdx];
        set({ imagenes: imgs.map((u, i) => (i === reemplazarIdx ? urls[0] : u)) });
        if (vieja) deleteExampleImage(vieja).catch(() => {});
      } else {
        set({ imagenes: [...imgs, ...urls].slice(0, MAX_IMAGENES) });
      }
      toastSuccess(tanda.length === 1 ? "Imagen cargada" : `${tanda.length} imágenes cargadas`);
    } catch (e) {
      toastError(e?.message || "No se pudo subir la imagen");
    } finally {
      setSubiendo((n) => Math.max(0, n - tanda.length));
      setReemplazando(-1);
    }
  };

  const quitar = (idx) => {
    const url = imgs[idx];
    set({ imagenes: imgs.filter((_, i) => i !== idx) });
    setViendo(-1);
    // El borrado del archivo va detrás y sin bloquear: si falla, lo que importa
    // —que el slot deje de mostrarla— ya pasó.
    if (url) deleteExampleImage(url).catch(() => {});
  };

  // Pegar con el mouse encima de la zona.
  useEffect(() => {
    const onPaste = (e) => {
      if (!encima.current || ocupado) return;
      const files = [...(e.clipboardData?.items || [])]
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile());
      if (!files.length) return;
      e.preventDefault();
      subir(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const abrirPicker = (idx = -1) => { setReemplazando(idx); inputRef.current?.click(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={() => { encima.current = true; }}
      onMouseLeave={() => { encima.current = false; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={LABEL}>Imágenes de referencia</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{imgs.length}/{MAX_IMAGENES}</span>
        {ocupado && <span style={{ fontSize: 11, color: "var(--sel)" }}>Subiendo…</span>}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { subir(e.target.files, reemplazando); e.target.value = ""; }} />

      <div
        onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!ocupado) subir(e.dataTransfer?.files); }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 10, borderRadius: 13,
          background: over ? "var(--sel-soft)" : "var(--surface-2)",
          border: `1px ${over ? "solid" : "dashed"} ${over ? "rgba(88,166,255,0.45)" : "var(--line)"}`,
          transition: "background .12s ease, border-color .12s ease" }}>
        {imgs.map((url, i) => (
          <div key={url} style={{ position: "relative", width: 104, height: 104, borderRadius: 11, overflow: "hidden", border: "1px solid var(--line)", background: "var(--chip)" }}>
            <button type="button" title="Ver en grande" onClick={() => setViendo(i)}
              style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "transparent", cursor: "zoom-in" }}>
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
            <button type="button" title="Quitar" onClick={() => quitar(i)}
              style={{ position: "absolute", top: 5, right: 5, width: 21, height: 21, borderRadius: 7, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--brand)", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)" }}>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <button type="button" title="Reemplazar" onClick={() => abrirPicker(i)} disabled={ocupado}
              style={{ position: "absolute", left: 5, bottom: 5, fontFamily: DS.font, fontSize: 10.5, fontWeight: 600, borderRadius: 7, padding: "3px 7px", cursor: ocupado ? "wait" : "pointer", color: "#fff", background: "rgba(0,0,0,0.55)", border: "none" }}>
              Reemplazar
            </button>
          </div>
        ))}

        {libres > 0 && (
          <button type="button" onClick={() => abrirPicker(-1)} disabled={ocupado}
            style={{ width: 104, height: 104, borderRadius: 11, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: ocupado ? "wait" : "pointer", fontFamily: DS.font, color: "var(--ink-3)", background: "var(--surface)", border: "1px dashed var(--line-2)" }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25, textAlign: "center" }}>Elegir<br />arrastrar<br />o pegar</span>
          </button>
        )}
      </div>

      {viendo >= 0 && imgs[viendo] && (
        <VisorImagen urls={imgs} idx={viendo} onIdx={setViendo} onQuitar={() => quitar(viendo)} onClose={() => setViendo(-1)} />
      )}
    </div>
  );
}

// Ver la imagen en grande, con las hermanas a un paso. Se cierra con Escape o
// clickeando el fondo — lo mismo que hace el resto de los visores del portal.
function VisorImagen({ urls, idx, onIdx, onQuitar, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIdx((idx + 1) % urls.length);
      if (e.key === "ArrowLeft") onIdx((idx - 1 + urls.length) % urls.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [idx, urls.length, onIdx, onClose]);

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(8,8,14,0.78)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 28, fontFamily: DS.font }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "min(920px, 92vw)", maxHeight: "90vh" }}>
        <img src={urls[idx]} alt="" style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", borderRadius: 14, display: "block", background: "var(--surface-2)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {urls.length > 1 && (
            <>
              <button type="button" onClick={() => onIdx((idx - 1 + urls.length) % urls.length)} style={visorBtn}>←</button>
              <span className="mono" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{idx + 1} / {urls.length}</span>
              <button type="button" onClick={() => onIdx((idx + 1) % urls.length)} style={visorBtn}>→</button>
            </>
          )}
          <a href={urls[idx]} target="_blank" rel="noreferrer" style={{ ...visorBtn, marginLeft: "auto", textDecoration: "none" }}>Abrir original</a>
          <button type="button" onClick={onQuitar} style={{ ...visorBtn, color: "var(--brand)" }}>Quitar</button>
          <button type="button" onClick={onClose} style={visorBtn}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

const visorBtn = { fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "7px 13px", cursor: "pointer" };

// ── Slot card ────────────────────────────────────────────────────────────────
export function SlotCard({ slot, catalogs, bank, products = [], hoy = "", puedeDefinir = true, seleccionado = false, onSeleccionar, onUpdate, onDelete, onPickBankRef, onOpenRef, onRemoveRef, onGenerateScript, onReviewScript }) {
  const set = (patch) => onUpdate(slot.id, patch);
  const isVid = slot.tipo === "video";
  const inCamp = isCampaignOrLater(slot.stage);
  const isFb = slot.stage === "feedback";
  // El nivel no va dentro del texto del nombre: se dibuja como etiqueta al final
  // de la fila. Decirlo dos veces —"…- MOFU" y la etiqueta— es ruido.
  const name = buildCreativeName(slot, { conNivel: false }) || "Slot en blanco — completá producto y ángulo";
  const showDetail = !isFb || slot.detail;

  return (
    <div style={{ borderRadius: 18, background: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden",
      border: `1px solid ${seleccionado ? "rgba(88,166,255,0.5)" : "var(--line)"}`,
      outline: seleccionado ? "1px solid rgba(88,166,255,0.28)" : "none" }}>
      {/* Fila colapsada */}
      <div onClick={() => set({ open: !slot.open })}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", flexWrap: "wrap",
          background: seleccionado ? "var(--sel-soft)" : "transparent",
          borderBottom: slot.open ? "1px solid var(--line)" : "none" }}>
        {/* Elegir varios y borrarlos de una. Con Shift agarra el rango desde el
            último que tocaste, que es como se limpia una tanda entera sin ir
            tildando de a uno. */}
        {onSeleccionar && (
          <button type="button" role="checkbox" aria-checked={seleccionado}
            title={seleccionado ? "Quitar de la selección" : "Seleccionar (Shift para el rango)"}
            onClick={(e) => { e.stopPropagation(); onSeleccionar(slot.id, e.shiftKey); }}
            style={{ width: 19, height: 19, flex: "none", borderRadius: 6, display: "grid", placeItems: "center", cursor: "pointer",
              background: seleccionado ? "var(--sel)" : "transparent",
              border: `1.5px solid ${seleccionado ? "var(--sel)" : "var(--line-2)"}` }}>
            {seleccionado && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
          </button>
        )}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={2.2} strokeLinecap="round"
          style={{ flex: "none", transform: slot.open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><path d="M9 6l6 6-6 6" /></svg>
        <span className="mono" style={{ fontSize: 12, fontWeight: 500, color: "var(--neon)", background: TINT.neon, borderRadius: 8, padding: "3px 9px", flex: "none" }}>{formatNum(slot.num)}</span>
        {/* Miniatura del estático en la fila cerrada: saber qué imagen es no
            debería costar abrir el slot. */}
        {!isVid && (slot.imagenes || [])[0] && (
          <img src={(slot.imagenes || [])[0]} alt="" style={{ width: 30, height: 30, flex: "none", borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)", display: "block" }} />
        )}
        <div style={{ minWidth: 0, flex: "1 1 260px", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.012em", lineHeight: 1.35,
          color: slot.stage_done ? "var(--ink-4)" : (buildCreativeName(slot, { conNivel: false }) ? "var(--ink)" : "var(--ink-4)"),
          textDecoration: slot.stage_done ? "line-through" : "none" }}>{name}</div>
        {slot.nivel_conciencia && <NivelChip value={slot.nivel_conciencia} editable={false} />}
        <NotaChip slot={slot} set={set} />
        {/* La fecha es la de ENTREGA de la etapa en la que está: dice cuándo hay
            que tener listo lo que falta. En Feedback no falta nada —el anuncio ya
            se publicó— y lo que quedaba ahí era la fecha heredada de campaña,
            pintada de rojo como si algo estuviera vencido. Un vencimiento que no
            existe apura a la gente por nada.

            Lo mismo cuando el trabajo de la etapa ya está marcado listo: si está
            hecho no puede estar tarde, así que la fecha se muestra apagada en vez
            de en rojo. */}
        {slot.due && !isFb && (() => {
          const f = fechaTono(slot.due, hoy);
          const TONO = { vencido: "var(--brand)", hoy: "var(--amber)", futuro: "var(--ink-4)" };
          const tono = slot.stage_done ? "futuro" : f.tono;
          return (
            <span style={{ flex: "none", fontSize: 11.5, fontWeight: tono === "futuro" ? 500 : 700, color: TONO[tono] || "var(--ink-4)" }}>
              {f.texto}
            </span>
          );
        })()}
        {slot.ai_meta?.pending && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onReviewScript?.(slot); }}
            title="La IA ya escribió un guion para este slot — revisalo e insertalo"
            style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--green)", background: "rgba(52,192,138,.13)", border: "1px solid rgba(52,192,138,.3)", borderRadius: 999, padding: "4px 10px", cursor: "pointer", fontFamily: DS.font }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Guion listo
          </button>
        )}
        {/* En `idea` no aparece: todavía no hay nada que hacer, es una intención.
            El resto de las etapas sí tienen trabajo que alguien termina. En
            feedback dice "Listo" y no "Publicado": publicar ya pasó. */}
        {slot.stage !== "idea" && (
          <ListoToggle slot={slot} set={set} compact modo={inCamp && !isFb ? "publicado" : "listo"} />
        )}
        {inCamp && <CopyBtn slot={slot} />}
        {inCamp && <DriveBtn slot={slot} />}
        <StageSelect slot={slot} set={set} />
        {onDelete && (
          <IconBtn title="Eliminar slot" color="var(--brand)" bg="var(--brand-soft)" border="rgba(226,75,74,0.35)"
            path={["M4 7h16", "M10 11v6M14 11v6", "M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13", "M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"]}
            onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar el slot ${formatNum(slot.num)}? No se puede deshacer.`)) onDelete(slot.id); }} />
        )}
      </div>

      {/* Cuerpo expandido */}
      {slot.open && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {inCamp && !isFb && <CampaignPanel slot={slot} set={set} />}
          {isFb && <FeedbackPanel slot={slot} set={set} />}
          {(slot.stage === "film" || slot.stage === "edit") && <ProductionPanel slot={slot} set={set} catalogs={catalogs} />}
          {isFb && (
            <button type="button" onClick={() => set({ detail: !slot.detail })}
              style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--ink-3)", background: "transparent", border: "1px solid var(--line)", borderRadius: 10, padding: "7px 12px", cursor: "pointer" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" style={{ transform: slot.detail ? "rotate(90deg)" : "none", transition: "transform .15s" }}><path d="M9 6l6 6-6 6" /></svg>
              {slot.detail ? "Ocultar brief" : "Ver brief completo"}
            </button>
          )}
          {showDetail && <MetaRow slot={slot} set={set} catalogs={catalogs} products={products} puedeDefinir={puedeDefinir} />}
          {showDetail && (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <LinkField label="Referencia" value={slot.ref} onChange={(v) => set({ ref: v })} icon="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
              <LinkField label="Loom / guía" value={slot.loom} onChange={(v) => set({ loom: v })} icon="M15 10l5-3v10l-5-3M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            </div>
          )}
          {showDetail && <ReferencesBlock slot={slot} bank={bank} onPick={onPickBankRef} onOpenRef={onOpenRef} onRemoveRef={onRemoveRef} onGenerateScript={onGenerateScript} />}

          {showDetail && (isVid ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={LABEL}>Guion</span>
                {/* Con referentes pegados, la acción vive en cada tarjeta (un
                    referente = un molde). Este botón queda solo como salida para
                    los slots sin referente, que si no se quedarían sin generar. */}
                {(slot.refs || []).length === 0 && onGenerateScript && (
                  <button type="button" onClick={() => onGenerateScript(slot)}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 10, padding: "7px 12px", cursor: "pointer" }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></svg>
                    Generar guion
                  </button>
                )}
              </div>
              <ScriptEditor value={slot.script} onChange={(html) => set({ script: html })} />
            </div>
          ) : (
            /* El estático no lleva guion: lleva la imagen que hay que hacer y la
               indicación de qué respetar. Es su equivalente del editor de texto. */
            <>
              <ImagenesEstatico slot={slot} set={set} />
            </>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La nota del contenido, como casilla en la fila.
 *
 * Nace apagada: si el contenido no tiene nota, es apenas un icono gris. Con nota, se
 * vuelve una casilla ámbar con el texto, al lado de TOFU y de la etapa — que es donde ya
 * está mirando quien recorre el board.
 *
 * El editor es un diálogo centrado y no un desplegable pegado al botón. Lo intenté así
 * primero y se recortaba contra los bordes de la fila: la fila tiene su propio recorte y
 * un panel que le cuelga sale cortado o tapa la fila de arriba. Centrado no se puede
 * romper, y además es el mismo gesto que ya tiene la nota en tanda.
 */
function NotaChip({ slot, set }) {
  const [abierto, setAbierto] = useState(false);
  const hay = (slot.notas || "").trim();

  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title={hay ? slot.notas : "Agregar una nota"}
        style={{
          flex: "none", display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 200, cursor: "pointer",
          fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, lineHeight: 1.2,
          color: hay ? "var(--amber)" : "var(--ink-4)",
          background: hay ? TINT.amber : "transparent",
          border: `1px solid ${hay ? "rgba(240,169,59,.3)" : "transparent"}`,
          borderRadius: 999, padding: hay ? "4px 10px" : "4px 5px",
        }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        </svg>
        {hay && (
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {slot.notas}
          </span>
        )}
      </button>

      {abierto && (
        <NotaDialogo
          valor={slot.notas || ""}
          onCerrar={() => setAbierto(false)}
          onGuardar={(v) => { set({ notas: v }); setAbierto(false); }} />
      )}
    </>
  );
}

function NotaDialogo({ valor, onCerrar, onGuardar }) {
  const [texto, setTexto] = useState(valor);
  const hay = valor.trim();
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center",
        background: "rgba(9,16,30,.62)", backdropFilter: "blur(3px)", padding: 20 }}>
      <div style={{ width: "min(420px, 100%)", background: "var(--surface-solid)", border: "1px solid var(--line)",
        borderRadius: 18, padding: 20, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Nota</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 3 }}>
          Se ve en la fila sin abrir el contenido.
        </div>
        <textarea
          autoFocus value={texto} rows={3}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter guarda, Shift+Enter hace salto. Escape sale sin tocar nada: una nota
            // escrita por error no debería quedar guardada por inercia.
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onGuardar(texto.trim()); }
            if (e.key === "Escape") { e.preventDefault(); onCerrar(); }
          }}
          placeholder="La UGC no ha grabado · esperando producto · reasignado…"
          style={{ width: "100%", marginTop: 13, fontFamily: DS.font, fontSize: 13, lineHeight: 1.5,
            color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)",
            borderRadius: 12, padding: "10px 12px", outline: "none", resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 13 }}>
          {hay ? (
            <button type="button" onClick={() => onGuardar("")}
              style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--brand)",
                background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              Quitar la nota
            </button>
          ) : <span />}
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onCerrar}
              style={{ fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)",
                background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="button" onClick={() => onGuardar(texto.trim())}
              style={{ fontFamily: DS.font, fontSize: 12.5, fontWeight: 700, color: "#FFFFFF",
                background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>
              Guardar
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
