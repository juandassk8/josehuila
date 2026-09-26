// Tabla de proyección semana a semana. Cada celda numérica muestra delta
// respecto a la semana anterior con color semántico:
//   - Verde si mejora (compras/revenue/roas suben, cpaReal baja)
//   - Rojo si empeora
//   - Gris para "totalSpend" (neutral, gastar más no es bueno ni malo)
// Última fila (limitReason === 'target') tiene fondo verde sutil.
// Dot de color a la izquierda de opBudget según limitReason.

const LIMIT_COLORS = {
  baseline: null,
  winners: "#3B8BD4",  // azul: cap por ganadores disponibles
  stability: "#EF9F27", // ámbar: cap por estabilidad
  target: "#1D9E75",    // verde: ya llegó al objetivo
};

const LIMIT_TOOLTIPS = {
  winners: "Esta semana el limitante son los ganadores disponibles. Mejorá producción creativa o subí tests/sem para acelerar.",
  stability: "Esta semana el limitante es el cap de crecimiento que pusiste. Subir más rápido podría romper el CPA.",
  target: "Llegaste al budget objetivo. A partir de acá, escalar más requiere cambiar el target.",
};

function fmtCOPShort(n) {
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function fmtNum(n) {
  if (!isFinite(n) || n == null) return "—";
  return Math.round(n).toLocaleString("es-CO");
}

function fmtRoas(n) {
  if (!isFinite(n) || n == null || n === 0) return "—";
  return `${n.toFixed(2)}×`;
}

function deltaText(curr, prev, format) {
  if (prev == null) return "";
  const d = curr - prev;
  if (Math.abs(d) < 0.0001) return "—";
  const sign = d > 0 ? "+" : "−";
  const formatted = format(Math.abs(d));
  return `${sign}${formatted.replace(/^\$|^[+−]/, "")}`;
}

export function ProjectionTable({ rows, isDark, T }) {
  if (!rows || rows.length === 0) return null;

  const cellBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const headerBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const baselineColor = T.textMuted;

  return (
    <div data-tour="plan-semanal" style={{
      overflowX: "auto",
      border: `1px solid ${cellBorder}`,
      borderRadius: 12,
      background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
    }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 12,
        fontFamily: T.font,
        minWidth: 920,
      }}>
        <thead>
          <tr style={{ background: headerBg }}>
            <Th>Sem</Th>
            <Th>Ganad.</Th>
            <Th>+Nuev</Th>
            <Th align="right">Operativo</Th>
            <Th align="right">Testing</Th>
            <Th align="right">Gasto total</Th>
            <Th align="right">Compras</Th>
            <Th align="right">Revenue</Th>
            <Th align="right">CPA real</Th>
            <Th align="right">ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = i > 0 ? rows[i - 1] : null;
            const isBaseline = r.limitReason === "baseline";
            const isFinalTarget = r.limitReason === "target";
            const rowBg = isFinalTarget
              ? (isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)")
              : "transparent";
            const dotColor = LIMIT_COLORS[r.limitReason];
            const tooltip = LIMIT_TOOLTIPS[r.limitReason] || "";

            return (
              <tr key={r.week} style={{ background: rowBg, borderTop: `1px solid ${cellBorder}` }}>
                <Td color={isBaseline ? baselineColor : undefined}>
                  {isBaseline ? "Hoy" : r.week}
                </Td>
                <Td color={isBaseline ? baselineColor : undefined}>{r.winners}</Td>
                <Td color={baselineColor}>
                  {r.newWinners == null ? "—" : `+${r.newWinners}`}
                </Td>
                <Td align="right">
                  <span
                    title={tooltip}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
                  >
                    {dotColor && (
                      <span
                        role="img"
                        aria-label={r.limitReason}
                        style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: dotColor, flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                      {fmtCOPShort(r.opBudget)}
                    </span>
                  </span>
                  <DeltaLine
                    delta={deltaText(r.opBudget, prev?.opBudget, fmtCOPShort)}
                    sign={prev ? Math.sign(r.opBudget - prev.opBudget) : 0}
                    polarity="neutral"
                    T={T}
                  />
                </Td>
                <Td align="right" color={isBaseline ? baselineColor : undefined}>
                  {fmtCOPShort(r.testingBudget)}
                </Td>
                <Td align="right">
                  <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                    {fmtCOPShort(r.totalSpend)}
                  </span>
                  <DeltaLine
                    delta={deltaText(r.totalSpend, prev?.totalSpend, fmtCOPShort)}
                    sign={prev ? Math.sign(r.totalSpend - prev.totalSpend) : 0}
                    polarity="neutral"
                    T={T}
                  />
                </Td>
                <Td align="right">
                  <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                    {fmtNum(r.purchases)}
                  </span>
                  <DeltaLine
                    delta={deltaText(r.purchases, prev?.purchases, fmtNum)}
                    sign={prev ? Math.sign(r.purchases - prev.purchases) : 0}
                    polarity="positive"
                    T={T}
                  />
                </Td>
                <Td align="right">
                  <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                    {fmtCOPShort(r.revenue)}
                  </span>
                  <DeltaLine
                    delta={deltaText(r.revenue, prev?.revenue, fmtCOPShort)}
                    sign={prev ? Math.sign(r.revenue - prev.revenue) : 0}
                    polarity="positive"
                    T={T}
                  />
                </Td>
                <Td align="right">
                  <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                    {fmtCOPShort(r.cpaReal)}
                  </span>
                  <DeltaLine
                    delta={deltaText(r.cpaReal, prev?.cpaReal, fmtCOPShort)}
                    sign={prev ? Math.sign(r.cpaReal - prev.cpaReal) : 0}
                    polarity="negative"
                    T={T}
                  />
                </Td>
                <Td align="right">
                  <span style={{ fontWeight: 500, color: isBaseline ? baselineColor : T.textPrimary }}>
                    {fmtRoas(r.roas)}
                  </span>
                  <DeltaLine
                    delta={deltaText(r.roas, prev?.roas, (n) => n.toFixed(2))}
                    sign={prev ? Math.sign(r.roas - prev.roas) : 0}
                    polarity="positive"
                    T={T}
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase",
      color: "currentColor", opacity: 0.65,
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", color }) {
  return (
    <td style={{
      padding: "10px 12px", textAlign: align,
      verticalAlign: "top", whiteSpace: "nowrap",
      color: color || "inherit",
    }}>
      {children}
    </td>
  );
}

// polarity: "positive" → verde sube/rojo baja; "negative" → verde baja/rojo sube; "neutral" → gris
function DeltaLine({ delta, sign, polarity, T }) {
  if (!delta || delta === "—" || delta === "") return null;
  let color = T.textMuted;
  if (polarity !== "neutral" && sign !== 0) {
    const isImprovement = polarity === "positive" ? sign > 0 : sign < 0;
    color = isImprovement ? "#1D9E75" : "#E24B4A";
  }
  return (
    <div style={{
      fontSize: 10, color, marginTop: 2, fontVariantNumeric: "tabular-nums",
    }}>
      {delta}
    </div>
  );
}
