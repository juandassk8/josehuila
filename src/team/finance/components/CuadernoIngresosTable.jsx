// Tabla de INGRESOS estilo Sheet — editable inline.
// Cols: Nombre · Recibido (paid_amount editable) · Valor Total · Fecha · Tipo
//
// "Recibido" = paid_amount, editable. Color del número comunica el estado:
//   verde si paid_amount >= amount (cobrado completo)
//   ámbar si parcial
//   gris si no se ha cobrado nada

import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { PanelCard, SHEET_HEADER_STYLE, SHEET_ROW_STYLE } from "./PanelCard.jsx";
import { EditableText, EditableAmount, EditableDate, EditableSelect, todayISO } from "./EditableCells.jsx";
import { formatCOP, parseCOP } from "../lib/finance_math.js";

const COL = "minmax(150px, 1.4fr) 80px 80px 65px 70px 22px";

const PAYMENT_TYPE_OPTIONS = [
  { value: "unico",      label: "Único" },
  { value: "recurrente", label: "Recurrente" },
];

// Lee paid_amount con fallback si la columna aún no existe en DB.
const paidOf = (t) => {
  if (t.paid_amount != null) return Number(t.paid_amount || 0);
  return t.status === "completed" ? Number(t.amount || 0) : 0;
};

export function CuadernoIngresosTable({ finance, from, to }) {
  const { transactions, accounts, createTransaction, updateTransaction, deleteTransaction } = finance;

  const rows = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime() + 86400000;
    return transactions
      .filter((t) => t.type === "income")
      .filter((t) => {
        const tms = new Date(t.transaction_date).getTime();
        return tms >= fromMs && tms < toMs;
      })
      .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  }, [transactions, from, to]);

  const totalRecibido = rows.reduce((s, r) => s + paidOf(r), 0);
  const totalValor = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const handleUpdate = async (id, patch) => {
    try { await updateTransaction(id, patch); }
    catch (e) { alert("No se pudo guardar: " + (e?.message || e)); }
  };
  const handleDelete = async (id) => {
    if (!confirm("¿Borrar este ingreso?")) return;
    try { await deleteTransaction(id); }
    catch (e) { alert("No se pudo borrar: " + (e?.message || e)); }
  };

  return (
    <PanelCard
      title="INGRESOS"
      color={DS.green}
      footer={
        <div style={{ display: "grid", gridTemplateColumns: COL, gap: 8 }}>
          <div>TOTAL</div>
          <div style={{ textAlign: "right", color: DS.green, fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalRecibido)}</div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCOP(totalValor)}</div>
          <div />
          <div />
          <div />
        </div>
      }
    >
      <div style={{ ...SHEET_HEADER_STYLE, gridTemplateColumns: COL }}>
        <div>Nombre</div>
        <div style={{ textAlign: "right" }}>Recibido</div>
        <div style={{ textAlign: "right" }}>Valor Total</div>
        <div>Fecha</div>
        <div>Tipo</div>
        <div />
      </div>

      <QuickAddIngreso
        accounts={accounts}
        createTransaction={createTransaction}
        col={COL}
      />

      {rows.length === 0 ? (
        <div style={{ padding: 18, textAlign: "center", color: DS.textMuted, fontSize: 11 }}>
          Sin ingresos en el período. Agregá uno arriba ↑
        </div>
      ) : (
        rows.map((t) => (
          <IngresoRow
            key={t.id}
            tx={t}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            col={COL}
          />
        ))
      )}
    </PanelCard>
  );
}

function IngresoRow({ tx, onUpdate, onDelete, col }) {
  const paid = paidOf(tx);
  const total = Number(tx.amount || 0);

  const updatePaid = (newPaid) => {
    const n = Math.max(0, Number(newPaid || 0));
    onUpdate(tx.id, {
      paid_amount: n,
      status: n >= total && total > 0 ? "completed" : "pending",
    });
  };

  return (
    <div style={{ ...SHEET_ROW_STYLE, gridTemplateColumns: col }}>
      <EditableText
        value={tx.description}
        onSave={(v) => onUpdate(tx.id, { description: v })}
        placeholder="(sin nombre)"
      />
      {/* Recibido — editable, color por estado */}
      <EditableAmount
        value={paid}
        onSave={updatePaid}
        payStatus={{ paid, total }}
      />
      {/* Valor Total */}
      <EditableAmount
        value={total}
        onSave={(v) => onUpdate(tx.id, { amount: v })}
      />
      <EditableDate value={tx.transaction_date} onSave={(v) => onUpdate(tx.id, { transaction_date: v })} />
      <EditableSelect
        value={tx.is_recurring ? "recurrente" : "unico"}
        onSave={(v) => onUpdate(tx.id, { is_recurring: v === "recurrente" })}
        options={PAYMENT_TYPE_OPTIONS}
        renderDisplay={() => (
          <span
            title={tx.is_recurring ? "Recurrente" : "Único"}
            style={{
              fontSize: 11, fontWeight: 700,
              color: tx.is_recurring ? DS.blue : DS.textMuted,
            }}
          >
            {tx.is_recurring ? "⟳" : "·"}
          </span>
        )}
      />
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

function QuickAddIngreso({ accounts, createTransaction, col }) {
  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    is_recurring: false,
  });
  const [saving, setSaving] = useState(false);

  const reset = () => setDraft({
    description: "",
    amount: "",
    transaction_date: todayISO(),
    is_recurring: false,
  });

  const submit = async () => {
    const amt = parseCOP(draft.amount);
    if (!amt) return;
    if (!accounts[0]) { alert("Creá una cuenta primero."); return; }
    setSaving(true);
    try {
      await createTransaction({
        type: "income",
        status: "pending",
        amount: amt,
        paid_amount: 0,
        description: draft.description || null,
        transaction_date: draft.transaction_date,
        account_id: accounts[0].id,
        scope: "personal",
        is_recurring: draft.is_recurring,
      });
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
    background: withAlpha(DS.green, "0a"),
    borderColor: withAlpha(DS.green, "44"),
  };

  return (
    <div
      style={{
        ...SHEET_ROW_STYLE,
        gridTemplateColumns: col,
        background: withAlpha(DS.green, "08"),
        borderBottom: `1px solid ${withAlpha(DS.green, "33")}`,
      }}
      onKeyDown={onKeyDown}
    >
      <input
        placeholder="+ Nuevo ingreso (nombre)…"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        style={inputStyle}
      />
      <div style={{ fontSize: 10, color: DS.textMuted, textAlign: "right", padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>—</div>
      <input
        placeholder="$0"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        style={{ ...inputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      />
      <input
        type="date"
        value={draft.transaction_date}
        onChange={(e) => setDraft({ ...draft, transaction_date: e.target.value })}
        style={inputStyle}
      />
      <select
        value={draft.is_recurring ? "recurrente" : "unico"}
        onChange={(e) => setDraft({ ...draft, is_recurring: e.target.value === "recurrente" })}
        style={inputStyle}
      >
        {PAYMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        onClick={submit}
        disabled={saving || !parseCOP(draft.amount)}
        style={{
          background: parseCOP(draft.amount) ? DS.green : DS.textHint,
          color: "#fff", border: "none", borderRadius: 4,
          width: 22, height: 22, cursor: parseCOP(draft.amount) ? "pointer" : "not-allowed",
          fontSize: 13, fontWeight: 700,
        }}
      >{saving ? "…" : "+"}</button>
    </div>
  );
}
