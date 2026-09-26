import { useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "./AccountModal.jsx";
import { AmountInput } from "../components/AmountInput.jsx";

export function TeamCostModal({ teamCost, finance, onClose }) {
  const isEdit = !!teamCost;
  const { clients } = finance;
  const [name, setName] = useState(teamCost?.name || "");
  const [role, setRole] = useState(teamCost?.role || "");
  const [monthlyCost, setMonthlyCost] = useState(teamCost?.monthly_cost || 0);
  const [paymentDay, setPaymentDay] = useState(teamCost?.payment_day || "");
  const [paymentMethod, setPaymentMethod] = useState(teamCost?.payment_method || "");
  const [status, setStatus] = useState(teamCost?.status || "active");
  const [startDate, setStartDate] = useState(teamCost?.start_date || "");
  const [coveredByClientIds, setCoveredByClientIds] = useState(teamCost?.covered_by_client_ids || []);
  const [notes, setNotes] = useState(teamCost?.notes || "");
  const [isOwnerPay, setIsOwnerPay] = useState(!!teamCost?.is_owner_pay);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleClient = (id) => {
    setCoveredByClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), role: role.trim() || null,
      monthly_cost: monthlyCost,
      payment_day: paymentDay ? Number(paymentDay) : null,
      payment_method: paymentMethod.trim() || null,
      status, start_date: startDate || null,
      covered_by_client_ids: coveredByClientIds,
      notes: notes.trim() || null,
      is_owner_pay: isOwnerPay,
    };
    try {
      if (isEdit) await finance.updateTeamCost(teamCost.id, payload);
      else await finance.createTeamCost(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? "Editar costo de equipo" : "Nuevo miembro del equipo"} onClose={onClose}>
      {/* Toggle "mi sueldo" — destaca este registro como tu propio pago */}
      <div style={{
        marginBottom: 14, padding: "10px 12px", borderRadius: 10,
        background: isOwnerPay ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isOwnerPay ? "rgba(168,85,247,0.55)" : DS.textHint}`,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isOwnerPay}
            onChange={(e) => setIsOwnerPay(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary }}>
              🪪 Este es mi sueldo
            </div>
            <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
              Lo separamos del payroll del equipo. Cuenta como gasto fijo igual.
            </div>
          </div>
        </label>
      </div>

      <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Nath" style={darkInput} /></Field>
      <Field label="Rol"><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej: Project Manager" style={darkInput} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Costo mensual"><AmountInput value={monthlyCost} onChange={setMonthlyCost} /></Field>
        <Field label="Día de pago"><input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} style={darkInput} /></Field>
      </div>
      <Field label="Método de pago"><input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Ej: Transferencia Bancolombia" style={darkInput} /></Field>
      <Field label="Estado">
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { v: "active", label: "Activo", color: DS.green },
            { v: "inactive", label: "Inactivo", color: DS.textMuted },
          ].map((o) => {
            const active = status === o.v;
            return (
              <button key={o.v} onClick={() => setStatus(o.v)} style={{
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
      <Field label="Fecha de inicio"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={darkInput} /></Field>
      <Field label="Cubierto por (clientes que pagan este costo)">
        {clients.filter((c) => c.status === "active").length === 0 ? (
          <div style={{ fontSize: 11, color: DS.textMuted, padding: "8px 0" }}>Sin clientes activos aún. Agregá clientes para asignar cobertura.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {clients.filter((c) => c.status === "active").map((c) => {
              const checked = coveredByClientIds.includes(c.id);
              return (
                <label key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: 6,
                  borderRadius: 8, cursor: "pointer",
                  background: checked ? withAlpha(DS.green, "12") : "transparent",
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleClient(c.id)} />
                  <span style={{ fontSize: 12, flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: DS.textMuted, fontVariantNumeric: "tabular-nums" }}>
                    ${Number(c.monthly_value || 0).toLocaleString("es-CO")}/mes
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Field>
      <Field label="Notas"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} /></Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit} saving={saving} onSubmit={submit} onClose={onClose}
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar este miembro del equipo?")) return;
          await finance.deleteTeamCost(teamCost.id); onClose?.();
        } : null}
      />
    </ModalShell>
  );
}
