// Modal de crear/editar transacción.

import { useEffect, useMemo, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";

const SCOPE_OPTIONS = [
  { value: "agency",        label: "Agencia" },
  { value: "personal",      label: "Personal" },
  { value: "family",        label: "Familia" },
  { value: "content_capex", label: "Content CapEx" },
];

const STATUS_OPTIONS = [
  { value: "completed", label: "Completada" },
  { value: "pending",   label: "Pendiente" },
  { value: "overdue",   label: "Vencida" },
  { value: "cancelled", label: "Cancelada" },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function TransactionModal({ transaction, finance, onClose, onSaved }) {
  const isEdit = !!transaction;
  const { accounts, categories, clients } = finance;

  const [type, setType] = useState(transaction?.type || "expense");
  const [amount, setAmount] = useState(transaction?.amount || 0);
  const [scope, setScope] = useState(transaction?.scope || "agency");
  const [categoryId, setCategoryId] = useState(transaction?.category_id || "");
  const [accountId, setAccountId] = useState(transaction?.account_id || accounts[0]?.id || "");
  const [transactionDate, setTransactionDate] = useState(transaction?.transaction_date || todayStr());
  const [dueDate, setDueDate] = useState(transaction?.due_date || "");
  const [paidDate, setPaidDate] = useState(transaction?.paid_date || "");
  const [description, setDescription] = useState(transaction?.description || "");
  const [counterparty, setCounterparty] = useState(transaction?.counterparty || "");
  const [status, setStatus] = useState(transaction?.status || "completed");
  const [clientId, setClientId] = useState(transaction?.client_id || "");
  const [paymentType, setPaymentType] = useState(transaction?.payment_type || "one_time");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Categorías filtradas por type + scope, organizadas en árbol (padre + children indentados).
  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.scope === scope),
    [categories, type, scope]
  );

  // Versión ordenada: padre primero, sus children debajo con indent.
  const categoryOptions = useMemo(() => {
    const roots = availableCategories.filter((c) => !c.parent_category_id);
    const childrenByParent = new Map();
    for (const c of availableCategories) {
      if (c.parent_category_id) {
        if (!childrenByParent.has(c.parent_category_id)) childrenByParent.set(c.parent_category_id, []);
        childrenByParent.get(c.parent_category_id).push(c);
      }
    }
    const out = [];
    for (const r of roots) {
      out.push({ ...r, _depth: 0 });
      const kids = childrenByParent.get(r.id) || [];
      for (const k of kids) out.push({ ...k, _depth: 1 });
    }
    return out;
  }, [availableCategories]);

  // Cuando cambia type/scope, si la categoría seleccionada ya no aplica, resetear.
  useEffect(() => {
    if (categoryId && !availableCategories.find((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [type, scope, availableCategories, categoryId]);

  // Auto-link counterparty con cliente por nombre fuzzy.
  useEffect(() => {
    if (clientId || !counterparty) return;
    const match = clients.find((c) => c.name.toLowerCase() === counterparty.toLowerCase());
    if (match) setClientId(match.id);
  }, [counterparty, clients, clientId]);

  const submit = async () => {
    if (!amount || amount <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!accountId) {
      setError("Tenés que elegir una cuenta.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      type, amount, scope,
      category_id: categoryId || null,
      account_id: accountId,
      transaction_date: transactionDate,
      due_date: status === "pending" || status === "overdue" ? (dueDate || null) : null,
      paid_date: status === "completed" ? (paidDate || null) : null,
      description: description.trim() || null,
      counterparty: counterparty.trim() || null,
      status,
      client_id: clientId || null,
      payment_type: paymentType,
    };
    try {
      if (isEdit) {
        await finance.updateTransaction(transaction.id, payload);
      } else {
        await finance.createTransaction(payload);
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        padding: "60px 20px", zIndex: 9999, fontFamily: DS.font,
      }}
    >
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18,
        padding: 24, width: "100%", maxWidth: 560,
        color: DS.textPrimary, maxHeight: "calc(100vh - 120px)", overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {isEdit ? "Editar transacción" : "Nueva transacción"}
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 18 }}>
          {isEdit ? "Modificá los campos." : "Registrá un ingreso o gasto."}
        </div>

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 50, background: DS.bgCard, border: DS.border, marginBottom: 16, width: "fit-content" }}>
          {[
            { v: "expense", label: "💸 Gasto", color: DS.red },
            { v: "income",  label: "💵 Ingreso", color: DS.green },
          ].map((opt) => {
            const active = type === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setType(opt.v)}
                style={{
                  padding: "7px 16px", borderRadius: 50, border: "none",
                  background: active ? `${opt.color}22` : "transparent",
                  color: active ? opt.color : DS.textSecondary,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                }}
              >{opt.label}</button>
            );
          })}
        </div>

        {/* Monto + fecha en grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="Monto">
            <AmountInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Fecha">
            <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} style={darkInput} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="Scope">
            <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: DS.bgSide }}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
              <option value="" style={{ background: DS.bgSide }}>— Sin categoría —</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id} style={{ background: DS.bgSide }}>
                  {c._depth > 0 ? "▸ " : ""}{c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Cuenta">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
            <option value="" style={{ background: DS.bgSide }}>— Elegí una cuenta —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} style={{ background: DS.bgSide }}>{a.icon} {a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Descripción">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='Ej: "Almuerzo con Deison" / "Pago Vital Bio"'
            style={darkInput}
          />
        </Field>

        <Field label="Contraparte (cliente, proveedor, persona)">
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="Nombre"
            list="finance-clients-list"
            style={darkInput}
          />
          <datalist id="finance-clients-list">
            {clients.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>

        <Field label="Estado">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((o) => {
              const active = status === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  style={{
                    padding: "6px 12px", borderRadius: 50,
                    border: `1px solid ${active ? DS.green : DS.textHint}`,
                    background: active ? `${DS.green}22` : "transparent",
                    color: active ? DS.green : DS.textSecondary,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                  }}
                >{o.label}</button>
              );
            })}
          </div>
        </Field>

        <Field label="Tipo de pago">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "one_time", label: "Único" },
              { v: "recurring", label: "Recurrente (mensual)" },
            ].map((o) => {
              const active = paymentType === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPaymentType(o.v)}
                  style={{
                    padding: "6px 12px", borderRadius: 50,
                    border: `1px solid ${active ? DS.blue : DS.textHint}`,
                    background: active ? `${DS.blue}22` : "transparent",
                    color: active ? DS.blue : DS.textSecondary,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                  }}
                >{o.label}</button>
              );
            })}
          </div>
        </Field>

        {(status === "pending" || status === "overdue") && (
          <Field label="Fecha límite (due date)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={darkInput} />
          </Field>
        )}
        {status === "completed" && (
          <Field label="Fecha de pago (opcional)">
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={darkInput} />
          </Field>
        )}

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.4)",
            color: DS.red, fontSize: 12, marginBottom: 14,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
          <button
            onClick={async () => {
              if (!isEdit) return;
              if (!window.confirm("¿Borrar esta transacción?")) return;
              await finance.deleteTransaction(transaction.id);
              onClose?.();
            }}
            style={{ ...darkBtnGhost, color: DS.red, borderColor: "rgba(226,75,74,0.4)", visibility: isEdit ? "visible" : "hidden" }}
          >Eliminar</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={darkBtnGhost}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{ ...darkBtn, opacity: saving ? 0.5 : 1 }}>
              {saving ? "Guardando..." : (isEdit ? "Guardar" : "Crear")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.12em", marginBottom: 6, textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}
