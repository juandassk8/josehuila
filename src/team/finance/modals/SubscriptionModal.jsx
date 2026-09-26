import { useState } from "react";
import { DS, darkInput } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "./AccountModal.jsx";
import { AmountInput } from "../components/AmountInput.jsx";

const SCOPES = [
  { v: "agency",        label: "Agencia" },
  { v: "personal",      label: "Personal" },
  { v: "family",        label: "Familia" },
  { v: "content_capex", label: "Content" },
];
const STATUSES = [
  { v: "active",    label: "Activa",     color: "#1D9E75" },
  { v: "paused",    label: "Pausada",    color: "#F59E0B" },
  { v: "cancelled", label: "Cancelada",  color: "#888" },
];

export function SubscriptionModal({ subscription, finance, onClose }) {
  const isEdit = !!subscription;
  const [name, setName] = useState(subscription?.name || "");
  const [monthlyCost, setMonthlyCost] = useState(subscription?.monthly_cost || 0);
  const [billingDay, setBillingDay] = useState(subscription?.billing_day || "");
  const [category, setCategory] = useState(subscription?.category || "");
  const [scope, setScope] = useState(subscription?.scope || "agency");
  const [status, setStatus] = useState(subscription?.status || "active");
  const [lastUsedDate, setLastUsedDate] = useState(subscription?.last_used_date || "");
  const [url, setUrl] = useState(subscription?.url || "");
  const [cancelUrl, setCancelUrl] = useState(subscription?.cancel_url || "");
  const [notes, setNotes] = useState(subscription?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), monthly_cost: monthlyCost,
      billing_day: billingDay ? Number(billingDay) : null,
      category: category.trim() || null,
      scope, status,
      last_used_date: lastUsedDate || null,
      url: url.trim() || null,
      cancel_url: cancelUrl.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) await finance.updateSubscription(subscription.id, payload);
      else await finance.createSubscription(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? "Editar suscripción" : "Nueva suscripción"} onClose={onClose}>
      <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Supabase" style={darkInput} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Costo mensual"><AmountInput value={monthlyCost} onChange={setMonthlyCost} /></Field>
        <Field label="Día de cobro"><input type="number" min={1} max={31} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} placeholder="Día" style={darkInput} /></Field>
      </div>
      <Field label="Scope">
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
          {SCOPES.map((s) => <option key={s.v} value={s.v} style={{ background: DS.bgSide }}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Categoría libre (ej: software, dev tool)"><input value={category} onChange={(e) => setCategory(e.target.value)} style={darkInput} /></Field>
      <Field label="Estado">
        <div style={{ display: "flex", gap: 6 }}>
          {STATUSES.map((s) => {
            const active = status === s.v;
            return (
              <button key={s.v} onClick={() => setStatus(s.v)} style={{
                padding: "6px 12px", borderRadius: 50,
                border: `1px solid ${active ? s.color : DS.textHint}`,
                background: active ? `${s.color}22` : "transparent",
                color: active ? s.color : DS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}>{s.label}</button>
            );
          })}
        </div>
      </Field>
      <Field label="Último uso (para auditoría)"><input type="date" value={lastUsedDate} onChange={(e) => setLastUsedDate(e.target.value)} style={darkInput} /></Field>
      <Field label="URL del servicio"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={darkInput} /></Field>
      <Field label="URL para cancelar"><input value={cancelUrl} onChange={(e) => setCancelUrl(e.target.value)} placeholder="https://..." style={darkInput} /></Field>
      <Field label="Notas"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} /></Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit} saving={saving} onSubmit={submit} onClose={onClose}
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar esta suscripción?")) return;
          await finance.deleteSubscription(subscription.id); onClose?.();
        } : null}
      />
    </ModalShell>
  );
}
