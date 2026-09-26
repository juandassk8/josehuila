// Modal de confirmación post-parsing. Muestra los campos extraídos editables
// y permite al user confirmar/editar/cancelar.

import { useEffect, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, withAlpha } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";
import { formatCOP } from "../lib/finance_math.js";

const SCOPE_LABEL = {
  agency: "Agencia", personal: "Personal", family: "Familia", content_capex: "Content CapEx",
};

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function VoiceConfirmModal({ parsed, transcription, finance, onConfirm, onDiscard, onRetry }) {
  const { accounts, categories } = finance;

  const [type, setType] = useState(parsed.type || "expense");
  const [amount, setAmount] = useState(parsed.amount || 0);
  const [scope, setScope] = useState(parsed.scope || "agency");
  const [categoryId, setCategoryId] = useState(parsed.category_id || "");
  const [accountId, setAccountId] = useState(parsed.account_id || (accounts[0]?.id || ""));
  const [description, setDescription] = useState(parsed.description || "");
  const [counterparty, setCounterparty] = useState(parsed.counterparty || "");
  const [status, setStatus] = useState(parsed.status || "completed");
  const [transactionDate, setTransactionDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(parsed.due_date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Filtra categorías por type+scope
  const availableCategories = categories.filter((c) => c.type === type && c.scope === scope);

  // Si type/scope cambian, validar que la category siga aplicando
  useEffect(() => {
    if (categoryId && !availableCategories.find((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [type, scope, availableCategories, categoryId]);

  const submit = async () => {
    if (!amount || amount <= 0) { setError("Monto debe ser mayor a 0"); return; }
    if (!accountId) { setError("Tenés que elegir una cuenta"); return; }
    setBusy(true);
    setError("");
    try {
      await onConfirm({
        type, amount, scope,
        category_id: categoryId || null,
        account_id: accountId,
        transaction_date: transactionDate,
        due_date: status !== "completed" ? (dueDate || null) : null,
        description: description.trim() || transcription.slice(0, 60),
        counterparty: counterparty.trim() || null,
        status,
      });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const confidence = parsed.confidence || 0;
  const lowConfidence = confidence < 0.7;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onDiscard?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "40px 20px", zIndex: 9999, fontFamily: DS.font,
      }}
    >
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18,
        padding: 24, width: "100%", maxWidth: 560, color: DS.textPrimary,
        maxHeight: "calc(100vh - 80px)", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🎤</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Confirmá la transacción</div>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
              La IA parseó tu audio. Revisá los campos y editá si hace falta.
            </div>
          </div>
        </div>

        {/* Transcripción */}
        <div style={{
          marginTop: 16, marginBottom: 16,
          padding: 12, borderRadius: 10,
          background: withAlpha(DS.green, "10"),
          border: `1px solid ${withAlpha(DS.green, "33")}`,
          fontSize: 13, color: DS.textPrimary, lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.green, letterSpacing: "0.12em", marginBottom: 6 }}>
            DIJISTE
          </div>
          "{transcription}"
        </div>

        {lowConfidence && (
          <div style={{
            marginBottom: 14, padding: 10, borderRadius: 8,
            background: withAlpha(DS.amber, "18"),
            border: `1px solid ${withAlpha(DS.amber, "55")}`,
            fontSize: 11, color: DS.textPrimary,
          }}>
            ⚠️ Confianza baja ({Math.round(confidence * 100)}%). Revisá los campos con cuidado antes de guardar.
          </div>
        )}

        {/* Type toggle */}
        <div style={{
          display: "flex", gap: 6, padding: 4, borderRadius: 50,
          background: DS.bgCard, border: DS.border, marginBottom: 14, width: "fit-content",
        }}>
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
                  padding: "6px 14px", borderRadius: 50, border: "none",
                  background: active ? `${opt.color}22` : "transparent",
                  color: active ? opt.color : DS.textSecondary,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                }}
              >{opt.label}</button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Monto"><AmountInput value={amount} onChange={setAmount} /></Field>
          <Field label="Fecha"><input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} style={darkInput} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Scope">
            <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
              {Object.entries(SCOPE_LABEL).map(([v, label]) => (
                <option key={v} value={v} style={{ background: DS.bgSide }}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
              <option value="" style={{ background: DS.bgSide }}>— Sin categoría —</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id} style={{ background: DS.bgSide }}>{c.icon} {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Cuenta">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
            <option value="" style={{ background: DS.bgSide }}>— Elegí una cuenta —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} style={{ background: DS.bgSide }}>{a.icon} {a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Descripción">
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={darkInput} />
        </Field>

        <Field label="Contraparte">
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} style={darkInput} />
        </Field>

        <Field label="Estado">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "completed", label: "Completada" },
              { v: "pending", label: "Pendiente" },
            ].map((o) => {
              const active = status === o.v;
              return (
                <button key={o.v} type="button" onClick={() => setStatus(o.v)} style={{
                  padding: "6px 12px", borderRadius: 50,
                  border: `1px solid ${active ? DS.green : DS.textHint}`,
                  background: active ? `${DS.green}22` : "transparent",
                  color: active ? DS.green : DS.textSecondary,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}>{o.label}</button>
              );
            })}
          </div>
        </Field>

        {status === "pending" && (
          <Field label="Fecha límite">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={darkInput} />
          </Field>
        )}

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.4)",
            color: DS.red, fontSize: 12, marginBottom: 14,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
          <button onClick={onRetry} disabled={busy} style={darkBtnGhost}>🎤 Regrabar</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onDiscard} disabled={busy} style={darkBtnGhost}>Cancelar</button>
            <button onClick={submit} disabled={busy} style={{ ...darkBtn, opacity: busy ? 0.5 : 1 }}>
              {busy ? "Guardando..." : `Guardar ${formatCOP(amount)}`}
            </button>
          </div>
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
