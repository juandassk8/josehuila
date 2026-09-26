import { useEffect, useMemo, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { LABEL_CATEGORIES } from "../../despliegue/labels.js";
import { fetchLabelVocabularyCounted } from "./db.js";
import { renameLabelValue, mergeLabelValues, deleteLabelValue, moveLabelToCategory } from "../../despliegue/db.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { CATEGORY_BY_KEY } from "../../despliegue/labels.js";
import { canonizarEtiqueta, valorCanonicoDelGrupo, etiquetasCruzadas } from "../../../api/_lib/labelVocab.js";

// Administrador GLOBAL de etiquetas del banco: ver todos los valores por categoría
// (marca/nicho/ángulo/formato) con su conteo, renombrar, unificar y borrar en TODAS
// las referencias de una. Los duplicados los detecta con la misma regla que usa el
// clasificador para no inventar sinónimos (`canonizarEtiqueta`).
export function LabelManagerModal({ onClose, onChanged }) {
  const [vocab, setVocab] = useState(null);
  const [cat, setCat] = useState("marca");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  // 🤖 Auto-organizar con IA
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPlan, setAiPlan] = useState(null);   // { renames, merges, moves }
  const [aiPick, setAiPick] = useState(new Set());   // índices "tipo:idx" seleccionados

  const catLabel = (k) => CATEGORY_BY_KEY[k]?.label || k;

  // Etiquetas que viven en DOS categorías a la vez — "Bajar de peso" como ángulo
  // y como nicho, "Salud" como nicho y como ángulo. No es un duplicado de
  // escritura: es un valor puesto donde no va, y por eso filtrar por nicho
  // devuelve cosas que no son nichos.
  const [verCruzadas, setVerCruzadas] = useState(false);
  const [buscarErratas, setBuscarErratas] = useState(false);
  const cruzadas = useMemo(() => {
    if (!vocab) return [];
    const counts = {};
    for (const c of LABEL_CATEGORIES) counts[c.key] = Object.fromEntries((vocab[c.key] || []).map((v) => [v.value, v.count]));
    return etiquetasCruzadas(counts);
  }, [vocab]);
  const [cruzPick, setCruzPick] = useState(new Set());
  // El destino de cada una, editable. La mayoría es solo una propuesta: en las
  // peleadas suele estar equivocada justamente porque están peleadas —"Salud"
  // gana como nicho por poco, pero "Testimonial orgánico" gana como ángulo y es
  // un formato—. Quien sabe la respuesta es la persona, no el conteo.
  const [cruzDestino, setCruzDestino] = useState({});
  // Solo se preseleccionan las de mayoría aplastante. Las peleadas —"Lipodema"
  // 32 a 25— las decide una persona: acá adivinar sale caro.
  useEffect(() => {
    setCruzPick(new Set(cruzadas.filter((c) => c.clara).map((c) => c.valor)));
    setCruzDestino(Object.fromEntries(cruzadas.map((c) => [c.valor, c.destino])));
  }, [cruzadas]);

  const aplicarCruzadas = async () => {
    const elegidas = cruzadas.filter((c) => cruzPick.has(c.valor));
    if (!elegidas.length) return;
    setBusy(true); setError(null);
    try {
      let n = 0;
      for (const c of elegidas) {
        // Se saca de TODAS las categorías donde no corresponde y se deja en la suya.
        const destino = cruzDestino[c.valor] || c.destino;
        for (const u of c.usos) {
          if (u.cat === destino) continue;
          const r = await moveLabelToCategory(u.cat, u.valor, destino);
          n += r?.count || 0;
        }
      }
      setMsg(`✓ ${elegidas.length} etiqueta(s) reubicadas · ${n} referencia(s).`);
      setVerCruzadas(false);
      await load(); onChanged?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const runAi = async () => {
    setAiBusy(true); setError(null); setMsg(null);
    try {
      const resp = await fetch("/api/organize-labels", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({}) });
      const data = await resp.json();
      if (!data.ok) { setError(data.reason || "La IA no pudo proponer un plan."); setAiBusy(false); return; }
      const p = data.plan;
      // Por defecto todos seleccionados.
      const pick = new Set();
      (p.renames || []).forEach((_, i) => pick.add(`r${i}`));
      (p.merges || []).forEach((_, i) => pick.add(`m${i}`));
      (p.moves || []).forEach((_, i) => pick.add(`v${i}`));
      setAiPlan(p); setAiPick(pick);
      if (!(p.renames?.length || p.merges?.length || p.moves?.length)) setMsg("✓ La IA no encontró nada para reorganizar — está prolijo.");
    } catch (e) { setError(e?.message || String(e)); }
    finally { setAiBusy(false); }
  };

  const togglePick = (id) => setAiPick((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyPlan = async () => {
    if (!aiPlan) return;
    setBusy(true); setError(null);
    let n = 0;
    try {
      for (let i = 0; i < (aiPlan.renames || []).length; i++) { if (!aiPick.has(`r${i}`)) continue; const a = aiPlan.renames[i]; await renameLabelValue(a.category, a.from, a.to); n++; }
      for (let i = 0; i < (aiPlan.merges || []).length; i++) { if (!aiPick.has(`m${i}`)) continue; const a = aiPlan.merges[i]; await mergeLabelValues(a.category, a.from, a.to); n++; }
      for (let i = 0; i < (aiPlan.moves || []).length; i++) { if (!aiPick.has(`v${i}`)) continue; const a = aiPlan.moves[i]; await moveLabelToCategory(a.from_category, a.value, a.to_category); n++; }
      setAiPlan(null); setAiPick(new Set()); await load(); onChanged?.();
      setMsg(`✓ Aplicados ${n} cambios de organización.`);
    } catch (e) { setError(`No se pudo aplicar: ${e?.message || e}`); }
    finally { setBusy(false); }
  };

  const load = async () => {
    try { setVocab(await fetchLabelVocabularyCounted()); }
    catch (e) { setError(e?.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const values = vocab?.[cat] || [];
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? values.filter((v) => v.value.toLowerCase().includes(t)) : values;
  }, [values, search]);

  // Grupos de posibles duplicados.
  //
  // Se usa la MISMA regla con la que el clasificador decide si una etiqueta nueva
  // ya existe (`canonizarEtiqueta`). Antes acá solo se comparaba la escritura
  // normalizada, así que agrupaba "calzado" con "Calzado" pero no veía lo que de
  // verdad ensució el banco: las compuestas ("Pijamas y ropa de dormir" contra
  // "Pijamas") y las variantes de orden o plural ("Caida Cabello" contra "Caída
  // de cabello"). Compartir la regla es lo que hace que limpiar el pasado y
  // evitar el futuro sean la misma decisión.
  // Buscar erratas (distancia de edición) fuera de MARCA va apagado por defecto.
  // Para nombres propios el riesgo es nulo —"Ag1" y "AG1" son la misma marca—
  // pero entre etiquetas descriptivas dos palabras cortas y parecidas pueden ser
  // cosas distintas: "Cabello" y "Caballo" están a dos letras. Con el
  // interruptor, quien limpia decide si quiere ver esas sugerencias.
  //
  // Sin esto, "Lipedema" (29 usos) y "Lipodema" (294) no se cruzaban NUNCA: no
  // comparten palabras, así que solo la distancia de edición las junta.
  const dupGroups = useMemo(() => {
    // De más usada a menos: el canonizador desempata a favor de la más usada, que
    // es la que el equipo ya reconoce.
    const porUso = [...values].sort((a, b) => b.count - a.count);
    const grupos = new Map();      // valor canónico → variantes
    const yaEnGrupo = new Set();
    for (const v of porUso) {
      if (yaEnGrupo.has(v.value)) continue;
      const otras = porUso.filter((x) => x.value !== v.value && !yaEnGrupo.has(x.value)).map((x) => x.value);
      const canon = canonizarEtiqueta(v.value, otras, { fuzzy: cat === "marca" || buscarErratas });
      if (!canon) continue;
      if (!grupos.has(canon)) grupos.set(canon, [porUso.find((x) => x.value === canon)].filter(Boolean));
      grupos.get(canon).push(v);
      yaEnGrupo.add(v.value);
    }
    return [...grupos.values()].filter((g) => g.length > 1);
  }, [values, cat, buscarErratas]);

  const catMeta = LABEL_CATEGORIES.find((c) => c.key === cat) || LABEL_CATEGORIES[0];
  const toggle = (val) => setSelected((prev) => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });

  const run = async (fn, okMsg) => {
    setBusy(true); setError(null);
    try { const r = await fn(); setMsg(okMsg(r)); setSelected(new Set()); await load(); onChanged?.(); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const doRename = (val) => {
    const to = window.prompt(`Renombrar "${val}" a:`, val);
    if (to == null || !to.trim() || to.trim() === val) return;
    run(() => renameLabelValue(cat, val, to.trim()), (r) => `✓ "${val}" → "${to.trim()}" en ${r.count} referencia(s).`);
  };
  // Dos clics, no `confirm()`: la caja del navegador congela la pestaña entera.
  // El segundo clic va en rojo lleno, así se ve que la próxima vez va en serio.
  const [borrando, setBorrando] = useState(null);
  const doDelete = (val) => {
    if (borrando !== val) { setBorrando(val); return; }
    setBorrando(null);
    run(() => deleteLabelValue(cat, val), (r) => `✓ "${val}" quitada de ${r.count} referencia(s).`);
  };
  // Mover un valor mal categorizado a otra categoría (ej. "Salud" de ángulo → nicho).
  // Mover se elige EN LA FILA, no con `window.prompt`: esa caja es del navegador,
  // congela la pestaña y encima pedía escribir la categoría a mano.
  const [moviendo, setMoviendo] = useState(null);   // valor cuya fila muestra los destinos
  const doMove = (val, target) => {
    setMoviendo(null);
    run(() => moveLabelToCategory(cat, val, target), (r) => `✓ "${val}" movida a ${catLabel(target)} en ${r.count} referencia(s).`);
  };
  const doMergeSelected = () => {
    const arr = [...selected];
    if (arr.length < 2) { setMsg("Elegí al menos 2 para unificar."); return; }
    // Sugerimos el más frecuente como canónico.
    const best = arr.map((v) => values.find((x) => x.value === v)).filter(Boolean).sort((a, b) => b.count - a.count)[0];
    const to = window.prompt(`Unificar ${arr.length} valores en uno.\nEscribí el nombre CANÓNICO (los demás se reemplazan):`, best?.value || arr[0]);
    if (to == null || !to.trim()) return;
    run(() => mergeLabelValues(cat, arr, to.trim()), (r) => `✓ Unificadas en "${to.trim()}" · ${r.count} referencia(s).`);
  };
  // Confirmación en DOS CLICS, no con `confirm()`: esa caja es del sistema
  // operativo y congela la pestaña entera mientras está abierta. Acá el propio
  // botón pregunta —"Unificar en Pijamas"— que además dice en qué va a quedar,
  // cosa que la pregunta genérica no decía.
  const [confirmando, setConfirmando] = useState(null);   // índice del grupo
  const doMergeGroup = (group, i) => {
    const destino = valorCanonicoDelGrupo(group, cat);
    if (confirmando !== i) { setConfirmando(i); return; }
    setConfirmando(null);
    run(() => mergeLabelValues(cat, group.map((g) => g.value), destino), (r) => `✓ Unificadas en "${destino}" · ${r.count} referencia(s).`);
  };

  return (
    <div onClick={() => !busy && onClose?.()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, width: "min(760px, 97vw)", height: "min(760px, 92vh)", display: "flex", flexDirection: "column", color: DS.textPrimary }}>
        <div style={{ padding: "18px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🏷 Organizar etiquetas</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={runAi} disabled={aiBusy || busy} style={{ padding: "7px 14px", borderRadius: 50, border: `1px solid ${DS.purple}`, background: withAlpha(DS.purple, "22"), color: DS.purple, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font, opacity: aiBusy ? 0.6 : 1 }}>{aiBusy ? "Pensando…" : "🤖 Auto-organizar (IA)"}</button>
              <button onClick={() => onClose?.()} style={{ border: "none", background: "transparent", color: DS.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 5 }}>Todos los valores por categoría (banco + bandeja), con cuántas referencias los usan. Renombrá, unificá variantes o borralas — se aplica a TODO (banco y bandeja).</div>
        </div>

        {/* Tabs de categoría */}
        <div style={{ display: "flex", gap: 6, padding: "12px 22px 0", flexWrap: "wrap" }}>
          {LABEL_CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => { setCat(c.key); setSelected(new Set()); setSearch(""); }} style={{
              padding: "6px 14px", borderRadius: 50, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font,
              border: `1px solid ${cat === c.key ? c.color : DS.textHint}`,
              background: cat === c.key ? withAlpha(c.color, "22") : "transparent",
              color: cat === c.key ? c.color : DS.textSecondary,
            }}>{c.label} ({vocab?.[c.key]?.length ?? "…"})</button>
          ))}
        </div>

        <div style={{ padding: "10px 22px", display: "flex", gap: 8, alignItems: "center" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar en ${catMeta.label}…`}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${DS.textHint}`, background: DS.bgCard, color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none" }} />
          {selected.size > 0 && <button onClick={doMergeSelected} disabled={busy} style={{ padding: "8px 14px", borderRadius: 50, border: "none", background: catMeta.color, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font }}>⚯ Unificar ({selected.size})</button>}
        </div>

        {(msg || error) && <div style={{ padding: "0 22px 8px", fontSize: 12, color: error ? DS.red : DS.green }}>{error || msg}</div>}

        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 16px" }}>
          {/* Etiquetas en la categoría equivocada. Va ARRIBA de los duplicados
              porque es peor: un duplicado ensucia; una etiqueta cruzada hace que
              filtrar por nicho devuelva cosas que no son nichos. */}
          {cruzadas.length > 0 && !search && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: withAlpha(DS.red, "10"), border: `1px solid ${withAlpha(DS.red, "40")}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: verCruzadas ? 10 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: DS.red }}>⇄ EN DOS CATEGORÍAS A LA VEZ ({cruzadas.length})</span>
                <button onClick={() => setVerCruzadas(!verCruzadas)} disabled={busy}
                  style={{ padding: "3px 10px", borderRadius: 50, border: `1px solid ${DS.red}`, background: "transparent", color: DS.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>
                  {verCruzadas ? "Ocultar" : "Resolver"}
                </button>
              </div>
              {verCruzadas && (
                <>
                  <div style={{ fontSize: 11.5, color: DS.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                    La categoría donde más se usa viene propuesta, pero el destino lo elegís vos: tocá la que corresponda. Las peleadas vienen sin marcar.
                  </div>
                  {cruzadas.map((c) => {
                    const on = cruzPick.has(c.valor);
                    return (
                      <label key={c.valor} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", cursor: "pointer", fontSize: 12.5 }}>
                        <input type="checkbox" checked={on} disabled={busy}
                          onChange={() => setCruzPick((p) => { const n = new Set(p); n.has(c.valor) ? n.delete(c.valor) : n.add(c.valor); return n; })}
                          style={{ accentColor: DS.red, cursor: "pointer" }} />
                        <b>{c.valor}</b>
                        <span style={{ color: DS.textMuted }}>{c.usos.map((u) => `${catLabel(u.cat)} ${u.n}`).join("  ·  ")}</span>
                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ color: DS.textMuted }}>→</span>
                          {c.usos.map((u) => {
                            const elegido = (cruzDestino[c.valor] || c.destino) === u.cat;
                            const color = CATEGORY_BY_KEY[u.cat]?.color || DS.green;
                            return (
                              <button key={u.cat} type="button" disabled={busy}
                                onClick={(e) => { e.preventDefault(); setCruzDestino((d) => ({ ...d, [c.valor]: u.cat })); }}
                                title={`Dejarla como ${catLabel(u.cat)}`}
                                style={{ padding: "2px 9px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${elegido ? color : DS.textHint}`,
                                  background: elegido ? withAlpha(color, "26") : "transparent",
                                  color: elegido ? color : DS.textMuted }}>
                                {catLabel(u.cat)}
                              </button>
                            );
                          })}
                        </span>
                      </label>
                    );
                  })}
                  <button onClick={aplicarCruzadas} disabled={busy || cruzPick.size === 0}
                    style={{ marginTop: 10, padding: "8px 16px", borderRadius: 50, border: "none", background: cruzPick.size ? DS.red : DS.textHint, color: "#fff", fontSize: 12, fontWeight: 800, cursor: cruzPick.size ? "pointer" : "default", fontFamily: DS.font }}>
                    Reubicar {cruzPick.size} etiqueta(s)
                  </button>
                </>
              )}
            </div>
          )}

          {/* Posibles duplicados */}
          {dupGroups.length > 0 && !search && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: withAlpha(DS.amber, "12"), border: `1px solid ${withAlpha(DS.amber, "44")}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: DS.amber }}>⚠ POSIBLES DUPLICADOS ({dupGroups.length})</span>
                {cat !== "marca" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.textMuted, cursor: "pointer" }}>
                    <input type="checkbox" checked={buscarErratas} onChange={(e) => setBuscarErratas(e.target.checked)} />
                    Buscar también erratas de una o dos letras
                  </label>
                )}
              </div>
              {dupGroups.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5 }}>{g.map((x) => `${x.value} (${x.count})`).join("  ·  ")}</span>
                  <button onClick={() => doMergeGroup(g, i)} disabled={busy}
                    style={{ padding: "3px 10px", borderRadius: 50, border: `1px solid ${DS.amber}`, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                      background: confirmando === i ? DS.amber : "transparent", color: confirmando === i ? "#fff" : DS.amber }}>
                    {confirmando === i ? `Unificar en "${valorCanonicoDelGrupo(g, cat)}"` : "Unificar"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {!vocab ? <div style={{ color: DS.textMuted, fontSize: 12 }}>Cargando…</div>
            : filtered.length === 0 ? <div style={{ color: DS.textMuted, fontSize: 12 }}>Sin valores.</div>
              : filtered.map((v) => (
                <div key={v.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, borderBottom: `1px solid ${withAlpha(DS.textHint, "55")}` }}>
                  <input type="checkbox" checked={selected.has(v.value)} onChange={() => toggle(v.value)} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{v.value}</span>
                  <span style={{ fontSize: 11, color: DS.textMuted, minWidth: 60, textAlign: "right" }}>{v.count} ref{v.count === 1 ? "" : "s"}</span>
                  <button onClick={() => doRename(v.value)} disabled={busy} title="Renombrar" style={{ ...miniBtn, borderColor: DS.blue, color: DS.blue }}>✏️</button>
                  <button onClick={() => setMoviendo(moviendo === v.value ? null : v.value)} disabled={busy} title="Mover a otra categoría (ej. sacar un nicho de ángulo)" style={{ ...miniBtn, borderColor: withAlpha(DS.amber, "88"), color: DS.amber }}>⇄</button>
                  <button onClick={() => doDelete(v.value)} disabled={busy}
                    title={borrando === v.value ? "Confirmá: la quita de todas las referencias" : "Borrar etiqueta de todas las referencias"}
                    style={{ ...miniBtn, borderColor: withAlpha(DS.red, "88"),
                      background: borrando === v.value ? DS.red : "transparent",
                      color: borrando === v.value ? "#fff" : DS.red,
                      width: borrando === v.value ? "auto" : undefined, padding: borrando === v.value ? "0 9px" : undefined, fontWeight: 700 }}>
                    {borrando === v.value ? "¿Borrar?" : "🗑"}
                  </button>
                  {/* Los destinos se eligen acá mismo: un clic y listo, en vez de
                      escribir el nombre de la categoría en una caja del navegador. */}
                  {moviendo === v.value && (
                    <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0 2px" }}>
                      <span style={{ fontSize: 11.5, color: DS.textMuted, alignSelf: "center" }}>Mover a:</span>
                      {LABEL_CATEGORIES.filter((c) => c.key !== cat).map((c) => (
                        <button key={c.key} onClick={() => doMove(v.value, c.key)} disabled={busy}
                          style={{ padding: "4px 11px", borderRadius: 50, border: `1px solid ${c.color}`, background: "transparent", color: c.color, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
        </div>
      </div>

      {aiPlan && (() => {
        const total = (aiPlan.renames?.length || 0) + (aiPlan.merges?.length || 0) + (aiPlan.moves?.length || 0);
        const Row = ({ id, color, children }) => (
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 10px", borderRadius: 8, borderBottom: `1px solid ${withAlpha(DS.textHint, "55")}`, cursor: "pointer" }}>
            <input type="checkbox" checked={aiPick.has(id)} onChange={() => togglePick(id)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{children}</span>
          </label>
        );
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 10004, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
            <div style={{ background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, width: "min(680px, 96vw)", height: "min(720px, 90vh)", display: "flex", flexDirection: "column", color: DS.textPrimary }}>
              <div style={{ padding: "18px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🤖 Plan de reorganización</h3>
                <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 5 }}>{total === 0 ? "Todo está prolijo — no hay cambios que proponer." : "Revisá y destildá lo que no quieras. Se aplica a TODO el banco."}</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px" }}>
                {aiPlan.moves?.length > 0 && <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: DS.amber, marginBottom: 4 }}>↔ MOVER DE CATEGORÍA ({aiPlan.moves.length})</div>
                  {aiPlan.moves.map((a, i) => <Row key={i} id={`v${i}`}><b>{a.value}</b>: {catLabel(a.from_category)} → <b style={{ color: DS.amber }}>{catLabel(a.to_category)}</b> <span style={{ color: DS.textMuted }}>· {a.reason}</span></Row>)}
                </div>}
                {aiPlan.merges?.length > 0 && <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: DS.green, marginBottom: 4 }}>⚯ UNIFICAR ({aiPlan.merges.length})</div>
                  {aiPlan.merges.map((a, i) => <Row key={i} id={`m${i}`}><span style={{ color: DS.textMuted }}>[{catLabel(a.category)}]</span> {a.from.join(" + ")} → <b style={{ color: DS.green }}>{a.to}</b> <span style={{ color: DS.textMuted }}>· {a.reason}</span></Row>)}
                </div>}
                {aiPlan.renames?.length > 0 && <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: DS.blue, marginBottom: 4 }}>✏️ RENOMBRAR ({aiPlan.renames.length})</div>
                  {aiPlan.renames.map((a, i) => <Row key={i} id={`r${i}`}><span style={{ color: DS.textMuted }}>[{catLabel(a.category)}]</span> {a.from} → <b style={{ color: DS.blue }}>{a.to}</b> <span style={{ color: DS.textMuted }}>· {a.reason}</span></Row>)}
                </div>}
                {total === 0 && <div style={{ color: DS.textMuted, fontSize: 13, padding: 20, textAlign: "center" }}>Tus etiquetas ya están bien organizadas. 👌</div>}
              </div>
              <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAiPlan(null)} disabled={busy} style={{ ...miniBtn, padding: "9px 18px", borderRadius: 50, borderColor: DS.textHint, color: DS.textSecondary }}>Cancelar</button>
                {total > 0 && <button onClick={applyPlan} disabled={busy || aiPick.size === 0} style={{ padding: "9px 20px", borderRadius: 50, border: "none", background: DS.purple, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: DS.font, opacity: busy || aiPick.size === 0 ? 0.6 : 1 }}>{busy ? "Aplicando…" : `Aplicar ${aiPick.size} cambios`}</button>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const miniBtn = { padding: "3px 8px", borderRadius: 6, border: "1px solid", background: "transparent", fontSize: 12, cursor: "pointer", fontFamily: DS.font };
