import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP, incomeRows, formatRelativeDate } from "../lib/finance_math.js";

// Tabla de ingresos del dashboard.
// Cada row es: nombre · recibido · falta · fecha · tipo (único/recurrente).
//
// Combina clientes activos recurrentes + transactions income pending + debts.
export function IncomeTable({ transactions, clients, debts }) {
  const rows = incomeRows(transactions, clients, debts);
  const totalExpected = rows.reduce((s, r) => s + Number(r.expected || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remaining || 0), 0);

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: DS.textMuted,
          }}>
            Ingresos
          </div>
          <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
            Esperado este mes + cobros pendientes
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: DS.textMuted }}>Por recibir</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: DS.green, fontVariantNumeric: "tabular-nums" }}>
            {formatCOP(totalRemaining)}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
          Sin ingresos esperados. Agregá clientes con retainer mensual o transacciones pendientes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: withAlpha(DS.textHint, "11"), borderRadius: 8, overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px 90px 80px",
            gap: 10, padding: "8px 10px",
            background: DS.bgCard,
            fontSize: 9, fontWeight: 700, color: DS.textMuted,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            <div>Nombre</div>
            <div style={{ textAlign: "right" }}>Recibido</div>
            <div style={{ textAlign: "right" }}>Falta</div>
            <div style={{ textAlign: "right" }}>Fecha</div>
          </div>
          {/* Rows */}
          {rows.map((r) => {
            const overdue = r.dueDate && new Date(r.dueDate) < new Date() && r.remaining > 0;
            return (
              <div key={r.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px 80px",
                gap: 10, padding: "9px 10px",
                background: DS.bgCard,
                alignItems: "center",
                fontFamily: DS.font,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: DS.textPrimary,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{r.name}</div>
                  <div style={{ fontSize: 9, color: DS.textMuted, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                    {r.type === "recurring" ? (
                      <span style={{
                        padding: "1px 6px", borderRadius: 50,
                        background: withAlpha(DS.blue, "22"), color: DS.blue,
                        fontWeight: 700, letterSpacing: "0.04em",
                      }}>RECURRENTE</span>
                    ) : (
                      <span style={{
                        padding: "1px 6px", borderRadius: 50,
                        background: withAlpha(DS.amber, "22"), color: DS.amber,
                        fontWeight: 700, letterSpacing: "0.04em",
                      }}>ÚNICO</span>
                    )}
                    {r._source === "debt" && (
                      <span style={{ color: DS.textMuted }}>deuda</span>
                    )}
                  </div>
                </div>
                <div style={{
                  textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums",
                  color: r.received >= r.expected ? DS.green : DS.textSecondary,
                }}>{formatCOP(r.received)}</div>
                <div style={{
                  textAlign: "right", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: r.remaining > 0 ? DS.green : DS.textMuted,
                }}>{r.remaining > 0 ? formatCOP(r.remaining) : "—"}</div>
                <div style={{
                  textAlign: "right", fontSize: 10,
                  color: overdue ? DS.red : DS.textMuted,
                  fontWeight: overdue ? 700 : 400,
                }}>
                  {r.dueDate ? formatRelativeDate(r.dueDate) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
