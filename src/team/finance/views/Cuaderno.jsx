// Vista Cuaderno — réplica del Google Sheet de finanzas de Jose.
// 3 zonas verticales:
//   Zona 1: INGRESOS | GASTOS resumen | TABLA DE BALANCE
//   Zona 2: SITUACIÓN ACTUAL | BALANCE ACTUAL vs FUTURO
//   Zona 3: AGENCIA | VIVIR | LIFESTYLE (detalle editable inline)

import { useEffect, useMemo, useState } from "react";
import { DS } from "../../../lib/design.js";
import { PeriodSelector } from "../components/PeriodSelector.jsx";
import { CuadernoIngresosTable } from "../components/CuadernoIngresosTable.jsx";
import { CuadernoGastosResumen } from "../components/CuadernoGastosResumen.jsx";
import { CuadernoBalanceCard } from "../components/CuadernoBalanceCard.jsx";
import { CuadernoSituacionBalance } from "../components/CuadernoSituacionBalance.jsx";
import { CuadernoCategoryTable } from "../components/CuadernoCategoryTable.jsx";
import { CuadernoGastosDiarios } from "../components/CuadernoGastosDiarios.jsx";
import { getPeriodRange } from "../lib/finance_math.js";
import { logger } from "../../../lib/logger.js";

const ZOOM_LEVELS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5];
const ZOOM_DEFAULT = 1.0;
const ZOOM_STORAGE_KEY = "finance_cuaderno_zoom";

function readZoom() {
  if (typeof window === "undefined") return ZOOM_DEFAULT;
  const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
  const n = Number(raw);
  return ZOOM_LEVELS.includes(n) ? n : ZOOM_DEFAULT;
}

// Las 3 categorías top-level que matchea el sheet de Jose.
// Mapeo: legacyKeys cubren los `scope` text legacy. scopeId se resuelve runtime.
const BUCKET_DEFS = [
  {
    label: "Agencia",   icon: "🏢", color: DS.red,
    legacyKeys: ["agency", "content_capex"],
    includeInParaMi: false,
    allowCobroTC: false,
    anchorId: "scope-agencia",
  },
  {
    label: "Vivir",     icon: "🏠", color: DS.red,
    legacyKeys: ["family"],
    includeInParaMi: true,
    allowCobroTC: false,
    anchorId: "scope-vivir",
  },
  {
    label: "Lifestyle", icon: "✨", color: DS.red,
    legacyKeys: ["personal"],
    includeInParaMi: true,
    allowCobroTC: true,
    anchorId: "scope-lifestyle",
  },
];

export function Cuaderno({ finance }) {
  const { scopes, createScope } = finance;
  const [periodKey, setPeriodKey] = useState("this_month");
  const [customRange, setCustomRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  });
  const [zoom, setZoom] = useState(readZoom);
  const setZoomPersist = (z) => {
    setZoom(z);
    if (typeof window !== "undefined") window.localStorage.setItem(ZOOM_STORAGE_KEY, String(z));
  };
  const zoomStep = (dir) => {
    const i = ZOOM_LEVELS.indexOf(zoom);
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + dir))];
    setZoomPersist(next);
  };

  // Auto-crear scopes "Vivir" y "Lifestyle" si no existen (Agencia ya existe en el seed).
  useEffect(() => {
    if (!scopes || scopes.length === 0) return;
    const ensure = async (name, icon, legacyKey) => {
      const exists = scopes.some(
        (s) => s.name?.toLowerCase() === name.toLowerCase() ||
               s.legacy_key === legacyKey
      );
      if (exists) return;
      try {
        await createScope({
          name, icon, legacy_key: legacyKey,
          color: DS.red, allow_income: false, allow_expense: true,
          is_default: false, archived: false,
          sort_order: name === "Vivir" ? 5 : 6,
        });
      } catch (e) {
        // Silencio: si no se puede crear (permission, dup, etc.), seguimos —
        // los buckets siguen funcionando vía legacyKeys.
        logger.warn(`[Cuaderno] No se pudo auto-crear scope ${name}:`, e?.message || e);
      }
    };
    ensure("Vivir", "🏠", "family");
    ensure("Lifestyle", "✨", "personal");
    // No depende de createScope — solo lo llamamos una vez por mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopes?.length]);

  // Resolver scopeId actual de cada bucket si existe en `scopes`.
  const scopeBuckets = useMemo(() => {
    return BUCKET_DEFS.map((b) => {
      const matched = (scopes || []).find(
        (s) => s.name?.toLowerCase() === b.label.toLowerCase() ||
               (b.legacyKeys && b.legacyKeys.includes(s.legacy_key))
      );
      return { ...b, scopeId: matched?.id || null };
    });
  }, [scopes]);

  const { from, to } = useMemo(
    () => getPeriodRange(periodKey, customRange),
    [periodKey, customRange]
  );

  const jumpToDetail = (bucket) => {
    const el = document.getElementById(bucket.anchorId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Toolbar: período + zoom */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Período</span>
        <PeriodSelector value={periodKey} onChange={setPeriodKey} customRange={customRange} onCustomChange={setCustomRange} />
        <div style={{ flex: 1 }} />
        {/* Zoom controls — estilo banco de creativos */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 2,
          padding: 2,
          background: DS.bgCard,
          border: `1px solid ${DS.textHint}`,
          borderRadius: 50,
        }}>
          <ZoomBtn onClick={() => zoomStep(-1)} disabled={zoom <= ZOOM_LEVELS[0]} label="−" />
          <button
            onClick={() => setZoomPersist(ZOOM_DEFAULT)}
            title="Reset zoom"
            style={{
              padding: "4px 10px", borderRadius: 50, border: "none",
              background: "transparent", color: DS.textSecondary,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: DS.font, fontVariantNumeric: "tabular-nums",
              minWidth: 44,
            }}
          >{Math.round(zoom * 100)}%</button>
          <ZoomBtn onClick={() => zoomStep(1)} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} label="+" />
        </div>
      </div>

      {/* Contenedor con scroll horizontal — el sidebar de Inforce queda fijo */}
      <div style={{
        overflowX: "auto",
        marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32,
      }}>
        <div style={{
          minWidth: 1320,
          display: "flex", flexDirection: "column", gap: 6,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          width: `${100 / zoom}%`,
        }}>
          {/* Zona 1 — 3 paneles, pegados */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 0.8fr)",
            gap: 4,
            alignItems: "start",
          }}>
            <CuadernoIngresosTable finance={finance} from={from} to={to} />
            <CuadernoGastosResumen
              finance={finance}
              from={from}
              to={to}
              scopeBuckets={scopeBuckets}
              onJumpToDetail={jumpToDetail}
            />
            <CuadernoBalanceCard
              finance={finance}
              from={from}
              to={to}
              scopeBuckets={scopeBuckets}
            />
          </div>

          {/* Zona 2 — Situación Actual + Balance UNIFICADOS */}
          <CuadernoSituacionBalance finance={finance} scopeBuckets={scopeBuckets} />

          {/* Zona 3 — 3 paneles detalle compactos. Todas las categorías
              muestran columna Tipo (icono compacto ⟳/· para no ocupar espacio). */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 4,
            alignItems: "start",
          }}>
            {scopeBuckets.map((sb) => (
              <CuadernoCategoryTable
                key={sb.label}
                scopeBucket={sb}
                finance={finance}
                from={from}
                to={to}
                anchorId={sb.anchorId}
                onlyRecurring
                showTypeColumn
              />
            ))}
          </div>

          {/* Zona 4 — Gastos del día. Toma el ancho de la zona 1's primer panel
              para no desperdiciar; alineado a la izquierda. */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 2fr)",
            gap: 4,
            alignItems: "start",
          }}>
            <CuadernoGastosDiarios
              scopeBucket={scopeBuckets.find((sb) => sb.label === "Lifestyle")}
              finance={finance}
              from={from}
              to={to}
            />
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomBtn({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 22, borderRadius: 50, border: "none",
        background: "transparent",
        color: disabled ? DS.textHint : DS.textPrimary,
        fontSize: 14, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: DS.font,
      }}
    >{label}</button>
  );
}
