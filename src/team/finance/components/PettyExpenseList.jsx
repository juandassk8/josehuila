// Lista de gastos hormiga del mes en el dashboard.

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP } from "../lib/finance_math.js";

const METHOD_LABEL = { debit: "Débito", credit: "Crédito", cash: "Efectivo" };
const METHOD_COLOR = { debit: "#3B82F6", credit: "#F59E0B", cash: "#1D9E75" };

export function PettyExpenseList({ pettyExpenses, accounts, scopes, finance }) {
  const accountById = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);
  const scopeById = useMemo(() => new Map((scopes || []).map((s) => [s.id, s])), [scopes]);

  // Filtrar al mes actual
  const monthExpenses = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return (pettyExpenses || []).filter((p) => new Date(p.expense_date) >= monthStart);
  }, [pettyExpenses]);

  const total = monthExpenses.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: DS.textMuted,
          }}>
            🐜 Gastos hormiga del mes
          </div>
          <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
            Los gastitos del día a día
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: DS.textMuted }}>Total mes</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: DS.red, fontVariantNumeric: "tabular-nums" }}>
            {formatCOP(total)}
          </div>
        </div>
      </div>

      {monthExpenses.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
          Sin gastos hormiga este mes. Click en el botón 🐜 abajo para agregar uno.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
          {monthExpenses.map((p) => {
            const account = accountById.get(p.account_id);
            const scope = scopeById.get(p.scope_id);
            const methodColor = METHOD_COLOR[p.payment_method] || "#888";
            return (
              <div key={p.id} style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr auto",
                gap: 10, padding: "8px 12px", borderRadius: 8,
                background: "rgba(0,0,0,0.10)",
                alignItems: "center",
              }}>
                <div style={{ fontSize: 10, color: DS.textMuted, fontVariantNumeric: "tabular-nums" }}>
                  {new Date(p.expense_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: DS.textPrimary,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 1, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "1px 6px", borderRadius: 50,
                      background: withAlpha(methodColor, "22"), color: methodColor,
                      fontWeight: 700, letterSpacing: "0.04em",
                    }}>{METHOD_LABEL[p.payment_method]}</span>
                    {account && <span>{account.icon} {account.name}</span>}
                    {scope && <span>· {scope.icon} {scope.name}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: DS.red,
                    fontVariantNumeric: "tabular-nums",
                  }}>−{formatCOP(p.amount)}</div>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`¿Eliminar "${p.name}"?`)) return;
                      await finance.deletePettyExpense(p.id);
                    }}
                    style={{
                      padding: "3px 6px", borderRadius: 6, border: "none",
                      background: "transparent", color: DS.textMuted,
                      fontSize: 11, cursor: "pointer", fontFamily: DS.font,
                    }}
                    title="Eliminar"
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
