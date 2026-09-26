// Tabla de detalle por scope (Agencia / Vivir / Lifestyle).
// Cols: Nombre · Fecha · Valor Pago (editable) · Valor Total · Tipo · ✕
//
// "Valor Pago" es paid_amount: editable inline. Su COLOR comunica estado:
//   verde   → pagado completo (paid_amount >= amount)
//   ámbar   → parcial         (0 < paid_amount < amount)
//   gris    → pendiente       (paid_amount = 0)
// Sin botones pill — el color basta para reducir ruido visual.
//
// Si paid_amount no existe en DB (pre-migration), se lee defensivo:
//   paid_amount ?? (status==='completed' ? amount : 0).
//
// Para Lifestyle: si existe una cuenta type='credit_card' con balance > 0,
// se inyecta un row SINTÉTICO al inicio mostrando la deuda total (read-only).

import { useMemo, useState, useEffect } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { PanelCard, SHEET_HEADER_STYLE, SHEET_ROW_STYLE } from "./PanelCard.jsx";
import { EditableText, EditableAmount, EditableDate, EditableSelect } from "./EditableCells.jsx";
import { formatCOP, formatCOPDense, parseCOP } from "../lib/finance_math.js";

// Dos COL variants: con o sin la columna Tipo. Agencia/Vivir van sin (todos
// los items son recurrentes por default). Lifestyle va con Tipo porque mezcla
// recurrentes ("TC", "Imprevistos") con puntuales.
const COL_WITH_TYPE   = "minmax(140px, 1.8fr) 60px 75px 75px 32px 22px";
const COL_NO_TYPE     = "minmax(150px, 2fr) 60px 80px 80px 22px";

const PAYMENT_TYPE_OPTIONS = [
  { value: "unico",      label: "Único" },
  { value: "recurrente", label: "Recurrente" },
];

// Lee paid_amount con fallback defensivo si la columna aún no existe en DB.
const paidOf = (t) => {
  if (t.paid_amount != null) return Number(t.paid_amount || 0);
  return t.status === "completed" ? Number(t.amount || 0) : 0;
};

export function CuadernoCategoryTable({
  scopeBucket, finance, from, to, anchorId, onlyRecurring, showTypeColumn = false,
}) {
  const { transactions, accounts, createTransaction, updateTransaction, deleteTransaction } = finance;
  const COL = showTypeColumn ? COL_WITH_TYPE : COL_NO_TYPE;

  const rows = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime() + 86400000;
    return transactions
      .filter((t) => t.type === "expense")
      .filter((t) => matchesScope(t, scopeBucket))
      .filter((t) => {
        const ms = new Date(t.transaction_date).getTime();
        return ms >= fromMs && ms < toMs;
      })
      .filter((t) => onlyRecurring ? !!t.is_recurring : true)
      .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
  }, [transactions, scopeBucket, from, to, onlyRecurring]);

  // Para Lifestyle: synthetic TC row (lee balance de cuenta TC).
  const ccAccount = useMemo(
    () => accounts.find((a) => a.type === "credit_card"),
    [accounts]
  );
  const showTCRow = scopeBucket.label === "Lifestyle" && ccAccount && Number(ccAccount.current_balance || 0) > 0;
  const tcDebt = showTCRow ? Number(ccAccount.current_balance || 0) : 0;

  const totalPago = rows.reduce((s, t) => s + paidOf(t), 0);
  const totalValor = rows.reduce((s, t) => s + Number(t.amount || 0), 0) + tcDebt;
  const totalPagoWithTC = totalPago; // TC no se paga desde aquí, solo se muestra.

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
    <div id={anchorId}>
      <PanelCard
        title={scopeBucket.label}
        color={DS.red}
        footer={
          <div style={{ display: "grid", gridTemplateColumns: COL, gap: 6 }}>
            <div>TOTAL</div>
            <div />
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: DS.green }}>{formatCOP(totalPagoWithTC)}</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalValor)}</div>
            {showTypeColumn && <div />}
            <div />
          </div>
        }
      >
        <div style={{ ...SHEET_HEADER_STYLE, gridTemplateColumns: COL }}>
          <div>Nombre</div>
          <div>Fecha</div>
          <div style={{ textAlign: "right" }}>Pago</div>
          <div style={{ textAlign: "right" }}>Total</div>
          {showTypeColumn && <div style={{ textAlign: "center" }}>Tipo</div>}
          <div />
        </div>

        <QuickAddCategoryItem
          scopeBucket={scopeBucket}
          accounts={accounts}
          createTransaction={createTransaction}
          col={COL}
          defaultRecurring={!!onlyRecurring}
          showTypeColumn={showTypeColumn}
        />

        {showTCRow && <SyntheticTCRow tcDebt={tcDebt} col={COL} showTypeColumn={showTypeColumn} />}

        {rows.length === 0 && !showTCRow ? (
          <div style={{ padding: 14, textAlign: "center", color: DS.textMuted, fontSize: 11 }}>
            Sin items. Agregá uno arriba ↑
          </div>
        ) : rows.map((t) => (
          <CategoryRow
            key={t.id}
            tx={t}
            accounts={accounts}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            col={COL}
            showTypeColumn={showTypeColumn}
          />
        ))}
      </PanelCard>
    </div>
  );
}

function SyntheticTCRow({ tcDebt, col, showTypeColumn }) {
  return (
    <div style={{
      ...SHEET_ROW_STYLE,
      gridTemplateColumns: col,
      background: withAlpha(DS.red, "06"),
      borderBottom: `1px solid ${withAlpha(DS.red, "22")}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: DS.textPrimary, fontWeight: 600, minWidth: 0 }}>
        <span style={{ fontSize: 12 }}>💳</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Tarjeta de Crédito</span>
      </div>
      <div style={{ fontSize: 10, color: DS.textMuted, padding: "3px 5px" }}>—</div>
      <div style={{ textAlign: "right", padding: "3px 5px", fontSize: 11, fontWeight: 600, color: DS.textMuted, fontVariantNumeric: "tabular-nums" }}>
        —
      </div>
      <div style={{ textAlign: "right", padding: "3px 5px", fontSize: 11, fontWeight: 700, color: DS.red, fontVariantNumeric: "tabular-nums" }} title={formatCOP(tcDebt)}>
        {formatCOPDense ? formatCOPDense(tcDebt) : formatCOP(tcDebt)}
      </div>
      {showTypeColumn && <div style={{ fontSize: 10, color: DS.textMuted, padding: "3px 5px", textAlign: "center" }}>—</div>}
      <div />
    </div>
  );
}

function CategoryRow({ tx, accounts, onUpdate, onDelete, col, showTypeColumn }) {
  const paid = paidOf(tx);
  const total = Number(tx.amount || 0);
  const isCard = (accounts.find((a) => a.id === tx.account_id) || {}).type === "credit_card";

  const updatePaid = (newPaid) => {
    const n = Math.max(0, Number(newPaid || 0));
    onUpdate(tx.id, {
      paid_amount: n,
      status: n >= total && total > 0 ? "completed" : "pending",
    });
  };

  return (
    <div style={{ ...SHEET_ROW_STYLE, gridTemplateColumns: col }}>
      {/* Nombre */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {isCard && (
          <span title="Tarjeta de crédito" style={{ fontSize: 10 }}>💳</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableText
            value={tx.description}
            onSave={(v) => onUpdate(tx.id, { description: v })}
            placeholder="(sin nombre)"
          />
        </div>
      </div>
      <EditableDate
        value={tx.transaction_date}
        onSave={(v) => onUpdate(tx.id, { transaction_date: v })}
      />
      <EditableAmount
        value={paid}
        onSave={updatePaid}
        payStatus={{ paid, total }}
      />
      <EditableAmount
        value={total}
        onSave={(v) => onUpdate(tx.id, { amount: v })}
      />
      {showTypeColumn && (
        <EditableSelect
          value={tx.is_recurring ? "recurrente" : "unico"}
          onSave={(v) => onUpdate(tx.id, { is_recurring: v === "recurrente" })}
          options={PAYMENT_TYPE_OPTIONS}
          renderDisplay={() => (
            <div style={{ width: "100%", textAlign: "center" }}>
              <span
                title={tx.is_recurring ? "Recurrente" : "Único"}
                style={{
                  fontSize: 12, fontWeight: 700,
                  color: tx.is_recurring ? DS.blue : DS.textMuted,
                }}
              >
                {tx.is_recurring ? "⟳" : "·"}
              </span>
            </div>
          )}
        />
      )}
      <button
        onClick={() => onDelete(tx.id)}
        title="Borrar"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 11, color: DS.textHint, padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = DS.red; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = DS.textHint; }}
      >✕</button>
    </div>
  );
}

function QuickAddCategoryItem({ scopeBucket, accounts, createTransaction, col, defaultRecurring, showTypeColumn }) {
  const defaultAccountId = (accounts.find((a) => a.type !== "credit_card") || accounts[0])?.id || "";
  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    is_recurring: defaultRecurring ?? true,
  });
  const [saving, setSaving] = useState(false);

  const reset = () => setDraft({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    is_recurring: defaultRecurring ?? true,
  });

  const submit = async () => {
    const amt = parseCOP(draft.amount);
    if (!amt) return;
    if (!accounts[0]) { alert("Creá una cuenta primero."); return; }
    setSaving(true);
    try {
      const payload = {
        type: "expense",
        status: "pending",
        amount: amt,
        paid_amount: 0,
        description: draft.description || null,
        transaction_date: draft.transaction_date,
        account_id: defaultAccountId,
        is_recurring: !!draft.is_recurring,
      };
      if (scopeBucket.scopeId) payload.scope_id = scopeBucket.scopeId;
      if (scopeBucket.legacyKeys?.[0]) payload.scope = scopeBucket.legacyKeys[0];
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

  if (accounts.length === 0) return null;

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
        placeholder={`+ Nuevo gasto ${scopeBucket.label}…`}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        style={inputStyle}
      />
      <input
        type="date"
        value={draft.transaction_date}
        onChange={(e) => setDraft({ ...draft, transaction_date: e.target.value })}
        style={inputStyle}
      />
      <div style={{ fontSize: 10, color: DS.textMuted, textAlign: "right", padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>—</div>
      <input
        placeholder="$0"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        style={{ ...inputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      />
      {showTypeColumn && (
        <select
          value={draft.is_recurring ? "recurrente" : "unico"}
          onChange={(e) => setDraft({ ...draft, is_recurring: e.target.value === "recurrente" })}
          style={{ ...inputStyle, padding: "4px 2px", textAlign: "center" }}
        >
          {PAYMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label[0]}</option>)}
        </select>
      )}
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
