// Stats por período: Hoy / Semana / Mes / Todo.
// - Hoy:  total grande + breakdown horizontal (barras) por categoría.
// - Resto: barras apiladas por día (recharts) + breakdown abajo.

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { DS } from "../../lib/design.js";
import {
  daysOfPeriod,
  rangeForPeriod,
  totalsByCategory,
  totalSecondsInRange,
  totalsByDay,
  formatHumanDurationLong,
  formatHMS,
} from "./lib/timeMath.js";

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "all", label: "Todo" },
];

export function StatsPanel({ categories, sessions, period, onChangePeriod, now }) {
  const [from, to] = useMemo(() => rangeForPeriod(period), [period]);
  const days = useMemo(() => daysOfPeriod(period), [period]);

  const totalSec = useMemo(
    () => totalSecondsInRange(sessions, from, to, now),
    [sessions, from, to, now]
  );

  const byCategory = useMemo(() => {
    const map = totalsByCategory(sessions, from, to, now);
    return categories
      .map((c) => ({ category: c, seconds: map.get(c.id) || 0 }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [categories, sessions, from, to, now]);

  const dailyRows = useMemo(
    () => (period === "today" ? [] : totalsByDay(sessions, days, now)),
    [period, sessions, days, now]
  );

  const showChart = period !== "today" && days.length > 1;

  return (
    <section
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: DS.radius,
        padding: "20px 22px",
        fontFamily: DS.font,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: DS.textMuted }}>
          ESTADÍSTICAS
        </h2>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "inline-flex",
            background: "rgba(255,255,255,0.04)",
            border: DS.border,
            borderRadius: 999,
            padding: 3,
            gap: 2,
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onChangePeriod(p.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                background: period === p.key ? DS.textPrimary : "transparent",
                color: period === p.key ? DS.bg : DS.textSecondary,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: DS.font,
                letterSpacing: "0.02em",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Total */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", fontWeight: 700, marginBottom: 6 }}>
          TOTAL
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 200,
            color: DS.textPrimary,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}
        >
          {formatHMS(totalSec * 1000)}
        </div>
      </div>

      {/* Chart por día */}
      {showChart && (
        <div style={{ height: 220, marginBottom: 22 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyRows.map((r) => ({
                ...r,
                // recharts no maneja seconds bien para height; pasamos minutos.
                ...Object.fromEntries(
                  categories.map((c) => [c.id, Math.round((r[c.id] || 0) / 60)])
                ),
              }))}
              margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: DS.textMuted }} />
              <YAxis
                tick={{ fontSize: 10, fill: DS.textMuted }}
                tickFormatter={(v) => (v >= 60 ? `${Math.round(v / 60)}h` : `${v}m`)}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: DS.bgSide,
                  border: DS.border,
                  borderRadius: 8,
                  fontSize: 12,
                  color: DS.textPrimary,
                  fontFamily: DS.font,
                }}
                labelStyle={{ color: DS.textSecondary }}
                formatter={(value, name) => {
                  const cat = categories.find((c) => c.id === name);
                  const minutes = Number(value) || 0;
                  const h = Math.floor(minutes / 60);
                  const m = minutes % 60;
                  return [h > 0 ? `${h}h ${m}m` : `${m}m`, cat?.name || name];
                }}
              />
              {categories.map((c) => (
                <Bar
                  key={c.id}
                  dataKey={c.id}
                  stackId="time"
                  fill={c.color || DS.blue}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown por categoría */}
      <div>
        <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", fontWeight: 700, marginBottom: 10 }}>
          POR CATEGORÍA
        </div>
        {byCategory.length === 0 || totalSec === 0 ? (
          <div style={{ color: DS.textMuted, fontSize: 13, padding: "10px 0" }}>
            Sin tiempo registrado en este período.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byCategory.map(({ category, seconds }) => {
              const pct = totalSec === 0 ? 0 : seconds / totalSec;
              return (
                <div
                  key={category.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: category.color || DS.blue,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: DS.textPrimary, minWidth: 140 }}>
                    {category.icon} {category.name}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(pct * 100)}%`,
                        height: "100%",
                        background: category.color || DS.blue,
                        transition: "width 0.4s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: DS.textSecondary,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 80,
                      textAlign: "right",
                    }}
                  >
                    {formatHumanDurationLong(seconds)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: DS.textMuted,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 40,
                      textAlign: "right",
                    }}
                  >
                    {Math.round(pct * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
