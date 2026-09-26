import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP, calcSituation } from "../lib/finance_math.js";

// Card "Situación actual" — 3 escenarios:
// - Ahora: cash en cuentas
// - Si pago todo lo pendiente: cash - egresos pendientes
// - Si me pagan todo: agrega ingresos pendientes
//
// Colores: verde si positivo, rojo si negativo, ambar si <= 1M.
export function SituationCard({ accounts, transactions, debts, budgetItems }) {
  const { ahora, porPagar, porCobrar, siPagoTodo, siMePaganTodo } =
    calcSituation({ accounts, transactions, debts, budgetItems });

  const colorFor = (v) => v < 0 ? DS.red : v < 1_000_000 ? DS.amber : DS.green;

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: DS.textMuted, marginBottom: 4,
      }}>
        Situación actual
      </div>
      <div style={{ fontSize: 11, color: DS.textSecondary, marginBottom: 14 }}>
        Tres escenarios de tu cash · positivo o negativo en cada paso
      </div>

      <Row
        label="Ahora"
        sub="Lo que tenés hoy en cuentas"
        value={ahora}
        color={colorFor(ahora)}
        icon="●"
      />
      <Row
        label="Si pago todo lo pendiente"
        sub={`Restando $${porPagar.toLocaleString("es-CO")} por pagar`}
        value={siPagoTodo}
        color={colorFor(siPagoTodo)}
        icon={siPagoTodo < 0 ? "⚠️" : "↓"}
      />
      <Row
        label="Si además entran todos los cobros"
        sub={`Sumando $${porCobrar.toLocaleString("es-CO")} por cobrar`}
        value={siMePaganTodo}
        color={colorFor(siMePaganTodo)}
        icon={siMePaganTodo < 0 ? "⚠️" : "✓"}
        last
      />
    </div>
  );
}

function Row({ label, sub, value, color, icon, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0",
      borderBottom: last ? "none" : `1px solid ${withAlpha(DS.textHint, "22")}`,
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: "50%",
        background: withAlpha(color, "22"),
        color, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary }}>{label}</div>
        <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value < 0 ? "−" : ""}{formatCOP(Math.abs(value))}
      </div>
    </div>
  );
}
