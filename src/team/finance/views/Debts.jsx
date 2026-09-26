import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "../modals/AccountModal.jsx";
import { AmountInput } from "../components/AmountInput.jsx";
import { formatCOP, formatRelativeDate } from "../lib/finance_math.js";

export function DebtsView({ finance }) {
  const { debts } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const owedToMe = useMemo(
    () => debts.filter((d) => d.direction === "owed_to_me" && d.status !== "paid"),
    [debts]
  );
  const iOwe = useMemo(
    () => debts.filter((d) => d.direction === "i_owe" && d.status !== "paid"),
    [debts]
  );
  const totalOwedToMe = owedToMe.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalIOwe = iOwe.reduce((s, d) => s + Number(d.amount || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: DS.textMuted }}>
          {debts.length} obligaciones · neto {formatCOP(totalOwedToMe - totalIOwe)}
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva deuda</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <DebtColumn
          title={`Me deben (${owedToMe.length})`}
          total={totalOwedToMe}
          color={DS.green}
          debts={owedToMe}
          onClick={setEditing}
        />
        <DebtColumn
          title={`Yo debo (${iOwe.length})`}
          total={totalIOwe}
          color={DS.red}
          debts={iOwe}
          onClick={setEditing}
        />
      </div>

      {openNew && <DebtModal debt={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <DebtModal debt={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DebtColumn({ title, total, color, debts, onClick }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: DS.bgCard, border: `1px solid ${withAlpha(color, "33")}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums", marginBottom: 14 }}>
        {formatCOP(total)}
      </div>
      {debts.length === 0 ? (
        <div style={{ fontSize: 11, color: DS.textMuted, fontStyle: "italic" }}>Sin pendientes.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {debts.map((d) => (
            <button key={d.id} onClick={() => onClick(d)} style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              background: withAlpha(DS.textHint, "11"), border: "none",
              cursor: "pointer", fontFamily: DS.font, color: DS.textPrimary,
              display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.counterparty_name}</div>
                {d.due_date && (
                  <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
                    {formatRelativeDate(d.due_date)}
                    {d.status === "partial" && <span style={{ marginLeft: 6, color: DS.amber }}>· parcial</span>}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                {formatCOP(d.amount)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DebtModal({ debt, finance, onClose }) {
  const isEdit = !!debt;
  const [counterparty, setCounterparty] = useState(debt?.counterparty_name || "");
  const [direction, setDirection] = useState(debt?.direction || "owed_to_me");
  const [amount, setAmount] = useState(debt?.amount || 0);
  const [dueDate, setDueDate] = useState(debt?.due_date || "");
  const [status, setStatus] = useState(debt?.status || "pending");
  const [notes, setNotes] = useState(debt?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!counterparty.trim()) { setError("Nombre requerido."); return; }
    if (!amount) { setError("Monto requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      counterparty_name: counterparty.trim(), direction, amount,
      due_date: dueDate || null, status, notes: notes.trim() || null,
    };
    try {
      if (isEdit) await finance.updateDebt(debt.id, payload);
      else await finance.createDebt(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? "Editar deuda" : "Nueva deuda"} onClose={onClose}>
      <Field label="Dirección">
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { v: "owed_to_me", label: "Me deben", color: DS.green },
            { v: "i_owe", label: "Yo debo", color: DS.red },
          ].map((o) => {
            const active = direction === o.v;
            return (
              <button key={o.v} onClick={() => setDirection(o.v)} style={{
                flex: 1, padding: "8px 12px", borderRadius: 50,
                border: `1px solid ${active ? o.color : DS.textHint}`,
                background: active ? `${o.color}22` : "transparent",
                color: active ? o.color : DS.textSecondary,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}>{o.label}</button>
            );
          })}
        </div>
      </Field>
      <Field label="Contraparte (persona/entidad)">
        <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} autoFocus style={darkInput} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Monto"><AmountInput value={amount} onChange={setAmount} /></Field>
        <Field label="Fecha pactada"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={darkInput} /></Field>
      </div>
      <Field label="Estado">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
          <option value="pending" style={{ background: DS.bgSide }}>Pendiente</option>
          <option value="partial" style={{ background: DS.bgSide }}>Parcial</option>
          <option value="paid" style={{ background: DS.bgSide }}>Pagada</option>
          <option value="cancelled" style={{ background: DS.bgSide }}>Cancelada</option>
        </select>
      </Field>
      <Field label="Notas"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} /></Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit} saving={saving} onSubmit={submit} onClose={onClose}
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar esta deuda?")) return;
          await finance.deleteDebt(debt.id); onClose?.();
        } : null}
      />
    </ModalShell>
  );
}
