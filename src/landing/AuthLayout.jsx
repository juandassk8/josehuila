import { DS } from "../lib/design.js";

const ACCENT = "#4A8FE7"; // azul confianza, único accent

// Layout compartido para signup/login/forgot. Inspirado en Foreplay's split:
// columna izquierda con copy, columna derecha con el form. Estilo minimalista
// negro+blanco con un toque sutil del accent azul.
export function AuthLayout({ leftEyebrow, leftTitle, leftBody, leftFootnote, children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#06060A",
      color: "#fff",
      fontFamily: DS.font,
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    }}>
      {/* Left — branding/copy */}
      <div style={{
        padding: "44px 56px",
        display: "flex", flexDirection: "column",
        background: "#08080D",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Patrón sutil de puntos */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(circle at 30% 30%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 30% 30%, black, transparent 75%)",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Brand />
        </div>
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480 }}>
          {leftEyebrow && (
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.22em",
              color: ACCENT, textTransform: "uppercase", marginBottom: 14,
            }}>{leftEyebrow}</div>
          )}
          <h1 style={{
            fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em",
            lineHeight: 1.15, margin: "0 0 18px",
          }}>{leftTitle}</h1>
          <p style={{
            fontSize: 15, lineHeight: 1.65,
            color: "rgba(255,255,255,0.7)", margin: 0,
          }}>{leftBody}</p>
        </div>
        {leftFootnote && (
          <div style={{
            position: "relative", zIndex: 1,
            fontSize: 11, color: "rgba(255,255,255,0.35)",
            paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>{leftFootnote}</div>
        )}
      </div>

      {/* Right — form */}
      <div style={{
        padding: "44px 56px",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <div style={{
        width: 32, height: 32, borderRadius: 7,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14,
      }}>⚡</div>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.16em", color: "#fff" }}>INFORCE</div>
    </a>
  );
}

export const AUTH_STYLES = {
  ACCENT,
  // Compat: aliases por si quedó algún consumer viejo apuntando a RED.
  RED: ACCENT, RED_DEEP: "#2E5F9A",
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff", fontSize: 14, fontFamily: DS.font,
    outline: "none", boxSizing: "border-box",
    transition: "border-color 120ms",
  },
  inputLabel: {
    display: "block", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.12em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)", marginBottom: 6,
  },
  primaryBtn: {
    width: "100%", padding: "13px 18px", borderRadius: 50,
    border: "none", background: "#fff", color: "#06060A",
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    fontFamily: DS.font, letterSpacing: "0.02em",
    boxShadow: "0 4px 18px rgba(255,255,255,0.10)",
  },
  ghostLink: {
    background: "transparent", border: "none", padding: 0,
    color: ACCENT, fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: DS.font, textDecoration: "underline",
  },
  errorBox: {
    padding: "10px 12px", borderRadius: 8, marginBottom: 14,
    background: "rgba(237,102,99,0.10)", border: "1px solid rgba(237,102,99,0.35)",
    color: "#FF8B8A", fontSize: 12, lineHeight: 1.5,
  },
};
