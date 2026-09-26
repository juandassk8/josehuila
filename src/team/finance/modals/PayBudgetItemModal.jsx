// Modal para marcar pagado un budget item.
// Crea una transaction con el monto + cuenta seleccionada.

import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, withAlpha } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";
import { formatCOP } from "../lib/finance_math.js";

export function PayBudgetItemModal({ item, finance, onClose }) {
  const { accounts } = finance;
  const remaining = Math.max(Number(item.expected_amount || 0) - Number(item.paid_amount || 0), 0);
  const [amount, setAmount] = useState(remaining);
  const [accountId, setAccountId] = useState(item.account_id || accounts[0]?.id || "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!amount || amount <= 0) { setError("Monto debe ser > 0"); return; }
    if (!accountId) { setError("Elegí una cuenta"); return; }
    setBusy(true); setError("");
    try {
      await finance.payBudgetItem(item, { amount, accountId, paymentDate, notes });
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const isIncome = item.type === "income";

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "60px 20px", zIndex: 9999, fontFamily: DS.font,
    }}>
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18,
        padding: 24, width: "100%", maxWidth: 460, color: DS.textPrimary,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {isIncome ? "💵 Registrar cobro" : "✓ Registrar pago"}
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 16 }}>
          {item.name} · esperado <strong>{formatCOP(item.expected_amount)}</strong>
          {item.paid_amount > 0 && (
            <> · ya {isIncome ? "recibido" : "pagado"} <strong>{formatCOP(item.paid_amount)}</strong></>
          )}
        </div>

        <Field label={isIncome ? "Monto recibido" : "Monto pagado"}>
          <AmountInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label="Cuenta · método de pago">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
            <option value="" style={{ background: DS.bgSide }}>— Elegí una cuenta —</option>
            {accounts.map((a) => {
              const isCredit = a.type === "credit_card";
              return (
                <option key={a.id} value={a.id} style={{ background: DS.bgSide }}>
                  {a.icon} {a.name} {isCredit ? "· crédito" : "· débito/efectivo"}
                </option>
              );
            })}
          </select>
          {(() => {
            const acc = accounts.find((a) => a.id === accountId);
            if (!acc) return null;
            const isCredit = acc.type === "credit_card";
            const isIncomeFlow = isIncome;
            return (
              <div style={{
                marginTop: 6, padding: "6px 10px", borderRadius: 8,
                fontSize: 10,
                color: isCredit ? DS.red : DS.green,
                background: isCredit ? withAlpha(DS.red, "10") : withAlpha(DS.green, "08"),
                border: `1px solid ${withAlpha(isCredit ? DS.red : DS.green, "33")}`,
              }}>
                {isCredit
                  ? `💳 Crédito: ${isIncomeFlow ? "se restará de" : "se sumará a"} la deuda de ${acc.name}. El saldo de tus bancos NO se mueve.`
                  : `🏦 Débito/efectivo: ${isIncomeFlow ? "entra a" : "sale de"} ${acc.name} (saldo actual ${formatCOP(acc.current_balance)}).`}
              </div>
            );
          })()}
        </Field>
        <Field label="Fecha">
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={darkInput} />
        </Field>
        <Field label="Notas (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Descripción adicional" style={darkInput} />
        </Field>

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.4)",
            color: DS.red, fontSize: 12, marginBottom: 14,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button onClick={onClose} disabled={busy} style={darkBtnGhost}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={{ ...darkBtn, opacity: busy ? 0.5 : 1 }}>
            {busy ? "Guardando..." : `${isIncome ? "Cobrar" : "Pagar"} ${formatCOP(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.12em", marginBottom: 5, textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}
