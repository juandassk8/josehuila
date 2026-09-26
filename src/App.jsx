// ── DESIGN SYSTEM ────────────────────────────────────────────────────────────
// DS lives in src/lib/design.js so the new team module can reuse it.
import { DS, darkCard, darkInput, darkBtn, darkBtnGhost, darkBtnRed } from "./lib/design.js";
import { useTheme } from "./lib/theme.jsx";
import { getClientHomeUrl, getClientReportUrl, PORTAL_HOST } from "./lib/urls.js";
import { database, getSessionSinBloquear } from "./lib/backend.js";
import BrandLoader from "./lib/BrandLoader.jsx";
import { toast, toastError } from "./lib/toast.js";
import { buildApiHeaders } from "./lib/apiAuth.js";
import { parseMetaCsv } from "./lib/reportes/csv.js";
import { getReportDates, selectReportsForRange, distributeDaily } from "./lib/reportes/reportRanges.js";
import { findBestMatch, findBestMatchWithMetrics, classifyAdSeverity, getAdSeverityStyle } from "./lib/reportes/adMatching.js";
import { CadenaDeDiagnostico } from "./lib/reportes/CadenaDeDiagnostico.jsx";
import { fmt, fmtM, pct, num } from "./lib/reportes/format.js";
import { useCompanyMask } from "./lib/censor.jsx";
import { lazy, Suspense } from "react";
// DespliegueCreativo y ContentPipeline pesan mucho (dnd-kit + zoom-pan-pinch
// + canvas grande + FunnelLines). Lazy load para que no arrastren al bundle
// inicial del portal. CompanyContentPipeline también porque solo se usa
// cuando entrás a la sección Pipeline de una empresa.
const DespliegueCreativo = lazy(() =>
  import("./despliegue/DespliegueCreativo.jsx").then((m) => ({ default: m.DespliegueCreativo }))
);
// Vista CLIENTE (read-only) del despliegue — componente aislado; la admin queda intacta.
const DespliegueClienteView = lazy(() =>
  import("./despliegue/DespliegueClienteView.jsx").then((m) => ({ default: m.DespliegueClienteView }))
);
const ContentPipeline = lazy(() =>
  import("./despliegue/ContentPipeline.jsx").then((m) => ({ default: m.ContentPipeline }))
);
// Content Pipeline nuevo (briefs/slots) — vive DENTRO del portal de cada empresa.
// Reemplaza al CompanyContentPipeline viejo.
const ContentPipelinePage = lazy(() =>
  import("./team/pipeline/ContentPipelinePage.jsx").then((m) => ({ default: m.ContentPipelinePage }))
);
const ControlCreativos = lazy(() =>
  import("./control_creativos/ControlCreativos.jsx").then((m) => ({ default: m.ControlCreativos }))
);
const AdLibraryPage = lazy(() =>
  import("./team/ad_library/AdLibraryPage.jsx").then((m) => ({ default: m.AdLibraryPage }))
);
const CreativeImagesPage = lazy(() =>
  import("./team/creative_images/CreativeImagesPage.jsx").then((m) => ({ default: m.CreativeImagesPage }))
);
// Hoja de rodaje pública (`/brief/<token>`). Lazy a propósito: la abre gente sin
// cuenta, y no tiene por qué descargar el portal entero para leer un guion.
const BriefPublicPage = lazy(() =>
  import("./team/pipeline/BriefPublicPage.jsx").then((m) => ({ default: m.BriefPublicPage }))
);
import { CompanyWorkspace } from "./workspace/CompanyWorkspace.jsx";
import { ComingSoon } from "./workspace/ComingSoon.jsx";
// Las pantallas del portal del cliente, una por sección y ninguna necesaria
// hasta que se entra a ella. Son ~3.300 líneas que hasta ahora viajaban todas
// juntas en la primera carga, para que alguien abriera una.
const PlanView = lazy(() => import("./workspace/PlanView.jsx").then((m) => ({ default: m.PlanView })));
const CompanyHome = lazy(() => import("./workspace/CompanyHome.jsx").then((m) => ({ default: m.CompanyHome })));
const CompanyTeam = lazy(() => import("./workspace/CompanyTeam.jsx").then((m) => ({ default: m.CompanyTeam })));
const CompanyTareas = lazy(() => import("./workspace/CompanyTareas.jsx").then((m) => ({ default: m.CompanyTareas })));
// Las pantallas de puerta de entrada van LAZY: quien ya entró no las va a ver
// nunca más, y hasta ahora las descargaba igual en el mismo chunk que el portal.
// Son excluyentes con la app —o estás afuera o estás adentro—, así que nadie
// paga las dos cosas.
const LandingPage = lazy(() => import("./landing/LandingPage.jsx").then((m) => ({ default: m.LandingPage })));
const SignupPage = lazy(() => import("./landing/SignupPage.jsx").then((m) => ({ default: m.SignupPage })));
const LoginPage = lazy(() => import("./landing/LoginPage.jsx").then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import("./landing/ForgotPasswordPage.jsx").then((m) => ({ default: m.ForgotPasswordPage })));
const OnboardingWizard = lazy(() => import("./landing/OnboardingWizard.jsx").then((m) => ({ default: m.OnboardingWizard })));
const DebugPage = lazy(() => import("./landing/DebugPage.jsx").then((m) => ({ default: m.DebugPage })));
import { getCurrentSession, uniqueCompanySlug } from "./landing/auth_db.js";
const CompanyTrashPage = lazy(() => import("./workspace/tasks/TrashPage.jsx").then((m) => ({ default: m.TrashPage })));
import { memberCanAccess } from "./workspace/member_access.js";
import { useIsMobile } from "./lib/useIsMobile.js";
import { esDeInforce, puedeGestionarWorkspace, puedeRepartirCredenciales } from "./lib/permisos.js";
import { puedeGenerarGuiones } from "../api/_lib/guionista.js";
import { canManageReports } from "./workspace/permissions/slot_permissions.js";

// Loading fallback para los componentes lazy. Usa el loader de marca (theme-aware).
const LazyFallback = ({ label = null }) => <BrandLoader label={label} />;

// Ancho de la sidebar del CompanyWorkspace (sincronizado con ese componente)
const WORKSPACE_SIDEBAR_WIDTH = 220;

// ── REPORT TYPES ─────────────────────────────────────────────────────────────
const REPORT_TYPES = {
  horas: {
    label: "Por Horas", color: "#378ADD", emoji: "⚡",
    desc: "Snapshot del rendimiento actual. ¿Cómo va el día a esta hora?",
    sections: [
      { key: "oportunidadesEscala",        title: "Oportunidades de escala",       ph: "¿Qué campañas tienen buen rendimiento para considerar escalar?" },
      { key: "oportunidadesOptimizacion",  title: "Oportunidades de optimización", ph: "¿Qué campañas tienen problemas o gasto alto que optimizar?" },
    ],
  },
  diario: {
    label: "Diario", color: "#1DB97A", emoji: "📅",
    desc: "¿Qué pasó ayer? Métricas del día anterior para seguimiento histórico y gráficas.",
    sections: [
      { key: "resumenDia",    title: "Resumen del día",       ph: "¿Qué pasó en general ayer?" },
      { key: "accionTrafico", title: "Acciones para tráfico", ph: "¿Qué ajustar hoy en campañas?" },
    ],
  },
  semanal: {
    label: "Semanal", color: "#F5A623", emoji: "📊",
    desc: "Análisis macro de la semana. Tendencias y accionables claros para el equipo.",
    sections: [
      { key: "analisisSemana",       title: "Análisis de la semana",        ph: "¿Qué pasó con las campañas durante la semana?" },
      { key: "formatosFuncionaron",   title: "Formatos que funcionaron",     ph: "¿Qué tipos de anuncios o creatividades dieron resultado?" },
      { key: "formatosNoFuncionaron", title: "Formatos que no funcionaron",  ph: "¿Qué formatos pausar o replantear?" },
      { key: "accionablesTrafico",    title: "Accionables para tráfico",     ph: "¿Qué campañas escalar, pausar u optimizar?" },
    ],
  },
  mensual: {
    label: "Mensual", color: "#8B5CF6", emoji: "📆",
    desc: "Visión estratégica del mes. Formatos ganadores, estrategia y plan siguiente mes.",
    sections: [
      { key: "analisisMes",         title: "Análisis del mes",             ph: "¿Qué tendencias se observan en el mes?" },
      { key: "formatosGanadores",   title: "Formatos ganadores",           ph: "¿Qué creatividades y formatos funcionaron mejor?" },
      { key: "formatosPausar",      title: "Formatos a pausar/desactivar", ph: "¿Qué dejar de hacer el próximo mes?" },
      { key: "estrategiaSiguiente", title: "Estrategia siguiente mes",     ph: "¿Cuál es el enfoque y objetivo del próximo mes?" },
      { key: "accionablesTrafico",  title: "Accionables para tráfico",     ph: "¿Qué ajustes de presupuesto y estructura de campañas?" },
    ],
  },
  puntual: {
    label: "Puntual", color: "#F43F5E", emoji: "🎯",
    desc: "Análisis enfocado en un periodo específico. Ideal para evaluar ofertas, eventos, fines de semana críticos o rachas con rendimiento fuera de lo normal.",
    sections: [
      { key: "contextoEvento",   title: "Contexto del evento",       ph: "¿Qué pasó durante este periodo? (Promo, oferta, cambio de estrategia, fin de semana, etc.)" },
      { key: "resultados",       title: "Resultados observados",     ph: "¿Cómo se comportaron las campañas durante estos días?" },
      { key: "causasImpacto",    title: "Causas del impacto",         ph: "¿Qué causó el resultado? (Bueno o malo)" },
      { key: "aprendizajes",     title: "Aprendizajes clave",        ph: "¿Qué aprendemos de este periodo para futuras decisiones?" },
      { key: "accionTrafico",    title: "Acciones para tráfico",     ph: "¿Qué ajustes hacer en campañas basado en este análisis?" },
    ],
  },
};

// Backward compat: map old horas section keys to new ones
const HORAS_SECTION_MIGRATION = {
  campanasDestacadas: "oportunidadesEscala",
  alertas: "oportunidadesOptimizacion",
};
function migrateHorasSections(sections) {
  if (!sections) return sections;
  const migrated = { ...sections };
  for (const [oldKey, newKey] of Object.entries(HORAS_SECTION_MIGRATION)) {
    if (migrated[oldKey] && !migrated[newKey]) {
      migrated[newKey] = migrated[oldKey];
    }
  }
  return migrated;
}

// Style presets (darkCard, darkInput, darkBtn, darkBtnGhost, darkBtnRed)
// are imported from design.js and mutated by applyTheme() for theme awareness.

// ── SUPABASE CONFIG ──────────────────────────────────────────────────────────
// URL + anon key ahora vienen de ./lib/backend.js (fuente única, env-overridable).

import {
  dbGetCompanies,
  dbGetReports,
  dbSaveCompany,
  dbSaveReport,
  dbDeleteCompany,
  dbSetCompanyArchived,
  dbDeleteReport,
} from "./lib/db.js";

// ── AUTH / ACCESS RESOLVERS ──────────────────────────────────────────────
// resolveUserAccess, slugifyCompany, loadAccessibleCompaniesByEmail y
// resolveClientMember se movieron a ./lib/authAccess.js. Se importan para uso
// interno y se re-exportan para que cualquier importador externo existente siga
// funcionando sin cambios.
import {
  resolveUserAccess,
  slugifyCompany,
  loadAccessibleCompaniesByEmail,
  resolveClientMember,
} from "./lib/authAccess.js";
export {
  resolveUserAccess,
  slugifyCompany,
  loadAccessibleCompaniesByEmail,
  resolveClientMember,
};


import { useState, useRef, useEffect, useMemo, Component } from "react";

// ── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
// Se mudó a src/lib/useIsMobile.js para que el portal del cliente también pueda
// usarlo. Acá queda el import (arriba), no una copia.
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "system-ui, sans-serif", background: "#0b0b10", color: "#f4f4f7", minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 14 }}>😕</div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
              Se rompió esta pantalla
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#9496a5", marginBottom: 22 }}>
              Tu trabajo está guardado. Volvé a cargar y si sigue pasando, mandale una
              captura a Jose con lo que estabas haciendo.
            </p>
            <button onClick={() => window.location.reload()}
              style={{ padding: "11px 22px", background: "#fff", color: "#000", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>
              Volver a cargar
            </button>
            {/* El detalle técnico queda, pero plegado.
                Antes esta pantalla le tiraba el stack entero a quien la viera: a una
                editora eso no le dice nada y encima parece que el trabajo se perdió.
                Acá abajo sigue estando para cuando haga falta, y además queda en
                `sessionStorage` para poder pedirlo sin que nadie transcriba nada. */}
            <details style={{ marginTop: 26, textAlign: "left" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b6d7c" }}>Detalle técnico</summary>
              <pre style={{ fontSize: 10.5, color: "#6b6d7c", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 10 }}>
                {String(this.state.error)}{"\n\n"}{this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── PIN SCREEN ────────────────────────────────────────────────────────────
// PinScreen se movió a ./features/auth/PinScreen.jsx (componente autocontenido,
// recibe todo por props).
import PinScreen from "./features/auth/PinScreen.jsx";
import { logger } from "./lib/logger.js";

// fmt, fmtM, pct y num se movieron a ./lib/reportes/format.js

// Input numérico es-CO con soporte de decimales (coma) y miles (punto).
// Mantiene un buffer string interno mientras el user escribe — sin esto,
// teclear "2,5" hacía que el cursor brincara y `Math.round` mataba decimales.
function NumField({ label, hint, value, onChange, placeholder, darkInput, DS }) {
  const [buffer, setBuffer] = useState(null); // null = mostrar valor formateado
  const display = buffer != null
    ? buffer
    : (value === "" || value == null || value === 0
        ? ""
        : (typeof value === "number"
            ? value.toLocaleString("es-CO", { maximumFractionDigits: 4 })
            : String(value)));
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: hint ? 2 : 6, fontWeight: 500 }}>{label}</label>
      {hint && <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>{hint}</div>}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={() => { if (buffer == null) setBuffer(display); }}
        onChange={(e) => {
          const v = e.target.value;
          setBuffer(v);
          if (v === "" || v === "-") { onChange(""); return; }
          // Permite separadores: "." como miles, "," como decimal (es-CO).
          const raw = v.replace(/\./g, "").replace(",", ".");
          const n = parseFloat(raw);
          onChange(isNaN(n) ? "" : n);
        }}
        onBlur={() => setBuffer(null)}
        placeholder={placeholder}
        style={{ ...darkInput }}
      />
    </div>
  );
}

const defaultObjectives = {
  roasMin: 4, roasTarget: 6,
  costPerPurchaseMax: 80000, costPerPurchaseTarget: 50000,
  revenueActual: 0, revenueTarget: 0,
  // embudo — tráfico
  cpm: 12000, cpcTarget: 600, ctrTarget: 2,
  // embudo — conversión
  pageLoadMin: 80,
  checkoutRateTarget: 15,
  costPerInitiatedTarget: 10000,
  checkoutConversionTarget: 20,
};

function calcMetrics(d) {
  if (!d || !d.spend || !d.clicks) return null;
  // Divisor seguro: evita Infinity/NaN (que se renderizan como "∞"/"NaN%") cuando
  // el denominador es 0 — común con tracking de pixel incompleto (0 checkouts, etc.).
  const div = (a, b) => (b ? a / b : 0);
  const roas = div(d.conversion, d.spend);
  const ctr = div(d.clicks, d.impressions) * 100;
  const cpc = div(d.spend, d.clicks);
  const cpm = div(d.spend, d.impressions) * 1000;
  const pageLoadRate = div(d.pageVisits, d.clicks) * 100;
  const costPerVisit = div(d.spend, d.pageVisits);
  const checkoutRate = div(d.initiatedCheckouts, d.pageVisits) * 100;
  const costPerInitiated = div(d.spend, d.initiatedCheckouts);
  const checkoutConversion = div(d.purchases, d.initiatedCheckouts) * 100;
  const avgTicket = div(d.conversion, d.purchases);
  const idealClicks = div(d.spend, defaultObjectives.cpc);
  const idealInitiated = div(d.spend, defaultObjectives.costPerInitiated);
  return { roas, ctr, cpc, cpm, pageLoadRate, costPerVisit, checkoutRate, costPerInitiated, checkoutConversion, avgTicket, idealClicks, idealInitiated };
}

function MetricCard({ label, value, sub, status, color, refLabel }) {
  const { isDark } = useTheme();
  const colors = { bad: "#E24B4A", ok: "#1DB97A", warn: "#F5A623", neutral: DS.textPrimary };
  const c = color || colors[status] || DS.textPrimary;
  const borderTint = c !== DS.textPrimary ? `1px solid ${c}22` : DS.border;
  const cardBg = isDark ? DS.bgCard : (c !== DS.textPrimary ? `${c}08` : DS.bgCard);
  return (
    <div style={{ background: cardBg, borderRadius: DS.radius, padding: "14px 16px", border: borderTint }}>
      <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 5, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: c }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 3 }}>{sub}</div>}
      {refLabel && <div style={{ fontSize: 9, color: `${c}99`, marginTop: 2 }}>{refLabel}</div>}
    </div>
  );
}

// ── FORMATTED ANALYSIS ──────────────────────────────────────────────────────
// Parses plain text from analysis sections into visually structured elements
function FormattedAnalysis({ text, accentColor }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  const highlightNumbers = (str) => {
    // Highlight numbers, percentages, money values, multipliers
    return str.split(/(\$[\d.,]+[KMB]?|\d+[\d.,]*[×%]?)/g).map((part, idx) =>
      /^\$|^\d/.test(part) && /[\d]/.test(part)
        ? <strong key={idx} style={{ color: DS.textPrimary, fontWeight: 700 }}>{part}</strong>
        : part
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { elements.push(<div key={i++} style={{ height: 8 }} />); continue; }

    // Headings: lines starting with ** or # or all-caps short lines
    if (/^\*\*(.+)\*\*$/.test(trimmed)) {
      const inner = trimmed.match(/^\*\*(.+)\*\*$/)[1];
      elements.push(<div key={i++} style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary, marginTop: 8, marginBottom: 4 }}>{inner}</div>);
      continue;
    }

    // Conclusion/summary lines
    if (/^(Conclusión|Resultado|En resumen|Resumen|Recomendación|Acción)[:\s]/i.test(trimmed)) {
      elements.push(
        <div key={i++} style={{ borderLeft: `3px solid ${accentColor || DS.green}`, paddingLeft: 12, marginTop: 8, marginBottom: 4, fontSize: 12.5, color: DS.textPrimary, fontWeight: 600, lineHeight: 1.7 }}>
          {highlightNumbers(trimmed)}
        </div>
      );
      continue;
    }

    // Bullet points
    if (/^[-•·▸→]/.test(trimmed)) {
      const content = trimmed.replace(/^[-•·▸→]\s*/, "");
      elements.push(
        <div key={i++} style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.65 }}>
          <span style={{ color: accentColor || DS.textMuted, flexShrink: 0, marginTop: 1 }}>•</span>
          <span>{highlightNumbers(content)}</span>
        </div>
      );
      continue;
    }

    // First non-bullet line as lead text (bigger)
    if (i === 0 || (i === 1 && elements.length <= 1)) {
      elements.push(<div key={i++} style={{ fontSize: 13, color: DS.textPrimary, lineHeight: 1.75, fontWeight: 500 }}>{highlightNumbers(trimmed)}</div>);
      continue;
    }

    // Regular paragraph
    elements.push(<div key={i++} style={{ fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.7, marginTop: 2 }}>{highlightNumbers(trimmed)}</div>);
  }

  return <div>{elements}</div>;
}

// ── OPPORTUNITY CARDS — visual rendering for horas analysis sections ──
// Supports both plain text fallback and rich campaign cards when CSV data is available.
function OpportunityCards({ text, variant, campaigns, adsets: reportAdsets, campaignDetails, onViewCampaign }) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile(768);
  const [manualMatches, setManualMatches] = useState({});
  if (!text || !text.trim()) return null;

  const isScale = variant === "escala";
  const color = isScale ? "#1DB97A" : "#E24B4A";
  const bgTint = isScale ? "rgba(29,185,122,0.04)" : "rgba(226,75,74,0.04)";
  const borderColor = isScale ? "rgba(29,185,122,0.3)" : "rgba(226,75,74,0.3)";
  const chipBg = isScale ? "rgba(29,185,122,0.1)" : "rgba(226,75,74,0.1)";
  const badgeLabel = isScale ? "ESCALA" : "OPTIMIZACION";
  const badgeIcon = isScale ? "↗" : "⚠";

  const highlightNumbers = (str) =>
    str.split(/(\$[\d.,]+[KMB]?|\d+[\d.,]*[×%]?)/g).map((part, idx) =>
      /^\$|^\d/.test(part) && /[\d]/.test(part)
        ? <strong key={idx} style={{ color, fontWeight: 700 }}>{part}</strong>
        : part
    );

  // ── AI-EXTRACTED CAMPAIGN DETAILS: render structured cards if available ──
  const rawDetails = campaignDetails ? campaignDetails.filter(cd => cd.type === variant) : [];
  // Aggressive deduplication: group by CSV match, or by any shared word ≥5 chars
  const filteredDetails = (() => {
    if (rawDetails.length === 0) return [];
    // Match all against CSV first
    const withMatches = rawDetails.map(cd => ({
      ...cd,
      _csvMatch: campaigns ? findBestMatch(cd.name, campaigns) : null,
    }));
    // Group: if two entries match the same CSV campaign → merge them
    const merged = [];
    const used = new Set();
    for (let i = 0; i < withMatches.length; i++) {
      if (used.has(i)) continue;
      const base = { ...withMatches[i] };
      used.add(i);
      // Find all other entries that match the same CSV campaign or have very similar names
      for (let j = i + 1; j < withMatches.length; j++) {
        if (used.has(j)) continue;
        const other = withMatches[j];
        const sameCSV = base._csvMatch && other._csvMatch && base._csvMatch.name === other._csvMatch.name;
        // Also check if names share significant overlap (>50% of words)
        const wordsA = String(base.name || "").toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        const wordsB = String(other.name || "").toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        const overlap = wordsA.filter(w => wordsB.includes(w)).length;
        const similarName = wordsA.length > 0 && wordsB.length > 0 && overlap >= Math.min(2, Math.min(wordsA.length, wordsB.length));
        if (sameCSV || similarName) {
          used.add(j);
          if (other.adsets) base.adsets = [...(base.adsets || []), ...other.adsets];
          if (other.description && (!base.description || other.description.length > base.description.length)) base.description = other.description;
          if (other.action && (!base.action || other.action.length > base.action.length)) base.action = other.action;
        }
      }
      merged.push(base);
    }
    return merged;
  })();
  if (filteredDetails.length > 0) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {filteredDetails.map((cd, bi) => {
          // Use pre-matched CSV campaign from dedup
          const csvMatch = cd._csvMatch || (campaigns ? findBestMatch(cd.name, campaigns) : null);
          const m = csvMatch ? {
            compras: csvMatch.purchases || 0,
            costo_por_compra: csvMatch.costPerPurchase || (csvMatch.purchases && csvMatch.spend ? csvMatch.spend / csvMatch.purchases : 0),
            valor_conversion: csvMatch.conversionValue || 0,
            gasto: csvMatch.spend || 0,
            roas: csvMatch.purchaseRoas || (csvMatch.spend > 0 && csvMatch.conversionValue > 0 ? csvMatch.conversionValue / csvMatch.spend : 0),
            // Para la cadena de diagnóstico (clase 9.5). El CSV de Meta ya trae
            // el CTR en porcentaje; la cadena trabaja en fracciones, y mezclar
            // las dos escalas es el error clásico — se convierte acá, una vez.
            ctr: csvMatch.ctr > 0 ? csvMatch.ctr / 100 : null,
            cpm: csvMatch.cpm || null,
            impresiones: csvMatch.impressions || null,
            alcance: csvMatch.reach || null,
            // Hook y hold son métricas PERSONALIZADAS de Meta: hay que crearlas
            // una vez en el administrador. Hasta que estén, la cadena las marca
            // "sin datos" en vez de suponer que están bien.
            hookRate: csvMatch.hookRate > 0 ? csvMatch.hookRate / 100 : null,
            holdRate: csvMatch.holdRate > 0 ? csvMatch.holdRate / 100 : null,
            // El TRAMO 2 —la web— ya se puede medir con lo que Meta exporta hoy.
            // Se calcula acá y no en el parser porque son razones entre columnas
            // que el parser trae crudas.
            cargaPagina: csvMatch.pageVisits > 0 && csvMatch.linkClicks > 0
              ? Math.min(1, csvMatch.pageVisits / csvMatch.linkClicks) : null,
            pagosIniciados: csvMatch.initiatedCheckouts > 0 && csvMatch.pageVisits > 0
              ? csvMatch.initiatedCheckouts / csvMatch.pageVisits : null,
            conversionCheckout: csvMatch.checkoutConversionRate > 0
              ? csvMatch.checkoutConversionRate / 100
              : (csvMatch.purchases > 0 && csvMatch.initiatedCheckouts > 0
                  ? csvMatch.purchases / csvMatch.initiatedCheckouts : null),
          } : cd.metricsFromText ? {
            compras: cd.metricsFromText.purchases || 0,
            costo_por_compra: cd.metricsFromText.costPerPurchase || 0,
            valor_conversion: cd.metricsFromText.conversionValue || 0,
            gasto: cd.metricsFromText.spend || 0,
            roas: cd.metricsFromText.spend > 0 && cd.metricsFromText.conversionValue > 0 ? cd.metricsFromText.conversionValue / cd.metricsFromText.spend : 0,
          } : null;
          const hasMetrics = m && (m.compras > 0 || m.gasto > 0 || m.valor_conversion > 0);
          return (
            <div key={bi} style={{
              background: bgTint,
              border: `1.5px solid ${borderColor}`,
              borderRadius: isMobile ? 10 : 12,
              padding: isMobile ? "12px" : "16px 18px",
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "flex-start", justifyContent: "space-between", gap: isMobile ? 6 : 10, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, flex: 1, minWidth: 0 }}>
                  <div style={{ width: isMobile ? 22 : 26, height: isMobile ? 22 : 26, borderRadius: 6, background: color + "33", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 9 : 11, fontWeight: 800, flexShrink: 0 }}>{String(bi + 1).padStart(2, "0")}</div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, color: DS.textPrimary }}>{csvMatch ? csvMatch.name : cd.name}</span>
                    {csvMatch && !isMobile && onViewCampaign && (
                      <button onClick={() => onViewCampaign(csvMatch.name, variant)} style={{ marginLeft: 8, fontSize: 10, color: DS.blue, cursor: "pointer", background: "none", border: "none", textDecoration: "underline", fontFamily: DS.font }}>Ver campaña ↗</button>
                    )}
                  </div>
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}55`, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{badgeIcon}</span> {badgeLabel}
                  </span>
                )}
              </div>

              {/* Metrics */}
              {hasMetrics && (
                <div style={{ display: "flex", gap: isMobile ? 3 : 8, flexWrap: "nowrap", marginBottom: 8, overflowX: "auto" }}>
                  {[
                    { label: "Compras", val: m.compras, highlight: false },
                    !isMobile && { label: "Costo/compra", val: m.costo_por_compra > 0 ? `$${Math.round(m.costo_por_compra).toLocaleString("es-CO")}` : "\u2014", highlight: m.costo_por_compra > 0 },
                    { label: "Conversi\u00f3n", val: `$${Math.round(m.valor_conversion).toLocaleString("es-CO")}`, highlight: false },
                    { label: "Gasto", val: `$${Math.round(m.gasto).toLocaleString("es-CO")}`, highlight: false },
                    { label: "ROAS", val: m.roas > 0 ? `${m.roas.toFixed(2)}\u00d7` : "\u2014", highlight: m.roas > 0 },
                  ].filter(Boolean).map((c, idx) => (
                    <div key={idx} style={{ background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", borderRadius: 6, padding: isMobile ? "3px 6px" : "5px 11px", fontSize: isMobile ? 9 : 11, border: DS.border }}>
                      <span style={{ color: DS.textMuted, fontSize: isMobile ? 7 : 9 }}>{c.label} </span>
                      <strong style={{ color: c.highlight ? color : DS.textPrimary }}>{c.val}</strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Description */}
              {cd.description && (
                <div style={{ marginBottom: 10, padding: "9px 12px", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 12, color: DS.textSecondary, lineHeight: 1.6, borderLeft: `2px solid ${color}55` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Descripción</div>
                  {cd.description.split("\n").filter(l => l.trim()).map((line, li) => (
                    <div key={li} style={{ marginTop: li > 0 ? 2 : 0 }}>{highlightNumbers(line.trim())}</div>
                  ))}
                </div>
              )}

              {/* Adsets within this campaign */}
              {cd.adsets && cd.adsets.length > 0 && (() => {
                // Deduplicate adsets by name
                const uniqueAdsets = [];
                const seenAdsets = new Set();
                for (const a of cd.adsets) {
                  const key = a.name?.toLowerCase().trim();
                  if (key && !seenAdsets.has(key)) { seenAdsets.add(key); uniqueAdsets.push(a); }
                }
                if (uniqueAdsets.length === 0) return null;
                // Try matching adsets against CSV
                const csvAdsets = reportAdsets || [];
                return (
                  <div style={{ marginBottom: 10, paddingLeft: 12, borderLeft: `2px dashed ${color}44` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Conjuntos de anuncios</div>
                    {uniqueAdsets.map((adset, ai) => {
                      const adsetMatch = csvAdsets.length > 0 ? findBestMatch(adset.name, csvAdsets) : null;
                      const am = adsetMatch ? { compras: adsetMatch.purchases || 0, gasto: adsetMatch.spend || 0, conversión: adsetMatch.conversionValue || 0, roas: adsetMatch.spend > 0 && adsetMatch.conversionValue > 0 ? adsetMatch.conversionValue / adsetMatch.spend : 0 } : null;
                      return (
                        <div key={ai} style={{ background: isDark ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.02)", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: `1px solid ${color}22` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary, marginBottom: 4 }}>{adsetMatch ? adsetMatch.name : adset.name}</div>
                          {am && (
                            <div style={{ display: "flex", gap: isMobile ? 4 : 6, flexWrap: "nowrap", overflowX: "auto", marginBottom: 6 }}>
                              {[
                                { label: "Compras", val: am.compras },
                                { label: "Gasto", val: `$${Math.round(am.gasto).toLocaleString("es-CO")}` },
                                { label: "Conv.", val: `$${Math.round(am.conversión).toLocaleString("es-CO")}` },
                                { label: "ROAS", val: am.roas > 0 ? `${am.roas.toFixed(2)}×` : "—" },
                              ].map((c, ci) => (
                                <div key={ci} style={{ background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.04)", borderRadius: 5, padding: "3px 8px", fontSize: 9, border: DS.border, flexShrink: 0 }}>
                                  <span style={{ color: DS.textMuted, fontSize: 7 }}>{c.label} </span>
                                  <strong style={{ color: DS.textPrimary }}>{c.val}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                          {adset.description && <div style={{ fontSize: 11, color: DS.textSecondary, lineHeight: 1.5 }}>{highlightNumbers(adset.description)}</div>}
                          {adset.action && <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 4 }}>↗ {adset.action}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Recommended action */}
              {cd.action && (
                <div style={{ padding: "10px 13px", background: color + "1A", borderRadius: 8, border: `1px solid ${color}55`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ fontSize: 16, lineHeight: 1 }}>{badgeIcon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Acci\u00f3n recomendada</div>
                    <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 600, lineHeight: 1.5 }}>{highlightNumbers(cd.action)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Try to match campaign data from CSV (original text-parsing approach as fallback)
  const rawStructured = processCampaignAnalysis(text, campaigns);
  // Deduplicate the text-parsed results too
  const structured = (() => {
    if (!rawStructured || rawStructured.length === 0) return rawStructured;
    const merged = [];
    const used = new Set();
    for (let i = 0; i < rawStructured.length; i++) {
      if (used.has(i)) continue;
      const base = { ...rawStructured[i] };
      used.add(i);
      for (let j = i + 1; j < rawStructured.length; j++) {
        if (used.has(j)) continue;
        const other = rawStructured[j];
        // Same CSV match?
        const sameCSV = base.matchedCsvName && other.matchedCsvName && base.matchedCsvName === other.matchedCsvName;
        // Similar campaign name?
        const wordsA = String(base.campaignName || "").toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        const wordsB = String(other.campaignName || "").toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        const overlap = wordsA.filter(w => wordsB.includes(w)).length;
        const similar = wordsA.length > 0 && wordsB.length > 0 && overlap >= Math.min(2, Math.min(wordsA.length, wordsB.length));
        if (sameCSV || similar) {
          used.add(j);
          if (other.descripcion && (!base.descripcion || other.descripcion.length > base.descripcion.length)) base.descripcion = other.descripcion;
          if (other.accionRecomendada && !base.accionRecomendada) base.accionRecomendada = other.accionRecomendada;
        }
      }
      merged.push(base);
    }
    return merged;
  })();

  // ── RICH CARDS: when we have structured data with at least one CSV match ──
  if (structured && structured.some(item => item.matchedFromCsv)) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {structured.map((item, bi) => {
          const manual = manualMatches[bi];
          const hasMatch = item.matchedFromCsv || !!manual;
          const displayName = manual ? manual.name : (item.matchedCsvName || item.campaignName);
          const m = manual ? {
            compras: manual.purchases || 0,
            costo_por_compra: manual.costPerPurchase || (manual.purchases && manual.spend ? manual.spend / manual.purchases : 0),
            valor_conversion: manual.conversionValue || 0,
            gasto: manual.spend || 0,
            roas: manual.purchaseRoas || (manual.spend > 0 && manual.conversionValue > 0 ? manual.conversionValue / manual.spend : 0),
          } : item.metricas;
          return (
            <div key={bi} style={{
              background: bgTint,
              border: `1.5px solid ${borderColor}`,
              borderRadius: isMobile ? 10 : 12,
              padding: isMobile ? "10px 12px" : "16px 18px",
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, marginBottom: 8 }}>
                <div style={{ width: isMobile ? 22 : 26, height: isMobile ? 22 : 26, borderRadius: 6, background: color + "33", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 9 : 11, fontWeight: 800, flexShrink: 0 }}>{String(bi + 1).padStart(2, "0")}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, color: DS.textPrimary }}>{displayName}</span>
                  {hasMatch && !isMobile && onViewCampaign && (
                    <button onClick={() => onViewCampaign(displayName, variant)} style={{ marginLeft: 8, fontSize: 10, color: DS.blue, cursor: "pointer", background: "none", border: "none", textDecoration: "underline", fontFamily: DS.font }}>Ver campaña ↗</button>
                  )}
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}55`, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{badgeIcon}</span> {badgeLabel}
                  </span>
                )}
              </div>

              {/* Manual campaign selection — when no CSV match */}
              {!hasMatch && campaigns && campaigns.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <select onChange={(e) => {
                    const camp = campaigns.find(c => c.name === e.target.value);
                    if (camp) setManualMatches(prev => ({ ...prev, [bi]: camp }));
                  }} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 12, fontFamily: DS.font, cursor: "pointer" }}>
                    <option value="">📊 Seleccionar campaña manualmente...</option>
                    {campaigns.map((c, ci) => <option key={ci} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Metric chips — only if matched from CSV or manual */}
              {hasMatch && m && (() => {
                const compras = m.compras || 0;
                const conv = m.valor_conversion || 0;
                const gasto = m.gasto || 0;
                const cpp = m.costo_por_compra || (compras > 0 ? gasto / compras : 0);
                const calcRoas = m.roas || (gasto > 0 && conv > 0 ? conv / gasto : 0);
                return (
                  <div style={{ display: "flex", gap: isMobile ? 4 : 8, flexWrap: "nowrap", marginBottom: 10, overflowX: "auto" }}>
                    {[
                      { label: "Compras", val: compras, highlight: false },
                      !isMobile && { label: "Costo/compra", val: cpp > 0 ? `$${Math.round(cpp).toLocaleString("es-CO")}` : "\u2014", highlight: cpp > 0 },
                      { label: "Conversi\u00f3n", val: `$${Math.round(conv).toLocaleString("es-CO")}`, highlight: false },
                      { label: "Gasto", val: `$${Math.round(gasto).toLocaleString("es-CO")}`, highlight: false },
                      { label: "ROAS", val: calcRoas > 0 ? `${calcRoas.toFixed(2)}\u00d7` : "\u2014", highlight: calcRoas > 0 },
                    ].filter(Boolean).map((c, idx) => (
                      <div key={idx} style={{ background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", borderRadius: 6, padding: isMobile ? "3px 6px" : "5px 11px", fontSize: isMobile ? 9 : 11, border: DS.border }}>
                        <span style={{ color: DS.textMuted, fontSize: isMobile ? 7 : 9 }}>{c.label} </span>
                        <strong style={{ color: c.highlight ? color : DS.textPrimary }}>{c.val}</strong>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Description — filter out lines that are PURELY metrics with no qualitative insight */}
              {(() => {
                const descText = item.descripcion || "";
                const metricPattern = /^(Gastado|Gasto|Compras|Pagos iniciados|Costo por|Presupuesto|ROAS|Valor de conversión)\s*[:=]?\s*\$?[\d.,]+[KMBx×%]?\s*$/i;
                const pureMetricLine = /^\d+\s+(ventas?|compras?|pagos)\s*$/i;
                const filteredLines = descText.split("\n").filter(l => {
                  const t = l.trim();
                  if (!t) return false;
                  // Only strip lines that are PURELY a metric label + value with no other text
                  if (metricPattern.test(t) && t.length < 40) return false;
                  if (pureMetricLine.test(t) && t.length < 30) return false;
                  return true;
                });
                if (filteredLines.length === 0) return null;
                return (
                  <div style={{ marginBottom: 10, padding: "9px 12px", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 12, color: DS.textSecondary, lineHeight: 1.6, borderLeft: `2px solid ${color}55` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Descripción</div>
                    {filteredLines.map((line, li) => {
                      const trimmed = line.trim();
                      if (/^[-•·▸→]/.test(trimmed)) {
                        const content = trimmed.replace(/^[-•·▸→]\s*/, "");
                        return <div key={li} style={{ display: "flex", gap: 6, marginTop: 2 }}><span style={{ color: DS.textMuted, flexShrink: 0 }}>•</span><span>{highlightNumbers(content)}</span></div>;
                      }
                      return <div key={li} style={{ marginTop: li > 0 ? 2 : 0 }}>{highlightNumbers(trimmed)}</div>;
                    })}
                  </div>
                );
              })()}

              {/* Recommended action */}
              {item.accionRecomendada && (
                <div style={{ padding: "10px 13px", background: color + "1A", borderRadius: 8, border: `1px solid ${color}55`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ fontSize: 16, lineHeight: 1 }}>{badgeIcon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Acci\u00f3n recomendada</div>
                    <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 600, lineHeight: 1.5 }}>{highlightNumbers(item.accionRecomendada)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── FALLBACK: plain text rendering (original behavior) ──
  const blocks = text.split(/\n\n+/).filter(b => b.trim());

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(l => l.trim());
        const firstLine = lines[0]?.trim() || "";
        const restLines = lines.slice(1);

        // Detect if first line is a campaign name (short, no bullet, possibly bold)
        const isCampaignName = firstLine.length < 120 && !/^[-•·▸→]/.test(firstLine) && !/^(Conclusión|Resultado|Recomendación)/i.test(firstLine);

        return (
          <div key={bi} style={{
            background: bgTint,
            border: `1px solid ${borderColor}`,
            borderLeft: `4px solid ${color}`,
            borderRadius: 10,
            padding: "14px 16px",
          }}>
            {/* Campaign name or first line */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: restLines.length > 0 ? 8 : 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: chipBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color, flexShrink: 0 }}>
                {bi + 1}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary, lineHeight: 1.4 }}>
                {isCampaignName ? firstLine.replace(/^\*\*|\*\*$/g, "") : highlightNumbers(firstLine)}
              </div>
            </div>
            {/* Rest of the block content */}
            {restLines.map((line, li) => {
              const trimmed = line.trim();
              // Conclusion/recommendation lines
              if (/^(Conclusión|Resultado|Recomendación|Acción|Escalar|Pausar|Evaluar|Monitorear|Optimizar)[:\s]/i.test(trimmed)) {
                return (
                  <div key={li} style={{ marginTop: 6, padding: "8px 12px", background: chipBg, borderRadius: 8, fontSize: 12, fontWeight: 600, color: DS.textPrimary, lineHeight: 1.6, display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ color, fontSize: 12, flexShrink: 0 }}>{isScale ? "↗" : "⚠"}</span>
                    <span>{highlightNumbers(trimmed)}</span>
                  </div>
                );
              }
              // Bullet points
              if (/^[-•·▸→]/.test(trimmed)) {
                const content = trimmed.replace(/^[-•·▸→]\s*/, "");
                return (
                  <div key={li} style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 12, color: DS.textSecondary, lineHeight: 1.6, paddingLeft: 30 }}>
                    <span style={{ color: DS.textMuted, flexShrink: 0 }}>•</span>
                    <span>{highlightNumbers(content)}</span>
                  </div>
                );
              }
              // Regular line
              return (
                <div key={li} style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.65, marginTop: 3, paddingLeft: 30 }}>
                  {highlightNumbers(trimmed)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── COPY NOTES CARDS — organized by format ──
function CopyNotesCards({ text }) {
  const { isDark } = useTheme();
  if (!text || !text.trim()) return null;

  const FORMAT_KEYWORDS = {
    "Flex": /\bflex\b/i,
    "Estático": /\best[aá]tic/i,
    "Carrusel": /\bcarrusel/i,
    "Testimonio": /\btestimoni/i,
    "UGC": /\bUGC\b/,
    "Hook": /\bhook/i,
    "Oferta": /\boferta/i,
    "Remarketing": /\bremarketing/i,
    "Pregunta": /\bpregunta/i,
    "Rodaje": /\brodaje/i,
    "Video": /\bvideo/i,
  };

  const POSITIVE = /\b(bien|funciona|exitoso|buenos?\s*resultado|escalar|replicar|bueno|excelente|alto\s*rendimiento|muy\s*bien|ganador)\b/i;
  const NEGATIVE = /\b(pausar|bajo|mal|reducir|poco|problem|parar|eliminar|deficiente|sin\s*conversiones|alto\s*costo|caro)\b/i;

  const lines = text.split("\n").filter(l => l.trim());

  // Parse lines into format cards
  const cards = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect format
    let formatName = null;
    for (const [name, regex] of Object.entries(FORMAT_KEYWORDS)) {
      if (regex.test(trimmed)) { formatName = name; break; }
    }

    // Detect sentiment
    const isPositive = POSITIVE.test(trimmed);
    const isNegative = NEGATIVE.test(trimmed);
    const sentiment = isPositive && !isNegative ? "positive" : isNegative && !isPositive ? "negative" : "neutral";

    cards.push({ text: trimmed, format: formatName, sentiment });
  }

  // Sort: positive first, neutral, negative last
  const order = { positive: 0, neutral: 1, negative: 2 };
  cards.sort((a, b) => order[a.sentiment] - order[b.sentiment]);

  const SENTIMENT_STYLES = {
    positive: { color: "#1DB97A", bg: "rgba(29,185,122,0.05)", border: "rgba(29,185,122,0.25)", icon: "↗" },
    neutral:  { color: "#F5A623", bg: "rgba(245,166,35,0.05)", border: "rgba(245,166,35,0.25)", icon: "•" },
    negative: { color: "#E24B4A", bg: "rgba(226,75,74,0.05)", border: "rgba(226,75,74,0.25)", icon: "↘" },
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {cards.map((card, i) => {
        const s = SENTIMENT_STYLES[card.sentiment];
        return (
          <div key={i} style={{
            background: s.bg,
            border: `1px solid ${s.border}`,
            borderLeft: `4px solid ${s.color}`,
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: s.color, flexShrink: 0, marginTop: 1 }}>
              {s.icon}
            </div>
            <div style={{ flex: 1 }}>
              {card.format && (
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: s.color, marginBottom: 3 }}>
                  Formato {card.format}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: DS.textPrimary, lineHeight: 1.65, fontWeight: 500 }}>{card.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelBlock({ title, children, bottleneck, good, regular }) {
  const arr = Array.isArray(children) ? children : [children];
  const border = bottleneck ? "1px solid rgba(226,75,74,0.35)" : good ? "1px solid rgba(29,185,122,0.35)" : regular ? "1px solid rgba(245,166,35,0.35)" : DS.border;
  const bg = bottleneck ? "rgba(226,75,74,0.07)" : good ? "rgba(29,185,122,0.07)" : regular ? "rgba(245,166,35,0.07)" : DS.bgCard;
  const titleColor = bottleneck ? "#E24B4A" : good ? "#1DB97A" : regular ? "#F5A623" : DS.textSecondary;
  const tagBg = bottleneck ? "rgba(226,75,74,0.15)" : good ? "rgba(29,185,122,0.15)" : "rgba(245,166,35,0.15)";
  const tagLabel = bottleneck ? "cuello de botella" : good ? "bien" : "mejorable";
  return (
    <div style={{ background: bg, borderRadius: DS.radius, padding: "14px 16px", marginBottom: 10, border }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: titleColor, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        {title}
        {(bottleneck || good || regular) && <span style={{ background: tagBg, color: titleColor, fontSize: 9, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{tagLabel}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${arr.length}, 1fr)`, gap: 8 }}>
        {arr}
      </div>
    </div>
  );
}

function FunnelStep({ value, label, sub, bad, good, warn }) {
  const color = bad ? "#E24B4A" : good ? "#1DB97A" : warn ? "#F5A623" : "#fff";
  return (
    <div style={{ textAlign: "center", padding: "8px 4px" }}>
      <div style={{ fontSize: 16, fontWeight: 600, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: DS.textMuted }}>{label}</div>
      {sub && <div style={{ fontSize: 11, fontWeight: 500, color, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── AI CALL ──────────────────────────────────────────────────────────────────
async function callAI(messages, systemPrompt, maxTokens = 1500, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({ messages, systemPrompt, maxTokens }),
    });
    if (res.status === 529 && attempt < retries - 1) {
      // API overloaded — wait and retry
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 529) throw new Error("API sobrecargada. Intenta de nuevo en unos segundos.");
      logger.error("AI API error:", data);
      throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
    }
    return data.content?.find(b => b.type === "text")?.text || "";
  }
  throw new Error("API no disponible después de varios intentos");
}

// Procesa un texto libre sobre anuncios: extrae notas para copy + menciones de anuncios individuales.
// Hace matching determinístico client-side contra `adsFromCsv` (no con IA), y clasifica severidad
// según los objetivos del cliente.
// Devuelve { notasCopy: markdown, ads: [{ nombre, descripcion, accionRecomendada, severidad, metricas, matchedFromCsv, ... }] }
async function processAdsText(rawText, adsFromCsv = [], objectives = {}) {
  const prompt = `Eres experto en Meta Ads y asistente de marketing. Analiza este texto de un trafficker sobre anuncios.

Texto del usuario:
"""
${rawText}
"""

Tu tarea:

## 1. Notas generales para el equipo de copy (notasCopy)
Interpreta las observaciones GENERALES del usuario (patrones, tendencias, formatos) y reescríbelas de forma profesional y concisa para el equipo de copy.
NO copies literalmente el texto del usuario — interpreta y sintetiza.
Devuelve MÁXIMO 3-5 oraciones organizadas en párrafos cortos, cada párrafo sobre un tema distinto.

Ejemplo de entrada (lo que dice el usuario):
"Los estáticos están funcionando muy bien, literalmente los 4 anuncios que vendieron hoy fueron estáticos. Habría que hacer más estáticos. También los videos con hooks tipo pregunta generan intriga."

Ejemplo de salida esperada (notasCopy):
"Los formatos estáticos están dominando las conversiones. Recomendación: priorizar producción de contenido estático.

Los videos con hooks tipo pregunta generan buena intriga — replicar este formato con otras usuarias."

Si no hay notas generales suficientes, pon cadena vacía.

## 2. Anuncios específicos mencionados
Para cada anuncio que el usuario mencione por nombre o descripción identificable, extrae:
- "nombre": como lo dijo el usuario (o lo más identificable)
- "descripcion": limpia el comentario del usuario usando SUS palabras (conciso, 1-2 oraciones). TEXTO PLANO, sin markdown. NO inventes, NO digas "el consultor dice..."
- "accionRecomendada": NUNCA digas "escalar" para un anuncio (los anuncios no se escalan — solo conjuntos y campañas). Para anuncios con buen rendimiento: "Considerar replicar formato con anuncios similares", "Evaluar para replicar con variaciones", "Usar como referencia para nuevos creativos". Para anuncios con mal rendimiento: "Evaluar para optimizar", "Considerar pausar si no mejora". Para regulares: "Monitorear rendimiento". Tono SIEMPRE consultivo, nunca imperativo.
- "metricas": compras, costo_por_compra, valor_conversion, gasto, clics, pagos_iniciados — extrae TODAS las que el usuario mencione. Si dice "se gastó 46K" → gasto: 46000. Si dice "3 pagos iniciados a 18K" → pagos_iniciados: 3, costo_por_compra podría calcularse. Convierte K a miles (46K = 46000), M a millones. (SOLO si el usuario las mencionó explícitamente; 0 si no — no inventes).

IMPORTANTE sobre nombres de anuncios:
- Extrae el nombre MÁS COMPLETO posible. Si el usuario dice "el anuncio brief número 31 rodaje bello", pon "brief #31 rodaje bello" como nombre.
- Si el usuario menciona números o códigos (ej: "2931", "AP5.1", "DCT15"), inclúyelos en el nombre.
- Si el usuario dice algo genérico como "el anuncio flex" o "el estático", intenta ser más específico buscando contexto.

IMPORTANTE:
- NO hagas matching con CSV (eso lo hace otro sistema).
- NO clasifiques severidad (otro sistema).
- Usa las palabras del usuario, limpias y organizadas.
- Si el usuario dice que algo está mal, refléjalo fielmente en la acción recomendada.

Responde SOLO con JSON válido sin markdown code blocks:
{
  "notasCopy": "texto markdown con sub-secciones (puede ser vacío)",
  "ads": [
    {
      "nombre": "nombre como lo dijo el usuario",
      "descripcion": "descripción limpia y concisa",
      "accionRecomendada": "acción específica en imperativo",
      "metricas": { "compras": 0, "costo_por_compra": 0, "valor_conversion": 0, "gasto": 0, "clics": 0, "pagos_iniciados": 0 }
    }
  ]
}`;

  const text = await callAI(
    [{ role: "user", content: prompt }],
    "Analizas textos de marketing digital para Meta Ads. Respondes SOLO con JSON válido sin markdown code blocks."
  );

  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("La IA devolvió un formato inválido");
  }

  if (typeof parsed.notasCopy !== "string") parsed.notasCopy = "";
  if (!Array.isArray(parsed.ads)) parsed.ads = [];

  // POST-PROCESO 1: Matching determinístico client-side contra el CSV (nombre + métricas)
  parsed.ads = parsed.ads.map(ad => {
    const userMetrics = ad.metricas ? {
      spend: ad.metricas.gasto || 0,
      conversionValue: ad.metricas.valor_conversion || 0,
      purchases: ad.metricas.compras || 0,
    } : null;
    const match = findBestMatchWithMetrics(ad.nombre, adsFromCsv, userMetrics);
    if (match) {
      const cpp = match.costPerPurchase || (match.purchases && match.spend ? match.spend / match.purchases : 0);
      return {
        ...ad,
        nombre: match.name, // usar nombre exacto del CSV
        matchedFromCsv: true,
        matchedCsvName: match.name,
        metricas: {
          compras: match.purchases || 0,
          costo_por_compra: cpp || 0,
          valor_conversion: match.conversionValue || 0,
          gasto: match.spend || 0,
          clics: match.linkClicks || 0,
          pagos_iniciados: match.initiatedCheckouts || 0,
        },
      };
    }
    return { ...ad, matchedFromCsv: false, matchedCsvName: null };
  });

  // POST-PROCESO 2: Clasificar severidad según métricas + objetivos del cliente
  parsed.ads = parsed.ads.map(ad => ({
    ...ad,
    severidad: classifyAdSeverity(ad.metricas, objectives),
    link: "",
  }));

  // POST-PROCESO 3: Deduplicar anuncios por CSV match o por nombre normalizado
  const seen = new Map();
  const deduped = [];
  for (const ad of parsed.ads) {
    const key = ad.matchedCsvName || String(ad.nombre || "").toLowerCase().replace(/[^\w]/g, "").trim();
    if (!key) { deduped.push(ad); continue; }
    if (seen.has(key)) {
      const existing = seen.get(key);
      // Merge: keep longer description, prefer matched one
      if (ad.descripcion && (!existing.descripcion || ad.descripcion.length > existing.descripcion.length)) {
        existing.descripcion = ad.descripcion;
      }
      if (ad.accionRecomendada && !existing.accionRecomendada) {
        existing.accionRecomendada = ad.accionRecomendada;
      }
    } else {
      seen.set(key, ad);
      deduped.push(ad);
    }
  }
  parsed.ads = deduped;

  return parsed;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS PARA MATCHING + SEVERIDAD + RENDERING DE MARKDOWN
// ═════════════════════════════════════════════════════════════════════════════

// Busca el mejor match de un nombre de anuncio contra la lista del CSV.
// findBestMatch y findBestMatchWithMetrics se movieron a ./lib/reportes/adMatching.js

// Procesa texto de análisis de campañas y lo matchea contra datos CSV.
// Retorna array de objetos estructurados con métricas reales, o null si no hay data.
function processCampaignAnalysis(text, campaigns) {
  if (!text || !campaigns || campaigns.length === 0) return null;

  // Filter out interaction and messaging campaigns — only keep purchase-oriented ones for matching
  const purchaseCampaigns = campaigns.filter(c =>
    c.objective === "purchase" || (c.purchases && c.purchases > 0)
  );

  // First try splitting by double newline
  let blocks = text.split(/\n\n+/).filter(b => b.trim());

  // If only 1 block but multiple lines, try to detect campaign names by matching against CSV
  if (blocks.length <= 1) {
    const lines = text.split("\n").filter(l => l.trim());
    const newBlocks = [];
    let currentBlock = [];
    for (const line of lines) {
      const trimmed = line.trim().replace(/^\*\*|\*\*$/g, "").replace(/:$/, "");
      // Check if this line matches a campaign name
      if (currentBlock.length > 0 && trimmed.length < 120 && findBestMatch(trimmed, purchaseCampaigns)) {
        newBlocks.push(currentBlock.join("\n"));
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) newBlocks.push(currentBlock.join("\n"));
    if (newBlocks.length > 1) blocks = newBlocks;
  }

  const results = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(l => l.trim());
    if (lines.length === 0) continue;

    // First line = campaign name (strip markdown bold)
    const rawName = lines[0].trim().replace(/^\*\*|\*\*$/g, "").replace(/:$/, "");

    // Extract any mentioned metrics from the text for metric-based matching
    const blockText = block;
    const extractNum = (pattern) => { const m = blockText.match(pattern); return m ? parseFloat(m[1].replace(/[.,]/g, "")) : 0; };
    const userMetrics = {
      spend: extractNum(/(?:gastado?|gasto|importe)\s*\$?([\d.,]+)/i),
      conversionValue: extractNum(/(?:vendi[oó]|conversión|valor)\s*\$?([\d.,]+)/i),
      purchases: extractNum(/(\d+)\s*(?:ventas?|compras?)/i),
    };

    // Try to match against CSV campaigns (name + metrics) — use filtered purchase campaigns
    const match = findBestMatchWithMetrics(rawName, purchaseCampaigns, userMetrics);

    // Middle lines = description, action lines separated
    const descLines = [];
    const actionLines = [];
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^(Escalar|Evaluar|Pausar|Monitorear|Optimizar|Recomendación|Acción)/i.test(l)) {
        actionLines.push(l);
      } else {
        descLines.push(l);
      }
    }

    const item = {
      campaignName: rawName,
      matchedFromCsv: !!match,
      matchedCsvName: match ? match.name : null,
      descripcion: descLines.join("\n"),
      accionRecomendada: actionLines.join("\n") || "",
      metricas: match ? {
        compras: match.purchases || 0,
        costo_por_compra: match.costPerPurchase || (match.purchases && match.spend ? match.spend / match.purchases : 0),
        valor_conversion: match.conversionValue || 0,
        gasto: match.spend || 0,
        roas: match.purchaseRoas || (match.spend > 0 && match.conversionValue > 0 ? match.conversionValue / match.spend : 0),
      } : null,
    };

    results.push(item);
  }

  return results.length > 0 ? results : null;
}

// classifyAdSeverity se movió a ./lib/reportes/adMatching.js

// Parser mínimo de markdown → JSX. Soporta: **negrita**, bullets (-), headings (##/###), párrafos.
function renderMarkdown(text, opts = {}) {
  if (!text || typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  const elements = [];
  let currentList = null;
  let keyCounter = 0;

  const parseInline = (str) => {
    const parts = [];
    const regex = /(\*\*[^*]+\*\*)/g;
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(str)) !== null) {
      if (m.index > lastIdx) parts.push(str.substring(lastIdx, m.index));
      parts.push(<strong key={`b-${keyCounter++}`} style={{ color: DS.textPrimary, fontWeight: 700 }}>{m[1].replace(/^\*\*|\*\*$/g, "")}</strong>);
      lastIdx = m.index + m[1].length;
    }
    if (lastIdx < str.length) parts.push(str.substring(lastIdx));
    return parts.length > 0 ? parts : [str];
  };

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      elements.push(
        <ul key={`ul-${keyCounter++}`} style={{ margin: "6px 0 10px 18px", paddingLeft: 4, listStyle: "disc", color: opts.color || DS.textSecondary }}>
          {currentList}
        </ul>
      );
    }
    currentList = null;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); return; }

    // Bullet
    if (/^[-•*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-•*]\s+/, "");
      if (!currentList) currentList = [];
      currentList.push(
        <li key={`li-${i}-${keyCounter++}`} style={{ marginBottom: 4, lineHeight: 1.6, fontSize: opts.fontSize || 13 }}>
          {parseInline(content)}
        </li>
      );
      return;
    }

    // Heading (### or ##)
    if (/^#{2,4}\s+/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^#{2,4}\s+/, "");
      elements.push(
        <div key={`h-${i}-${keyCounter++}`} style={{ fontSize: 12, fontWeight: 700, color: opts.headingColor || DS.textPrimary, marginTop: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {parseInline(content)}
        </div>
      );
      return;
    }

    // Paragraph
    flushList();
    elements.push(
      <div key={`p-${i}-${keyCounter++}`} style={{ marginBottom: 8, lineHeight: 1.65, fontSize: opts.fontSize || 13, color: opts.color || DS.textSecondary }}>
        {parseInline(trimmed)}
      </div>
    );
  });

  flushList();
  return elements;
}

// getAdSeverityStyle se movió a ./lib/reportes/adMatching.js

// Re-busca UN solo anuncio contra la lista del CSV usando una descripción más detallada del usuario.
// OPTIMIZACIÓN: pre-filtra client-side los 30 candidatos más probables por keywords antes de enviar a la IA.
// Esto mantiene el costo en tokens constante (~1-2K) sin importar si hay 10 o 500 ads en el CSV.
// Devuelve { match: bool, nombreExacto: string | null, razonamiento: string }
async function rematchSingleAd(description, adsFromCsv) {
  if (!adsFromCsv || adsFromCsv.length === 0) {
    return { match: false, nombreExacto: null, razonamiento: "No hay CSV de anuncios importado" };
  }

  // Pre-filtro: ranking client-side por overlap de keywords
  // Así solo le mandamos al IA los 30 candidatos más prometedores, no los 200+
  const STOP_WORDS = new Set(["el","la","los","las","de","del","y","con","en","por","para","mi","un","una","que","es","al","lo","le","se","su","sus","a","e","o"]);
  const normalize = (s) => String(s).toLowerCase().replace(/[^\w\sáéíóúñü#]/g, " ").replace(/\s+/g, " ").trim();
  const keywords = (s) => normalize(s).split(" ").filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  const descLower = normalize(description);
  const descKws = keywords(description);

  const scored = adsFromCsv.map(a => {
    const nameLower = normalize(a.name);
    const nameKws = keywords(a.name);
    let score = 0;
    // Substring score
    if (descLower.includes(nameLower) || nameLower.includes(descLower)) score += 100;
    // Keyword overlap score
    const overlap = nameKws.filter(k => descKws.includes(k)).length;
    score += overlap * 10;
    // Purchase bonus (más probable que mencione ads con compras)
    if (a.purchases > 0) score += 5;
    return { ad: a, score };
  }).sort((a, b) => b.score - a.score);

  // Top 30 candidatos — si el usuario menciona algo que matchea, estará aquí
  const topCandidates = scored.slice(0, 30).map(s => s.ad);

  const csvList = topCandidates.map((a, i) =>
    `${i + 1}. "${a.name}" — ${a.purchases || 0} compras, $${Math.round(a.spend || 0)} gasto${a.conversionValue ? ", $" + Math.round(a.conversionValue) + " conv." : ""}`
  ).join("\n");

  const prompt = `Eres experto en Meta Ads. Tienes una descripción detallada de un anuncio de parte de un trafficker y necesitas identificar a cuál de los anuncios del CSV se refiere.

Descripción del trafficker:
"""
${description}
"""

Anuncios disponibles en el CSV:
${csvList}

Tu tarea: encontrar el match más probable basado en el nombre y las métricas mencionadas. Sé flexible con el matching (fuzzy), incluye casos donde el trafficker use un nombre parcial o alternativo.

Responde SOLO con JSON válido (sin markdown):
{
  "match": true|false,
  "nombreExacto": "nombre exacto del CSV" | null,
  "razonamiento": "breve explicación (max 15 palabras)"
}`;

  const text = await callAI(
    [{ role: "user", content: prompt }],
    "Identificas anuncios de Meta Ads. Responde SOLO con JSON válido sin markdown."
  );

  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else return { match: false, nombreExacto: null, razonamiento: "Error parseando IA" };
  }

  return {
    match: !!parsed.match,
    nombreExacto: parsed.nombreExacto || null,
    razonamiento: parsed.razonamiento || "",
  };
}

// Procesa un análisis libre del usuario y detecta qué secciones del tipo de reporte están cubiertas.
// Devuelve { sections: {key: texto}, missing: [keys faltantes] }
async function processAnalysisText(rawText, reportType, objectives = {}) {
  const config = REPORT_TYPES[reportType];
  if (!config) throw new Error("Tipo de reporte no válido");

  const sectionsList = config.sections.map((s, i) =>
    `${i + 1}. key="${s.key}" | título="${s.title}" | pregunta="${s.ph}"`
  ).join("\n");

  const jsonSkeleton = config.sections.map(s => `    "${s.key}": ""`).join(",\n");

  const prompt = `Eres un asistente experto en marketing digital que analiza textos de reporte de campañas publicitarias de Meta Ads.

Tipo de reporte: ${config.label}
Descripción: ${config.desc}

Objetivos de la cuenta:
- ROAS mínimo: ${objectives.roasMin || 4}×
- ROAS objetivo: ${objectives.roasTarget || 6}×
- Costo/compra objetivo: $${objectives.costPerPurchaseTarget || 50000}
- Costo/compra máx: $${objectives.costPerPurchaseMax || 80000}

El usuario debe cubrir estas secciones en su análisis (usa las claves exactas en el JSON):
${sectionsList}

Texto del usuario:
"""
${rawText}
"""

Tu tarea: Para CADA sección listada arriba, extrae el contenido relevante de las palabras del usuario y devuélvelo como texto plano limpio, fácil de leer.

## Formato del contenido (TEXTO PLANO, sin markdown)

Reglas de formato:
- NO uses asteriscos (**), NO uses markdown de ningún tipo.
- Separa ideas diferentes con líneas en blanco (doble salto de línea).
- Una idea por línea o párrafo corto.
- Si quieres listar puntos, usa cada uno en su propia línea pero SIN "-" o "•" al inicio.
- Cita números y valores como "ROAS 3.5×", "$60K-65K", "4 ventas" — directo sin decorar.

Ejemplo del estilo esperado para "Rendimiento actual":

Estado general: el día va un poco caro.

ROAS promedio bajito, debería estar mínimo en 4×.
Costo por compra elevado, $60K-65K versus el objetivo de $50K.
Tendencia: mejorando versus días previos ($65K-69K).

Conclusión: técnicamente bien pero caro.

## Reglas estrictas
- Una sección está cubierta si el usuario menciona ALGO relevante, aunque sea en 1-2 oraciones.
- NO inventes contenido. Si el usuario no toca la sección, déjala con cadena vacía y ponla en "missing".
- Usa las palabras del usuario — no inventes métricas ni conclusiones.
- Organiza lo que dijo para que sea escaneable: una idea por línea, ideas relacionadas en párrafo.
- Si el usuario mezcla temas, distribuye el contenido entre secciones.
- No agregues explicaciones, solo el JSON.

## 3. Detalles de campañas mencionadas

IMPORTANTE: EXTRAE TODAS las campañas que el usuario mencione, incluso si la mención es breve. Si el usuario menciona 5 campañas, devuelve 5 entries. Si menciona 10, devuelve 10. NO resumas, NO omitas, NO agrupes. Cada campaña distinta = un entry separado.

REGLA CRÍTICA: NO es obligatorio tener campañas en ambas categorías. Si el usuario SOLO habla de campañas buenas, devuelve solo entries con type="escala". Si solo habla de malas, solo type="optimizacion". NO INVENTES campañas de optimización si todas las mencionadas son buenas. Es VÁLIDO que un reporte tenga 0 campañas de optimización o 0 de escala. Solo incluye campañas que el usuario REALMENTE mencionó como problemáticas o exitosas.

También para adsets: si el usuario menciona conjuntos de anuncios dentro de una campaña, inclúyelos TODOS en el array \`adsets\` de esa campaña.

Para CADA campaña que el usuario mencione por nombre, extrae:
- "name": nombre de la campaña como lo dijo el usuario
- "type": "escala" si es positiva, "optimizacion" si es negativa/problemática
- "description": Menciona cómo se compara con los objetivos de la cuenta. Ejemplo si ROAS objetivo es 5×: "ROAS 7.57× muy por encima del objetivo 5×, costo/compra bajo. Excelente rendimiento." NO uses descripciones genéricas como "Campaña con buen rendimiento". Sé específico con métricas reales y comparación vs objetivos.
- "action": recomendación consultiva (ej: "Evaluar para optimizar", "Considerar escalar")
- "metricsFromText": métricas que el usuario mencionó explícitamente { "spend": 0, "purchases": 0, "costPerPurchase": 0, "conversionValue": 0, "initiatedCheckouts": 0, "costPerInitiated": 0 }
- "adsets": array de conjuntos de anuncios mencionados DENTRO de esta campaña. Cada uno con: "name", "description", "action", "metricsFromText" (mismo formato que arriba)

Si el usuario no menciona campañas específicas, dejar campaignDetails como array vacío.
IMPORTANTE sobre acciones: NUNCA usar "Pausar inmediatamente" ni imperativos agresivos. Siempre usar tono consultivo: "Evaluar para optimizar", "Considerar escalar", "Monitorear rendimiento".
IMPORTANTE sobre métricas: Convierte K a miles (46K = 46000), M a millones.

Responde SOLO con JSON válido con esta estructura exacta (sin markdown code blocks):
{
  "sections": {
${jsonSkeleton}
  },
  "campaignDetails": [],
  "missing": []
}

En "missing" lista las claves de secciones no cubiertas.`;

  const text = await callAI(
    [{ role: "user", content: prompt }],
    "Analizas textos de marketing digital. Responde SOLO con JSON válido sin markdown.",
    5000
  );

  // Parse JSON robustly
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    // Try to extract JSON from text if surrounded by extra text
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("La IA devolvió un formato inválido");
  }

  if (!parsed.sections || typeof parsed.sections !== "object") {
    throw new Error("Respuesta de IA sin sección 'sections'");
  }
  if (!Array.isArray(parsed.missing)) parsed.missing = [];
  if (!Array.isArray(parsed.campaignDetails)) parsed.campaignDetails = [];

  // Normaliza: asegúrate de que todas las keys existan y marca como missing las vacías
  for (const s of config.sections) {
    if (!(s.key in parsed.sections)) parsed.sections[s.key] = "";
    if (!parsed.sections[s.key] || String(parsed.sections[s.key]).trim() === "") {
      if (!parsed.missing.includes(s.key)) parsed.missing.push(s.key);
      parsed.sections[s.key] = "";
    }
  }

  return parsed;
}

async function extractMetricsFromImages(imageDataList) {
  const content = imageDataList.map(img => ({
    type: "image",
    source: { type: "base64", media_type: img.type, data: img.data }
  }));
  content.push({
    type: "text",
    text: `Eres un experto en Meta Ads. Extrae ÚNICAMENTE las métricas numéricas de estas capturas de pantalla de Meta Ads Manager.
Devuelve SOLO un JSON válido con estos campos exactos (usa 0 si no encuentras el valor):
{
  "spend": número en COP,
  "conversion": valor total de conversiones en COP,
  "clicks": número de clics en el enlace,
  "impressions": número de impresiones totales,
  "reach": alcance único,
  "pageVisits": visitas a la página de destino,
  "initiatedCheckouts": pagos iniciados,
  "purchases": número de compras,
  "ctr": CTR porcentaje,
  "cpm": costo por mil impresiones en COP,
  "cpc": costo por clic en COP
}
Solo el JSON, sin texto adicional, sin markdown.`
  });
  const text = await callAI([{ role: "user", content }], "Extrae métricas de Meta Ads. Responde solo con JSON válido.", 2000);
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    logger.error("JSON parse error:", e, "Raw text:", text);
    return null;
  }
}

async function generateRecommendations(reportData, metricsCalc, companyObj, context) {
  const costPerPurchase = reportData.spend / reportData.purchases;
  const avgTicket = reportData.conversion / reportData.purchases;

  // Evaluar cada etapa del embudo
  const ctrOk = metricsCalc.ctr >= (companyObj.ctrTarget || 2);
  const cpmOk = metricsCalc.cpm <= (companyObj.cpm || 12000) * 1.3;
  const loadOk = metricsCalc.pageLoadRate >= (companyObj.pageLoadMin || 80);
  const checkoutInitOk = metricsCalc.checkoutRate >= (companyObj.checkoutRateTarget || 15);
  const checkoutConvOk = metricsCalc.checkoutConversion >= (companyObj.checkoutConversionTarget || 20);
  const roasOk = metricsCalc.roas >= (companyObj.roasMin || 4);

  const funnelAnalysis = `
ANÁLISIS DEL EMBUDO (CRÍTICO — basa las recomendaciones en esto):

TRÁFICO — LOS ANUNCIOS:
- Alcance: ${fmt(reportData.reach)} personas | Impresiones: ${fmt(reportData.impressions)} | Frecuencia: ${reportData.reach ? (reportData.impressions/reportData.reach).toFixed(2) : "—"}×
- CPM: $${fmt(metricsCalc.cpm)} COP (referencia: $${fmt(companyObj.cpm || 12000)}) → ${cpmOk ? "✓ OK" : "⚠ ALTO"}
- Clics: ${fmt(reportData.clicks)} | CTR: ${pct(metricsCalc.ctr)} (objetivo: ${companyObj.ctrTarget || 2}%) → ${ctrOk ? "✓ OK" : "🔴 CUELLO DE BOTELLA — los anuncios no están jalando suficientes clics"}
- CPC: $${fmt(metricsCalc.cpc)} COP (objetivo: $${fmt(companyObj.cpcTarget || 600)})

CONVERSIÓN — LA PÁGINA:
- Visitas: ${fmt(reportData.pageVisits)} | Tasa de carga: ${pct(metricsCalc.pageLoadRate)} → ${loadOk ? "✓ OK" : "⚠ BAJA"}
- Pagos iniciados: ${fmt(reportData.initiatedCheckouts)} | % Ida a checkout: ${pct(metricsCalc.checkoutRate)} (objetivo: ${companyObj.checkoutRateTarget || 15}–30%) → ${checkoutInitOk ? "✓ OK" : "🔴 CUELLO DE BOTELLA — muy pocos visitantes están iniciando el pago, problema en la página de producto"}
- Conversión del checkout: ${pct(metricsCalc.checkoutConversion)} (objetivo: 20–30%) → ${checkoutConvOk ? "✓ OK" : "⚠ MEJORABLE"}
- Compras: ${reportData.purchases} | Costo por compra REAL: $${fmt(costPerPurchase)} COP (gasto÷compras, NO usar valor de conversión÷compras) | Máx: $${fmt(companyObj.costPerPurchaseMax || 80000)} | Objetivo: $${fmt(companyObj.costPerPurchaseTarget || 50000)}
- Ticket promedio (valor conversión÷compras): $${fmt(avgTicket)} COP — este es el ingreso promedio por compra, NO el costo por compra
- ROAS: ${metricsCalc.roas.toFixed(2)}× (mínimo: ${companyObj.roasMin || 4}×, objetivo: ${companyObj.roasTarget || 6}×) → ${roasOk ? "✓ OK" : "🔴 POR DEBAJO DEL MÍNIMO"}`;

  const prompt = `Eres consultor experto en Meta Ads para e-commerce colombiano trabajando para Inforce Consulting.

EMPRESA: ${reportData.companyName} | PERÍODO: ${reportData.period}
GASTO: $${fmt(reportData.spend)} COP | CONVERSIÓN TOTAL: $${fmt(reportData.conversion)} COP | ROAS: ${metricsCalc.roas.toFixed(2)}×

${funnelAnalysis}

CONTEXTO DEL TRAFFICKER:
${context || "Sin contexto adicional"}

OBSERVACIONES DE ANUNCIOS:
${reportData.adObservations?.map((a, i) => `${i+1}. ${a.text}`).join("\n") || "Sin observaciones"}

INSTRUCCIONES CRÍTICAS PARA LAS RECOMENDACIONES:
1. El costo por compra real es GASTO÷COMPRAS = $${fmt(costPerPurchase)} COP. NUNCA uses valor_conversion÷compras para calcular costo por compra.
2. Prioriza los cuellos de botella reales del embudo. Si hay un cuello en "ida a checkout" (~7%), la recomendación debe ser optimizar la PÁGINA DE PRODUCTO (botón de compra visible, urgencia, reviews, velocidad móvil, métodos de pago como PSE/Nequi), NO bajar presupuesto.
3. Si CTR está bajo (~1.37%), la recomendación es mejorar los CREATIVOS (hooks más directos, videos más nativos, propuesta de valor más clara), no métricas genéricas.
4. Si una etapa está BIEN (ejemplo: tasa de carga 89%, conv. checkout 28%), NO la menciones como problema.
5. Solo recomienda bajar presupuesto si TODAS las etapas están mal. Si hay un cuello específico, la solución es arreglarlo, no bajar el gasto.
6. Las recomendaciones deben ser accionables y específicas para el mercado colombiano.

Genera exactamente 5 recomendaciones ordenadas por impacto potencial. Responde SOLO con JSON:
[
  {"titulo": "título concreto (5-8 palabras)", "descripcion": "qué hacer exactamente y por qué, mencionando los números reales del reporte, 2-3 oraciones", "responsable": "trafficker|cliente|ambos", "urgencia": "inmediato|esta semana|próxima semana"},
  ...
]
Solo el array JSON, sin texto adicional.`;

  const text = await callAI([{ role: "user", content: prompt }], "Eres consultor experto en Meta Ads. Solo responde con JSON válido.");
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(clean);
  } catch { return []; }
}

// ── DATE RANGE PICKER ────────────────────────────────────────────────────────
function DateRangePicker({ value, onChange, mode }) {
  const { isDark } = useTheme();
  const today = new Date();
  const fmt8 = (d) => d.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const [from, setFrom] = useState(value?.from || fmt8(sevenDaysAgo));
  const [to, setTo] = useState(value?.to || fmt8(today));
  const [fromTime, setFromTime] = useState(value?.fromTime || "");
  const [toTime, setToTime] = useState(value?.toTime || "");
  const [useTime, setUseTime] = useState(!!(value?.fromTime || value?.toTime));

  const buildLabel = (f, t, ft, tt) => {
    const df = new Date(f + "T12:00:00");
    const dt = new Date(t + "T12:00:00");
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const sameDay = f === t;
    const sameMonth = df.getMonth() === dt.getMonth() && df.getFullYear() === dt.getFullYear();
    let base = sameDay
      ? `${df.getDate()} de ${months[df.getMonth()]} ${df.getFullYear()}`
      : sameMonth
      ? `${df.getDate()} – ${dt.getDate()} de ${months[df.getMonth()]} ${df.getFullYear()}`
      : `${df.getDate()} ${months[df.getMonth()]} – ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
    if (ft || tt) {
      if (sameDay && ft && tt) base += `, ${ft} – ${tt}`;
      else if (ft) base += ` desde ${ft}`;
      else if (tt) base += ` hasta ${tt}`;
    }
    return base;
  };

  const update = (f, t, ft, tt) => {
    setFrom(f); setTo(t); setFromTime(ft); setToTime(tt);
    onChange({ from: f, to: t, fromTime: ft, toTime: tt, label: buildLabel(f, t, ft, tt) });
  };

  const inp = { width: "100%", padding: "10px 12px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 13, boxSizing: "border-box", background: DS.bgCard, color: DS.textPrimary };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const firstOfMonth = (y, m) => fmt8(new Date(y, m, 1));
  const lastOfMonth = (y, m) => fmt8(new Date(y, m + 1, 0));
  const monthName = (m) => ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m];

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO: HORAS — hoy, rango de horas desde 00:00 hasta ahora
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === "horas") {
    const todayStr = fmt8(today);
    const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const displayDate = `${today.getDate()} de ${months[today.getMonth()]} ${today.getFullYear()}`;
    return (
      <div>
        <div style={{ padding: "12px 16px", borderRadius: DS.radius, background: "rgba(55,138,221,0.08)", border: "1px solid rgba(55,138,221,0.25)", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 24 }}>⚡</div>
          <div>
            <div style={{ fontSize: 10, color: "#378ADD", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Hoy</div>
            <div style={{ fontSize: 14, color: DS.textPrimary, fontWeight: 600 }}>{displayDate}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Desde (hora)</label>
            <input type="time" value={fromTime} onChange={e => update(todayStr, todayStr, e.target.value, toTime)} style={inp} />
          </div>
          <div style={{ paddingTop: 16, color: DS.textMuted }}>→</div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Hasta (hora)</label>
            <input type="time" value={toTime} onChange={e => update(todayStr, todayStr, fromTime, e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ marginTop: 10, padding: "6px 12px", background: DS.bgCard, borderRadius: 8, fontSize: 12, color: DS.textSecondary, fontStyle: "italic" }}>
          ⏱ {buildLabel(todayStr, todayStr, fromTime, toTime)}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO: DIARIO — un solo día específico
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === "diario") {
    const setDay = (d) => update(d, d, "", "");
    return (
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { label: "Hoy", action: () => setDay(fmt8(today)) },
            { label: "Ayer", action: () => { const y = new Date(today); y.setDate(today.getDate()-1); setDay(fmt8(y)); } },
            { label: "Anteayer", action: () => { const y = new Date(today); y.setDate(today.getDate()-2); setDay(fmt8(y)); } },
          ].map(({ label, action }) => (
            <button key={label} onClick={action}
              style={{ padding: "5px 14px", borderRadius: 50, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 11, color: DS.textSecondary, fontWeight: 500 }}>
              {label}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Selecciona el día</label>
        <input type="date" value={from} max={fmt8(today)} onChange={e => setDay(e.target.value)} style={inp} />
        <div style={{ marginTop: 10, padding: "6px 12px", background: DS.bgCard, borderRadius: 8, fontSize: 12, color: DS.textSecondary, fontStyle: "italic" }}>
          📅 {buildLabel(from, from, "", "")}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO: SEMANAL — span forzado de 7 días
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === "semanal") {
    const setWeekFromStart = (startStr) => {
      const start = new Date(startStr + "T12:00:00");
      const end = new Date(start); end.setDate(start.getDate() + 6);
      update(fmt8(start), fmt8(end), "", "");
    };
    const last7 = () => { const s = new Date(today); s.setDate(today.getDate() - 6); update(fmt8(s), fmt8(today), "", ""); };
    const thisWeek = () => { const mon = new Date(today); const dow = mon.getDay() || 7; mon.setDate(today.getDate() - dow + 1); update(fmt8(mon), fmt8(today), "", ""); };
    const lastWeek = () => { const mon = new Date(today); const dow = mon.getDay() || 7; mon.setDate(today.getDate() - dow - 6); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); update(fmt8(mon), fmt8(sun), "", ""); };
    return (
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { label: "Últimos 7 días", action: last7 },
            { label: "Esta semana (lun-hoy)", action: thisWeek },
            { label: "Semana pasada (lun-dom)", action: lastWeek },
          ].map(({ label, action }) => (
            <button key={label} onClick={action}
              style={{ padding: "5px 14px", borderRadius: 50, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 11, color: DS.textSecondary, fontWeight: 500 }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Inicio de la semana (7 días desde esta fecha)</label>
          <input type="date" value={from} max={fmt8(today)} onChange={e => setWeekFromStart(e.target.value)} style={inp} />
        </div>
        <div style={{ padding: "6px 12px", background: DS.bgCard, borderRadius: 8, fontSize: 12, color: DS.textSecondary, fontStyle: "italic" }}>
          📊 {buildLabel(from, to, "", "")} <span style={{ color: DS.textMuted }}>(7 días)</span>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO: MENSUAL — mes completo forzado
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === "mensual") {
    const setMonth = (y, m) => {
      const start = firstOfMonth(y, m);
      const lastDay = new Date(y, m + 1, 0);
      const endStr = lastDay > today ? fmt8(today) : lastOfMonth(y, m);
      update(start, endStr, "", "");
    };
    const cy = today.getFullYear(), cm = today.getMonth();
    const presets = [
      { label: "Este mes", y: cy, m: cm },
      { label: "Mes pasado", y: cm === 0 ? cy - 1 : cy, m: cm === 0 ? 11 : cm - 1 },
      { label: "Hace 2 meses", y: cm <= 1 ? cy - 1 : cy, m: (cm - 2 + 12) % 12 },
    ];
    // Derive selected from `from` date
    const sel = new Date(from + "T12:00:00");
    const selY = sel.getFullYear(), selM = sel.getMonth();
    return (
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => setMonth(p.y, p.m)}
              style={{ padding: "5px 14px", borderRadius: 50, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 11, color: DS.textSecondary, fontWeight: 500 }}>
              {p.label}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Selecciona el mes</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={selM} onChange={e => setMonth(selY, parseInt(e.target.value, 10))} style={{ ...inp, flex: 2 }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i} style={{ background: DS.bgSide }}>{monthName(i)}</option>)}
          </select>
          <select value={selY} onChange={e => setMonth(parseInt(e.target.value, 10), selM)} style={{ ...inp, flex: 1 }}>
            {Array.from({ length: 5 }, (_, i) => cy - 2 + i).map(y => <option key={y} value={y} style={{ background: DS.bgSide }}>{y}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 10, padding: "6px 12px", background: DS.bgCard, borderRadius: 8, fontSize: 12, color: DS.textSecondary, fontStyle: "italic" }}>
          📆 {buildLabel(from, to, "", "")}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO: PUNTUAL (y default) — rango totalmente libre con presets
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* Presets rápidos */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "Hoy", action: () => { const t = fmt8(today); update(t, t, fromTime, toTime); } },
          { label: "Ayer", action: () => { const y = new Date(today); y.setDate(today.getDate()-1); const s = fmt8(y); update(s, s, "", ""); } },
          { label: "Últimos 3 días", action: () => { const d = new Date(today); d.setDate(today.getDate()-3); update(fmt8(d), fmt8(today), "", ""); } },
          { label: "Últimos 7 días", action: () => { update(fmt8(sevenDaysAgo), fmt8(today), "", ""); } },
          { label: "Fin de semana pasado", action: () => { const d = new Date(today); const dow = d.getDay(); const sun = new Date(d); sun.setDate(d.getDate() - (dow === 0 ? 7 : dow)); const sat = new Date(sun); sat.setDate(sun.getDate() - 1); update(fmt8(sat), fmt8(sun), "", ""); } },
          { label: "Este mes", action: () => { const m = new Date(today.getFullYear(), today.getMonth(), 1); update(fmt8(m), fmt8(today), "", ""); } },
        ].map(({ label, action }) => (
          <button key={label} onClick={action}
            style={{ padding: "5px 12px", borderRadius: 50, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 11, color: DS.textSecondary, fontWeight: 500 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Fechas */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Desde</label>
          <input type="date" value={from} max={to} onChange={e => update(e.target.value, to, fromTime, toTime)} style={inp} />
        </div>
        <div style={{ paddingTop: 16, color: DS.textMuted }}>→</div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Hasta</label>
          <input type="date" value={to} min={from} max={fmt8(today)} onChange={e => update(from, e.target.value, fromTime, toTime)} style={inp} />
        </div>
      </div>

      {/* Toggle horas */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: useTime ? 10 : 0 }}>
        <button onClick={() => { setUseTime(u => !u); if (useTime) update(from, to, "", ""); }}
          style={{ padding: "4px 12px", borderRadius: 20, border: DS.border, background: useTime ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") : DS.bgCard, color: DS.textPrimary, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
          {useTime ? "✓ Con rango de hora" : "⏱ Agregar rango de hora"}
        </button>
        {useTime && <span style={{ fontSize: 11, color: DS.textMuted }}>Útil para reportes de un solo día</span>}
      </div>

      {/* Horas — solo si está activo */}
      {useTime && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Hora inicio</label>
            <input type="time" value={fromTime} onChange={e => update(from, to, e.target.value, toTime)} style={inp} />
          </div>
          <div style={{ paddingTop: 16, color: DS.textMuted }}>→</div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4 }}>Hora fin</label>
            <input type="time" value={toTime} onChange={e => update(from, to, fromTime, e.target.value)} style={inp} />
          </div>
        </div>
      )}

      {/* Preview del período */}
      {(from || to) && (
        <div style={{ marginTop: 10, padding: "6px 12px", background: DS.bgCard, borderRadius: 8, fontSize: 12, color: DS.textSecondary, fontStyle: "italic" }}>
          📅 {buildLabel(from, to, fromTime, toTime)}
        </div>
      )}
    </div>
  );
}

// ── IMAGE UPLOADER ───────────────────────────────────────────────────────────
// ── CSV IMPORT (Meta Ads) ────────────────────────────────────────────────────
// parseCsvText, parseCsvNumber, META_CSV_COLUMNS, classifyObjective,
// matchCsvColumns y parseMetaCsv se movieron a ./lib/reportes/csv.js

function CsvImporter({ onData, dateRange, onUpdateDateRange }) {
  const [results, setResults] = useState([]); // array de { fileName, parsed | error }
  const [processing, setProcessing] = useState(false);
  const [applied, setApplied] = useState(false);
  const fileRef = useRef();

  // Metadata por nivel (para título dinámico)
  const LEVEL_META = {
    campaign: { emoji: "⚡", label: "Campañas", color: "#378ADD" },
    adset:    { emoji: "📂", label: "Conjuntos de anuncios", color: "#F5A623" },
    ad:       { emoji: "🎯", label: "Anuncios", color: "#8B5CF6" },
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setProcessing(true);
    setApplied(false);
    const parsed = [];
    for (const f of files) {
      try {
        const ext = f.name.toLowerCase().split(".").pop();
        if (ext !== "csv" && ext !== "txt") {
          parsed.push({ fileName: f.name, error: "Formato no soportado (solo CSV)" });
          continue;
        }
        const text = await f.text();
        const p = parseMetaCsv(text);
        if (p.error) {
          parsed.push({ fileName: f.name, error: p.error });
          continue;
        }
        if (!p.level) {
          parsed.push({ fileName: f.name, error: "No se detectó nivel" });
          continue;
        }
        if (p.entries.length === 0) {
          parsed.push({ fileName: f.name, error: `Sin ${LEVEL_META[p.level].label.toLowerCase()} con gasto` });
          continue;
        }
        parsed.push({ fileName: f.name, parsed: p });
      } catch (err) {
        parsed.push({ fileName: f.name, error: err.message || "Error al parsear" });
      }
    }
    setResults(parsed);
    setProcessing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyAll = () => {
    const valid = results.filter(r => r.parsed && !r.error);
    if (valid.length === 0) return;
    for (const r of valid) {
      if (onData) onData(r.parsed);
    }
    setApplied(true);
  };

  // Auto-pick dateRange del primer CSV válido (preguntar al usuario)
  const firstValid = results.find(r => r.parsed && !r.error);
  const csvDateFrom = firstValid?.parsed.csvDateFrom;
  const csvDateTo = firstValid?.parsed.csvDateTo;

  const reset = () => {
    setResults([]);
    setApplied(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validResults = results.filter(r => r.parsed && !r.error);
  const errorResults = results.filter(r => r.error);

  return (
    <div>
      {/* Upload button — acepta múltiples archivos */}
      {results.length === 0 && !processing && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: "11px 20px", borderRadius: 10, background: "linear-gradient(135deg, #1DB97A, #17a368)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 8px rgba(29,185,122,0.3)" }}>
            <span style={{ fontSize: 16 }}>📥</span> Importar CSVs de Meta Ads (hasta 3)
          </button>
          <span style={{ fontSize: 11, color: DS.textMuted }}>
            Selecciona los 3 archivos al mismo tiempo — el sistema detecta cada nivel
          </span>
        </div>
      )}

      {processing && (
        <div style={{ padding: "12px 14px", background: "rgba(29,185,122,0.06)", borderRadius: 10, fontSize: 12, color: DS.green, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(29,185,122,0.3)", borderTopColor: DS.green, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Parseando archivos…
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" multiple onChange={handleFiles} style={{ display: "none" }} />

      {/* Lista de archivos parseados */}
      {results.length > 0 && !processing && (
        <div style={{ marginTop: 14, padding: "16px 18px", background: DS.bgCard, border: DS.border, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>
              📋 {results.length} archivo{results.length !== 1 ? "s" : ""} detectado{results.length !== 1 ? "s" : ""}
              {validResults.length > 0 && <span style={{ color: DS.green, marginLeft: 6 }}>· {validResults.length} válido{validResults.length !== 1 ? "s" : ""}</span>}
              {errorResults.length > 0 && <span style={{ color: "#ff6b6b", marginLeft: 6 }}>· {errorResults.length} con error</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {!applied && validResults.length > 0 && (
                <button onClick={applyAll}
                  style={{ padding: "8px 18px", borderRadius: 50, background: darkBtn.background, color: darkBtn.color, border: DS.border, cursor: "pointer", fontSize: 12, fontWeight: 700, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
                  Aplicar todo al reporte →
                </button>
              )}
              {applied && (
                <span style={{ padding: "8px 16px", borderRadius: 50, background: "rgba(29,185,122,0.2)", color: DS.green, fontSize: 12, fontWeight: 700, border: "1px solid rgba(29,185,122,0.4)" }}>
                  ✓ Aplicado
                </span>
              )}
              <button onClick={reset}
                style={{ padding: "8px 12px", borderRadius: 50, background: "transparent", color: DS.textMuted, border: DS.border, cursor: "pointer", fontSize: 11 }}>
                {applied ? "Cerrar" : "✕"}
              </button>
            </div>
          </div>

          {/* Una fila por archivo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r, i) => {
              if (r.error) {
                return (
                  <div key={i} style={{ padding: "10px 14px", background: "rgba(226,75,74,0.06)", border: "1px solid rgba(226,75,74,0.25)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(226,75,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚠️</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#ff8a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName}</div>
                      <div style={{ fontSize: 10, color: "#ff6b6b" }}>{r.error}</div>
                    </div>
                  </div>
                );
              }
              const p = r.parsed;
              const meta = LEVEL_META[p.level] || { emoji: "📄", label: "Datos", color: DS.green };
              const levelLabel = p.level === "campaign" ? "campañas de venta" : p.level === "adset" ? "conjuntos activos" : "anuncios activos";
              return (
                <div key={i} style={{ padding: "10px 14px", background: `${meta.color}10`, border: `1px solid ${meta.color}44`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${meta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{meta.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName}</div>
                    <div style={{ fontSize: 10, color: DS.textMuted }}>
                      Nivel <strong style={{ color: meta.color }}>{meta.label}</strong> · {p.entries.length} {levelLabel}
                      {p.filteredOutCount > 0 && <span> · {p.filteredOutCount} omitidos</span>}
                      {" · "}{Object.values(p.mapping).filter(Boolean).length}/{p.headers.length} columnas OK
                    </div>
                    {p.level === "campaign" && p.totals.spend > 0 && p.totals.conversion > 0 && (() => {
                      const roas = p.totals.conversion / p.totals.spend;
                      return (
                        <div style={{ fontSize: 10, color: DS.textSecondary, marginTop: 2 }}>
                          💰 {fmtM(p.totals.spend)} gasto · {fmtM(p.totals.conversion)} conv. · ROAS <strong style={{ color: roas >= 4 ? DS.green : roas >= 2 ? DS.amber : "#ff8a8a" }}>{roas.toFixed(2)}×</strong>
                        </div>
                      );
                    })()}
                  </div>
                  <span style={{ fontSize: 16, color: DS.green }}>✓</span>
                </div>
              );
            })}
          </div>

          {/* Botón "usar fechas del CSV" si difieren (del primer archivo válido) */}
          {csvDateFrom && csvDateTo && dateRange && (csvDateFrom !== dateRange.from || csvDateTo !== dateRange.to) && onUpdateDateRange && (() => {
            const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
            const fmtD = (iso) => { const d = new Date(iso + "T12:00:00"); return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; };
            const same = csvDateFrom === csvDateTo;
            const label = same ? fmtD(csvDateFrom) : `${fmtD(csvDateFrom)} – ${fmtD(csvDateTo)}`;
            return (
              <div style={{ marginTop: 10, padding: "9px 14px", background: "rgba(55,138,221,0.08)", border: "1px solid rgba(55,138,221,0.25)", borderRadius: 8, fontSize: 11, color: "#378ADD", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span>📅 Los CSVs cubren <strong>{label}</strong>. ¿Usar estas fechas para el reporte?</span>
                <button onClick={() => onUpdateDateRange({ from: csvDateFrom, to: csvDateTo, fromTime: "", toTime: "", label })}
                  style={{ padding: "4px 12px", borderRadius: 50, background: "#378ADD", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  Usar fechas del CSV
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ImageUploader({ onExtracted }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef();

  const handleFiles = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    Promise.all(arr.map(f => new Promise((res) => {
      const reader = new FileReader();
      reader.onload = (e) => res({ name: f.name, type: f.type, data: e.target.result.split(",")[1], preview: e.target.result });
      reader.readAsDataURL(f);
    }))).then(imgs => setImages(prev => [...prev, ...imgs]));
  };

  const extract = async () => {
    if (!images.length) return;
    setLoading(true);
    let extracted = null;
    try {
      extracted = await extractMetricsFromImages(images);
    } catch (e) {
      setLoading(false);
      alert("Error al extraer métricas: " + e.message);
      return;
    }
    setLoading(false);
    if (extracted) { setDone(true); onExtracted(extracted); }
    else alert("No se pudieron extraer las métricas. Intenta con imágenes más claras.");
  };

  return (
    <div>
      <div onClick={() => inputRef.current.click()} onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        style={{ border: DS.borderDash, borderRadius: 10, padding: "20px", textAlign: "center", cursor: "pointer", background: DS.bgCard, transition: "background 0.15s" }}>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
        {images.length === 0 ? (
          <div>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: DS.textPrimary, marginBottom: 4 }}>Sube capturas de Meta Ads</div>
            <div style={{ fontSize: 11, color: DS.textMuted }}>Arrastra o haz clic · Puedes subir varias imágenes</div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={img.preview} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: DS.border }} />
                <button onClick={e => { e.stopPropagation(); setImages(imgs => imgs.filter((_,j) => j !== i)); }}
                  style={{ position: "absolute", top: -6, right: -6, background: "#E24B4A", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            ))}
            <div style={{ width: 80, height: 60, border: DS.borderDash, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: DS.textMuted }}>+</div>
          </div>
        )}
      </div>
      {images.length > 0 && !done && (
        <button onClick={extract} disabled={loading}
          style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: loading ? DS.bgCard : DS.green, color: "white", fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
          {loading ? "Extrayendo métricas con IA…" : `Extraer métricas de ${images.length} imagen${images.length > 1 ? "s" : ""} →`}
        </button>
      )}
      {done && <div style={{ marginTop: 8, fontSize: 12, color: DS.green, fontWeight: 600, textAlign: "center" }}>✓ Métricas extraídas correctamente</div>}
    </div>
  );
}

// ── STEP 2: CONTEXT + AI AD EXTRACTOR ────────────────────────────────────────
function Step2Ads({
  reportType,
  sections,
  setSections,
  analysisRawText,
  setAnalysisRawText,
  analysisProcessed,
  analysisProcessing,
  analysisMissing,
  analysisError,
  onProcessAnalysis,
  onResetAnalysis,
  onSkipAnalysis,
  allSectionsComplete,
  adObservations,
  setAdObservations,
  notasCopy,
  setNotasCopy,
  ads, // lista de anuncios del CSV (para matching)
  objectives, // objetivos del cliente (para clasificar severidad)
  onBack,
  onNext,
}) {
  const { isDark } = useTheme();
  const [adsRawText, setAdsRawText] = useState("");
  const [adsProcessing, setAdsProcessing] = useState(false);
  const [adsProcessed, setAdsProcessed] = useState(false);
  const [skipModal, setSkipModal] = useState(null); // null | "analysis" | "ads"
  const [adsError, setAdsError] = useState(null);
  const [extractedAds, setExtractedAds] = useState(null); // array después del procesamiento
  // Estado para "aclarar" un ad sin match
  const [clarifyIndex, setClarifyIndex] = useState(null); // qué ad tiene el textarea abierto
  const [clarifyText, setClarifyText] = useState("");
  const [rematchingIndex, setRematchingIndex] = useState(null); // qué ad está re-buscando
  const [rematchError, setRematchError] = useState(null);

  // Mapea un ad extraído al formato de adObservations (nueva estructura)
  const adToObservation = (ad) => ({
    nombre: ad.nombre,
    descripcion: ad.descripcion || "",
    accionRecomendada: ad.accionRecomendada || "",
    severidad: ad.severidad || "sin_datos",
    matchedFromCsv: ad.matchedFromCsv || false,
    matchedCsvName: ad.matchedCsvName || null,
    metricas: ad.metricas || {},
    link: ad.link || "",
    img: null,
    // Backward compat: text field para renderers viejos
    text: ad.descripcion || ad.nombre,
  });

  // Procesar con IA: extrae notas para copy + lista de anuncios (con matching determinístico contra CSV)
  const processAds = async () => {
    if (!adsRawText.trim()) return;
    setAdsProcessing(true);
    setAdsError(null);
    try {
      const result = await processAdsText(adsRawText, ads || [], objectives || {});
      setNotasCopy(result.notasCopy || "");
      setExtractedAds(result.ads || []);
      setAdObservations((result.ads || []).map(adToObservation));
      setAdsProcessed(true);
    } catch (err) {
      logger.error("Error procesando anuncios:", err);
      setAdsError(err.message || "Error al procesar con IA");
      setAdsProcessed(true);
      setExtractedAds([]);
    } finally {
      setAdsProcessing(false);
    }
  };

  const resetAdsProcessing = () => {
    setAdsProcessed(false);
    setAdsError(null);
    setExtractedAds(null);
  };

  const skipAds = () => {
    setAdsRawText("");
    setNotasCopy("");
    setAdObservations([]);
    setExtractedAds([]);
    setAdsProcessed(true);
    setAdsError(null);
    setSkipModal(null);
  };

  // Actualizar un campo de un ad extraído
  const updateExtractedAd = (i, field, value) => {
    const newAds = extractedAds.map((ad, j) => (j === i ? { ...ad, [field]: value } : ad));
    setExtractedAds(newAds);
    setAdObservations(newAds.map(adToObservation));
  };

  const removeExtractedAd = (i) => {
    const newAds = extractedAds.filter((_, j) => j !== i);
    setExtractedAds(newAds);
    setAdObservations(newAds.map(adToObservation));
  };

  // Re-buscar un ad sin match con descripción adicional del usuario
  const rematchAdWithClarification = async (index) => {
    const ad = extractedAds[index];
    if (!ad) return;
    const fullDescription = `Nombre original: ${ad.nombre}${ad.observacion ? `. Observación: ${ad.observacion}` : ""}. Aclaración del usuario: ${clarifyText}`;

    setRematchingIndex(index);
    setRematchError(null);
    try {
      const result = await rematchSingleAd(fullDescription, ads || []);
      if (result.match && result.nombreExacto) {
        const csvAd = (ads || []).find(a => a.name === result.nombreExacto);
        if (csvAd) {
          const cpp = csvAd.costPerPurchase || (csvAd.purchases && csvAd.spend ? csvAd.spend / csvAd.purchases : 0);
          const newMetricas = {
            compras: csvAd.purchases || 0,
            costo_por_compra: cpp || 0,
            valor_conversion: csvAd.conversionValue || 0,
            gasto: csvAd.spend || 0,
            clics: csvAd.linkClicks || 0,
            pagos_iniciados: csvAd.initiatedCheckouts || 0,
          };
          const newAd = {
            ...ad,
            nombre: csvAd.name,
            matchedFromCsv: true,
            matchedCsvName: csvAd.name,
            descripcion: (ad.descripcion || "") + (clarifyText ? ` (aclarado: ${clarifyText})` : ""),
            metricas: newMetricas,
            severidad: classifyAdSeverity(newMetricas, objectives || {}),
          };
          const newExtracted = extractedAds.map((a, j) => j === index ? newAd : a);
          setExtractedAds(newExtracted);
          setAdObservations(newExtracted.map(adToObservation));
          // Cierra el clarify input
          setClarifyIndex(null);
          setClarifyText("");
        } else {
          setRematchError(`Match reportado pero no encontrado en CSV: "${result.nombreExacto}"`);
        }
      } else {
        setRematchError(`La IA no pudo identificarlo (${result.razonamiento}). Intenta con más detalles.`);
      }
    } catch (err) {
      logger.error("Rematch error:", err);
      setRematchError(err.message || "Error al re-buscar con IA");
    } finally {
      setRematchingIndex(null);
    }
  };

  // Match manual: el usuario elige directamente del dropdown
  const manualMatchAd = (index, csvAdName) => {
    if (!csvAdName) return;
    const csvAd = (ads || []).find(a => a.name === csvAdName);
    if (!csvAd) return;
    const ad = extractedAds[index];
    const cpp = csvAd.costPerPurchase || (csvAd.purchases && csvAd.spend ? csvAd.spend / csvAd.purchases : 0);
    const newMetricas = {
      compras: csvAd.purchases || 0,
      costo_por_compra: cpp || 0,
      valor_conversion: csvAd.conversionValue || 0,
      gasto: csvAd.spend || 0,
      clics: csvAd.linkClicks || 0,
      pagos_iniciados: csvAd.initiatedCheckouts || 0,
    };
    const newAd = {
      ...ad,
      nombre: csvAd.name,
      matchedFromCsv: true,
      matchedCsvName: csvAd.name,
      metricas: newMetricas,
      severidad: classifyAdSeverity(newMetricas, objectives || {}),
    };
    const newExtracted = extractedAds.map((a, j) => j === index ? newAd : a);
    setExtractedAds(newExtracted);
    setAdObservations(newExtracted.map(adToObservation));
    setClarifyIndex(null);
    setClarifyText("");
  };

  const sLabel = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: DS.textMuted, marginBottom: 8 };

  const typeConfig = reportType ? REPORT_TYPES[reportType] : null;

  return (
    <div>
      {/* Skip confirmation modal */}
      {skipModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
             onClick={() => setSkipModal(null)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: DS.bg, border: DS.border, borderRadius: 14, padding: "24px 28px", maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary, textAlign: "center", marginBottom: 10 }}>
              ¿Estás seguro de omitir esta sección?
            </div>
            <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.6, textAlign: "center", marginBottom: 20 }}>
              Recuerda que llenar esta sección es <strong style={{ color: DS.textPrimary }}>muy importante</strong> para poder darle al cliente un reporte completo y recomendaciones valiosas.
              <br /><br />
              Si la omites, el reporte quedará sin {skipModal === "analysis" ? "análisis de campañas" : "observaciones de anuncios"}.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setSkipModal(null)}
                style={{ padding: "10px 20px", borderRadius: 10, border: DS.border, background: DS.bgCard, color: DS.textPrimary, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: DS.font }}>
                No, seguir llenando
              </button>
              <button onClick={() => { if (skipModal === "analysis" && onSkipAnalysis) onSkipAnalysis(); else if (skipModal === "ads") skipAds(); setSkipModal(null); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: DS.red, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: DS.font }}>
                Sí, omitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ANÁLISIS DEL REPORTE CON IA ═══ */}
      {typeConfig && (
        <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "18px 20px", marginBottom: 12, border: `1px solid ${typeConfig.color}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: typeConfig.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧠</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Análisis del reporte — {typeConfig.label}</div>
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
                {analysisProcessed ? "Revisa y edita cada sección detectada" : "La IA va a detectar qué secciones cubre tu texto"}
              </div>
            </div>
          </div>

          {!analysisProcessed ? (
            /* ───── ESTADO A: Pegar texto ───── */
            <>
              <div style={{ padding: "10px 14px", background: "rgba(55,138,221,0.06)", border: "1px solid rgba(55,138,221,0.2)", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#7FB8E8" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>📌 Cubre estos puntos en UN solo texto:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {typeConfig.sections.map((s, i) => (
                    <div key={s.key} style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: typeConfig.color, fontWeight: 700 }}>{i + 1}.</span>
                      <span><strong>{s.title}</strong> — <span style={{ color: DS.textSecondary }}>{s.ph}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              <textarea
                value={analysisRawText}
                onChange={e => setAnalysisRawText(e.target.value)}
                rows={10}
                placeholder={`Pega acá tu análisis completo (puedes grabar audio en ChatGPT, copiar la transcripción y pegarla).\n\nEjemplo: "El día va bien con ROAS promedio de 3.5x. La campaña ANDRÓMEDA está liderando con 7.8x. Hay que revisar RECICLADOS TOP que tiene gasto alto pero ROAS bajo. Vamos a escalar ANDRÓMEDA y pausar RECICLADOS TOP 2. Para copy, sugerir nuevas creativas porque las actuales no están funcionando."`}
                style={{ width: "100%", padding: "14px 16px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 13, boxSizing: "border-box", resize: "vertical", background: DS.bgCard, color: DS.textPrimary, lineHeight: 1.7, fontFamily: DS.font }}
              />

              {analysisError && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, fontSize: 11, color: "#ff6b6b" }}>
                  ⚠️ {analysisError}
                </div>
              )}

              <button onClick={onProcessAnalysis} disabled={!analysisRawText.trim() || analysisProcessing}
                style={{ marginTop: 12, width: "100%", padding: "13px", borderRadius: 10, border: "none", background: analysisProcessing || !analysisRawText.trim() ? DS.bgCard : typeConfig.color, color: analysisProcessing || !analysisRawText.trim() ? DS.textMuted : "#fff", fontSize: 13, fontWeight: 700, cursor: analysisProcessing || !analysisRawText.trim() ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {analysisProcessing ? (
                  <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Procesando con IA…</>
                ) : (
                  <>🧠 Procesar con IA →</>
                )}
              </button>
              {onSkipAnalysis && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button onClick={() => setSkipModal("analysis")}
                    style={{ background: "transparent", border: "none", color: DS.textMuted, fontSize: 10, cursor: "pointer", textDecoration: "underline", fontFamily: DS.font, opacity: 0.6 }}>
                    Omitir esta sección
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ───── ESTADO B: Mostrar secciones detectadas + editables ───── */
            <>
              {(() => { const actualMissing = typeConfig.sections.filter(s => !sections[s.key]?.trim()).length; return (
              <div style={{ padding: "10px 14px", background: actualMissing === 0 ? "rgba(29,185,122,0.08)" : "rgba(226,75,74,0.08)", border: `1px solid ${actualMissing === 0 ? "rgba(29,185,122,0.3)" : "rgba(226,75,74,0.3)"}`, borderRadius: 8, marginBottom: 14, fontSize: 12, color: actualMissing === 0 ? DS.green : "#ff8a8a", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span>
                  {actualMissing === 0
                    ? `✓ ${typeConfig.sections.length}/${typeConfig.sections.length} secciones listas`
                    : `⚠ Faltan ${actualMissing} de ${typeConfig.sections.length} secciones`}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={onResetAnalysis}
                    style={{ padding: "4px 10px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 10, fontWeight: 500 }}>
                    ↩ Editar texto
                  </button>
                  <button onClick={onProcessAnalysis} disabled={analysisProcessing}
                    style={{ padding: "4px 10px", borderRadius: 50, border: "1px solid rgba(55,138,221,0.4)", background: "rgba(55,138,221,0.1)", color: "#7FB8E8", cursor: analysisProcessing ? "default" : "pointer", fontSize: 10, fontWeight: 600 }}>
                    {analysisProcessing ? "..." : "↺ Re-procesar"}
                  </button>
                </div>
              </div>
              ); })()}

              {analysisError && (
                <div style={{ padding: "8px 12px", background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, fontSize: 11, color: "#ff6b6b", marginBottom: 12 }}>
                  ⚠️ {analysisError}
                </div>
              )}

              {/* Secciones detectadas — editables */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {typeConfig.sections.map(s => {
                  const val = sections[s.key] || "";
                  const isMissing = !val.trim();
                  return (
                    <div key={s.key} style={{ background: isMissing ? "rgba(226,75,74,0.05)" : DS.bgCard, border: `1px solid ${isMissing ? "rgba(226,75,74,0.4)" : DS.textHint}`, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: isMissing ? "#ff6b6b" : DS.green, fontWeight: 700 }}>
                          {isMissing ? "❌" : "✓"}
                        </span>
                        <label style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>
                          {s.title}
                          {isMissing && <span style={{ color: "#ff6b6b", marginLeft: 8, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>· FALTA</span>}
                        </label>
                      </div>
                      <textarea
                        value={val}
                        onChange={e => setSections(prev => ({ ...prev, [s.key]: e.target.value }))}
                        rows={6}
                        placeholder={s.ph}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${isMissing ? "rgba(226,75,74,0.3)" : DS.textHint}`, fontSize: 13, boxSizing: "border-box", resize: "vertical", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", color: DS.textPrimary, lineHeight: 1.6, fontFamily: DS.font }}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Si no hay tipo (legacy), mostrar contexto genérico */}
      {!typeConfig && (
        <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 12, border: DS.border }}>
          <div style={sLabel}>Contexto de la cuenta</div>
          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>Selecciona un tipo de reporte al crear para usar el análisis estructurado con IA.</div>
        </div>
      )}

      {/* ═══ BLOQUE UNIFICADO DE ANUNCIOS (notas para copy + observaciones) ═══ */}
      <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "18px 20px", marginBottom: 12, border: "1px solid rgba(244,63,94,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(244,63,94,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📣</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Anuncios — Notas para copy + Observaciones</div>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
              {adsProcessed ? "Revisa las notas y los anuncios detectados" : `Habla libremente: notas para copy + anuncios específicos${ads && ads.length > 0 ? ` · matching con ${ads.length} anuncios del CSV` : ""}`}
            </div>
          </div>
        </div>

        {!adsProcessed ? (
          /* ───── ESTADO A: Pegar texto ───── */
          <>
            <div style={{ padding: "10px 14px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#F87B90" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 Escribe TODO en un solo texto:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div>• <strong>Notas generales para copy:</strong> qué funciona, qué no, ideas, tendencias</div>
                <div>• <strong>Anuncios específicos:</strong> menciona sus nombres — si coinciden con los del CSV importado, se auto-completan las métricas ✨</div>
              </div>
            </div>

            <textarea
              value={adsRawText}
              onChange={e => setAdsRawText(e.target.value)}
              rows={12}
              placeholder={`Pega acá tu texto completo (puedes grabar audio en ChatGPT, copiar transcripción y pegarla).\n\nEjemplo:\n"En general los testimoniales están rindiendo mejor esta semana. Evitar textos largos. Probar variaciones antes/después.\n\nEl ADS ACNE 14 está funcionando super bien, muchas compras. El AD FLEX DCT 17 también viene con buen ROAS. El Juan testimonial gastó mucho pero sin conversiones, pausarlo."`}
              style={{ width: "100%", padding: "14px 16px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 13, boxSizing: "border-box", resize: "vertical", background: DS.bgCard, color: DS.textPrimary, lineHeight: 1.7, fontFamily: DS.font }}
            />

            {adsError && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, fontSize: 11, color: "#ff6b6b" }}>
                ⚠️ {adsError}
              </div>
            )}

            <button onClick={processAds} disabled={!adsRawText.trim() || adsProcessing}
              style={{ marginTop: 12, width: "100%", padding: "13px", borderRadius: 10, border: adsProcessing || !adsRawText.trim() ? DS.border : "none", background: adsProcessing || !adsRawText.trim() ? DS.bgCard : "#F43F5E", color: adsProcessing || !adsRawText.trim() ? DS.textSecondary : "#fff", fontSize: 13, fontWeight: 700, cursor: adsProcessing || !adsRawText.trim() ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {adsProcessing ? (
                <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Procesando con IA…</>
              ) : (
                <>🧠 Procesar anuncios con IA →</>
              )}
            </button>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button onClick={() => setSkipModal("ads")}
                style={{ background: "transparent", border: "none", color: DS.textMuted, fontSize: 10, cursor: "pointer", textDecoration: "underline", fontFamily: DS.font, opacity: 0.6 }}>
                Omitir esta sección
              </button>
            </div>
          </>
        ) : (
          /* ───── ESTADO B: Resultado procesado ───── */
          <>
            <div style={{ padding: "10px 14px", background: "rgba(29,185,122,0.08)", border: "1px solid rgba(29,185,122,0.3)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: DS.green, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                ✓ {extractedAds?.length || 0} anuncio{(extractedAds?.length || 0) !== 1 ? "s" : ""} detectado{(extractedAds?.length || 0) !== 1 ? "s" : ""}
                {extractedAds && extractedAds.filter(a => a.matchedFromCsv).length > 0 && (
                  <span style={{ color: DS.textSecondary, marginLeft: 8 }}>· {extractedAds.filter(a => a.matchedFromCsv).length} matcheado{extractedAds.filter(a => a.matchedFromCsv).length !== 1 ? "s" : ""} con CSV</span>
                )}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={resetAdsProcessing}
                  style={{ padding: "4px 10px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 10, fontWeight: 500 }}>
                  ↩ Editar texto
                </button>
                <button onClick={processAds} disabled={adsProcessing}
                  style={{ padding: "4px 10px", borderRadius: 50, border: "1px solid rgba(244,63,94,0.4)", background: "rgba(244,63,94,0.1)", color: "#F87B90", cursor: adsProcessing ? "default" : "pointer", fontSize: 10, fontWeight: 600 }}>
                  {adsProcessing ? "..." : "↺ Re-procesar"}
                </button>
              </div>
            </div>

            {adsError && (
              <div style={{ padding: "8px 12px", background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, fontSize: 11, color: "#ff6b6b", marginBottom: 12 }}>
                ⚠️ {adsError}
              </div>
            )}

            {/* Notas para copy — editable */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#F43F5E", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                📝 Notas para copy
              </div>
              <textarea value={notasCopy || ""} onChange={e => setNotasCopy(e.target.value)} rows={5}
                placeholder="Notas para el equipo de copy (extraídas por IA o escritas manualmente)"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(244,63,94,0.25)", fontSize: 13, boxSizing: "border-box", resize: "vertical", background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", color: DS.textPrimary, lineHeight: 1.6, fontFamily: DS.font }} />
            </div>

            {/* Lista de anuncios extraídos */}
            {extractedAds && extractedAds.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: DS.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  🎯 Anuncios detectados
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {extractedAds.map((ad, i) => {
                  const sev = getAdSeverityStyle(ad.severidad || "sin_datos");
                  return (
                    <div key={i} style={{ background: sev.bg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${sev.border}` }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: sev.color + "33", color: sev.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <input value={ad.nombre} onChange={e => updateExtractedAd(i, "nombre", e.target.value)}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: DS.border, fontSize: 13, fontWeight: 700, boxSizing: "border-box", marginBottom: 6, background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", color: DS.textPrimary }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 9, color: sev.color, fontWeight: 800, padding: "3px 9px", background: sev.color + "22", borderRadius: 20, border: `1px solid ${sev.color}44`, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
                              <span>{sev.icon}</span> {sev.label}
                            </span>
                            {ad.matchedFromCsv && (
                              <span style={{ fontSize: 9, color: DS.green, fontWeight: 700, padding: "3px 8px", background: "rgba(29,185,122,0.12)", borderRadius: 20 }}>✓ CSV</span>
                            )}
                            {ads && ads.length > 0 && (
                              <button onClick={() => { setClarifyIndex(clarifyIndex === i ? null : i); setClarifyText(""); setRematchError(null); }}
                                style={{ fontSize: 9, color: "#7FB8E8", fontWeight: 700, padding: "3px 10px", background: "rgba(55,138,221,0.1)", borderRadius: 20, border: "1px solid rgba(55,138,221,0.3)", cursor: "pointer" }}>
                                {ad.matchedFromCsv ? "✏️ Cambiar match" : "✏️ Aclarar"}
                              </button>
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeExtractedAd(i)}
                          style={{ background: "transparent", border: "none", color: DS.textMuted, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
                      </div>

                      {/* Panel de aclaración — visible si clarifyIndex === i (permite cambiar match aunque ya esté matcheado) */}
                      {clarifyIndex === i && ads && ads.length > 0 && (
                        <div style={{ marginBottom: 10, padding: "12px 14px", background: "rgba(55,138,221,0.05)", border: "1px solid rgba(55,138,221,0.25)", borderRadius: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7FB8E8", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            🔎 {ad.matchedFromCsv ? "Cambiar el match de este anuncio" : "Aclarar este anuncio"}
                          </div>
                          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>
                            {ad.matchedFromCsv
                              ? `Si la IA matcheó con el anuncio equivocado, agrega más detalles y re-buscará, o selecciona manualmente el correcto de los ${ads.length} anuncios del CSV.`
                              : `Agrega más detalles (nombre más completo, campaña donde está, métricas que recuerdas) y la IA va a re-buscarlo en los ${ads.length} anuncios del CSV.`}
                          </div>
                          <textarea value={clarifyText} onChange={e => setClarifyText(e.target.value)} rows={3}
                            placeholder={`ej. "Es el anuncio con el testimonial de acné en el pecho, está en la campaña REFRESH ONE CBO, tuvo como 7 compras"`}
                            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid rgba(55,138,221,0.3)", fontSize: 12, boxSizing: "border-box", resize: "vertical", background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", color: DS.textPrimary, lineHeight: 1.6, fontFamily: DS.font, marginBottom: 8 }} />

                          {rematchError && (
                            <div style={{ padding: "7px 10px", background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.25)", borderRadius: 6, fontSize: 10, color: "#ff8a8a", marginBottom: 8 }}>
                              ⚠️ {rematchError}
                            </div>
                          )}

                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <button onClick={() => rematchAdWithClarification(i)} disabled={!clarifyText.trim() || rematchingIndex === i}
                              style={{ padding: "6px 14px", borderRadius: 50, border: "none", background: (!clarifyText.trim() || rematchingIndex === i) ? DS.bgCard : "#378ADD", color: (!clarifyText.trim() || rematchingIndex === i) ? DS.textMuted : "#fff", cursor: (!clarifyText.trim() || rematchingIndex === i) ? "default" : "pointer", fontSize: 11, fontWeight: 700 }}>
                              {rematchingIndex === i ? "Re-buscando…" : "🔄 Re-buscar con IA"}
                            </button>

                            <div style={{ fontSize: 10, color: DS.textMuted, textAlign: "center" }}>— o busca manualmente —</div>

                            <div style={{ flex: 1, position: "relative" }}>
                              <input
                                placeholder="Escribe nombre del anuncio..."
                                onChange={e => {
                                  const q = e.target.value.toLowerCase().trim();
                                  if (!q) { e.target.nextSibling.style.display = "none"; return; }
                                  e.target.nextSibling.style.display = "block";
                                  const items = e.target.nextSibling.querySelectorAll("[data-name]");
                                  items.forEach(item => {
                                    item.style.display = item.dataset.name.toLowerCase().includes(q) ? "block" : "none";
                                  });
                                }}
                                onFocus={e => { if (e.target.value.trim()) e.target.nextSibling.style.display = "block"; }}
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: DS.border, background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)", color: DS.textPrimary, fontSize: 11, boxSizing: "border-box" }}
                              />
                              <div style={{ display: "none", position: "absolute", top: "100%", left: 0, right: 0, maxHeight: 200, overflowY: "auto", background: isDark ? "rgba(10,10,16,0.98)" : "#FFFFFF", border: DS.border, borderRadius: 8, zIndex: 100, marginTop: 2 }}>
                                {(ads || []).map((csvAd, idx) => (
                                  <div key={idx} data-name={csvAd.name}
                                    onClick={e => { manualMatchAd(i, csvAd.name); e.target.closest("[style*='position: relative']").querySelector("input").value = ""; e.target.closest("[style*='display: block']") && (e.target.closest("[style*='position: absolute']").style.display = "none"); }}
                                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 11, color: DS.textSecondary, borderBottom: DS.border, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                    onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    {csvAd.name}
                                    {csvAd.purchases > 0 && <span style={{ color: DS.green, marginLeft: 6, fontSize: 10 }}>({csvAd.purchases} compras)</span>}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <button onClick={() => { setClarifyIndex(null); setClarifyText(""); setRematchError(null); }}
                              style={{ padding: "6px 10px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textMuted, cursor: "pointer", fontSize: 10 }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Métricas — siempre las 5 mismas (Compras, Costo/compra, Conversión, Gasto, ROAS) */}
                      {ad.matchedFromCsv && ad.metricas && (() => {
                        const m = ad.metricas;
                        const compras = m.compras || 0;
                        const conv = m.valor_conversion || 0;
                        const gasto = m.gasto || 0;
                        const cpp = m.costo_por_compra || (compras > 0 ? gasto / compras : 0);
                        const roas = gasto > 0 && conv > 0 ? conv / gasto : 0;
                        const fmtCell = (label, val, highlight) => (
                          <div style={{ background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", borderRadius: 6, padding: "5px 10px", border: DS.border }}>
                            <span style={{ fontSize: 9, color: DS.textMuted }}>{label}: </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: highlight || "#fff" }}>{val}</span>
                          </div>
                        );
                        return (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                            {fmtCell("Compras", compras)}
                            {fmtCell("Costo/compra", cpp > 0 ? `$${Math.round(cpp).toLocaleString("es-CO")}` : "—", cpp > 0 ? sev.color : undefined)}
                            {fmtCell("Conversión", `$${Math.round(conv).toLocaleString("es-CO")}`)}
                            {fmtCell("Gasto", `$${Math.round(gasto).toLocaleString("es-CO")}`)}
                            {fmtCell("ROAS", roas > 0 ? `${roas.toFixed(2)}×` : "—", roas > 0 ? sev.color : undefined)}
                          </div>
                        );
                      })()}

                      {/* La cadena de diagnóstico (clase 9.5). El CPA de arriba
                          dice QUÉ falla; la cadena, leída en orden, dice DÓNDE.
                          Solo aparece cuando el anuncio no viene bien: con todo
                          en verde no hay nada que diagnosticar. */}
                      {["malo", "critico", "regular"].includes(ad.severidad) && (
                        <CadenaDeDiagnostico metricas={ad.metricas} isDark={isDark} />
                      )}

                      {/* Descripción (READ-ONLY display) */}
                      {ad.descripcion && (
                        <div style={{ marginBottom: 8, padding: "9px 12px", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", borderRadius: 8, borderLeft: `2px solid ${sev.color}55` }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Descripción</div>
                          <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.55 }}>{ad.descripcion}</div>
                        </div>
                      )}

                      {/* Acción recomendada (READ-ONLY display) */}
                      {ad.accionRecomendada && (
                        <div style={{ padding: "10px 13px", background: sev.color + "14", borderRadius: 8, border: `1px solid ${sev.color}44`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ fontSize: 14, lineHeight: 1 }}>{sev.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: sev.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Acción recomendada</div>
                            <div style={{ fontSize: 12, color: DS.textPrimary, fontWeight: 600, lineHeight: 1.5 }}>{ad.accionRecomendada}</div>
                          </div>
                        </div>
                      )}

                      {/* Link (editable) */}
                      <div style={{ marginTop: 8 }}>
                        <input value={ad.link || ""} onChange={e => updateExtractedAd(i, "link", e.target.value)}
                          placeholder="Link del anuncio en Meta (opcional)"
                          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: DS.border, fontSize: 11, boxSizing: "border-box", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", color: DS.textSecondary }} />
                      </div>
                    </div>
                  );
                })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Navegación inferior — MODO ESTRICTO: solo se puede pasar si todas las secciones del análisis están llenas */}
      <>
        {reportType && !allSectionsComplete && (
          <div style={{ padding: "10px 14px", background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, marginBottom: 10, fontSize: 11, color: "#ff8a8a", display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠</span>
            <span>Debes completar todas las secciones del análisis de tráfico antes de continuar al paso de Generar.</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ ...darkBtnGhost, flex: 1, padding: "12px 0", fontSize: 13 }}>← Volver</button>
          <button onClick={onNext} disabled={reportType && !allSectionsComplete}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: (reportType && !allSectionsComplete) ? DS.bgCard : darkBtn.background, color: (reportType && !allSectionsComplete) ? DS.textMuted : darkBtn.color, fontSize: 13, fontWeight: 700, cursor: (reportType && !allSectionsComplete) ? "default" : "pointer" }}>
            {(reportType && !allSectionsComplete) ? "Completa el análisis para continuar" : "Siguiente: Generar →"}
          </button>
        </div>
      </>
    </div>
  );
}

// ── REPORT TYPE SELECTOR ─────────────────────────────────────────────────────
function ReportTypeSelector({ company, onSelect, onCancel }) {
  const mask = useCompanyMask();
  const { isDark } = useTheme();
  const typeKeys = ["horas", "diario", "semanal", "mensual", "puntual"];
  return (
    <div style={{ fontFamily: DS.font, background: DS.bg, minHeight: "100vh", color: DS.textPrimary }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 80px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, paddingBottom: 20, borderBottom: DS.border }}>
          <button onClick={onCancel} style={{ ...darkBtnGhost, padding: "6px 14px", fontSize: 12 }}>← Volver</button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Nuevo reporte — {mask.name(company.name, company.id)}</div>
            <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 2 }}>Selecciona el tipo de reporte que quieres crear</div>
          </div>
        </div>

        {/* Grid de tipos */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {typeKeys.map((key, i) => {
            const t = REPORT_TYPES[key];
            const isLast = i === typeKeys.length - 1 && typeKeys.length % 2 === 1;
            return (
              <div key={key}
                onClick={() => onSelect(key)}
                style={{ gridColumn: isLast ? "1 / -1" : "auto", background: DS.bgCard, border: DS.border, borderRadius: DS.radius, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.color + "88"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                {/* Barra de color superior */}
                <div style={{ height: 4, background: t.color, width: "100%" }} />
                <div style={{ padding: "20px" }}>
                  {/* Icono + Título */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: t.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t.emoji}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: t.color, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Reporte</div>
                    </div>
                  </div>
                  {/* Descripción */}
                  <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>{t.desc}</div>
                  {/* Secciones de texto que incluye */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Incluye</div>
                    {t.sections.map(s => (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: DS.textSecondary }}>{s.title}</span>
                      </div>
                    ))}
                  </div>
                  {/* CTA */}
                  <button style={{ width: "100%", padding: "9px 0", borderRadius: 50, border: `1px solid ${t.color}66`, background: t.color + "18", color: t.color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>
                    Crear reporte {t.label} →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── NEW REPORT FORM ──────────────────────────────────────────────────────────
function NewReportForm({ company, reportType, onSave, onCancel }) {
  const { isDark } = useTheme();
  const mask = useCompanyMask();
  const today = new Date();
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const fmt8 = (d) => d.toISOString().split("T")[0];

  // Inicializa el rango de fechas según el tipo de reporte
  const initialRange = (() => {
    const hh = String(today.getHours()).padStart(2, "0");
    const mm = String(today.getMinutes()).padStart(2, "0");
    const now = `${hh}:${mm}`;
    const todayStr = fmt8(today);
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const dayLabel = (d) => `${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
    if (reportType === "horas") {
      return { from: todayStr, to: todayStr, fromTime: "00:00", toTime: now, label: `${dayLabel(today)}, 00:00 – ${now}` };
    }
    if (reportType === "diario") {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      return { from: fmt8(y), to: fmt8(y), fromTime: "", toTime: "", label: dayLabel(y) };
    }
    if (reportType === "semanal") {
      const s = new Date(today); s.setDate(today.getDate() - 6);
      return { from: fmt8(s), to: todayStr, fromTime: "", toTime: "", label: `${s.getDate()} – ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}` };
    }
    if (reportType === "mensual") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt8(firstDay), to: todayStr, fromTime: "", toTime: "", label: `1 – ${today.getDate()} de ${months[today.getMonth()]} ${today.getFullYear()}` };
    }
    // puntual o sin tipo
    return { from: fmt8(sevenDaysAgo), to: todayStr, fromTime: "", toTime: "", label: "" };
  })();

  const [dateRange, setDateRange] = useState(initialRange);
  const [metrics, setMetrics] = useState({ spend: "", conversion: "", clicks: "", impressions: "", reach: "", pageVisits: "", initiatedCheckouts: "", purchases: "" });
  const [adObservations, setAdObservations] = useState([]);
  const [notasCopy, setNotasCopy] = useState(""); // notas para el equipo de copy (en bloque de anuncios)
  const [newObsText, setNewObsText] = useState("");
  const [newObsLink, setNewObsLink] = useState("");
  const [products, setProducts] = useState([]); // [{name, metrics, images}]
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductMetrics, setNewProductMetrics] = useState({ spend: "", conversion: "", purchases: "", clicks: "", impressions: "", reach: "", pageVisits: "", initiatedCheckouts: "" });
  const [newProductImages, setNewProductImages] = useState([]);
  const [extractingProduct, setExtractingProduct] = useState(false);
  const newProductImgRef = useRef();

  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(1); // 1=fechas+imagenes, 2=contexto+obs, 3=preview
  const [sections, setSections] = useState({}); // secciones de texto según el tipo
  const [campaigns, setCampaigns] = useState([]); // desde CSV de Meta Ads (nivel campaña)
  const [adsets, setAdsets] = useState([]);       // desde CSV de Meta Ads (nivel conjunto)
  const [ads, setAds] = useState([]);              // desde CSV de Meta Ads (nivel anuncio)
  // Totales detectados en el CSV de Meta (para reconciliación con Shopify)
  const [csvTotals, setCsvTotals] = useState({ purchases: 0, conversion: 0 });
  // Tracking del origen de los datos extraídos (para mostrar solo una fuente)
  const [imagesExtracted, setImagesExtracted] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  // Estado del bloque de análisis con IA (Step 2)
  const [analysisRawText, setAnalysisRawText] = useState("");
  const [analysisProcessing, setAnalysisProcessing] = useState(false);
  const [analysisProcessed, setAnalysisProcessed] = useState(false);
  const [analysisSkipped, setAnalysisSkipped] = useState(false);
  const [analysisMissing, setAnalysisMissing] = useState([]);
  const [analysisError, setAnalysisError] = useState(null);
  const obsImgRef = useRef();
  const [pendingObsImg, setPendingObsImg] = useState(null);

  const setM = (k, v) => setMetrics(m => ({ ...m, [k]: v }));

  const handleExtracted = (extracted) => {
    // Rellenamos todo EXCEPTO compras y valor de conversión
    // (esas vienen siempre de Shopify, input manual)
    setMetrics(m => ({
      ...m,
      spend: extracted.spend || m.spend || "",
      clicks: extracted.clicks || m.clicks || "",
      impressions: extracted.impressions || m.impressions || "",
      reach: extracted.reach || m.reach || "",
      pageVisits: extracted.pageVisits || m.pageVisits || "",
      initiatedCheckouts: extracted.initiatedCheckouts || m.initiatedCheckouts || "",
      // purchases y conversion NO se rellenan del CSV
    }));
    // Guardamos los totales del CSV para mostrar la reconciliación con Shopify
    if (extracted.purchases || extracted.conversion) {
      setCsvTotals({
        purchases: extracted.purchases || 0,
        conversion: extracted.conversion || 0,
      });
    }
  };

  // Handler cuando las imágenes extraen data (image uploader)
  const handleImageExtracted = (extracted) => {
    handleExtracted(extracted);
    setImagesExtracted(true);
  };

  // Handler cuando se aplica un CSV — despacha según el nivel detectado
  const handleCsvData = (result) => {
    if (!result || !result.level) return;
    if (result.level === "campaign") {
      setCampaigns(result.entries);
      if (result.totals) {
        handleExtracted(result.totals);
        setCsvTotals({
          purchases: result.totals.purchases || 0,
          conversion: result.totals.conversion || 0,
        });
      }
    } else if (result.level === "adset") {
      setAdsets(result.entries);
    } else if (result.level === "ad") {
      setAds(result.entries);
    }
    // Reset key para que el CsvImporter se remonte listo para el siguiente archivo
    setUploaderKey(k => k + 1);
  };

  // Reset del CSV de campañas (botón Quitar)
  const resetCsv = () => {
    setCampaigns([]);
    setCsvTotals({ purchases: 0, conversion: 0 });
    setMetrics({ spend: "", conversion: "", clicks: "", impressions: "", reach: "", pageVisits: "", initiatedCheckouts: "", purchases: "" });
    setUploaderKey(k => k + 1);
  };

  const resetAdsets = () => {
    setAdsets([]);
    setUploaderKey(k => k + 1);
  };

  const resetAds = () => {
    setAds([]);
    setUploaderKey(k => k + 1);
  };

  // Reset de imágenes (botón Quitar en el bloque de imágenes)
  const resetImages = () => {
    setImagesExtracted(false);
    setMetrics({ spend: "", conversion: "", clicks: "", impressions: "", reach: "", pageVisits: "", initiatedCheckouts: "", purchases: "" });
    setUploaderKey(k => k + 1);
  };

  // Procesar el análisis con IA
  const handleProcessAnalysis = async () => {
    if (!analysisRawText.trim() || !reportType) return;
    setAnalysisProcessing(true);
    setAnalysisError(null);
    try {
      const result = await processAnalysisText(analysisRawText, reportType, company.objectives || {});
      setSections(prev => ({ ...prev, ...result.sections }));
      if (result.campaignDetails && result.campaignDetails.length > 0) {
        setSections(s => ({ ...s, _campaignDetails: JSON.stringify(result.campaignDetails) }));
      }
      setAnalysisMissing(result.missing || []);
      setAnalysisProcessed(true);
    } catch (err) {
      logger.error("Error procesando análisis:", err);
      setAnalysisError(err.message || "Error al procesar con IA");
      // Fallback: muestra todas las secciones vacías para completar manual
      setAnalysisMissing(REPORT_TYPES[reportType].sections.map(s => s.key));
      setAnalysisProcessed(true);
    } finally {
      setAnalysisProcessing(false);
    }
  };

  // Saltar análisis — mantiene el reporte pero sin secciones de análisis
  const skipAnalysisHandler = () => {
    setAnalysisRawText("");
    setSections({});
    setAnalysisMissing([]);
    setAnalysisError(null);
    setAnalysisProcessed(true);
    setAnalysisSkipped(true);
  };

  // Volver al estado pre-procesamiento (editar texto original)
  const resetAnalysis = () => {
    setAnalysisProcessed(false);
    setAnalysisSkipped(false);
    setAnalysisMissing([]);
    setAnalysisError(null);
  };

  // Verifica si todas las secciones del tipo están llenas (o fueron omitidas explícitamente)
  const allSectionsComplete = reportType
    ? (analysisSkipped || REPORT_TYPES[reportType].sections.every(s => (sections[s.key] || "").trim().length > 0))
    : true;

  const addObservation = () => {
    if (!newObsText.trim()) return;
    setAdObservations(obs => [...obs, { text: newObsText, link: newObsLink, img: pendingObsImg }]);
    setNewObsText(""); setNewObsLink(""); setPendingObsImg(null);
  };

  const inp = (label, key, ph = "") => {
    const rawVal = metrics[key];
    const numVal = parseFloat(String(rawVal || "").replace(/\./g, "").replace(",", "."));
    const displayVal = rawVal === "" ? "" : (!isNaN(numVal) && rawVal !== String(numVal) ? rawVal : rawVal);
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>{label}</label>
        <input
          value={metrics[key]}
          onChange={e => {
            const v = e.target.value;
            setM(key, v);
          }}
          onBlur={e => {
            const raw = e.target.value.replace(/\./g, "").replace(",", ".");
            const n = parseFloat(raw);
            if (!isNaN(n)) setM(key, Math.round(n).toLocaleString("es-CO"));
          }}
          placeholder={ph}
          style={{ ...darkInput }} />
      </div>
    );
  };

  const metricsReady = metrics.spend && metrics.conversion && metrics.clicks && metrics.purchases;

  const handleGenerate = async () => {
    if (!metricsReady) { alert("Completa al menos: gasto, conversión, clics y compras."); return; }
    if (reportType && !allSectionsComplete) {
      alert("Completa todas las secciones del análisis antes de generar el reporte.");
      return;
    }
    setGenerating(true);
    // Construye el contexto a partir de las secciones del análisis (si hay tipo)
    const contextFromSections = reportType && sections
      ? Object.entries(sections).filter(([,v]) => v && v.trim()).map(([k,v]) => {
          const sec = REPORT_TYPES[reportType]?.sections.find(s => s.key === k);
          return `${sec?.title || k}: ${v}`;
        }).join("\n\n")
      : "";
    const reportData = {
      companyName: company.name,
      period: dateRange.label || `${dateRange.from} – ${dateRange.to}`,
      spend: num(metrics.spend), conversion: num(metrics.conversion),
      clicks: num(metrics.clicks), impressions: num(metrics.impressions),
      reach: num(metrics.reach), pageVisits: num(metrics.pageVisits),
      initiatedCheckouts: num(metrics.initiatedCheckouts), purchases: num(metrics.purchases),
      context: contextFromSections, adObservations, products,
    };
    setGenerating(false);
    // NOTA: Ya no generamos recomendaciones con IA en cada reporte (ahorro de tokens).
    // Los accionables vendrán de la data real que uno pone en el análisis y observaciones.
    onSave({ ...reportData, dateFrom: dateRange.from, dateTo: dateRange.to, id: Date.now(), createdAt: new Date().toISOString(), type: reportType || undefined, sections: reportType ? sections : undefined, campaigns: campaigns.length > 0 ? campaigns : undefined, adsets: adsets.length > 0 ? adsets : undefined, ads: ads.length > 0 ? ads : undefined, csvPurchases: csvTotals.purchases || undefined, csvConversion: csvTotals.conversion || undefined, notasCopy: notasCopy.trim() || undefined });
  };

  const sLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, marginBottom: 12 };

  return (
    <div style={{ fontFamily: DS.font, background: DS.bg, minHeight: "100vh", color: DS.textPrimary, position: "relative" }}>
      {!isDark && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.8 }} />}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 80px", position: "relative", zIndex: 1 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: DS.border }}>
        <button onClick={onCancel} style={{ ...darkBtnGhost, padding: "6px 12px", fontSize: 12 }}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: DS.textPrimary }}>Nuevo reporte — {mask.name(company.name, company.id)}</div>
          <div style={{ fontSize: 11, color: DS.textMuted }}>Completa los tres pasos para generar el reporte</div>
        </div>
        {reportType && REPORT_TYPES[reportType] && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 50, background: REPORT_TYPES[reportType].color + "18", border: `1px solid ${REPORT_TYPES[reportType].color}44` }}>
            <span style={{ fontSize: 16 }}>{REPORT_TYPES[reportType].emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: REPORT_TYPES[reportType].color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{REPORT_TYPES[reportType].label}</span>
          </div>
        )}
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["Período y datos", "Contexto y anuncios", "Generar"].map((s, i) => (
          <div key={i} onClick={() => { if (i < step - 1 || (i === 1 && metricsReady)) setStep(i + 1); }}
            style={{ flex: 1, padding: "9px 10px", borderRadius: DS.radiusSm, textAlign: "center", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em", border: step === i + 1 ? DS.borderHover : DS.border,
              background: step === i + 1 ? DS.red : step > i + 1 ? "#EAF3DE" : DS.bgCard,
              color: step === i + 1 ? "#fff" : step > i + 1 ? "#3B6D11" : "#999" }}>
            {step > i + 1 ? "✓ " : `${i + 1}. `}{s}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <>
          <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 12, border: DS.border }}>
            <div style={sLabel}>Período de la campaña</div>
            <DateRangePicker value={dateRange} onChange={setDateRange} mode={reportType} />
          </div>

          {/* CSV de Meta Ads — 3 niveles (campañas / conjuntos / anuncios) · auto-detect */}
          {!imagesExtracted && (
            <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 12, border: DS.border }}>
              <div style={{ ...sLabel, display: "flex", alignItems: "center", gap: 8 }}>
                Importar datos desde Meta Ads
                <span style={{ padding: "2px 8px", background: "rgba(29,185,122,0.15)", color: DS.green, borderRadius: 20, fontSize: 9, letterSpacing: "0.04em", border: "1px solid rgba(29,185,122,0.3)" }}>RECOMENDADO</span>
              </div>

              {/* 3 status indicators — uno por nivel */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                {[
                  { key: "campaign", label: "Campañas", emoji: "⚡", color: "#378ADD", items: campaigns, reset: resetCsv },
                  { key: "adset",    label: "Conjuntos", emoji: "📂", color: "#F5A623", items: adsets, reset: resetAdsets },
                  { key: "ad",       label: "Anuncios",  emoji: "🎯", color: "#8B5CF6", items: ads, reset: resetAds },
                ].map(s => {
                  const loaded = s.items.length > 0;
                  return (
                    <div key={s.key} style={{ padding: "10px 12px", background: loaded ? `${s.color}12` : DS.bgCard, border: `1px solid ${loaded ? s.color + "44" : DS.textHint}`, borderRadius: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{s.emoji}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: loaded ? s.color : DS.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
                      </div>
                      {loaded ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ fontSize: 12, color: DS.textPrimary, fontWeight: 700 }}>✓ {s.items.length}</span>
                          <button onClick={s.reset} style={{ background: "transparent", border: DS.border, borderRadius: 50, color: DS.textMuted, cursor: "pointer", fontSize: 9, padding: "2px 8px" }}>Quitar</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: DS.textMuted }}>⏳ Pendiente</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <CsvImporter key={`csv-${uploaderKey}`} onData={handleCsvData} dateRange={dateRange} onUpdateDateRange={setDateRange} />

              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(55,138,221,0.05)", borderRadius: 6, fontSize: 10, color: DS.textMuted, lineHeight: 1.5 }}>
                💡 Subí los 3 CSVs uno por uno — el sistema detecta automáticamente si es nivel Campaña, Conjunto o Anuncio.
                <br />
                Solo las <strong>Campañas</strong> rellenan las métricas primarias. Conjuntos y Anuncios se guardan para análisis granular y matching con las observaciones de anuncios en el Step 2.
              </div>
            </div>
          )}

          {/* Imágenes — se oculta si ya se usó CSV */}
          {campaigns.length === 0 && (
            <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 12, border: DS.border }}>
              <div style={{ ...sLabel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>{imagesExtracted ? "Datos extraídos de capturas de Meta Ads" : "O sube capturas de Meta Ads (fallback, si no tienes CSV)"}</span>
                {imagesExtracted && (
                  <button onClick={resetImages} style={{ background: "transparent", border: DS.border, borderRadius: 50, color: DS.textMuted, cursor: "pointer", fontSize: 10, padding: "3px 10px", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                    ✕ Quitar y cambiar fuente
                  </button>
                )}
              </div>
              <ImageUploader key={`img-${uploaderKey}`} onExtracted={handleImageExtracted} />
            </div>
          )}

          <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 16, border: DS.border }}>
            {/* PRIMARIAS */}
            <div style={sLabel}>Métricas primarias {metricsReady && <span style={{ color: DS.green, textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>✓ listas</span>}</div>

            {/* Banner sutil: compras y conversión vienen de Shopify */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(55,138,221,0.06)", border: "1px solid rgba(55,138,221,0.2)", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#7FB8E8" }}>
              <span>💡</span>
              <span>Compras y valor de conversión: datos de Shopify</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {inp("Compras", "purchases", "desde Shopify")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Costo por compra <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.purchases ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.purchases ? `$${fmt(num(metrics.spend) / num(metrics.purchases))} COP` : "Requiere compras + gasto"}
                </div>
              </div>
              {inp("Valor de conversión (COP)", "conversion", "desde Shopify")}
              {inp("Gasto total (COP)", "spend", "ej. 3.000.000")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>ROAS <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.conversion ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.conversion ? `${(num(metrics.conversion) / num(metrics.spend)).toFixed(2)}×` : "Requiere conversión + gasto"}
                </div>
              </div>
            </div>

            {/* RECONCILIACIÓN AUTOMÁTICA: CSV Meta vs Shopify */}
            {(csvTotals.purchases > 0 || csvTotals.conversion > 0) && (() => {
              const shopifyP = num(metrics.purchases);
              const shopifyC = num(metrics.conversion);
              const hasShopifyInput = shopifyP > 0 || shopifyC > 0;
              if (!hasShopifyInput) {
                // Muestra solo info del CSV mientras no ingresen Shopify aún
                return (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(55,138,221,0.06)", border: "1px solid rgba(55,138,221,0.2)", borderRadius: 8, fontSize: 11, color: DS.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📊</span>
                    <span>
                      <strong style={{ color: "#7FB8E8" }}>Meta detectó</strong>: {csvTotals.purchases} compras · {fmtM(csvTotals.conversion)} · Ingresa los datos de Shopify arriba para ver la reconciliación.
                    </span>
                  </div>
                );
              }
              // Diferencias
              const diffP = shopifyP - csvTotals.purchases;
              const diffC = shopifyC - csvTotals.conversion;
              const match = Math.abs(diffP) < 0.5 && Math.abs(diffC) < 1;
              if (match) {
                return (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(29,185,122,0.08)", border: "1px solid rgba(29,185,122,0.25)", borderRadius: 8, fontSize: 11, color: DS.green, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>✓</span>
                    <span>Meta y Shopify coinciden ({csvTotals.purchases} compras · {fmtM(csvTotals.conversion)})</span>
                  </div>
                );
              }
              // Hay diferencia: mostrar reconciliación
              const positive = diffP > 0 || diffC > 0;
              const col = positive ? DS.green : DS.amber;
              const label = positive ? "No rastreadas por Meta" : "Superpuestas / doble conteo";
              const arrow = positive ? "+" : "−";
              return (
                <div style={{ marginTop: 12, padding: "12px 14px", background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: col }}>
                    <span>⚖</span> Reconciliación Meta ↔ Shopify
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1.1fr", gap: 6, fontSize: 11 }}>
                    <div style={{ color: DS.textMuted }}></div>
                    <div style={{ color: DS.textMuted, textAlign: "right" }}>Compras</div>
                    <div style={{ color: DS.textMuted, textAlign: "right" }}>Valor conversión</div>

                    <div style={{ color: DS.textSecondary }}>📊 Meta (CSV)</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{csvTotals.purchases}</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{fmtM(csvTotals.conversion)}</div>

                    <div style={{ color: DS.textSecondary }}>🛒 Shopify</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{shopifyP || "—"}</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{shopifyC ? fmtM(shopifyC) : "—"}</div>

                    <div style={{ color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow} {label}</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow}{Math.abs(diffP)}</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow}{fmtM(Math.abs(diffC))}</div>

                    <div style={{ color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>TOTAL REAL</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>{shopifyP}</div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>{fmtM(shopifyC)}</div>
                  </div>
                  {metrics.spend && shopifyC > 0 && (
                    <div style={{ marginTop: 10, padding: "7px 10px", background: DS.bgCard, borderRadius: 6, fontSize: 11, color: DS.textSecondary, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>ROAS real (Shopify ÷ gasto)</span>
                      <span style={{ fontWeight: 800, color: DS.textPrimary, fontFamily: "monospace" }}>{(shopifyC / num(metrics.spend)).toFixed(2)}×</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SECUNDARIAS TRÁFICO */}
            <div style={{ borderTop: DS.border, margin: "10px 0 14px" }} />
            <div style={sLabel}>Secundarias — tráfico</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {inp("Alcance", "reach", "ej. 45.000")}
              {inp("Impresiones", "impressions", "ej. 200.000")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Frecuencia <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.impressions && metrics.reach ? DS.textPrimary : DS.textMuted }}>
                  {metrics.impressions && metrics.reach ? `${(num(metrics.impressions) / num(metrics.reach)).toFixed(2)}×` : "Requiere alcance + impresiones"}
                </div>
              </div>
              {inp("Clics en el enlace", "clicks", "ej. 3.000")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Costo por clic <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.clicks ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.clicks ? `$${fmt(num(metrics.spend) / num(metrics.clicks))} COP` : "Requiere gasto + clics"}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>CTR <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.clicks && metrics.impressions ? DS.textPrimary : DS.textMuted }}>
                  {metrics.clicks && metrics.impressions ? `${((num(metrics.clicks) / num(metrics.impressions)) * 100).toFixed(2)}%` : "Requiere clics + impresiones"}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>CPM <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.impressions ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.impressions ? `$${fmt((num(metrics.spend) / num(metrics.impressions)) * 1000)} COP` : "Requiere gasto + impresiones"}
                </div>
              </div>
            </div>

            {/* SECUNDARIAS CONVERSIÓN */}
            <div style={{ borderTop: DS.border, margin: "10px 0 14px" }} />
            <div style={sLabel}>Secundarias — conversión de página</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {inp("Visitas a la página de destino", "pageVisits", "ej. 2.500")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Costo por visita <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.pageVisits ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.pageVisits ? `$${fmt(num(metrics.spend) / num(metrics.pageVisits))} COP` : "Requiere gasto + visitas"}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>% Carga de página <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.clicks && metrics.pageVisits ? DS.textPrimary : DS.textMuted }}>
                  {metrics.clicks && metrics.pageVisits ? `${((num(metrics.pageVisits) / num(metrics.clicks)) * 100).toFixed(1)}%` : "Requiere clics + visitas"}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>% Ida a checkout <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.pageVisits && metrics.initiatedCheckouts ? DS.textPrimary : DS.textMuted }}>
                  {metrics.pageVisits && metrics.initiatedCheckouts ? `${((num(metrics.initiatedCheckouts) / num(metrics.pageVisits)) * 100).toFixed(2)}%` : "Requiere visitas + pagos iniciados"}
                </div>
              </div>
              {inp("Pagos iniciados", "initiatedCheckouts", "ej. 350")}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Costo por pago iniciado <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.spend && metrics.initiatedCheckouts ? DS.textPrimary : DS.textMuted }}>
                  {metrics.spend && metrics.initiatedCheckouts ? `$${fmt(num(metrics.spend) / num(metrics.initiatedCheckouts))} COP` : "Requiere gasto + pagos iniciados"}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>Conversión del checkout <span style={{ color: DS.textMuted }}>· automático</span></label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: DS.border, fontSize: 13, background: DS.bgCard, color: metrics.initiatedCheckouts && metrics.purchases ? DS.textPrimary : DS.textMuted }}>
                  {metrics.initiatedCheckouts && metrics.purchases ? `${((num(metrics.purchases) / num(metrics.initiatedCheckouts)) * 100).toFixed(2)}%` : "Requiere pagos iniciados + compras"}
                </div>
              </div>
            </div>
          </div>

          {/* PRODUCTOS */}
          <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", marginBottom: 16, border: DS.border }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: products.length ? 12 : 0 }}>
              <div>
                <div style={sLabel}>Métricas por producto <span style={{ color: DS.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></div>
                <div style={{ fontSize: 11, color: DS.textMuted, marginTop: -8, marginBottom: 8 }}>Agrega métricas específicas por producto para subreportes individuales</div>
              </div>
              <button onClick={() => setShowAddProduct(s => !s)}
                style={{ padding: "6px 14px", borderRadius: 50, border: DS.border, background: "#fff", color: "#06060A", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {showAddProduct ? "✕ Cancelar" : "+ Agregar producto"}
              </button>
            </div>

            {/* Lista de productos ya agregados */}
            {products.map((p, i) => (
              <div key={i} style={{ background: DS.bgCard, borderRadius: DS.radiusSm, padding: "10px 14px", marginBottom: 8, border: DS.border, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "#E6F1FB", color: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: DS.textMuted }}>
                    {p.metrics.purchases ? `${p.metrics.purchases} compras` : ""}{p.metrics.spend ? ` · $${fmt(num(p.metrics.spend))} gasto` : ""}{p.metrics.conversion ? ` · $${fmt(num(p.metrics.conversion))} conversión` : ""}
                  </div>
                </div>
                <button onClick={() => setProducts(ps => ps.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "#E24B4A", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ))}

            {/* Formulario para agregar producto */}
            {showAddProduct && (
              <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "18px 20px", border: DS.border, marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, marginBottom: 12 }}>Nuevo producto</div>
                <input value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="ej. Producto principal, SKU 001, Línea premium..."
                  style={{ ...darkInput, marginBottom: 10 }} />

                {/* Mini uploader para producto */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 6 }}>Sube capturas de este producto (opcional — extrae métricas automáticamente)</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input ref={newProductImgRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                      onChange={e => {
                        const files = Array.from(e.target.files);
                        Promise.all(files.map(f => new Promise(res => {
                          const r = new FileReader();
                          r.onload = ev => res({ name: f.name, type: f.type, data: ev.target.result.split(",")[1], preview: ev.target.result });
                          r.readAsDataURL(f);
                        }))).then(imgs => setNewProductImages(prev => [...prev, ...imgs]));
                      }} />
                    <button onClick={() => newProductImgRef.current.click()}
                      style={{ ...darkBtnGhost, padding: "6px 14px", fontSize: 12 }}>
                      📎 Subir imágenes {newProductImages.length > 0 ? `(${newProductImages.length})` : ""}
                    </button>
                    {newProductImages.length > 0 && (
                      <button onClick={async () => {
                        if (!newProductImages.length) return;
                        setExtractingProduct(true);
                        const extracted = await extractMetricsFromImages(newProductImages);
                        setExtractingProduct(false);
                        if (extracted) setNewProductMetrics({
                          spend: extracted.spend || "", conversion: extracted.conversion || "",
                          purchases: extracted.purchases || "", clicks: extracted.clicks || "",
                          pageVisits: extracted.pageVisits || "", initiatedCheckouts: extracted.initiatedCheckouts || ""
                        });
                      }} disabled={extractingProduct}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: extractingProduct ? DS.bgCard : DS.green, color: "white", cursor: extractingProduct ? "default" : "pointer", fontSize: 12, fontWeight: 600 }}>
                        {extractingProduct ? "Extrayendo…" : "Extraer métricas →"}
                      </button>
                    )}
                    {newProductImages.length > 0 && <button onClick={() => setNewProductImages([])} style={{ background: "none", border: "none", color: "#E24B4A", cursor: "pointer", fontSize: 13 }}>✕</button>}
                  </div>
                </div>

                {/* Métricas del producto — primarias */}
                <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Primarias</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                  {[["Compras", "purchases","ej. 40"], ["Costo por compra","costPerPurchase","automático"], ["Valor de conversión (COP)", "conversion","ej. 4.000.000"], ["Gasto total (COP)", "spend","ej. 1.200.000"], ["ROAS","roas","automático"]].map(([label, key, ph]) => {
                    const isAuto = ph === "automático";
                    const autoVal = key === "costPerPurchase"
                      ? (newProductMetrics.spend && newProductMetrics.purchases ? `$${fmt(num(newProductMetrics.spend) / num(newProductMetrics.purchases))} COP` : "")
                      : key === "roas"
                      ? (newProductMetrics.spend && newProductMetrics.conversion ? `${(num(newProductMetrics.conversion) / num(newProductMetrics.spend)).toFixed(2)}×` : "")
                      : "";
                    return (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2 }}>{label}{isAuto && <span style={{ color: DS.textMuted }}> · automático</span>}</label>
                        {isAuto
                          ? <div style={{ padding: "6px 8px", borderRadius: 6, border: DS.border, fontSize: 12, background: DS.bgCard, color: autoVal ? DS.textSecondary : DS.textMuted }}>{autoVal || "Requiere datos"}</div>
                          : <input value={newProductMetrics[key] || ""} onChange={e => setNewProductMetrics(m => ({ ...m, [key]: e.target.value }))} placeholder={ph}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 12, boxSizing: "border-box", background: DS.bgCard, color: DS.textPrimary }} />
                        }
                      </div>
                    );
                  })}
                </div>
                {/* Secundarias tráfico */}
                <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, marginTop: 6 }}>Tráfico</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                  {[["Alcance","reach","ej. 45.000"],["Impresiones","impressions","ej. 200.000"],["Frecuencia","frecuencia","automático"],["Clics en el enlace","clicks","ej. 3.000"],["Costo por clic","cpc","automático"],["CTR (%)","ctr","automático"],["CPM","cpm","automático"]].map(([label, key, ph]) => {
                    const isAuto = ph === "automático";
                    const autoVal = key === "frecuencia"
                      ? (newProductMetrics.impressions && newProductMetrics.reach ? `${(num(newProductMetrics.impressions)/num(newProductMetrics.reach)).toFixed(2)}×` : "")
                      : key === "cpc"
                      ? (newProductMetrics.spend && newProductMetrics.clicks ? `$${fmt(num(newProductMetrics.spend)/num(newProductMetrics.clicks))} COP` : "")
                      : key === "ctr"
                      ? (newProductMetrics.clicks && newProductMetrics.impressions ? `${((num(newProductMetrics.clicks)/num(newProductMetrics.impressions))*100).toFixed(2)}%` : "")
                      : key === "cpm"
                      ? (newProductMetrics.spend && newProductMetrics.impressions ? `$${fmt((num(newProductMetrics.spend)/num(newProductMetrics.impressions))*1000)} COP` : "")
                      : "";
                    return (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2 }}>{label}{isAuto && <span style={{ color: DS.textMuted }}> · automático</span>}</label>
                        {isAuto
                          ? <div style={{ padding: "6px 8px", borderRadius: 6, border: DS.border, fontSize: 12, background: DS.bgCard, color: autoVal ? DS.textSecondary : DS.textMuted }}>{autoVal || "Requiere datos"}</div>
                          : <input value={newProductMetrics[key] || ""} onChange={e => setNewProductMetrics(m => ({ ...m, [key]: e.target.value }))} placeholder={ph}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 12, boxSizing: "border-box", background: DS.bgCard, color: DS.textPrimary }} />
                        }
                      </div>
                    );
                  })}
                </div>
                {/* Secundarias conversión */}
                <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, marginTop: 6 }}>Conversión de página</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                  {[["Visitas a la página","pageVisits","ej. 2.500"],["Costo por visita","costPerVisit","automático"],["% Carga de página","pageLoad","automático"],["% Ida a checkout","checkoutRate","automático"],["Pagos iniciados","initiatedCheckouts","ej. 350"],["Costo por pago iniciado","costPerInitiated","automático"],["Conversión del checkout","convRate","automático"]].map(([label, key, ph]) => {
                    const isAuto = ph === "automático";
                    const autoVal = key === "costPerVisit"
                      ? (newProductMetrics.spend && newProductMetrics.pageVisits ? `$${fmt(num(newProductMetrics.spend)/num(newProductMetrics.pageVisits))} COP` : "")
                      : key === "pageLoad"
                      ? (newProductMetrics.clicks && newProductMetrics.pageVisits ? `${((num(newProductMetrics.pageVisits)/num(newProductMetrics.clicks))*100).toFixed(1)}%` : "")
                      : key === "checkoutRate"
                      ? (newProductMetrics.pageVisits && newProductMetrics.initiatedCheckouts ? `${((num(newProductMetrics.initiatedCheckouts)/num(newProductMetrics.pageVisits))*100).toFixed(2)}%` : "")
                      : key === "costPerInitiated"
                      ? (newProductMetrics.spend && newProductMetrics.initiatedCheckouts ? `$${fmt(num(newProductMetrics.spend)/num(newProductMetrics.initiatedCheckouts))} COP` : "")
                      : key === "convRate"
                      ? (newProductMetrics.initiatedCheckouts && newProductMetrics.purchases ? `${((num(newProductMetrics.purchases)/num(newProductMetrics.initiatedCheckouts))*100).toFixed(2)}%` : "")
                      : "";
                    return (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2 }}>{label}{isAuto && <span style={{ color: DS.textMuted }}> · automático</span>}</label>
                        {isAuto
                          ? <div style={{ padding: "6px 8px", borderRadius: 6, border: DS.border, fontSize: 12, background: DS.bgCard, color: autoVal ? DS.textSecondary : DS.textMuted }}>{autoVal || "Requiere datos"}</div>
                          : <input value={newProductMetrics[key] || ""} onChange={e => setNewProductMetrics(m => ({ ...m, [key]: e.target.value }))} placeholder={ph}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 12, boxSizing: "border-box", background: DS.bgCard, color: DS.textPrimary }} />
                        }
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => {
                  if (!newProductName.trim()) { alert("Escribe el nombre del producto"); return; }
                  setProducts(ps => [...ps, { name: newProductName, metrics: { ...newProductMetrics }, images: newProductImages }]);
                  setNewProductName(""); setNewProductMetrics({ spend: "", conversion: "", purchases: "", clicks: "", impressions: "", reach: "", pageVisits: "", initiatedCheckouts: "" }); setNewProductImages([]); setShowAddProduct(false);
                }} style={{ width: "100%", padding: "9px", border: "none", background: "#fff", color: "#06060A", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8, borderRadius: 50 }}>
                  + Agregar producto
                </button>
              </div>
            )}
          </div>

          <button onClick={() => metricsReady ? setStep(2) : alert("Completa al menos: gasto, conversión, clics y compras.")}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: metricsReady ? darkBtn.background : DS.bgCard, color: metricsReady ? darkBtn.color : DS.textMuted, fontSize: 13, fontWeight: 700, cursor: metricsReady ? "pointer" : "default", letterSpacing: "0.01em" }}>
            Siguiente: contexto y anuncios →
          </button>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Step2Ads
          reportType={reportType}
          sections={sections}
          setSections={setSections}
          analysisRawText={analysisRawText}
          setAnalysisRawText={setAnalysisRawText}
          analysisProcessed={analysisProcessed}
          analysisProcessing={analysisProcessing}
          analysisMissing={analysisMissing}
          analysisError={analysisError}
          onProcessAnalysis={handleProcessAnalysis}
          onResetAnalysis={resetAnalysis}
          onSkipAnalysis={skipAnalysisHandler}
          allSectionsComplete={allSectionsComplete}
          adObservations={adObservations} setAdObservations={setAdObservations}
          notasCopy={notasCopy} setNotasCopy={setNotasCopy}
          ads={ads}
          objectives={company.objectives || defaultObjectives}
          onBack={() => setStep(1)} onNext={() => setStep(3)}
        />
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "20px", marginBottom: 16 }}>
            <div style={sLabel}>Resumen de lo que se generará</div>
            <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.7 }}>
              <div>📅 <strong>Período:</strong> {dateRange.label || `${dateRange.from} – ${dateRange.to}`}</div>
              <div>💰 <strong>Gasto:</strong> {fmtM(num(metrics.spend))} · <strong>Conversión:</strong> {fmtM(num(metrics.conversion))}</div>
              <div>📊 <strong>ROAS:</strong> {(num(metrics.conversion) / num(metrics.spend)).toFixed(2)}× (objetivo: {(company.objectives || defaultObjectives).roasTarget}×)</div>
              <div>🛒 <strong>Compras:</strong> {metrics.purchases} · <strong>Pagos iniciados:</strong> {metrics.initiatedCheckouts}</div>
              {reportType && sections && Object.values(sections).some(v => v && v.trim()) && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: DS.bgCard, borderRadius: 8, borderLeft: `2px solid ${REPORT_TYPES[reportType]?.color || DS.red}`, fontSize: 12, color: DS.textSecondary }}>
                  <strong>Análisis:</strong> {Object.values(sections).filter(v => v && v.trim()).length} secciones completas
                </div>
              )}
              {notasCopy && notasCopy.trim() && <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(244,63,94,0.06)", borderRadius: 8, borderLeft: "2px solid #F43F5E", fontSize: 12, color: DS.textSecondary }}><strong>📝 Notas copy:</strong> {notasCopy.substring(0, 120)}{notasCopy.length > 120 ? "…" : ""}</div>}
            </div>
          </div>

          <div style={{ background: "rgba(29,185,122,0.06)", borderRadius: DS.radius, padding: "16px 20px", marginBottom: 16, border: "1px solid rgba(29,185,122,0.2)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: DS.green, marginBottom: 4 }}>La IA generará automáticamente:</div>
            <div style={{ fontSize: 12, color: DS.green, lineHeight: 1.8 }}>
              ✓ Análisis del embudo completo (tráfico + conversión)<br />
              ✓ Detección automática del cuello de botella<br />
              ✓ Proyecciones multi-métrica interactivas<br />
              ✓ 5 recomendaciones prioritarias y accionables<br />
              ✓ Evaluación de todos los anuncios observados
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ ...darkBtnGhost, flex: 1, padding: "11px 0", fontSize: 13 }}>← Volver</button>
            <button onClick={handleGenerate} disabled={generating}
              style={{ flex: 2, padding: "14px", borderRadius: 10, border: "none", background: generating ? DS.bgCard : darkBtn.background, color: generating ? DS.textMuted : darkBtn.color, fontSize: 14, fontWeight: 700, cursor: generating ? "default" : "pointer" }}>
              {generating ? "Generando con IA… (30-60s)" : "Generar reporte completo →"}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

// ── REPORT VIEW ──────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS/ADSETS/ADS VIEWER — réplica de Meta Ads Manager dentro del reporte
// ═════════════════════════════════════════════════════════════════════════════
function CampaignsAdsViewer({ report, objectives, highlightCampaign, onSaveReport }) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile(768);
  const [level, setLevel] = useState("campaign");
  // Sort default inteligente: campaigns por spend, adsets/ads por purchases (muestra los que tienen ventas arriba)
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [onlyWithPurchases, setOnlyWithPurchases] = useState(false);
  const [funnelMode, setFunnelMode] = useState(false); // false=completo, true=embudo
  const [fullscreen, setFullscreen] = useState(false);
  // Edición inline de filas (solo admin — cuando onSaveReport está presente)
  const [editingRow, setEditingRow] = useState(null); // { level, originalName, form }
  const canEdit = typeof onSaveReport === "function";

  const openEditor = (row) => {
    setEditingRow({
      level,
      originalName: row.name,
      form: {
        name:               row.name || "",
        spend:              row.spend ?? "",
        purchases:          row.purchases ?? "",
        conversionValue:    row.conversionValue ?? "",
        impressions:        row.impressions ?? "",
        reach:              row.reach ?? "",
        linkClicks:         row.linkClicks ?? "",
        pageVisits:         row.pageVisits ?? "",
        initiatedCheckouts: row.initiatedCheckouts ?? "",
      },
    });
  };

  const saveEditor = () => {
    if (!editingRow || !canEdit) return;
    const f = editingRow.form;
    const num = (v) => {
      if (v === "" || v == null) return 0;
      if (typeof v === "number") return v;
      const raw = String(v).replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : n;
    };
    const arrayKey = editingRow.level === "campaign" ? "campaigns" : editingRow.level === "adset" ? "adsets" : "ads";
    const current = report[arrayKey] || [];
    const updatedArray = current.map(r => {
      if (r.name !== editingRow.originalName) return r;
      const spend = num(f.spend);
      const purchases = num(f.purchases);
      const conversionValue = num(f.conversionValue);
      const impressions = num(f.impressions);
      const reach = num(f.reach);
      const linkClicks = num(f.linkClicks);
      const pageVisits = num(f.pageVisits);
      const initiatedCheckouts = num(f.initiatedCheckouts);
      return {
        ...r,
        name: f.name || r.name,
        spend, purchases, conversionValue,
        impressions, reach, linkClicks, pageVisits, initiatedCheckouts,
        // Recalcular derivadas para que la tabla refleje los valores nuevos
        costPerPurchase: purchases > 0 ? spend / purchases : 0,
        purchaseRoas:    spend > 0 ? conversionValue / spend : 0,
        frequency:       reach > 0 ? impressions / reach : 0,
        cpm:             impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc:             linkClicks > 0 ? spend / linkClicks : 0,
        ctr:             impressions > 0 ? (linkClicks / impressions) * 100 : 0,
        costPerPageVisit: pageVisits > 0 ? spend / pageVisits : 0,
        costPerInitiatedCheckout: initiatedCheckouts > 0 ? spend / initiatedCheckouts : 0,
        checkoutConversionRate:   initiatedCheckouts > 0 ? purchases / initiatedCheckouts : 0,
      };
    });
    const updatedReport = { ...report, [arrayKey]: updatedArray };
    onSaveReport(updatedReport);
    setEditingRow(null);
  };

  // Funnel column groups
  const funnelBase = ["name", "delivery", "budget", "spend"];
  const funnelTrafico = ["impressions", "frequency", "cpm", "linkClicks", "cpc", "ctr"];
  const funnelConversion = ["pageVisits", "costPerPageVisit", "initiatedCheckouts", "costPerInitiatedCheckout", "checkoutConversionRate", "purchases", "costPerPurchase", "conversionValue", "purchaseRoas"];
  const funnelAll = [...funnelBase, ...funnelTrafico, ...funnelConversion];

  // Al cambiar de nivel, ajustar el sort por default
  const switchLevel = (newLevel) => {
    setLevel(newLevel);
    if (newLevel === "campaign") {
      setSortKey("spend");
    } else {
      setSortKey("purchases");
    }
    setSortDir("desc");
  };

  const rawData =
    level === "campaign" ? (report.campaigns || []) :
    level === "adset"    ? (report.adsets    || []) :
                           (report.ads       || []);

  // Breakdown por objetivo (para mostrar info bar arriba de la tabla)
  const objCounts = rawData.reduce((acc, r) => {
    const o = r.objective || "other";
    acc[o] = (acc[o] || 0) + 1;
    return acc;
  }, {});
  const withPurchasesCount = rawData.filter(r => (r.purchases || 0) > 0).length;

  // Aplicar filtro
  const filteredData = onlyWithPurchases
    ? rawData.filter(r => (r.purchases || 0) > 0)
    : rawData;

  const sorted = [...filteredData].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    // Tratar null como 0 para sorting (más consistente)
    const naa = va == null ? 0 : va;
    const nbb = vb == null ? 0 : vb;
    if (typeof va === "string" || typeof vb === "string") {
      return sortDir === "asc" ? String(va || "").localeCompare(String(vb || "")) : String(vb || "").localeCompare(String(va || ""));
    }
    return sortDir === "asc" ? (naa - nbb) : (nbb - naa);
  });

  // Totals row — sums for additive metrics, weighted averages for rates
  const totals = useMemo(() => {
    if (sorted.length === 0) return null;
    const sum = (key) => sorted.reduce((s, r) => s + (r[key] || 0), 0);
    const totalSpend = sum("spend");
    const totalPurchases = sum("purchases");
    const totalConversion = sum("conversionValue");
    const totalImpressions = sum("impressions");
    const totalReach = sum("reach");
    const totalLinkClicks = sum("linkClicks");
    const totalPageVisits = sum("pageVisits");
    const totalInitiatedCheckouts = sum("initiatedCheckouts");
    return {
      name: "TOTAL",
      delivery: "",
      budget: sum("budget"),
      spend: totalSpend,
      purchases: totalPurchases,
      conversionValue: totalConversion,
      costPerPurchase: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      purchaseRoas: totalSpend > 0 ? totalConversion / totalSpend : 0,
      impressions: totalImpressions,
      reach: totalReach,
      frequency: totalReach > 0 ? totalImpressions / totalReach : 0,
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      linkClicks: totalLinkClicks,
      cpc: totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0,
      ctr: totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0,
      pageVisits: totalPageVisits,
      costPerPageVisit: totalPageVisits > 0 ? totalSpend / totalPageVisits : 0,
      initiatedCheckouts: totalInitiatedCheckouts,
      costPerInitiatedCheckout: totalInitiatedCheckouts > 0 ? totalSpend / totalInitiatedCheckouts : 0,
      checkoutConversionRate: totalInitiatedCheckouts > 0 ? totalPurchases / totalInitiatedCheckouts : 0,
    };
  }, [sorted]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Definición de columnas (aplica a los 3 niveles)
  const columns = [
    { key: "name",                    label: "Nombre",          align: "left",  sticky: true,  width: 280 },
    { key: "delivery",                label: "Estado",          align: "left",  badge: true,   width: 90  },
    { key: "budget",                  label: "Presup.",         align: "right", money: true,   width: 100, subKey: "budgetType" },
    { key: "spend",                   label: "Gasto",           align: "right", money: true,   width: 110 },
    { key: "purchases",               label: "Compras",         align: "right", number: true,  width: 85,  primary: true },
    { key: "conversionValue",         label: "Conversión",      align: "right", money: true,   width: 115 },
    { key: "costPerPurchase",         label: "Costo/compra",    align: "right", money: true,   width: 120, primary: true },
    { key: "purchaseRoas",            label: "ROAS",            align: "right", decimal: 2, suffix: "×", width: 85, primary: true },
    { key: "impressions",             label: "Impresiones",     align: "right", number: true,  width: 110 },
    { key: "reach",                   label: "Alcance",         align: "right", number: true,  width: 100 },
    { key: "frequency",               label: "Frecuencia",      align: "right", decimal: 2,    width: 100 },
    { key: "cpm",                     label: "CPM",             align: "right", money: true,   width: 95,  soft: true },
    { key: "linkClicks",              label: "Clics enlace",    align: "right", number: true,  width: 105 },
    { key: "cpc",                     label: "CPC enlace",      align: "right", money: true,   width: 105, soft: true },
    { key: "ctr",                     label: "CTR",             align: "right", percent: true, width: 85,  soft: true },
    { key: "pageVisits",              label: "Visitas página",  align: "right", number: true,  width: 115 },
    { key: "costPerPageVisit",        label: "Costo/visita",    align: "right", money: true,   width: 110 },
    { key: "initiatedCheckouts",      label: "Pagos iniciados", align: "right", number: true,  width: 120 },
    { key: "costPerInitiatedCheckout",label: "Costo/pago",      align: "right", money: true,   width: 105, soft: true },
    { key: "checkoutConversionRate",  label: "Conv. checkout",  align: "right", rate: true,    width: 115, soft: true },
  ];

  // Resizable column widths
  const [columnWidths, setColumnWidths] = useState(() => {
    const w = {};
    columns.forEach(c => { w[c.key] = c.width || 100; });
    return w;
  });

  const dragRef = useRef(null);

  const startResize = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const startWidth = columnWidths[colKey];
    dragRef.current = { colKey, startX, startWidth };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      ev.preventDefault(); // prevent scroll during drag
      const clientX = ev.type === "touchmove" ? ev.touches[0].clientX : ev.clientX;
      const delta = clientX - dragRef.current.startX;
      const newWidth = Math.max(60, Math.min(500, dragRef.current.startWidth + delta));
      setColumnWidths(prev => ({ ...prev, [dragRef.current.colKey]: newWidth }));
    };

    const onEnd = () => {
      dragRef.current = null;
      document.body.style.overflow = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };

    document.body.style.overflow = "hidden"; // prevent scroll while dragging

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  };

  // Coloring basado en objetivos del cliente
  const getPrimaryColor = (col, value, row) => {
    if (col.key === "purchaseRoas") {
      const roas = value || (row.conversionValue && row.spend ? row.conversionValue / row.spend : 0);
      if (!roas) return null;
      if (roas >= (objectives.roasTarget || 6)) return DS.green;
      if (roas >= (objectives.roasMin || 4)) return DS.amber;
      return DS.red;
    }
    if (col.key === "costPerPurchase") {
      const cpp = value || (row.purchases && row.spend ? row.spend / row.purchases : 0);
      if (!cpp) return null;
      if (cpp <= (objectives.costPerPurchaseTarget || 50000)) return DS.green;
      if (cpp <= (objectives.costPerPurchaseMax || 80000)) return DS.amber;
      return DS.red;
    }
    if (col.key === "purchases") {
      return value > 0 ? DS.green : DS.textMuted;
    }
    return null;
  };

  const getSoftColor = (col, value) => {
    if (value == null || value === 0) return null;
    if (col.key === "ctr") {
      const target = objectives.ctrTarget || 2;
      if (value >= target) return "rgba(29,185,122,0.65)";
      if (value >= target * 0.6) return "rgba(245,166,35,0.65)";
      return "rgba(226,75,74,0.65)";
    }
    if (col.key === "cpc") {
      const target = objectives.cpcTarget || 600;
      if (value <= target) return "rgba(29,185,122,0.65)";
      if (value <= target * 1.5) return "rgba(245,166,35,0.65)";
      return "rgba(226,75,74,0.65)";
    }
    if (col.key === "cpm") {
      const target = objectives.cpm || 12000;
      if (value <= target) return "rgba(29,185,122,0.65)";
      if (value <= target * 1.5) return "rgba(245,166,35,0.65)";
      return "rgba(226,75,74,0.65)";
    }
    if (col.key === "costPerInitiatedCheckout") {
      const target = objectives.costPerInitiatedTarget || 10000;
      if (value <= target) return "rgba(29,185,122,0.65)";
      if (value <= target * 1.5) return "rgba(245,166,35,0.65)";
      return "rgba(226,75,74,0.65)";
    }
    if (col.key === "checkoutConversionRate") {
      const pct = value * 100;
      const target = objectives.checkoutConversionTarget || 20;
      if (pct >= target) return "rgba(29,185,122,0.65)";
      if (pct >= target * 0.6) return "rgba(245,166,35,0.65)";
      return "rgba(226,75,74,0.65)";
    }
    return null;
  };

  const formatCell = (col, row) => {
    const val = row[col.key];

    // Badges (delivery/estado)
    if (col.badge) {
      const isActive = /active|activ/i.test(String(val || ""));
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: isActive ? DS.green : DS.textMuted, fontWeight: 600 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? DS.green : DS.textMuted }} />
          {isActive ? "Activa" : (val || "—")}
        </span>
      );
    }

    // NULL handling — "raw" (money/number) muestra 0, "derived" (decimal/percent/rate) muestra "—"
    if (val == null || val === "") {
      if (col.money)  return <span style={{ color: DS.textMuted }}>$0</span>;
      if (col.number) return <span style={{ color: DS.textMuted }}>0</span>;
      // Derivadas (ROAS, frecuencia, CTR, tasas) → "—" porque no se pueden calcular
      return <span style={{ color: DS.textMuted }}>—</span>;
    }

    // MONEY
    if (col.money) {
      if (typeof val !== "number") return String(val);
      if (val === 0) return <span style={{ color: DS.textMuted }}>$0</span>;
      const formatted = `$${Math.round(val).toLocaleString("es-CO")}`;
      // Mostrar subKey si aplica (ej: budgetType)
      if (col.subKey && row[col.subKey]) {
        const subTxt = /diario/i.test(row[col.subKey]) ? "diario" : /de por vida|lifetime/i.test(row[col.subKey]) ? "de por vida" : "";
        return (
          <div>
            <div>{formatted}</div>
            {subTxt && <div style={{ fontSize: 9, color: DS.textHint, marginTop: 1 }}>{subTxt}</div>}
          </div>
        );
      }
      return formatted;
    }

    // NUMBER (enteros como compras, impresiones, clics)
    if (col.number) {
      if (typeof val !== "number") return val;
      if (val === 0) return <span style={{ color: DS.textMuted }}>0</span>;
      return val.toLocaleString("es-CO");
    }

    // DECIMAL (derivadas como ROAS, frecuencia) → "—" si 0
    if (col.decimal != null) {
      if (typeof val !== "number" || val === 0) return <span style={{ color: DS.textMuted }}>—</span>;
      return `${val.toFixed(col.decimal)}${col.suffix || ""}`;
    }

    // PERCENT (CTR, etc) → "—" si 0
    if (col.percent) {
      if (typeof val !== "number" || val === 0) return <span style={{ color: DS.textMuted }}>—</span>;
      return `${val.toFixed(2)}%`;
    }

    // RATE (0-1 decimal → porcentaje) → "—" si 0
    if (col.rate) {
      if (typeof val !== "number" || val === 0) return <span style={{ color: DS.textMuted }}>—</span>;
      return `${(val * 100).toFixed(1)}%`;
    }

    return String(val);
  };

  const tabs = [
    { key: "campaign", label: "Campañas",              count: (report.campaigns || []).length, emoji: "⚡", color: "#378ADD" },
    { key: "adset",    label: isMobile ? "Conjuntos" : "Conjuntos de anuncios", count: (report.adsets    || []).length, emoji: "📂", color: "#F5A623" },
    { key: "ad",       label: "Anuncios",              count: (report.ads       || []).length, emoji: "🎯", color: "#8B5CF6" },
  ];

  return (
    <div id="campaigns-table-container" style={{ marginTop: 24, paddingTop: 24, borderTop: DS.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(55,138,221,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7FB8E8" }}>Meta Ads Manager — Desglose completo</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 12, borderBottom: DS.border }}>
        {tabs.map(t => {
          const isActive = level === t.key;
          const hasData = t.count > 0;
          return (
            <button key={t.key} onClick={() => hasData && switchLevel(t.key)} disabled={!hasData}
              style={{
                padding: "11px 18px",
                border: "none",
                background: "transparent",
                color: isActive ? DS.textPrimary : hasData ? DS.textMuted : (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"),
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: hasData ? "pointer" : "not-allowed",
                borderBottom: isActive ? `2px solid ${t.color}` : "2px solid transparent",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: DS.font,
              }}>
              <span>{t.emoji}</span> {t.label}
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: isActive ? t.color + "33" : DS.bgCard, color: isActive ? t.color : DS.textMuted }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Breakdown bar + filter toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, padding: "8px 12px", background: DS.bgCard, borderRadius: 8, border: DS.border, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.textSecondary, flexWrap: "wrap" }}>
          <strong style={{ color: DS.textPrimary }}>{rawData.length}</strong>
          <span style={{ color: DS.textMuted }}>{level === "campaign" ? "campañas" : level === "adset" ? "conjuntos" : "anuncios"}</span>
          <span style={{ color: DS.textHint }}>·</span>
          <span><span style={{ color: DS.green }}>💰</span> {withPurchasesCount} con ventas</span>
          {Object.entries(objCounts).filter(([k]) => k !== "purchase").sort((a,b) => b[1] - a[1]).map(([k, n]) => {
            const emoji = { messaging: "💬", video: "🎥", engagement: "👥", lead: "🎯", traffic: "🔗", other: "❓" }[k] || "❓";
            const label = { messaging: "msgs", video: "video", engagement: "engage", lead: "leads", traffic: "tráfico", other: "otros" }[k] || k;
            return (
              <span key={k}><span style={{ color: DS.textHint }}>·</span> <span style={{ color: DS.textMuted }}>{emoji} {n} {label}</span></span>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setFunnelMode(v => !v)}
            style={{
              padding: "5px 12px", borderRadius: 50,
              border: `1px solid ${funnelMode ? "#378ADD" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              background: funnelMode ? "rgba(55,138,221,0.12)" : "transparent",
              color: funnelMode ? "#378ADD" : DS.textSecondary,
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap",
            }}>
            {funnelMode ? "✓ Modo embudo" : "Modo embudo"}
          </button>
          <button onClick={() => setOnlyWithPurchases(v => !v)}
            style={{
              padding: "5px 12px", borderRadius: 50,
              border: `1px solid ${onlyWithPurchases ? DS.green : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              background: onlyWithPurchases ? "rgba(29,185,122,0.12)" : "transparent",
              color: onlyWithPurchases ? DS.green : DS.textSecondary,
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap",
            }}>
            {onlyWithPurchases ? "✓ Solo con ventas" : "Solo con ventas"}
          </button>
        </div>
      </div>

      {/* Fullscreen toggle button (mobile only) */}
      {isMobile && (
        <button onClick={() => setFullscreen(f => !f)}
          style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
            padding: "7px 14px", borderRadius: 8,
            border: fullscreen ? `1px solid ${DS.red}` : DS.border,
            background: fullscreen ? "rgba(226,75,74,0.12)" : DS.bgCard,
            color: fullscreen ? DS.red : DS.textSecondary,
            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
          }}>
          {fullscreen ? "\u2715 Cerrar pantalla completa" : "\u2922 Ver en pantalla completa"}
        </button>
      )}

      {/* Tabla scrollable horizontal + vertical */}
      {(() => {
        const visibleCols = funnelMode
          ? funnelAll.map(key => columns.find(c => c.key === key)).filter(Boolean)
          : columns;
        const funnelCellBg = (colKey) => {
          if (!funnelMode) return null;
          if (funnelTrafico.includes(colKey)) return "rgba(55,138,221,0.04)";
          if (funnelConversion.includes(colKey)) return "rgba(29,185,122,0.06)";
          return null;
        };
        // In funnel mode, apply coloring to ALL conversion columns (not just primary/soft)
        const funnelColor = (col, val, row) => {
          if (!funnelMode) return null;
          if (funnelConversion.includes(col.key)) {
            const pc = getPrimaryColor(col, val, row);
            if (pc) return pc;
            const sc = getSoftColor(col, val);
            if (sc) return sc;
          }
          if (funnelTrafico.includes(col.key)) {
            const sc = getSoftColor(col, val);
            if (sc) return sc;
          }
          return null;
        };

        return (
        <div style={fullscreen ? {
          position: "fixed",
          top: 0, left: 0,
          width: "100vh", height: "100vw",
          transform: "rotate(90deg) translateY(-100%)",
          transformOrigin: "top left",
          zIndex: 9999,
          background: isDark ? "#06060A" : "#FFFFFF",
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "44px 8px 8px 8px",
          maxHeight: "none",
        } : { maxHeight: 500, overflowX: "auto", overflowY: "auto", background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.03)", borderRadius: 10, border: DS.border, WebkitOverflowScrolling: "touch" }}>
          {fullscreen && (
            <button onClick={() => setFullscreen(false)}
              style={{ position: "sticky", top: 0, left: 0, zIndex: 10001, background: DS.red, color: "#fff", border: "none", borderRadius: 50, width: 32, height: 32, fontSize: 14, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", marginBottom: 4 }}>
              ✕
            </button>
          )}
          <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: DS.font }}>
            <thead>
              {funnelMode && (
                <tr>
                  <th colSpan={funnelBase.length} style={{ padding: "6px 14px", background: isDark ? "rgba(20,20,30,0.98)" : "#FBFBFA", borderBottom: DS.border, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: DS.textMuted, textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}></th>
                  <th colSpan={funnelTrafico.length} style={{ padding: "6px 14px", background: "rgba(55,138,221,0.08)", borderBottom: "1px solid rgba(55,138,221,0.2)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "#378ADD", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>TRÁFICO</th>
                  <th colSpan={funnelConversion.length} style={{ padding: "6px 14px", background: "rgba(29,185,122,0.08)", borderBottom: "1px solid rgba(29,185,122,0.2)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: DS.green, textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>CONVERSIÓN</th>
                </tr>
              )}
              <tr>
                {visibleCols.map(col => (
                  <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: "11px 14px",
                        textAlign: col.align,
                        background: funnelCellBg(col.key) || (isDark ? "rgba(20,20,30,0.98)" : "#FBFBFA"),
                        color: sortKey === col.key ? DS.textPrimary : DS.textMuted,
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                        cursor: "pointer", whiteSpace: "nowrap", verticalAlign: "middle",
                        position: col.sticky ? "sticky" : "static",
                        top: 0,
                        left: col.sticky ? 0 : "auto",
                        zIndex: col.sticky ? 3 : 2,
                        borderBottom: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.08)",
                        userSelect: "none", width: columnWidths[col.key], minWidth: 60,
                      }}>
                    {col.label}
                    {sortKey === col.key && <span style={{ marginLeft: 4 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
                    <div
                      onMouseDown={(e) => startResize(col.key, e)}
                      onTouchStart={(e) => startResize(col.key, e)}
                      style={{
                        position: "absolute", right: 0, top: 0, bottom: 0, width: 8,
                        cursor: "col-resize", zIndex: 10,
                        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                      }}>
                      <div style={{ width: 3, height: "60%", borderRadius: 2, background: DS.textHint, transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#378ADD"}
                        onMouseLeave={e => { if (!dragRef.current) e.currentTarget.style.background = DS.textHint; }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isHL = highlightCampaign && row.name === highlightCampaign.name;
                const hlBg = isHL ? (highlightCampaign.variant === "escala" ? "rgba(29,185,122,0.25)" : "rgba(226,75,74,0.25)") : null;
                return (
                <tr key={i} style={{ borderBottom: DS.border, transition: "background 0.5s ease", background: hlBg || "transparent" }}
                    onMouseEnter={e => { if (!isHL) e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"; }}
                    onMouseLeave={e => { if (!isHL) e.currentTarget.style.background = "transparent"; }}>
                  {visibleCols.map(col => {
                    const rawVal = row[col.key];
                    const primaryColor = col.primary ? getPrimaryColor(col, rawVal, row) : null;
                    const softColor = col.soft ? getSoftColor(col, rawVal) : null;
                    const fc = funnelColor(col, rawVal, row);
                    const textColor = fc || primaryColor || softColor || DS.textPrimary;
                    const isMoneyOrNum = col.money || col.number || col.decimal != null || col.percent || col.rate;
                    return (
                      <td key={col.key}
                          style={{
                            padding: "10px 14px",
                            textAlign: col.align,
                            color: textColor,
                            fontWeight: (col.primary && primaryColor) || (funnelMode && funnelConversion.includes(col.key) && fc) ? 800 : 500,
                            fontFamily: isMoneyOrNum ? "ui-monospace, SFMono-Regular, Menlo, monospace" : DS.font,
                            whiteSpace: "nowrap",
                            position: col.sticky ? "sticky" : "static",
                            left: col.sticky ? 0 : "auto",
                            background: col.sticky ? (isDark ? "rgba(10,10,16,0.95)" : "#FFFFFF") : (funnelCellBg(col.key) || "transparent"),
                            zIndex: col.sticky ? 1 : 0,
                            width: columnWidths[col.key],
                            maxWidth: col.sticky ? columnWidths[col.key] : "none",
                            overflow: col.sticky ? "hidden" : "visible",
                            textOverflow: col.sticky ? "ellipsis" : "clip",
                            borderRight: col.sticky ? (isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)") : "none",
                            fontSize: col.sticky ? 12 : 11,
                          }}
                          title={col.sticky ? row.name : undefined}>
                        {canEdit && col.key === "name" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditor(row); }}
                              title="Editar fila"
                              style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, border: "none", background: "transparent", color: DS.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = DS.textPrimary; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DS.textMuted; }}>
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5L13.5 4.5M10 4L12 6L5 13H3V11L10 4Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatCell(col, row)}</span>
                          </span>
                        ) : formatCell(col, row)}
                      </td>
                    );
                  })}
                </tr>
              ); })}
            </tbody>
            {totals && (
              <tfoot>
                <tr style={{ borderTop: isDark ? "2px solid rgba(255,255,255,0.12)" : "2px solid rgba(0,0,0,0.08)", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", fontWeight: 700 }}>
                  {visibleCols.map(col => {
                    const isMoneyOrNum = col.money || col.number || col.decimal != null || col.percent || col.rate;
                    return (
                      <td key={col.key}
                          style={{
                            padding: "11px 14px",
                            textAlign: col.align,
                            color: DS.textPrimary,
                            fontWeight: 800,
                            fontFamily: isMoneyOrNum ? "ui-monospace, SFMono-Regular, Menlo, monospace" : DS.font,
                            whiteSpace: "nowrap",
                            position: col.sticky ? "sticky" : "static",
                            left: col.sticky ? 0 : "auto",
                            background: col.sticky ? (isDark ? "rgba(10,10,16,0.98)" : "#FFFFFF") : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"),
                            zIndex: col.sticky ? 3 : 2,
                            fontSize: 11,
                            borderRight: col.sticky ? (isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)") : "none",
                          }}>
                        {col.key === "name" ? <span style={{ fontWeight: 800, letterSpacing: "0.05em" }}>TOTAL</span> : col.badge ? "" : formatCell(col, totals)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        );
      })()}

      <div style={{ marginTop: 8, fontSize: 10, color: DS.textMuted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>📍 Click en header para ordenar · Scroll horizontal ↔ y vertical ↕ · {onlyWithPurchases && `Filtro activo · `}</span>
        <span>{sorted.length} de {rawData.length} fila{rawData.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Modal de edición de fila (campaña / conjunto / anuncio) */}
      {editingRow && canEdit && (() => {
        const levelLabel = editingRow.level === "campaign" ? "campaña" : editingRow.level === "adset" ? "conjunto" : "anuncio";
        const setField = (k, v) => setEditingRow(er => ({ ...er, form: { ...er.form, [k]: v } }));
        const numField = (label, key, hint) => (
          <div>
            <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em" }}>{label}{hint && <span style={{ color: DS.textHint, marginLeft: 6, fontWeight: 400 }}>{hint}</span>}</div>
            <input
              value={editingRow.form[key] === "" || editingRow.form[key] == null ? "" : (typeof editingRow.form[key] === "number" ? Math.round(editingRow.form[key]).toLocaleString("es-CO") : editingRow.form[key])}
              onChange={e => {
                const v = e.target.value;
                if (v === "") { setField(key, ""); return; }
                const raw = v.replace(/\./g, "").replace(/,/g, ".");
                const n = parseFloat(raw);
                setField(key, isNaN(n) ? v : n);
              }}
              placeholder="0"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: DS.border, background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF", color: DS.textPrimary, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </div>
        );
        return (
          <div onClick={() => setEditingRow(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: isDark ? "#121218" : "#FFFFFF", borderRadius: 14, border: DS.border, padding: 22, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Editar {levelLabel}</div>
                  <div style={{ fontSize: 11, color: DS.textHint, marginTop: 3 }}>Corrige el nombre y las métricas crudas. Las derivadas (ROAS, CTR, CPM, etc.) se recalculan automáticamente.</div>
                </div>
                <button onClick={() => setEditingRow(null)} style={{ background: "transparent", border: "none", color: DS.textMuted, fontSize: 18, cursor: "pointer", padding: 4 }}>✕</button>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em" }}>NOMBRE</div>
                <input
                  value={editingRow.form.name}
                  onChange={e => setField("name", e.target.value)}
                  placeholder={`Nombre del ${levelLabel}`}
                  style={{ width: "100%", padding: "9px 11px", borderRadius: 7, border: DS.border, background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF", color: DS.textPrimary, fontSize: 13, fontWeight: 600 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                {numField("Gasto (COP)", "spend")}
                {numField("Compras", "purchases")}
                {numField("Conversión (COP)", "conversionValue", "valor de ventas")}
                {numField("Pagos iniciados", "initiatedCheckouts")}
                {numField("Visitas a página", "pageVisits")}
                {numField("Clics en enlace", "linkClicks")}
                {numField("Impresiones", "impressions")}
                {numField("Alcance", "reach")}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <button onClick={() => setEditingRow(null)}
                  style={{ flex: 1, padding: "10px", borderRadius: 8, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={saveEditor}
                  style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#2F3437", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── METRIC COLORING HELPER ──────────────────────────────────────────────────
// direction: "higher" (green when above ref) or "lower" (green when below ref)
function getMetricColor(current, reference, direction = "higher") {
  if (!reference || !current || !isFinite(reference)) return { color: DS.textPrimary, label: "" };
  const pct = (current - reference) / Math.abs(reference);
  const d = direction === "higher" ? pct : -pct;
  if (d > 0.30) return { color: "#4A9EFF", label: "excepcional" };  // blue — exceptional
  if (d > 0.05) return { color: DS.green, label: "por encima" };
  if (d > -0.05) return { color: DS.textPrimary, label: "en rango" };
  if (d > -0.15) return { color: DS.amber, label: "por debajo" };
  return { color: "#E24B4A", label: "bajo" };
}

function ReportView({ report, company, onBack, onSaveReport }) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile(768);
  const mask = useCompanyMask();
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [highlightCampaign, setHighlightCampaign] = useState(null);
  // Re-match manual de observaciones de anuncios (admin only)
  const [rematchObsIndex, setRematchObsIndex] = useState(null);
  const [rematchSearch, setRematchSearch] = useState("");
  const canEditObs = typeof onSaveReport === "function";
  const obj = company.objectives || defaultObjectives;
  const m = calcMetrics(report);
  if (!m) return <div style={{ padding: 40, textAlign: "center", color: DS.textMuted }}>Datos insuficientes para calcular métricas.</div>;

  const applyCsvMatchToObs = (obsIndex, csvAd) => {
    if (!csvAd || !onSaveReport) return;
    const cpp = csvAd.costPerPurchase || (csvAd.purchases && csvAd.spend ? csvAd.spend / csvAd.purchases : 0);
    const newMetricas = {
      compras: csvAd.purchases || 0,
      costo_por_compra: cpp || 0,
      valor_conversion: csvAd.conversionValue || 0,
      gasto: csvAd.spend || 0,
      clics: csvAd.linkClicks || 0,
      pagos_iniciados: csvAd.initiatedCheckouts || 0,
    };
    const newObservations = (report.adObservations || []).map((o, i) => i !== obsIndex ? o : ({
      ...o,
      nombre: csvAd.name,
      matchedFromCsv: true,
      matchedCsvName: csvAd.name,
      metricas: newMetricas,
      severidad: classifyAdSeverity(newMetricas, obj || {}),
    }));
    onSaveReport({ ...report, adObservations: newObservations });
    setRematchObsIndex(null);
    setRematchSearch("");
  };

  // ── METRIC COMPARISON ────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState("promedio"); // "promedio" | "objetivos"

  // Calculate historical averages from past reports of the same company
  const avgMetrics = (() => {
    const past = (company.reports || []).filter(r => r.id !== report.id && r.spend > 0 && r.purchases > 0);
    if (past.length < 2) return null;
    const n = past.length;
    return {
      conversion: past.reduce((s, r) => s + (r.conversion || 0), 0) / n,
      spend: past.reduce((s, r) => s + (r.spend || 0), 0) / n,
      purchases: past.reduce((s, r) => s + (r.purchases || 0), 0) / n,
      costPerPurchase: past.reduce((s, r) => s + (r.spend / r.purchases), 0) / n,
      roas: past.reduce((s, r) => s + ((r.conversion || 0) / r.spend), 0) / n,
      avgTicket: past.reduce((s, r) => s + ((r.conversion || 0) / r.purchases), 0) / n,
    };
  })();

  // Get color for a metric based on current compareMode
  const mc = (metricKey, current, direction = "higher") => {
    if (compareMode === "promedio") {
      if (!avgMetrics) return { color: DS.textPrimary, refLabel: null };
      const ref = avgMetrics[metricKey];
      const { color, label } = getMetricColor(current, ref, direction);
      return { color, refLabel: `Prom: ${metricKey === "roas" ? ref.toFixed(2) + "×" : "$" + fmt(ref)}` };
    }
    // objetivos mode
    const refMap = {
      conversion: obj.revenueTarget || null,
      spend: null, // no clear objective for spend
      purchases: null,
      costPerPurchase: obj.costPerPurchaseTarget || null,
      roas: obj.roasTarget || null,
      avgTicket: null,
    };
    const ref = refMap[metricKey];
    if (!ref) return { color: DS.textPrimary, refLabel: null };
    const { color, label } = getMetricColor(current, ref, direction);
    return { color, refLabel: `Obj: ${metricKey === "roas" ? ref + "×" : "$" + fmt(ref)}` };
  };

  // Inject persistent print CSS on mount
  useState(() => {
    const existing = document.getElementById("inforce-print-base");
    if (!existing) {
      const s = document.createElement("style");
      s.id = "inforce-print-base";
      s.innerHTML = `
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .sim-section { display: none !important; }
          .call-input-section { display: none !important; }
        }
        @media screen { .print-only { display: none !important; } }
      `;
      document.head.appendChild(s);
    }
  });

  const roasColor = (r) => r >= (obj.roasTarget || 6) ? DS.green : r >= (obj.roasMin || 4) ? DS.amber : "#E24B4A";
  const roasBg = (r) => r >= (obj.roasTarget || 6) ? "#EAF3DE" : r >= (obj.roasMin || 4) ? "#FAEEDA" : "#FCEBEB";

  // SIMULATION STATE — all sliders start at current actual values
  const [simActive, setSimActive] = useState(false);
  const [sim, setSim] = useState({
    spend: report.spend,
    cpm: m.cpm,
    ctr: m.ctr,
    pageLoadRate: m.pageLoadRate,
    checkoutRate: m.checkoutRate,
    checkoutConversion: m.checkoutConversion,
    avgTicket: m.avgTicket,
  });

  const resetSim = () => setSim({
    spend: report.spend, cpm: m.cpm, ctr: m.ctr,
    pageLoadRate: m.pageLoadRate, checkoutRate: m.checkoutRate,
    checkoutConversion: m.checkoutConversion, avgTicket: m.avgTicket,
  });

  // Propagate chain: spend + cpm → impressions → ctr → clicks → pageLoad → visits → checkout → purchases → revenue → roas
  // Divisor seguro: evita ∞/NaN si el usuario arrastra un slider a 0 (cpm, ctr…).
  const sdiv = (a, b) => (b ? a / b : 0);
  const simImpressions = sdiv(sim.spend, sim.cpm / 1000);
  const simClicks = simImpressions * (sim.ctr / 100);
  const simCpc = sdiv(sim.spend, simClicks);
  const simVisits = simClicks * (sim.pageLoadRate / 100);
  const simInitiated = simVisits * (sim.checkoutRate / 100);
  const simCostPerInitiated = sdiv(sim.spend, simInitiated);
  const simPurchases = simInitiated * (sim.checkoutConversion / 100);
  const simRevenue = simPurchases * sim.avgTicket;
  const simRoas = sdiv(simRevenue, sim.spend);
  const simCostPerPurchase = sdiv(sim.spend, simPurchases);

  const sLabel = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: DS.textMuted, marginBottom: 10 };

  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      await Promise.all([
        new Promise((res, rej) => {
          if (window.jspdf) return res();
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        }),
        new Promise((res, rej) => {
          if (window.html2canvas) return res();
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        }),
      ]);

      const el = document.getElementById("report-pdf-content");
      if (!el) throw new Error("No se encontró el contenido del reporte");

      // Show PDF-only header
      const pdfShow = el.querySelectorAll(".pdf-show");
      pdfShow.forEach(e => { e.style.display = "block"; });

      // Hide excluded sections
      const excluded = el.querySelectorAll(".no-print, .sim-section, .pdf-exclude, .call-input-section");
      const prevDisplay = [];
      excluded.forEach(e => { prevDisplay.push(e.style.display); e.style.display = "none"; });

      const canvas = await window.html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#06060A",
        logging: false,
        windowWidth: 860,
      });

      // Restore
      excluded.forEach((e, i) => { e.style.display = prevDisplay[i]; });
      pdfShow.forEach(e => { e.style.display = "none"; });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const scale = canvas.width / imgW;
      const imgH = (canvas.height * imgW) / canvas.width;

      // Smart page break: find a "dark" row near the desired cut so we don't slice through cards
      const findSmartCut = (desiredMm) => {
        const desiredPx = Math.round(desiredMm * scale);
        const searchPx = Math.min(Math.round(35 * scale), desiredPx); // search up to 35mm above
        const startY = desiredPx - searchPx;
        const height = searchPx;
        if (height <= 0) return desiredMm;
        const offCtx = canvas.getContext("2d");
        const imgData = offCtx.getImageData(0, startY, canvas.width, height);
        const data = imgData.data;
        const bg = [6, 6, 10]; // #06060A
        const threshold = 20;
        const sampleCount = 10;
        let bestRow = height - 1;
        let bestScore = -1;
        for (let row = height - 1; row >= 0; row--) {
          let bgCount = 0;
          for (let s = 0; s < sampleCount; s++) {
            const x = Math.floor((canvas.width / (sampleCount + 1)) * (s + 1));
            const idx = (row * canvas.width + x) * 4;
            const dist = Math.abs(data[idx] - bg[0]) + Math.abs(data[idx + 1] - bg[1]) + Math.abs(data[idx + 2] - bg[2]);
            if (dist < threshold) bgCount++;
          }
          const score = bgCount / sampleCount;
          if (score > bestScore) { bestScore = score; bestRow = row; }
          if (score >= 0.9) break;
        }
        const cutMm = (startY + bestRow) / scale;
        // Don't cut more than 30mm before the desired point (avoid tiny pages)
        return cutMm < desiredMm - 30 ? desiredMm : cutMm;
      };

      let yPos = 0;
      let page = 0;

      while (yPos < imgH - 0.5) {
        if (page > 0) pdf.addPage();
        const remaining = imgH - yPos;

        // Determine cut point
        let cutMm;
        if (remaining <= pageH) {
          cutMm = yPos + remaining; // Last page – take all remaining content
        } else {
          cutMm = findSmartCut(yPos + pageH);
          if (cutMm <= yPos + 10) cutMm = yPos + pageH; // Safety: avoid near-zero pages
        }

        const sliceH = cutMm - yPos;

        // Always create a full-page canvas (pageH tall) filled with black background
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.round(pageH * scale);
        const ctx = sliceCanvas.getContext("2d");
        ctx.fillStyle = "#06060A";
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        // Draw only the content portion
        const contentPx = Math.round(sliceH * scale);
        ctx.drawImage(canvas, 0, Math.round(yPos * scale), canvas.width, contentPx, 0, 0, sliceCanvas.width, contentPx);

        const imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(imgData, "JPEG", 0, 0, imgW, pageH); // Full page height always
        yPos = cutMm;
        page++;
      }

      pdf.save(`Inforce_${company.name.replace(/\s+/g, "_")}_${report.period.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      logger.error(err);
      alert("Error generando el PDF: " + err.message);
    } finally {
      setPdfLoading(false);
    }
  };
  const printReport = downloadPDF;

  return (
    <div style={{ fontFamily: DS.font, background: DS.bg, minHeight: "100vh", color: DS.textPrimary, position: "relative" }}>
    {!isDark && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.8 }} />}
    <div id="report-pdf-content" className="report-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 40px 80px", position: "relative", zIndex: 1 }}>
      {/* Header */}
      <div className="no-print" style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 12, marginBottom: 24, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: isMobile ? "100%" : "auto" }}>
          <button onClick={onBack} style={{ ...darkBtnGhost, padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>← Volver</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700 }}>{mask.name(company.name, company.id)}</div>
              {report.type && REPORT_TYPES[report.type] && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 50, background: REPORT_TYPES[report.type].color + "22", color: REPORT_TYPES[report.type].color, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {REPORT_TYPES[report.type].emoji} {REPORT_TYPES[report.type].label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Campañas de compras · {report.period}</div>
          </div>
          {!isMobile && (
            <button onClick={printReport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: isDark ? "none" : DS.border, background: isDark ? "#fff" : "#2F3437", color: isDark ? "#06060A" : "#FFFFFF", cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>↓</span> {pdfLoading ? "Generando..." : "Descargar PDF"}
            </button>
          )}
        </div>
        {isMobile && (
          <button onClick={printReport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: isDark ? "none" : DS.border, background: isDark ? "#fff" : "#2F3437", color: isDark ? "#06060A" : "#FFFFFF", cursor: "pointer", fontSize: 11, fontWeight: 600, width: "100%" , justifyContent: "center" }}>
            <span style={{ fontSize: 12 }}>↓</span> {pdfLoading ? "Generando..." : "Descargar PDF"}
          </button>
        )}
      </div>

      {/* PDF Header — only visible when generating PDF */}
      <div className="pdf-show" style={{ display: "none", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottom: "2px solid #E24B4A" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: DS.textPrimary }}>{mask.name(company.name, company.id)}</div>
            <div style={{ fontSize: 13, color: DS.textMuted, marginTop: 2 }}>Reporte de campañas de compras · {report.period}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#E24B4A", letterSpacing: "0.06em" }}>INFORCE REPORTS</div>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>Inforce Consulting · {new Date().toLocaleDateString("es-CO")}</div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={sLabel}>Métricas primarias</div>
        <div className="no-print" style={{ display: "inline-flex", borderRadius: 50, border: DS.border, overflow: "hidden" }}>
          {[{ k: "promedio", l: "vs Promedio" }, { k: "objetivos", l: "vs Objetivos" }].map(({ k, l }) => (
            <button key={k} onClick={() => setCompareMode(k)} style={{
              padding: "4px 12px", fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
              border: "none", cursor: "pointer", fontFamily: DS.font,
              background: compareMode === k ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)") : "transparent",
              color: compareMode === k ? DS.textPrimary : DS.textMuted,
            }}>{l}</button>
          ))}
        </div>
      </div>
      {compareMode === "promedio" && !avgMetrics && (
        <div style={{ fontSize: 9, color: DS.textMuted, marginBottom: 8, fontStyle: "italic" }}>Sin suficientes reportes anteriores para comparar (mín. 2)</div>
      )}
      {/* Primary metrics - always visible */}
      <div className="metric-grid-3" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        {(() => { const c = mc("conversion", report.conversion, "higher"); return <MetricCard label="Valor de conversión" value={`$${fmt(report.conversion)}`} sub="Datos de Shopify · COP" color={c.color} refLabel={c.refLabel} />; })()}
        {(() => { const c = mc("spend", report.spend, "lower"); return <MetricCard label="Gasto total" value={`$${fmt(report.spend)}`} sub="Inversión publicitaria · COP" color={c.color} refLabel={c.refLabel} />; })()}
        {!isMobile && (() => { const c = mc("purchases", report.purchases, "higher"); return <MetricCard label="Compras" value={fmt(report.purchases)} sub={`${fmt(report.initiatedCheckouts)} pagos iniciados`} color={c.color} refLabel={c.refLabel} />; })()}
      </div>
      <div className="metric-grid-3" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: isMobile && !showAllMetrics ? 0 : 20 }}>
        {(() => { const cpp = report.spend / report.purchases; const c = mc("costPerPurchase", cpp, "lower"); return <MetricCard label="Costo por compra" value={`$${fmt(cpp)}`} sub={`Objetivo: $${fmt(obj.costPerPurchaseTarget || 50000)} · Máx: $${fmt(obj.costPerPurchaseMax || 80000)}`} color={c.color} refLabel={c.refLabel} />; })()}
        {(() => { const c = mc("roas", m.roas, "higher"); return <MetricCard label="ROAS" value={`${m.roas.toFixed(2)}×`} sub={`Mínimo: ${obj.roasMin || 4}× · Objetivo: ${obj.roasTarget || 6}×`} color={c.color} refLabel={c.refLabel} />; })()}
        {!isMobile && (() => { const c = mc("avgTicket", m.avgTicket, "higher"); return <MetricCard label="Ticket promedio" value={`$${fmt(m.avgTicket)}`} sub="Valor promedio por compra · COP" color={c.color} refLabel={c.refLabel} />; })()}
      </div>

      {/* Mobile-only: expandable secondary metrics */}
      {isMobile && !showAllMetrics && (
        <button onClick={() => setShowAllMetrics(true)} style={{ width: "100%", padding: "8px", marginTop: 8, marginBottom: 20, border: DS.border, borderRadius: 8, background: DS.bgCard, color: DS.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font }}>
          ▼ Ver más métricas
        </button>
      )}
      {isMobile && showAllMetrics && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 8, marginBottom: 10 }}>
            {(() => { const c = mc("purchases", report.purchases, "higher"); return <MetricCard label="Compras" value={fmt(report.purchases)} sub={`${fmt(report.initiatedCheckouts)} pagos iniciados`} color={c.color} refLabel={c.refLabel} />; })()}
            {(() => { const c = mc("avgTicket", m.avgTicket, "higher"); return <MetricCard label="Ticket promedio" value={`$${fmt(m.avgTicket)}`} sub="Valor promedio por compra · COP" color={c.color} refLabel={c.refLabel} />; })()}
          </div>
          <button onClick={() => setShowAllMetrics(false)} style={{ width: "100%", padding: "8px", marginBottom: 20, border: DS.border, borderRadius: 8, background: DS.bgCard, color: DS.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font }}>
            ▲ Ocultar
          </button>
        </>
      )}


      {/* Viewer estilo Meta Ads Manager — Campañas / Conjuntos / Anuncios */}
      {((report.campaigns && report.campaigns.length > 0) || (report.adsets && report.adsets.length > 0) || (report.ads && report.ads.length > 0)) && (
        <CampaignsAdsViewer report={report} objectives={obj} highlightCampaign={highlightCampaign} onSaveReport={onSaveReport} />
      )}

      <div style={{ borderTop: DS.border, margin: "24px 0" }} />

      {/* Métricas */}
      <div style={sLabel}>Métricas clave vs. objetivos</div>
      {isMobile ? (
        <>
          <div data-tour="metricas-objetivo" className="metric-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
            <MetricCard label="CTR" value={pct(m.ctr)} sub={`Objetivo: ${obj.ctrTarget || 2}%+`} status={m.ctr >= (obj.ctrTarget || 2) ? "ok" : m.ctr >= (obj.ctrTarget || 2) * 0.75 ? "warn" : "bad"} />
            <MetricCard label="CPM" value={`$${fmt(m.cpm)}`} sub={`Ref.: $${fmt(obj.cpm || 12000)}`} status={m.cpm <= (obj.cpm || 12000) ? "ok" : m.cpm <= (obj.cpm || 12000) * 1.3 ? "warn" : "bad"} />
            <MetricCard label="Costo por clic" value={`$${fmt(m.cpc)}`} sub={`Objetivo: $${fmt(obj.cpcTarget || 600)}`} status={m.cpc <= (obj.cpcTarget || 600) ? "ok" : m.cpc <= (obj.cpcTarget || 600) * 1.3 ? "warn" : "bad"} />
            <MetricCard label="Visitas a página" value={fmt(report.pageVisits)} sub={`Ideal: ${fmt(m.idealClicks)}`} status="neutral" />
            <MetricCard label="Ida a checkout" value={pct(m.checkoutRate)} sub={`Objetivo: ${obj.checkoutRateTarget || 15}–30%`} status={m.checkoutRate >= (obj.checkoutRateTarget || 15) ? "ok" : m.checkoutRate >= (obj.checkoutRateTarget || 15) * 0.75 ? "warn" : "bad"} />
            <MetricCard label="Costo por pago inic." value={`$${fmt(m.costPerInitiated)}`} sub={`Objetivo: $${fmt(obj.costPerInitiatedTarget || 10000)}`} status={m.costPerInitiated <= (obj.costPerInitiatedTarget || 10000) ? "ok" : m.costPerInitiated <= (obj.costPerInitiatedTarget || 10000) * 1.3 ? "warn" : "bad"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
            <MetricCard label="Pagos iniciados" value={fmt(report.initiatedCheckouts)} sub={`Ideal: ${fmt(m.idealInitiated)}`} status={report.initiatedCheckouts >= m.idealInitiated ? "ok" : "bad"} />
            <MetricCard label="Conv. del checkout" value={pct(m.checkoutConversion)} sub={`Objetivo: ${obj.checkoutConversionTarget || 20}–30%`} status={m.checkoutConversion >= (obj.checkoutConversionTarget || 20) ? "ok" : m.checkoutConversion >= (obj.checkoutConversionTarget || 20) * 0.75 ? "warn" : "bad"} />
          </div>
        </>
      ) : (
        <div className="metric-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          <MetricCard label="CTR" value={pct(m.ctr)} sub={`Objetivo: ${obj.ctrTarget || 2}%+`} status={m.ctr >= (obj.ctrTarget || 2) ? "ok" : m.ctr >= (obj.ctrTarget || 2) * 0.75 ? "warn" : "bad"} />
          <MetricCard label="CPM" value={`$${fmt(m.cpm)}`} sub={`Ref.: $${fmt(obj.cpm || 12000)}`} status={m.cpm <= (obj.cpm || 12000) ? "ok" : m.cpm <= (obj.cpm || 12000) * 1.3 ? "warn" : "bad"} />
          <MetricCard label="Costo por clic" value={`$${fmt(m.cpc)}`} sub={`Objetivo: $${fmt(obj.cpcTarget || 600)}`} status={m.cpc <= (obj.cpcTarget || 600) ? "ok" : m.cpc <= (obj.cpcTarget || 600) * 1.3 ? "warn" : "bad"} />
          <MetricCard label="Visitas a página" value={fmt(report.pageVisits)} sub={`Ideal: ${fmt(m.idealClicks)}`} status="neutral" />
          <MetricCard label="Ida a checkout" value={pct(m.checkoutRate)} sub={`Objetivo: ${obj.checkoutRateTarget || 15}–30%`} status={m.checkoutRate >= (obj.checkoutRateTarget || 15) ? "ok" : m.checkoutRate >= (obj.checkoutRateTarget || 15) * 0.75 ? "warn" : "bad"} />
          <MetricCard label="Costo por pago inic." value={`$${fmt(m.costPerInitiated)}`} sub={`Objetivo: $${fmt(obj.costPerInitiatedTarget || 10000)}`} status={m.costPerInitiated <= (obj.costPerInitiatedTarget || 10000) ? "ok" : m.costPerInitiated <= (obj.costPerInitiatedTarget || 10000) * 1.3 ? "warn" : "bad"} />
          <MetricCard label="Pagos iniciados" value={fmt(report.initiatedCheckouts)} sub={`Ideal: ${fmt(m.idealInitiated)}`} status={report.initiatedCheckouts >= m.idealInitiated ? "ok" : "bad"} />
          <MetricCard label="Conv. del checkout" value={pct(m.checkoutConversion)} sub={`Objetivo: ${obj.checkoutConversionTarget || 20}–30%`} status={m.checkoutConversion >= (obj.checkoutConversionTarget || 20) ? "ok" : m.checkoutConversion >= (obj.checkoutConversionTarget || 20) * 0.75 ? "warn" : "bad"} />
        </div>
      )}

      {/* MODO SIMULACIÓN */}
      <div data-tour="simulacion" className="sim-section" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={sLabel}>Modo simulación</div>
        <div style={{ display: "flex", gap: 8 }}>
          {simActive && <button onClick={resetSim} style={{ padding: "6px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 12, color: DS.textSecondary }}>↺ Resetear</button>}
          <button onClick={() => { setSimActive(a => !a); resetSim(); }}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: simActive ? "#E24B4A" : "#1D1D1B", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            {simActive ? "Salir de simulación" : "Activar simulación →"}
          </button>
        </div>
      </div>

      {!simActive && (
        <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "20px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: DS.textMuted, marginBottom: 4 }}>Activa el modo simulación para manipular cualquier métrica del embudo</div>
          <div style={{ fontSize: 12, color: DS.textMuted }}>Cambia el presupuesto, CPM, CTR, ida a checkout, ticket promedio y ve cómo impacta el ROAS en tiempo real</div>
        </div>
      )}

      {simActive && (() => {
        const SimSlider = ({ label, value, min, max, step, onChange, format, actual, good, bad }) => {
          const trackRef = useRef(null);
          const dragging = useRef(false);
          const changed = Math.abs(value - actual) > (step || 1) * 0.4;
          const valColor = good ? DS.green : bad ? "#E24B4A" : "inherit";
          const fillPct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
          const accentColor = changed ? (good ? DS.green : bad ? "#E24B4A" : DS.green) : "#C8C6C0";

          const calcValue = (clientX) => {
            const rect = trackRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const raw = min + ratio * (max - min);
            const s = step || 1;
            return Math.round(raw / s) * s;
          };

          const onMouseDown = (e) => {
            e.preventDefault();
            dragging.current = true;
            onChange(calcValue(e.clientX));
            const onMove = (ev) => { if (dragging.current) onChange(calcValue(ev.clientX)); };
            const onUp = () => { dragging.current = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          };

          const onTouchStart = (e) => {
            e.preventDefault();
            dragging.current = true;
            onChange(calcValue(e.touches[0].clientX));
            const onMove = (ev) => { if (dragging.current) onChange(calcValue(ev.touches[0].clientX)); };
            const onEnd = () => { dragging.current = false; document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onEnd); };
            document.addEventListener("touchmove", onMove, { passive: false });
            document.addEventListener("touchend", onEnd);
          };

          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: DS.textSecondary }}>{label}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  {changed && <span style={{ fontSize: 11, color: DS.textMuted, textDecoration: "line-through" }}>{format(actual)}</span>}
                  <span style={{ fontSize: 15, fontWeight: 700, color: valColor }}>{format(value)}</span>
                </div>
              </div>
              <div ref={trackRef} onMouseDown={onMouseDown} onTouchStart={onTouchStart}
                style={{ position: "relative", height: 32, cursor: "ew-resize", userSelect: "none", touchAction: "none" }}>
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 6, marginTop: -3, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", borderRadius: 10 }} />
                <div style={{ position: "absolute", top: "50%", left: 0, width: `${fillPct}%`, height: 6, marginTop: -3, background: accentColor, borderRadius: 10 }} />
                <div style={{ position: "absolute", top: "50%", left: `${fillPct}%`, width: 22, height: 22, marginTop: -11, marginLeft: -11,
                  background: "white", border: `2.5px solid ${accentColor}`, borderRadius: "50%",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.18)", cursor: "grab" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
                <span>{format(min)}</span><span>{format(max)}</span>
              </div>
            </div>
          );
        };

        const roasOk = simRoas >= (obj.roasTarget || 6);
        const roasWarn = simRoas >= (obj.roasMin || 4) && simRoas < (obj.roasTarget || 6);
        const roasDelta = ((simRoas - m.roas) / m.roas * 100);
        const revDelta = ((simRevenue - report.conversion) / report.conversion * 100);

        return (
          <div style={{ marginBottom: 20 }}>
            {/* RESULTADO EN TIEMPO REAL */}
            <div style={{ background: roasOk ? "rgba(29,185,122,0.12)" : roasWarn ? "rgba(245,166,35,0.12)" : "rgba(226,75,74,0.12)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, border: `1.5px solid ${roasOk ? DS.green : roasWarn ? DS.amber : "#E24B4A"}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: roasOk ? DS.green : roasWarn ? DS.amber : "#E24B4A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Resultado simulado</div>
              <div className="sim-result-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "ROAS", value: `${simRoas.toFixed(2)}×`, delta: `${roasDelta >= 0 ? "+" : ""}${roasDelta.toFixed(1)}%` },
                  { label: "Ingresos", value: fmtM(simRevenue), delta: `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}%` },
                  { label: "Compras", value: fmt(Math.round(simPurchases)), delta: `${((simPurchases - report.purchases) / report.purchases * 100).toFixed(1)}%` },
                  { label: "Costo / compra", value: `$${fmt(simCostPerPurchase)}`, delta: `${(((simCostPerPurchase - report.spend / report.purchases) / (report.spend / report.purchases)) * 100).toFixed(1)}%` },
                ].map((card, i) => (
                  <div key={i} style={{ background: DS.bgCard, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 4 }}>{card.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: roasOk ? DS.green : roasWarn ? DS.amber : "#E24B4A" }}>{card.value}</div>
                    <div style={{ fontSize: 11, color: parseFloat(card.delta) >= 0 ? DS.green : "#E24B4A", marginTop: 2 }}>{card.delta} vs actual</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sim-sliders-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* TRÁFICO */}
              <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Tráfico — anuncios</div>
                <SimSlider label="Presupuesto (COP)" value={sim.spend} actual={report.spend} min={100000} max={report.spend * 5} step={50000}
                  format={v => fmtM(v)} onChange={v => setSim(s => ({ ...s, spend: v }))} />
                <SimSlider label="CPM (costo por mil impresiones)" value={sim.cpm} actual={m.cpm} min={1000} max={50000} step={500}
                  format={v => `$${fmt(v)}`} onChange={v => setSim(s => ({ ...s, cpm: v }))}
                  good={sim.cpm < m.cpm} bad={sim.cpm > m.cpm * 1.2} />
                <SimSlider label="CTR (%)" value={sim.ctr} actual={m.ctr} min={0.1} max={10} step={0.1}
                  format={v => `${v.toFixed(1)}%`} onChange={v => setSim(s => ({ ...s, ctr: v }))}
                  good={sim.ctr > m.ctr} bad={sim.ctr < m.ctr} />
                <div style={{ background: DS.bgCard, borderRadius: DS.radiusSm, padding: "8px 10px", marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 2 }}>Efectos en cadena</div>
                  <div style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Impresiones: <strong>{fmt(Math.round(simImpressions))}</strong></span>
                    <span>Clics: <strong>{fmt(Math.round(simClicks))}</strong></span>
                    <span>CPC: <strong>${fmt(simCpc)}</strong></span>
                  </div>
                </div>
              </div>

              {/* CONVERSIÓN */}
              <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Conversión — página</div>
                <SimSlider label="% carga de página" value={sim.pageLoadRate} actual={m.pageLoadRate} min={10} max={100} step={1}
                  format={v => `${v.toFixed(0)}%`} onChange={v => setSim(s => ({ ...s, pageLoadRate: v }))}
                  good={sim.pageLoadRate > m.pageLoadRate} bad={sim.pageLoadRate < m.pageLoadRate} />
                <SimSlider label="% ida a checkout" value={sim.checkoutRate} actual={m.checkoutRate} min={1} max={60} step={0.5}
                  format={v => `${v.toFixed(1)}%`} onChange={v => setSim(s => ({ ...s, checkoutRate: v }))}
                  good={sim.checkoutRate > m.checkoutRate} bad={sim.checkoutRate < m.checkoutRate} />
                <SimSlider label="% conversión del checkout" value={sim.checkoutConversion} actual={m.checkoutConversion} min={1} max={80} step={0.5}
                  format={v => `${v.toFixed(1)}%`} onChange={v => setSim(s => ({ ...s, checkoutConversion: v }))}
                  good={sim.checkoutConversion > m.checkoutConversion} bad={sim.checkoutConversion < m.checkoutConversion} />
                <SimSlider label="Ticket promedio (COP)" value={sim.avgTicket} actual={m.avgTicket} min={5000} max={m.avgTicket * 4} step={1000}
                  format={v => `$${fmt(v)}`} onChange={v => setSim(s => ({ ...s, avgTicket: v }))}
                  good={sim.avgTicket > m.avgTicket} bad={sim.avgTicket < m.avgTicket} />
                <div style={{ background: DS.bgCard, borderRadius: DS.radiusSm, padding: "8px 10px", marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 2 }}>Efectos en cadena</div>
                  <div style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Visitas: <strong>{fmt(Math.round(simVisits))}</strong></span>
                    <span>Pagos inic.: <strong>{fmt(Math.round(simInitiated))}</strong></span>
                    <span>Costo/pago: <strong>${fmt(simCostPerInitiated)}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Secciones de análisis del reporte */}
      {report.type && REPORT_TYPES[report.type] && report.sections && Object.values(report.sections).some(v => v) && (() => {
        const typeConfig = REPORT_TYPES[report.type];
        // Migrate old horas section keys to new ones
        const sections = report.type === "horas" ? migrateHorasSections(report.sections) : report.sections;
        const isHoras = report.type === "horas";
        const campaignDetails = sections._campaignDetails ? (() => { try { return JSON.parse(sections._campaignDetails); } catch { return null; } })() : null;

        // For horas: determine order — if optimization has more content, show it first
        const horasSections = isHoras ? (() => {
          const escala = sections.oportunidadesEscala || "";
          const optim = sections.oportunidadesOptimizacion || "";
          const optimFirst = optim.split("\n").length > escala.split("\n").length;
          const items = [
            { key: "oportunidadesEscala", title: "Oportunidades de escala", variant: "escala", color: "#1DB97A" },
            { key: "oportunidadesOptimizacion", title: "Oportunidades de optimización", variant: "optimizacion", color: "#E24B4A" },
          ];
          return optimFirst ? items.reverse() : items;
        })() : null;

        return (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: DS.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: typeConfig.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{typeConfig.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: typeConfig.color }}>Análisis {isHoras ? "— Campañas" : `— ${typeConfig.label}`}</div>
            </div>

            {isHoras ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
                {horasSections.filter(sec => sections[sec.key]).map(sec => (
                  <div key={sec.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color }} />
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: sec.color }}>{sec.title}</div>
                    </div>
                    <OpportunityCards text={sections[sec.key]} variant={sec.variant} campaigns={report.campaigns} adsets={report.adsets} campaignDetails={campaignDetails}
                      onViewCampaign={(name, v) => {
                        const el = document.getElementById("campaigns-table-container");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                        setHighlightCampaign({ name, variant: v });
                        setTimeout(() => setHighlightCampaign(null), 2000);
                      }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                {typeConfig.sections.filter(sec => sections[sec.key]).map(sec => (
                  <div key={sec.key} style={{ background: DS.bgCard, borderRadius: DS.radiusSm, padding: "16px 18px", borderLeft: `3px solid ${typeConfig.color}99` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: typeConfig.color, marginBottom: 10 }}>{sec.title}</div>
                    <FormattedAnalysis text={sections[sec.key]} accentColor={typeConfig.color} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}


      {/* Observaciones de anuncios */}
      {report.adObservations && report.adObservations.length > 0 && (
        <>
          <div style={{ borderTop: DS.border, margin: "24px 0" }} />
          <div style={sLabel}>Observaciones de anuncios</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.adObservations.map((obs, i) => {
              // Detectar si es formato nuevo (con severidad) o legacy (text solamente)
              const isNewFormat = obs.severidad !== undefined || obs.nombre !== undefined;
              const m = obs.metricas || {};

              if (isNewFormat) {
                const sev = getAdSeverityStyle(obs.severidad || "sin_datos");
                const roas = m.gasto > 0 && m.valor_conversion > 0 ? m.valor_conversion / m.gasto : 0;
                return (
                  <div key={i} style={{ background: sev.bg, borderRadius: 12, padding: "16px 18px", border: `1.5px solid ${sev.border}` }}>
                    {/* Header: número + nombre + badge severidad */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: sev.color + "33", color: sev.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obs.nombre || "Anuncio"}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {canEditObs && (report.ads || []).length > 0 && (
                          <button
                            onClick={() => { setRematchObsIndex(rematchObsIndex === i ? null : i); setRematchSearch(""); }}
                            title="Cambiar match con CSV"
                            style={{ fontSize: 9, color: "#7FB8E8", fontWeight: 700, padding: "4px 10px", background: "rgba(55,138,221,0.1)", borderRadius: 20, border: "1px solid rgba(55,138,221,0.3)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            ✏️ {obs.matchedFromCsv ? "Cambiar match" : "Buscar en CSV"}
                          </button>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 20, background: sev.color + "22", color: sev.color, border: `1px solid ${sev.color}55`, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
                          <span>{sev.icon}</span> {sev.label}
                        </span>
                      </div>
                    </div>

                    {/* Panel de re-match — admin only */}
                    {canEditObs && rematchObsIndex === i && (report.ads || []).length > 0 && (() => {
                      const q = rematchSearch.toLowerCase().trim();
                      const list = (report.ads || [])
                        .filter(a => !q || (a.name || "").toLowerCase().includes(q))
                        .sort((a, b) => (b.purchases || 0) - (a.purchases || 0))
                        .slice(0, 30);
                      return (
                        <div style={{ marginBottom: 10, padding: "12px 14px", background: "rgba(55,138,221,0.05)", border: "1px solid rgba(55,138,221,0.25)", borderRadius: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7FB8E8", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            🔎 Selecciona el anuncio correcto del CSV
                          </div>
                          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>
                            Busca entre los {(report.ads || []).length} anuncios del CSV y selecciona el real. Las métricas se actualizan automáticamente.
                          </div>
                          <input
                            value={rematchSearch}
                            onChange={e => setRematchSearch(e.target.value)}
                            placeholder="Buscar por nombre de anuncio..."
                            autoFocus
                            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid rgba(55,138,221,0.3)", fontSize: 12, boxSizing: "border-box", background: isDark ? "rgba(0,0,0,0.25)" : "#FFFFFF", color: DS.textPrimary, marginBottom: 8 }}
                          />
                          <div style={{ maxHeight: 240, overflowY: "auto", background: isDark ? "rgba(0,0,0,0.25)" : "#FFFFFF", border: DS.border, borderRadius: 8 }}>
                            {list.length === 0 ? (
                              <div style={{ padding: "14px", fontSize: 11, color: DS.textMuted, textAlign: "center" }}>Sin resultados</div>
                            ) : list.map((csvAd, idx) => {
                              const isCurrent = obs.matchedCsvName === csvAd.name;
                              return (
                                <div key={idx}
                                  onClick={() => applyCsvMatchToObs(i, csvAd)}
                                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: idx < list.length - 1 ? DS.border : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                                  onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}
                                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {isCurrent && <span style={{ color: DS.green, marginRight: 4 }}>✓</span>}
                                      {csvAd.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2, display: "flex", gap: 10 }}>
                                      <span style={{ color: (csvAd.purchases || 0) > 0 ? DS.green : DS.textMuted }}>{csvAd.purchases || 0} compras</span>
                                      <span>${Math.round(csvAd.spend || 0).toLocaleString("es-CO")} gasto</span>
                                      <span>${Math.round(csvAd.conversionValue || 0).toLocaleString("es-CO")} conv.</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <button onClick={() => { setRematchObsIndex(null); setRematchSearch(""); }}
                              style={{ padding: "6px 12px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textMuted, cursor: "pointer", fontSize: 10 }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Métricas — siempre las 5 mismas (Compras, Costo/compra, Conversión, Gasto, ROAS) si matcheó con CSV */}
                    {obs.matchedFromCsv && (() => {
                      const compras = m.compras || 0;
                      const conv = m.valor_conversion || 0;
                      const gasto = m.gasto || 0;
                      const cpp = m.costo_por_compra || (compras > 0 ? gasto / compras : 0);
                      const calcRoas = gasto > 0 && conv > 0 ? conv / gasto : 0;
                      return (
                        <div style={{ display: "flex", gap: isMobile ? 4 : 8, flexWrap: "nowrap", marginBottom: 10, overflowX: "auto" }}>
                          {[
                            { label: "Compras", val: compras, highlight: false },
                            !isMobile && { label: "Costo/compra", val: cpp > 0 ? `$${Math.round(cpp).toLocaleString("es-CO")}` : "—", highlight: cpp > 0 },
                            { label: "Conversión", val: `$${Math.round(conv).toLocaleString("es-CO")}`, highlight: false },
                            { label: "Gasto", val: `$${Math.round(gasto).toLocaleString("es-CO")}`, highlight: false },
                            { label: "ROAS", val: calcRoas > 0 ? `${calcRoas.toFixed(2)}×` : "—", highlight: calcRoas > 0 },
                          ].filter(Boolean).map((c, idx) => (
                            <div key={idx} style={{ background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)", borderRadius: 6, padding: isMobile ? "3px 6px" : "5px 11px", fontSize: isMobile ? 9 : 11, border: DS.border, flexShrink: 0 }}>
                              <span style={{ color: DS.textMuted, fontSize: isMobile ? 7 : 9 }}>{c.label} </span>
                              <strong style={{ color: c.highlight ? sev.color : DS.textPrimary, fontWeight: 700 }}>{c.val}</strong>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Descripción */}
                    {obs.descripcion && (
                      <div style={{ marginBottom: 10, padding: "9px 12px", background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 12, color: DS.textSecondary, lineHeight: 1.6, borderLeft: `2px solid ${sev.color}55` }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Descripción</div>
                        {obs.descripcion}
                      </div>
                    )}

                    {/* Acción recomendada */}
                    {obs.accionRecomendada && (
                      <div style={{ padding: "10px 13px", background: sev.color + "1A", borderRadius: 8, border: `1px solid ${sev.color}55`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ fontSize: 16, lineHeight: 1 }}>{sev.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: sev.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Acción recomendada</div>
                          <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 600, lineHeight: 1.5 }}>{obs.accionRecomendada}</div>
                        </div>
                      </div>
                    )}

                    {/* Link */}
                    {obs.link && (
                      <div style={{ marginTop: 8 }}>
                        <a href={obs.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7FB8E8", textDecoration: "none" }}>🔗 {obs.link}</a>
                      </div>
                    )}
                  </div>
                );
              }

              // LEGACY: formato viejo con obs.text
              const parts = (obs.text || "").split(" — ");
              const title = parts[0];
              const desc = parts.slice(1).join(" — ").replace(/ \| .*$/, "");
              return (
                <div key={i} style={{ background: DS.bgCard, borderRadius: 12, padding: "14px 16px", border: DS.border }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, marginBottom: 6 }}>{title}</div>
                  {desc && <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.6 }}>{desc}</div>}
                  {obs.link && <a href={obs.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7FB8E8", display: "block", marginTop: 6 }}>🔗 {obs.link}</a>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Notas para copy — organizadas por formato */}
      {report.notasCopy && report.notasCopy.trim() && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: DS.border }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(244,63,94,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📝</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F43F5E" }}>Notas para copy</div>
          </div>
          <CopyNotesCards text={report.notasCopy} />
        </div>
      )}

      {/* MENSAJE DE WHATSAPP — rediseñado */}
      <div className="pdf-exclude">{(() => {
        const obj = company.objectives || defaultObjectives;
        const roasEmoji = m.roas < (obj.roasMin || 4) ? " ⚠️ por debajo del mínimo" : m.roas >= (obj.roasTarget || 6) ? " ✅" : " 🟡";

        // Campañas con buen rendimiento (verde) — ROAS >= target y con compras
        const allCampaigns = report.campaigns || [];
        const purchaseOnlyCampaigns = allCampaigns.filter(c => {
          if (c.objective && /messag|engagement|interacc|mensaj|video_views|traffic/i.test(c.objective)) return false;
          if (c.resultIndicator && /interacc|mensaj|view|perfil|traffic/i.test(c.resultIndicator)) return false;
          if ((c.purchases || 0) > 0) return true;
          if (c.objective === "purchase") return true;
          return false;
        });
        const campaigns = purchaseOnlyCampaigns;
        const goodCampaigns = campaigns
          .filter(c => (c.purchases || 0) > 0 && (c.purchaseRoas || (c.conversionValue && c.spend ? c.conversionValue / c.spend : 0)) >= (obj.roasTarget || 6))
          .sort((a, b) => (b.purchaseRoas || 0) - (a.purchaseRoas || 0))
          .slice(0, 3);
        const badCampaigns = campaigns
          .filter(c => (c.spend || 0) > 0 && ((c.purchases || 0) === 0 || (c.purchaseRoas || (c.conversionValue && c.spend ? c.conversionValue / c.spend : 0)) < (obj.roasMin || 4)))
          .sort((a, b) => (b.spend || 0) - (a.spend || 0))
          .slice(0, 3);

        // Agrupar anuncios por formato
        const ads = report.ads || [];
        const formatGroups = {};
        ads.forEach(ad => {
          const name = (ad.name || "").toLowerCase();
          let format = "Otros";
          if (/carousel|carrusel|carru/i.test(name)) format = "Carrusel";
          else if (/video|reel|mov/i.test(name)) format = "Video";
          else if (/image|imagen|static|estatic/i.test(name)) format = "Imagen";
          else if (/collection|colec/i.test(name)) format = "Colección";
          else if (/story|stories/i.test(name)) format = "Story";
          if (!formatGroups[format]) formatGroups[format] = { purchases: 0, spend: 0, conversion: 0, count: 0 };
          formatGroups[format].purchases += (ad.purchases || 0);
          formatGroups[format].spend += (ad.spend || 0);
          formatGroups[format].conversion += (ad.conversionValue || 0);
          formatGroups[format].count++;
        });
        const formatLines = Object.entries(formatGroups)
          .filter(([, g]) => g.spend > 0)
          .sort((a, b) => b[1].purchases - a[1].purchases)
          .map(([name, g]) => {
            const roas = g.spend > 0 ? (g.conversion / g.spend).toFixed(2) : "0";
            if (g.purchases > 0) return `• ${name}: ${g.purchases} compras, ROAS ${roas}×`;
            return `• ${name}: sin compras, $${fmt(g.spend)} gastados`;
          });

        // URL del reporte — formato cliente para que abra en su propio portal sin pedir login de admin
        const companySlug = company.slug || company.name.toLowerCase().replace(/\s+/g, "-");
        const reportUrl = getClientReportUrl(companySlug, report.id);

        const parts = [
          "Hola equipo 👋 Les comparto los resultados de los últimos " + report.period + ".",
          "",
          "📊 *Resultados del período:*",
          "• Ventas generadas: $" + fmt(report.conversion) + " COP",
          "• Gasto total: $" + fmt(report.spend) + " COP",
          "• ROAS: " + m.roas.toFixed(2) + "×" + roasEmoji,
          "• Costo por compra: $" + fmt(report.spend / report.purchases) + " COP",
          "• Compras: " + report.purchases,
        ];

        if (goodCampaigns.length > 0) {
          parts.push("", "🟢 *Campañas a escalar:*");
          goodCampaigns.forEach(c => {
            const roas = c.purchaseRoas || (c.conversionValue && c.spend ? (c.conversionValue / c.spend).toFixed(2) : "—");
            parts.push(`• ${(c.name || "").slice(0, 40)}: ${c.purchases} compras, costo/compra $${fmt(c.spend / c.purchases)}, ROAS ${typeof roas === "number" ? roas.toFixed(2) : roas}×`);
          });
        }

        if (badCampaigns.length > 0) {
          parts.push("", "🔴 *Campañas a revisar:*");
          badCampaigns.forEach(c => {
            const roas = c.purchaseRoas || (c.conversionValue && c.spend ? (c.conversionValue / c.spend).toFixed(2) : "0");
            if ((c.purchases || 0) === 0) {
              parts.push(`• ${(c.name || "").slice(0, 40)}: sin compras, $${fmt(c.spend)} gastados`);
            } else {
              parts.push(`• ${(c.name || "").slice(0, 40)}: ${c.purchases} compras, costo/compra $${fmt(c.spend / c.purchases)}, ROAS ${typeof roas === "number" ? roas.toFixed(2) : roas}×`);
            }
          });
        }

        if (report.notasCopy && report.notasCopy.trim()) {
          const notasTxt = report.notasCopy.trim().replace(/\s+/g, " ").slice(0, 300);
          parts.push("", "📝 *Notas para copy:*", notasTxt);
        }

        parts.push("", "🔗 Ver reporte completo: " + reportUrl);

        const waMsg = parts.join("\n");

        const [copied, setCopied] = useState(false);
        return (
          <>
            <div style={{ borderTop: DS.border, margin: "24px 0" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={sLabel}>Mensaje para WhatsApp</div>
              <button onClick={() => { navigator.clipboard?.writeText(waMsg); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: copied ? DS.green : "#25D366", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                {copied ? "✓ Copiado" : "📋 Copiar mensaje"}
              </button>
            </div>
            <div style={{ background: "rgba(29,185,122,0.06)", borderRadius: DS.radius, padding: "16px 20px", border: "1px solid rgba(29,185,122,0.2)", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13, lineHeight: 1.7, color: DS.textSecondary, whiteSpace: "pre-wrap" }}>
              {waMsg}
            </div>
          </>
        );
      })()}</div>

      <details style={{ marginTop: 24, paddingTop: 20, borderTop: DS.border }}>
        <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, userSelect: "none", marginBottom: 16 }}>
          ▸ Secciones adicionales (click para expandir)
        </summary>

      {/* Embudos detallados */}
      {/* Embudo 1 */}
      <div style={sLabel}>Embudo — parte 1: tráfico (los anuncios)</div>
      {(() => {
        const cpmOk = m.cpm <= (obj.cpm || 12000) * 1.3;
        const alcanceStatus = cpmOk ? "good" : "warn";
        return (
          <FunnelBlock title="Alcance e impacto del anuncio" good={alcanceStatus === "good"} regular={alcanceStatus === "warn"} children={[
            <FunnelStep key="a" value={fmt(report.reach)} label="Alcance (personas únicas)" />,
            <FunnelStep key="b" value={fmt(report.impressions)} label="Impresiones totales" sub={`Frec. ${report.reach ? (report.impressions / report.reach).toFixed(2) : "—"}×`} />,
            <FunnelStep key="c" value={`$${fmt(m.cpm)}`} label="CPM" sub={`Ref.: $${fmt(obj.cpm || 12000)}`} warn={m.cpm > (obj.cpm || 12000)} />,
            <FunnelStep key="d" value={`$${fmt(report.spend)}`} label="Gasto total" />,
          ]} />
        );
      })()}
      {(() => {
        const ctrOk = m.ctr >= (obj.ctrTarget || 2);
        const ctrWarn = m.ctr >= (obj.ctrTarget || 2) * 0.7 && m.ctr < (obj.ctrTarget || 2);
        const cpcOk = m.cpc <= (obj.cpcTarget || 600) * 1.3;
        const clicksGood = ctrOk && cpcOk;
        const clicksBad = !ctrWarn && !ctrOk;
        return (
          <FunnelBlock title="Clics generados" good={clicksGood} bottleneck={clicksBad} regular={!clicksGood && !clicksBad} children={[
            <FunnelStep key="a" value={fmt(report.clicks)} label="Clics en el enlace" />,
            <FunnelStep key="b" value={pct(m.ctr)} label="CTR" sub={`Objetivo: ${obj.ctrTarget || 2}%+`} warn={ctrWarn} bad={!ctrOk && !ctrWarn} />,
            <FunnelStep key="c" value={`$${fmt(m.cpc)}`} label="CPC real" sub={`Objetivo: $${fmt(obj.cpcTarget || 600)}`} bad={m.cpc > (obj.cpcTarget || 600) * 1.3} warn={m.cpc > (obj.cpcTarget || 600) && m.cpc <= (obj.cpcTarget || 600) * 1.3} />,
          ]} />
        );
      })()}

      <div style={sLabel}>Embudo — parte 2: conversión (la página)</div>
      {(() => {
        const loadGood = m.pageLoadRate >= (obj.pageLoadMin || 80);
        const loadWarn = m.pageLoadRate >= (obj.pageLoadMin || 80) * 0.85 && m.pageLoadRate < (obj.pageLoadMin || 80);
        return (
          <FunnelBlock title="Visitas a la página" good={loadGood} regular={loadWarn} bottleneck={!loadGood && !loadWarn} children={[
            <FunnelStep key="a" value={fmt(report.pageVisits)} label="Visitas a la página" />,
            <FunnelStep key="b" value={pct(m.pageLoadRate)} label="Tasa de carga" sub={`${fmt(report.pageVisits)} / ${fmt(report.clicks)} clics`} good={loadGood} warn={loadWarn} />,
            <FunnelStep key="c" value={`$${fmt(m.costPerVisit)}`} label="Costo por visita" />,
          ]} />
        );
      })()}
      {(() => {
        const chkGood = m.checkoutRate >= (obj.checkoutRateTarget || 15);
        const chkWarn = m.checkoutRate >= (obj.checkoutRateTarget || 15) * 0.6 && m.checkoutRate < (obj.checkoutRateTarget || 15);
        return (
          <FunnelBlock title="Inicio de checkout" bottleneck={!chkGood && !chkWarn} regular={chkWarn} good={chkGood} children={[
            <FunnelStep key="a" value={fmt(report.initiatedCheckouts)} label="Pagos iniciados" sub={`Ideal: ${fmt(report.spend / (obj.costPerInitiatedTarget || 10000))}`} bad={!chkGood} warn={chkWarn} />,
            <FunnelStep key="b" value={pct(m.checkoutRate)} label="Ida a checkout" sub={`Objetivo: ${obj.checkoutRateTarget || 15}–30%`} bad={!chkGood && !chkWarn} warn={chkWarn} />,
            <FunnelStep key="c" value={`$${fmt(m.costPerInitiated)}`} label="Costo por pago inic." sub={`Objetivo: $${fmt(obj.costPerInitiatedTarget || 10000)}`} bad={!chkGood && !chkWarn} warn={chkWarn} />,
          ]} />
        );
      })()}
      {(() => {
        const convGood = m.checkoutConversion >= (obj.checkoutConversionTarget || 20);
        const convWarn = m.checkoutConversion >= (obj.checkoutConversionTarget || 20) * 0.75 && m.checkoutConversion < (obj.checkoutConversionTarget || 20);
        return (
          <FunnelBlock title="Compras y valor generado" good={convGood} regular={convWarn} bottleneck={!convGood && !convWarn} children={[
            <FunnelStep key="a" value={pct(m.checkoutConversion)} label="Conv. checkout" sub={`Objetivo: ${obj.checkoutConversionTarget || 20}–30%`} good={convGood} warn={convWarn} bad={!convGood && !convWarn} />,
            <FunnelStep key="b" value={report.purchases} label="Compras" sub={`$${fmt(m.avgTicket)} ticket prom.`} />,
            <FunnelStep key="c" value={`$${fmt(report.conversion)}`} label="Valor de conversión" />,
            <FunnelStep key="d" value={`${m.roas.toFixed(2)}×`} label="ROAS final" sub={`Objetivo: ${obj.roasTarget || 6}×`} bad={m.roas < (obj.roasMin || 4)} warn={m.roas >= (obj.roasMin || 4) && m.roas < (obj.roasTarget || 6)} />,
          ]} />
        );
      })()}


      <div style={{ borderTop: DS.border, margin: "24px 0" }} />

      {/* Análisis de llamada */}
      {(() => {
        const [callTranscript, setCallTranscript] = useState(report.callTranscript || "");
        const [callAnalysis, setCallAnalysis] = useState(report.callAnalysis || null);
        const [analyzing, setAnalyzing] = useState(false);
        const [showTranscript, setShowTranscript] = useState(false);

        const analyzeCall = async () => {
          if (!callTranscript.trim()) return;
          setAnalyzing(true);
          const prompt = `Eres consultor experto en e-commerce y publicidad digital para el mercado colombiano trabajando para Inforce Consulting.

Analiza esta transcripción de llamada con el cliente "${company.name}" y genera un análisis ejecutivo conciso.

CONTEXTO DE LA CUENTA:
- ROAS actual: ${m.roas.toFixed(2)}× (objetivo: ${obj.roasTarget || 6}×)
- Compras: ${report.purchases} · Gasto: $${fmt(report.spend)} COP
- Período: ${report.period}

TRANSCRIPCIÓN:
${callTranscript}

Responde SOLO con este JSON (sin markdown):
{
  "situacion": ["punto clave 1 muy directo (max 15 palabras)", "punto clave 2", "punto clave 3"],  // array de 3-4 bullets concisos
  "trafico": "1-2 oraciones sobre el estado del tráfico según lo discutido",
  "conversion": "1-2 oraciones sobre el estado de conversión según lo discutido",
  "accionables": [
    {"titulo": "título corto de la tarea (5-8 palabras máx)", "descripcion": "descripción específica de qué hacer exactamente y por qué, 1-2 oraciones", "responsable": "trafficker|cliente|ambos", "urgencia": "inmediato|esta semana|próxima semana"},
    ...máximo 6 accionables
  ]
}`;
          const text = await callAI([{ role: "user", content: prompt }], "Analiza llamadas de clientes de e-commerce. Responde solo JSON.");
          setAnalyzing(false);
          try {
            const clean = text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);
            setCallAnalysis(parsed);
            // persist to report object in memory
            report.callTranscript = callTranscript;
            report.callAnalysis = parsed;
          } catch { alert("Error procesando el análisis. Intenta de nuevo."); }
        };

        const urgColors = { "inmediato": { bg: "#FCEBEB", color: "#A32D2D" }, "esta semana": { bg: "#FAEEDA", color: "#854F0B" }, "próxima semana": { bg: "#EAF3DE", color: DS.green } };
        const respColors = { "trafficker": "#185FA5", "cliente": "#854F0B", "ambos": "#3B6D11" };

        return (
          <>
            <div className="call-input-section" style={{ borderTop: DS.border, margin: "24px 0" }} />
            <div className="call-input-section" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={sLabel}>Análisis de llamada con el cliente <span style={{ color: DS.blue, fontSize: 10, background: "rgba(55,138,221,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>IA</span></div>
            </div>

            {!callAnalysis ? (
              <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px" }}>
                <div style={{ fontSize: 13, color: DS.textSecondary, marginBottom: 10 }}>Pega la transcripción completa de tu llamada con {company.name} — la IA extrae qué está pasando y genera los accionables concretos.</div>
                <textarea value={callTranscript} onChange={e => setCallTranscript(e.target.value)} rows={6}
                  placeholder="Pega aquí la transcripción de Fathom u otra herramienta... puede ser larga, no hay problema."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 13, boxSizing: "border-box", resize: "vertical", background: DS.bgCard, color: DS.textPrimary, lineHeight: 1.6, fontFamily: "inherit" }} />
                <button onClick={analyzeCall} disabled={analyzing || !callTranscript.trim()}
                  style={{ marginTop: 10, width: "100%", padding: "11px", borderRadius: 8, border: DS.border, background: analyzing || !callTranscript.trim() ? DS.bgCard : darkBtn.background, color: analyzing || !callTranscript.trim() ? DS.textMuted : darkBtn.color, fontSize: 13, fontWeight: 700, cursor: analyzing || !callTranscript.trim() ? "default" : "pointer" }}>
                  {analyzing ? "Analizando llamada con IA… (puede tardar 30s)" : "Analizar llamada →"}
                </button>
              </div>
            ) : (
              <div>
                {/* Situación: key points */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Situación actual</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(Array.isArray(callAnalysis.situacion) ? callAnalysis.situacion : [callAnalysis.situacion]).map((point, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: DS.bgCard, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E24B4A", flexShrink: 0, marginTop: 5 }} />
                        <span style={{ fontSize: 13, color: DS.textPrimary, lineHeight: 1.6 }}>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tráfico y conversión */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[{ label: "Tráfico", key: "trafico", dot: "#378ADD" }, { label: "Conversión", key: "conversion", dot: DS.green }].map(({ label, key, dot }) => (
                    <div key={key} style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "14px 16px", borderTop: `3px solid ${dot}` }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
                      <div style={{ fontSize: 13, color: "#444", lineHeight: 1.7 }}>{callAnalysis[key]}</div>
                    </div>
                  ))}
                </div>

                {/* Opciones */}
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <button onClick={() => setShowTranscript(s => !s)} style={{ padding: "5px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 12, color: DS.textSecondary }}>
                    {showTranscript ? "Ocultar transcripción" : "Ver transcripción"}
                  </button>
                  <button onClick={() => setCallAnalysis(null)} style={{ padding: "5px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 12, color: DS.textSecondary }}>
                    Cambiar transcripción
                  </button>
                </div>
                {showTranscript && (
                  <div style={{ marginBottom: 14, background: DS.bgCard, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: DS.textMuted, lineHeight: 1.7, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap" }}>{callTranscript}</div>
                )}
              </div>
            )}
          </>
        );
      })()}

      <div style={{ borderTop: DS.border, margin: "24px 0" }} />

      {/* ACCIONABLES UNIFICADOS */}
      {(() => {
        const callAcs = report.callAnalysis?.accionables || [];
        const metricAcs = report.recommendations || [];
        if (!callAcs.length && !metricAcs.length) return null;

        const urgColors = {
          "inmediato": { bg: "rgba(226,75,74,0.12)", color: "#E24B4A", border: "#E24B4A" },
          "esta semana": { bg: "rgba(245,166,35,0.12)", color: "#F5A623", border: "#F5A623" },
          "próxima semana": { bg: "rgba(29,185,122,0.12)", color: DS.green, border: DS.green },
        };
        const respLabels = { "trafficker": "Trafficker", "cliente": "Cliente", "ambos": "Ambos" };
        const respColors = { "trafficker": "#185FA5", "cliente": "#854F0B", "ambos": "#3B6D11" };

        const ActionCard = ({ item, index, source }) => {
          const urg = urgColors[item.urgencia] || urgColors["esta semana"];
          const title = item.titulo || item.title || "";
          const desc = item.descripcion || item.desc || "";
          return (
            <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "14px 16px", marginBottom: 8, borderLeft: `3px solid ${urg.border}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: DS.textPrimary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{index + 1}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, lineHeight: 1.4 }}>{title}</div>
              </div>
              {desc && <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.6, marginBottom: 10, paddingLeft: 32 }}>{desc}</div>}
              <div style={{ display: "flex", gap: 8, paddingLeft: 32, alignItems: "center" }}>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: urg.bg, color: urg.color }}>{item.urgencia || "esta semana"}</span>
                {item.responsable && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 500, background: DS.bgCard, color: respColors[item.responsable] || "#666" }}>{respLabels[item.responsable] || item.responsable}</span>}
                <span style={{ fontSize: 10, color: DS.textMuted, marginLeft: "auto" }}>{source}</span>
              </div>
            </div>
          );
        };

        return (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: DS.border }}>
            <div style={{ marginTop: 8 }}>
              {callAcs.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>De la llamada con el cliente</div>
                  {callAcs.map((a, i) => <ActionCard key={i} item={a} index={i} source="llamada" />)}
                </>
              )}

              {metricAcs.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, marginTop: callAcs.length ? 16 : 0 }}>De las métricas</div>
                  {metricAcs.map((a, i) => <ActionCard key={i} item={a} index={i} source="métricas" />)}
                </>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ borderTop: DS.border, margin: "24px 0" }} />

      {/* SUBREPORTES POR PRODUCTO */}
      {report.products && report.products.length > 0 && (() => {
        const sLabelP = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: DS.textMuted, marginBottom: 10 };
        return (
          <>
            <div style={{ borderTop: DS.border, margin: "24px 0" }} />
            <div style={sLabel}>Rendimiento por producto</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {report.products.map((product, pi) => {
                const pm = product.metrics;
                const pSpend = num(pm.spend);
                const pConv = num(pm.conversion);
                const pPurch = num(pm.purchases);
                const pClicks = num(pm.clicks);
                const pVisits = num(pm.pageVisits);
                const pInit = num(pm.initiatedCheckouts);
                const pRoas = pSpend && pConv ? pConv / pSpend : null;
                const pCpp = pSpend && pPurch ? pSpend / pPurch : null;
                const pCheckoutRate = pVisits && pInit ? (pInit / pVisits * 100) : null;
                const pConvRate = pInit && pPurch ? (pPurch / pInit * 100) : null;
                const obj = company.objectives || defaultObjectives;
                const roasOk = pRoas >= (obj.roasTarget || 6);
                const roasWarn = pRoas >= (obj.roasMin || 4) && pRoas < (obj.roasTarget || 6);
                return (
                  <div key={pi} style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 20px", border: DS.border }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#E6F1FB", color: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{pi + 1}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{product.name}</div>
                      {pRoas && <span style={{ marginLeft: "auto", background: roasOk ? "#EAF3DE" : roasWarn ? "#FAEEDA" : "#FCEBEB", color: roasOk ? "#3B6D11" : roasWarn ? "#854F0B" : "#A32D2D", fontSize: 13, fontWeight: 700, padding: "3px 12px", borderRadius: 20 }}>{pRoas.toFixed(2)}× ROAS</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: pCheckoutRate ? 8 : 0 }}>
                      {pPurch > 0 && <MetricCard label="Compras" value={fmt(pPurch)} sub="" status="neutral" />}
                      {pCpp && <MetricCard label="Costo por compra" value={`$${fmt(pCpp)}`} sub={`Obj: $${fmt(obj.costPerPurchaseTarget || 50000)}`} status={pCpp <= (obj.costPerPurchaseTarget || 50000) ? "ok" : pCpp <= (obj.costPerPurchaseMax || 80000) ? "warn" : "bad"} />}
                      {pConv > 0 && <MetricCard label="Conversión" value={fmtM(pConv)} sub={`Gasto: ${fmtM(pSpend)}`} status="neutral" />}
                      {pClicks > 0 && <MetricCard label="Clics" value={fmt(pClicks)} sub="" status="neutral" />}
                      {pCheckoutRate && <MetricCard label="Ida a checkout" value={`${pCheckoutRate.toFixed(1)}%`} sub={`Obj: ${obj.checkoutRateTarget || 15}%`} status={pCheckoutRate >= (obj.checkoutRateTarget || 15) ? "ok" : "warn"} />}
                      {pConvRate && <MetricCard label="Conv. checkout" value={`${pConvRate.toFixed(1)}%`} sub="" status={pConvRate >= 20 ? "ok" : "warn"} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      </details>

      {/* Footer */}
      <div className="pdf-exclude" style={{ marginTop: 32, padding: "16px 0", borderTop: DS.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src="data:image/png;base64,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PXJyWsmySogN43qBPd544w3IbNGgHWVUGu/0eLxerzcaiSpyFTUm4tiogX4Mw+Tt3ffEmMemvTR1166dqqo2adLE7/eLouhxuz0etygKPC+IomgaRmVlZWJCwrhx4z777LNJkyZBlXUdkAadicrKytauXfPGG2+sWLFC07S0tDSfz8fzvCiKbrfb5XI52xshzvTkk086U9agc8rKykaMGJGbm0tDVrEzshimqtAvLy9v9OjR99xzz2uvvebcz8iRI7OzswEPtNrZ4/G8//77L730Ek3R03ZZem0Y43feeef111931hhC+LBz5879+vVzmv00cEXtwGrfcwQCLikpafHixYFAQNM0gGRMgl1Cl35NEoEA+9tvv92rV6/hw4cfP34i1nSNaDycordp08yaphOtgmySkZ6dlYUcPAARgRdffFHXNQja2TGCQ/hk2bLvN2+mUpUQout6UlLSTTfdVK3mD/bOMLaziIoWmddKdYnUeqbH1srGVTUCiGEY2yI2YZxtm9A/Q4hN6O1UkxcgK5988slHHnkEBo04txHbCTzdRWFtWVYgEBgx4gFoLqL74Xn+1KlTI0eOLC4u5nmecpez1pDjOFVVT548GYlGYWxbOBwOhcINmuJsIw8lLb1JTuscwzBCwRCE7AKBgMfj8XhcXq/H7/dhzEqSlJiQ+Oy4ZzZu3DRjxozs7OxapyxQzcmy7OHDh159deazz457b/47Bw/kEULcbg/456Ioulwut9vt8XicniSw/siRI2+//fZIJEIzUrZtu1yuI0eO3HHHHdOmTTt69KijDBMTYh87dnTWrFeHDRsGCbnJkye/9NJL1LnNyMiYNm0aKDFn2YnX63399dd/97vfbdy4UVVVGhGEbezbt2/s2LETJkyoxn/ww4svvgg1J3TzEHfgY1RrrAH2c8MNHefMfgMxyOUSBYEXBE4QOFHkRVEQRVEQBJfLxfM8VZ62bWGM33nnrWeffdayjFWrVvXp02f69OmHDh1iYu1ZQIIgHD9+bOGihSyLwEuk22jZsiUgn+f5/gMGEEJ4joNHRohxu92rV6968MEH9u37yVkdXVlZ+d577z0/frxhGoBP4EhCSN++fbOysqhoA0bgOBZjKPlGCCGYtXghRhUVFcFgRShUKUmhSCQSjUZj5YCX2DXOJ4LK/IZScSZsAGOEOZblEMNcMp5a01RF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" alt="Inforce Consulting" style={{ height: 20, width: "auto" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: DS.textMuted }}>Reports · {new Date().toLocaleDateString("es-CO")}</div>
          <button className="no-print" onClick={printReport} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, cursor: "pointer", fontSize: 12, color: DS.textSecondary }}>
            {pdfLoading ? "..." : "↓ PDF"}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

// ── SECTION CARD ─────────────────────────────────────────────────────────────
function DarkSection({ title, children }) {
  return (
    <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

// ── DATE RANGE HELPERS ───────────────────────────────────────────────────────
// MONTHS_ES, parsePeriodDates, getReportDates, selectReportsForRange y
// distributeDaily se movieron a ./lib/reportes/reportRanges.js

// ── COMPANY STATS PANEL ──────────────────────────────────────────────────────
function CompanyStats({ company, reports }) {
  const { isDark } = useTheme();
  const today = new Date();
  const fmt8 = (d) => d.toISOString().split("T")[0];
  const d30 = new Date(today); d30.setDate(today.getDate() - 30);

  const [statsRange, setStatsRange] = useState({
    from: fmt8(d30), to: fmt8(today), label: "30 días",
  });
  const [compMode, setCompMode] = useState("auto"); // auto | year | custom | none
  const [customComp, setCustomComp] = useState({ from: "", to: "" });

  // ── Comparison range calculation ──────────────────────────────────────────
  const statsFrom = new Date(statsRange.from + "T00:00:00");
  const statsTo   = new Date(statsRange.to   + "T23:59:59");
  const durMs     = statsTo - statsFrom;
  const durDays   = Math.round(durMs / 86400000) + 1;

  let compFrom = null, compTo = null;
  if (compMode === "auto") {
    compTo   = new Date(statsFrom.getTime() - 86400000);
    compFrom = new Date(compTo.getTime()    - (durDays - 1) * 86400000);
  } else if (compMode === "year") {
    compFrom = new Date(statsFrom); compFrom.setFullYear(compFrom.getFullYear() - 1);
    compTo   = new Date(statsTo);   compTo.setFullYear(compTo.getFullYear()     - 1);
  } else if (compMode === "custom" && customComp.from && customComp.to) {
    compFrom = new Date(customComp.from + "T00:00:00");
    compTo   = new Date(customComp.to   + "T23:59:59");
  }

  // ── Daily distributions ───────────────────────────────────────────────────
  const currentData = distributeDaily(reports, statsFrom, statsTo);
  const compData    = (compFrom && compTo) ? distributeDaily(reports, compFrom, compTo) : [];

  // ── Merged chart data (aligned by position) ───────────────────────────────
  const maxLen = Math.max(currentData.length, compData.length);
  const mergedData = Array.from({ length: maxLen }, (_, i) => ({
    i,
    date:       currentData[i]?.date ?? null,
    conversion: currentData[i]?.conversion ?? null,
    spend:      currentData[i]?.spend      ?? null,
    purchases:  currentData[i]?.purchases  ?? null,
    roas:       currentData[i]?.roas       ?? null,
    cpp:        currentData[i]?.costPerPurchase ?? null,
    cConversion: compData[i]?.conversion ?? null,
    cSpend:      compData[i]?.spend      ?? null,
    cPurchases:  compData[i]?.purchases  ?? null,
    cRoas:       compData[i]?.roas       ?? null,
    cCpp:        compData[i]?.costPerPurchase ?? null,
  }));

  // ── KPI totals ────────────────────────────────────────────────────────────
  const sum  = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const curConv = sum(currentData, "conversion");
  const curSp   = sum(currentData, "spend");
  const curPur  = sum(currentData, "purchases");
  const curRoas = curSp > 0 ? curConv / curSp : null;
  const curCpp  = curPur > 0 ? curSp / curPur : null;

  const cmpConv = sum(compData, "conversion");
  const cmpSp   = sum(compData, "spend");
  const cmpPur  = sum(compData, "purchases");
  const cmpRoas = cmpSp > 0 ? cmpConv / cmpSp : null;
  const cmpCpp  = cmpPur > 0 ? cmpSp / cmpPur : null;

  const delta = (cur, cmp) => (cmp && cmp > 0) ? ((cur - cmp) / cmp) * 100 : null;
  const dConv = delta(curConv, cmpConv);
  const dSp   = delta(curSp, cmpSp);
  const dRoas = delta(curRoas, cmpRoas);
  const dPur  = delta(curPur, cmpPur);
  const dCpp  = delta(curCpp, cmpCpp);

  // ── Meta mensual (always current month) ──────────────────────────────────
  const obj = company.objectives || {};
  const revenueTarget = obj.revenueTarget || 0;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysElapsed = today.getDate();
  const daysRemaining = daysInMonth - daysElapsed;
  const monthReports = selectReportsForRange(reports, monthStart, today);
  const monthTotal = monthReports.reduce((s, r) => s + (r.conversion || 0), 0);
  const progressPct = revenueTarget > 0 ? Math.min(100, (monthTotal / revenueTarget) * 100) : 0;
  const dailyAvg = daysElapsed > 0 ? monthTotal / daysElapsed : 0;
  const dailyRequired = revenueTarget > 0
    ? Math.max(0, (revenueTarget - monthTotal) / Math.max(1, daysRemaining))
    : 0;
  const paceGap = dailyRequired > 0
    ? ((dailyAvg - dailyRequired) / dailyRequired) * 100
    : null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };
  const DeltaBadge = ({ val, invertPositive = false }) => {
    if (val === null || val === undefined) return null;
    const positive = invertPositive ? val < 0 : val > 0;
    const color = positive ? DS.green : DS.red;
    const arrow = val > 0 ? "↑" : "↓";
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 6 }}>
        {arrow} {Math.abs(val).toFixed(1)}%
      </span>
    );
  };

  const chartTooltipStyle = {
    background: isDark ? "rgba(10,10,16,0.95)" : "#FFFFFF", border: DS.border,
    borderRadius: 10, padding: "10px 14px", fontSize: 12, color: DS.textPrimary,
    boxShadow: isDark ? "none" : "0 4px 12px rgba(0,0,0,0.08)",
  };

  const CustomTooltipConv = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const cur = payload.find(p => p.dataKey === "conversion");
    const cmp = payload.find(p => p.dataKey === "cConversion");
    const dateLabel = mergedData[label]?.date ? fmtDate(mergedData[label].date) : `Día ${label + 1}`;
    return (
      <div style={chartTooltipStyle}>
        <div style={{ color: DS.textMuted, marginBottom: 6, fontSize: 10 }}>{dateLabel}</div>
        {cur?.value != null && <div style={{ color: DS.green }}>Actual: {fmtM(cur.value)}</div>}
        {cmp?.value != null && <div style={{ color: DS.textSecondary }}>Comparación: {fmtM(cmp.value)}</div>}
      </div>
    );
  };
  const MiniTooltip = (dKey, cKey, label, isCurrency = true, isPercent = false) =>
    ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const cur = payload.find(p => p.dataKey === dKey);
      const cmp = payload.find(p => p.dataKey === cKey);
      const fmtVal = v => isPercent ? `${v?.toFixed(2)}×` : isCurrency ? fmtM(v) : fmt(v);
      return (
        <div style={{ ...chartTooltipStyle, fontSize: 11 }}>
          <div style={{ color: DS.textMuted, marginBottom: 4, fontSize: 10 }}>{label}</div>
          {cur?.value != null && <div style={{ color: DS.textPrimary }}>Actual: {fmtVal(cur.value)}</div>}
          {cmp?.value != null && <div style={{ color: DS.textMuted }}>Comp: {fmtVal(cmp.value)}</div>}
        </div>
      );
    };

  const presets = [
    { label: "Hoy",     from: fmt8(today), to: fmt8(today) },
    { label: "7 días",  from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-7)),  to: fmt8(today) },
    { label: "30 días", from: fmt8(d30), to: fmt8(today) },
    { label: "Este mes",from: fmt8(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt8(today) },
    { label: "90 días", from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-90)), to: fmt8(today) },
  ];

  const sectionTitle = { fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 };
  const cardStyle = { background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "16px 18px" };
  const isMobile = useIsMobile(768);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={sectionTitle}>Estadísticas</div>

      {/* ── Period selector ─────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          {presets.map(p => {
            const active = statsRange.label === p.label;
            return (
              <button key={p.label} onClick={() => setStatsRange({ ...p })}
                style={{ padding: "5px 14px", borderRadius: 50, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  background: active ? (isDark ? "#fff" : "#2F3437") : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"), color: active ? (isDark ? "#06060A" : "#fff") : DS.textSecondary }}>
                {p.label}
              </button>
            );
          })}
          <input type="date" max={fmt8(today)} value={statsRange.from}
            onChange={e => setStatsRange(r => ({ ...r, from: e.target.value, label: `${e.target.value} – ${r.to}` }))}
            style={{ padding: "4px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 11 }} />
          <span style={{ color: DS.textMuted, fontSize: 11 }}>→</span>
          <input type="date" max={fmt8(today)} value={statsRange.to}
            onChange={e => setStatsRange(r => ({ ...r, to: e.target.value, label: `${r.from} – ${e.target.value}` }))}
            style={{ padding: "4px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 11 }} />
        </div>
        {/* Comparison selector */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: DS.textMuted, marginRight: 4 }}>Comparar con:</span>
          {[
            { key: "auto",   label: "Periodo anterior" },
            { key: "year",   label: "Mismo mes año anterior" },
            { key: "custom", label: "Personalizado" },
            { key: "none",   label: "Sin comparación" },
          ].map(opt => (
            <button key={opt.key} onClick={() => setCompMode(opt.key)}
              style={{ padding: "3px 10px", borderRadius: 50, border: `1px solid ${compMode === opt.key ? (isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)") : DS.textHint}`,
                background: compMode === opt.key ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)") : "transparent",
                color: compMode === opt.key ? DS.textPrimary : DS.textSecondary, cursor: "pointer", fontSize: 10, fontWeight: compMode === opt.key ? 700 : 500 }}>
              {opt.label}
            </button>
          ))}
          {compMode === "custom" && (
            <>
              <input type="date" max={fmt8(today)} value={customComp.from}
                onChange={e => setCustomComp(c => ({ ...c, from: e.target.value }))}
                style={{ padding: "3px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 10 }} />
              <span style={{ color: DS.textMuted, fontSize: 10 }}>→</span>
              <input type="date" max={fmt8(today)} value={customComp.to}
                onChange={e => setCustomComp(c => ({ ...c, to: e.target.value }))}
                style={{ padding: "3px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 10 }} />
            </>
          )}
        </div>
      </div>

      {/* ── Main dashboard: chart + KPIs ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: 16, marginBottom: 20 }}>
        {/* Left: Ventas chart */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Ventas del período</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: DS.green, marginBottom: 12 }}>{fmtM(curConv)}<DeltaBadge val={dConv} /></div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gcur" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={DS.green} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={DS.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gcmp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)"} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"} vertical={false} />
              <XAxis dataKey="i" tickLine={false} axisLine={false}
                tick={{ fontSize: 9, fill: DS.textMuted }}
                tickFormatter={i => mergedData[i]?.date ? fmtDate(mergedData[i].date) : ""}
                interval={Math.floor(maxLen / 5)} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: DS.textMuted }} tickFormatter={fmtM} width={48} />
              <Tooltip content={<CustomTooltipConv />} />
              {compMode !== "none" && compData.length > 0 && (
                <Area type="monotone" dataKey="cConversion" stroke={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"} strokeWidth={1.5} strokeDasharray="5 3" fill="url(#gcmp)" dot={false} connectNulls={false} />
              )}
              <Area type="monotone" dataKey="conversion" stroke={DS.green} strokeWidth={2} fill="url(#gcur)" dot={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: KPI cards 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Gasto */}
          <div style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600, marginBottom: 4 }}>Gasto</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: DS.amber }}>{fmtM(curSp)}</div>
            <DeltaBadge val={dSp} invertPositive />
          </div>
          {/* ROAS */}
          <div style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600, marginBottom: 4 }}>ROAS</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: DS.blue }}>{curRoas ? `${curRoas.toFixed(2)}×` : "—"}</div>
            <DeltaBadge val={dRoas} />
          </div>
          {/* Compras */}
          <div style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600, marginBottom: 4 }}>Compras</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#a78bfa" }}>{curPur > 0 ? fmt(Math.round(curPur)) : "—"}</div>
            <DeltaBadge val={dPur} />
          </div>
          {/* Costo/compra */}
          <div style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600, marginBottom: 4 }}>Costo/compra</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: DS.red }}>{curCpp ? fmtM(curCpp) : "—"}</div>
            <DeltaBadge val={dCpp} invertPositive />
          </div>
        </div>
      </div>

      {/* ── Campañas del período ──────────────────────────────────────────── */}
      {(() => {
        const reportWithCampaigns = reports
          .filter(r => r.campaigns && r.campaigns.length > 0)
          .filter(r => {
            const rd = getReportDates(r);
            if (!rd) return false;
            return rd.from <= statsTo && rd.to >= statsFrom;
          })
          .sort((a, b) => new Date(b.createdAt || b.dateTo || 0) - new Date(a.createdAt || a.dateTo || 0))[0];

        if (!reportWithCampaigns) return null;
        const camps = reportWithCampaigns.campaigns;

        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...sectionTitle, marginBottom: 10 }}>Campañas del período</div>
            <CampaignsAdsViewer report={reportWithCampaigns} objectives={company.objectives || defaultObjectives} />
          </div>
        );
      })()}
    </div>
  );
}

// ── EDIT REPORT FORM ─────────────────────────────────────────────────────────
function EditReportForm({ company, report, onSave, onCancel, onDelete }) {
  const { isDark } = useTheme();
  const mask = useCompanyMask();
  const today = new Date();
  const fmt8 = (d) => d.toISOString().split("T")[0];

  // Pre-fill date range from report
  const initialFrom = report.dateFrom || fmt8(today);
  const initialTo   = report.dateTo   || fmt8(today);
  const initialLabel = report.period  || "";

  const [dateRange, setDateRange] = useState({ from: initialFrom, to: initialTo, label: initialLabel });
  const [editType, setEditType] = useState(report.type || null);
  const [editSections, setEditSections] = useState(() => {
    const s = report.sections || {};
    return report.type === "horas" ? migrateHorasSections(s) : s;
  });
  const [editNotasCopy, setEditNotasCopy] = useState(report.notasCopy || "");

  // Pre-fill metrics — convert back from raw numbers
  const fmtN = (n) => (!n || isNaN(n)) ? "" : Math.round(n).toLocaleString("es-CO");
  const [metrics, setMetrics] = useState({
    spend:               fmtN(report.spend),
    conversion:          fmtN(report.conversion),
    clicks:              fmtN(report.clicks),
    impressions:         fmtN(report.impressions),
    reach:               fmtN(report.reach),
    pageVisits:          fmtN(report.pageVisits),
    initiatedCheckouts:  fmtN(report.initiatedCheckouts),
    purchases:           fmtN(report.purchases),
  });

  const setM = (k, v) => setMetrics(m => ({ ...m, [k]: v }));

  const handleSave = () => {
    const updated = {
      ...report,
      period:              dateRange.label || `${dateRange.from} – ${dateRange.to}`,
      dateFrom:            dateRange.from,
      dateTo:              dateRange.to,
      spend:               num(metrics.spend),
      conversion:          num(metrics.conversion),
      clicks:              num(metrics.clicks),
      impressions:         num(metrics.impressions),
      reach:               num(metrics.reach),
      pageVisits:          num(metrics.pageVisits),
      initiatedCheckouts:  num(metrics.initiatedCheckouts),
      purchases:           num(metrics.purchases),
      type:                editType || undefined,
      sections:            editType ? editSections : undefined,
      notasCopy:           editNotasCopy.trim() || undefined,
      // Preserva los totales del CSV guardados originalmente (para reconciliación)
      csvPurchases:        report.csvPurchases,
      csvConversion:       report.csvConversion,
    };
    onSave(updated);
  };

  const inp = (label, key, ph = "") => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 3 }}>{label}</label>
      <input
        value={metrics[key]}
        onChange={e => setM(key, e.target.value)}
        onBlur={e => {
          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
          const n = parseFloat(raw);
          if (!isNaN(n)) setM(key, Math.round(n).toLocaleString("es-CO"));
        }}
        placeholder={ph}
        style={{ ...darkInput }} />
    </div>
  );

  const sLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, marginBottom: 12 };

  return (
    <div style={{ fontFamily: DS.font, background: DS.bg, minHeight: "100vh", color: DS.textPrimary, position: "relative" }}>
      {!isDark && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.8 }} />}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 80px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, paddingBottom: 20, borderBottom: DS.border }}>
          <button onClick={onCancel} style={{ ...darkBtnGhost, padding: "6px 12px", fontSize: 12 }}>← Volver</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Editar reporte — {mask.name(company.name, company.id)}</div>
            <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 2 }}>Modifica el periodo y las métricas del reporte</div>
          </div>
        </div>

        {/* Tipo de reporte */}
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 16 }}>
          <div style={sLabel}>Tipo de reporte</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[null, ...Object.keys(REPORT_TYPES)].map(key => {
              const t = key ? REPORT_TYPES[key] : null;
              const isSelected = editType === key;
              return (
                <button key={String(key)} onClick={() => { setEditType(key); if (!key) setEditSections({}); }}
                  style={{ padding: "6px 14px", borderRadius: 50, border: `1px solid ${isSelected ? (t?.color || DS.textMuted) : DS.textHint}`, background: isSelected ? (t?.color || DS.textMuted) + (key ? "22" : "") : "transparent", color: isSelected ? (t?.color || DS.textPrimary) : DS.textSecondary, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: DS.font }}>
                  {key ? `${t.emoji} ${t.label}` : "Sin tipo (legacy)"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Periodo */}
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 16 }}>
          <div style={sLabel}>Periodo del reporte</div>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Métricas primarias */}
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 16 }}>
          <div style={sLabel}>Métricas primarias</div>

          {/* Banner: compras y conversión vienen de Shopify */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(55,138,221,0.06)", border: "1px solid rgba(55,138,221,0.2)", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#7FB8E8" }}>
            <span>💡</span>
            <span>Compras y valor de conversión: datos de Shopify</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            {inp("Gasto (COP)", "spend", "ej: 2.870.000")}
            {inp("Valor de conversión (COP)", "conversion", "desde Shopify")}
            {inp("Compras", "purchases", "desde Shopify")}
            {inp("Clics en el enlace", "clicks", "ej: 1.240")}
          </div>

          {/* Reconciliación Meta ↔ Shopify si el reporte tiene csvPurchases/csvConversion guardados */}
          {(report.csvPurchases > 0 || report.csvConversion > 0) && (() => {
            const csvP = report.csvPurchases || 0;
            const csvC = report.csvConversion || 0;
            const shopifyP = num(metrics.purchases);
            const shopifyC = num(metrics.conversion);
            const diffP = shopifyP - csvP;
            const diffC = shopifyC - csvC;
            const match = Math.abs(diffP) < 0.5 && Math.abs(diffC) < 1;
            if (match) {
              return (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(29,185,122,0.08)", border: "1px solid rgba(29,185,122,0.25)", borderRadius: 8, fontSize: 11, color: DS.green, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✓</span>
                  <span>Meta y Shopify coinciden ({csvP} compras · {fmtM(csvC)})</span>
                </div>
              );
            }
            const positive = diffP > 0 || diffC > 0;
            const col = positive ? DS.green : DS.amber;
            const label = positive ? "No rastreadas por Meta" : "Superpuestas / doble conteo";
            const arrow = positive ? "+" : "−";
            return (
              <div style={{ marginTop: 12, padding: "12px 14px", background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: col }}>
                  <span>⚖</span> Reconciliación Meta ↔ Shopify
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1.1fr", gap: 6, fontSize: 11 }}>
                  <div style={{ color: DS.textMuted }}></div>
                  <div style={{ color: DS.textMuted, textAlign: "right" }}>Compras</div>
                  <div style={{ color: DS.textMuted, textAlign: "right" }}>Valor conversión</div>

                  <div style={{ color: DS.textSecondary }}>📊 Meta (CSV)</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{csvP}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{fmtM(csvC)}</div>

                  <div style={{ color: DS.textSecondary }}>🛒 Shopify</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{shopifyP || "—"}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary }}>{shopifyC ? fmtM(shopifyC) : "—"}</div>

                  <div style={{ color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow} {label}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow}{Math.abs(diffP)}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: col, fontWeight: 700, borderTop: `1px dashed ${col}55`, paddingTop: 6 }}>{arrow}{fmtM(Math.abs(diffC))}</div>

                  <div style={{ color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>TOTAL REAL</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>{shopifyP}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", color: DS.textPrimary, fontWeight: 800, borderTop: `2px solid ${col}`, paddingTop: 6, fontSize: 12 }}>{fmtM(shopifyC)}</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Métricas secundarias */}
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 24 }}>
          <div style={sLabel}>Métricas secundarias</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            {inp("Impresiones", "impressions", "ej: 84.000")}
            {inp("Alcance", "reach", "ej: 62.000")}
            {inp("Visitas a la página", "pageVisits", "ej: 980")}
            {inp("Pagos iniciados", "initiatedCheckouts", "ej: 120")}
          </div>
        </div>

        {/* Secciones de análisis según tipo */}
        {editType && REPORT_TYPES[editType] && (
          <div style={{ background: DS.bgCard, border: `1px solid ${REPORT_TYPES[editType].color}33`, borderRadius: DS.radius, padding: "20px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: REPORT_TYPES[editType].color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{REPORT_TYPES[editType].emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: REPORT_TYPES[editType].color }}>Análisis — {REPORT_TYPES[editType].label}</div>
            </div>
            {REPORT_TYPES[editType].sections.map(sec => (
              <div key={sec.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 4, fontWeight: 600 }}>{sec.title}</label>
                <textarea
                  value={editSections[sec.key] || ""}
                  onChange={e => setEditSections(s => ({ ...s, [sec.key]: e.target.value }))}
                  placeholder={sec.ph}
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: DS.radiusSm, border: DS.border, fontSize: 13, boxSizing: "border-box", background: DS.bgCard, color: DS.textPrimary, outline: "none", fontFamily: DS.font, resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Notas para copy (editable) */}
        <div style={{ background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: DS.radius, padding: "20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(244,63,94,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📝</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F43F5E" }}>Notas para copy</div>
          </div>
          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>
            Datos útiles para el equipo de copy (independiente del análisis de tráfico).
          </div>
          <textarea
            value={editNotasCopy}
            onChange={e => setEditNotasCopy(e.target.value)}
            placeholder="ej. El formato testimonial está rindiendo muy bien. Probar variaciones 'antes/después'. Los anuncios cortos convierten mejor."
            rows={5}
            style={{ width: "100%", padding: "10px 12px", borderRadius: DS.radiusSm, border: "1px solid rgba(244,63,94,0.25)", fontSize: 13, boxSizing: "border-box", background: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)", color: DS.textPrimary, outline: "none", fontFamily: DS.font, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>

        {/* Botones */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={handleSave} style={{ ...darkBtn, padding: "12px 28px", fontSize: 14 }}>
            Guardar cambios
          </button>
          <button onClick={onCancel} style={{ ...darkBtnGhost, padding: "12px 20px", fontSize: 14 }}>
            Cancelar
          </button>
          {onDelete && (
            <button
              onClick={() => { if (window.confirm(`¿Eliminar el reporte "${report.period}"? Esta acción no se puede deshacer.`)) onDelete(report); }}
              style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,80,80,0.35)", borderRadius: DS.radius, color: "#ff6b6b", cursor: "pointer", fontSize: 13, padding: "12px 20px", fontFamily: DS.font }}>
              Eliminar reporte
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function InforceReports() {
  const { isDark, toggleTheme } = useTheme();
  // Mask de empresa — modo censurar para grabar tutoriales sin exponer nombres
  // reales. mask.name(name, key) devuelve "Cliente X" si está ON. DEBE estar
  // acá arriba (antes de cualquier early return) — es un hook (useContext).
  const mask = useCompanyMask();
  const [appData, setAppData] = useState({ companies: [] });
  const [view, setView] = useState("home");
  // Con qué brief y etapa tiene que abrir el Content Pipeline cuando se llega
  // desde una tarea. Va por estado y no por URL para que el salto sea instantáneo
  // —una recarga acá cuesta volver a autenticar—; el pipeline igual sabe leerlo
  // de la URL, que es como llegan los links de las notificaciones.
  const [pipelineFocus, setPipelineFocus] = useState(null);   // { briefId, etapa }
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const emptyCompanyObj = { roasMin: "", roasTarget: "", costPerPurchaseMax: "", costPerPurchaseTarget: "", revenueActual: "", revenueTarget: "", cpm: "", cpcTarget: "", ctrTarget: "", pageLoadMin: "", checkoutRateTarget: "", costPerInitiatedTarget: "", checkoutConversionTarget: "" };
  const [newCompanyObj, setNewCompanyObj] = useState({ ...emptyCompanyObj });
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [dashboardRange, setDashboardRange] = useState(null); // null = último reporte | {from, to, label}
  const [showCredentials, setShowCredentials] = useState(false); // toggle PIN + link visibility
  const [showCompanyDetails, setShowCompanyDetails] = useState(false); // toggle objetivos + último reporte
  const [privacyMode, setPrivacyMode] = useState(false); // censurar nombres y métricas para grabaciones
  const [reportType, setReportType] = useState(null); // tipo seleccionado al crear reporte
  // Toggle para ver empresas archivadas en panel general (default ocultas).
  // Empresas archivadas: visual decluttering — no afectan métricas globales,
  // solo aparecen cuando se activa el toggle.
  const [showArchivedHome, setShowArchivedHome] = useState(false);

  // ── AUTH STATE ──────────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState(null);   // null=loading | "admin" | "client" | "pin_admin" | "pin_client"
  const [clientSlug, setClientSlug] = useState(null);
  const [pinError, setPinError] = useState("");
  // Empresas a las que el user actual tiene acceso (modo cliente).
  // Para admin = []. Para cliente con N empresas = N items.
  // Permite el switcher de empresas en el sidebar del CompanyWorkspace.
  const [accessibleCompanies, setAccessibleCompanies] = useState([]);
  // currentMember: si está seteado, el usuario es un colaborador (no dueño) con
  // restricciones de rol. Null = admin o dueño de empresa (acceso completo).
  const [currentMember, setCurrentMember] = useState(null);
  // Mi fila en el equipo de ESTA empresa, SOLO para personalizar —hoy, el default
  // de "mis tareas" en el Centro de Tareas.
  //
  // Va aparte de `currentMember` a propósito: un admin de Inforce entra a un
  // cliente con `currentMember = null` para conservar acceso total (si se le
  // poblara, `allowedNavForMember` le recortaría el menú a los roles de su fila).
  // Pero igual quiere abrir Tareas y ver lo suyo. Esto responde "quién soy acá"
  // sin tocar "qué puedo ver".
  const [miMiembro, setMiMiembro] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  // dataLoaded se pone en true ANTES del await (para evitar doble-fetch), así que
  // NO representa "empresas ya cargadas". companiesLoaded sí: se activa recién
  // cuando la fetch resuelve. Sirve para no flashear el home vacío ("No hay
  // empresas aún") mientras carga, antes de resolver la ruta a un workspace.
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  // Entró bien, tiene empresas, pero están todas archivadas. Es un estado
  // distinto de "no encontramos tu empresa" y merece otro mensaje: acá no hay
  // nada que reintentar.
  const [soloArchivadas, setSoloArchivadas] = useState(false);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  // Despliegue: el admin ve por defecto la MISMA vista cliente (rediseñada) que
  // ven los clientes; entra a la vista de edición (canvas) con el botón "Editar".
  const [despliegueAdminEdit, setDespliegueAdminEdit] = useState(false);
  // "Ver como cliente": simular la pantalla del cliente estando adentro con
  // permisos. Antes esto se leía del parámetro `?preview=cliente` en cada render
  // y no se podía apagar sin navegar; ahora es estado y el parámetro solo lo
  // inicializa, para que los links viejos sigan sirviendo.
  const [verComoCliente, setVerComoCliente] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("preview") === "cliente"; }
    catch { return false; }
  });
  const isMobile = useIsMobile(768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // ?focus=1 → modo sin sidebar, usado cuando admin abre el workspace desde
  // Inforce Central y quiere foco total en una sola empresa.
  const focusMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("focus") === "1";

  // ── URL ROUTING ─────────────────────────────────────────────────────────
  // Zona cliente → URLs bajo /cliente/:slug/...
  // Zona admin   → URLs bajo /admin/:slug/... (home en /admin o /)
  // main.jsx aplica redirects de compat antes de montar, así que acá
  // podemos asumir que la URL ya está en forma canónica (salvo la home "/").
  const pendingRouteRef = useRef(null);
  const isPopstateRef = useRef(false);
  const getSlug = (c) => c?.slug || c?.name?.toLowerCase().replace(/\s+/g, "-") || "";

  const pathPrefix = (mode) => (mode === "client" || mode === "pin_client") ? "/cliente" : "/admin";

  // Parsea un pathname en { slug, action, reportId }. Acepta prefix
  // /cliente o /admin, y como fallback tolera paths legacy sin prefix.
  const PUBLIC_LANDING_ROUTES = new Set(["signup", "login", "forgot-password", "onboarding", "app", "debug"]);

  const parsePath = (path) => {
    const parts = String(path || "/").split("/").filter(Boolean);
    // Rutas públicas del landing — nunca tratarlas como slugs de empresa.
    if (parts.length === 1 && PUBLIC_LANDING_ROUTES.has(parts[0])) {
      return { prefix: null, slug: null, action: "public", publicPath: `/${parts[0]}` };
    }
    // `/brief/<token>` — hoja de rodaje pública, sin sesión.
    if (parts[0] === "brief") {
      return { prefix: null, slug: null, action: "public", publicPath: path };
    }
    let prefix = null;
    if (parts[0] === "cliente" || parts[0] === "admin") {
      prefix = parts.shift();
    }
    if (parts.length === 0) return { prefix, slug: null, action: "home" };
    if (prefix === "admin" && parts[0] === "nueva-empresa") {
      return { prefix, slug: null, action: "newCompany" };
    }
    // Legacy sin prefix: /nueva-empresa también cuenta.
    if (!prefix && parts[0] === "nueva-empresa") {
      return { prefix: null, slug: null, action: "newCompany" };
    }
    const slug = parts[0];
    const sub = parts[1];
    if (sub === "reporte" && parts[2]) return { prefix, slug, action: "viewReport", reportId: parts[2] };
    if (sub === "editar" && parts[2]) return { prefix, slug, action: "editReport", reportId: parts[2] };
    if (sub === "tipo-reporte") return { prefix, slug, action: "selectReportType" };
    if (sub === "nuevo-reporte") return { prefix, slug, action: "newReport" };
    if (sub === "editar-empresa") return { prefix, slug, action: "editCompany" };
    if (sub === "despliegue") return { prefix, slug, action: "despliegue" };
    if (sub === "pipeline") return { prefix, slug, action: "pipeline" };
    if (sub === "control") return { prefix, slug, action: "control" };
    if (sub === "bibliotecas-anuncios") return { prefix, slug, action: "adlibrary" };
    if (sub === "crear-imagenes") return { prefix, slug, action: "crear-imagenes" };
    // Sin esto ningún link puede apuntar a Tareas: el de las notificaciones que
    // arma el Content Pipeline aterrizaba en Resumen.
    if (sub === "tareas") return { prefix, slug, action: "tareas" };
    return { prefix, slug, action: "company" };
  };

  // Construye pathname canónico para (view, company, report, authMode).
  const buildPath = (v, company, report, mode) => {
    const prefix = pathPrefix(mode);
    const slug = getSlug(company);
    if (v === "newCompany") return "/admin/nueva-empresa";
    if (v === "home") return prefix === "/admin" ? "/admin" : "/";
    if (v === "company" && slug) return `${prefix}/${slug}`;
    if (v === "viewReport" && slug && report) return `${prefix}/${slug}/reporte/${report.id}`;
    if (v === "editReport" && slug && report) return `${prefix}/${slug}/editar/${report.id}`;
    if (v === "selectReportType" && slug) return `${prefix}/${slug}/tipo-reporte`;
    if (v === "newReport" && slug) return `${prefix}/${slug}/nuevo-reporte`;
    if (v === "editCompany" && slug) return `${prefix}/${slug}/editar-empresa`;
    if (v === "despliegue" && slug) return `${prefix}/${slug}/despliegue`;
    if (v === "pipeline" && slug) return `${prefix}/${slug}/pipeline`;
    if (v === "control" && slug) return `${prefix}/${slug}/control`;
    if (v === "adlibrary" && slug) return `${prefix}/${slug}/bibliotecas-anuncios`;
    if (v === "crear-imagenes" && slug) return `${prefix}/${slug}/crear-imagenes`;
    if (v === "tareas" && slug) return `${prefix}/${slug}/tareas`;
    return prefix === "/admin" ? "/admin" : "/";
  };

  // Detect URL mode + check session on mount.
  //
  // FIX SEGURIDAD (2026-04-28): antes confiabamos ciegamente en el flag
  // localStorage `inforce_auth`. Eso permitía que cualquiera hiciera
  // `localStorage.setItem("inforce_auth", "client:slug-x")` y entrara al
  // workspace sin saber el PIN. Ahora SIEMPRE validamos contra DB que la
  // resource asociada al token aún existe (company para client, member para
  // colaborador). Si no, limpiamos el localStorage y forzamos login.
  useEffect(() => {
    const path = window.location.pathname;
    const parts = path.split("/").filter(Boolean);
    const prefix = parts[0];
    let cancelled = false;

    const clearClientAuth = () => {
      try { localStorage.removeItem("inforce_auth"); } catch {}
      try { localStorage.removeItem("inforce_member_id"); } catch {}
    };

    const resolveAuth = async () => {
      // `isAdminPreview` se apaga acá, al empezar, y solo la rama del equipo de
      // Inforce la vuelve a prender. Es un HECHO derivado de quién entró, no un
      // pestillo: mientras solo pintaba un link de vuelta daba igual que quedara
      // puesta, pero de acá en más decide permisos. Sin este reset, un admin que
      // cierra sesión en /cliente/<empresa> y deja que entre un cliente en la
      // misma pantalla —logout no recarga la página— le regalaría sus permisos.
      setIsAdminPreview(false);

      // Rutas públicas del landing — no resolver auth de cliente/admin acá.
      // El render se encarga vía interceptación del path.
      const PUBLIC_KEYS = ["signup", "login", "forgot-password", "onboarding", "app", "debug"];
      if ((parts.length === 1 && PUBLIC_KEYS.includes(parts[0])) || parts[0] === "brief") {
        setAuthMode("public");
        return;
      }
      // /cliente/signup, /cliente/login, etc. → redirect a la ruta pública.
      // Esto cubre links viejos / autocompletado / typos.
      if (prefix === "cliente" && parts[1] && PUBLIC_KEYS.includes(parts[1])) {
        window.location.replace(`/${parts[1]}`);
        return;
      }
      // Lo mismo para /admin/<ruta-pública>.
      if (prefix === "admin" && parts[1] && PUBLIC_KEYS.includes(parts[1])) {
        window.location.replace(`/${parts[1]}`);
        return;
      }
      if (prefix === "cliente" && parts[1]) {
        const slug = parts[1];
        setClientSlug(slug);
        const saved = localStorage.getItem("inforce_auth");
        const memberId = localStorage.getItem("inforce_member_id");

        const sessionRes = await getSessionSinBloquear();
        if (cancelled) return;
        const hasSession = !!sessionRes?.data?.session;

        // SEGURIDAD CRÍTICA (fix 2026-05-22): antes cualquier sesión Supabase
        // daba "preview admin" a CUALQUIER /cliente/<slug>, lo cual permitía
        // que un signup self-service navegara a cualquier empresa y viera
        // todos sus datos. Ahora validamos el rol vía resolveUserAccess.
        if (hasSession && saved !== `client:${slug}`) {
          const access = await resolveUserAccess(sessionRes.data.session);
          if (access?.soloArchivadas) setSoloArchivadas(true);
          if (cancelled) return;

          if (access.role === "admin") {
            // Inforce team → preview admin de cualquier cliente (by design).
            setIsAdminPreview(true);
            setAuthMode("client");
            return;
          }

          // Cliente con sesión: ¿este slug está en sus empresas accesibles?
          const slugMatch = access.companies.find((c) => slugifyCompany(c) === slug);
          if (slugMatch) {
            setAccessibleCompanies(access.companies);
            // Poblar currentMember (dueño o colaborador). Sin esto el dueño
            // auto-registrado entra con currentMember=null y sin permisos de
            // gestión (productos, conceptos, guionista, simulador).
            const member = await resolveClientMember(slugMatch, sessionRes.data.session.user);
            if (cancelled) return;
            setCurrentMember(member);
            setAuthMode("client");
            return;
          }

          // Tiene sesión pero NO acceso a este slug. Si tiene OTRA empresa,
          // redirigir a esa. Si no, cerrar sesión.
          if (access.companies.length > 0) {
            const targetSlug = slugifyCompany(access.companies[0]);
            window.location.replace(`/cliente/${targetSlug}`);
            return;
          }
          try { await database.auth.signOut(); } catch {}
          setAuthMode("pin_client");
          return;
        }

        if (saved === `client:${slug}`) {
          // Validar que la company del slug existe — si no, el localStorage
          // está corrupto o spoofeado.
          const { data: company } = await database
            .from("companies")
            .select("id, slug, name")
            .or(`slug.eq.${slug},name.eq.${slug}`)
            .maybeSingle()
            .catch(() => ({ data: null }));
          if (cancelled) return;

          if (!company) {
            clearClientAuth();
            setAuthMode("pin_client");
            return;
          }

          // Si tiene memberId, validar que el member exista en esa company
          // específica (defiende contra ID prestado de otra empresa).
          let memberEmail = null;
          if (memberId) {
            const { data: member } = await database
              .from("company_team_members")
              .select("*")
              .eq("id", memberId)
              .eq("company_id", company.id)
              .maybeSingle()
              .catch(() => ({ data: null }));
            if (cancelled) return;
            if (!member) {
              // Member no encontrado o de otra empresa — invalid token.
              clearClientAuth();
              setAuthMode("pin_client");
              return;
            }
            setCurrentMember(member);
            memberEmail = member.email || null;
          } else {
            // Sin memberId ⇒ es el DUEÑO (los colaboradores siempre guardan
            // memberId al loguearse). Poblar currentMember como owner para
            // desbloquear su gestión (productos, conceptos, guionista, simulador).
            const ownerMember = await resolveClientMember(
              company, sessionRes?.data?.session?.user || null, { assumeOwner: true }
            );
            if (cancelled) return;
            setCurrentMember(ownerMember);
            memberEmail = ownerMember?.email || null;
          }

          // Cargar otras empresas accesibles vía email para el switcher.
          // El owner (sin memberId) usa el company.email.
          const lookupEmail = memberEmail || company.email || null;
          const lookupSession = sessionRes?.data?.session || null;
          if (lookupEmail || lookupSession) {
            loadAccessibleCompaniesByEmail(lookupEmail, lookupSession)
              .then((cs) => { if (!cancelled) setAccessibleCompanies(cs); })
              .catch(() => {});
          }

          setAuthMode("client");
          return;
        }

        // Sin localStorage y sin sesión → pedir credenciales.
        setAuthMode("pin_client");
        return;
      }

      // ── Zona admin / root ───────────────────────────────────────────────
      // SEGURIDAD CRÍTICA: tener una sesión Supabase NO basta para ser admin.
      // (Antes el flujo era "session válida → setAuthMode('admin')" lo que
      // permitía que cualquier signup self-service ganara admin global con
      // solo navegar a /admin — fuga cross-tenant. Ver incidente 2026-05-21.)
      //
      // Política nueva:
      //   1. Si hay session Y el user.id existe en team_members → admin.
      //   2. Si hay session pero NO está en team_members → es un cliente.
      //      Buscamos `companies.owner_user_id = user.id` y redirigimos a
      //      /cliente/<su-slug> (su propia empresa). Sin info leak.
      //   3. Si no tiene ni team_member ni company propia → limpiamos sesión
      //      y mostramos login admin (PIN). No tiene a dónde ir.
      //   4. Sin session → login admin normal (PIN).
      const sessionRes = await getSessionSinBloquear();
      if (cancelled) return;

      if (sessionRes?.data?.session) {
        const access = await resolveUserAccess(sessionRes.data.session);
          if (access?.soloArchivadas) setSoloArchivadas(true);
        if (cancelled) return;

        if (access.role === "admin") {
          localStorage.setItem("inforce_auth", "admin");
          setAuthMode("admin");
          return;
        }

        if (access.role === "client" && access.companies.length > 0) {
          const slug = slugifyCompany(access.companies[0]);
          if (slug) {
            try { localStorage.removeItem("inforce_auth"); } catch {}
            window.location.replace(`/cliente/${slug}`);
            return;
          }
        }

        // Sesión válida sin perfil ni empresa → kick out.
        try { localStorage.removeItem("inforce_auth"); } catch {}
        try { await database.auth.signOut(); } catch {}
        setAuthMode("pin_admin");
        return;
      }

      // 4) Sin session Supabase válida → siempre login. Limpiamos cache stale.
      try { localStorage.removeItem("inforce_auth"); } catch {}
      setAuthMode("pin_admin");
    };

    // Red de seguridad: `authMode` no puede quedarse en null para siempre.
    //
    // Mientras es null la pantalla muestra el spinner de marca. Si algo de
    // acá adentro no resuelve —una consulta colgada, un candado de sesión que
    // otra pestaña no soltó— el cliente se queda mirando girar la rueda sin
    // nada que hacer. Ya nos pasó. A los 10 segundos se corta y se pide login,
    // que es una pantalla con la que uno PUEDE hacer algo.
    //
    // No reemplaza a los arreglos de fondo: los tapa cuando fallan.
    const salvavidas = setTimeout(() => {
      if (cancelled) return;
      setAuthMode((actual) => {
        if (actual !== null) return actual;
        logger.warn("[auth] la sesión no resolvió en 10s — mostrando login");
        return prefix === "cliente" ? "pin_client" : "pin_admin";
      });
    }, 10000);

    resolveAuth()
      .catch(() => {
        if (cancelled) return;
        setAuthMode(prefix === "cliente" ? "pin_client" : "pin_admin");
      })
      .finally(() => clearTimeout(salvavidas));

    // Store pending route for resolution after data loads.
    // Excluimos rutas públicas — éstas se manejan vía interceptación del path
    // y NO deben quedar como "pending" para no contaminar resolveRoute después.
    const isPublicRoute = parts[0] === "brief" || (parts.length === 1 && (
      parts[0] === "signup" || parts[0] === "login" ||
      parts[0] === "forgot-password" || parts[0] === "onboarding" ||
      parts[0] === "app" || parts[0] === "debug"
    ));
    if (path && path !== "/" && path !== "/admin" && !isPublicRoute) {
      pendingRouteRef.current = path;
    }

    return () => { cancelled = true; clearTimeout(salvavidas); };
  }, []);

  // Sync URL ← state (push new URLs when view changes)
  useEffect(() => {
    if (authMode !== "admin" && authMode !== "client") return;
    if (isPopstateRef.current) { isPopstateRef.current = false; return; }

    const target = buildPath(view, selectedCompany, selectedReport, authMode);
    // Preservar ?focus=1 y demás query params entre navegaciones internas.
    const currentSearch = window.location.search || "";
    const full = target + currentSearch;
    if (window.location.pathname !== target) {
      window.history.pushState({ view }, "", full);
    }
  }, [view, selectedCompany?.id, selectedReport?.id, authMode]);

  // Handle browser back/forward
  useEffect(() => {
    const resolveRoute = (path, companies) => {
      const { slug, action, reportId } = parsePath(path);
      if (action === "newCompany") {
        setSelectedCompany(null); setSelectedReport(null); setView("newCompany"); return;
      }
      if (action === "home" || !slug) {
        setView("home"); setSelectedCompany(null); setSelectedReport(null); return;
      }
      const found = companies.find(c => getSlug(c) === slug);
      if (!found) { setView("home"); return; }
      setSelectedCompany(found);
      if ((action === "viewReport" || action === "editReport")) {
        const report = found.reports?.find(r => String(r.id) === String(reportId));
        if (report) { setSelectedReport(report); setView(action); }
        else setView("company");
      } else if (action === "selectReportType") setView("selectReportType");
      else if (action === "newReport") setView("newReport");
      else if (action === "editCompany") setView("editCompany");
      else if (action === "despliegue") setView("despliegue");
      else if (action === "pipeline") setView("pipeline");
      else if (action === "control") setView("control");
      else if (action === "adlibrary") setView("adlibrary");
      else if (action === "crear-imagenes") setView("crear-imagenes");
      else if (action === "tareas") setView("tareas");
      else setView("company");
    };

    const handlePop = () => {
      isPopstateRef.current = true;
      resolveRoute(window.location.pathname, appData.companies);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [appData.companies]);

  // Quién soy dentro del equipo de esta empresa. Si ya hay `currentMember`
  // (colaborador o dueño) es ese; si no —el admin en preview— se busca la fila
  // por su sesión. Sin fila queda en null y el tablero abre mostrando todo, que
  // es lo correcto para alguien que mira de afuera.
  useEffect(() => {
    if (currentMember) { setMiMiembro(currentMember); return undefined; }
    if (!selectedCompany) { setMiMiembro(null); return undefined; }
    let cancelado = false;
    (async () => {
      const res = await getSessionSinBloquear();
      const user = res?.data?.session?.user;
      if (!user) { if (!cancelado) setMiMiembro(null); return; }
      const m = await resolveClientMember(selectedCompany, user).catch(() => null);
      if (!cancelado) setMiMiembro(m || null);
    })();
    return () => { cancelado = true; };
  }, [currentMember, selectedCompany]);

  // Guard: si hay un colaborador logueado y el view que intenta abrir no está
  // en su whitelist, lo mandamos a home automáticamente.
  // (Definido antes de cualquier early return para respetar reglas de hooks.)
  useEffect(() => {
    if (!currentMember) return;
    // `plan` faltaba: el menú lo ocultaba pero la URL entraba igual.
    const guarded = ["reportes","pipeline","despliegue","adlibrary","crear-imagenes","control","plan","tareas","agenda","equipo","papelera"];
    if (guarded.includes(view) && !memberCanAccess(currentMember, view)) {
      setView("company");
    }
  }, [currentMember, view]);

  // Load companies from Supabase once authenticated.
  // CACHE stale-while-revalidate: navegar a una empresa hace un reload completo,
  // que antes refetcheaba TODAS las empresas + TODO su historial cada vez (lento).
  // Ahora hidratamos desde localStorage al instante (empresa/tablero aparece ya)
  // y refrescamos en segundo plano.
  useEffect(() => {
    if (!((authMode === "admin" || authMode === "client") && !dataLoaded)) return;
    setDataLoaded(true);

    const cacheKey = `inforce_data_${authMode}_${clientSlug || "admin"}`;
    const pendingPath = pendingRouteRef.current;
    pendingRouteRef.current = null;

    // Resuelve la ruta pendiente (o auto-nav de cliente) contra un set de empresas.
    const applyRoute = (companies) => {
      if (pendingPath) {
        const { slug, action, reportId } = parsePath(pendingPath);
        if (action === "newCompany") { setView("newCompany"); return; }
        if (slug) {
          const found = companies.find(c => getSlug(c) === slug);
          if (found) {
            setSelectedCompany(found);
            if (action === "viewReport" || action === "editReport") {
              const report = found.reports?.find(r => String(r.id) === String(reportId));
              if (report) { setSelectedReport(report); setView(action); }
              else setView("company");
            } else if (action === "selectReportType") setView("selectReportType");
            else if (action === "newReport") setView("newReport");
            else if (action === "editCompany") setView("editCompany");
            else if (action === "despliegue") setView("despliegue");
            else if (action === "pipeline") setView("pipeline");
            else if (action === "control") setView("control");
            else if (action === "adlibrary") setView("adlibrary");
            else if (action === "crear-imagenes") setView("crear-imagenes");
            else if (action === "tareas") setView("tareas");
            else setView("company");
          }
        }
      } else if (authMode === "client" && clientSlug) {
        const found = companies.find(c =>
          c.name.toLowerCase().replace(/\s+/g, "-") === clientSlug || c.slug === clientSlug);
        if (found) { setSelectedCompany(found); setView("company"); }
      }
    };

    // 1) Hidratar desde cache → render instantáneo (empresa + tablero).
    let hydrated = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.companies?.length) {
          setAppData({ companies: parsed.companies });
          setCompaniesLoaded(true);
          applyRoute(parsed.companies);
          hydrated = true;
        }
      }
    } catch { /* cache corrupto → ignorar y refetchear */ }

    // 2) Refrescar desde la base (revalidate).
    dbGetCompanies().then(async companies => {
      const withReports = await Promise.all(
        companies.map(async c => ({ ...c, reports: await dbGetReports(c.id) }))
      );
      setAppData({ companies: withReports });
      setCompaniesLoaded(true);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ companies: withReports, ts: Date.now() }));
      } catch { /* quota excedida → seguir sin cachear */ }
      if (hydrated) {
        // Ya navegamos desde cache; re-sincronizamos la empresa abierta a datos frescos.
        setSelectedCompany(prev => prev ? (withReports.find(c => c.id === prev.id) || prev) : prev);
      } else {
        applyRoute(withReports);
      }
    }).catch(() => { setCompaniesLoaded(true); });
  }, [authMode, dataLoaded, clientSlug]);

  // PIN validation handlers
  // PIN admin DESHABILITADO por seguridad — antes era un gate compartido y
  // hardcoded. El handler queda como no-op para evitar errores si algún
  // legacy callsite todavía lo invoca. UI no expone el PIN para admin.
  const handleAdminPin = () => {
    setPinError("El acceso admin ahora requiere correo y contraseña.");
    return false;
  };

  // Login con correo + password vía Supabase. Tras validar credenciales,
  // resuelve el rol del usuario y lo rutea al lugar correcto:
  //   - Inforce team member → admin panel
  //   - Cliente con 1+ empresa accesible → /cliente/<slug> (primera empresa)
  //   - Sin permisos → cerrar sesión + mensaje genérico (sin info leak)
  //
  // ANTES esto seteaba authMode="admin" para CUALQUIERA con credenciales
  // válidas. Eso causaba el bug: el cliente entraba, resolveAuth lo
  // re-validaba en el siguiente render y lo expulsaba — daba la sensación
  // de "logueo intermitente".
  const handleAdminEmail = async ({ email, password }) => {
    try {
      const { error } = await database.auth.signInWithPassword({ email, password });
      if (error) {
        setPinError(error.message || "Correo o contraseña incorrectos.");
        return false;
      }
      const { data: { session } } = await database.auth.getSession();
      const access = await resolveUserAccess(session);

      if (access.role === "admin") {
        localStorage.setItem("inforce_auth", "admin");
        setAuthMode("admin");
        setPinError("");
        return true;
      }

      if (access.role === "client" && access.companies.length > 0) {
        // Primera empresa accesible. (Si hay varias, el sidebar dentro del
        // workspace permite switchear.)
        const slug = slugifyCompany(access.companies[0]);
        if (slug) {
          try { localStorage.removeItem("inforce_auth"); } catch {}
          window.location.replace(`/cliente/${slug}`);
          return true;
        }
      }

      // Sin acceso → cerrar sesión y mostrar mensaje genérico.
      try { await database.auth.signOut(); } catch {}
      setPinError("Tu cuenta no tiene acceso a este portal. Contactá al administrador.");
      return false;
    } catch (e) {
      setPinError(String(e?.message || e));
      return false;
    }
  };

  // Busca una empresa por slug (URL) en la lista cargada, cargándola bajo
  // demanda si aún no está disponible. Devuelve { found, companies }.
  const ensureCompaniesLoaded = async () => {
    if (dataLoaded) return appData.companies;
    setDataLoaded(true);
    const companies = await dbGetCompanies();
    const withReports = await Promise.all(
      companies.map(async (c) => ({ ...c, reports: await dbGetReports(c.id) }))
    );
    setAppData({ companies: withReports });
    return withReports;
  };

  // Helper para sidebar "EMPRESAS" en CompanyWorkspace:
  //   - Admin (Inforce team): mismo flujo de siempre → setSelectedCompany + setView
  //   - Cliente con multi-empresa: hard navigation a /cliente/<slug-de-la-nueva-empresa>
  //     porque el slug vive en la URL y necesita re-correr la auth.
  const selectCompanyOrNavigate = (co, adminView) => {
    if (!isAdmin) {
      const newSlug = slugifyCompany(co);
      if (newSlug && newSlug !== clientSlug) {
        window.location.href = `/cliente/${newSlug}`;
      }
      return;
    }
    setSelectedCompany(co);
    setView(adminView);
  };

  const matchesSlug = (company) =>
    company.slug === clientSlug ||
    company.name?.toLowerCase().replace(/\s+/g, "-") === clientSlug;

  // PIN retirado (Fase C). Se conserva como no-op por si algún flujo viejo lo
  // invoca — ahora el acceso es solo email + contraseña.
  const handleClientPin = async () => {
    setPinError("El acceso por PIN ya no está disponible. Entrá con tu email y contraseña.");
    return false;
  };

  // Email + contraseña. Primero intenta como dueño (company.email/pin), si no
  // cuadra busca entre los miembros del equipo (company_team_members.email/pin).
  // Si matchea un miembro, se loguea restringido a sus roles.
  const handleClientEmail = async ({ email, password }) => {
    // Ubicar la empresa por slug con la RPC pública (NO expone pin/email) —
    // funciona incluso bajo RLS cerrada, sin sesión. Fallback a lectura directa
    // por si la RPC todavía no está creada (antes de correr la migración RLS).
    let found = null;
    try {
      const { data: lookup, error: rpcErr } = await database.rpc("company_login_lookup", { p_slug: clientSlug });
      if (!rpcErr && lookup) found = Array.isArray(lookup) ? lookup[0] : lookup;
    } catch { /* RPC aún no existe → fallback */ }
    if (!found) {
      // Búsqueda parametrizada (sin interpolar clientSlug en un filtro .or()
      // crudo — evita inyección PostgREST). Probamos por slug y, si no hay
      // match, por name; ambos con .eq() que Supabase escapa como parámetro.
      const { data: bySlug } = await database
        .from("companies").select("id, name, slug, owner_user_id")
        .eq("slug", clientSlug).limit(1);
      found = bySlug?.[0] || null;
      if (!found) {
        const { data: byName } = await database
          .from("companies").select("id, name, slug, owner_user_id")
          .eq("name", clientSlug).limit(1);
        found = byName?.[0] || null;
      }
    }
    if (!found) {
      setPinError("Esta empresa no existe. Revisá el link.");
      return false;
    }
    const emailNormalized = String(email || "").trim().toLowerCase();

    // Login REAL de Supabase (email + contraseña). Único método (PIN retirado).
    const { data: signInData, error: signInErr } = await database.auth.signInWithPassword({
      email: emailNormalized,
      password,
    });
    if (signInErr || !signInData?.user) {
      setPinError("Correo o contraseña incorrectos.");
      return false;
    }
    const user = signInData.user;

    // Verificar que esta cuenta SÍ tiene acceso a esta empresa (no otra).
    const access = await resolveUserAccess(signInData.session);
    const hasAccess = access.role === "admin"
      || access.companies.some((c) => c.id === found.id || slugifyCompany(c) === clientSlug);
    if (!hasAccess) {
      await database.auth.signOut().catch(() => {});
      setPinError("Tu cuenta no tiene acceso a esta empresa.");
      return false;
    }

    // Cargar la empresa completa (ya con sesión → la RLS lo permite).
    const { data: fullCompany } = await database
      .from("companies").select("*").eq("id", found.id).maybeSingle();
    const company = fullCompany || found;
    const isOwner = found.owner_user_id === user.id;
    const member = await resolveClientMember(company, user, { assumeOwner: isOwner });

    localStorage.removeItem("inforce_auth");
    localStorage.removeItem("inforce_member_id");
    setCurrentMember(member);
    // Entrar por el formulario del cliente siendo del equipo de Inforce es lo
    // mismo que entrar por la URL: `authMode` queda en "client" igual, así que
    // sin esto el admin se logueaba y quedaba en solo lectura.
    setIsAdminPreview(access.role === "admin");
    setSelectedCompany(company);
    setAuthMode("client");
    setView("company");
    setPinError("");
    loadAccessibleCompaniesByEmail(emailNormalized, signInData.session).then(setAccessibleCompanies).catch(() => {});
    return true;
  };

  const logout = async () => {
    try { localStorage.removeItem("inforce_auth"); } catch {}
    try { localStorage.removeItem("inforce_member_id"); } catch {}
    // Esperamos a que Supabase termine el signOut antes de cambiar el
    // authMode — sin esto, queda una race donde el user intenta loguearse
    // de nuevo y la session vieja todavía está activa en memoria.
    if (!clientSlug) {
      await database.auth.signOut().catch(() => {});
    }
    setCurrentMember(null);
    // El logout NO recarga la página, así que todo lo que decida permisos hay que
    // bajarlo a mano: si no, el próximo que entre en esta pantalla hereda lo de
    // quien acaba de salir.
    setIsAdminPreview(false);
    setAuthMode(clientSlug ? "pin_client" : "pin_admin");
    setView("home");
    setSelectedCompany(null);
    setSelectedReport(null);
    setDataLoaded(false);
    setCompaniesLoaded(false);
    // Limpiar cache local de empresas/reportes (higiene: no dejar datos tras logout).
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("inforce_data_"))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setAppData({ companies: [] });
    window.history.replaceState(null, "", clientSlug ? `/cliente/${clientSlug}` : "/");
  };

  // ── PUBLIC LANDING ROUTES (interceptan ANTES del flujo authMode) ─────────────
  // /signup, /login, /forgot-password son siempre públicas.
  // /onboarding y /app requieren session (cada componente lo chequea internamente).
  // / muestra landing si no es admin auth.
  const publicPath = (typeof window !== "undefined" ? window.location.pathname : "/");
  const goPath = (p) => { window.location.assign(p); };

  if (publicPath === "/debug" && import.meta.env.DEV) {
    return <Suspense fallback={<LazyFallback />}><DebugPage /></Suspense>;
  }
  // Hoja de rodaje pública. Se intercepta antes que nada: la creadora no tiene
  // sesión y no debe ver ni el loader de auth.
  if (publicPath.startsWith("/brief/")) {
    return (
      <Suspense fallback={<LazyFallback label="Abriendo la hoja…" />}>
        <BriefPublicPage token={decodeURIComponent(publicPath.slice("/brief/".length).replace(/\/+$/, ""))} />
      </Suspense>
    );
  }
  if (publicPath === "/signup") {
    return <Suspense fallback={<LazyFallback />}><SignupPage
      onSignupSuccess={() => goPath("/onboarding")}
      onGoLogin={() => goPath("/login")}
    /></Suspense>;
  }
  if (publicPath === "/login") {
    return <Suspense fallback={<LazyFallback />}><LoginPage
      onLoginSuccess={() => goPath("/app")}
      onGoSignup={() => goPath("/signup")}
      onGoForgot={() => goPath("/forgot-password")}
    /></Suspense>;
  }
  if (publicPath === "/forgot-password") {
    return <Suspense fallback={<LazyFallback />}><ForgotPasswordPage onGoLogin={() => goPath("/login")} /></Suspense>;
  }
  if (publicPath === "/onboarding") {
    return <Suspense fallback={<LazyFallback />}><OnboardingWizard onComplete={(company) => goPath(`/cliente/${company.slug}`)} /></Suspense>;
  }
  if (publicPath === "/app") {
    return <AppResolver onResolved={(slug) => goPath(`/cliente/${slug}`)} onNoCompany={() => goPath("/onboarding")} onNoSession={() => goPath("/login")} />;
  }

  // Root: landing pública si no es admin autenticado.
  if (publicPath === "/" && authMode !== "admin" && authMode !== "client") {
    if (authMode === null) {
      return <BrandLoader />;
    }
    return <Suspense fallback={<LazyFallback />}><LandingPage
      onCtaSignup={() => goPath("/signup")}
      onCtaLogin={() => goPath("/login")}
    /></Suspense>;
  }

  // ── RENDER AUTH SCREENS ─────────────────────────────────────────────────────
  if (authMode === null) return <BrandLoader />;

  if (authMode === "pin_admin") {
    return <PinScreen mode="admin" onSuccess={handleAdminPin} onEmailSuccess={handleAdminEmail} error={pinError} setError={setPinError} />;
  }

  if (authMode === "pin_client") {
    const slug = clientSlug || "";
    const displayName = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    return <PinScreen mode="client" companyName={displayName} onSuccess={handleClientPin} onEmailSuccess={handleClientEmail} error={pinError} setError={setPinError} />;
  }

  const updateData = (newData) => setAppData(newData);

  const createCompany = async () => {
    if (!newCompanyName.trim()) return;
    const mergedObj = {
      ...defaultObjectives,
      ...Object.fromEntries(
        Object.entries(newCompanyObj)
          .filter(([k, v]) => k !== "pin" && k !== "email" && v !== "" && v !== undefined)
      ),
    };
    // El slug es la URL del portal del cliente. Creando desde acá nunca se
    // verificaba que no estuviera tomado —el signup sí lo hacía— y dos empresas
    // con el mismo nombre terminaban peleándose `/cliente/<slug>`. Con Lipenza
    // eso dejó al cliente en una y al embudo en la otra.
    const slug = await uniqueCompanySlug(newCompanyName);
    const repetida = appData.companies.some(
      (c) => (c.name || "").trim().toLowerCase() === newCompanyName.trim().toLowerCase(),
    );
    const company = {
      id: String(Date.now()),
      name: newCompanyName.trim(),
      slug,
      objectives: mergedObj,
      email: (newCompanyObj.email || "").trim().toLowerCase() || null,
      reports: [],
    };
    // Se crea igual —a veces hay dos cuentas del mismo cliente a propósito—,
    // pero avisando, porque casi siempre es que ya existía y no se vio.
    if (repetida) toast(`Ya había una empresa llamada "${company.name}". Esta entra por /cliente/${slug}`, "info");
    updateData({ ...appData, companies: [...appData.companies, company] });
    dbSaveCompany(company).catch((e) => { logger.error("dbSaveCompany falló", e); toastError("No se pudo guardar la empresa. Revisá tu conexión e intentá de nuevo."); });
    setNewCompanyName(""); setNewCompanyObj({ ...emptyCompanyObj });
    setView("home");
  };

  const saveReport = (report) => {
    const newData = { ...appData, companies: appData.companies.map(c => c.id === selectedCompany.id ? { ...c, reports: [report, ...(c.reports || [])] } : c) };
    updateData(newData);
    dbSaveReport(selectedCompany.id, report).catch((e) => { logger.error("dbSaveReport falló", e); toastError("No se pudo guardar el reporte. Revisá tu conexión e intentá de nuevo."); });
    const updatedCompany = newData.companies.find(c => c.id === selectedCompany.id);
    setSelectedCompany(updatedCompany);
    setSelectedReport(report);
    setView("viewReport");
  };

  const updateReport = (updatedReport) => {
    const newData = {
      ...appData,
      companies: appData.companies.map(c =>
        c.id === selectedCompany.id
          ? { ...c, reports: (c.reports || []).map(r => r.id === updatedReport.id ? updatedReport : r) }
          : c
      ),
    };
    updateData(newData);
    dbSaveReport(selectedCompany.id, updatedReport).catch((e) => { logger.error("dbSaveReport(merge) falló", e); toastError("No se pudo guardar el reporte. Revisá tu conexión e intentá de nuevo."); });
    const updatedCompany = newData.companies.find(c => c.id === selectedCompany.id);
    setSelectedCompany(updatedCompany);
    setSelectedReport(updatedReport);
    setView("company");
  };

  const deleteReport = (report) => {
    const newData = {
      ...appData,
      companies: appData.companies.map(c =>
        c.id === selectedCompany.id
          ? { ...c, reports: (c.reports || []).filter(r => r.id !== report.id) }
          : c
      ),
    };
    updateData(newData);
    dbDeleteReport(report.id).catch((e) => { logger.error("dbDeleteReport falló", e); toastError("No se pudo eliminar el reporte. Revisá tu conexión e intentá de nuevo."); });
    const updatedCompany = newData.companies.find(c => c.id === selectedCompany.id);
    setSelectedCompany(updatedCompany);
    setSelectedReport(null);
    setView("company");
  };

  const startEditCompany = (company) => {
    const obj = company.objectives || {};
    setNewCompanyName(company.name);
    setNewCompanyObj({
      roasMin:                 obj.roasMin                 ?? "",
      roasTarget:              obj.roasTarget               ?? "",
      costPerPurchaseMax:      obj.costPerPurchaseMax       ?? "",
      costPerPurchaseTarget:   obj.costPerPurchaseTarget    ?? "",
      revenueActual:           obj.revenueActual            ?? "",
      revenueTarget:           obj.revenueTarget            ?? "",
      cpm:                     obj.cpm                     ?? "",
      cpcTarget:               obj.cpcTarget                ?? "",
      ctrTarget:               obj.ctrTarget                ?? "",
      pageLoadMin:             obj.pageLoadMin              ?? "",
      checkoutRateTarget:      obj.checkoutRateTarget       ?? "",
      costPerInitiatedTarget:  obj.costPerInitiatedTarget   ?? "",
      checkoutConversionTarget:obj.checkoutConversionTarget ?? "",
      email:                   company.email                || "",
    });
    setSelectedCompany(company);
    setView("editCompany");
  };

  const saveEditCompany = () => {
    if (!newCompanyName.trim()) return;
    const mergedObj = {
      ...defaultObjectives,
      ...Object.fromEntries(
        Object.entries(newCompanyObj)
          .filter(([k, v]) => k !== "pin" && k !== "email" && v !== "" && v !== undefined)
          .map(([k, v]) => [k, typeof v === "string" ? parseFloat(v.replace(/\./g,"").replace(",",".")) || v : v])
      ),
    };
    const updated = {
      ...selectedCompany,
      name: newCompanyName.trim(),
      slug: newCompanyName.trim().toLowerCase().replace(/\s+/g, "-"),
      objectives: mergedObj,
      email: (newCompanyObj.email || "").trim().toLowerCase() || null,
    };
    const newData = {
      ...appData,
      companies: appData.companies.map(c => c.id === updated.id ? { ...updated, reports: c.reports } : c),
    };
    updateData(newData);
    dbSaveCompany(updated).catch((e) => { logger.error("dbSaveCompany falló", e); toastError("No se pudo guardar. Revisá tu conexión e intentá de nuevo."); });
    setSelectedCompany({ ...updated, reports: selectedCompany.reports || [] });
    setView("company");
  };

  const S = {
    app: { fontFamily: "'Inter','DM Sans','Helvetica Neue',sans-serif", color: DS.textPrimary, background: DS.bg, minHeight: "100vh" },
    logo: { fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", color: DS.red },
    sLabel: { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", color: DS.textMuted, marginBottom: 12 },
    btn: { ...darkBtnGhost },
    btnP: { ...darkBtn, padding: "9px 18px", fontSize: 13 },
  };

  // Role flags — driven by auth
  const isAdmin = authMode === "admin";
  const isClient = authMode === "client";

  // `isAdmin` dice POR DÓNDE entró, no QUIÉN es: entrando por /cliente/<empresa>
  // el authMode queda en "client" aunque sea del equipo de Inforce. Para eso está
  // `isAdminPreview`, que se prende solo con una fila real en `team_members` — la
  // misma condición que usa `is_team_admin()` en la base. Mirar solo `isAdmin`
  // dejaba a José con "Solo lectura" encima de datos que sí podía borrar.
  const esInforce = esDeInforce({ authMode, esAdminPreview: isAdminPreview });

  // canManageWorkspace: ¿puede gestionar la empresa actual?
  // Inforce siempre; del lado del cliente, quien la posee y quien la coordina.
  //
  // NO incluye features de plataforma — "nueva empresa", ver todas las
  // empresas, credenciales — esas se quedan detrás de `isAdmin` real.
  const canManageWorkspace = puedeGestionarWorkspace({
    authMode, esAdminPreview: isAdminPreview, member: currentMember,
  });

  // Permiso para crear/editar/eliminar reportes. Owner y trafficker pueden,
  // además del admin global (Jose). Otros roles solo lectura.
  const reportsEffectiveMember = isAdmin
    ? { ...(currentMember || {}), is_admin_global: true }
    : currentMember;
  const canManageRpts = canManageReports(reportsEffectiveMember);

  // Privacy mode helpers
  const blurVal = privacyMode
    ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none", transition: "filter 0.2s" }
    : { transition: "filter 0.2s" };
  const privacyColor = (color) => privacyMode && color !== DS.green ? DS.textHint : color;



  // Aggregate metrics — filtered by dashboardRange or fallback to last report per company
  const dashFrom = dashboardRange ? new Date(dashboardRange.from + "T00:00:00") : null;
  const dashTo   = dashboardRange ? new Date(dashboardRange.to   + "T23:59:59") : null;

  // Agregación unificada: misma lógica que CompanyStats (vista interna de empresa) para
  // que los números del panel general coincidan con los de cada empresa.
  // - Cuando hay rango: distributeDaily considera TODOS los tipos de reporte,
  //   prioriza el más largo (anti-solapamiento) y recorta al rango solicitado.
  // - Sin rango ("Último reporte"): usa el reporte más reciente sin importar el tipo.
  const computeCompanyAggregate = (rs) => {
    const allReports = rs || [];
    if (!dashboardRange) {
      const latest = allReports.slice().sort((a, b) => {
        const da = getReportDates(a); const db = getReportDates(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db.to - da.to;
      })[0];
      if (!latest) return { reports: [], spend: 0, conversion: 0, purchases: 0 };
      return {
        reports: [latest],
        spend: latest.spend || 0,
        conversion: latest.conversion || 0,
        purchases: latest.purchases || 0,
      };
    }
    const selected = selectReportsForRange(allReports, dashFrom, dashTo);
    const daily = distributeDaily(allReports, dashFrom, dashTo);
    const totals = daily.reduce((acc, d) => ({
      spend:      acc.spend      + (d.spend      || 0),
      conversion: acc.conversion + (d.conversion || 0),
      purchases:  acc.purchases  + (d.purchases  || 0),
    }), { spend: 0, conversion: 0, purchases: 0 });
    return { reports: selected, ...totals };
  };

  // Activas = no archivadas (defaultean a false si la column aún no existe
  // — ver db/companies_archived.sql). Archivadas se muestran al final del
  // grid solo cuando showArchivedHome está activo, y NUNCA contribuyen a
  // las métricas globales (gasto, ventas, ROAS, compras).
  const homeActiveCompanies = appData.companies.filter(c => !c.archived);
  const homeArchivedCompanies = appData.companies.filter(c => !!c.archived);
  const homeVisibleCompanies = showArchivedHome
    ? [...homeActiveCompanies, ...homeArchivedCompanies]
    : homeActiveCompanies;

  const companySelectedReports = homeActiveCompanies.map(c => ({
    company: c,
    ...computeCompanyAggregate(c.reports),
  }));
  // Para el grid, incluímos también las archivadas (cuando el toggle está
  // activo) sin afectar las métricas globales que se calculan abajo.
  const gridCompanyReports = homeVisibleCompanies.map(c => ({
    company: c,
    ...computeCompanyAggregate(c.reports),
  }));

  const totalSpend      = companySelectedReports.reduce((s, a) => s + a.spend,      0);
  const totalConversion = companySelectedReports.reduce((s, a) => s + a.conversion, 0);
  const totalPurchases  = companySelectedReports.reduce((s, a) => s + a.purchases,  0);
  const avgRoasAll = totalSpend > 0 ? totalConversion / totalSpend : 0;
  const roasGlobal = avgRoasAll === 0 ? "neutral" : avgRoasAll >= (defaultObjectives.roasTarget || 6) ? "ok" : avgRoasAll >= (defaultObjectives.roasMin || 4) ? "warn" : "bad";

  // Clientes nunca ven el home admin (lista de todas las empresas). Si por
  // algún motivo estamos en client mode sin empresa cargada aún, mostramos
  // un loading en vez del home admin.
  // Cliente sin empresa resuelta: spinner MIENTRAS carga, no para siempre.
  //
  // Este era el punto donde Brahian quedaba atrapado: un spinner sin salida ni
  // límite. Si las empresas ya llegaron y ninguna es la suya, el problema no se
  // va a arreglar esperando — hay que decírselo y darle por dónde salir.
  if (authMode === "client" && (view === "home" || !selectedCompany)) {
    if (!companiesLoaded) return <BrandLoader />;
    if (!selectedCompany) {
      return (
        <div style={{
          minHeight: "100vh", background: DS.bg, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
          fontFamily: DS.font, textAlign: "center",
        }}>
          <span style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 600 }}>
            {soloArchivadas ? "Tu portal está pausado" : "No encontramos tu empresa"}
          </span>
          <span style={{ color: DS.textSecondary, fontSize: 13, lineHeight: 1.55, maxWidth: 380 }}>
            {soloArchivadas
              ? "Tu cuenta entró bien, pero tu empresa está archivada y el portal quedó en pausa. Escribile a tu asesor de Inforce para reactivarla; tu información sigue guardada."
              : "Tu cuenta entró bien, pero el link no lleva a ninguna de tus empresas. Volvé a entrar o pedile el link a tu asesor."}
          </span>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {/* Con la empresa archivada, "Llevame a mi portal" devolvía a esta
                misma pantalla. Un botón que no lleva a ningún lado se saca. */}
            {!soloArchivadas && (
            <button onClick={() => window.location.replace("/app")}
              style={{ padding: "9px 18px", borderRadius: 50, border: "none", background: DS.blue, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>
              Llevame a mi portal
            </button>
            )}
            <button onClick={logout}
              style={{ padding: "9px 18px", borderRadius: 50, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: DS.font }}>
              Cerrar sesión
            </button>
          </div>
        </div>
      );
    }
    return <BrandLoader />;
  }

  // Admin: mientras las empresas aún no cargaron, mostramos spinner en vez del
  // home vacío ("No hay empresas aún"). Sin esto, al entrar a una empresa se
  // flashea el panel vacío hasta que resuelve la fetch + la ruta al workspace.
  if (authMode === "admin" && !companiesLoaded && view === "home") {
    return <BrandLoader />;
  }

  // HOME
  if (view === "home") return (
    <div style={{ fontFamily: "'Inter','DM Sans','Helvetica Neue',sans-serif", color: DS.textPrimary, background: DS.bg, minHeight: "100vh", display: "flex", width: "100%" }}>
      {!isDark && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.8 }} />}
      {/* MOBILE HAMBURGER */}
      {isMobile && <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} style={{ display: "none", position: "fixed", top: 12, left: 12, zIndex: 101, width: 36, height: 36, borderRadius: 8, border: DS.border, background: isDark ? "rgba(10,10,16,0.9)" : "rgba(255,255,255,0.95)", color: DS.textPrimary, cursor: "pointer", alignItems: "center", justifyContent: "center", fontSize: 18 }}>☰</button>}
      {isMobile && <div className={`sidebar-overlay ${sidebarOpen ? "" : "hidden"}`} onClick={() => setSidebarOpen(false)} />}
      {/* SIDEBAR */}
      <div className={`app-sidebar ${sidebarOpen ? "open" : ""}`} style={{ width: 220, background: DS.bgSide, borderRight: DS.border, padding: "24px 0", flexShrink: 0, minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ padding: "0 18px 18px", borderBottom: DS.border, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: isDark ? "#FFFFFF" : "#E24B4A", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5 9.5L11 3" stroke={isDark ? "#E24B4A" : "#FFFFFF"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: DS.textPrimary }}>INFORCE</div>
            <div style={{ fontSize: 9, color: DS.textHint, letterSpacing: "0.08em" }}>REPORTS</div>
          </div>
          <button onClick={toggleTheme} title={isDark ? "Modo claro" : "Modo oscuro"}
            style={{ background: "transparent", border: `1px solid ${DS.textHint}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", fontSize: 13, lineHeight: 1, color: DS.textMuted, flexShrink: 0 }}>
            {isDark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
        </div>
        <div style={{ fontSize: 9, color: DS.textHint, padding: "0 22px 6px", letterSpacing: "0.15em", fontWeight: 700 }}>MENÚ</div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textPrimary, borderLeft: `2px solid ${DS.red}`, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
          Panel general
        </div>
        {isAdmin && (
          <div onClick={() => setView("newCompany")} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textSecondary, borderLeft: "2px solid transparent", cursor: "pointer" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
            Nueva empresa
          </div>
        )}
        {appData.companies.length > 0 && (
          <>
            {isAdmin && <div style={{ fontSize: 9, color: DS.textHint, padding: "14px 18px 6px", letterSpacing: "0.12em", fontWeight: 600 }}>CLIENTES</div>}
            {(isClient ? appData.companies.filter(co => co.id === selectedCompany?.id) : homeVisibleCompanies).map(co => (
              <div key={co.id} onClick={() => { setSelectedCompany(co); setView("company"); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textSecondary, cursor: "pointer", opacity: co.archived ? 0.55 : 1 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(226,75,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: DS.red, flexShrink: 0, ...blurVal }}>{co.name.charAt(0)}</div>
                <span style={{ ...blurVal }}>{co.name}</span>
              </div>
            ))}
            {isAdmin && !isClient && homeArchivedCompanies.length > 0 && (
              <div onClick={() => setShowArchivedHome(v => !v)}
                style={{ padding: "6px 22px", fontSize: 10.5, fontWeight: 600, color: DS.textMuted, cursor: "pointer", letterSpacing: "0.04em" }}>
                {showArchivedHome ? "▾" : "▸"} Archivadas ({homeArchivedCompanies.length})
              </div>
            )}
          </>
        )}
        <div style={{ padding: "14px 18px 0", marginTop: 8, borderTop: DS.border }}>
          <div onClick={logout}
            style={{ fontSize: 11, color: DS.textHint, cursor: "pointer" }}>Cerrar sesión</div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, padding: "28px", minWidth: 0, position: "relative",
        backgroundImage: isDark ? "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)" : "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
        backgroundSize: "28px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em",
              background: isDark ? "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.7) 100%)" : "linear-gradient(180deg, #37352F 0%, rgba(55,53,47,0.7) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Panel general
            </div>
            <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 4, fontWeight: 400 }}>Resultados consolidados · {homeActiveCompanies.length} cliente{homeActiveCompanies.length !== 1 ? "s" : ""} activo{homeActiveCompanies.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setPrivacyMode(v => !v)}
              title={privacyMode ? "Mostrar datos" : "Censurar datos para grabación"}
              style={{ ...darkBtnGhost, padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: privacyMode ? DS.amber : DS.textSecondary, borderColor: privacyMode ? DS.amber : undefined }}>
              {privacyMode
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
              {privacyMode ? "Mostrando" : "Censurar"}
            </button>
            {isAdmin && <button onClick={() => setView("newCompany")} style={{ ...darkBtn }}>+ Nueva empresa</button>}
          </div>
        </div>

        {/* Selector de rango de fechas */}
        {(() => {
          const today = new Date();
          const fmt8 = (d) => d.toISOString().split("T")[0];
          const presets = [
            { label: "Último reporte", value: null },
            { label: "Hoy",    from: fmt8(today), to: fmt8(today) },
            { label: "Ayer",   from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-1)), to: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-1)) },
            { label: "7 días", from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-7)), to: fmt8(today) },
            { label: "30 días",from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-30)), to: fmt8(today) },
            { label: "60 días",from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-60)), to: fmt8(today) },
            { label: "90 días",from: fmt8(new Date(today.getFullYear(), today.getMonth(), today.getDate()-90)), to: fmt8(today) },
          ];
          const activeLabel = dashboardRange ? dashboardRange.label : "Último reporte";
          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {presets.map(p => {
                  const isActive = p.value === null ? dashboardRange === null : dashboardRange?.label === p.label;
                  return (
                    <button key={p.label} onClick={() => setDashboardRange(p.value === null ? null : { from: p.from, to: p.to, label: p.label })}
                      style={{ padding: "5px 14px", borderRadius: 50, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                        background: isActive ? (isDark ? "#fff" : "#2F3437") : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"),
                        color: isActive ? (isDark ? "#06060A" : "#fff") : DS.textSecondary,
                        transition: "all 0.15s" }}>
                      {p.label}
                    </button>
                  );
                })}
                {/* Personalizado */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                  <input type="date" max={fmt8(today)}
                    value={dashboardRange?.from || ""}
                    onChange={e => { const v = e.target.value; if (v && dashboardRange?.to) setDashboardRange({ from: v, to: dashboardRange.to, label: `${v} – ${dashboardRange.to}` }); else if (v) setDashboardRange(r => ({ ...(r||{}), from: v, label: `${v} – ${(r||{}).to||v}` })); }}
                    style={{ padding: "4px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 11 }} />
                  <span style={{ color: DS.textMuted, fontSize: 11 }}>→</span>
                  <input type="date" max={fmt8(today)}
                    value={dashboardRange?.to || ""}
                    onChange={e => { const v = e.target.value; if (v && dashboardRange?.from) setDashboardRange({ from: dashboardRange.from, to: v, label: `${dashboardRange.from} – ${v}` }); else if (v) setDashboardRange(r => ({ ...(r||{}), to: v, label: `${(r||{}).from||v} – ${v}` })); }}
                    style={{ padding: "4px 8px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 11 }} />
                </div>
              </div>
              {dashboardRange && (
                <div style={{ marginTop: 8, fontSize: 11, color: DS.textMuted }}>
                  Mostrando reportes sin solapar · mayor cobertura posible · <span style={{ color: DS.textMuted }}>{dashboardRange.label}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Métricas globales */}
        {(() => {
          const subLabel = dashboardRange ? dashboardRange.label : "último reporte c/u";
          return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "GASTO TOTAL CLIENTES", val: `${fmtM(totalSpend)}`, sub: `COP · ${subLabel}`, color: DS.textPrimary },
            { label: "VENTAS TOTALES", val: `${fmtM(totalConversion)}`, sub: `COP · ${subLabel}`, color: DS.green },
            { label: "ROAS PROMEDIO", val: `${avgRoasAll.toFixed(2)}×`, sub: `Objetivo: ${defaultObjectives.roasTarget || 6}×`, color: roasGlobal === "ok" ? DS.green : roasGlobal === "warn" ? DS.amber : roasGlobal === "bad" ? DS.red : DS.textMuted },
            { label: "COMPRAS TOTALES", val: fmt(totalPurchases), sub: subLabel, color: DS.textPrimary },
          ].map((m, i) => (
            <div key={i} style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>{m.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: m.color,
              background: m.color === DS.textPrimary ? (isDark ? "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 100%)" : "linear-gradient(180deg, #37352F 0%, rgba(55,53,47,0.7) 100%)") : "none",
              WebkitBackgroundClip: m.color === DS.textPrimary ? "text" : "unset",
              WebkitTextFillColor: m.color === DS.textPrimary ? "transparent" : "unset",
            }}>{m.val}</div>
              <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 3 }}>{m.sub}</div>
            </div>
          ))}
        </div>
          );
        })()}

        {/* Grid de empresas */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.15em" }}>EMPRESAS ACTIVAS</div>
          {isAdmin && homeArchivedCompanies.length > 0 && (
            <button onClick={() => setShowArchivedHome(v => !v)}
              style={{
                padding: "5px 12px", borderRadius: 50, border: showArchivedHome ? `1px solid ${DS.textMuted}` : DS.border,
                background: showArchivedHome ? "rgba(255,255,255,0.05)" : "transparent",
                color: showArchivedHome ? DS.textPrimary : DS.textMuted,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
              {showArchivedHome ? "▾" : "▸"} Archivadas ({homeArchivedCompanies.length})
            </button>
          )}
        </div>
        {appData.companies.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: DS.textSecondary, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", width: 240, height: 240, margin: "0 auto 8px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)", filter: "blur(20px)" }} />
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAACyM0lEQVR42uy9d5ydV3Xu/6y999tOL9P7aEZt1CVLltwk2XLBmM4IDLmEkgABAiEhgV8CGSkkN8kNIZdOSKMEAhpsMMWYYiS54CrLamN1aSRNnzMzZ059y97798eMHGOM7eSGBFvv9/MZl5HOe86Zd89znrX22msBISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEh/6Xw8EcQ8qtAa00A2N69e3X40wgJCfl1hXbt2sWfKlx9fX0s/LGEhIT8WgnV5s2bxcX/6evry/T19XU/zXGFhPw/EX7yhfw/09fXx4hI7927N1i3bl3yYx/72OdSqdSxK6+88ti3v/3tH27durWdMaZDpxUSEvI/Sm9v78XwT9z8spe97Ru7vnHs9OnT+sMf/vCp9/zue4YHz53T3//+948nEomM1pqFTivk/wUR/ghC/rMhIAD09/fLq6666vKGhrqPX3XN5is0gCNHn5CNzU3evffflxsaHqq/+eabF37sYx/7KBG9W2vNAcjwxxcShoQh/53rRgPAtm3XvjOTTv7kssvWX3HdddcFXV1d6vH9+7nv+wvrGxoyt3/rdpXL5eR11133Wy9/+csXE5EMQ8OQULBC/luYFxu1evXq2q1br/6YZVl/6UQi5s033yxNyxL19fVs69atOHToEN98zVULRkeG5b9+9ctYsGCB+YbfuPUdALBly5Zw3YWEghXyq18vO3fuVFu3XrkskYj/tWU513qeNxqJRFg2m+Vaa2it4TgOampq9OnTp+nml95s1dfVU7VaRltLW29LS4uzZcsWeTGkDAkJBSvkV+asbr755nYi8y8Mw8j6vu/atl134403isncpB4fG0O5XMb58+exdu1a6lm+HLP5WUitWKFQ0J2dHS1XXHHFUiLSu3b1hmsvJBSskF/tepHS+1Mp5Yzv+2YymVzxB3/wB5mXv/zlmJyYpOHhYZw9exZnzw4im80im07D9zwMXRjCxz/+cXny5EncdNMN/wsAent3hT/NkP8w4dGckOekt7eXf/azn1UveclL3ux53srZ2fxIS0vLzR/5yEeSXV1d+rHHHiOtFQ4eOACtJIYunEe1UoZhCHR3dYO0hu957MzZs6qjo+PydDrz4C233HKyt7eXDwwMhEd3Qp43YVlDyHNB/f39qre3t7ZcLm/P5Sa/3dnZ9Y4PfOADWdu21W233camp6d1a2srcc5x5swZ1NTUwDRNlIolPProo4jFokin0+jq6lKMc5HP51T4Yw0JBSvkV+GuWH9/vywUZm6uVLzHyuVy7TXXXL16bGxM33777axarWJmZkZpramxsZGdOXMGo6OjWgihy+UyzczMIBGL0cb1G4LmxibR/+1vffJrX9v1k127dvHt27eH9VghYUgY8l/jrACQ4zj87W9/O86cOb25XC6VIxFnU1dXV9eRI0fYo48+erCuri4ViURM0zSptrZWnzt3jgBQbW0ttXd00ILOTtpyzebgplteJh596KEH3/Zbb79Va43ly5eHoWBIKFgh/8+wvr4+utgWZmRkRO3du1dns+lFWkM4js2KxaLveT4XgrMgkHY+nx9qa2uZXLx4Sc25c+fcXC5XjEScfU1NTW4qlcouWLCADRw5NPDHH/ijlw1PTMxorSlsOxPyn/0UDQkh9IH0Dq2JSAPA5s2bRVtbWxMRLfE8bwWgVkmpskQ64fs+XLd6uFz2nhgfHz4+MHD8wvr1axfedNNLdly4cL5+0aLF3oULQ2d37777n33fH1+0cNGrHj9waOfQ0NCF3t5e3t/fH4aCIaFghfy/s3z58iXt7e23Goa1DlDVarUaVKvVkUKh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" alt="Inforce" style={{ width: "100%", height: "100%", objectFit: "contain", position: "relative", zIndex: 1, filter: "drop-shadow(0 0 30px rgba(255,255,255,0.35)) drop-shadow(0 0 60px rgba(255,255,255,0.15)) drop-shadow(0 0 100px rgba(255,255,255,0.08))" }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.03em",
              background: isDark ? "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.6) 100%)" : "linear-gradient(180deg, #37352F 0%, rgba(55,53,47,0.6) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              No hay empresas aún
            </div>
            <div style={{ fontSize: 13, color: DS.textMuted }}>Crea tu primera empresa para empezar</div>
            {isAdmin && <button onClick={() => setView("newCompany")} style={{ ...darkBtn, marginTop: 16 }}>+ Nueva empresa</button>}
          </div>
        ) : (
          <div className="company-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {gridCompanyReports.map(({ company, reports: selReports, spend: totalSp, conversion: totalCon, purchases: totalPur }) => {
              const roas = totalSp > 0 ? totalCon / totalSp : null;
              const roasColor = !roas ? DS.textSecondary : roas >= (company.objectives?.roasTarget || 6) ? DS.green : roas >= (company.objectives?.roasMin || 4) ? DS.amber : DS.red;
              const hasData = selReports.length > 0 && totalSp > 0;
              const archived = !!company.archived;
              const handleArchiveClick = (e) => {
                e.stopPropagation();
                const next = !archived;
                // Optimistic: actualiza el state inmediatamente. La PATCH va
                // en background; si falla, recargamos para corregir.
                setAppData(d => ({
                  ...d,
                  companies: d.companies.map(c => c.id === company.id ? { ...c, archived: next } : c),
                }));
                dbSetCompanyArchived(company.id, next).catch(err => {
                  logger.error("[home] archive failed:", err);
                  setAppData(d => ({
                    ...d,
                    companies: d.companies.map(c => c.id === company.id ? { ...c, archived } : c),
                  }));
                });
              };
              return (
                <div key={company.id} onClick={() => { setSelectedCompany(company); setView("company"); }}
                  style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s, opacity 0.15s", position: "relative", opacity: archived ? 0.55 : 1 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.055)"}>
                  {isAdmin && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={archived ? "Desarchivar" : "Archivar"}
                      onClick={handleArchiveClick}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleArchiveClick(e); } }}
                      style={{
                        position: "absolute", top: 4, right: 8,
                        padding: "2px 6px",
                        fontSize: 16, lineHeight: 1, fontWeight: 700,
                        color: DS.textMuted, cursor: "pointer",
                        userSelect: "none", letterSpacing: "0.5px",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = DS.textPrimary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = DS.textMuted; }}
                    >
                      {archived ? "↩" : "⋯"}
                    </span>
                  )}
                  {archived && (
                    <span style={{
                      position: "absolute", top: 6, left: 6,
                      fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "2px 7px", borderRadius: 50,
                      background: "rgba(255,255,255,0.06)", color: DS.textMuted,
                    }}>
                      ARCHIVADA
                    </span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(226,75,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: DS.red, flexShrink: 0, ...blurVal }}>{mask.initial(company.name, company.id)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, ...blurVal }}>{mask.name(company.name, company.id)}</div>
                      <div style={{ fontSize: 10, color: DS.textMuted }}>
                        {dashboardRange ? `${selReports.length} reporte${selReports.length !== 1 ? "s" : ""} en el rango` : `${company.reports?.length || 0} reportes · activo`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: privacyColor(roasColor), ...blurVal }}>
                        {roas ? `${roas.toFixed(2)}×` : "—"}
                      </div>
                      <div style={{ fontSize: 9, color: DS.textMuted }}>ROAS</div>
                    </div>
                  </div>
                  {hasData && (
                    <>
                      <div style={{ borderTop: DS.border, marginBottom: 12 }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {[
                          { label: "Ventas", val: fmtM(totalCon) },
                          { label: "Gasto",  val: fmtM(totalSp)  },
                          { label: "Compras", val: fmt(totalPur) },
                          { label: "Costo/compra", val: totalPur > 0 ? fmtM(totalSp / totalPur) : "—", color: privacyColor(roas >= (company.objectives?.roasMin || 4) ? DS.green : DS.red) },
                        ].map((s, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 9, color: DS.textMuted }}>{s.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: s.color || DS.textPrimary, marginTop: 1, ...blurVal }}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {!hasData && (
                    <div style={{ fontSize: 11, color: DS.textMuted, textAlign: "center", paddingTop: 8 }}>Sin reportes en este rango</div>
                  )}
                </div>
              );
            })}
            {isAdmin && (
              <div onClick={() => setView("newCompany")}
                style={{ background: DS.bgCard, border: DS.borderDash, borderRadius: DS.radius, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, cursor: "pointer", minHeight: 120, transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(226,75,74,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(226,75,74,0.12)", color: DS.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</div>
                <div style={{ fontSize: 11, color: DS.textMuted }}>Agregar empresa</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );


  // NUEVA EMPRESA
  if (view === "newCompany") {
    // objField delega en NumField (que soporta decimales y typing fluido).
    const objField = (label, key, placeholder, hint) => (
      <NumField
        label={label}
        hint={hint}
        placeholder={placeholder}
        value={newCompanyObj[key]}
        onChange={(n) => setNewCompanyObj(o => ({ ...o, [key]: n }))}
        darkInput={darkInput}
        DS={DS}
      />
    );

    return (
      <div style={{ fontFamily: "'Inter','DM Sans',sans-serif", background: DS.bg, minHeight: "100vh", color: DS.textPrimary, display: "flex", width: "100%" }}>
        {/* Sidebar mínimo */}
        <div style={{ width: 210, background: DS.bgSide, borderRight: DS.border, padding: "20px 0", flexShrink: 0, minHeight: "100vh" }}>
          <div style={{ padding: "0 18px 18px", borderBottom: DS.border, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "rgba(226,75,74,0.15)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 3" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em",
              background: isDark ? "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.75) 100%)" : "linear-gradient(90deg, #37352F 0%, rgba(55,53,47,0.75) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>INFORCE</div>
              <div style={{ fontSize: 9, color: DS.textHint, letterSpacing: "0.08em" }}>REPORTS</div>
            </div>
          </div>
          {isAdmin && <div onClick={() => setView("home")} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textSecondary, cursor: "pointer" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
            Panel general
          </div>}
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textPrimary, borderLeft: `2px solid ${DS.red}`, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
            Nueva empresa
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <button onClick={() => setView("home")} style={{ ...darkBtnGhost, padding: "7px 14px", fontSize: 12 }}>← Volver</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Nueva empresa</div>
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>Configura los objetivos base de la cuenta</div>
            </div>
          </div>

          <DarkSection title="Nombre de la empresa">
            <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Nombre de tu empresa"
              style={{ ...darkInput, fontSize: 15, fontWeight: 600 }} />
          </DarkSection>

          <DarkSection title="Acceso del cliente">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2, fontWeight: 500 }}>Correo del cliente</label>
                <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>Usado para iniciar sesión en su portal</div>
                <input type="email" value={newCompanyObj.email || ""} onChange={e => setNewCompanyObj(o => ({ ...o, email: e.target.value }))} placeholder="contacto@empresa.com"
                  style={{ ...darkInput }} />
              </div>
              <div style={{ marginBottom: 16, gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2, fontWeight: 500 }}>Link del cliente</label>
                <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>Comparte este link con el cliente</div>
                <div style={{ padding: "9px 12px", borderRadius: DS.radiusSm, background: DS.bgCard, border: DS.border, fontSize: 11, color: DS.textSecondary, fontFamily: "monospace" }}>
                  {PORTAL_HOST}/cliente/{newCompanyName.toLowerCase().replace(/\s+/g, "-") || "nombre-empresa"}
                </div>
              </div>
            </div>
          </DarkSection>

          <DarkSection title="ROAS">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("ROAS mínimo", "roasMin", "ej. 6", "El piso — por debajo la cuenta está en rojo")}
              {objField("ROAS objetivo", "roasTarget", "ej. 8", "La meta real a la que apuntamos")}
            </div>
          </DarkSection>

          <DarkSection title="Costo por compra (COP)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("Máximo", "costPerPurchaseMax", "ej. 35.000", "El techo — si está por encima hay problema")}
              {objField("Objetivo", "costPerPurchaseTarget", "ej. 18.000", "El costo ideal por cada compra")}
            </div>
          </DarkSection>

          <DarkSection title="Facturación mensual (COP)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("Facturación actual", "revenueActual", "ej. 100.000.000", "Lo que está facturando hoy")}
              {objField("Facturación objetivo", "revenueTarget", "ej. 500.000.000", "A dónde quiere llegar")}
            </div>
          </DarkSection>

          <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 24 }}>
            <div onClick={() => setShowBenchmarks(b => !b)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase" }}>Benchmarks del embudo <span style={{ color: DS.textHint, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></div>
                <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>Objetivos de CTR, CPC, checkout, etc.</div>
              </div>
              <span style={{ color: DS.textMuted, fontSize: 16, transform: showBenchmarks ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
            </div>
            {showBenchmarks && (
              <div style={{ marginTop: 20, borderTop: DS.border, paddingTop: 16 }}>
                <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12 }}>Tráfico</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                  {objField("CPM objetivo", "cpm", "ej. 12.000", "")}
                  {objField("CPC objetivo", "cpcTarget", "ej. 600", "")}
                  {objField("CTR objetivo (%)", "ctrTarget", "ej. 2", "")}
                </div>
                <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12, marginTop: 8 }}>Conversión de página</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                  {objField("% carga mínimo", "pageLoadMin", "ej. 80", "")}
                  {objField("% checkout objetivo", "checkoutRateTarget", "ej. 15", "")}
                  {objField("Costo/pago inic. objetivo", "costPerInitiatedTarget", "ej. 10.000", "")}
                  {objField("% conv. checkout", "checkoutConversionTarget", "ej. 20", "")}
                </div>
              </div>
            )}
          </div>

          <button onClick={createCompany} style={{ ...darkBtn, width: "100%", padding: "13px", fontSize: 14 }}>Crear empresa →</button>
        </div>
      </div>
    );
  }

  // EQUIPO — 6 roles + miembros dentro del CompanyWorkspace
  if (view === "equipo" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="equipo"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "equipo")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando equipo…" />}>
        <CompanyTeam
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
          companySlug={getSlug(selectedCompany)}
          createdVia={selectedCompany.created_via}
          isAdmin={canManageWorkspace}
          /* Repartir credenciales es más angosto que gestionar la cuenta: el PM
             arma el equipo, la llave la da el dueño. */
          puedeDarCredenciales={puedeRepartirCredenciales({
            authMode, esAdminPreview: isAdminPreview, member: currentMember,
          })}
          currentMember={currentMember}
          onLogout={logout}
        />
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // TAREAS — el Centro de Tareas de la empresa dentro del CompanyWorkspace.
  // El TareasDataProvider vive DENTRO de CompanyWorkspace: así los espacios del
  // sidebar están en todas las secciones, no solo acá.
  if (view === "tareas" && selectedCompany) {
    return (
      <>
        <CompanyWorkspace
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
          currentSection="tareas"
          onSectionChange={(s) => {
            if (s === "home") setView("company");
            else if (s === "reportes") setView("reportes");
            else setView(s);
          }}
          onBack={esInforce ? () => { setView("home"); } : null}
          otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
          onSelectCompany={(co) => selectCompanyOrNavigate(co, "tareas")}
          isAdmin={isAdmin}
          currentMember={currentMember}
          onLogout={logout}
        >
          <Suspense fallback={<LazyFallback label="Cargando tareas…" />}>
          <CompanyTareas
            companyId={selectedCompany.id}
            companyName={selectedCompany.name}
            isAdmin={canManageWorkspace}
            currentMember={miMiembro}
            onAbrirPipeline={(briefId, etapa) => { setPipelineFocus({ briefId, etapa }); setView("pipeline"); }}
            onLogout={logout}
          />
          </Suspense>
        </CompanyWorkspace>
      </>
    );
  }

  // PAPELERA — tareas eliminadas de la empresa, restaurables por 30 días
  if (view === "papelera" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="papelera"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "papelera")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando papelera…" />}>
        <CompanyTrashPage
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
        />
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // DESPLIEGUE CREATIVO — dentro del CompanyWorkspace (sidebar izquierda)
  if (view === "despliegue" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="despliegue"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "despliegue")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando despliegue creativo…" />}>
          {(() => {
            // Inforce en modo edición → canvas de edición. Todos los demás
            // (clientes, y Inforce por defecto) → la vista cliente rediseñada.
            const showAdminCanvas = esInforce && despliegueAdminEdit && !verComoCliente;
            if (showAdminCanvas) {
              return (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  <button
                    data-action="new:despliegue.salir-edicion"
                    onClick={() => setDespliegueAdminEdit(false)}
                    style={{ alignSelf: "flex-start", margin: "10px 0 0 20px", display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}
                  >
                    ← Volver a la vista del cliente
                  </button>
                  <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                    <DespliegueCreativo
                      companyId={selectedCompany.id}
                      companyName={selectedCompany.name}
                      isAdmin={canManageWorkspace}
                      isTeamAdmin={isAdmin}
                      currentMember={currentMember}
                      leftOffset={WORKSPACE_SIDEBAR_WIDTH}
                      pipelineType="ads"
                    />
                  </div>
                </div>
              );
            }
            return (
              /* Vista CLIENTE read-only (aislada) — es la que ven clientes Y admin por defecto. */
              <DespliegueClienteView
                companyId={selectedCompany.id}
                companyName={selectedCompany.name}
                pipelineType="ads"
                onNavigate={(s) => setView(s)}
                /* Solo el equipo de Inforce gestiona el despliegue: el dueño de la
                   empresa lo sigue viendo en modo lectura. Por eso va `esInforce`
                   y no `canManageWorkspace`, que también incluye al dueño y al PM.
                   Con "Ver como cliente" prendido se entrega `false` a propósito:
                   es exactamente lo que se está simulando. */
                isAdmin={esInforce && !verComoCliente}
                onEdit={() => setDespliegueAdminEdit(true)}
                esInforce={esInforce}
                verComoCliente={verComoCliente}
                onVerComoCliente={setVerComoCliente}
              />
            );
          })()}
        </Suspense>
      </CompanyWorkspace>
    );
  }

  if (view === "plan" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="plan"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "plan")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando el plan…" />}>
        <PlanView
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
          slug={getSlug(selectedCompany)}
          isAdmin={canManageWorkspace}
        />
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // CONTROL DE CREATIVOS — hoja estilo Google Sheets por empresa
  if (["adlibrary", "crear-imagenes"].includes(view) && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection={view}
        onSectionChange={(s) => setView(s === "home" ? "company" : s)}
        onBack={esInforce ? () => setView("home") : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, view)}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando bibliotecas de anuncios…" />}>
          {view === "crear-imagenes" ? <CreativeImagesPage key={selectedCompany.id} fixedCompanyId={selectedCompany.id} />
            : <AdLibraryPage fixedCompanyId={selectedCompany.id} canManage={canManageWorkspace} />}
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // CONTROL DE CREATIVOS — hoja estilo Google Sheets por empresa
  if (view === "control" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="control"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "control")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando control de creativos…" />}>
          <ControlCreativos
            companyId={selectedCompany.id}
            companyName={selectedCompany.name}
            isAdmin={canManageWorkspace}
            currentMember={currentMember}
          />
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // CONTENT PIPELINE — dentro del CompanyWorkspace
  if (view === "pipeline" && selectedCompany) {
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="pipeline"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={esInforce ? () => { setView("home"); } : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "pipeline")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        {/* El acceso lo decide el rol, no `isAdmin`: el sidebar ya le muestra el
            link al editor y al trafficker (member_access.js), así que negárselo
            acá con un "Coming Soon" era el portal contradiciéndose. El guard de
            arriba ya sacó de esta vista a quien no puede entrar. */}
        <Suspense fallback={<LazyFallback label="Cargando pipeline…" />}>
          {isAdmin || memberCanAccess(currentMember, "pipeline") ? (
            <ContentPipelinePage
              companyId={selectedCompany.id}
              companyName={selectedCompany.name}
              currentMember={miMiembro}
              puedeGestionar={canManageWorkspace}
              /* Generar guiones gasta tokens del pool de la empresa, así que el
                 botón solo aparece donde está habilitado (hoy Peluna Pets) o
                 para quien es del equipo de Inforce y sabe lo que cuesta. */
              puedeGenerarGuiones={puedeGenerarGuiones({
                companyId: selectedCompany.id,
                slug: getSlug(selectedCompany),
                esInforce,
              })}
              focus={pipelineFocus}
              onFocusUsado={() => setPipelineFocus(null)}
            />
          ) : (
            <ComingSoon feature="Content Pipeline" />
          )}
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // EMPRESA — Workspace con Resumen tipo panel de mando (pipeline + despliegue).
  if (view === "company" && selectedCompany) {
    const company = appData.companies.find(c => c.id === selectedCompany.id) || selectedCompany;
    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="home"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={isAdmin ? () => setView("home") : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "company")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        <Suspense fallback={<LazyFallback label="Cargando resumen…" />}>
        <CompanyHome
          esInforce={esInforce}
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
          companySlug={getSlug(selectedCompany)}
          isAdmin={canManageWorkspace}
          currentMember={currentMember}
          onNavigate={(section) => {
            if (section === "reportes") setView("reportes");
            else setView(section);
          }}
          reports={company.reports || []}
          objectives={company.objectives || defaultObjectives}
          calcMetrics={calcMetrics}
        />
        </Suspense>
      </CompanyWorkspace>
    );
  }

  // Legacy: el panel de reportes viejo queda como "reportes" por ahora.
  if (view === "reportes" && selectedCompany) {
    const company = appData.companies.find(c => c.id === selectedCompany.id) || selectedCompany;
    const obj = company.objectives || defaultObjectives;
    const reports = company.reports || [];
    const lastReport = reports[0];
    const lastM = lastReport ? calcMetrics(lastReport) : null;
    const recentReports = reports.slice(0, 4);
    const avgRoas = recentReports.length ? recentReports.reduce((s, r) => s + (calcMetrics(r)?.roas || 0), 0) / recentReports.length : null;
    const avgConversion = recentReports.length ? recentReports.reduce((s, r) => s + r.conversion, 0) / recentReports.length : null;
    const roasStatus = lastM ? (lastM.roas >= obj.roasTarget ? "ok" : lastM.roas >= obj.roasMin ? "warn" : "bad") : "neutral";
    const statusColors = {
      ok: { bg: "rgba(29,185,122,0.1)", color: DS.green, dot: DS.green, label: "En objetivo" },
      warn: { bg: "rgba(245,166,35,0.1)", color: DS.amber, dot: DS.amber, label: "Por debajo del objetivo" },
      bad: { bg: "rgba(226,75,74,0.1)", color: DS.red, dot: DS.red, label: "Crítico" },
      neutral: { bg: DS.bgCard, color: DS.textSecondary, dot: DS.textMuted, label: "Sin datos" },
    };
    const sc = statusColors[roasStatus];

    const Sidebar = () => (
      <div className={`app-sidebar ${sidebarOpen ? "open" : ""}`} style={{ width: 220, background: DS.bgSide, borderRight: DS.border, padding: "24px 0", flexShrink: 0, minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ padding: "0 18px 18px", borderBottom: DS.border, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: isDark ? "#FFFFFF" : "#E24B4A", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5 9.5L11 3" stroke={isDark ? "#E24B4A" : "#FFFFFF"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: DS.textPrimary }}>INFORCE</div>
            <div style={{ fontSize: 9, color: DS.textHint, letterSpacing: "0.08em" }}>REPORTS</div>
          </div>
          <button onClick={toggleTheme} title={isDark ? "Modo claro" : "Modo oscuro"}
            style={{ background: "transparent", border: `1px solid ${DS.textHint}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", fontSize: 13, lineHeight: 1, color: DS.textMuted, flexShrink: 0 }}>
            {isDark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
        </div>
        {isAdmin && <div onClick={() => setView("home")} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textSecondary, cursor: "pointer" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />Panel general
        </div>}
        {isAdmin && <div style={{ fontSize: 9, color: DS.textHint, padding: "14px 18px 6px", letterSpacing: "0.12em", fontWeight: 600 }}>CLIENTES</div>}
        {(isClient ? appData.companies.filter(co => co.id === company.id) : appData.companies).map(co => (
          <div key={co.id}>
            <div onClick={() => { setSelectedCompany(co); setView("company"); }}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, cursor: "pointer",
                color: co.id === company.id ? DS.textPrimary : DS.textSecondary,
                borderLeft: co.id === company.id ? `2px solid ${DS.red}` : "2px solid transparent",
                background: co.id === company.id ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)") : "transparent" }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(226,75,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: DS.red, flexShrink: 0, ...blurVal }}>{co.name.charAt(0)}</div>
              <span style={{ ...blurVal }}>{co.name}</span>
            </div>
            {co.id === company.id && (
              <div style={{ paddingLeft: 32, paddingTop: 2, paddingBottom: 4 }}>
                <div onClick={() => setView("pipeline")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 11.5, color: DS.textSecondary, cursor: "pointer", borderRadius: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = DS.textPrimary; e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = DS.textSecondary; e.currentTarget.style.background = "transparent"; }}>
                  <span>📋</span><span style={{ ...blurVal }}>Content Pipeline</span>
                </div>
                <div onClick={() => setView("despliegue")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 11.5, color: DS.textSecondary, cursor: "pointer", borderRadius: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = DS.textPrimary; e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = DS.textSecondary; e.currentTarget.style.background = "transparent"; }}>
                  <span>🎨</span><span style={{ ...blurVal }}>Despliegue Creativo</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );

    const historialGroups = (() => {
      const typeOrder = [null, "horas", "diario", "semanal", "mensual", "puntual"];
      const columns = typeOrder.map(typeKey => {
        const group = reports.filter(r => (r.type || null) === typeKey);
        const t = typeKey ? REPORT_TYPES[typeKey] : null;
        return {
          typeKey,
          label: t ? `${t.emoji} ${t.label}` : "📋 Sin clasificar",
          color: t ? t.color : DS.textSecondary,
          group,
        };
      }).filter(c => c.group.length > 0);

      return (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          {columns.map(col => (
            <div key={String(col.typeKey)} style={{ background: DS.bgCard, border: DS.border, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 450, overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottom: DS.border }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 50, background: col.color + "22", color: col.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{col.label}</span>
                <span style={{ fontSize: 11, color: DS.textMuted, fontWeight: 600 }}>{col.group.length}</span>
              </div>
              {col.group.map((report, idx) => {
                const m = calcMetrics(report);
                const roasVal = m ? m.roas : (report.roas || 0);
                return (
                  <div key={report.id || idx} onClick={() => { setSelectedReport(report); setSelectedCompany(company); setView("viewReport"); }}
                    style={{ position: "relative", padding: "8px 10px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: DS.border, cursor: "pointer", fontSize: 11 }}>
                    <div style={{ fontWeight: 600, color: DS.textPrimary, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: canManageRpts ? 46 : 0 }}>{report.period || "—"}</div>
                    <div style={{ fontSize: 10, color: DS.textMuted, display: "flex", justifyContent: "space-between" }}>
                      <span>{fmtM(report.conversion || 0)}</span>
                      <span>{roasVal ? `${roasVal.toFixed(1)}×` : "—"}</span>
                    </div>
                    {canManageRpts && (
                      <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 2 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedReport(report); setSelectedCompany(company); setView("editReport"); }}
                          title="Editar reporte"
                          style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", color: DS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = DS.textPrimary; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DS.textMuted; }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5L13.5 4.5M10 4L12 6L5 13H3V11L10 4Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (window.confirm(`¿Seguro que quieres eliminar el reporte "${report.period}"? Esta acción no se puede deshacer.`)) {
                              const newData = { ...appData, companies: appData.companies.map(c => c.id === company.id ? { ...c, reports: (c.reports || []).filter(r => r.id !== report.id) } : c) };
                              updateData(newData);
                              dbDeleteReport(report.id).catch((e) => { logger.error("dbDeleteReport falló", e); toastError("No se pudo eliminar el reporte. Revisá tu conexión e intentá de nuevo."); });
                              const updCo = newData.companies.find(c => c.id === company.id);
                              setSelectedCompany(updCo);
                            }
                          }}
                          title="Eliminar reporte"
                          style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", color: DS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(226,75,74,0.12)"; e.currentTarget.style.color = "#E24B4A"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DS.textMuted; }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4H13M6 4V2.5C6 2.22 6.22 2 6.5 2H9.5C9.78 2 10 2.22 10 2.5V4M4.5 4L5 13C5 13.55 5.45 14 6 14H10C10.55 14 11 13.55 11 13L11.5 4M7 6.5V11.5M9 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    })();

    return (
      <CompanyWorkspace
        companyId={selectedCompany.id}
        companyName={selectedCompany.name}
        currentSection="reportes"
        onSectionChange={(s) => {
          if (s === "home") setView("company");
          else if (s === "reportes") setView("reportes");
          else setView(s);
        }}
        onBack={isAdmin ? () => setView("home") : null}
        otherCompanies={isAdmin ? appData.companies : accessibleCompanies}
        onSelectCompany={(co) => selectCompanyOrNavigate(co, "reportes")}
        isAdmin={isAdmin}
        currentMember={currentMember}
        onLogout={logout}
      >
        {/* Mismo criterio que el pipeline: el acceso lo decide el ROL, no
            `isAdmin` —que solo es cierto para el equipo de Inforce—. El sidebar
            ya le pone el link de Reportes al dueño, al PM y al trafficker
            (member_access.js), así que recibirlos acá con un "Coming Soon" era
            el portal ofreciendo una puerta y cerrándola.
            Al trafficker es al que peor le caía: mirar performance ES su trabajo. */}
        {!(isAdmin || memberCanAccess(currentMember, "reportes")) ? (
          <ComingSoon feature="Reportes" />
        ) : (
        <div style={{ padding: isMobile ? "16px 12px" : "28px", minWidth: 0 }}>
          {/* Topbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {(focusMode || isAdminPreview) && (
                <a
                  href="/equipo/empresas"
                  style={{ padding: "6px 12px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 11, fontWeight: 600, textDecoration: "none" }}
                >
                  ← Volver a Empresas
                </a>
              )}
              <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(226,75,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: DS.red }}>{mask.initial(company.name, company.id)}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{mask.name(company.name, company.id)}</div>
                <div style={{ fontSize: 11, color: DS.textMuted }}>{reports.length} reporte{reports.length !== 1 ? "s" : ""} · cliente activo</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {canManageRpts && <button data-tour="nuevo-reporte" onClick={() => { setSelectedCompany(company); setView("selectReportType"); }} style={{ ...darkBtn, padding: "9px 18px" }}>+ Nuevo reporte</button>}
              {isAdmin && <button onClick={() => startEditCompany(company)} style={{ ...darkBtnGhost, padding: "9px 14px", fontSize: 12 }}>Editar cliente</button>}
              {isAdmin && <button onClick={() => { const typed = window.prompt(`Escribí el nombre "${company.name}" para confirmar que querés eliminarlo y todos sus reportes:`); if (typed === null) return; if (typed.trim() !== company.name.trim()) { window.alert("El nombre no coincide. No se eliminó el cliente."); return; } updateData({ ...appData, companies: appData.companies.filter(c => c.id !== company.id) }); dbDeleteCompany(company.id); setView("home"); }} style={{ ...darkBtnGhost, padding: "9px 14px", fontSize: 12, color: DS.textMuted }}>Eliminar</button>}
            </div>
          </div>

          {/* Client credentials */}
          {/* Compact status + credentials toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot }} />
            </div>
          </div>

          {/* Stats Panel */}
          <CompanyStats company={company} reports={reports} />

          {/* Objetivos + Último reporte — colapsable */}
          <div style={{ marginBottom: 20 }}>
                <button onClick={() => setShowCompanyDetails(v => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textSecondary, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: DS.font, marginBottom: showCompanyDetails ? 12 : 0 }}>
                  {showCompanyDetails ? "▲ Ocultar detalles" : "▼ Objetivos y último reporte"}
                </button>
                {showCompanyDetails && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12 }}>Objetivos de la cuenta</div>
                      {[
                        ["ROAS mínimo", `${obj.roasMin || 4}×`],
                        ["ROAS objetivo", `${obj.roasTarget || 6}×`],
                        ["Costo/compra máx.", `$${fmt(obj.costPerPurchaseMax || 0)}`],
                        ["Costo/compra obj.", `$${fmt(obj.costPerPurchaseTarget || 0)}`],
                        ["Facturación objetivo", fmtM(obj.revenueTarget || 0)],
                      ].map(([label, val], i, arr) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < arr.length - 1 ? DS.border : "none", fontSize: 12 }}>
                          <span style={{ color: DS.textSecondary }}>{label}</span>
                          <span style={{ fontWeight: 700, color: DS.textPrimary }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    {lastM && (
                      <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "16px" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12 }}>
                          Último reporte <span style={{ color: DS.textHint, fontWeight: 400, textTransform: "none" }}>{lastReport.period}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[
                            { label: "ROAS", val: `${lastM.roas.toFixed(2)}×`, color: lastM.roas >= obj.roasTarget ? DS.green : lastM.roas >= obj.roasMin ? DS.amber : DS.red },
                            { label: "Costo/compra", val: `$${fmt(lastReport.spend / lastReport.purchases)}`, color: lastReport.spend / lastReport.purchases <= obj.costPerPurchaseTarget ? DS.green : DS.red },
                            { label: "Conversión", val: fmtM(lastReport.conversion), color: DS.textPrimary },
                            { label: "Compras", val: lastReport.purchases, color: DS.textPrimary },
                          ].map((s, i) => (
                            <div key={i} style={{ padding: "8px 10px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                              <div style={{ fontSize: 9, color: DS.textMuted, marginBottom: 2 }}>{s.label}</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
          </div>

          {/* Historial de reportes — agrupado por tipo */}
          <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12 }}>Historial de reportes</div>
          {reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: DS.textMuted, fontSize: 13, background: DS.bgCard, border: DS.border, borderRadius: DS.radius }}>No hay reportes aún</div>
          ) : historialGroups}
        </div>
        )}
      </CompanyWorkspace>
    );
  }


  if (view === "company" && selectedCompany) {
    const company = appData.companies.find(c => c.id === selectedCompany.id) || selectedCompany;
    const obj = company.objectives || defaultObjectives;
    const reports = company.reports || [];
    const lastReport = reports[0];
    const lastM = lastReport ? calcMetrics(lastReport) : null;

    // Promedio de últimos 4 reportes
    const recentReports = reports.slice(0, 4);
    const avgRoas = recentReports.length ? recentReports.reduce((s, r) => s + (calcMetrics(r)?.roas || 0), 0) / recentReports.length : null;
    const avgSpend = recentReports.length ? recentReports.reduce((s, r) => s + r.spend, 0) / recentReports.length : null;
    const avgConversion = recentReports.length ? recentReports.reduce((s, r) => s + r.conversion, 0) / recentReports.length : null;
    const avgPurchases = recentReports.length ? recentReports.reduce((s, r) => s + r.purchases, 0) / recentReports.length : null;

    // Estado global de la cuenta
    const roasStatus = lastM ? (lastM.roas >= obj.roasTarget ? "ok" : lastM.roas >= obj.roasMin ? "warn" : "bad") : "neutral";
    const statusLabel = { ok: "En objetivo", warn: "Por debajo del objetivo", bad: "Crítico — por debajo del mínimo", neutral: "Sin datos" };
    const statusColors = { ok: { bg: "#EAF3DE", color: DS.green, dot: DS.green }, warn: { bg: "#FAEEDA", color: "#854F0B", dot: DS.amber }, bad: { bg: "#FCEBEB", color: "#A32D2D", dot: "#E24B4A" }, neutral: { bg: DS.bgCard, color: DS.textMuted, dot: "#bbb" } };
    const sc = statusColors[roasStatus];

    const ObjRow = ({ label, value, hint }) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: DS.border }}>
        <div>
          <span style={{ fontSize: 13, color: DS.textSecondary }}>{label}</span>
          {hint && <span style={{ fontSize: 11, color: DS.textMuted, marginLeft: 6 }}>{hint}</span>}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary }}>{value}</span>
      </div>
    );

    const StatCard = ({ label, value, sub, good, bad, warn: isWarn }) => {
      const col = good ? DS.green : bad ? "#E24B4A" : isWarn ? DS.amber : DS.textPrimary;
      return (
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 5 }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 3 }}>{sub}</div>}
        </div>
      );
    };

    return (
      <div style={{ ...S.app, position: "relative" }}>
        {!isDark && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.8 }} />}
        {/* Topbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          {isAdmin && <button onClick={() => setView("home")} style={S.btn}>← Empresas</button>}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: DS.bgSide, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: DS.textPrimary }}>{mask.initial(company.name, company.id)}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{mask.name(company.name, company.id)}</div>
                <div style={{ fontSize: 11, color: DS.textMuted }}>{reports.length} reporte{reports.length !== 1 ? "s" : ""} · cliente activo</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {canManageRpts && <button onClick={() => { setSelectedCompany(company); setView("selectReportType"); }} style={S.btnP}>+ Nuevo reporte</button>}
            {isAdmin && <button onClick={() => startEditCompany(company)} style={{ ...S.btn }}>Editar cliente</button>}
            {isAdmin && <button onClick={() => {
              const typed = window.prompt(`Escribí el nombre "${company.name}" para confirmar que querés eliminarlo y todos sus reportes:`);
              if (typed === null) return;
              if (typed.trim() !== company.name.trim()) { window.alert("El nombre no coincide. No se eliminó el cliente."); return; }
              const newData = { ...appData, companies: appData.companies.filter(c => c.id !== company.id) };
              updateData(newData);
              dbDeleteCompany(company.id);
              setView("home");
            }} style={{ background: "none", border: "none", fontSize: 11, color: "#ccc", cursor: "pointer", padding: "2px 8px" }}>
              Eliminar
            </button>}
          </div>
        </div>

        {/* Stats Panel */}
        <CompanyStats company={company} reports={reports} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {/* Objetivos de la cuenta */}
          <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "16px 18px" }}>
            <div style={S.sLabel}>Objetivos de la cuenta</div>
            <ObjRow label="ROAS mínimo" value={`${obj.roasMin || 4}×`} hint="piso" />
            <ObjRow label="ROAS objetivo" value={`${obj.roasTarget || 6}×`} hint="meta" />
            <ObjRow label="Costo por compra máximo" value={`$${fmt(obj.costPerPurchaseMax || 0)}`} hint="techo" />
            <ObjRow label="Costo por compra objetivo" value={`$${fmt(obj.costPerPurchaseTarget || 0)}`} hint="ideal" />
            <ObjRow label="Facturación actual" value={fmtM(obj.revenueActual || 0)} hint="hoy" />
            <ObjRow label="Facturación objetivo" value={fmtM(obj.revenueTarget || 0)} hint="meta" />
          </div>

          {/* Panel derecho: último reporte + promedio */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lastM ? (
              <>
                <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "14px 16px" }}>
                  <div style={S.sLabel}>Último reporte <span style={{ color: DS.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{lastReport.period}</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <StatCard label="ROAS" value={`${lastM.roas.toFixed(2)}×`} sub={`objetivo: ${obj.roasTarget}×`} good={lastM.roas >= obj.roasTarget} warn={lastM.roas >= obj.roasMin && lastM.roas < obj.roasTarget} bad={lastM.roas < obj.roasMin} />
                    <StatCard label="Costo por compra" value={`$${fmt(lastReport.spend / lastReport.purchases)}`} sub={`máx: $${fmt(obj.costPerPurchaseMax)}`} good={lastReport.spend / lastReport.purchases <= obj.costPerPurchaseTarget} bad={lastReport.spend / lastReport.purchases > obj.costPerPurchaseMax} warn={lastReport.spend / lastReport.purchases > obj.costPerPurchaseTarget && lastReport.spend / lastReport.purchases <= obj.costPerPurchaseMax} />
                    <StatCard label="Conversión" value={fmtM(lastReport.conversion)} sub={`gasto: ${fmtM(lastReport.spend)}`} />
                    <StatCard label="Compras" value={lastReport.purchases} sub={`${lastReport.initiatedCheckouts} pagos inic.`} />
                  </div>
                </div>

                {recentReports.length > 1 && (
                  <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "14px 16px" }}>
                    <div style={S.sLabel}>Promedio últimas {recentReports.length} semanas</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <StatCard label="ROAS promedio" value={`${avgRoas.toFixed(2)}×`} good={avgRoas >= obj.roasTarget} warn={avgRoas >= obj.roasMin && avgRoas < obj.roasTarget} bad={avgRoas < obj.roasMin} />
                      <StatCard label="Facturación prom. sem." value={fmtM(avgConversion)} sub={`gasto prom: ${fmtM(avgSpend)}`} />
                    </div>
                    {obj.revenueTarget > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: DS.textMuted, marginBottom: 4 }}>
                          <span>Progreso hacia facturación objetivo</span>
                          <span>{((avgConversion * 4.3 / obj.revenueTarget) * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ background: "#E8E6E0", borderRadius: 20, height: 6 }}>
                          <div style={{ background: avgConversion * 4.3 >= obj.revenueTarget ? DS.green : "#E24B4A", height: 6, borderRadius: 20, width: `${Math.min(100, (avgConversion * 4.3 / obj.revenueTarget) * 100).toFixed(0)}%`, transition: "width 0.3s" }} />
                        </div>
                        <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>
                          ~${fmtM(avgConversion * 4.3)}/mes estimado vs ${fmtM(obj.revenueTarget)} objetivo
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ background: DS.bgCard, borderRadius: DS.radius, padding: "32px 16px", textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 12 }}>Aún no hay reportes para mostrar datos</div>
                {canManageRpts
                  ? <button onClick={() => { setSelectedCompany(company); setView("selectReportType"); }} style={{ ...S.btnP, fontSize: 13, padding: "8px 16px" }}>Crear primer reporte →</button>
                  : <div style={{ fontSize: 11, color: DS.textHint }}>Pedile al owner o trafficker que cree el primer reporte.</div>}
              </div>
            )}
          </div>
        </div>

        {/* Lista de reportes */}
        <div style={{ borderTop: DS.border, paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={S.sLabel}>Historial de reportes</div>
            {reports.length > 0 && <button onClick={() => { setSelectedCompany(company); setView("selectReportType"); }} style={{ ...S.btn, fontSize: 12 }}>+ Agregar reporte</button>}
          </div>
          {reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: DS.textMuted, fontSize: 13 }}>No hay reportes aún</div>
          ) : (() => {
            const typeOrder = ["horas", "diario", "semanal", "mensual", null];
            const LightReportRow = (report, i) => {
              const m = calcMetrics(report);
              if (!m) return null;
              const rOk = m.roas >= obj.roasTarget;
              const rWarn = m.roas >= obj.roasMin && m.roas < obj.roasTarget;
              const costPerPurchase = report.spend / report.purchases;
              return (
                <div key={report.id || i}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, marginBottom: 6, background: "white", border: "0.5px solid #EEECE6", transition: "border-color 0.15s" }}>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { setSelectedReport(report); setSelectedCompany(company); setView("viewReport"); }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{report.period}</div>
                    <div style={{ fontSize: 11, color: DS.textMuted, display: "flex", gap: 12 }}>
                      <span>{report.purchases} compras</span>
                      <span>{fmtM(report.conversion)} ingresos</span>
                      <span>{fmtM(report.spend)} gasto</span>
                      <span>costo/compra ${fmt(costPerPurchase)}</span>
                    </div>
                  </div>
                  <span style={{ background: rOk ? "#EAF3DE" : rWarn ? "#FAEEDA" : "#FCEBEB", color: rOk ? "#3B6D11" : rWarn ? "#854F0B" : "#A32D2D", fontSize: 13, fontWeight: 700, padding: "4px 14px", borderRadius: 20, flexShrink: 0 }}>
                    {m.roas.toFixed(2)}×
                  </span>
                  <button onClick={e => { e.stopPropagation(); setSelectedReport(report); setSelectedCompany(company); setView("editReport"); }}
                    style={{ padding: "4px 12px", borderRadius: 50, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", color: "#666", cursor: "pointer", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                    Editar
                  </button>
                  {isAdmin && (
                    <button onClick={e => { e.stopPropagation(); if (window.confirm(`¿Eliminar el reporte "${report.period}"? Esta acción no se puede deshacer.`)) { const newData = { ...appData, companies: appData.companies.map(c => c.id === company.id ? { ...c, reports: (c.reports || []).filter(r => r.id !== report.id) } : c) }; updateData(newData); dbDeleteReport(report.id).catch((e) => { logger.error("dbDeleteReport falló", e); toastError("No se pudo eliminar el reporte. Revisá tu conexión e intentá de nuevo."); }); const updCo = newData.companies.find(c => c.id === company.id); setSelectedCompany(updCo); } }}
                      style={{ padding: "4px 10px", borderRadius: 50, border: "1px solid rgba(226,75,74,0.3)", background: "transparent", color: "#E24B4A", cursor: "pointer", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                      Eliminar
                    </button>
                  )}
                </div>
              );
            };
            return typeOrder.map(typeKey => {
              const group = reports.filter(r => (r.type || null) === typeKey);
              if (!group.length) return null;
              const t = typeKey ? REPORT_TYPES[typeKey] : null;
              return (
                <div key={String(typeKey)} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {t
                      ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 50, background: t.color + "18", color: t.color, letterSpacing: "0.06em", textTransform: "uppercase", border: `1px solid ${t.color}33` }}>{t.emoji} {t.label}</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 50, background: "#F5F4F0", color: "#888", letterSpacing: "0.06em", textTransform: "uppercase" }}>📋 Sin clasificar</span>
                    }
                    <div style={{ flex: 1, height: 1, background: t ? t.color + "22" : "#EEECE6" }} />
                  </div>
                  {group.map((report, i) => LightReportRow(report, i))}
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  }

  if (view === "selectReportType" && selectedCompany) return <ReportTypeSelector company={selectedCompany} onSelect={(type) => { setReportType(type); setView("newReport"); }} onCancel={() => setView("company")} />;
  if (view === "newReport"   && selectedCompany) return <NewReportForm company={selectedCompany} reportType={reportType} onSave={saveReport} onCancel={() => setView("company")} />;
  if (view === "editReport"  && selectedReport && selectedCompany) return <EditReportForm company={selectedCompany} report={selectedReport} onSave={updateReport} onCancel={() => setView("company")} onDelete={deleteReport} />;
  if (view === "viewReport"  && selectedReport && selectedCompany) {
    const saveReportInPlace = isAdmin ? (updatedReport) => {
      const newData = {
        ...appData,
        companies: appData.companies.map(c =>
          c.id === selectedCompany.id
            ? { ...c, reports: (c.reports || []).map(r => r.id === updatedReport.id ? updatedReport : r) }
            : c
        ),
      };
      updateData(newData);
      dbSaveReport(selectedCompany.id, updatedReport).catch((e) => { logger.error("dbSaveReport falló", e); toastError("No se pudo guardar el reporte. Revisá tu conexión e intentá de nuevo."); });
      const updatedCompany = newData.companies.find(c => c.id === selectedCompany.id);
      setSelectedCompany(updatedCompany);
      setSelectedReport(updatedReport);
    } : undefined;
    return <ReportView key={selectedReport.id} report={selectedReport} company={selectedCompany} onBack={() => setView("company")} onSaveReport={saveReportInPlace} />;
  }

  if (view === "editCompany" && selectedCompany && isAdmin) {
    // objField delega en NumField (soporte de decimales y typing fluido).
    const objField = (label, key, placeholder, hint) => (
      <NumField
        label={label}
        hint={hint}
        placeholder={placeholder}
        value={newCompanyObj[key]}
        onChange={(n) => setNewCompanyObj(o => ({ ...o, [key]: n }))}
        darkInput={darkInput}
        DS={DS}
      />
    );
    return (
      <div style={{ fontFamily: "'Inter','DM Sans',sans-serif", background: DS.bg, minHeight: "100vh", color: DS.textPrimary, display: "flex", width: "100%" }}>
        <div style={{ width: 210, background: DS.bgSide, borderRight: DS.border, padding: "20px 0", flexShrink: 0, minHeight: "100vh" }}>
          <div style={{ padding: "0 18px 18px", borderBottom: DS.border, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "rgba(226,75,74,0.15)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 3" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", background: isDark ? "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.75) 100%)" : "linear-gradient(90deg, #37352F 0%, rgba(55,53,47,0.75) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>INFORCE</div>
              <div style={{ fontSize: 9, color: DS.textHint, letterSpacing: "0.08em" }}>REPORTS</div>
            </div>
          </div>
          <div onClick={() => setView("home")} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textSecondary, cursor: "pointer" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />Panel general
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 22px", fontSize: 12.5, color: DS.textPrimary, borderLeft: `2px solid ${DS.red}`, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
            {selectedCompany.name}
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <button onClick={() => setView("company")} style={{ ...darkBtnGhost, padding: "7px 14px", fontSize: 12 }}>← Volver</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Editar cliente — {selectedCompany.name}</div>
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>Modifica el nombre, PIN y objetivos de la cuenta</div>
            </div>
          </div>

          <DarkSection title="Nombre de la empresa">
            <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Nombre de tu empresa"
              style={{ ...darkInput, fontSize: 15, fontWeight: 600 }} />
          </DarkSection>

          <DarkSection title="Acceso del cliente">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2, fontWeight: 500 }}>Correo del cliente</label>
                <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>Usado para iniciar sesión en su portal</div>
                <input type="email" value={newCompanyObj.email || ""} onChange={e => setNewCompanyObj(o => ({ ...o, email: e.target.value }))} placeholder="contacto@empresa.com"
                  style={{ ...darkInput }} />
              </div>
              <div style={{ marginBottom: 16, gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 2, fontWeight: 500 }}>Link del cliente</label>
                <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>Se genera automáticamente con el nombre</div>
                <div style={{ padding: "9px 12px", borderRadius: DS.radiusSm, background: DS.bgCard, border: DS.border, fontSize: 11, color: DS.textSecondary, fontFamily: "monospace" }}>
                  {PORTAL_HOST}/cliente/{newCompanyName.toLowerCase().replace(/\s+/g, "-") || "nombre-empresa"}
                </div>
              </div>
            </div>
          </DarkSection>

          <DarkSection title="ROAS">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("ROAS mínimo", "roasMin", "ej. 6", "El piso — por debajo la cuenta está en rojo")}
              {objField("ROAS objetivo", "roasTarget", "ej. 8", "La meta real a la que apuntamos")}
            </div>
          </DarkSection>

          <DarkSection title="Costo por compra (COP)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("Máximo", "costPerPurchaseMax", "ej. 35.000", "El techo — si está por encima hay problema")}
              {objField("Objetivo", "costPerPurchaseTarget", "ej. 18.000", "El costo ideal por cada compra")}
            </div>
          </DarkSection>

          <DarkSection title="Facturación mensual (COP)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {objField("Facturación actual", "revenueActual", "ej. 100.000.000", "Lo que está facturando hoy")}
              {objField("Facturación objetivo", "revenueTarget", "ej. 500.000.000", "A dónde quiere llegar")}
            </div>
          </DarkSection>

          <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, padding: "20px", marginBottom: 24 }}>
            <div onClick={() => setShowBenchmarks(b => !b)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase" }}>Benchmarks del embudo <span style={{ color: DS.textHint, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></div>
                <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>Objetivos de CTR, CPC, checkout, etc.</div>
              </div>
              <span style={{ color: DS.textMuted, fontSize: 16, transform: showBenchmarks ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
            </div>
            {showBenchmarks && (
              <div style={{ marginTop: 20, borderTop: DS.border, paddingTop: 16 }}>
                <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12 }}>Tráfico</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                  {objField("CPM objetivo", "cpm", "ej. 12.000", "")}
                  {objField("CPC objetivo", "cpcTarget", "ej. 600", "")}
                  {objField("CTR objetivo (%)", "ctrTarget", "ej. 2", "")}
                </div>
                <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 12, marginTop: 8 }}>Conversión de página</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                  {objField("% carga mínimo", "pageLoadMin", "ej. 80", "")}
                  {objField("% checkout objetivo", "checkoutRateTarget", "ej. 15", "")}
                  {objField("Costo/pago inic. objetivo", "costPerInitiatedTarget", "ej. 10.000", "")}
                  {objField("% conv. checkout", "checkoutConversionTarget", "ej. 20", "")}
                </div>
              </div>
            )}
          </div>

          <button onClick={saveEditCompany} style={{ ...darkBtn, width: "100%", padding: "13px", fontSize: 14 }}>Guardar cambios →</button>
        </div>
      </div>
    );
  }
  return null;
}

// AppResolver: pantalla intermedia en /app que resuelve la company del user
// logueado y redirige a su workspace. Si no tiene company → /onboarding.
// Si no hay session → /login.
function AppResolver({ onResolved, onNoCompany, onNoSession }) {
  const [resolving, setResolving] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getCurrentSession();
      if (cancelled) return;
      if (!session?.user) {
        onNoSession?.();
        return;
      }
      // Resolver la company con la MISMA lógica robusta que usa la app interna
      // (resolveUserAccess: owner_user_id, client_users, o company_team_members.email).
      // Antes acá se usaba findOwnedCompany, que solo miraba owner_user_id: si ese
      // id quedaba desfasado (p.ej. tras re-signup) el usuario autenticaba bien pero
      // era mandado a /onboarding como si su empresa no existiera, aunque su email
      // sí estuviera ligado a la empresa en company_team_members.
      const access = await resolveUserAccess(session);
      if (cancelled) return;
      // Un admin del equipo Inforce no tiene "empresa propia" acá → NO mandarlo
      // al onboarding de cliente (quedaba en loop). Va a su zona de equipo.
      if (access.role === "admin") {
        window.location.assign("/equipo");
        return;
      }
      const company = access.companies?.[0] || null;
      if (!company) {
        onNoCompany?.();
        return;
      }
      onResolved?.(company.slug || company.id);
    })().catch((e) => {
      // Antes: se quedaba en el spinner para siempre. Ahora si algo falla,
      // cerramos sesión y mandamos a /login para no dejar a nadie trabado.
      logger.error("[AppResolver] error resolviendo acceso:", e?.message || e);
      if (!cancelled) { setResolving(false); setFailed(true); }
    });
    return () => { cancelled = true; };
  }, [onResolved, onNoCompany, onNoSession]);

  const forceLogout = async () => {
    try { await database.auth.signOut(); } catch { /* ignore */ }
    try { localStorage.removeItem("inforce_auth"); localStorage.removeItem("inforce_member_id"); } catch { /* ignore */ }
    window.location.assign("/login");
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#06060A",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: DS.font, color: "rgba(255,255,255,0.6)", fontSize: 13, gap: 16,
    }}>
      {failed ? (
        <>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>No pudimos cargar tu workspace.</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 320, textAlign: "center", lineHeight: 1.5 }}>
            Puede que tu acceso no esté vinculado a una empresa. Cerrá sesión e intentá de nuevo, o pedile a tu asesor que revise tu acceso.
          </span>
          <button onClick={forceLogout} style={{
            padding: "10px 20px", borderRadius: 50, border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
          }}>Cerrar sesión</button>
        </>
      ) : (
        <>
          <BrandLoader fullscreen={false} label={resolving ? "Cargando tu workspace…" : "Redirigiendo…"} />
          {/* Escape siempre disponible: si el spinner tarda, el usuario no queda atrapado. */}
          <button onClick={forceLogout} style={{
            marginTop: 6, padding: "6px 14px", borderRadius: 50, border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
          }}>¿Trabado? Cerrar sesión</button>
        </>
      )}
    </div>
  );
}
