// Tabla resumen de GASTOS por scope (Agencia / Vivir / Lifestyle).
// Rollup, no editable. Click en una fila scrollea al detalle correspondiente.

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PanelCard, SHEET_HEADER_STYLE, SHEET_ROW_STYLE } from "./PanelCard.jsx";
import { formatCOP } from "../lib/finance_math.js";

const COL = "minmax(120px, 1fr) 85px 85px";

export function CuadernoGastosResumen({ finance, from, to, scopeBuckets, onJumpToDetail }) {
  const { transactions } = finance;

  const stats = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime() + 86400000;
    return scopeBuckets.map((sb) => {
      const inPeriod = transactions.filter((t) => {
        if (t.type !== "expense") return false;
        const tms = new Date(t.transaction_date).getTime();
        if (tms < fromMs || tms >= toMs) return false;
        return matchesScope(t, sb);
      });
      const valorTotal = inPeriod.reduce((s, t) => s + Number(t.amount || 0), 0);
      const valorPago = inPeriod
        .filter((t) => t.status === "completed")
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      return { ...sb, valorPago, valorTotal };
    });
  }, [transactions, scopeBuckets, from, to]);

  const totalPago = stats.reduce((s, x) => s + x.valorPago, 0);
  const totalValor = stats.reduce((s, x) => s + x.valorTotal, 0);

  return (
    <PanelCard
      title="GASTOS"
      color={DS.red}
      footer={
        <div style={{ display: "grid", gridTemplateColumns: COL, gap: 8 }}>
          <div>TOTAL</div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalPago)}</div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalValor)}</div>
        </div>
      }
    >
      <div style={{ ...SHEET_HEADER_STYLE, gridTemplateColumns: COL }}>
        <div>Categoría</div>
        <div style={{ textAlign: "right" }}>Valor Pago</div>
        <div style={{ textAlign: "right" }}>Valor Total</div>
      </div>
      {stats.map((row) => (
        <button
          key={row.label}
          onClick={() => onJumpToDetail?.(row)}
          style={{
            ...SHEET_ROW_STYLE,
            gridTemplateColumns: COL,
            border: "none",
            borderBottom: `1px solid ${withAlpha(DS.textHint, "14")}`,
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: DS.font,
            width: "100%",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.red, "08"); }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: DS.textPrimary }}>
            <span style={{ fontSize: 14 }}>{row.icon || "📦"}</span>
            {row.label}
          </div>
          <div style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums", color: row.valorPago ? DS.green : DS.textMuted }}>
            {formatCOP(row.valorPago)}
          </div>
          <div style={{ textAlign: "right", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: DS.textPrimary }}>
            {formatCOP(row.valorTotal)}
          </div>
        </button>
      ))}
    </PanelCard>
  );
}

// Heurística para matchear un tx a un scope-bucket. Usa scope_id si está,
// si no usa scope legacy. Si nada matchea, el tx queda en "otros" (no se incluye).
function matchesScope(tx, sb) {
  if (sb.scopeId && tx.scope_id === sb.scopeId) return true;
  if (sb.legacyKeys && sb.legacyKeys.includes(tx.scope)) return true;
  return false;
}
