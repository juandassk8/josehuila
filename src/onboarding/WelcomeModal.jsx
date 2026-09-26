import { useEffect, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { markWelcomeCompleted } from "./onboarding_db.js";

// Modal de bienvenida — 5 slides, primer login. Bloquea la UI hasta que el
// user lo completa o lo salta. En cualquier caso se marca como completado
// para no re-mostrarlo.

const SLIDES = [
  {
    title: "Bienvenido al Portal Inforce",
    body: "Acá vas a centralizar todo lo que antes tenías en Drive, Notion, ClickUp y Excel: tu equipo, tus reportes, tu contenido, tu creatividad y tu escalamiento. Te voy a hacer un tour rápido de 2 minutos para que sepas qué hace cada parte.",
    emoji: "👋",
  },
  {
    title: "Tu operación se divide en 3 partes",
    bodyParts: [
      { icon: "🎯", label: "Estrategia", text: "War Room, Equipo, Tareas" },
      { icon: "📊", label: "Análisis", text: "Reportes, Calculadora de Escalamiento" },
      { icon: "🎬", label: "Producción", text: "Despliegue Creativo, Planeación, Pipeline, Guionista IA" },
    ],
    footer: "Todo conectado. Lo que pasa en una parte alimenta a las otras.",
    emoji: "🧭",
  },
  {
    title: "Lo que vas a configurar primero",
    bodyParts: [
      { icon: "1.", label: "Crear tu equipo", text: "roles, correos, cumpleaños" },
      { icon: "2.", label: "Subir tus objetivos y benchmarks", text: "ROAS, CPA, CTR, CPM" },
      { icon: "3.", label: "Armar tu despliegue creativo", text: "TOFU / MOFU / BOFU" },
    ],
    footer: "Con eso ya la plataforma empieza a trabajar para vos.",
    emoji: "⚙️",
  },
  {
    title: "La magia está en la repetición",
    body: "Esto no es un software de 'configurar una vez y ya'. Cada semana vas a:",
    bullets: [
      "Planear tus creativos (Content Pipeline)",
      "Calificar los anuncios que testearon",
      "Generar tu reporte",
    ],
    footer: "Entre más data metas, mejor te recomienda.",
    emoji: "🔁",
  },
  {
    title: "Dónde pedir ayuda",
    bodyParts: [
      { icon: "📖", label: "Tutorial por sección", text: "Botón \"?\" arriba a la derecha en cada vista" },
      { icon: "💬", label: "Botón Feedback flotante", text: "Reportame cualquier bug o sugerencia" },
      { icon: "🧠", label: "Tutoriales en video", text: "Próximamente en sección Ayuda" },
    ],
    footer: "Listo. Vamos a configurarte el equipo.",
    emoji: "🚀",
    primaryCta: "Empezar con el equipo →",
  },
];

export function WelcomeModal({ identity, onClose, onGoToTeam }) {
  const { isDark } = useTheme();
  const T = DS;
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const slide = SLIDES[step];

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" && step < SLIDES.length - 1) setStep(step + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step]);

  const finalize = async (action) => {
    if (closing) return;
    setClosing(true);
    try {
      if (identity?.identityKey) await markWelcomeCompleted(identity.identityKey);
    } catch { /* fail-silent — la UX no se traba si la DB falla */ }
    if (action === "goToTeam") onGoToTeam?.();
    onClose?.();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.78)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
      fontFamily: T.font,
    }}>
      <div style={{
        width: "min(640px, 100%)",
        background: isDark ? "#14141A" : "#FFFFFF",
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
        borderRadius: 22,
        boxShadow: "0 30px 90px rgba(0,0,0,0.45)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Stripe accent + step dots */}
        <div style={{
          padding: "14px 22px",
          background: "linear-gradient(135deg, rgba(29,185,122,0.14), rgba(15,123,108,0.06))",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
            color: T.textMuted, textTransform: "uppercase",
          }}>
            Bienvenida · Paso {step + 1} de {SLIDES.length}
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 5 }}>
            {SLIDES.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 22 : 7, height: 7,
                  borderRadius: 50,
                  background: i === step
                    ? "linear-gradient(90deg, #1DB97A, #0F7B6C)"
                    : (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"),
                  transition: "width 200ms ease, background 200ms ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{
          padding: "36px 36px 28px",
          minHeight: 300,
        }}>
          <div style={{ fontSize: 44, marginBottom: 18, lineHeight: 1 }}>
            {slide.emoji}
          </div>
          <div style={{
            fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
            color: T.textPrimary, marginBottom: 14, lineHeight: 1.2,
          }}>
            {slide.title}
          </div>

          {slide.body && (
            <div style={{
              fontSize: 14, lineHeight: 1.65, color: T.textSecondary,
              marginBottom: slide.bullets || slide.bodyParts ? 14 : 0,
            }}>
              {slide.body}
            </div>
          )}

          {slide.bullets && (
            <ul style={{ margin: "0 0 0 0", padding: 0, listStyle: "none" }}>
              {slide.bullets.map((b, i) => (
                <li key={i} style={{
                  fontSize: 14, color: T.textSecondary,
                  lineHeight: 1.55, padding: "5px 0",
                  display: "flex", gap: 9,
                }}>
                  <span style={{ color: "#1DB97A", fontWeight: 700 }}>•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.bodyParts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              {slide.bodyParts.map((p, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "11px 14px", borderRadius: 12,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
                  border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.04)",
                }}>
                  <div style={{
                    fontSize: 17, flexShrink: 0,
                    color: "#1DB97A", fontWeight: 700,
                    minWidth: 22,
                  }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.textPrimary, marginBottom: 2 }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: T.textMuted, lineHeight: 1.4 }}>
                      {p.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {slide.footer && (
            <div style={{
              fontSize: 13, color: T.textSecondary, lineHeight: 1.55,
              marginTop: 18, fontStyle: "italic",
            }}>
              {slide.footer}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{
          padding: "14px 22px",
          borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.012)",
        }}>
          <button
            onClick={() => finalize("skip")}
            style={{
              background: "transparent", border: "none",
              color: T.textMuted, cursor: "pointer",
              fontSize: 11.5, fontWeight: 600, fontFamily: T.font,
              padding: "6px 4px",
            }}
          >
            Saltar tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  padding: "8px 14px", borderRadius: 50,
                  border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)",
                  background: "transparent", color: T.textSecondary,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: T.font,
                }}
              >
                ← Atrás
              </button>
            )}
            {step < SLIDES.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                style={{
                  padding: "8px 18px", borderRadius: 50, border: "none",
                  background: "linear-gradient(135deg, #1DB97A, #0F7B6C)",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: T.font, letterSpacing: "0.02em",
                }}
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={() => finalize("goToTeam")}
                style={{
                  padding: "8px 18px", borderRadius: 50, border: "none",
                  background: "linear-gradient(135deg, #1DB97A, #0F7B6C)",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: T.font, letterSpacing: "0.02em",
                }}
              >
                {slide.primaryCta || "Empezar →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
