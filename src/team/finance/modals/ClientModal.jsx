import { useState } from "react";
import { DS, darkInput } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "./AccountModal.jsx";
import { AmountInput } from "../components/AmountInput.jsx";

const STATUS_OPTIONS = [
  { value: "active",   label: "Activo",   color: "#1D9E75" },
  { value: "prospect", label: "Prospecto", color: "#3B82F6" },
  { value: "paused",   label: "Pausado",  color: "#F59E0B" },
  { value: "churned",  label: "Churneado", color: "#E54B4B" },
];

const PIPELINE_STAGES = [
  "prospect", "conversation", "proposal", "negotiation", "won", "lost",
];

export function ClientModal({ client, finance, onClose }) {
  const isEdit = !!client;
  const [name, setName] = useState(client?.name || "");
  const [status, setStatus] = useState(client?.status || "active");
  const [monthlyValue, setMonthlyValue] = useState(client?.monthly_value || 0);
  const [paymentDay, setPaymentDay] = useState(client?.payment_day || "");
  const [startDate, setStartDate] = useState(client?.start_date || "");
  const [source, setSource] = useState(client?.source || "");
  const [pipelineStage, setPipelineStage] = useState(client?.pipeline_stage || "");
  const [pipelineProbability, setPipelineProbability] = useState(client?.pipeline_probability || 0);
  const [notes, setNotes] = useState(client?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), status, monthly_value: monthlyValue,
      payment_day: paymentDay ? Number(paymentDay) : null,
      start_date: startDate || null,
      source: source.trim() || null,
      pipeline_stage: pipelineStage || null,
      pipeline_probability: Number(pipelineProbability) || 0,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) await finance.updateClient(client.id, payload);
      else await finance.createClient(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Vital Bio" style={darkInput} />
      </Field>
      <Field label="Estado">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_OPTIONS.map((o) => {
            const active = status === o.value;
            return (
              <button key={o.value} onClick={() => setStatus(o.value)} style={{
                padding: "6px 12px", borderRadius: 50,
                border: `1px solid ${active ? o.color : DS.textHint}`,
                background: active ? `${o.color}22` : "transparent",
                color: active ? o.color : DS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}>{o.label}</button>
            );
          })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Valor mensual (retainer)">
          <AmountInput value={monthlyValue} onChange={setMonthlyValue} />
        </Field>
        <Field label="Día de cobro">
          <input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="Día" style={darkInput} />
        </Field>
      </div>
      <Field label="Fecha de inicio">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={darkInput} />
      </Field>
      <Field label="Origen (Instagram, referido, etc)">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ej: Referido de Juan" style={darkInput} />
      </Field>

      {status === "prospect" && (
        <>
          <Field label="Stage del pipeline">
            <select value={pipelineStage} onChange={(e) => setPipelineStage(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
              <option value="" style={{ background: DS.bgSide }}>—</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s} style={{ background: DS.bgSide, textTransform: "capitalize" }}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label={`Probabilidad de cierre (${Math.round(pipelineProbability * 100)}%)`}>
            <input type="range" min={0} max={100} value={Math.round(pipelineProbability * 100)} onChange={(e) => setPipelineProbability(Number(e.target.value) / 100)} style={{ width: "100%" }} />
          </Field>
        </>
      )}

      <Field label="Notas">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} />
      </Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit}
        saving={saving}
        onSubmit={submit}
        onClose={onClose}
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar este cliente?")) return;
          await finance.deleteClient(client.id);
          onClose?.();
        } : null}
      />
    </ModalShell>
  );
}
