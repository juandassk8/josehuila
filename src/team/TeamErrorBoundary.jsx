import { Component } from "react";
import { DS } from "../lib/design.js";
import { logger } from "../lib/logger.js";

export class TeamErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // info.componentStack contiene los nombres reales de los componentes
    // (no minificados) — es lo único útil para debuggear React #185 sin
    // source maps. Lo guardamos en state y en sessionStorage para que el
    // user me lo pueda mostrar copy/paste.
    logger.error("[TeamApp crash]", error, info);
    this.setState({ info });
    try {
      sessionStorage.setItem("__teamCrash__", JSON.stringify({
        when: new Date().toISOString(),
        error: String(error),
        stack: error?.stack || "",
        componentStack: info?.componentStack || "",
      }));
    } catch {}
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          background: DS.bg,
          minHeight: "100vh",
          color: DS.textPrimary,
          fontFamily: DS.font,
          padding: "60px 40px",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: DS.red, letterSpacing: "0.18em", marginBottom: 12 }}>
            INFORCE CENTRAL — ERROR
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            Algo rompió el War Room
          </h1>
          <p style={{ color: DS.textSecondary, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            El portal de clientes sigue funcionando normalmente. Solo la zona de equipo está afectada.
          </p>
          <pre
            style={{
              background: "rgba(226,75,74,0.08)",
              border: "1px solid rgba(226,75,74,0.25)",
              borderRadius: DS.radiusSm,
              padding: 16,
              fontSize: 12,
              color: "#ff8b8b",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 320,
              overflow: "auto",
            }}
          >
            {String(this.state.error)}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          {this.state.info?.componentStack && (
            <>
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 16, marginBottom: 6, letterSpacing: "0.04em", fontWeight: 700 }}>
                COMPONENT STACK (nombres reales):
              </div>
              <pre
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: DS.border,
                  borderRadius: DS.radiusSm,
                  padding: 16,
                  fontSize: 11,
                  color: DS.textSecondary,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                {this.state.info.componentStack}
              </pre>
            </>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: "10px 22px",
                borderRadius: 50,
                border: "none",
                background: DS.textPrimary,
                color: DS.bg,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <a
              href="/"
              style={{
                padding: "10px 22px",
                borderRadius: 50,
                border: DS.border,
                color: DS.textSecondary,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Ir al portal de clientes
            </a>
          </div>
        </div>
      </div>
    );
  }
}
