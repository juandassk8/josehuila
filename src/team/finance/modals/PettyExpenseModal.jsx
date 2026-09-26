// Modal rápido para registrar un gasto hormiga.
// Crea un row en finance_petty_expenses + una transaction expense completed.

import { useMemo, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";
import { formatCOP } from "../lib/finance_math.js";

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function PettyExpenseModal({ finance, onClose }) {
  const { accounts, scopes, categories } = finance;
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState("debit");
  const [accountId, setAccountId] = useState(() => {
    const bank = accounts.find((a) => a.type === "bank") || accounts[0];
    return bank?.id || "";
  });
  const [scopeId, setScopeId] = useState(() => {
    const personal = scopes.find((s) => s.legacy_key === "personal");
    return personal?.id || scopes[0]?.id || "";
  });
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Filtrar cuentas por método de pago
  const eligibleAccounts = useMemo(() => {
    if (paymentMethod === "credit") return accounts.filter((a) => a.type === "credit_card");
    if (paymentMethod === "cash") return accounts.filter((a) => a.type === "cash");
    return accounts.filter((a) => a.type === "bank" || a.type === "digital_wallet");
  }, [paymentMethod, accounts]);

  // Auto-cambiar cuenta si la actual ya no aplica
  useMemo(() => {
    if (eligibleAccounts.length > 0 && !eligibleAccounts.find((a) => a.id === accountId)) {
      setAccountId(eligibleAccounts[0].id);
    }
  }, [eligibleAccounts, accountId]);

  // Categorías filtradas por scope_id seleccionado (matching scope text por legacy_key)
  const scope = scopes.find((s) => s.id === scopeId);
  const availableCategories = useMemo(() => {
    return (categories || []).filter((c) => {
      if (c.type !== "expense") return false;
      if (c.scope_id) return c.scope_id === scopeId;
      // legacy: matchear scope text con legacy_key del scope seleccionado
      return scope?.legacy_key && c.scope === scope.legacy_key;
    });
  }, [categories, scopeId, scope]);

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido"); return; }
    if (!amount || amount <= 0) { setError("Monto debe ser > 0"); return; }
    if (!accountId) { setError("Elegí una cuenta"); return; }
    setBusy(true); setError("");
    try {
      await finance.createPettyExpense({
        name: name.trim(),
        amount,
        expense_date: date,
        payment_method: paymentMethod,
        account_id: accountId,
        scope_id: scopeId || null,
        scope: scope?.legacy_key || null,
        category_id: categoryId || null,
        notes: notes.trim() || null,
      });
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "60px 20px", zIndex: 9999, fontFamily: DS.font,
    }}>
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18,
        padding: 24, width: "100%", maxWidth: 480, color: DS.textPrimary,
        maxHeight: "calc(100vh - 120px)", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>🐜</span>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Gasto hormiga</div>
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 16 }}>
          Registro rápido del día a día.
        </div>

        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Almuerzo, café, taxi…" style={darkInput} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Monto"><AmountInput value={amount} onChange={setAmount} /></Field>
          <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={darkInput} /></Field>
        </div>

        <Field label="Método de pago">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "debit",  label: "💳 Débito",   color: DS.blue },
              { v: "credit", label: "💵 Crédito",  color: DS.amber },
              { v: "cash",   label: "💵 Efectivo", color: DS.green },
            ].map((o) => {
              const active = paymentMethod === o.v;
              return (
                <button key={o.v} onClick={() => setPaymentMethod(o.v)} style={{
                  flex: 1, padding: "7px 10px", borderRadius: 50,
                  border: `1px solid ${active ? o.color : DS.textHint}`,
                  background: active ? `${o.color}22` : "transparent",
                  color: active ? o.color : DS.textSecondary,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                }}>{o.label}</button>
              );
            })}
          </div>
        </Field>

        <Field label="Cuenta">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
            <option value="" style={{ background: DS.bgSide }}>— Elegí una cuenta —</option>
            {eligibleAccounts.map((a) => (
              <option key={a.id} value={a.id} style={{ background: DS.bgSide }}>{a.icon} {a.name}</option>
            ))}
          </select>
          {eligibleAccounts.length === 0 && (
            <div style={{ fontSize: 10, color: DS.amber, marginTop: 4 }}>
              ⚠️ No hay cuentas tipo {paymentMethod === "credit" ? "tarjeta de crédito" : paymentMethod}. Creá una primero.
            </div>
          )}
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Sección">
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
              {scopes.filter((s) => s.allow_expense).map((s) => (
                <option key={s.id} value={s.id} style={{ background: DS.bgSide }}>{s.icon} {s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoría (opcional)">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
              <option value="" style={{ background: DS.bgSide }}>— Sin categoría —</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id} style={{ background: DS.bgSide }}>{c.icon} {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notas (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle adicional" style={darkInput} />
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
          <button onClick={submit} disabled={busy || !name.trim() || !amount} style={{ ...darkBtn, opacity: busy || !name.trim() || !amount ? 0.5 : 1 }}>
            {busy ? "Guardando..." : `Registrar ${formatCOP(amount)}`}
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
