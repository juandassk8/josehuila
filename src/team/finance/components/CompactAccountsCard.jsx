import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP } from "../lib/finance_math.js";

// Card de cuentas: bancos/cash arriba, tarjetas de crédito (deuda) abajo.
// Cada row es clickeable para editar el saldo. Header tiene botón "+ Nueva".
export function CompactAccountsCard({ accounts, onEdit, onCreate }) {
  const cashAccounts = (accounts || []).filter((a) => a.type !== "credit_card");
  const creditCards = (accounts || []).filter((a) => a.type === "credit_card");

  const cashTotal = cashAccounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const debtTotal = creditCards.reduce((s, a) => s + Math.max(Number(a.current_balance || 0), 0), 0);

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: DS.textMuted,
        }}>
          Cuentas
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: DS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
            Cash <strong style={{ color: DS.textPrimary }}>{formatCOP(cashTotal)}</strong>
            {debtTotal > 0 && (
              <>
                {" · "}
                Deuda <strong style={{ color: DS.red }}>{formatCOP(debtTotal)}</strong>
              </>
            )}
          </div>
          {onCreate && (
            <button
              onClick={onCreate}
              style={{
                padding: "4px 10px", borderRadius: 50,
                border: `1px solid ${withAlpha(DS.green, "55")}`,
                background: withAlpha(DS.green, "12"),
                color: DS.green,
                fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}
            >+ Nueva</button>
          )}
        </div>
      </div>

      {cashAccounts.length === 0 && creditCards.length === 0 ? (
        <div style={{ padding: 18, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
          Sin cuentas cargadas.
        </div>
      ) : (
        <>
          {cashAccounts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cashAccounts.map((a) => (
                <AccountRow key={a.id} account={a} onClick={onEdit ? () => onEdit(a) : null} />
              ))}
            </div>
          )}
          {creditCards.length > 0 && (
            <>
              <div style={{
                marginTop: 12, marginBottom: 6,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: DS.red,
              }}>
                Tarjetas de crédito · deuda actual
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {creditCards.map((a) => (
                  <CreditCardRow key={a.id} account={a} onClick={onEdit ? () => onEdit(a) : null} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AccountRow({ account: a, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick || undefined}
      title={onClick ? "Editar saldo" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 10,
        background: withAlpha(a.color || DS.green, "08"),
        border: `1px solid ${withAlpha(a.color || DS.green, "22")}`,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        fontFamily: DS.font,
        color: DS.textPrimary,
        transition: "background 120ms",
      }}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.background = withAlpha(a.color || DS.green, "14");
        const ed = e.currentTarget.querySelector("[data-edit-icon]");
        if (ed) ed.style.opacity = "1";
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        e.currentTarget.style.background = withAlpha(a.color || DS.green, "08");
        const ed = e.currentTarget.querySelector("[data-edit-icon]");
        if (ed) ed.style.opacity = "0";
      } : undefined}
    >
      <span style={{ fontSize: 14 }}>{a.icon || "🏦"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary }}>{a.name}</div>
        <div style={{ fontSize: 9, color: DS.textMuted, textTransform: "capitalize" }}>{(a.type || "").replace("_", " ")}</div>
      </div>
      <div style={{
        fontSize: 12, fontWeight: 700, color: DS.textPrimary,
        fontVariantNumeric: "tabular-nums",
      }}>{formatCOP(a.current_balance)}</div>
      {onClick && (
        <span data-edit-icon style={{
          fontSize: 11, color: DS.textMuted, opacity: 0, transition: "opacity 120ms",
          marginLeft: 2,
        }}>✎</span>
      )}
    </Tag>
  );
}

function CreditCardRow({ account: a, onClick }) {
  const Tag = onClick ? "button" : "div";
  const debt = Math.max(Number(a.current_balance || 0), 0);
  const limit = Number(a.credit_limit || 0);
  const utilization = limit > 0 ? Math.min(debt / limit, 1) : 0;
  const utilizationColor = utilization > 0.85 ? DS.red : utilization > 0.5 ? DS.amber : DS.red;
  return (
    <Tag
      onClick={onClick || undefined}
      title={onClick ? "Editar deuda / cupo" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 10,
        background: withAlpha(DS.red, "06"),
        border: `1px solid ${withAlpha(DS.red, "22")}`,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        fontFamily: DS.font,
        color: DS.textPrimary,
        transition: "background 120ms",
      }}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.background = withAlpha(DS.red, "12");
        const ed = e.currentTarget.querySelector("[data-edit-icon]");
        if (ed) ed.style.opacity = "1";
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        e.currentTarget.style.background = withAlpha(DS.red, "06");
        const ed = e.currentTarget.querySelector("[data-edit-icon]");
        if (ed) ed.style.opacity = "0";
      } : undefined}
    >
      <span style={{ fontSize: 14 }}>{a.icon || "💳"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary }}>{a.name}</div>
        <div style={{ fontSize: 9, color: DS.textMuted }}>
          {limit > 0
            ? <>cupo {formatCOP(limit)} · usado {Math.round(utilization * 100)}%</>
            : "tarjeta de crédito"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: utilizationColor,
          fontVariantNumeric: "tabular-nums",
        }}>{formatCOP(debt)}</div>
        <div style={{ fontSize: 9, color: DS.textMuted }}>deuda</div>
      </div>
      {onClick && (
        <span data-edit-icon style={{
          fontSize: 11, color: DS.textMuted, opacity: 0, transition: "opacity 120ms",
          marginLeft: 2,
        }}>✎</span>
      )}
    </Tag>
  );
}
