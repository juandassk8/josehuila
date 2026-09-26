// Planificador inverso. 2 sliders de objetivo + 3 cards (Conservador / Estándar
// / Agresivo) con botón "Aplicar" que setea los sliders de Estrategia.

function fmtCOPShort(n) {
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function ScenarioPlannerSection({
  T, isDark,
  targetMonthlyRevenue, setTargetMonthlyRevenue,
  targetWeeks, setTargetWeeks,
  planResult,
  onApply,
}) {
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div>
      <div data-tour="input-objetivo" style={{
        display: "grid",
        gridTemplateColumns: "1fr 200px",
        gap: 12,
        marginBottom: 14,
      }}>
        <SliderField
          label="Revenue mensual objetivo"
          hint="Lo que querés vender por mes (COP)"
          T={T}
        >
          <input
            type="range"
            min={1_000_000} max={2_000_000_000} step={1_000_000}
            value={targetMonthlyRevenue}
            onChange={(e) => setTargetMonthlyRevenue(Number(e.target.value))}
            style={sliderStyle}
            aria-label="Revenue mensual objetivo"
          />
          <ValueChip>{fmtCOPShort(targetMonthlyRevenue)}</ValueChip>
        </SliderField>
        <SliderField label="En cuántas semanas" T={T}>
          <input
            type="range"
            min={1} max={20} step={1}
            value={targetWeeks}
            onChange={(e) => setTargetWeeks(Number(e.target.value))}
            style={sliderStyle}
            aria-label="Plazo en semanas"
          />
          <ValueChip>{targetWeeks} sem</ValueChip>
        </SliderField>
      </div>

      {planResult.alreadyAchievable && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(29,158,117,0.10)", border: "1px solid rgba(29,158,117,0.30)",
          color: isDark ? "#3FCF9B" : "#1D9E75",
          fontSize: 12.5, fontWeight: 500,
        }}>
          ✓ Tu budget actual ya alcanza este objetivo. Probá un objetivo más ambicioso o ajustá la estrategia abajo.
        </div>
      )}

      {!planResult.alreadyAchievable && (
        <>
          <div style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 14,
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
            border: `1px solid ${cardBorder}`,
            fontSize: 12, lineHeight: 1.6, color: T.textSecondary,
          }}>
            <div>Para llegar a <strong style={{ color: T.textPrimary }}>{fmtCOPShort(targetMonthlyRevenue)}/mes</strong> en {targetWeeks} sem necesitás:</div>
            <div style={{ marginTop: 4 }}>
              • Budget operativo de <strong style={{ color: T.textPrimary }}>{fmtCOPShort(planResult.operativeBudgetNeeded)}/sem</strong>
              {" "}({Math.round(planResult.weeklyPurchasesNeeded)} compras/sem)
            </div>
            <div>• <strong style={{ color: T.textPrimary }}>{Math.ceil(planResult.winnersToGenerate)}</strong> ganadores nuevos en total ({planResult.winnersPerWeek.toFixed(1)}/sem)</div>
            <div>• Crecer el operativo <strong style={{ color: T.textPrimary }}>{Math.round(planResult.requiredGrowthRate * 100)}%/sem</strong></div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}>
            {planResult.scenarios.map((s) => (
              <div key={s.name} style={{
                padding: "14px",
                borderRadius: 12,
                background: cardBg,
                border: s.viable ? `1px solid ${cardBorder}` : `1px solid rgba(226,75,74,0.4)`,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: T.textMuted, marginBottom: 2,
                  }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{s.hint}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <ScenarioStat label="Win rate" value={`${Math.round(s.winRate * 100)}%`} T={T} />
                  <ScenarioStat label="Tests / sem" value={s.testsPerWeek} T={T} highlight />
                  <ScenarioStat label="Crecimiento sem" value={`${Math.round(s.growthRate * 100)}%`} T={T} />
                </div>

                {s.warning && (
                  <div style={{
                    padding: "6px 8px", borderRadius: 6,
                    background: "rgba(226,75,74,0.10)",
                    border: "1px solid rgba(226,75,74,0.30)",
                    color: "#E24B4A", fontSize: 10.5, lineHeight: 1.4,
                  }}>
                    ⚠ {s.warning}
                  </div>
                )}

                <button
                  onClick={() => onApply?.(s)}
                  disabled={!s.viable}
                  style={{
                    marginTop: 4,
                    padding: "8px 12px", borderRadius: 50,
                    border: "none",
                    background: s.viable
                      ? (isDark ? "#EBEBEB" : "#1A1D1C")
                      : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                    color: s.viable
                      ? (isDark ? "#1A1D1C" : "#FFFFFF")
                      : T.textMuted,
                    fontSize: 11.5, fontWeight: 600,
                    cursor: s.viable ? "pointer" : "not-allowed",
                    fontFamily: T.font,
                  }}
                >
                  Aplicar →
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SliderField({ label, hint, children, T }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary, marginBottom: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function ValueChip({ children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 50,
      background: "rgba(127,127,127,0.12)",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function ScenarioStat({ label, value, highlight, T }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
      <span style={{ color: T.textMuted }}>{label}</span>
      <span style={{
        fontWeight: highlight ? 600 : 500,
        color: highlight ? T.textPrimary : T.textSecondary,
      }}>
        {value}
      </span>
    </div>
  );
}

const sliderStyle = {
  flex: 1,
  height: 4,
  cursor: "pointer",
};
