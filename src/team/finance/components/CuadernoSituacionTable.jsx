// SITUACIÓN ACTUAL — layout horizontal estilo Sheet.
// 5 columnas: Cuenta | Dinero Actual (editable) | Dinero Futuro | Por Pagar | Valor.
// TC oculto (no es una cuenta con plata, solo deuda — vive como item de Lifestyle).
//
// Exporta:
//   <CuadernoSituacionTable> — wrappered en PanelCard (uso standalone, retained
//      por compatibilidad pero la vista nueva usa el unificado).
//   <SituacionInner> — solo la tabla, sin PanelCard, para uso desde
//      CuadernoSituacionBalance.

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PanelCard, SHEET_HEADER_STYLE, SHEET_ROW_STYLE } from "./PanelCard.jsx";
import { EditableAmount } from "./EditableCells.jsx";
import { formatCOP, remainingOf } from "../lib/finance_math.js";

const NAVY = "#1E3A5F";
export const SITUACION_COL = "minmax(100px,0.7fr) 90px 90px minmax(85px,0.5fr) 90px";
const COL = SITUACION_COL;

export function computeSituacionTotals(accounts, transactions, scopeBuckets) {
  const { accountRows, porPagarRows } = computeRows(accounts, transactions, scopeBuckets);
  return {
    totalActual: accountRows.reduce((s, a) => s + a.dineroActual, 0),
    totalFuturo: accountRows.reduce((s, a) => s + a.dineroFuturo, 0),
    totalPorPagar: porPagarRows.reduce((s, r) => s + r.total, 0),
  };
}

function computeRows(accounts, transactions, scopeBuckets) {
  const visibleAccounts = accounts.filter((a) => a.type !== "credit_card");

  const accountRows = visibleAccounts.map((a) => {
    // Dinero futuro = Σ lo que FALTA por recibir de income ligado a esta cuenta.
    // No es el amount total — es el amount menos paid_amount (lo no recibido aún).
    const futuro = transactions
      .filter((t) =>
        t.account_id === a.id &&
        t.type === "income" &&
        t.status !== "cancelled"
      )
      .reduce((s, t) => s + remainingOf(t), 0);
    return {
      ...a,
      dineroActual: Number(a.current_balance || 0),
      dineroFuturo: futuro,
    };
  });

  const porPagarRows = scopeBuckets.map((sb) => {
    const total = transactions
      .filter((t) =>
        t.type === "expense" &&
        t.status !== "completed" &&
        t.status !== "cancelled" &&
        matchesScope(t, sb)
      )
      .reduce((s, t) => s + remainingOf(t), 0);
    return { ...sb, total };
  });

  return { accountRows, porPagarRows };
}

export function SituacionInner({ finance, scopeBuckets, footerInside = true }) {
  const { accounts, transactions, updateAccount } = finance;

  const { accountRows, porPagarRows } = useMemo(
    () => computeRows(accounts, transactions, scopeBuckets),
    [accounts, transactions, scopeBuckets]
  );

  const totalActual = accountRows.reduce((s, a) => s + a.dineroActual, 0);
  const totalFuturo = accountRows.reduce((s, a) => s + a.dineroFuturo, 0);
  const totalPorPagar = porPagarRows.reduce((s, r) => s + r.total, 0);
  const maxRows = Math.max(accountRows.length, porPagarRows.length);

  const handleEditBalance = async (accountId, newAmount) => {
    try { await updateAccount(accountId, { current_balance: newAmount }); }
    catch (e) { alert("No se pudo actualizar el saldo: " + (e?.message || e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ ...SHEET_HEADER_STYLE, gridTemplateColumns: COL }}>
        <div>Cuenta</div>
        <div style={{ textAlign: "right" }}>Dinero Actual</div>
        <div style={{ textAlign: "right" }}>Dinero Futuro</div>
        <div>Por Pagar</div>
        <div style={{ textAlign: "right" }}>Valor</div>
      </div>

      {maxRows === 0 && (
        <div style={{ padding: 18, textAlign: "center", color: DS.textMuted, fontSize: 11 }}>
          Sin cuentas. Creá una en la tab Cuentas.
        </div>
      )}

      {Array.from({ length: maxRows }).map((_, i) => {
        const a = accountRows[i];
        const pp = porPagarRows[i];
        return (
          <div key={i} style={{ ...SHEET_ROW_STYLE, gridTemplateColumns: COL }}>
            {a ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: DS.textPrimary, fontWeight: 500, padding: "4px 6px" }}>
                <span style={{ fontSize: 13 }}>{a.icon || "🏦"}</span>
                {a.name}
              </div>
            ) : <div />}
            {a ? (
              <EditableAmount
                value={a.dineroActual}
                onSave={(v) => handleEditBalance(a.id, v)}
              />
            ) : <div />}
            {a ? (
              <div style={{
                textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums",
                padding: "4px 6px",
                color: a.dineroFuturo > 0 ? DS.green : DS.textMuted,
              }}>
                {a.dineroFuturo > 0 ? "+" : ""}{formatCOP(a.dineroFuturo)}
              </div>
            ) : <div />}
            {pp ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: DS.textPrimary, padding: "4px 6px" }}>
                <span style={{ fontSize: 13 }}>{pp.icon || "📦"}</span>
                {pp.label}
              </div>
            ) : <div />}
            {pp ? (
              <div style={{
                textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums",
                padding: "4px 6px",
                color: pp.total > 0 ? DS.red : DS.textMuted,
              }}>
                {formatCOP(pp.total)}
              </div>
            ) : <div />}
          </div>
        );
      })}

      {footerInside && (
        <div style={{
          display: "grid", gridTemplateColumns: COL, gap: 8,
          padding: "8px 10px",
          background: withAlpha(NAVY, "10"),
          borderTop: `1px solid ${withAlpha(NAVY, "22")}`,
          fontWeight: 700, fontSize: 12, color: DS.textPrimary,
        }}>
          <div>TOTAL</div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalActual)}</div>
          <div style={{ textAlign: "right", color: totalFuturo > 0 ? DS.green : DS.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {totalFuturo > 0 ? "+" : ""}{formatCOP(totalFuturo)}
          </div>
          <div>TOTAL</div>
          <div style={{ textAlign: "right", color: DS.red, fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalPorPagar)}</div>
        </div>
      )}
    </div>
  );
}

// Versión "wrapped" en PanelCard — retenida por compat. La nueva Cuaderno usa
// directamente <CuadernoSituacionBalance> con SituacionInner adentro.
export function CuadernoSituacionTable({ finance, scopeBuckets }) {
  return (
    <PanelCard title="SITUACIÓN ACTUAL" color={NAVY}>
      <SituacionInner finance={finance} scopeBuckets={scopeBuckets} />
    </PanelCard>
  );
}

function matchesScope(tx, sb) {
  if (sb.scopeId && tx.scope_id === sb.scopeId) return true;
  if (sb.legacyKeys && sb.legacyKeys.includes(tx.scope)) return true;
  return false;
}
