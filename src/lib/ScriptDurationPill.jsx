import { useState, useRef, useEffect } from "react";
import { DS } from "./design.js";
import {
  estimateScriptPaces,
  projectScriptPaces,
  formatDurationLabel,
  secondsForWords,
} from "./scriptDuration.js";

// Pill clicable que muestra "⏱ ≈ Xs" calculado al ritmo Normal (190 wpm).
// Click → popover con:
//   - 3 tarjetas de ritmo (relajado / normal / rápido) con duración por cada uno
//   - Control de densidad (slider %) con preview de palabras objetivo + tiempos proyectados
//   - Botón "Aplicar con IA" que dispara `onAdjustDensity({ targetWords, percent, instruction })`
//
// Props:
//   content          — markdown/HTML del guión completo (cuenta palabras)
//   onAdjustDensity  — opcional. Callback al aplicar el cambio de densidad.
//                      Se invoca con un objeto: { targetWords, percent, instruction }.
//                      Si no se pasa, el control de densidad queda oculto.
//   theme            — opcional, para reusar el T del SlotModal (light/dark).
//   align            — "left" | "right". Default: "left".
//
// Backwards-compat: la prop `onShorten` (del API anterior) se sigue aceptando
// — si está presente, se usa como onAdjustDensity con la instrucción default
// de acortar (-20%).
export function ScriptDurationPill({ content, onAdjustDensity, onShorten, theme, align = "left" }) {
  const T = theme || DS;
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Reset slider al cerrar — para que la próxima apertura arranque limpia.
  useEffect(() => { if (!open) setPercent(0); }, [open]);

  const data = estimateScriptPaces(content);
  if (!data) return null;
  const { words, paces } = data;
  const normal = paces.find((p) => p.key === "normal") || paces[1];

  const isDark = T.bg === "#06060A" || T.bg === DS.bg;
  const showDensity = !!(onAdjustDensity || onShorten);

  // Palabras objetivo si se aplicara el % actual. Rango ±10 le da margen
  // a la IA para cerrar frases sin pelear contra un número exacto.
  const targetWords = Math.max(10, Math.round(words * (1 + percent / 100)));
  const minWords = Math.max(10, targetWords - 10);
  const maxWords = targetWords + 10;
  const projected = projectScriptPaces(targetWords);
  const projectedNormal = projected?.find((p) => p.key === "normal");
  const projectedNormalSeconds = projectedNormal?.seconds || 0;
  const deltaSeconds = projectedNormalSeconds - normal.seconds;

  const handleApply = () => {
    if (percent === 0) return;
    setOpen(false);
    const isShortening = percent < 0;
    // Instrucción reforzada con números absolutos: el conteo actual, el
    // objetivo y el rango aceptable. La IA tiende a "obedecer débilmente"
    // las instrucciones de cantidad — por eso especificamos que el rango
    // es NO NEGOCIABLE y le pedimos que cuente antes de devolver.
    // También permitimos reescribir hooks (antes los protegíamos, lo que
    // hacía imposible bajar mucho la densidad).
    const instruction =
      `El guion actual tiene ${words} palabras. Reescribilo para que el final ` +
      `tenga entre ${minWords} y ${maxWords} palabras totales (objetivo ${targetWords}). ` +
      `Ese rango es OBLIGATORIO.\n\n` +
      `Cómo lograrlo:\n` +
      (isShortening
        ? `- Reescribí los hooks para que sean más concisos e impactantes (idealmente 1 oración corta y punzante por hook).\n` +
          `- Comprimí el body: eliminá redundancias, adjetivos innecesarios, frases de relleno y oraciones de transición. Fusioná frases cortas.\n` +
          `- Reformulá el CTA si hace falta para que sea más directo.\n` +
          `- Mantené el mensaje principal, los claims clave y la intención del CTA.\n`
        : `- Expandí con contexto útil, ejemplos breves o transiciones que aporten valor — sin meter relleno.\n` +
          `- Reforzá hooks, body y CTA con detalles que aumenten claridad o emoción.\n` +
          `- Mantené la idea central y la voz.\n`) +
      `- Conservá el tono y la voz original del autor.\n\n` +
      `Antes de devolverlo, contá las palabras del guion (sin contar las etiquetas HOOKS, BODY, CTA ni los marcadores Hook 1, Hook 2, etc — solo el contenido hablado). ` +
      `Si excede ${maxWords}, recortalo. Si es menor a ${minWords}, ${isShortening ? "está bien si igual cumple el mensaje" : "expandilo un poco más"}.\n\n` +
      `Devolvé SOLO el guion completo, en texto plano (sin markdown, sin asteriscos, sin numerales), en este orden:\n\n` +
      `HOOKS\nHook 1: ...\nHook 2: ...\nHook 3: ...\n\n` +
      `BODY\n...\n\n` +
      `CTA\n...\n\n` +
      `NO respondas con preguntas ni explicaciones. Solo el guion final.`;

    if (onAdjustDensity) {
      onAdjustDensity({ targetWords, percent, instruction, currentWords: words });
    } else if (onShorten) {
      onShorten();
    }
  };

  const presetPercents = [-30, -20, -10, 0, +10, +20];

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        title="Click para ver detalle por ritmo y ajustar densidad"
        style={{
          padding: "2px 9px",
          borderRadius: 50,
          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          border: `1px solid ${T.textHint || DS.textHint}`,
          fontSize: 11, fontWeight: 600,
          color: T.textSecondary || DS.textSecondary,
          cursor: "pointer", whiteSpace: "nowrap",
          fontFamily: T.font || DS.font,
          display: "inline-flex", alignItems: "center", gap: 4,
        }}
      >
        ⏱ ≈ {normal.durationLabel}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [align === "right" ? "right" : "left"]: 0,
            zIndex: 200,
            width: 360,
            background: T.bgSide || DS.bgSide,
            border: `1px solid ${T.textHint || DS.textHint}`,
            borderRadius: 12,
            padding: "14px 14px 12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            fontFamily: T.font || DS.font,
            color: T.textPrimary || DS.textPrimary,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 10, gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
              Duración estimada
            </div>
            <div style={{ fontSize: 10, color: T.textMuted || DS.textMuted }}>
              {words} {words === 1 ? "palabra" : "palabras"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: showDensity ? 14 : 4 }}>
            {paces.map((p) => {
              const isPrimary = p.key === "normal";
              return (
                <div
                  key={p.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 11px",
                    borderRadius: 9,
                    background: isPrimary
                      ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)")
                      : "transparent",
                    border: `1px solid ${isPrimary ? (T.textHint || DS.textHint) : "transparent"}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary || DS.textPrimary }}>
                      {p.label}
                      {isPrimary && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 700,
                          padding: "1px 6px", borderRadius: 50,
                          background: DS.green || "#1DB97A", color: "#06060A",
                          letterSpacing: "0.05em",
                        }}>
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted || DS.textMuted, marginTop: 2 }}>
                      {p.range} ppm · {p.hint}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: T.textPrimary || DS.textPrimary,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {p.durationLabel}
                  </div>
                </div>
              );
            })}
          </div>

          {showDensity && (
            <div style={{
              marginTop: 4, paddingTop: 12,
              borderTop: `1px solid ${T.textHint || DS.textHint}`,
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 8, gap: 8,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Ajustar densidad</div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: percent < 0 ? (DS.amber || "#F5A623") : percent > 0 ? (DS.blue || "#3B82F6") : T.textMuted,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {percent > 0 ? `+${percent}%` : `${percent}%`}
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value, 10))}
                style={{ width: "100%", marginBottom: 6, accentColor: DS.purple || "#8B5CF6" }}
              />

              {/* Presets */}
              <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                {presetPercents.map((p) => {
                  const active = p === percent;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPercent(p)}
                      style={{
                        flex: 1, minWidth: 0,
                        padding: "4px 6px", borderRadius: 6,
                        border: `1px solid ${active ? (DS.purple || "#8B5CF6") : (T.textHint || DS.textHint)}`,
                        background: active ? (DS.purple || "#8B5CF6") : "transparent",
                        color: active ? "#fff" : T.textSecondary,
                        fontSize: 10, fontWeight: 700,
                        cursor: "pointer", fontFamily: T.font || DS.font,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {p > 0 ? `+${p}%` : `${p}%`}
                    </button>
                  );
                })}
              </div>

              {/* Preview de objetivo */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 10px", borderRadius: 8,
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 10, color: T.textMuted || DS.textMuted, lineHeight: 1.4 }}>
                  Objetivo
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary || DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    {percent === 0 ? `${words} palabras` : `${minWords}-${maxWords} palabras`}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: T.textMuted || DS.textMuted, lineHeight: 1.4, textAlign: "right" }}>
                  Nuevo tiempo (Normal)
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: T.textPrimary || DS.textPrimary,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {projectedNormal ? formatDurationLabel(projectedNormal.seconds) : "—"}
                    {percent !== 0 && deltaSeconds !== 0 && (
                      <span style={{
                        marginLeft: 5, fontSize: 10, fontWeight: 600,
                        color: deltaSeconds < 0 ? (DS.green || "#1DB97A") : (DS.amber || "#F5A623"),
                      }}>
                        {deltaSeconds > 0 ? "+" : ""}{deltaSeconds}s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mini-grid con los 3 ritmos proyectados */}
              {percent !== 0 && projected && (
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
                  marginBottom: 10, fontVariantNumeric: "tabular-nums",
                }}>
                  {projected.map((p) => (
                    <div key={p.key} style={{
                      padding: "6px 8px", borderRadius: 6,
                      background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 9, color: T.textMuted || DS.textMuted, fontWeight: 700, letterSpacing: "0.03em" }}>
                        {p.label.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.textPrimary || DS.textPrimary, marginTop: 2 }}>
                        {formatDurationLabel(p.seconds)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleApply}
                disabled={percent === 0}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 9,
                  border: "none",
                  background: percent === 0
                    ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                    : `linear-gradient(135deg, ${DS.blue || "#3B82F6"}, ${DS.purple || "#8B5CF6"})`,
                  color: percent === 0 ? T.textMuted : "#fff",
                  fontSize: 12, fontWeight: 700,
                  cursor: percent === 0 ? "default" : "pointer",
                  fontFamily: T.font || DS.font,
                  letterSpacing: "0.02em",
                  opacity: percent === 0 ? 0.6 : 1,
                }}
              >
                {percent === 0
                  ? "Movés el slider para ajustar"
                  : percent < 0
                    ? `✨ Acortar con IA (${percent}%)`
                    : `✨ Alargar con IA (+${percent}%)`}
              </button>
            </div>
          )}

          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: `1px solid ${T.textHint || DS.textHint}`,
            fontSize: 10, color: T.textMuted || DS.textMuted, lineHeight: 1.45,
          }}>
            Estimaciones aproximadas. Pausas, énfasis, acento o cortes de
            edición pueden variar el tiempo final. Calibrado con videos
            virales (180-220 wpm).
          </div>
        </div>
      )}
    </span>
  );
}
