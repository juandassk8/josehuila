// GASTOS DEL DÍA · LIFESTYLE — tabla compacta para gastos puntuales.
// Cols: Fecha · Nombre · Valor · Cobro TC (checkbox) · ✕
// Si "Cobro TC" está marcado, el gasto va a la cuenta Bolsillo TC (suma deuda).
// Si no, va a la cuenta default (resta cash).

import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { PanelCard, SHEET_HEADER_STYLE, SHEET_ROW_STYLE } from "./PanelCard.jsx";
import { EditableText, EditableAmount, EditableDate } from "./EditableCells.jsx";
import { formatCOP, parseCOP } from "../lib/finance_math.js";

const COL = "65px minmax(140px, 2fr) 80px 50px 22px";

export function CuadernoGastosDiarios({ scopeBucket, finance, from, to }) {
  const { transactions, accounts, createTransaction, updateTransaction, deleteTransaction } = finance;

  const ccAccount = useMemo(
    () => accounts.find((a) => a.type === "credit_card"),
    [accounts]
  );
  const defaultDebitAccount = useMemo(
    () => accounts.find((a) => a.type !== "credit_card") || accounts[0],
    [accounts]
  );

  const rows = useMemo(() => {
    if (!scopeBucket) return [];
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime() + 86400000;
    return transactions
      .filter((t) => t.type === "expense")
      .filter((t) => !t.is_recurring)
      .filter((t) => matchesScope(t, scopeBucket))
      .filter((t) => {
        const ms = new Date(t.transaction_date).getTime();
        return ms >= fromMs && ms < toMs;
      })
      .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  }, [transactions, scopeBucket, from, to]);

  const totalAll = rows.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalCredito = rows
    .filter((t) => ccAccount && t.account_id === ccAccount.id)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalDebito = totalAll - totalCredito;

  const handleUpdate = async (id, patch) => {
    try { await updateTransaction(id, patch); }
    catch (e) { alert("No se pudo guardar: " + (e?.message || e)); }
  };
  const handleDelete = async (id) => {
    if (!confirm("¿Borrar este gasto?")) return;
    try { await deleteTransaction(id); }
    catch (e) { alert("No se pudo borrar: " + (e?.message || e)); }
  };

  return (
    <PanelCard
      title="GASTOS DEL DÍA · LIFESTYLE"
      color={DS.red}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11 }}>
          <div style={{ display: "flex", gap: 14, color: DS.textSecondary, fontWeight: 600 }}>
            <span>Débito: <span style={{ color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalDebito)}</span></span>
            {ccAccount && (
              <span>Crédito: <span style={{ color: DS.red, fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalCredito)}</span></span>
            )}
          </div>
          <div style={{ fontWeight: 800, fontSize: 12 }}>
            TOTAL · <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalAll)}</span>
          </div>
        </div>
      }
    >
      <div style={{ ...SHEET_HEADER_STYLE, gridTemplateColumns: COL }}>
        <div>Fecha</div>
        <div>Nombre</div>
        <div style={{ textAlign: "right" }}>Valor</div>
        <div style={{ textAlign: "center" }}>Cobro TC</div>
        <div />
      </div>

      <QuickAddDaily
        scopeBucket={scopeBucket}
        ccAccount={ccAccount}
        defaultDebitAccount={defaultDebitAccount}
        createTransaction={createTransaction}
        col={COL}
      />

      {rows.length === 0 ? (
        <div style={{ padding: 14, textAlign: "center", color: DS.textMuted, fontSize: 11 }}>
          Sin gastos del día. Agregá uno arriba ↑
        </div>
      ) : rows.map((t) => (
        <DailyRow
          key={t.id}
          tx={t}
          ccAccount={ccAccount}
          defaultDebitAccount={defaultDebitAccount}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          col={COL}
        />
      ))}
    </PanelCard>
  );
}

function DailyRow({ tx, ccAccount, defaultDebitAccount, onUpdate, onDelete, col }) {
  const isCredit = ccAccount && tx.account_id === ccAccount.id;
  const toggleCobroTC = () => {
    const newAccId = isCredit
      ? (defaultDebitAccount?.id || tx.account_id)
      : (ccAccount?.id || tx.account_id);
    if (newAccId !== tx.account_id) onUpdate(tx.id, { account_id: newAccId });
  };
  return (
    <div style={{ ...SHEET_ROW_STYLE, gridTemplateColumns: col }}>
      <EditableDate
        value={tx.transaction_date}
        onSave={(v) => onUpdate(tx.id, { transaction_date: v })}
      />
      <EditableText
        value={tx.description}
        onSave={(v) => onUpdate(tx.id, { description: v })}
        placeholder="(sin nombre)"
      />
      <EditableAmount
        value={tx.amount}
        onSave={(v) => onUpdate(tx.id, { amount: v })}
      />
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 6px" }}>
        <button
          onClick={toggleCobroTC}
          disabled={!ccAccount}
          title={ccAccount ? (isCredit ? "Quitar Cobro TC" : "Cobrar a TC") : "Sin cuenta TC"}
          style={{
            background: isCredit ? withAlpha(DS.red, "33") : "transparent",
            color: isCredit ? DS.red : DS.textHint,
            border: `1px solid ${withAlpha(isCredit ? DS.red : DS.textHint, "55")}`,
            borderRadius: 4, cursor: ccAccount ? "pointer" : "not-allowed",
            padding: "2px 8px", fontSize: 11, fontWeight: 700,
            minWidth: 24,
          }}
        >{isCredit ? "✓" : ""}</button>
      </div>
      <button
        onClick={() => onDelete(tx.id)}
        title="Borrar"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 12, color: DS.textHint, padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = DS.red; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = DS.textHint; }}
      >✕</button>
    </div>
  );
}

function QuickAddDaily({ scopeBucket, ccAccount, defaultDebitAccount, createTransaction, col }) {
  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    cobro_tc: false,
  });
  const [saving, setSaving] = useState(false);

  const reset = () => setDraft({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    cobro_tc: false,
  });

  const submit = async () => {
    const amt = parseCOP(draft.amount);
    if (!amt) return;
    if (!defaultDebitAccount && !ccAccount) {
      alert("Creá una cuenta primero.");
      return;
    }
    setSaving(true);
    try {
      const account_id = draft.cobro_tc && ccAccount
        ? ccAccount.id
        : defaultDebitAccount.id;
      const payload = {
        type: "expense",
        status: "completed", // gasto del día = ya lo hiciste
        amount: amt,
        paid_amount: amt,
        description: draft.description || null,
        transaction_date: draft.transaction_date,
        account_id,
        is_recurring: false,
      };
      if (scopeBucket?.scopeId) payload.scope_id = scopeBucket.scopeId;
      if (scopeBucket?.legacyKeys?.[0]) payload.scope = scopeBucket.legacyKeys[0];
      await createTransaction(payload);
      reset();
    } catch (e) {
      alert("No se pudo crear: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !saving) { e.preventDefault(); submit(); }
  };

  const inputStyle = {
    ...darkInput,
    fontSize: 12, padding: "5px 7px",
    background: withAlpha(DS.red, "0a"),
    borderColor: withAlpha(DS.red, "44"),
  };

  if (!defaultDebitAccount && !ccAccount) return null;

  return (
    <div
      style={{
        ...SHEET_ROW_STYLE,
        gridTemplateColumns: col,
        background: withAlpha(DS.red, "06"),
        borderBottom: `1px solid ${withAlpha(DS.red, "33")}`,
      }}
      onKeyDown={onKeyDown}
    >
      <input
        type="date"
        value={draft.transaction_date}
        onChange={(e) => setDraft({ ...draft, transaction_date: e.target.value })}
        style={inputStyle}
      />
      <input
        placeholder="+ Nuevo gasto del día…"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        style={inputStyle}
      />
      <input
        placeholder="$0"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        style={{ ...inputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => setDraft({ ...draft, cobro_tc: !draft.cobro_tc })}
          disabled={!ccAccount}
          title={ccAccount ? "Marcar Cobro TC" : "Sin cuenta TC"}
          style={{
            background: draft.cobro_tc ? withAlpha(DS.red, "33") : "transparent",
            color: draft.cobro_tc ? DS.red : DS.textHint,
            border: `1px solid ${withAlpha(draft.cobro_tc ? DS.red : DS.textHint, "55")}`,
            borderRadius: 4, cursor: ccAccount ? "pointer" : "not-allowed",
            padding: "2px 8px", fontSize: 11, fontWeight: 700,
            minWidth: 24,
          }}
        >{draft.cobro_tc ? "✓" : ""}</button>
      </div>
      <button
        onClick={submit}
        disabled={saving || !parseCOP(draft.amount)}
        style={{
          background: parseCOP(draft.amount) ? DS.red : DS.textHint,
          color: "#fff", border: "none", borderRadius: 4,
          width: 22, height: 22, cursor: parseCOP(draft.amount) ? "pointer" : "not-allowed",
          fontSize: 13, fontWeight: 700,
        }}
      >{saving ? "…" : "+"}</button>
    </div>
  );
}

function matchesScope(tx, sb) {
  if (sb.scopeId && tx.scope_id === sb.scopeId) return true;
  if (sb.legacyKeys && sb.legacyKeys.includes(tx.scope)) return true;
  return false;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
