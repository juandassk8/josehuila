import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { VIDEO_TUTORIAL_STEPS, TUTORIAL_TOTAL_STEPS } from "./video_tutorial_steps.js";
import {
  markVideoTutorialCompleted,
  markVideoTutorialSkipped,
  updateVideoTutorialStep,
} from "./onboarding_db.js";
import { setTutorialHighlight } from "./sidebar_highlight.js";

// Onboarding por video — overlay full-screen que aparece la primera vez que
// un cliente entra a su workspace. Pasos:
//   -1: Welcome card (intro + botón Empezar)
//    0..4: Video por sección (Resumen, Reportes, Despliegue, Pipeline, Tareas)
//    5: Done card (felicitaciones + cerrar)
//
// Mientras un video está activo, dispara setTutorialHighlight(sectionKey) para
// que el sidebar de CompanyWorkspace destaque el ítem correspondiente.

const ACCENT = "#1DB97A";
const ACCENT_DARK = "#0F7B6C";
const NEON = "#3DD9FF";

// CSS keyframes inyectados una vez (animación del borde futurista + glow + loader).
const keyframesId = "video-onboarding-keyframes";
function injectKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(keyframesId)) return;
  const style = document.createElement("style");
  style.id = keyframesId;
  style.textContent = `
    @keyframes vo-border-shift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes vo-glow-pulse {
      0%, 100% { opacity: 0.55; transform: scale(1); }
      50%      { opacity: 0.95; transform: scale(1.02); }
    }
    @keyframes vo-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes vo-loader-spin-cw  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes vo-loader-spin-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
    @keyframes vo-loader-pulse {
      0%, 100% { transform: scale(1);   opacity: 1; }
      50%      { transform: scale(1.18); opacity: 0.75; }
    }
    @keyframes vo-loader-shimmer {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes vo-loader-dots {
      0%, 20%   { content: ""; }
      40%       { content: "."; }
      60%       { content: ".."; }
      80%, 100% { content: "..."; }
    }
  `;
  document.head.appendChild(style);
}

export function VideoOnboarding({ identity, initialStep = -1, onClose, persistProgress = true }) {
  const { isDark } = useTheme();
  const T = DS;
  const [step, setStep] = useState(initialStep);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0); // 0..1
  const [exitTimer, setExitTimer] = useState(0); // seconds remaining before "Salir" enabled
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const videoRef = useRef(null);

  useEffect(() => { injectKeyframes(); }, []);

  // Lock body scroll mientras el overlay está visible.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Highlight del sidebar según el step.
  useEffect(() => {
    if (step >= 0 && step < TUTORIAL_TOTAL_STEPS) {
      setTutorialHighlight(VIDEO_TUTORIAL_STEPS[step].sectionKey);
    } else {
      setTutorialHighlight(null);
    }
    return () => setTutorialHighlight(null);
  }, [step]);

  // Persist step index en la DB cuando cambia (para resumir si cierran navegador).
  // En modo "manual" (botón Ver tutoriales) NO persistimos — es solo replay.
  useEffect(() => {
    if (!persistProgress) return;
    if (!identity?.identityKey) return;
    if (step < 0 || step >= TUTORIAL_TOTAL_STEPS) return;
    updateVideoTutorialStep(identity.identityKey, step);
  }, [step, identity?.identityKey, persistProgress]);

  // Reset video state al cambiar de step. Mostramos loader hasta que el
  // video esté listo para reproducir.
  useEffect(() => {
    setVideoEnded(false);
    setVideoProgress(0);
    setFakeProgress(0);
    if (step >= 0 && step < TUTORIAL_TOTAL_STEPS) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = 0;
      } catch { /* */ }
    }
  }, [step]);

  // Avance del fake progress: rápido al inicio, asintótico hacia 92%.
  // Cuando el video carga de verdad, salta a 100% y el loader se oculta.
  useEffect(() => {
    if (!isLoading) return;
    const id = setInterval(() => {
      setFakeProgress((p) => {
        if (p >= 92) return p; // se queda en 92 hasta que cargue real
        return p + (92 - p) * 0.06;
      });
    }, 80);
    return () => clearInterval(id);
  }, [isLoading]);

  const handleVideoReady = () => {
    setFakeProgress(100);
    // pequeño delay para que el user vea el 100% antes de fade out
    setTimeout(() => setIsLoading(false), 220);
    playUnmuted();
  };

  const handleVideoWaiting = () => {
    // re-buffering durante reproducción
    setIsLoading(true);
    setFakeProgress((p) => Math.min(p, 70));
  };

  const handleVideoPlaying = () => {
    setFakeProgress(100);
    setTimeout(() => setIsLoading(false), 150);
  };

  const playUnmuted = () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.muted = false;
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        });
      }
    } catch { /* */ }
  };

  // Countdown de 5s para habilitar "Salir" cada vez que entrás a un step.
  useEffect(() => {
    if (step < 0 || step >= TUTORIAL_TOTAL_STEPS) {
      setExitTimer(0);
      return;
    }
    setExitTimer(5);
    const id = setInterval(() => {
      setExitTimer((t) => {
        if (t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const currentStep = step >= 0 && step < TUTORIAL_TOTAL_STEPS ? VIDEO_TUTORIAL_STEPS[step] : null;
  const canAdvance = videoEnded || videoProgress >= 0.8;
  const canExit = exitTimer === 0;

  const handleSkipAll = async () => {
    if (persistProgress && identity?.identityKey) {
      await markVideoTutorialSkipped(identity.identityKey);
    }
    setTutorialHighlight(null);
    onClose?.();
  };

  const handleFinish = async () => {
    if (persistProgress && identity?.identityKey) {
      await markVideoTutorialCompleted(identity.identityKey);
    }
    setTutorialHighlight(null);
    onClose?.();
  };

  const goNext = () => {
    if (step + 1 >= TUTORIAL_TOTAL_STEPS) setStep(TUTORIAL_TOTAL_STEPS); // done
    else setStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
    else setStep(-1); // back to welcome
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100000,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: T.font,
    }}>
      <FuturisticCard step={step} videoEndedKey={`s${step}-${videoEnded}`}>
        {step === -1 && (
          <WelcomeStep
            identity={identity}
            onStart={() => setStep(0)}
            onSkipAll={handleSkipAll}
          />
        )}
        {currentStep && (
          <VideoStep
            step={step}
            data={currentStep}
            videoRef={videoRef}
            onProgress={setVideoProgress}
            onEnded={() => { setVideoEnded(true); }}
            onLoadedData={handleVideoReady}
            onWaiting={handleVideoWaiting}
            onPlaying={handleVideoPlaying}
            isLoading={isLoading}
            fakeProgress={fakeProgress}
            canAdvance={canAdvance}
            canExit={canExit}
            exitTimer={exitTimer}
            onBack={step > 0 ? goBack : null}
            onNext={goNext}
            onSkipAll={handleSkipAll}
          />
        )}
        {step === TUTORIAL_TOTAL_STEPS && (
          <DoneStep onFinish={handleFinish} />
        )}
      </FuturisticCard>
    </div>
  );
}

// Tarjeta con borde gradient animado + glow exterior.
function FuturisticCard({ children, videoEndedKey }) {
  const { isDark } = useTheme();
  const T = DS;
  return (
    <div style={{ position: "relative", maxWidth: 880, width: "100%" }}>
      {/* Glow exterior pulsante */}
      <div style={{
        position: "absolute", inset: -20, borderRadius: 28,
        background: `radial-gradient(60% 50% at 50% 50%, ${ACCENT}30, transparent 70%), radial-gradient(50% 50% at 80% 20%, ${NEON}25, transparent 60%)`,
        filter: "blur(24px)",
        animation: "vo-glow-pulse 3.5s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      {/* Borde gradient animado (técnica con padding y two-layer bg) */}
      <div style={{
        position: "relative",
        padding: 2,
        borderRadius: 22,
        background: `linear-gradient(110deg, ${ACCENT}, ${NEON}, #B57BFF, ${ACCENT})`,
        backgroundSize: "300% 300%",
        animation: "vo-border-shift 6s ease infinite",
      }}>
        <div style={{
          background: isDark ? "#0B0B11" : "#0F1218",
          borderRadius: 20,
          overflow: "hidden",
          color: T.textPrimary,
          fontFamily: T.font,
          animation: "vo-fade-in 250ms ease",
        }} key={videoEndedKey}>
          {children}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ identity, onStart, onSkipAll }) {
  const T = DS;
  const name = identity?.displayName?.split(" ")?.[0] || "";
  return (
    <div style={{ padding: "44px 44px 36px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>👋</div>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.24em",
        color: ACCENT, textTransform: "uppercase", marginBottom: 10,
      }}>Bienvenido</div>
      <h1 style={{
        fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em",
        margin: "0 0 14px", color: "#fff", lineHeight: 1.15,
      }}>
        {name ? `Hola ${name}, ` : "Hola, "} mirá cómo funciona tu plataforma
      </h1>
      <p style={{
        fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.72)",
        maxWidth: 560, margin: "0 auto 28px",
      }}>
        Te grabé 5 tutoriales cortos (uno por sección) para que entiendas todo en pocos minutos.
        Después podés volver a verlos cuando quieras desde Ajustes.
      </p>
      <button
        onClick={onStart}
        style={{
          padding: "13px 28px", borderRadius: 50, border: "none",
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
          color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: T.font, letterSpacing: "0.02em",
          boxShadow: `0 6px 22px ${ACCENT}55`,
        }}
      >▶ Empezar tutorial</button>
      <div style={{ marginTop: 18 }}>
        <button
          onClick={onSkipAll}
          style={{
            background: "transparent", border: "none",
            color: "rgba(255,255,255,0.4)", cursor: "pointer",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            fontFamily: T.font,
          }}
        >Saltar tutoriales</button>
      </div>
    </div>
  );
}

function VideoStep({ step, data, videoRef, onProgress, onEnded, onLoadedData, onWaiting, onPlaying, isLoading, fakeProgress, canAdvance, canExit, exitTimer, onBack, onNext, onSkipAll }) {
  const T = DS;

  const handleTime = (e) => {
    const el = e.currentTarget;
    if (el.duration > 0) onProgress(el.currentTime / el.duration);
  };

  return (
    <div>
      {/* Header con step indicator */}
      <div style={{
        padding: "14px 22px",
        background: "linear-gradient(135deg, rgba(29,185,122,0.18), rgba(61,217,255,0.06))",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.20em",
          color: "rgba(255,255,255,0.6)", textTransform: "uppercase",
        }}>
          Tutorial · Paso {step + 1} de {TUTORIAL_TOTAL_STEPS}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 5 }}>
          {VIDEO_TUTORIAL_STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 50,
              background: i < step ? ACCENT
                       : i === step ? `linear-gradient(90deg, ${ACCENT}, ${NEON})`
                       : "rgba(255,255,255,0.18)",
              transition: "width 200ms ease, background 200ms ease",
            }} />
          ))}
        </div>
      </div>

      {/* Title + description */}
      <div style={{ padding: "26px 32px 14px" }}>
        <h2 style={{
          fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em",
          margin: "0 0 8px", color: "#fff",
        }}>{data.title}</h2>
        <p style={{
          fontSize: 13.5, lineHeight: 1.55, color: "rgba(255,255,255,0.7)",
          margin: 0, maxWidth: 720,
        }}>{data.description}</p>
      </div>

      {/* Video */}
      <div style={{ padding: "0 32px" }}>
        <div style={{
          position: "relative", borderRadius: 12, overflow: "hidden",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
        }}>
          <video
            key={data.videoUrl}
            ref={videoRef}
            src={data.videoUrl}
            controls
            controlsList="nodownload"
            playsInline
            preload="auto"
            onTimeUpdate={handleTime}
            onLoadedData={onLoadedData}
            onCanPlay={onLoadedData}
            onWaiting={onWaiting}
            onPlaying={onPlaying}
            onEnded={onEnded}
            style={{ display: "block", width: "100%", maxHeight: "55vh", objectFit: "contain" }}
          />
          {isLoading && <VideoLoader progress={fakeProgress} />}
        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        padding: "18px 22px 22px",
        marginTop: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.012)",
      }}>
        <button
          onClick={onSkipAll}
          disabled={!canExit}
          style={{
            background: "transparent", border: "none",
            color: canExit ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
            cursor: canExit ? "pointer" : "default",
            fontSize: 11, fontWeight: 600, fontFamily: T.font,
            padding: "6px 4px", letterSpacing: "0.04em",
          }}
        >
          {canExit ? "Salir tutorial" : `Salir disponible en ${exitTimer}s…`}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                padding: "9px 16px", borderRadius: 50,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent", color: "rgba(255,255,255,0.7)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: T.font,
              }}
            >← Atrás</button>
          )}
          <button
            onClick={onNext}
            disabled={!canAdvance}
            title={canAdvance ? "" : "Mirá el video para continuar"}
            style={{
              padding: "9px 22px", borderRadius: 50, border: "none",
              background: canAdvance
                ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`
                : "rgba(255,255,255,0.06)",
              color: canAdvance ? "#fff" : "rgba(255,255,255,0.35)",
              fontSize: 12, fontWeight: 700,
              cursor: canAdvance ? "pointer" : "not-allowed",
              fontFamily: T.font, letterSpacing: "0.02em",
              boxShadow: canAdvance ? `0 6px 18px ${ACCENT}55` : "none",
              transition: "background 200ms ease",
            }}
          >
            {step + 1 >= TUTORIAL_TOTAL_STEPS ? "Terminar →" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Loader minimalista B&W. Apple-style: una barra ultradelgada,
// label sutil, porcentaje pequeño. Cero glow, cero color, cero spinners.
// Mucho whitespace y elegancia.
function VideoLoader({ progress = 0 }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 18,
      background: "#000",
      animation: "vo-fade-in 200ms ease",
      fontFamily: DS.font,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: "rgba(255,255,255,0.55)",
        letterSpacing: "0.20em", textTransform: "uppercase",
      }}>
        Cargando
      </div>

      {/* Barra ultradelgada */}
      <div style={{
        width: "min(220px, 50%)",
        height: 2, borderRadius: 1,
        background: "rgba(255,255,255,0.10)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: 0, right: "auto",
          width: `${pct}%`, height: "100%",
          background: "#fff",
          transition: "width 200ms ease-out",
        }} />
      </div>

      <div style={{
        fontSize: 11, fontWeight: 500,
        color: "rgba(255,255,255,0.40)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.04em",
      }}>
        {pct}%
      </div>
    </div>
  );
}

function DoneStep({ onFinish }) {
  const T = DS;
  return (
    <div style={{ padding: "48px 44px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 60, marginBottom: 14, lineHeight: 1 }}>🎉</div>
      <h1 style={{
        fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em",
        margin: "0 0 14px", color: "#fff", lineHeight: 1.15,
      }}>¡Listo! Ya tenés todo el contexto.</h1>
      <p style={{
        fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.72)",
        maxWidth: 520, margin: "0 auto 28px",
      }}>
        Si te queda alguna duda, podés volver a ver los tutoriales en cualquier
        momento desde Ajustes, o usar el botón "?" en cada sección para tours guiados.
      </p>
      <button
        onClick={onFinish}
        style={{
          padding: "13px 30px", borderRadius: 50, border: "none",
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
          color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: T.font, letterSpacing: "0.02em",
          boxShadow: `0 6px 22px ${ACCENT}55`,
        }}
      >Empezar a trabajar →</button>
    </div>
  );
}
