// Vista Presupuesto: tabla inline-editable con todos los items
// (gastos e ingresos) agrupados por scope.

import { useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { BudgetTable } from "../components/BudgetTable.jsx";
import { formatCOP, budgetSummaryByCategory } from "../lib/finance_math.js";

export function BudgetView({ finance }) {
  const [type, setType] = useState("expense");

  const summary = budgetSummaryByCategory(finance.budgetItems, finance.categories, type);
  const total = summary.reduce((s, g) => s + g.expected, 0);
  const paid = summary.reduce((s, g) => s + g.paid, 0);
  const remaining = total - paid;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toggle Gastos / Ingresos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{
          display: "inline-flex", padding: 3, borderRadius: 50,
          background: DS.bgCard, border: DS.border,
        }}>
          {[
            { v: "expense", label: "💸 Gastos", color: DS.red },
            { v: "income",  label: "💵 Ingresos", color: DS.green },
          ].map((opt) => {
            const active = type === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setType(opt.v)}
                style={{
                  padding: "7px 16px", borderRadius: 50, border: "none",
                  background: active ? withAlpha(opt.color, "22") : "transparent",
                  color: active ? opt.color : DS.textSecondary,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                }}
              >{opt.label}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <Stat label="Total esperado" value={formatCOP(total)} color={type === "expense" ? DS.red : DS.green} />
          <Stat label={type === "expense" ? "Pagado" : "Recibido"} value={formatCOP(paid)} color={DS.textSecondary} />
          <Stat label={type === "expense" ? "Falta pagar" : "Falta cobrar"} value={formatCOP(remaining)} color={DS.amber} />
        </div>
      </div>

      <BudgetTable finance={finance} type={type} showHeader={false} />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
