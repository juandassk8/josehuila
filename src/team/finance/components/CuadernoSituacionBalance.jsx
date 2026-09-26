// SITUACIÓN ACTUAL · BALANCE — panel unificado con FOOTER COMPARTIDO.
// El footer abarca todo el ancho del panel para que los totales de ambos lados
// queden alineados horizontalmente con la misma tipografía y altura (uno solo
// "border bottom" continuo, no dos cards diferentes).

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PanelCard } from "./PanelCard.jsx";
import { SituacionInner, SITUACION_COL, computeSituacionTotals } from "./CuadernoSituacionTable.jsx";
import { BalanceInner, BALANCE_COL, computeBalanceCalcs } from "./CuadernoBalanceActualFuturo.jsx";
import { formatCOP } from "../lib/finance_math.js";

const NAVY = "#1E3A5F";
const PANEL_COL = "minmax(0, 1.6fr) minmax(0, 1fr)";

export function CuadernoSituacionBalance({ finance, scopeBuckets }) {
  const { accounts, transactions } = finance;

  const situacion = useMemo(
    () => computeSituacionTotals(accounts, transactions, scopeBuckets),
    [accounts, transactions, scopeBuckets]
  );
  const balance = useMemo(
    () => computeBalanceCalcs(accounts, transactions),
    [accounts, transactions]
  );

  return (
    <PanelCard title="SITUACIÓN ACTUAL · BALANCE" color={NAVY}>
      {/* Contenido (sin footers internos) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: PANEL_COL,
        alignItems: "stretch",
      }}>
        <div style={{ minWidth: 0 }}>
          <SituacionInner finance={finance} scopeBuckets={scopeBuckets} footerInside={false} />
        </div>
        <div style={{
          minWidth: 0,
          borderLeft: `1px solid ${withAlpha(NAVY, "22")}`,
        }}>
          <BalanceInner finance={finance} footerInside={false} />
        </div>
      </div>

      {/* Footer unificado — un solo bloque continuo abarcando ambos lados */}
      <div style={{
        display: "grid",
        gridTemplateColumns: PANEL_COL,
        background: withAlpha(NAVY, "10"),
        borderTop: `1px solid ${withAlpha(NAVY, "33")}`,
        fontFamily: DS.font,
      }}>
        {/* Lado izquierdo: totales de SITUACIÓN */}
        <div style={{
          display: "grid",
          gridTemplateColumns: SITUACION_COL,
          gap: 6,
          padding: "6px 8px",
          fontWeight: 800, fontSize: 11, color: DS.textPrimary,
          alignItems: "center",
        }}>
          <div>TOTAL</div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {formatCOP(situacion.totalActual)}
          </div>
          <div style={{
            textAlign: "right", fontVariantNumeric: "tabular-nums",
            color: situacion.totalFuturo > 0 ? DS.green : DS.textMuted,
          }}>
            {situacion.totalFuturo > 0 ? "+" : ""}{formatCOP(situacion.totalFuturo)}
          </div>
          <div>TOTAL</div>
          <div style={{
            textAlign: "right", fontVariantNumeric: "tabular-nums",
            color: situacion.totalPorPagar > 0 ? DS.red : DS.textMuted,
          }}>
            {formatCOP(situacion.totalPorPagar)}
          </div>
        </div>
        {/* Lado derecho: totales del BALANCE (mismo padding/font/altura) */}
        <div style={{
          display: "grid",
          gridTemplateColumns: BALANCE_COL,
          gap: 6,
          padding: "6px 8px",
          fontWeight: 800, fontSize: 11, color: DS.textPrimary,
          borderLeft: `1px solid ${withAlpha(NAVY, "22")}`,
          alignItems: "center",
        }}>
          <div style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>Total Actual</div>
          <div style={{
            textAlign: "right", fontVariantNumeric: "tabular-nums",
            color: balance.totalActual >= 0 ? DS.green : DS.red,
          }}>
            {formatCOP(balance.totalActual)}
          </div>
          <div style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>Total Futuro</div>
          <div style={{
            textAlign: "right", fontVariantNumeric: "tabular-nums",
            color: balance.totalFuturo >= 0 ? DS.green : DS.red,
          }}>
            {formatCOP(balance.totalFuturo)}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
