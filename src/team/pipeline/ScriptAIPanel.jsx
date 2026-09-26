// Panel del guion generado.
//
// La IA propone, vos disponés: nada toca el editor del slot hasta que apretás
// "Insertar". Y lo que se inserta es lo que quedó en pantalla — cada hook, cada
// beat y el CTA son editables, así que podés corregir a mano sin salir de acá.
//
// "Ajustar con IA" manda el guion TAL COMO ESTÁ (con tus ediciones) más una
// instrucción — escrita o dictada — y devuelve la versión corregida. Si esa
// instrucción sirve para siempre ("no menciones los ingredientes"), se puede
// guardar como regla y deja de haber que repetirla.

import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { toastError, toastSuccess } from "../../lib/toast.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { countScriptWords, formatDurationLabel, secondsForWords, PRIMARY_PACE_WPM } from "../../lib/scriptDuration.js";
import { generateSlotScript } from "./data/scriptAI.js";
import { slotScriptToHtml, isScriptEmpty } from "./scriptHtml.js";
import { useVoiceNote } from "./useVoiceNote.js";
import { formatNum } from "./pipelineConstants.js";

const LABEL = { fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)" };

function Overlay({ onClose, width = 720, children }) {
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

const btn = (kind) => ({
  fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, borderRadius: 11, padding: "9px 16px", cursor: "pointer",
  ...(kind === "primary"
    ? { color: "#fff", background: "var(--sel)", border: "1px solid var(--sel)" }
    : { color: "var(--ink-2)", background: "transparent", border: "1px solid var(--line)" }),
});

// Textarea que crece con el contenido — para editar sin scroll interno ni saltos.
function GrowingText({ value, onChange, style }) {
  const ref = useRef(null);
  const fit = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(fit, [value]);
  return (
    <textarea
      ref={ref} value={value} rows={1}
      onChange={(e) => { onChange(e.target.value); fit(); }}
      style={{
        width: "100%", resize: "none", overflow: "hidden", fontFamily: DS.font,
        fontSize: 13, lineHeight: 1.55, color: "var(--ink)", background: "transparent",
        border: "none", outline: "none", padding: 0, ...style,
      }}
    />
  );
}

function WordBudget({ words, targetWords }) {
  if (!words) return null;
  const pct = Math.min(140, Math.round((words.total / (targetWords || 1)) * 100));
  const onTarget = Math.abs(words.total - targetWords) / (targetWords || 1) <= 0.15;
  const secs = secondsForWords(words.total, PRIMARY_PACE_WPM);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
      <div style={{ flex: "1 1 160px", minWidth: 120 }}>
        <div style={{ height: 6, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: onTarget ? "var(--green)" : "var(--amber)" }} />
        </div>
      </div>
      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
        {words.total} / ~{targetWords} palabras · ≈{formatDurationLabel(secs)}
      </span>
      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
        hook {words.hookAvg} · body {words.body} · cta {words.cta}
      </span>
    </div>
  );
}

// Pedido de ajuste: escrito o dictado. Al aplicarlo ofrece dejarlo como regla.
function AdjustBox({ busy, onApply, onCancel }) {
  const [text, setText] = useState("");
  const { rec, busy: recBusy, toggle, supported } = useVoiceNote(
    (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
    { successMsg: "" },
  );
  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(88,166,255,0.3)", background: "var(--sel-soft)", padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={LABEL}>Qué querés cambiar</span>
      <textarea
        value={text} rows={3} autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder="Ej: que el perro suene más triste al principio, y sacá la parte del precio."
        style={{ fontFamily: DS.font, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", outline: "none", resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {supported && (
          <button type="button" onClick={toggle} disabled={busy || recBusy}
            title={rec ? "Detener y transcribir" : "Dictar"}
            style={{ ...btn(), padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 7, ...(rec ? { color: "var(--brand)", borderColor: "rgba(226,75,74,0.4)", background: "var(--brand-soft)" } : {}) }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {recBusy ? "Transcribiendo…" : rec ? "Detener" : "Dictar"}
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btn(), marginLeft: "auto", padding: "7px 12px", fontSize: 12 }}>Cancelar</button>
        <button type="button" onClick={() => onApply(text.trim())} disabled={busy || !text.trim()}
          style={{ ...btn("primary"), padding: "7px 14px", fontSize: 12, opacity: busy || !text.trim() ? 0.5 : 1 }}>
          {busy ? "Ajustando…" : "Aplicar"}
        </button>
      </div>
    </div>
  );
}

// Tras un ajuste: ofrecer que la instrucción quede como regla permanente.
function SaveRuleBar({ instruction, companyId, onDone }) {
  const [saving, setSaving] = useState(false);
  const save = async (kind) => {
    setSaving(true);
    try {
      const resp = await fetch("/api/save-feedback", {
        method: "POST", headers: await buildApiHeaders(),
        body: JSON.stringify({ feedback: instruction, companyId, kind }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || "error");
      toastSuccess("Regla guardada — se aplica en las próximas generaciones");
      onDone();
    } catch (e) { toastError("No se pudo guardar la regla: " + (e?.message || e)); }
    finally { setSaving(false); }
  };
  const chip = (kind, label) => (
    <button type="button" key={kind} onClick={() => save(kind)} disabled={saving}
      style={{ ...btn(), padding: "6px 11px", fontSize: 11.5 }}>{label}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 13px", borderRadius: 11, background: "rgba(52,192,138,.10)", border: "1px solid rgba(52,192,138,.28)" }}>
      <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>¿Que esto valga para todos los guiones?</span>
      {chip("forbidden", "🚫 Prohibido")}
      {chip("must", "✅ Obligatorio")}
      {chip("memory", "🧠 Recomendación")}
      <button type="button" onClick={onDone} disabled={saving} style={{ ...btn(), padding: "6px 11px", fontSize: 11.5, border: "none" }}>Solo esta vez</button>
    </div>
  );
}

export function ScriptAIPanel({ slot, companyId, memberId, products = [], anchorRefId = null, initialResult = null, onEnqueue, onInsert, onClose }) {
  const product = products.find((p) => p.id === slot.product_id || p.name === slot.producto) || null;
  const angles = (product?.touchpoints?.angles || []).filter((a) => a?.title);
  const [angulo, setAngulo] = useState(initialResult?.angulo || slot.angulo || "");
  // El panel NUNCA genera de entrada: eso va a la cola en segundo plano. Acá solo
  // se elige el ángulo (fase `setup`) o se revisa una propuesta ya hecha (`ready`).
  const [phase, setPhase] = useState(initialResult ? "ready" : "setup");   // setup | ready | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);      // lo que no se edita: targetWords, references, avisos
  const [draft, setDraft] = useState(null);    // el guion editable
  const [picked, setPicked] = useState(() => new Set([0, 1, 2, 3, 4]));
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [lastInstruction, setLastInstruction] = useState(null);

  // El conteo se recalcula sobre lo EDITADO, no sobre lo que devolvió el server.
  const words = useMemo(() => {
    if (!draft) return null;
    const hookAvg = draft.hooks.length
      ? Math.round(draft.hooks.reduce((s, h) => s + countScriptWords(h.text), 0) / draft.hooks.length) : 0;
    const body = draft.body.reduce((s, b) => s + countScriptWords(b.text), 0);
    const cta = countScriptWords(draft.cta.text);
    return { hookAvg, body, cta, total: hookAvg + body + cta };
  }, [draft]);

  const applyResult = (out) => {
    setDraft({
      hooks: out.hooks.map((h) => ({ ...h })),
      body: out.body.map((b) => ({ ...b })),
      cta: { ...(out.cta || { text: "" }) },
      notes: out.notes_for_creator || "",
    });
    setMeta({
      promise: out.promise || "", targetWords: out.targetWords, references: out.references || [],
      skipped: out.skipped || [], warning: out.warning || null,
      winnersUsed: out.winnersUsed || 0, model: out.model,
    });
    setPicked(new Set(out.hooks.map((_, i) => i)));
  };

  // Solo para "Regenerar solo hooks": se hace en línea porque ya estás mirando el
  // resultado y reusa el esqueleto cacheado. No blanquea el panel — el guion
  // actual sigue a la vista mientras corre.
  const run = async (opts = {}) => {
    setBusy(true); setError(null);
    try {
      const out = await generateSlotScript(slot, {
        companyId, memberId, angulo, anchorRefId,
        hooksOnly: opts.hooksOnly || false,
        existing: opts.hooksOnly && draft
          ? { body: draft.body, cta: draft.cta, previousHooks: draft.hooks.map((h) => h.text) }
          : null,
      });
      applyResult(out);
      setPhase("ready");
    } catch (e) {
      toastError(e.status === 429 ? e.message : (e.message || "No se pudieron regenerar los hooks."));
    } finally { setBusy(false); }
  };

  // Solo al montar: la propuesta ya viene hecha desde la cola y no se re-aplica
  // en cada render (perdería las ediciones a mano).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialResult) applyResult({ ...initialResult, notes_for_creator: initialResult.notes ?? initialResult.notes_for_creator }); }, []);

  const applyAdjust = async (instruction) => {
    if (!instruction) return;
    setBusy(true);
    try {
      const out = await generateSlotScript(slot, {
        companyId, memberId, angulo, anchorRefId,
        instruction,
        current: { hooks: draft.hooks, body: draft.body, cta: draft.cta },
      });
      applyResult(out);
      setAdjusting(false);
      setLastInstruction(instruction);
      toastSuccess("Guion ajustado");
    } catch (e) { toastError(e.message || "No se pudo ajustar"); }
    finally { setBusy(false); }
  };

  const toggle = (i) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const setHook = (i, text) => setDraft((d) => ({ ...d, hooks: d.hooks.map((h, n) => (n === i ? { ...h, text } : h)) }));
  const setBeat = (i, text) => setDraft((d) => ({ ...d, body: d.body.map((b, n) => (n === i ? { ...b, text } : b)) }));

  const insert = () => {
    const hooks = draft.hooks.filter((_, i) => picked.has(i));
    if (!hooks.length) { toastError("Elegí al menos un hook."); return; }
    const html = slotScriptToHtml({ hooks, body: draft.body, cta: draft.cta, notes: draft.notes });
    if (!isScriptEmpty(slot.script) && !window.confirm("El slot ya tiene un guion escrito. ¿Reemplazarlo por el generado?")) return;
    setBusy(true);
    onInsert(html, {
      archetypes: hooks.map((h) => h.archetype),
      targetWords: meta.targetWords, words, winnersUsed: meta.winnersUsed, model: meta.model,
    });
  };

  return (
    <Overlay onClose={busy ? () => {} : onClose} width={760}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Guion generado</div>
        <span style={{ ...LABEL, marginLeft: "auto" }}>{formatNum(slot.num)} · {slot.producto || "sin producto"}</span>
      </div>

      {phase === "setup" && (
        <div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", marginBottom: 4 }}>
            Este slot no tiene ángulo. Elegí por dónde entra el guion.
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--ink-4)", marginBottom: 16 }}>
            Sin ángulo la IA no tiene un dolor concreto que atacar y termina copiando la
            estructura del referente. Elegí uno y el guion se genera en segundo plano — podés
            seguir trabajando y revisarlo cuando esté listo.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {angles.map((a) => (
              <label key={a.id || a.title}
                style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 13px", borderRadius: 12, cursor: "pointer", background: angulo === a.title ? "var(--sel-soft)" : "var(--surface-2)", border: `1px solid ${angulo === a.title ? "rgba(88,166,255,0.32)" : "var(--line)"}` }}>
                <input type="radio" name="angulo" checked={angulo === a.title} onChange={() => setAngulo(a.title)} style={{ marginTop: 2, accentColor: "var(--sel)" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.title}</div>
                  {a.desc && <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)" }}>{a.desc}</div>}
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" onClick={onClose} style={btn()}>Cancelar</button>
            <button type="button" onClick={() => onEnqueue?.(angulo)} disabled={!angulo} style={{ ...btn("primary"), opacity: angulo ? 1 : 0.45 }}>
              Poner en cola con este ángulo
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div style={{ padding: "24px 0" }}>
          <div style={{ fontSize: 13, color: "var(--brand)", lineHeight: 1.6 }}>{error}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={btn()}>Cerrar</button>
          </div>
        </div>
      )}

      {phase === "ready" && draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <WordBudget words={words} targetWords={meta.targetWords} />

          {(meta.references || []).length > 0 && (
            <details style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", padding: "10px 13px" }}>
              <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", listStyle: "revert" }}>
                Guion del referente — comparar estructura
              </summary>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                {meta.references.map((r, i) => (
                  <div key={i}>
                    {r.label && <div style={{ ...LABEL, marginBottom: 5 }}>{r.label}</div>}
                    <div style={{ fontSize: 12, lineHeight: 1.65, color: "var(--ink-3)", whiteSpace: "pre-wrap" }}>{r.transcript}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {(meta.skipped?.length || meta.warning) && (
            <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--amber)", padding: "9px 13px", borderRadius: 11, background: "rgba(240,169,59,.10)", border: "1px solid rgba(240,169,59,.28)" }}>
              {meta.skipped?.map((s, i) => <div key={i}>{s}</div>)}
              {meta.warning && <div>{meta.warning}</div>}
            </div>
          )}

          {meta.winnersUsed > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--green)" }}>
              Escrito tomando como referencia {meta.winnersUsed} guion{meta.winnersUsed > 1 ? "es" : ""} propio{meta.winnersUsed > 1 ? "s" : ""} que ya funcionó.
            </div>
          )}

          {lastInstruction && (
            <SaveRuleBar instruction={lastInstruction} companyId={companyId} onDone={() => setLastInstruction(null)} />
          )}

          {adjusting
            ? <AdjustBox busy={busy} onApply={applyAdjust} onCancel={() => setAdjusting(false)} />
            : (
              <button type="button" onClick={() => setAdjusting(true)} disabled={busy}
                style={{ ...btn(), alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", fontSize: 12, color: "var(--sel)", borderColor: "rgba(88,166,255,0.3)", background: "var(--sel-soft)" }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></svg>
                Ajustar con IA
              </button>
            )}

          {/* La promesa, arriba de los hooks: de un vistazo se ve si los cinco
              cumplen lo mismo, que es la revisión que importa. */}
          {meta.promise && (
            <div style={{ padding: "10px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <span style={LABEL}>Este guion promete</span>
              <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{meta.promise}</div>
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={LABEL}>Hooks</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{picked.size}/{draft.hooks.length} elegidos</span>
              <button type="button" onClick={() => run({ hooksOnly: true })} disabled={busy} style={{ ...btn(), marginLeft: "auto", padding: "6px 12px", fontSize: 11.5 }}>
                Regenerar solo hooks
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {draft.hooks.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 13px", borderRadius: 12, background: picked.has(i) ? "var(--sel-soft)" : "var(--surface-2)", border: `1px solid ${picked.has(i) ? "rgba(88,166,255,0.32)" : "var(--line)"}` }}>
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} style={{ marginTop: 4, accentColor: "var(--sel)", cursor: "pointer", flex: "none" }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <GrowingText value={h.text} onChange={(t) => setHook(i, t)} />
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{h.label} · {countScriptWords(h.text)} palabras</span>
                      {h.mirrors_reference && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--green)", background: "rgba(52,192,138,.13)", border: "1px solid rgba(52,192,138,.3)", borderRadius: 999, padding: "2px 7px" }}>
                          misma estructura que el referente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ ...LABEL, marginBottom: 8 }}>Body</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {draft.body.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3, flex: "none" }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <GrowingText value={b.text} onChange={(t) => setBeat(i, t)} style={{ color: "var(--ink-2)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ ...LABEL, marginBottom: 8 }}>CTA</div>
            <GrowingText value={draft.cta.text} onChange={(t) => setDraft((d) => ({ ...d, cta: { ...d.cta, text: t } }))} style={{ color: "var(--ink-2)" }} />
          </div>

          {draft.notes && (
            <div>
              <div style={{ ...LABEL, marginBottom: 8 }}>Notas de grabación</div>
              <GrowingText value={draft.notes} onChange={(t) => setDraft((d) => ({ ...d, notes: t }))} style={{ fontSize: 12.5, color: "var(--ink-3)" }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={onClose} disabled={busy} style={btn()}>Descartar</button>
            <button type="button" onClick={insert} disabled={busy} style={btn("primary")}>
              {busy ? "Insertando…" : `Insertar ${picked.size} hook${picked.size === 1 ? "" : "s"} + body + CTA`}
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
