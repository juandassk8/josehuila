import { DS } from "../lib/design.js";

// Landing page pública en portal.inforceconsulting.com/.
// Estilo: minimalista estilo Foreplay — negro + blanco + un solo accent azul.
// Verde solo en métricas de crecimiento. TOFU/MOFU/BOFU mantienen sus colores
// semánticos (verde/amarillo/rojo) porque el cliente los reconoce del producto.

const C = {
  bg:        "#06060A",
  cardBg:    "#0E0E14",
  cardBgHi:  "#13131B",
  border:    "rgba(255,255,255,0.06)",
  borderHi:  "rgba(255,255,255,0.10)",
  text:      "#fff",
  textMuted: "rgba(255,255,255,0.65)",
  textHint:  "rgba(255,255,255,0.42)",
  accent:    "#4A8FE7",   // único accent — azul confianza
  growth:    "#1DB97A",   // solo para métricas positivas
  // semánticos del funnel — internos del producto, no decoración
  tofu:      "#1DB97A",
  mofu:      "#F5A623",
  bofu:      "#E24B4A",
};

// Helper: format pesos colombianos.
const cop = (n, suffix = "M") => `$${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}${suffix}`;

export function LandingPage({ onCtaSignup, onCtaLogin }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: DS.font,
      position: "relative",
      overflow: "hidden",
    }}>
      <BackgroundDots />
      <Nav onSignup={onCtaSignup} onLogin={onCtaLogin} />
      <Hero onSignup={onCtaSignup} />
      <SocialProof />

      <FeatureBlock
        eyebrow="DESPLIEGUE CREATIVO"
        title="Planificá tus creativos por etapa del funnel."
        body="TOFU, MOFU, BOFU con conceptos y ángulos por bucket. Cumplimiento semanal según tu inversión, simulador de escala y revisión por slot."
        bullets={[
          "Conceptos agrupados por stage del funnel",
          "Meta semanal calculada según tu kill-rule",
          "Banco de creativos cross-marca",
          "Revisión por slot con feedback estructurado",
        ]}
        align="left"
        mockup="despliegue"
      />

      <FeatureBlock
        eyebrow="REPORTES UNIFICADOS"
        title="Meta Ads + Shopify en un solo dashboard."
        body="Conectás tus integraciones una vez y ves todo unificado: ventas reales, ROAS, costo por compra, evolución del período. Detección automática de ganadores."
        bullets={[
          "Curva de ventas vs período anterior",
          "Desglose por campaña, conjunto y anuncio",
          "Quadrants automáticos: winner / underdog / bleeder",
          "Costo por compra y CPM con benchmarks",
        ]}
        align="right"
        mockup="reportes"
      />

      <FeatureBlock
        eyebrow="CONTENT PIPELINE + GUIONISTA IA"
        title="De idea a publicación, con IA que aprende tu marca."
        body="Pipeline visual con asignaciones, fechas y handoffs. La IA del Guionista escribe usando tu voice profile y los formatos exitosos de tu nicho."
        bullets={[
          "Pipeline TOFU/MOFU/BOFU con drag-and-drop",
          "Guionista IA entrenado con tus formatos",
          "Asignación a UGCs / diseñadores con deadline",
        ]}
        align="left"
        mockup="pipeline"
      />

      <FeatureBlock
        eyebrow="TAREAS + EQUIPO"
        title="Gestión completa de tu operación."
        body="Tareas con espacios y subespacios anidados, recurrencias, timer integrado, asignaciones múltiples. Vista de equipo para saber qué está haciendo cada uno."
        bullets={[
          "Espacios anidados (Marketing / Anuncios / Logística…)",
          "Tareas recurrentes con plantillas",
          "Timer integrado por tarea",
          "War Room en vivo del equipo",
        ]}
        align="right"
        mockup="tareas"
      />

      <FeatureBlock
        eyebrow="CENTRO DE COMANDO"
        title="Tu negocio en un panel."
        body="Ventas del período, KPIs vs benchmarks de tu nicho, campañas en vivo, pipeline de la semana. Todo lo que necesitás de un vistazo cada mañana."
        bullets={[
          "Ventas en COP con comparación vs período anterior",
          "Gasto, ROAS, compras, costo por compra",
          "Top de campañas y creativos vivos",
          "Activity feed live del equipo",
        ]}
        align="left"
        mockup="resumen"
      />

      <Pricing onSignup={onCtaSignup} />
      <FinalCta onSignup={onCtaSignup} />
      <Footer />
    </div>
  );
}

function BackgroundDots() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
      backgroundSize: "32px 32px",
      maskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)",
      WebkitMaskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)",
    }} />
  );
}

function Nav({ onSignup, onLogin }) {
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      padding: "16px 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "rgba(6,6,10,0.78)",
      backdropFilter: "blur(16px)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <Brand />
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onLogin}
          style={{
            padding: "8px 16px", borderRadius: 50, border: "none",
            background: "transparent", color: C.textMuted,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >Iniciar sesión</button>
        <PrimaryButton onClick={onSignup} small>Empezar prueba gratis</PrimaryButton>
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14,
      }}>⚡</div>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.16em" }}>INFORCE</div>
    </div>
  );
}

// Botón primary minimalista — blanco sólido, hover brillo sutil.
function PrimaryButton({ children, onClick, small, full }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "9px 18px" : "14px 26px",
        borderRadius: 50, border: "none",
        background: "#fff", color: "#06060A",
        fontSize: small ? 13 : 14, fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit",
        letterSpacing: "0.02em",
        width: full ? "100%" : "auto",
        boxShadow: "0 4px 18px rgba(255,255,255,0.10)",
        transition: "transform 120ms ease",
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
    >{children} →</button>
  );
}

function Hero({ onSignup }) {
  return (
    <section style={{
      position: "relative", zIndex: 1,
      padding: "100px 32px 60px",
      maxWidth: 1200, margin: "0 auto",
      textAlign: "center",
    }}>
      <div style={{
        display: "inline-block",
        padding: "5px 12px", borderRadius: 50,
        background: "rgba(74,143,231,0.08)", border: "1px solid rgba(74,143,231,0.30)",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
        color: C.accent, marginBottom: 24,
      }}>14 DÍAS GRATIS · SIN TARJETA</div>
      <h1 style={{
        fontSize: "clamp(40px, 7vw, 78px)",
        fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.04,
        margin: "0 0 20px",
        background: "linear-gradient(180deg, #fff, rgba(255,255,255,0.55))",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        Centralizá tu operación creativa.
      </h1>
      <p style={{
        fontSize: 17, lineHeight: 1.65,
        color: C.textMuted, maxWidth: 660,
        margin: "0 auto 36px",
      }}>
        El sistema operativo que reemplaza Drive, Notion, ClickUp y Excel para
        agencias y marcas que escalan con paid media. Un solo panel, todo conectado.
      </p>
      <PrimaryButton onClick={onSignup}>Empezar mi prueba gratis</PrimaryButton>

      {/* Hero mockup — el dashboard del Centro de Comando */}
      <div style={{
        marginTop: 64, position: "relative",
        borderRadius: 14, overflow: "hidden",
        border: `1px solid ${C.borderHi}`,
        background: C.cardBg,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
      }}>
        <MockupReportes />
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section style={{
      position: "relative", zIndex: 1,
      padding: "60px 32px 40px",
      maxWidth: 1100, margin: "0 auto",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
        color: C.textHint, textTransform: "uppercase",
        marginBottom: 20,
      }}>
        Hecho para agencias y marcas que escalan con paid media
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "24px 48px",
        justifyContent: "center", alignItems: "center",
      }}>
        {["Suplementos", "Beauty", "Moda", "DTC", "Servicios", "Tech"].map((s) => (
          <div key={s} style={{
            fontSize: 13, fontWeight: 700, letterSpacing: "0.10em",
            color: C.textHint,
          }}>{s}</div>
        ))}
      </div>
    </section>
  );
}

function FeatureBlock({ eyebrow, title, body, bullets, align = "left", mockup }) {
  const isLeft = align === "left";
  return (
    <section style={{
      position: "relative", zIndex: 1,
      padding: "70px 32px",
      maxWidth: 1200, margin: "0 auto",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.25fr)",
        gap: 64, alignItems: "center",
      }}>
        <div style={{ order: isLeft ? 1 : 2 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
            color: C.accent, textTransform: "uppercase", marginBottom: 14,
          }}>{eyebrow}</div>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800,
            letterSpacing: "-0.02em", lineHeight: 1.15,
            margin: "0 0 18px", color: C.text,
          }}>{title}</h2>
          <p style={{
            fontSize: 15, lineHeight: 1.65,
            color: C.textMuted, margin: "0 0 22px",
          }}>{body}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "7px 0",
                fontSize: 13.5, color: "rgba(255,255,255,0.85)",
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid rgba(255,255,255,0.18)`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 2,
                  color: C.text, fontSize: 9, fontWeight: 800,
                }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{
          order: isLeft ? 2 : 1,
          borderRadius: 13, overflow: "hidden",
          border: `1px solid ${C.borderHi}`,
          background: C.cardBg,
          aspectRatio: "16/10",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}>
          <Mockup type={mockup} />
        </div>
      </div>
    </section>
  );
}

function Mockup({ type }) {
  if (type === "despliegue") return <MockupDespliegue />;
  if (type === "reportes") return <MockupReportes />;
  if (type === "pipeline") return <MockupPipeline />;
  if (type === "tareas") return <MockupTareas />;
  if (type === "resumen") return <MockupReportes />; // mismo dashboard
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// MOCKUP: Reportes / Centro de comando
// Réplica visual del dashboard real (curva ventas + KPIs + tabla campañas)
// con números en COP. Basado en imagen 43.
// ─────────────────────────────────────────────────────────────────────
function MockupReportes() {
  return (
    <div style={{ width: "100%", height: "100%", padding: "16px 18px", fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Top row: curve chart + 4 KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 10 }}>
        <ChartCard />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 8 }}>
          <KpiTile label="Gasto"        value="$50.69M"  delta="-20.3%" deltaUp={false} />
          <KpiTile label="ROAS"         value="3.60×"    delta="-8.7%"  deltaUp={false} />
          <KpiTile label="Compras"      value="1,119"    delta="-25.1%" deltaUp={false} />
          <KpiTile label="Costo/compra" value="$45K"     delta="+6.3%"  deltaUp />
        </div>
      </div>
      {/* Campañas table preview */}
      <div style={{ padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(0,0,0,0.25)", flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: C.textHint, marginBottom: 8 }}>
          META ADS MANAGER · 7 CAMPAÑAS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.7fr 0.6fr 0.6fr", gap: 8, fontSize: 9, fontWeight: 700, color: C.textHint, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
          <span>NOMBRE</span><span>GASTO</span><span>COMPRAS</span><span>COSTO</span><span>ROAS</span>
        </div>
        {[
          ["REFRESH ❤️ ONE / ACNE PECHO",  "$266K", "6", "$44K",  "5.06×", C.tofu],
          ["REFRESH ❤️ ONE / ACNE ROSTRO", "$222K", "2", "$111K", "1.42×", C.bofu],
          ["ANDRÓMEDA · LUNASITOL · CBO",  "$209K", "4", "$52K",  "3.02×", C.mofu],
          ["ANDRÓMEDA · LUNASITOL · BRIEF","$152K", "3", "$50K",  "3.30×", C.mofu],
        ].map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.7fr 0.6fr 0.6fr", gap: 8, fontSize: 10, padding: "5px 0", color: "rgba(255,255,255,0.78)", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row[0]}</span>
            <span>{row[1]}</span>
            <span style={{ color: C.growth }}>{row[2]}</span>
            <span>{row[3]}</span>
            <span style={{ color: row[5], fontWeight: 700 }}>{row[4]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard() {
  // Datos simulados para una curva de ventas en pesos colombianos.
  // Y-axis hasta ~$10M COP. La línea real va variando.
  const points = [
    { x: 0,   y: 80 },  // 6 abr — alto
    { x: 8,   y: 90 },
    { x: 15,  y: 50 },  // bajón
    { x: 22,  y: 38 },
    { x: 30,  y: 60 },  // 13 abr — recuperación
    { x: 42,  y: 62 },
    { x: 55,  y: 60 },
    { x: 68,  y: 60 },
    { x: 75,  y: 50 },  // 20 abr
    { x: 82,  y: 50 },
    { x: 88,  y: 45 },
    { x: 92,  y: 50 },
    { x: 96,  y: 70 },  // 27 abr — pico
    { x: 100, y: 35 },  // 4 may — final
  ];
  const w = 100, h = 100;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${h - p.y}`).join(" ");
  const areaPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: C.textHint, marginBottom: 4 }}>
        VENTAS DEL PERÍODO
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: C.growth, letterSpacing: "-0.02em" }}>$425.78M</span>
        <span style={{ fontSize: 11, color: C.growth, fontWeight: 700 }}>↑ 1,017.6%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 110, display: "block" }}>
        <defs>
          <linearGradient id="lpgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.growth} stopOpacity="0.30" />
            <stop offset="100%" stopColor={C.growth} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#lpgrad)" />
        <path d={path} fill="none" stroke={C.growth} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textHint, marginTop: 4 }}>
        <span>6 abr</span><span>13 abr</span><span>20 abr</span><span>27 abr</span><span>4 may</span>
      </div>
    </div>
  );
}

function KpiTile({ label, value, delta, deltaUp }) {
  const deltaColor = deltaUp ? C.growth : "#ED6663";
  return (
    <div style={{ padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.textHint, letterSpacing: "0.14em" }}>{label.toUpperCase()}</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 9.5, color: deltaColor, fontWeight: 700, marginTop: 2 }}>
          {deltaUp ? "↑" : "↓"} {delta.replace(/[+-]/, "")}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MOCKUP: Despliegue Creativo — TOFU / MOFU / BOFU canvas
// Basado en imágenes 41 y 42.
// ─────────────────────────────────────────────────────────────────────
function MockupDespliegue() {
  return (
    <div style={{ width: "100%", height: "100%", padding: "14px 16px", fontFamily: DS.font, position: "relative", display: "flex" }}>
      {/* Canvas central */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingRight: 12 }}>
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", color: C.text, marginBottom: 4 }}>
          DESPLIEGUE: <span style={{ color: C.textMuted }}>@MASCCOL</span>
        </div>
        <FunnelStage label="Top Of The Funnel"    color={C.tofu} subtitle="Atraer público nuevo"   concepts={["Directo", "Si eres…", "Consejo", "Pregunta"]} />
        <FunnelStage label="Middle Of The Funnel" color={C.mofu} subtitle="Considerar y confiar"   concepts={["Nosotros vs ellos", "Persona", "Este es…", "Clon"]} />
        <FunnelStage label="Bottom Of The Funnel" color={C.bofu} subtitle="Convertir y cerrar"     concepts={["Testimonios", "Carrusel"]} />
      </div>
      {/* Panel lateral con meta semanal */}
      <div style={{ width: 130, padding: "10px 11px", border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(0,0,0,0.30)", display: "flex", flexDirection: "column", gap: 6, alignSelf: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textHint, letterSpacing: "0.12em" }}>META SEMANAL</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.growth }}>11 creativos</div>
        <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
        <div style={{ fontSize: 9, color: C.textMuted }}>Cumplimiento</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: C.bofu }}>
          <span>0 / 11</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />
        {[
          ["TOFU", "0/7", C.tofu],
          ["MOFU", "0/3", C.mofu],
          ["BOFU", "0/1", C.bofu],
        ].map(([t, n, col]) => (
          <div key={t} style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: col, fontWeight: 700 }}>
            <span>{t}</span><span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelStage({ label, subtitle, color, concepts }) {
  return (
    <div style={{ borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,0.015)", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 8.5, color: C.textHint, marginBottom: 6 }}>{subtitle}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {concepts.map((c) => (
          <div key={c} style={{
            padding: "4px 8px", borderRadius: 5,
            background: `${color}14`, border: `1px solid ${color}40`,
            fontSize: 9.5, color: "rgba(255,255,255,0.82)", fontWeight: 600,
          }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MOCKUP: Pipeline (sobrio)
// ─────────────────────────────────────────────────────────────────────
function MockupPipeline() {
  return (
    <div style={{ width: "100%", height: "100%", padding: 18, fontFamily: DS.font }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: C.textHint, marginBottom: 12 }}>
        CONTENT PIPELINE · ESTA SEMANA
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { stage: "IDEAS",   color: C.accent,  cards: 3 },
          { stage: "GUIÓN",   color: C.mofu,    cards: 2 },
          { stage: "GRABAR",  color: C.tofu,    cards: 3 },
          { stage: "EDITAR",  color: C.text,    cards: 2 },
        ].map((col, ci) => (
          <div key={col.stage}>
            <div style={{
              fontSize: 9, fontWeight: 800, color: col.color,
              marginBottom: 8, letterSpacing: "0.12em",
            }}>{col.stage}</div>
            {Array.from({ length: col.cards }).map((_, i) => (
              <div key={i} style={{
                marginBottom: 6, padding: "8px 10px", borderRadius: 7,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border}`,
                fontSize: 10.5, color: "rgba(255,255,255,0.78)",
              }}>
                <div style={{ fontWeight: 700 }}>Creativo #{(ci + 1) * 10 + i}</div>
                <div style={{ fontSize: 9, color: C.textHint, marginTop: 2 }}>
                  {ci === 0 ? "Naraa" : ci === 1 ? "Wakeup" : ci === 2 ? "Peluna" : "Masccol"}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MOCKUP: Tareas (con sidebar de espacios anidados)
// ─────────────────────────────────────────────────────────────────────
function MockupTareas() {
  return (
    <div style={{ width: "100%", height: "100%", padding: 18, fontFamily: DS.font, display: "flex", gap: 16 }}>
      <div style={{ width: 130, flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textHint, letterSpacing: "0.16em", marginBottom: 10 }}>
          ESPACIOS
        </div>
        {[
          ["📋", "Todos",            "23", false],
          ["🎬", "Contenido",        "8",  true],
          ["  ↳", "Grabación",        "3",  false],
          ["  ↳", "Edición",          "5",  false],
          ["📣", "Anuncios",         "9",  false],
          ["📦", "Logística",        "4",  false],
        ].map(([icon, name, count, active], i) => (
          <div key={i} style={{
            padding: "5px 8px", borderRadius: 6, marginBottom: 2,
            fontSize: 11, color: active ? C.text : C.textMuted,
            background: active ? "rgba(255,255,255,0.04)" : "transparent",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 10, width: 16 }}>{icon}</span>
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ fontSize: 9, color: C.textHint }}>{count}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textHint, letterSpacing: "0.16em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
          PENDIENTE
        </div>
        {[
          ["Diseñar estáticos · MOFU", "Hoy"],
          ["Grabar Reel comparativo", "Mañana"],
          ["Revisar guión Naraa",     "Mié"],
          ["Editar testimonio Peluna", "Jue"],
        ].map(([t, d], i) => (
          <div key={i} style={{
            padding: "9px 11px", marginBottom: 6, borderRadius: 7,
            background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 11.5, color: "rgba(255,255,255,0.85)",
          }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.32)" }} />
            <span style={{ flex: 1 }}>{t}</span>
            <span style={{ fontSize: 10, color: C.textHint, fontWeight: 600 }}>{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pricing — minimalista, sin gradientes pesados
// ─────────────────────────────────────────────────────────────────────
function Pricing({ onSignup }) {
  return (
    <section style={{
      position: "relative", zIndex: 1,
      padding: "100px 32px",
      maxWidth: 980, margin: "0 auto",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
        color: C.accent, textTransform: "uppercase", marginBottom: 12,
      }}>PRICING</div>
      <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 14px", color: C.text }}>
        Simple. Sin sorpresas.
      </h2>
      <p style={{ fontSize: 15, color: C.textMuted, margin: "0 0 50px" }}>
        14 días gratis. Sin tarjeta. Cancelás cuando quieras.
      </p>

      <div style={{
        background: C.cardBg,
        border: `1px solid ${C.borderHi}`,
        borderRadius: 18,
        padding: "44px 36px",
        maxWidth: 480, margin: "0 auto",
        boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.20em", color: C.accent, marginBottom: 6 }}>
          INFORCE · TODO INCLUIDO
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 60, fontWeight: 800, color: C.text, lineHeight: 1, letterSpacing: "-0.03em" }}>$49</span>
          <span style={{ fontSize: 16, color: C.textMuted, fontWeight: 600 }}>/mes</span>
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 28 }}>
          + $10 por seat extra
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", textAlign: "left" }}>
          {[
            "Workspace propio con tu marca",
            "Despliegue Creativo TOFU/MOFU/BOFU",
            "Reportes Meta + Shopify unificados",
            "Content Pipeline + Guionista IA",
            "Tareas, Equipo, Espacios anidados",
            "Banco de creativos cross-marca",
            "Soporte directo del equipo",
          ].map((b) => (
            <li key={b} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "7px 0",
              fontSize: 13.5, color: "rgba(255,255,255,0.82)",
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 2,
                color: C.text, fontSize: 9, fontWeight: 800,
              }}>✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <PrimaryButton onClick={onSignup} full>Empezar mi prueba gratis</PrimaryButton>
      </div>
    </section>
  );
}

function FinalCta({ onSignup }) {
  return (
    <section style={{
      position: "relative", zIndex: 1,
      padding: "90px 32px 110px",
      textAlign: "center",
    }}>
      <h2 style={{
        fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 800,
        letterSpacing: "-0.025em", margin: "0 0 18px",
        color: C.text, lineHeight: 1.1,
        background: "linear-gradient(180deg, #fff, rgba(255,255,255,0.55))",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        Listo para escalar tus creativos?
      </h2>
      <p style={{ fontSize: 16, color: C.textMuted, marginBottom: 32 }}>
        Probalo 14 días gratis. Sin tarjeta. Sin compromiso.
      </p>
      <PrimaryButton onClick={onSignup}>Empezar mi prueba gratis</PrimaryButton>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      position: "relative", zIndex: 1,
      padding: "32px",
      borderTop: `1px solid ${C.border}`,
      textAlign: "center",
    }}>
      <Brand />
      <div style={{ marginTop: 14, fontSize: 11, color: C.textHint }}>
        © {new Date().getFullYear()} Inforce · Todos los derechos reservados
      </div>
    </footer>
  );
}
