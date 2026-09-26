import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { toastSuccess, toastError } from "../../lib/toast.js";
import { NICHES_LIST, questionsForNiche } from "../../lib/niches.js";
import { NIVELES } from "../../../api/_lib/sofisticacion.js";
import { uploadDoc } from "../../despliegue/storage.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { FUNNEL_STAGES, STAGES, STAGE_META, buildCreativeName, formatNum } from "./pipelineConstants.js";
import { createBriefShareLink, listBriefShareLinks, renameBriefShareLink, setBriefShareLinkActive, countSlotsByBrief } from "./data/pipelineDb.js";
import { haceCuanto, contenidosTexto } from "./papeleraTexto.js";

const LABEL = { fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)" };

// Overlay centrado reutilizable (cierra con click afuera / Escape).
function Overlay({ onClose, width, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,8,14,0.62)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 20px", fontFamily: DS.font, overflow: "auto" }}>
      <div className="glass" style={{ width: `min(${width}px, 96vw)`, borderRadius: 22, background: "var(--surface-solid)", padding: 26, boxShadow: "var(--shadow-lg)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Modal Nuevo brief ────────────────────────────────────────────────────────
// Sirve para DOS cosas con la misma pantalla: crear un brief planeando sus
// contenidos, y volver a esa planeación para sumarle más a un brief que ya
// existe. La única diferencia real es que al agregar no hay nombre ni
// responsable que elegir —el brief ya los tiene—, así que esos campos se
// esconden y cambia el botón.
//
// Antes, para sumar diez contenidos había que apretar "+ Slot en blanco" diez
// veces y después elegirle el concepto a cada uno a mano.
export function NewBriefModal({ companyName, nextN, owners, bank, onCreate, onClose, modo = "crear", briefName = "" }) {
  const agregando = modo === "agregar";
  const [name, setName] = useState(`Brief ${nextN}`);
  const [owner, setOwner] = useState(owners[0] || "");
  const [plan, setPlan] = useState({});        // { conceptId: cantidad } (usa el formato REAL)
  const [openCard, setOpenCard] = useState(null);  // concepto expandido (ver más detalle)
  const [extras, setExtras] = useState([]);    // [{ id, name, tipo, count }]
  const today = shortToday();

  const totals = useMemo(() => {
    let v = 0, e = 0;
    for (const [id, count] of Object.entries(plan)) {
      const c = bank.find((x) => x.id === id);
      if ((c?.tipo || "video") === "estatico") e += count; else v += count;
    }
    for (const ex of extras) { if (ex.tipo === "estatico") e += ex.count || 0; else v += ex.count || 0; }
    return { v, e };
  }, [plan, extras, bank]);

  const setCount = (id, delta) => setPlan((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + delta) }));
  const extraSeq = useRef(0);
  const addExtra = () => setExtras((x) => [...x, { id: `x${extraSeq.current++}`, name: "", tipo: "video", count: 1 }]);
  const setExtra = (id, patch) => setExtras((x) => x.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExtra = (id) => setExtras((x) => x.filter((e) => e.id !== id));

  const stepper = (val, dec, inc) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" onClick={dec} style={roundBtn}>−</button>
      <span className="mono" style={{ width: 20, textAlign: "center", fontSize: 14, fontWeight: 500, color: val ? "var(--ink)" : "var(--ink-4)" }}>{val}</span>
      <button type="button" onClick={inc} style={roundBtn}>+</button>
    </div>
  );

  // Tarjeta de concepto (colmena), SIN miniaturas. Click = ver más detalle
  // (descripción completa). El stepper no propaga el click.
  const conceptCard = (c, accent) => {
    const count = plan[c.id] || 0;
    const isVid = (c.tipo || "video") !== "estatico";
    const open = openCard === c.id;
    return (
      <div key={c.id} onClick={() => setOpenCard(open ? null : c.id)}
        style={{ cursor: "pointer", borderRadius: 12, border: `1px solid ${count ? accent : "var(--line)"}`, background: count ? "var(--sel-soft)" : "var(--surface)", boxShadow: count ? "var(--sel-rim)" : "none", padding: "11px 12px", display: "flex", flexDirection: "column", gap: 7, transition: "box-shadow .12s, border-color .12s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "3px 9px", color: isVid ? "var(--neon)" : "var(--purple)", background: isVid ? "rgba(95,222,240,.14)" : "rgba(155,123,240,.16)" }}>{isVid ? "Video" : "Estático"}</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-4)" }}>{c.refs} ref</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", color: DS.textPrimary, lineHeight: 1.25 }}>{c.name}</div>
        {c.idea && (
          <div style={{ fontSize: 11, lineHeight: 1.4, color: "var(--ink-3)", ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{c.idea}</div>
        )}
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 4 }}>
          <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{open ? "menos" : "ver más"}</span>
          {stepper(count, () => setCount(c.id, -1), () => setCount(c.id, +1))}
        </div>
      </div>
    );
  };

  // Tinte de fondo suave por embudo (para diferenciar claramente TOFU/MOFU/BOFU).
  const STAGE_TINT = { tofu: "rgba(95,222,240,.06)", mofu: "rgba(155,123,240,.07)", bofu: "rgba(240,169,59,.07)" };

  return (
    <Overlay onClose={onClose} width={920}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--neon)", background: "rgba(95,222,240,.13)", borderRadius: 8, padding: "4px 10px" }}>
            {agregando ? `${briefName} · sumar contenidos` : `Brief ${nextN} · ${companyName}`}
          </span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 9, cursor: "pointer", background: "var(--chip)", border: "1px solid var(--line)", color: DS.textSecondary, display: "grid", placeItems: "center" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {!agregando && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 170px", gap: 12 }}>
          <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} /></Field>
          <Field label="Creación"><div style={{ ...fieldInput, color: "var(--ink-2)" }}>{today}</div></Field>
          <Field label="Responsable">
            <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ ...fieldInput, cursor: "pointer" }}>
              {owners.length === 0 && <option value="">—</option>}
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        )}

        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{agregando ? "Se suman:" : "Entregas planeadas:"} <b style={{ color: "var(--ink)" }}>{totals.v} video</b> · <b style={{ color: "var(--ink)" }}>{totals.e} estático</b></div>

        {/* Planear creativos — grilla tipo tablero, agrupada por embudo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: DS.textPrimary }}>Planear creativos <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-4)" }}>· elegí del despliegue de la empresa</span></span>
          {bank.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Esta empresa todavía no tiene creativos en su despliegue. Podés agregar extras abajo.</div>}
          {FUNNEL_STAGES.map((fs) => {
            const concepts = bank.filter((c) => c.stage === fs.key);
            if (!concepts.length) return null;
            return (
              <div key={fs.key} style={{ borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: STAGE_TINT[fs.key], borderLeft: `3px solid ${fs.color}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: fs.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", color: fs.color }}>{fs.label}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{fs.desc}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>{concepts.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, padding: 12 }}>
                  {concepts.map((c) => conceptCard(c, fs.color))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Extras — formatos/contenidos a mano, fuera del despliegue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Extras</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>algo nuevo para probar, fuera del despliegue</span>
            <button type="button" onClick={addExtra}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 9, padding: "6px 11px", cursor: "pointer" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Agregar extra
            </button>
          </div>
          {extras.map((ex) => (
            <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <input value={ex.name} placeholder="Nombre / idea del extra…" onChange={(e) => setExtra(ex.id, { name: e.target.value })}
                style={{ flex: "1 1 200px", minWidth: 0, border: "none", background: "transparent", outline: "none", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: ex.name ? "var(--ink)" : "var(--ink-4)" }} />
              <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 9, background: "var(--chip)", border: "1px solid var(--line)" }}>
                {[["video", "Video"], ["estatico", "Estático"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setExtra(ex.id, { tipo: k })}
                    style={{ fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 7, cursor: "pointer", border: "none",
                      color: ex.tipo === k ? "var(--sel)" : "var(--ink-3)", background: ex.tipo === k ? "var(--surface)" : "transparent" }}>{l}</button>
                ))}
              </div>
              {stepper(ex.count, () => setExtra(ex.id, { count: Math.max(0, ex.count - 1) }), () => setExtra(ex.id, { count: ex.count + 1 }))}
              <button type="button" onClick={() => removeExtra(ex.id)} title="Quitar"
                style={{ width: 26, height: 26, borderRadius: 7, cursor: "pointer", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)", color: "var(--brand)", display: "grid", placeItems: "center" }}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="button" disabled={agregando && totals.v + totals.e === 0}
            onClick={() => onCreate({ n: name.trim() || `Brief ${nextN}`, created: today, owner, plan, extras: extras.filter((e) => (e.count || 0) > 0) })}
            style={{ ...btnConfirm, ...(agregando && totals.v + totals.e === 0 ? { opacity: 0.45, cursor: "default" } : null) }}>
            {agregando
              ? (totals.v + totals.e ? `Agregar ${totals.v + totals.e} contenidos` : "Elegí cuántos")
              : "Crear brief"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Modal Configurar (POR PRODUCTO) ─────────────────────────────────────────
// Fuente única = company_voice_profile.products. Cada producto: info (plantilla
// por nicho + archivo), estrategia (ángulos/objeciones/conciencia) y creadores.
const TP_META = [
  { key: "angles", label: "Ángulos de venta", color: "var(--green)", hint: "por qué SÍ compran" },
  { key: "objections", label: "Objeciones", color: "var(--brand)", hint: "por qué NO compran" },
  { key: "awareness", label: "Conciencia", color: "var(--sel)", hint: "lo que no saben y, si supieran, comprarían" },
];
const EMPTY_TP = { angles: [], objections: [], awareness: [] };

export function ConfigModal({ products, niche, onAddProduct, onUpdateProduct, onRemoveProduct, onSetNiche, sofisticacion, onSetSofisticacion, onClose }) {
  const [sel, setSel] = useState(null);
  const [newName, setNewName] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");   // paso visible del pipeline de subida
  const [tp, setTp] = useState(EMPTY_TP);
  const [creators, setCreators] = useState([]);
  const [neverSay, setNeverSay] = useState("");

  useEffect(() => { if (!sel && products.length) setSel(products[0].id); }, [products, sel]);
  const p = products.find((x) => x.id === sel) || null;
  // Sincronizar estrategia/creadores locales SOLO al cambiar de producto.
  useEffect(() => {
    setTp(p?.touchpoints ? { ...EMPTY_TP, ...p.touchpoints } : EMPTY_TP);
    setCreators(p?.creators || []);
    setNeverSay(p?.never_say || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const commit = (patch) => p && onUpdateProduct(p.id, patch);
  const questions = niche ? questionsForNiche(niche) : [];

  const addProd = () => { const id = onAddProduct(newName); if (id) { setSel(id); setNewName(""); } };
  // Subir info del producto: archivo → texto → RESUMEN.
  //
  // Antes solo se extraía texto de .md/.txt (un PDF subía y aportaba cero) y se
  // guardaba el crudo, hasta 40k chars, dentro del jsonb del producto — que se
  // lee entero en cada carga del pipeline y después se recortaba a ciegas al
  // armar el prompt. Ahora el documento se destila UNA vez acá (mismo endpoint
  // que usa el Guionista) y lo que viaja a cada generación es el resumen.
  // El archivo original queda en info_file_url por si hay que reprocesarlo.
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploading(true);
    try {
      setUploadStep("Subiendo archivo…");
      const url = await uploadDoc(f);
      const patch = { info_file_url: url, info_file_name: f.name };

      try {
        setUploadStep("Leyendo el documento…");
        const { extractFileText } = await import("../../workspace/guiones/extractFileText.js");
        const text = await extractFileText(f);

        setUploadStep("Resumiendo lo esencial…");
        const resp = await fetch("/api/extract-knowledge", {
          method: "POST",
          headers: await buildApiHeaders(),
          body: JSON.stringify({ content: text.slice(0, 120000), category: "producto", isCompanyWorkspace: true }),
        });
        const data = await resp.json();
        if (resp.ok && data.extracted?.trim()) {
          patch.info_brief = data.extracted.trim();
          patch.info_doc_text = null;          // el crudo viejo ya no hace falta
          toastSuccess("Documento resumido y guardado");
        } else {
          // Sin resumen igual guardamos algo utilizable, recortado.
          patch.info_doc_text = text.slice(0, 12000);
          toastSuccess("Archivo subido (no se pudo resumir, se guardó recortado)");
        }
      } catch (err) {
        toastError(err?.message || "No se pudo leer el archivo — se guardó solo el enlace");
      }

      commit(patch);
    } catch { toastError("No se pudo subir el archivo"); }
    finally { setUploading(false); setUploadStep(""); }
  };

  const persistTp = (next) => { setTp(next); commit({ touchpoints: next }); };
  const persistCreators = (next) => { setCreators(next); commit({ creators: next }); };

  return (
    <Overlay onClose={onClose} width={900}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: DS.textPrimary }}>Configurar productos</h2>
          <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>info, estrategia y creadores — por producto</span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 9, cursor: "pointer", background: "var(--chip)", border: "1px solid var(--line)", color: DS.textSecondary, display: "grid", placeItems: "center" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
          {/* Columna izquierda: productos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={LABEL}>Productos</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {products.map((x) => (
                <button key={x.id} type="button" onClick={() => setSel(x.id)}
                  style={{ textAlign: "left", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, padding: "8px 11px", borderRadius: 10, cursor: "pointer",
                    color: sel === x.id ? "var(--sel)" : DS.textSecondary, background: sel === x.id ? "var(--sel-soft)" : "var(--surface-2)", border: `1px solid ${sel === x.id ? "rgba(88,166,255,0.34)" : "var(--line)"}` }}>{x.name || "Sin nombre"}</button>
              ))}
              {products.length === 0 && <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>Sin productos aún.</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input value={newName} placeholder="Nuevo producto" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addProd(); }} style={{ ...fieldInput, flex: 1 }} />
              <button type="button" onClick={addProd} style={{ ...btnGhost, padding: "8px 12px", fontSize: 12.5 }}>+</button>
            </div>
          </div>

          {/* Columna derecha: detalle del producto */}
          {p ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input key={`name-${sel}`} defaultValue={p.name} placeholder="Nombre del producto" onBlur={(e) => e.target.value.trim() && commit({ name: e.target.value.trim() })} style={{ ...fieldInput, flex: 1, fontWeight: 700 }} />
                <button type="button" onClick={() => { if (confirm("¿Eliminar este producto?")) { onRemoveProduct(p.id); setSel(null); } }} title="Eliminar producto"
                  style={{ width: 34, height: 34, borderRadius: 9, cursor: "pointer", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)", color: "var(--brand)", display: "grid", placeItems: "center", flex: "none" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13" /></svg>
                </button>
              </div>

              {/* Sofisticación del mercado — la otra mitad del mapa.
                  El nicho dice QUÉ vende; esto, qué tan cansado está el mercado
                  de oír la misma promesa. De acá sale el REGISTRO del guion, y
                  por eso viaja al prompt del Guionista.
                  Sin elegir no manda nada: escribir en el nivel equivocado es
                  peor que escribir sin la regla. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                <span style={LABEL}>
                  Sofisticación del mercado <span style={{ textTransform: "none", fontWeight: 500 }}>— cuántas veces ya oyó esta promesa</span>
                </span>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const activo = Number(sofisticacion) === n;
                    return (
                      <button key={n} type="button"
                        onClick={() => onSetSofisticacion?.(activo ? null : n)}
                        title={NIVELES[n].mercado}
                        style={{
                          fontFamily: DS.font, fontSize: 12, fontWeight: 600, padding: "6px 12px",
                          borderRadius: 999, cursor: "pointer",
                          color: activo ? "#fff" : "var(--ink-2)",
                          background: activo ? "var(--sel)" : "var(--chip)",
                          border: `1px solid ${activo ? "var(--sel)" : "var(--line)"}`,
                        }}>
                        {n} · {NIVELES[n].nombre}
                      </button>
                    );
                  })}
                </div>
                {Number(sofisticacion) >= 1 && (
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-3)", background: "var(--chip)", borderRadius: 10, padding: "9px 11px" }}>
                    <div><b style={{ color: "var(--ink)" }}>Piensa quien te ve:</b> “{NIVELES[Number(sofisticacion)].piensa}”</div>
                    <div style={{ marginTop: 4 }}><b style={{ color: "var(--ink)" }}>El guion va a:</b> {NIVELES[Number(sofisticacion)].hace}</div>
                  </div>
                )}
              </div>

              {/* Nicho (plantilla de info) */}
              {!niche ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={LABEL}>Nicho del negocio <span style={{ textTransform: "none", fontWeight: 500 }}>— define la plantilla de info</span></span>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {NICHES_LIST.map((n) => (
                      <button key={n.key} type="button" onClick={() => onSetNiche(n.key)}
                        style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer", color: "var(--ink-2)", background: "var(--chip)", border: "1px solid var(--line)" }}>{n.label}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={LABEL}>Info del producto</span>
                    <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{NICHES_LIST.find((n) => n.key === niche)?.label} · </span>
                    <button type="button" onClick={() => onSetNiche("")} style={{ fontSize: 11, color: "var(--sel)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: DS.font }}>cambiar nicho</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {questions.map((q) => (
                      <label key={`${sel}-${q.key}`} style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: q.multiline ? "1 / -1" : "auto" }}>
                        <span style={LABEL}>{q.label}</span>
                        {q.multiline
                          ? <textarea defaultValue={p[q.key] || ""} placeholder={q.placeholder} rows={2} onBlur={(e) => commit({ [q.key]: e.target.value })} style={{ ...fieldInput, resize: "vertical", lineHeight: 1.4 }} />
                          : <input defaultValue={p[q.key] || ""} placeholder={q.placeholder} onBlur={(e) => commit({ [q.key]: e.target.value })} style={fieldInput} />}
                      </label>
                    ))}
                  </div>
                  {/* Archivo de info completa */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ ...btnGhost, padding: "8px 14px", fontSize: 12.5, cursor: uploading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
                      {uploading ? (uploadStep || "Subiendo…") : "Subir archivo de info"}
                      <input type="file" onChange={onFile} style={{ display: "none" }} />
                    </label>
                    {p.info_file_url && <a href={p.info_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--sel)", fontWeight: 600 }}>Ver archivo ↗</a>}
                  </div>
                </div>
              )}

              {/* Estrategia por producto */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {TP_META.map((m) => {
                  const items = tp[m.key] || [];
                  return (
                    <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: DS.textPrimary }}>{m.label}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{m.hint}</span>
                        <button type="button" onClick={() => persistTp({ ...tp, [m.key]: [...items, { title: "", desc: "" }] })}
                          style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>+ agregar</button>
                      </div>
                      {items.map((it, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input value={it.title} placeholder="Título"
                            onChange={(e) => setTp((t) => ({ ...t, [m.key]: t[m.key].map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))}
                            onBlur={() => commit({ touchpoints: tp })}
                            style={{ ...fieldInput, flex: "1 1 160px", fontWeight: 600 }} />
                          <input value={it.desc || ""} placeholder="Descripción (opcional)"
                            onChange={(e) => setTp((t) => ({ ...t, [m.key]: t[m.key].map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) }))}
                            onBlur={() => commit({ touchpoints: tp })}
                            style={{ ...fieldInput, flex: "2 1 220px", color: "var(--ink-2)" }} />
                          <button type="button" onClick={() => persistTp({ ...tp, [m.key]: items.filter((_, j) => j !== i) })} title="Quitar"
                            style={{ width: 28, height: 28, borderRadius: 7, cursor: "pointer", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.35)", color: "var(--brand)", display: "grid", placeItems: "center", flex: "none" }}>
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Creadores del producto */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={LABEL}>Creadores <span style={{ textTransform: "none", fontWeight: 500 }}>— UGC / talentos de este producto</span></span>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={newCreator} placeholder="Nuevo creador" onChange={(e) => setNewCreator(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newCreator.trim()) { persistCreators([...creators, newCreator.trim()]); setNewCreator(""); } }} style={{ ...fieldInput, flex: 1 }} />
                  <button type="button" onClick={() => { if (newCreator.trim()) { persistCreators([...creators, newCreator.trim()]); setNewCreator(""); } }} style={{ ...btnGhost, padding: "8px 14px", fontSize: 12.5 }}>Agregar</button>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {creators.map((c, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink-2)", background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 6px 5px 11px" }}>
                      {c}
                      <button type="button" onClick={() => persistCreators(creators.filter((_, j) => j !== i))} title="Quitar" style={{ width: 18, height: 18, borderRadius: 999, cursor: "pointer", border: "none", background: "transparent", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </span>
                  ))}
                  {creators.length === 0 && <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>Sin creadores aún.</span>}
                </div>
              </div>

              {/* Temas prohibidos — se suman a la regla general de la empresa y
                  entran al prompt como bloque innegociable. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={LABEL}>Temas prohibidos <span style={{ textTransform: "none", fontWeight: 500 }}>— nunca se mencionan en los guiones</span></span>
                <textarea
                  value={neverSay} rows={3}
                  placeholder={"Uno por línea. Ej:\nNo mencionar los ingredientes ni sus nombres químicos\nNo mencionar el pago contra entrega"}
                  onChange={(e) => setNeverSay(e.target.value)}
                  onBlur={() => commit({ never_say: neverSay })}
                  style={{ fontFamily: DS.font, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 12px", outline: "none", resize: "vertical" }}
                />
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  Aplica a este producto. Lo transversal a toda la empresa se configura en el Guionista.
                </span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "40px 0", textAlign: "center" }}>Creá un producto para empezar.</div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ── Papelera ─────────────────────────────────────────────────────────────────
// Los briefs borrados, con lo necesario para reconocer cuál es cuál: casi todos
// se llaman "Brief 1", así que el nombre solo no alcanza. Por eso la fila lleva
// el responsable, la fecha de creación, cuántos contenidos tiene y cuándo se
// borró.
//
// El borrado definitivo se confirma en la misma fila y no en otro modal encima.
// Un modal sobre otro tapa justo lo que hay que mirar para decidir.
export function PapeleraModal({ briefs, onRestore, onPurge, onClose }) {
  const [conteos, setConteos] = useState(null);      // { briefId: n } — null = cargando
  const [confirmando, setConfirmando] = useState(null);
  const [ahora] = useState(() => Date.now());

  const ids = useMemo(() => briefs.map((b) => b.id), [briefs]);
  useEffect(() => {
    let vivo = true;
    countSlotsByBrief(ids).then((c) => { if (vivo) setConteos(c); }).catch(() => { if (vivo) setConteos({}); });
    return () => { vivo = false; };
  }, [ids]);

  // Lo último que se borró va arriba: es lo que casi siempre se viene a buscar.
  const orden = useMemo(
    () => [...briefs].sort((a, b) => String(b.deleted_at || "").localeCompare(String(a.deleted_at || ""))),
    [briefs],
  );

  return (
    <Overlay onClose={onClose} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.024em", margin: 0, color: DS.textPrimary }}>Papelera</h2>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-3)", margin: "6px 0 0" }}>
            Los briefs que borraste siguen enteros acá, con sus guiones y referentes. No se vencen ni se limpian solos.
          </p>
        </div>

        {!orden.length && (
          <div style={{ padding: "26px 0", textAlign: "center", fontSize: 13, color: DS.textHint }}>
            No hay nada en la papelera.
          </div>
        )}

        {orden.map((b) => {
          const n = conteos ? (conteos[b.id] || 0) : null;
          const esteConfirma = confirmando === b.id;
          return (
            <div key={b.id} className="glass"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--chip)" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.n}</div>
                <div className="mono" style={{ fontSize: 11, color: DS.textHint, marginTop: 3 }}>
                  {[b.created && `Creado ${b.created}`, b.owner, contenidosTexto(n), `borrado ${haceCuanto(b.deleted_at, ahora)}`].filter(Boolean).join(" · ")}
                </div>
              </div>

              {esteConfirma ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--danger, #e5484d)", fontWeight: 600 }}>Esto sí es para siempre</span>
                  <button type="button" onClick={() => setConfirmando(null)} style={{ ...btnGhost, padding: "7px 12px" }}>No</button>
                  <button type="button" onClick={() => { onPurge(b.id); setConfirmando(null); }}
                    style={{ ...btnConfirm, padding: "8px 14px", background: "var(--danger, #e5484d)", color: "#fff" }}>Borrar</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => setConfirmando(b.id)} title="Sacarlo de la base para siempre"
                    style={{ ...btnGhost, padding: "7px 12px", color: DS.textHint }}>Borrar definitivamente</button>
                  <button type="button" onClick={() => onRestore(b.id)} style={{ ...btnConfirm, padding: "8px 16px" }}>Recuperar</button>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", marginTop: 2 }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost, marginLeft: "auto" }}>Cerrar</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Confirmación destructiva ─────────────────────────────────────────────────
// El `window.confirm` del navegador funciona, pero es una caja gris del sistema
// operativo en medio de un portal que no se parece en nada a eso. Y bloquea el
// hilo, así que ni siquiera se puede animar la salida.
export function ConfirmModal({ titulo, detalle, confirmLabel = "Eliminar", onConfirm, onClose }) {
  return (
    <Overlay onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: DS.textPrimary }}>{titulo}</h2>
        {detalle && <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-3)", margin: 0 }}>{detalle}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost, marginLeft: "auto" }}>Cancelar</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }}
            style={{ ...btnConfirm, background: "var(--brand)", color: "#fff" }}>{confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Sheet Compartir guiones ──────────────────────────────────────────────────
// Antes esto abría un modal para imprimir, y el PDF salía cortado: el overlay es
// `position: fixed` y los navegadores solo imprimen su primer viewport. Ahora
// genera un link público (`/brief/<token>`) que la creadora abre sin cuenta —y
// que sí se imprime bien, porque es una página de verdad.
export function ExportSheet({ slots, catalogs, companyId, brief, briefs = [], onClose }) {
  const [prod, setProd] = useState(""); const [ang, setAng] = useState("");
  const [con, setCon] = useState(""); const [cre, setCre] = useState("");
  const [niv, setNiv] = useState("");   // nivel de conciencia (tofu/mofu/bofu)
  // La etapa faltaba, y era el filtro principal: el caso real de Nath no es "mandale
  // todo el brief a Manuela", es "mandale a las UGC lo que falta por grabar del Brief 4".
  // Sin esto había que ir tildando a mano cuáles estaban en To Film.
  // Brief y etapa son los filtros PRINCIPALES y admiten varios.
  //
  // El caso real de Nath no es "mandale todo a Manuela": es "mandale a las UGC lo que
  // falta por grabar del Brief 4 y del 5". Antes había que generar un link por brief y
  // por etapa, y armar la selección tildando a mano.
  //
  // Vacío = todos. Es lo mismo que hacían los otros filtros y evita el estado raro de
  // "no elegí ninguno" mostrando cero guiones.
  const [briefsSel, setBriefsSel] = useState(() => (brief?.id ? [brief.id] : []));
  const [etapas, setEtapas] = useState([]);
  const [sel, setSel] = useState([]);
  const [link, setLink] = useState(null);      // { token, url } recién creado
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("nuevo");     // 'nuevo' | 'links'
  const [links, setLinks] = useState(null);    // null = sin cargar
  // Al generar se pide el nombre. El prefijo es el brief y no se toca: así todo
  // link queda atado a su brief y en la lista se sabe de dónde salió. Lo que se
  // escribe es lo que lo distingue de los otros — "Brief 1 - Manuela".
  // Desde la vista de un brief el prefijo es ese brief. Desde Etapas no hay
  // brief activo, así que se deduce de lo elegido: si todos los guiones salen
  // del mismo brief, ese es el nombre. Mezclados, queda genérico.
  const prefijo = useMemo(() => {
    if (briefsSel.length === 1) {
      const b = briefs.find((x) => x.id === briefsSel[0]);
      if (b?.n) return b.n;
    }
    if (briefsSel.length > 1) return "Guiones";
    if (brief?.n) return brief.n;
    const ids = new Set(slots.filter((s) => sel.includes(s.id)).map((s) => s.brief));
    if (ids.size === 1) {
      const b = briefs.find((x) => x.id === [...ids][0]);
      if (b?.n) return b.n;
    }
    return "Guiones";
  }, [brief, briefs, slots, sel, briefsSel]);
  const [naming, setNaming] = useState(false);
  const [sufijo, setSufijo] = useState("");
  const nombre = sufijo.trim() ? `${prefijo} - ${sufijo.trim()}` : prefijo;

  // Los links que ya circulan. Se cargan al abrir la pestaña, no antes: la
  // mayoría de las veces se entra acá a generar uno nuevo.
  const cargarLinks = async () => {
    try { setLinks(await listBriefShareLinks(companyId)); }
    catch (e) { toastError(e.message || "No se pudieron cargar los links"); setLinks([]); }
  };
  const verLinks = () => { setTab("links"); if (links === null) cargarLinks(); };

  const generar = async () => {
    setBusy(true);
    try {
      const res = await createBriefShareLink({
        companyId,
        briefId: brief?.id || null,
        briefName: nombre,
        slotIds: slots.filter((s) => s.tipo === "video" && sel.includes(s.id)).map((s) => s.id),
      });
      setLink(res);
      setNaming(false);
      setSufijo("");
      setLinks(null);   // la lista quedó vieja
      navigator.clipboard?.writeText(res.url).then(() => toastSuccess("Link copiado")).catch(() => {});
    } catch (e) {
      toastError(e.message || "No se pudo generar el link");
    } finally { setBusy(false); }
  };

  const cambiarEstado = async (token, active) => {
    setBusy(true);
    try {
      await setBriefShareLinkActive({ companyId, token, active });
      setLinks((ls) => (ls || []).map((l) => (l.token === token ? { ...l, active } : l)));
      if (link?.token === token && !active) setLink(null);
      toastSuccess(active ? "Link activado" : "Link desactivado");
    } catch (e) {
      toastError(e.message || "No se pudo cambiar el link");
    } finally { setBusy(false); }
  };

  const renombrar = async (token, name) => {
    const limpio = name.trim();
    if (!limpio) return;
    setLinks((ls) => (ls || []).map((l) => (l.token === token ? { ...l, brief: limpio } : l)));
    try { await renameBriefShareLink({ companyId, token, name: limpio }); }
    catch (e) { toastError(e.message || "No se pudo renombrar"); cargarLinks(); }
  };

  const copiar = (url) => navigator.clipboard?.writeText(url)
    .then(() => toastSuccess("Link copiado")).catch(() => toastError("No se pudo copiar"));

  // Solo videos: un estático no tiene guion que mandarle a nadie.
  const scripts = useMemo(() => slots.filter((s) => s.tipo === "video"
    && (!prod || s.producto === prod) && (!ang || s.angulo === ang) && (!con || s.concepto === con)
    && (!cre || s.creador === cre) && (!niv || s.nivel_conciencia === niv)
    && (!briefsSel.length || briefsSel.includes(s.brief))
    && (!etapas.length || etapas.includes(s.stage))),
    [slots, prod, ang, con, cre, niv, briefsSel, etapas]);

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const allSel = scripts.length > 0 && scripts.every((s) => sel.includes(s.id));
  const toggleAll = () => setSel(allSel ? [] : scripts.map((s) => s.id));

  // `opts` admite strings o pares {value,label} — el nivel guarda 'mofu' y
  // muestra "MOFU".
  const filt = (label, value, set, opts) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={LABEL}>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} style={{ ...fieldInput, cursor: "pointer" }}>
        <option value="">Todos</option>
        {opts.map((o) => (typeof o === "string" ? o : o.value)).map((v, i) => (
          <option key={v} value={v}>{typeof opts[i] === "string" ? v : opts[i].label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,8,14,0.62)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end", fontFamily: DS.font }}>
      <div className="glass" style={{ width: "min(560px, 96vw)", height: "100%", background: "var(--surface-solid)", padding: 24, display: "flex", flexDirection: "column", gap: 16, overflow: "auto", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: DS.textPrimary }}>Compartir guiones</h2>
            <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>Un link que la creadora abre sin cuenta.</div>
          </div>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 9, cursor: "pointer", background: "var(--chip)", border: "1px solid var(--line)", color: DS.textSecondary, display: "grid", placeItems: "center" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {[["nuevo", "Nuevo link"], ["links", `Links creados${links?.length ? ` · ${links.length}` : ""}`]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => (k === "links" ? verLinks() : setTab("nuevo"))}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 9, cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600,
                border: "none", background: tab === k ? "var(--sel-soft)" : "transparent", color: tab === k ? "var(--sel)" : "var(--ink-3)" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "links" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
            {links === null && <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Cargando…</div>}
            {links?.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Todavía no compartiste ningún link.</div>}
            {(links || []).map((l) => (
              <div key={l.token} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "11px 13px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", opacity: l.active ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* El nombre se edita en el lugar. El token no cambia, así que
                      el link que ya mandaste sigue abriendo con el nombre nuevo. */}
                  <input value={l.brief} spellCheck={false} title="Cambiarle el nombre"
                    onChange={(e) => setLinks((ls) => ls.map((x) => (x.token === l.token ? { ...x, brief: e.target.value } : x)))}
                    onBlur={(e) => renombrar(l.token, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ flex: "0 1 auto", minWidth: 60, maxWidth: 210, fontFamily: DS.font, fontSize: 12.5, fontWeight: 700, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 7px", outline: "none" }} />
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{l.count} {l.count === 1 ? "guion" : "guiones"} · {fechaLink(l.at)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px",
                    color: l.active ? "var(--green)" : "var(--ink-3)", background: l.active ? "rgba(52,192,138,0.14)" : "var(--chip)" }}>
                    {l.active ? "Activo" : "Desactivado"}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", wordBreak: "break-all", lineHeight: 1.45 }}>{l.url}</div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => copiar(l.url)} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>Copiar</button>
                  <a href={l.url} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "6px 12px", fontSize: 12, textDecoration: "none", display: "inline-block" }}>Abrir</a>
                  <button type="button" disabled={busy} onClick={() => cambiarEstado(l.token, !l.active)}
                    style={{ ...btnGhost, padding: "6px 12px", fontSize: 12, marginLeft: "auto", color: l.active ? "var(--brand)" : "var(--green)" }}>
                    {l.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ya generado el link, la lista se retira: lo que se muestra abajo es el
            link de ESA selección, y seguir tocando checkboxes lo volvería mentira. */}
        {tab !== "nuevo" || link ? null : <>
        {/* Primero el brief, después la etapa. Es el orden en que se piensa el envío:
            «de qué entrega» y «qué falta de esa entrega». Los filtros finos van debajo
            porque casi nunca se usan. */}
        <Casillas titulo="Brief" opciones={briefs.map((b) => ({ value: b.id, label: b.n || b.name }))}
          elegidas={briefsSel} onCambiar={setBriefsSel} vacio="Todos los briefs" />
        <Casillas titulo="Etapa" opciones={STAGES.map((k) => ({ value: k, label: STAGE_META[k]?.label || k }))}
          elegidas={etapas} onCambiar={setEtapas} vacio="Todas las etapas" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {filt("Producto", prod, setProd, catalogs.productos)}
          {filt("Ángulo", ang, setAng, catalogs.angulos)}
          {filt("Concepto", con, setCon, catalogs.conceptos)}
          {filt("Creador", cre, setCre, catalogs.creadores)}
          {/* FUNNEL_STAGES es la misma escala del embudo: el nivel de conciencia no es otra lista, es esa. (`NIVELES` acá ya es la sofisticación de mercado.) */}
          {filt("Conciencia", niv, setNiv, FUNNEL_STAGES.map((n) => ({ value: n.key, label: n.label })))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={toggleAll} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>{allSel ? "Ninguno" : "Seleccionar todo"}</button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-4)" }}>{sel.length} de {scripts.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {scripts.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Sin guiones con estos filtros.</div>}
          {scripts.map((s) => {
            const on = sel.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left", fontFamily: DS.font,
                  background: on ? "var(--sel-soft)" : "var(--surface-2)", border: `1px solid ${on ? "rgba(88,166,255,0.34)" : "var(--line)"}` }}>
                <span style={{ width: 18, height: 18, flex: "none", borderRadius: 5, display: "grid", placeItems: "center", background: on ? "var(--sel)" : "transparent", border: `1.5px solid ${on ? "var(--sel)" : "var(--line-2)"}` }}>
                  {on && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--neon)", flex: "none" }}>{formatNum(s.num)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: buildCreativeName(s) ? "var(--ink)" : "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buildCreativeName(s) || "Sin nombre"}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{s.creador || "—"}</span>
              </button>
            );
          })}
        </div>
        </>}
        {/* Incluye TODO lo seleccionado (aunque el filtro actual lo oculte), no solo lo visible. */}
        {tab !== "nuevo" ? null : link ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--line)", marginTop: "auto" }}>
            <span style={LABEL}>Link listo · {sel.length} {sel.length === 1 ? "guion" : "guiones"}</span>
            <div className="mono" style={{ fontSize: 12, color: "var(--sel)", wordBreak: "break-all", lineHeight: 1.5 }}>{link.url}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => navigator.clipboard?.writeText(link.url).then(() => toastSuccess("Link copiado")).catch(() => toastError("No se pudo copiar"))}
                style={{ ...btnConfirm, padding: "9px 16px" }}>Copiar</button>
              <a href={link.url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none", display: "inline-block" }}>Abrir</a>
              <button type="button" onClick={() => cambiarEstado(link.token, false)} disabled={busy} style={{ ...btnGhost, marginLeft: "auto", color: "var(--brand)" }}>Desactivar</button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.5 }}>
              Si corriges un guion, el link ya muestra la corrección. Para sumar guiones nuevos, genera otro link.
            </div>
          </div>
        ) : (
          <button type="button" disabled={!sel.length || busy} onClick={() => setNaming(true)}
            style={{ ...btnConfirm, opacity: sel.length && !busy ? 1 : 0.5, cursor: sel.length && !busy ? "pointer" : "not-allowed" }}>
            {`Generar link (${sel.length})`}
          </button>
        )}
      </div>

      {naming && (
        <NameLinkModal prefijo={prefijo} sufijo={sufijo} setSufijo={setSufijo}
          count={sel.length} busy={busy} onGenerar={generar} onClose={() => setNaming(false)} />
      )}
    </div>
  );
}

// Ponerle nombre al link, justo antes de crearlo.
//
// El prefijo es el brief y está fijo: cada link queda atado al brief del que
// salió, así en la lista nunca hay dudas de a qué pertenece. Lo que se escribe
// es lo que lo distingue de los otros links del mismo brief.
function NameLinkModal({ prefijo, sufijo, setSufijo, count, busy, onGenerar, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <Overlay onClose={onClose} width={430}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: DS.textPrimary }}>Ponle nombre al link</h2>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>
            {count} {count === 1 ? "guion" : "guiones"} · es el título que ve la creadora.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "stretch", borderRadius: 11, border: "1px solid var(--line)", background: "var(--surface-2)", overflow: "hidden" }}>
          <span style={{ display: "flex", alignItems: "center", padding: "9px 4px 9px 12px", fontSize: 13, fontWeight: 700, color: "var(--ink-2)", background: "var(--chip)", whiteSpace: "nowrap" }}>
            {prefijo} -
          </span>
          <input ref={ref} value={sufijo} onChange={(e) => setSufijo(e.target.value)} maxLength={80}
            placeholder="Descripción" spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) onGenerar(); }}
            style={{ flex: 1, minWidth: 0, fontFamily: DS.font, fontSize: 13, fontWeight: 500, color: "var(--ink)", background: "transparent", border: "none", padding: "9px 12px", outline: "none" }} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost }}>Cancelar</button>
          <button type="button" disabled={busy} onClick={onGenerar}
            style={{ ...btnConfirm, marginLeft: "auto", opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "Generando…" : "Generar link"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={LABEL}>{label}</span>{children}</label>;
}
// "5 ago" / "5 ago 2025" si es de otro año.
function fechaLink(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const hoy = new Date();
  const base = `${d.getDate()} ${meses[d.getMonth()]}`;
  return d.getFullYear() === hoy.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function shortToday() {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const d = new Date();
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

const fieldInput = { width: "100%", fontFamily: DS.font, fontSize: 13, fontWeight: 500, color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "9px 12px", outline: "none", appearance: "none" };
const roundBtn = { width: 24, height: 24, borderRadius: 8, cursor: "pointer", background: "var(--chip)", border: "1px solid var(--line)", color: "var(--ink-2)", fontSize: 15, lineHeight: 1, display: "grid", placeItems: "center", fontFamily: DS.font };
const btnGhost = { fontFamily: DS.font, fontSize: 13, fontWeight: 600, color: DS.textSecondary, background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 11, padding: "9px 16px", cursor: "pointer" };
const btnConfirm = { fontFamily: DS.font, fontSize: 13, fontWeight: 700, color: "var(--bg)", background: "var(--ink)", border: "none", borderRadius: 11, padding: "10px 18px", cursor: "pointer" };

/**
 * Una fila de casillas para elegir varios.
 *
 * Los desplegables sirven para elegir uno. Brief y etapa se eligen de a varios —«lo que
 * falta por grabar del Brief 4 y del 5»— y con un desplegable eso son dos links, o
 * tildar a mano cincuenta guiones.
 *
 * Ninguna elegida significa TODAS, igual que los otros filtros. Es lo que evita el
 * estado sin salida de «no elegí nada» mostrando cero.
 */
function Casillas({ titulo, opciones, elegidas, onCambiar, vacio }) {
  const alternar = (v) => onCambiar(elegidas.includes(v) ? elegidas.filter((x) => x !== v) : [...elegidas, v]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-4)" }}>
          {titulo}
        </span>
        {elegidas.length > 0 && (
          <button type="button" onClick={() => onCambiar([])}
            style={{ fontFamily: DS.font, fontSize: 11, fontWeight: 600, color: "var(--sel)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            limpiar
          </button>
        )}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {!opciones.length && <span style={{ fontSize: 12, color: "var(--ink-4)" }}>—</span>}
        {opciones.map((o) => {
          const on = elegidas.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => alternar(o.value)}
              style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                color: on ? "#FFFFFF" : "var(--ink-2)",
                background: on ? "var(--sel)" : "var(--chip)",
                border: `1px solid ${on ? "var(--sel)" : "var(--line)"}`,
                borderRadius: 999, padding: "5px 12px" }}>
              {o.label}
            </button>
          );
        })}
      </div>
      {!elegidas.length && (
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{vacio}</span>
      )}
    </div>
  );
}
