// Lista de pagos del período, ordenados por fecha. Cada row con badge de
// estado coloreado igual al dot del chart.

import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP, formatRelativeDate, paymentDotColor } from "../lib/finance_math.js";

const STATUS_LABEL = {
  completed: "Pagado",
  paid: "Pagado",
  pending: "Pendiente",
  overdue: "Vencido",
  planned: "Pendiente",
  partial: "Parcial",
};

export function PaymentCalendarList({ payments, onClickPayment, onPay, maxHeight }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!payments || payments.length === 0) {
    return (
      <div style={{
        padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
        textAlign: "center", color: DS.textMuted, fontSize: 12,
      }}>
        Sin pagos en el período seleccionado.
      </div>
    );
  }

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: DS.textMuted,
        }}>
          Calendario de pagos del período
        </div>
        <div style={{ fontSize: 11, color: DS.textSecondary }}>
          {payments.length} pagos
        </div>
      </div>

      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        overflowY: "auto",
        maxHeight: maxHeight ? `${maxHeight - 60}px` : undefined,
      }}>
        {payments.map((p) => {
          const color = paymentDotColor(p, today);
          const isExpense = p.type === "expense";
          const due = new Date(p.due_date);
          const dueLabel = due.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
          const relative = formatRelativeDate(p.due_date);
          const canPay = p._source === "budget" && p.status !== "completed" && p.status !== "paid" && onPay;
          return (
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 12px", borderRadius: 10,
                background: withAlpha(color, "06"),
                border: `1px solid ${withAlpha(color, "22")}`,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: color, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: DS.textPrimary,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{dueLabel}</span>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span style={{ color }}>{relative}</span>
                </div>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: isExpense ? DS.red : DS.green,
                fontVariantNumeric: "tabular-nums",
              }}>
                {isExpense ? "−" : "+"}{formatCOP(p.amount)}
              </div>
              {canPay && (
                <button
                  onClick={(e) => { e.stopPropagation(); onPay(p._raw); }}
                  style={{
                    padding: "5px 12px", borderRadius: 50,
                    border: `1px solid ${withAlpha(DS.green, "55")}`,
                    background: withAlpha(DS.green, "12"),
                    color: DS.green,
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  }}
                >✓ Pagar</button>
              )}
              {onClickPayment && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClickPayment(p); }}
                  style={{
                    padding: "5px 10px", borderRadius: 8,
                    border: "none", background: "transparent",
                    color: DS.textMuted, fontSize: 14, cursor: "pointer", fontFamily: DS.font,
                  }}
                >›</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
