import { useState, useEffect } from "react";

// Loader de marca — elegante, theme-aware, con el bolt de Inforce girando dentro
// de un anillo neón y mensajes que rotan para entretener durante la carga.
// Usa las CSS vars (var(--neon), var(--ink)…) así que sigue el tema claro/oscuro.

const DEFAULT_MESSAGES = [
  "Preparando tu tablero…",
  "Trayendo tus empresas…",
  "Sincronizando resultados…",
  "Ordenando los números…",
  "Puliendo los detalles…",
  "Casi listo…",
];

export default function BrandLoader({
  messages = DEFAULT_MESSAGES,
  fullscreen = true,
  label = null, // si se pasa, reemplaza el ciclo de mensajes por un texto fijo
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (label || messages.length <= 1) return;
    const id = setInterval(() => setI((v) => (v + 1) % messages.length), 1700);
    return () => clearInterval(id);
  }, [label, messages.length]);

  const text = label || messages[i];

  return (
    <div
      className="ifl-wrap"
      style={{
        minHeight: fullscreen ? "100vh" : 260,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        background: fullscreen ? "var(--surface-solid)" : "transparent",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div className="ifl-stage">
        <div className="ifl-ring" />
        <div className="ifl-ring ifl-ring-2" />
        <div className="ifl-bolt">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="var(--neon)" />
          </svg>
        </div>
      </div>

      <div className="ifl-textwrap">
        <div className="ifl-msg" key={text}>
          {text}
        </div>
        <div className="ifl-shimmer" />
      </div>

      <style>{`
        .ifl-stage {
          position: relative;
          width: 92px;
          height: 92px;
          display: grid;
          place-items: center;
        }
        .ifl-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 0deg,
            transparent 0deg,
            rgba(95,222,240,0) 90deg,
            var(--neon) 320deg,
            var(--neon) 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          animation: ifl-spin 1.05s cubic-bezier(0.5,0.15,0.5,0.85) infinite;
          opacity: 0.95;
        }
        .ifl-ring-2 {
          inset: 12px;
          background: conic-gradient(from 180deg,
            transparent 0deg,
            var(--sel) 280deg,
            var(--sel) 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
          animation: ifl-spin 1.6s linear infinite reverse;
          opacity: 0.55;
        }
        .ifl-bolt {
          position: relative;
          display: grid;
          place-items: center;
          animation: ifl-breathe 1.9s ease-in-out infinite;
          filter: drop-shadow(0 0 10px rgba(95,222,240,0.75));
        }
        .ifl-textwrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .ifl-msg {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.2px;
          color: var(--ink-2, #A2B5D4);
          animation: ifl-rise 0.5s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .ifl-shimmer {
          width: 132px;
          height: 3px;
          border-radius: 3px;
          background: linear-gradient(90deg,
            transparent 0%,
            var(--neon) 45%,
            var(--sel) 55%,
            transparent 100%);
          background-size: 220% 100%;
          opacity: 0.9;
          animation: ifl-slide 1.3s ease-in-out infinite;
        }
        @keyframes ifl-spin { to { transform: rotate(360deg); } }
        @keyframes ifl-breathe {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(95,222,240,0.55)); }
          50%      { transform: scale(1.12); filter: drop-shadow(0 0 16px rgba(95,222,240,0.95)); }
        }
        @keyframes ifl-rise {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ifl-slide {
          0%   { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ifl-ring, .ifl-ring-2, .ifl-bolt, .ifl-msg, .ifl-shimmer { animation-duration: 0.001ms; animation-iteration-count: 1; }
          .ifl-bolt { filter: drop-shadow(0 0 10px rgba(95,222,240,0.7)); }
        }
      `}</style>
    </div>
  );
}
