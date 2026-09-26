import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";

// Placeholder "Próximamente" — cubre el área de contenido del workspace con un
// esqueleto decorativo borroso + una tarjeta premium centrada. Theme-aware.
export function ComingSoon({ feature }) {
  const { isDark } = useTheme();

  const bar = (h, w) => (
    <div style={{
      height: h, width: w, borderRadius: 8,
      background: "var(--surface-2)", border: "1px solid var(--line)",
    }} />
  );

  return (
    <div style={{
      position: "relative",
      minHeight: "calc(100vh - 200px)",
      display: "grid", placeItems: "center",
      fontFamily: DS.font, overflow: "hidden",
      padding: 24,
    }}>
      {/* Esqueleto decorativo borroso — NO es el componente real */}
      <div style={{
        position: "absolute", inset: 0,
        filter: "blur(6px)", pointerEvents: "none",
        opacity: isDark ? 0.55 : 0.7,
        padding: 28, display: "flex", flexDirection: "column", gap: 20,
      }}>
        {/* Fila de tarjetas de métricas */}
        <div style={{ display: "flex", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              flex: 1, height: 96, borderRadius: 16,
              background: "var(--surface-2)", border: "1px solid var(--line)",
              padding: 16, display: "flex", flexDirection: "column", gap: 10,
            }}>
              {bar(10, "45%")}
              {bar(22, "62%")}
              {bar(8, "35%")}
            </div>
          ))}
        </div>

        {/* Cuerpo: gráfico de barras faux + columnas kanban faux */}
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          <div style={{
            flex: 2, borderRadius: 16, background: "var(--surface-2)",
            border: "1px solid var(--line)", padding: 20,
            display: "flex", alignItems: "flex-end", gap: 14, minHeight: 260,
          }}>
            {[0.5, 0.75, 0.4, 0.9, 0.62, 0.82, 0.55, 0.7].map((h, i) => (
              <div key={i} style={{
                flex: 1, height: `${h * 100}%`, borderRadius: 8,
                background: "var(--sel-soft)", border: "1px solid var(--line)",
              }} />
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 16, background: "var(--surface-2)",
                border: "1px solid var(--line)", padding: 14,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {bar(12, "55%")}
                {bar(10, "80%")}
                {bar(10, "40%")}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tarjeta premium centrada */}
      <div style={{
        position: "relative", zIndex: 1,
        maxWidth: 380, width: "100%", textAlign: "center",
        background: "var(--surface-solid)", border: "1px solid var(--line)",
        borderRadius: 22, padding: "36px 30px",
        boxShadow: "var(--shadow-lg)",
        backdropFilter: isDark ? "blur(24px) saturate(1.25)" : "none",
        WebkitBackdropFilter: isDark ? "blur(24px) saturate(1.25)" : "none",
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 15, margin: "0 auto 18px",
          background: "rgba(88,166,255,0.14)", display: "grid", placeItems: "center",
          boxShadow: "0 0 0 1px rgba(95,222,240,0.30), 0 0 26px rgba(88,166,255,0.30)",
          color: "var(--neon)",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.5" r="1.2" />
          </svg>
        </div>

        <div style={{
          display: "inline-block", marginBottom: 12,
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--neon)", background: "rgba(88,166,255,0.12)",
          border: "1px solid rgba(95,222,240,0.30)",
          borderRadius: 999, padding: "4px 11px",
        }}>Pronto</div>

        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", marginBottom: 10 }}>
          Próximamente
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-3)" }}>
          Estamos preparando algo muy bueno para vos en{" "}
          <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{feature}</span>.
        </div>
      </div>
    </div>
  );
}

export default ComingSoon;
