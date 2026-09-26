import { useState } from "react";
import { DS } from "../../lib/design.js";
import { upsertMonth } from "./db.js";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Card del mes actual con los 3 hitos del Planificador. Cada hito tiene
// target + actual + barra de progreso. Edición inline con save on-blur.
// El "días transcurridos" te dice si vas en ritmo: día 15 con 50% del
// hito = en ritmo, día 15 con 20% = atrás.
export function NorthStarMonthCard({ year, month, data, onUpdate }) {
  const [saving, setSaving] = useState(false);

  if (!data) {
    return (
      <div style={{ padding: 16, borderRadius: 14, background: DS.bgCard, border: DS.border, color: DS.textMuted, fontSize: 12 }}>
        No hay plan para {MONTH_NAMES[month - 1]} {year}. Corré <code>db/north_star.sql</code> en Supabase para seedear.
      </div>
    );
  }

  const persist = async (patch) => {
    setSaving(true);
    const next = await upsertMonth({ ...data, ...patch });
    if (next) onUpdate(next);
    setSaving(false);
  };

  // Días transcurridos del mes (sirve como benchmark de ritmo).
  const today = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNum = (today.getFullYear() === year && today.getMonth() + 1 === month)
    ? today.getDate()
    : daysInMonth;
  const dayPct = Math.min(100, Math.round((dayNum / daysInMonth) * 100));

  return (
    <div style={{
      borderRadius: 14, background: DS.bgCard, border: DS.border,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
            🎯 NORTE MENSUAL
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: DS.textPrimary, marginTop: 2 }}>
            {MONTH_NAMES[month - 1]} {year}
            {data.title && <span style={{ fontSize: 12, fontWeight: 600, color: DS.textMuted, marginLeft: 8 }}>· {data.title}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: DS.textMuted }}>Día {dayNum} de {daysInMonth}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            {dayPct}% del mes
          </div>
        </div>
      </div>

      {/* Hito Financiero */}
      <HitoBlock
        icon="💰"
        title="Hito Financiero"
        accent={DS.green}
        description={data.hito_financiero}
        descriptionField="hito_financiero"
        target={data.hito_financiero_target}
        actual={data.hito_financiero_actual}
        targetField="hito_financiero_target"
        actualField="hito_financiero_actual"
        unit="USD"
        formatValue={(v) => `$${Math.round(v / 1000)}K`}
        onPersist={persist}
        dayPct={dayPct}
      />

      {/* Hito Operativo: 2 metrics (videos + views) */}
      <div style={{
        padding: "12px 14px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)", border: DS.border,
        marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📹</span>
          <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>Hito Operativo</div>
        </div>
        <input
          defaultValue={data.hito_operativo || ""}
          onBlur={(e) => persist({ hito_operativo: e.target.value })}
          placeholder="Descripción del hito operativo…"
          style={inputStyle}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <ProgressMini
            label="Videos publicados"
            target={data.hito_operativo_videos_target || 0}
            actual={data.hito_operativo_videos_actual || 0}
            targetField="hito_operativo_videos_target"
            actualField="hito_operativo_videos_actual"
            onPersist={persist}
            dayPct={dayPct}
            formatValue={(v) => v.toString()}
          />
          <ProgressMini
            label="Vistas generadas"
            target={data.hito_operativo_views_target || 0}
            actual={data.hito_operativo_views_actual || 0}
            targetField="hito_operativo_views_target"
            actualField="hito_operativo_views_actual"
            onPersist={persist}
            dayPct={dayPct}
            formatValue={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()}
          />
        </div>
      </div>

      {/* Hito de Producto */}
      <div style={{
        padding: "12px 14px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)", border: DS.border,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>🚀</span>
          <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>Hito de Producto</div>
        </div>
        <input
          defaultValue={data.hito_producto || ""}
          onBlur={(e) => persist({ hito_producto: e.target.value })}
          placeholder="Descripción del hito de producto…"
          style={inputStyle}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <ProgressMini
            label="Clientes activos"
            target={data.hito_producto_clientes_target || 0}
            actual={data.hito_producto_clientes_actual || 0}
            targetField="hito_producto_clientes_target"
            actualField="hito_producto_clientes_actual"
            onPersist={persist}
            dayPct={dayPct}
            formatValue={(v) => v.toString()}
          />
          <ProgressMini
            label="Facturación clientes (COP)"
            target={data.hito_producto_facturacion_target || 0}
            actual={data.hito_producto_facturacion_actual || 0}
            targetField="hito_producto_facturacion_target"
            actualField="hito_producto_facturacion_actual"
            onPersist={persist}
            dayPct={dayPct}
            formatValue={(v) => v >= 1000000000 ? `${(v / 1000000000).toFixed(1)}B` : v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v.toString()}
          />
        </div>
      </div>

      {saving && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 8 }}>Guardando…</div>}
    </div>
  );
}

function HitoBlock({ icon, title, accent, description, descriptionField, target, actual, targetField, actualField, formatValue, onPersist, dayPct }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const onTrack = pct >= dayPct - 10; // tolerancia 10%
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)", border: DS.border,
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>{title}</div>
      </div>
      <input
        defaultValue={description || ""}
        onBlur={(e) => onPersist({ [descriptionField]: e.target.value })}
        placeholder="Descripción…"
        style={inputStyle}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: onTrack ? DS.green : DS.amber, fontVariantNumeric: "tabular-nums" }}>
              {formatValue(actual)}
            </span>
            <span style={{ fontSize: 11, color: DS.textMuted }}>/ {formatValue(target)}</span>
            <span style={{ fontSize: 11, color: DS.textMuted, marginLeft: "auto" }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} accent={onTrack ? accent : DS.amber} />
        </div>
        <input
          type="number"
          defaultValue={actual}
          onBlur={(e) => onPersist({ [actualField]: Number(e.target.value) || 0 })}
          style={{ ...numberInputStyle, width: 100 }}
        />
        <input
          type="number"
          defaultValue={target}
          onBlur={(e) => onPersist({ [targetField]: Number(e.target.value) || 0 })}
          style={{ ...numberInputStyle, width: 100 }}
          placeholder="Target"
        />
      </div>
    </div>
  );
}

function ProgressMini({ label, target, actual, targetField, actualField, formatValue, onPersist, dayPct }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const onTrack = pct >= dayPct - 10;
  return (
    <div>
      <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: onTrack ? DS.green : DS.amber, fontVariantNumeric: "tabular-nums" }}>
          {formatValue(actual)}
        </span>
        <span style={{ fontSize: 10, color: DS.textMuted }}>/ {formatValue(target)}</span>
      </div>
      <ProgressBar pct={pct} accent={onTrack ? DS.green : DS.amber} />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <input
          type="number"
          defaultValue={actual}
          onBlur={(e) => onPersist({ [actualField]: Number(e.target.value) || 0 })}
          style={{ ...numberInputStyle, flex: 1, fontSize: 10 }}
          placeholder="Actual"
        />
        <input
          type="number"
          defaultValue={target}
          onBlur={(e) => onPersist({ [targetField]: Number(e.target.value) || 0 })}
          style={{ ...numberInputStyle, flex: 1, fontSize: 10 }}
          placeholder="Target"
        />
      </div>
    </div>
  );
}

function ProgressBar({ pct, accent }) {
  return (
    <div style={{
      height: 6, borderRadius: 50, background: "rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: accent, transition: "width 0.3s",
      }} />
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: DS.border, background: "transparent",
  color: DS.textPrimary, fontSize: 11.5, lineHeight: 1.4,
  fontFamily: DS.font, outline: "none", boxSizing: "border-box",
};

const numberInputStyle = {
  padding: "5px 8px", borderRadius: 6,
  border: DS.border, background: "rgba(255,255,255,0.02)",
  color: DS.textPrimary, fontSize: 11, fontFamily: DS.font,
  outline: "none", textAlign: "right", fontVariantNumeric: "tabular-nums",
};
