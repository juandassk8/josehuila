import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { listSlotsForBoard } from "./pipeline_db.js";
import { extractStrategy } from "../lib/classifyRef.js";

// Estrategia de venta por empresa: 3 taxonomías de "puntos de contacto".
// El admin (canEdit) define título + descripción de cada uno; el cliente los ve.
// Cada punto muestra la COBERTURA: cuántos creativos (slots) lo atacan.
export const STRATEGY_SECTIONS = [
  { key: "angles",     label: "Ángulos de venta", emoji: "🎯", color: "#C9761F", hint: "Motivos, beneficios o dolores por los que te compran." },
  { key: "objections", label: "Objeciones",       emoji: "🛑", color: "#E24B4A", hint: "Motivos por los que NO compran — hay que derribarlos con contenido." },
  { key: "awareness",  label: "Conciencia",       emoji: "💡", color: "#3B8BD4", hint: "Cosas que la gente no sabe y, si las entendiera, te compraría más." },
];

const newId = () => "tp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Guía explicativa por defecto para clientes de DROPSHIPPING (venden muchos
// productos distintos, no una marca). En vez de puntos concretos, ven una guía
// de cómo pensar cada sección para CUALQUIER producto de su catálogo. Se
// pre-carga (editable) la primera vez que activan el modo "Guía".
export const DEFAULT_GUIDE = {
  angles: `Para quién y para qué. Son los motivos por los que te compran, y cada uno le habla a un público distinto.

1. ¿Para qué lo va a usar? Cada uso distinto del producto es un ángulo distinto. Un mismo producto puede servir para decorar, para regalar o para resolver un problema puntual.
2. ¿Quién lo compra? Los distintos tipos de persona que llegan al producto. No es lo mismo hablarle a alguien de 25 que a alguien de 50, aunque compren lo mismo.
3. ¿Qué dolor le resuelve? Cada dolor específico es un ángulo aparte. Si todos tus videos hablan del mismo dolor, le estás vendiendo a la misma tajada de público una y otra vez.
4. ¿Qué deseo le cumple? No todo es dolor: también hay gente que compra por antojo, por gusto o por darse un gusto. Ese es un ángulo que casi nadie trabaja.
5. ¿Para quién más sirve que no sea el obvio? El público secundario suele ser el que menos competencia tiene y el que más barato te sale conquistar.

Dónde sacarlos: los comentarios de los videos ganadores del nicho, las reseñas del producto en Amazon o Mercado Libre y las preguntas que ya te llegan por WhatsApp.
Regla: tienen que ser repetibles, para que siempre puedas atacar los mismos. Si un producto solo te da 2 ángulos, es un producto con techo bajo.`,
  objections: `Lo que le frena la compra. Son bloqueos reales, no dudas informativas.

1. ¿Qué es lo que más miedo le da al comprar esto por internet? El miedo típico de tu categoría: que llegue distinto a la foto, que no sirva, que sea de mala calidad.
2. ¿Qué le pasó antes con un producto parecido? Si ya lo intentó y le fue mal, esa mala experiencia es la objeción más grande que tienes que derribar.
3. ¿Por qué creería que el producto no le va a funcionar a él? La gente asume que el problema es ella: "a mí se me mueren", "yo ya probé de todo". Ahí hay una objeción escondida.
4. ¿Por qué creería que no es para él? Falta de espacio, de tiempo, de conocimiento. Son objeciones que descartan solo a un montón de compradores.
5. ¿Qué le hace pensar que está caro? No es el precio, es que no entiende qué recibe ni cuánto le rinde.

Dónde sacarlas: los comentarios negativos de tu competencia, las preguntas que más se repiten en tu WhatsApp y los motivos por los que se te cancelan los pedidos.
Ojo: si es "¿en cuánto llega el envío?" o "¿hay garantía?", eso no es una objeción — es un punto de conciencia.`,
  awareness: `Lo que la gente no sabe y que, si lo entendiera, te compraría más. Aquí van también todas las dudas informativas.

1. ¿Cómo se usa realmente el producto? El paso a paso completo. Enseñar el proceso derrumba objeciones y te convierte en el que sabe — que es a quien le compran.
2. ¿Qué trae y cuánto rinde? La gente casi nunca dimensiona el contenido real del paquete ni para cuánto le alcanza.
3. ¿En cuánto tiempo se ven los resultados? Poner las expectativas claras te evita las devoluciones, los malos comentarios y la gente que abandona a mitad de camino.
4. ¿Cuál es la causa real del problema que resuelve? Este es el que más público nuevo te abre: mucha gente ni sabe por qué le pasa lo que le pasa, y menos que tiene solución.
5. ¿Qué lo diferencia de lo más barato que va a encontrar? Materiales, cantidad, respaldo. Sin esto, el cliente solo compara precio.
6. ¿Qué respaldo hay detrás? Envíos, tiempos de entrega, garantía, formas de pago y quién responde si algo sale mal. Son dudas simples que frenan el clic si no están resueltas.

Cómo usarlo: cada punto de conciencia es un video. Son los que menos parecen venta y los que más confianza construyen, y por eso son los que abren público nuevo.`,
};

// Normaliza el objeto guía a las 3 claves de sección como strings.
export function normalizeGuide(g) {
  const out = {};
  for (const s of STRATEGY_SECTIONS) out[s.key] = typeof g?.[s.key] === "string" ? g[s.key] : "";
  return out;
}

export function normalizeTouchpoints(tp) {
  const out = {};
  for (const s of STRATEGY_SECTIONS) {
    out[s.key] = (Array.isArray(tp?.[s.key]) ? tp[s.key] : []).map((it) => ({
      id: it.id || newId(), title: it.title || "", desc: it.desc || "",
    }));
  }
  return out;
}

export function StrategyModal({ touchpoints, legacyAngles = "", canEdit = false, companyName = "", boardId = null, mode = "items", guide = {}, productSelector = null, onSave, onClose }) {
  const { isDark } = useTheme();
  const T = DS;
  const [data, setData] = useState(() => normalizeTouchpoints(touchpoints));
  const [modeState, setModeState] = useState(() => (mode === "guide" ? "guide" : "items"));
  const [guideState, setGuideState] = useState(() => normalizeGuide(guide));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [slots, setSlots] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState(null);

  useEffect(() => {
    if (!boardId) { setSlots([]); return; }
    listSlotsForBoard(boardId).then((s) => setSlots(s || [])).catch(() => setSlots([]));
  }, [boardId]);

  // Cobertura: cuántos slots atacan cada punto de contacto (por id).
  const coverage = useMemo(() => {
    const m = {};
    for (const s of (slots || [])) {
      for (const id of (Array.isArray(s.touchpoints) ? s.touchpoints : [])) m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [slots]);
  const maxCov = Math.max(1, ...Object.values(coverage), 1);

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
  // Ángulos = verde (pedido del cliente §11); resto conserva su color de sección.
  const angGreen = isDark ? "#27E38F" : "#0F8F5B";
  const colOf = (sec) => (sec.key === "angles" ? angGreen : sec.color);

  // Cambia de modo. Al pasar a "guía", pre-carga el template por defecto en las
  // secciones que estén vacías (así el cliente arranca con algo editable).
  const switchMode = (m) => {
    if (m === modeState) return;
    if (m === "guide") {
      setGuideState((g) => {
        const next = { ...g };
        for (const s of STRATEGY_SECTIONS) if (!next[s.key]?.trim()) next[s.key] = DEFAULT_GUIDE[s.key];
        return next;
      });
    }
    setModeState(m);
    setDirty(true);
  };
  const setGuide = (key, text) => { setGuideState((g) => ({ ...g, [key]: text })); setDirty(true); };

  const setItems = (key, items) => { setData((d) => ({ ...d, [key]: items })); setDirty(true); };
  const addItem = (key) => setItems(key, [...data[key], { id: newId(), title: "", desc: "" }]);
  const updItem = (key, id, patch) => setItems(key, data[key].map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const delItem = (key, id) => setItems(key, data[key].filter((it) => it.id !== id));

  // Pega un texto (el plan de implementación) → IA extrae ángulos/objeciones/
  // conciencia → se agregan a las 3 secciones (sin duplicar por título).
  const handleExtract = async () => {
    if (!pasteText.trim()) return;
    setExtracting(true); setExtractErr(null);
    try {
      const res = await extractStrategy(pasteText);
      setData((d) => {
        const next = { ...d };
        for (const sec of STRATEGY_SECTIONS) {
          const existing = next[sec.key] || [];
          const have = new Set(existing.map((it) => it.title.trim().toLowerCase()));
          const add = (res[sec.key] || [])
            .filter((it) => it.title && !have.has(it.title.trim().toLowerCase()))
            .map((it) => ({ id: newId(), title: it.title, desc: it.desc || "" }));
          next[sec.key] = [...existing, ...add];
        }
        return next;
      });
      setDirty(true);
      setPasteOpen(false);
      setPasteText("");
    } catch (e) {
      setExtractErr(e?.message || String(e));
    } finally { setExtracting(false); }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      // Descartamos items sin título al guardar.
      const clean = {};
      for (const s of STRATEGY_SECTIONS) clean[s.key] = data[s.key].filter((it) => it.title.trim());
      await onSave?.({ touchpoints: clean, mode: modeState, guide: normalizeGuide(guideState) });
      setDirty(false);
    } finally { setSaving(false); }
  };
  const requestClose = () => {
    if (dirty && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    onClose?.();
  };

  const total = STRATEGY_SECTIONS.reduce((n, s) => n + data[s.key].length, 0);

  return (
    <div onClick={requestClose} data-modal style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: T.font, overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: modalBg, border: divider, borderRadius: 16, width: "100%", maxWidth: canEdit ? 720 : 920,
        maxHeight: "90vh", display: "flex", flexDirection: "column", color: T.textPrimary,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.6)" : "0 24px 70px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 26px 14px", borderBottom: divider, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C9761F", fontWeight: 800, marginBottom: 4 }}>
              {companyName || "Empresa"}
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>Estrategia de venta</h2>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
              Los puntos de contacto que tu contenido tiene que cubrir para vender. La barra muestra cuántos creativos atacan cada uno.
            </div>
            {productSelector && <div style={{ marginTop: 10 }}>{productSelector}</div>}
          </div>
          <button onClick={requestClose} style={{ width: 32, height: 32, borderRadius: 8, border: divider, background: "transparent", color: T.textSecondary, cursor: "pointer", fontSize: 17 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 26px 22px" }}>
          {/* Toggle de modo: puntos por producto (marca) vs guía (dropshipping) */}
          {canEdit && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "inline-flex", gap: 3, padding: 4, borderRadius: 12, border: divider, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}>
                {[{ k: "items", label: "Puntos por producto" }, { k: "guide", label: "Guía (dropshipping)" }].map((o) => {
                  const on = modeState === o.k;
                  return (
                    <button key={o.k} onClick={() => switchMode(o.k)} style={{
                      padding: "7px 15px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: T.font,
                      fontSize: 12, fontWeight: on ? 800 : 600, whiteSpace: "nowrap",
                      background: on ? "#C9761F" : "transparent", color: on ? "#fff" : T.textSecondary,
                    }}>{o.label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 7 }}>
                {modeState === "guide"
                  ? "Guía explicativa para cuentas que venden muchos productos: enseña a pensar cada sección para cualquier producto del catálogo."
                  : "Puntos concretos (ángulos, objeciones, conciencia) para una marca o producto específico."}
              </div>
            </div>
          )}

          {/* ── Modo GUÍA (dropshipping): 3 textareas explicativas ── */}
          {modeState === "guide" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {STRATEGY_SECTIONS.map((sec) => (
                <div key={sec.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: colOf(sec), flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: colOf(sec) }}>{sec.label}</span>
                  </div>
                  <textarea value={guideState[sec.key]} onChange={(e) => setGuide(sec.key, e.target.value)}
                    rows={10} placeholder={`Guía de ${sec.label.toLowerCase()}…`}
                    style={{ ...inp(isDark, T), minHeight: 200, resize: "vertical", fontFamily: T.font, fontSize: 13, lineHeight: 1.6 }} />
                </div>
              ))}
            </div>
          ) : (
          <>
          {/* Rellenar desde texto (pegar el plan de implementación) */}
          {canEdit && (
            <div style={{ marginBottom: 18 }}>
              {!pasteOpen ? (
                <button onClick={() => setPasteOpen(true)} style={{
                  ...primary(T), background: `${DS.purple}18`, color: DS.purple, border: `1px solid ${DS.purple}`,
                }}>✨ Rellenar desde texto (pegar el plan)</button>
              ) : (
                <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${DS.purple}55`, background: `${DS.purple}0e` }}>
                  <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>
                    Pegá el texto del plan / brief. La IA detecta y clasifica ángulos, objeciones y conciencia. Se <b>agregan</b> a lo que ya tengas (no borra).
                  </div>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={7}
                    placeholder="Pegá acá el plan de implementación o el texto de estrategia…"
                    style={{ ...inp(isDark, T), minHeight: 130, resize: "vertical", fontFamily: T.font, lineHeight: 1.5 }} />
                  {extractErr && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{extractErr}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                    <button onClick={() => { setPasteOpen(false); setPasteText(""); setExtractErr(null); }} disabled={extracting} style={ghost(T)}>Cancelar</button>
                    <button onClick={handleExtract} disabled={extracting || !pasteText.trim()} style={{ ...primary(T), opacity: extracting || !pasteText.trim() ? 0.55 : 1 }}>
                      {extracting ? "Extrayendo…" : "✨ Extraer estrategia"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nota legacy (ángulos en Markdown de la versión anterior) */}
          {legacyAngles.trim() && (
            <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, border: divider, background: isDark ? "rgba(201,118,31,0.08)" : "rgba(201,118,31,0.06)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#C9761F", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Nota anterior (texto libre)</div>
              <div style={{ fontSize: 12.5, color: T.textSecondary, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}>{legacyAngles}</div>
            </div>
          )}

          <div style={!canEdit ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, alignItems: "start" } : undefined}>
          {STRATEGY_SECTIONS.map((sec) => (
            <div key={sec.key} style={{ marginBottom: canEdit ? 22 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: colOf(sec), flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: colOf(sec) }}>{sec.label}</span>
                <span style={{ fontSize: 11, color: T.textMuted }}>· {data[sec.key].length}</span>
                <span style={{ flex: 1 }} />
                {canEdit && <button onClick={() => addItem(sec.key)} style={{ ...ghost(T), color: colOf(sec), borderColor: `${colOf(sec)}66` }}>+ Agregar</button>}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>{sec.hint}</div>

              {data[sec.key].length === 0 ? (
                <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic", padding: "6px 0" }}>
                  {canEdit ? "Todavía sin puntos. Dale a “+ Agregar”." : "Aún no hay puntos cargados acá."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data[sec.key].map((it) => {
                    const c = coverage[it.id] || 0;
                    return (
                      <div key={it.id} style={{ borderRadius: 10, border: divider, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)", padding: "12px 14px" }}>
                        {canEdit ? (
                          <>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                              <input value={it.title} onChange={(e) => updItem(sec.key, it.id, { title: e.target.value })}
                                placeholder="Título (ej: Bajar de peso)" style={{ ...inp(isDark, T), fontWeight: 700 }} />
                              <button onClick={() => delItem(sec.key, it.id)} title="Eliminar" style={{ ...ghost(T), color: "#E24B4A", borderColor: "rgba(226,75,74,0.4)", flexShrink: 0 }}>🗑</button>
                            </div>
                            <textarea value={it.desc} onChange={(e) => updItem(sec.key, it.id, { desc: e.target.value })}
                              rows={2} placeholder="Descripción — cómo se usa este punto para vender…"
                              style={{ ...inp(isDark, T), resize: "vertical", minHeight: 46, fontFamily: T.font }} />
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: it.desc ? 4 : 0 }}>{it.title || "—"}</div>
                            {it.desc && <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{it.desc}</div>}
                          </>
                        )}
                        {/* Cobertura */}
                        <CoverageBar count={c} maxCov={maxCov} color={colOf(sec)} T={T} isDark={isDark} loading={slots === null} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          </div>

          {total === 0 && !canEdit && (
            <div style={{ padding: "30px 10px", textAlign: "center", color: T.textMuted, fontSize: 14 }}>
              Tu estrategia de venta todavía no está cargada.
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div style={{ padding: "12px 26px", borderTop: divider, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={requestClose} disabled={saving} style={ghost(T)}>Cerrar</button>
            <button onClick={doSave} disabled={saving || !dirty} style={{ ...primary(T), opacity: saving || !dirty ? 0.55 : 1 }}>
              {saving ? "Guardando…" : "Guardar estrategia"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CoverageBar({ count, maxCov, color, T, isDark, loading }) {
  const zero = count === 0;
  const pct = Math.round((count / maxCov) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 50, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${zero ? 0 : Math.max(pct, 6)}%`, height: "100%", background: zero ? "transparent" : color, borderRadius: 50, transition: "width 0.2s" }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: loading ? T.textMuted : zero ? "#E24B4A" : color, whiteSpace: "nowrap" }}>
        {loading ? "…" : zero ? "⚠ sin contenido" : `${count} creativo${count === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function inp(isDark, T) {
  return {
    width: "100%", padding: "8px 11px", borderRadius: 8,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
    background: isDark ? "rgba(255,255,255,0.04)" : "#FFF", color: T.textPrimary,
    fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
}
function ghost(T) {
  return { padding: "6px 12px", borderRadius: 50, border: `1px solid ${T.textHint}`, background: "transparent", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font };
}
function primary(T) {
  return { padding: "9px 20px", borderRadius: 50, border: "none", background: "#C9761F", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: T.font };
}
