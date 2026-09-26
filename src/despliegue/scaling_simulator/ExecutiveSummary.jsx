// 3 cards al final: Estrategia / Camino / Resultado.

function fmtCOPShort(n) {
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1e3)}K`;
  return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n))}`;
}

export function ExecutiveSummary({ inputs, summary, T, isDark }) {
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  // El "Camino" muestra texto distinto según el resultado.
  let camino;
  if (summary.reachedTarget) {
    camino = {
      big: `${summary.weeks}`,
      bigSuffix: summary.weeks === 1 ? "semana" : "semanas",
      bullets: [
        `Inversión total: ${fmtCOPShort(summary.totalInvestment)}`,
        `Testing fijo/sem: ${fmtCOPShort(inputs.testsPerWeek * inputs.cpa * inputs.testBudgetMultiplier)}`,
        `ROAS al final: ${summary.finalRoas.toFixed(2)}×`,
      ],
      tone: "ok",
    };
  } else if (summary.hitMaxWeeks) {
    camino = {
      big: "20+",
      bigSuffix: "semanas",
      bullets: [
        `No llega al objetivo en ${summary.weeks} sem.`,
        `Subí win rate, capacidad por ganador, o tests/sem.`,
      ],
      tone: "warn",
    };
  } else {
    camino = {
      big: "Se estanca",
      bigSuffix: `en sem ${summary.weeks}`,
      bullets: [
        `El operativo dejó de crecer.`,
        `Win rate × tests/sem genera muy pocos ganadores nuevos.`,
      ],
      tone: "warn",
    };
  }

  // El "Resultado" cambia de fondo (verde/ámbar) según logro.
  const resultTone = summary.reachedTarget ? "ok" : "warn";
  const resultBg = resultTone === "ok"
    ? (isDark ? "rgba(29,158,117,0.10)" : "rgba(29,158,117,0.08)")
    : (isDark ? "rgba(239,159,39,0.10)" : "rgba(239,159,39,0.08)");
  const resultBorder = resultTone === "ok"
    ? "rgba(29,158,117,0.35)"
    : "rgba(239,159,39,0.35)";

  return (
    <div data-tour="output-winners" style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12,
    }}>
      <Card bg={cardBg} border={cardBorder} T={T}>
        <Label T={T}>La estrategia</Label>
        <Big>{inputs.testsPerWeek}</Big>
        <Sub T={T}>tests/sem</Sub>
        <Bullets T={T}>
          <li>Win rate: {Math.round(inputs.winRate * 100)}%</li>
          <li>Capacidad/ganador: {fmtCOPShort(inputs.capacityPerWinner)}</li>
          <li>Max crecimiento: {Math.round(inputs.maxGrowthRate * 100)}%/sem</li>
        </Bullets>
      </Card>

      <Card bg={cardBg} border={cardBorder} T={T}>
        <Label T={T}>El camino</Label>
        <Big tone={camino.tone}>{camino.big}</Big>
        <Sub T={T}>{camino.bigSuffix}</Sub>
        <Bullets T={T}>
          {camino.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </Bullets>
      </Card>

      <Card bg={resultBg} border={resultBorder} T={T}>
        <Label T={T}>El resultado</Label>
        {summary.reachedTarget ? (
          <>
            <Big tone="ok">+{fmtCOPShort(summary.monthlyLiftRevenue)}</Big>
            <Sub T={T}>de revenue mensual extra</Sub>
            <Bullets T={T}>
              <li>{fmtCOPShort(summary.baselineRow.revenue * 4.33)}/mes → {fmtCOPShort(summary.finalRow.revenue * 4.33)}/mes</li>
              <li>+{Math.round(summary.monthlyLiftPurchases)} compras/mes</li>
              <li>Crecimiento ×{summary.revenueMultiplier.toFixed(1)} en {summary.weeks} sem</li>
            </Bullets>
          </>
        ) : (
          <>
            <Big tone="warn">No llega</Big>
            <Sub T={T}>con esta estrategia</Sub>
            <Bullets T={T}>
              <li>Subí tests/sem o win rate.</li>
              <li>O bajá el target a algo más realista.</li>
              <li>O extendé el plazo del planificador.</li>
            </Bullets>
          </>
        )}
      </Card>
    </div>
  );
}

function Card({ children, bg, border, T }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12,
      background: bg, border: `1px solid ${border}`,
      display: "flex", flexDirection: "column", gap: 4,
      fontFamily: T.font,
    }}>
      {children}
    </div>
  );
}

function Label({ children, T }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: T.textMuted, marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function Big({ children, tone }) {
  let color = "currentColor";
  if (tone === "ok") color = "#1D9E75";
  if (tone === "warn") color = "#EF9F27";
  return (
    <div style={{
      fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em",
      color, lineHeight: 1.1,
    }}>
      {children}
    </div>
  );
}

function Sub({ children, T }) {
  return (
    <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
      {children}
    </div>
  );
}

function Bullets({ children, T }) {
  return (
    <ul style={{
      margin: "8px 0 0", padding: 0, listStyle: "none",
      fontSize: 11.5, color: T.textSecondary, lineHeight: 1.6,
    }}>
      {children}
    </ul>
  );
}
