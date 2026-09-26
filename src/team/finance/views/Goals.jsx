import { useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "../modals/AccountModal.jsx";
import { AmountInput } from "../components/AmountInput.jsx";
import { formatCOP, formatCOPCompact } from "../lib/finance_math.js";

export function GoalsView({ finance }) {
  const { goals } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: DS.textMuted }}>{active.length} metas activas</div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva meta</button>
      </div>

      {goals.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          Sin metas. Definí metas de MRR, ahorro o reserva para trackear progreso.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[...active, ...completed].map((g) => {
            const pct = g.target_value > 0 ? Math.min(Number(g.current_value || 0) / Number(g.target_value), 1.5) : 0;
            const isDone = pct >= 1;
            const color = g.status === "completed" ? DS.green : isDone ? DS.green : DS.blue;
            return (
              <button key={g.id} onClick={() => setEditing(g)} style={{
                padding: 16, borderRadius: 14, background: DS.bgCard,
                border: `1px solid ${withAlpha(color, "44")}`,
                cursor: "pointer", fontFamily: DS.font, textAlign: "left",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, marginBottom: 4 }}>🎯 {g.title}</div>
                {g.description && <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>{g.description}</div>}
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                    {g.unit === "COP" ? formatCOPCompact(g.current_value || 0) : g.current_value || 0}
                  </span>
                  <span style={{ fontSize: 11, color: DS.textMuted }}>/ {g.unit === "COP" ? formatCOPCompact(g.target_value || 0) : g.target_value}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: withAlpha(DS.textHint, "33"), overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: "100%", background: color }} />
                </div>
                <div style={{ fontSize: 10, color, marginTop: 4, fontWeight: 600 }}>
                  {Math.round(pct * 100)}% {g.deadline && `· ${new Date(g.deadline).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openNew && <GoalModal goal={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <GoalModal goal={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GoalModal({ goal, finance, onClose }) {
  const isEdit = !!goal;
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const [targetValue, setTargetValue] = useState(goal?.target_value || 0);
  const [currentValue, setCurrentValue] = useState(goal?.current_value || 0);
  const [unit, setUnit] = useState(goal?.unit || "COP");
  const [deadline, setDeadline] = useState(goal?.deadline || "");
  const [status, setStatus] = useState(goal?.status || "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError("Título requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      title: title.trim(), description: description.trim() || null,
      target_value: targetValue, current_value: currentValue, unit,
      deadline: deadline || null, status,
    };
    try {
      if (isEdit) await finance.updateGoal(goal.id, payload);
      else await finance.createGoal(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? "Editar meta" : "Nueva meta"} onClose={onClose}>
      <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Ej: MRR de $15M al fin de año" style={darkInput} /></Field>
      <Field label="Descripción"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} /></Field>
      <Field label="Unidad">
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { v: "COP", label: "$ COP" },
            { v: "clientes", label: "Clientes" },
            { v: "%", label: "% margen" },
          ].map((o) => {
            const active = unit === o.v;
            return (
              <button key={o.v} onClick={() => setUnit(o.v)} style={{
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor actual">
          {unit === "COP" ? <AmountInput value={currentValue} onChange={setCurrentValue} /> :
            <input type="number" value={currentValue} onChange={(e) => setCurrentValue(Number(e.target.value) || 0)} style={darkInput} />}
        </Field>
        <Field label="Valor objetivo">
          {unit === "COP" ? <AmountInput value={targetValue} onChange={setTargetValue} /> :
            <input type="number" value={targetValue} onChange={(e) => setTargetValue(Number(e.target.value) || 0)} style={darkInput} />}
        </Field>
      </div>
      <Field label="Deadline"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={darkInput} /></Field>
      <Field label="Estado">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
          <option value="active" style={{ background: DS.bgSide }}>Activa</option>
          <option value="completed" style={{ background: DS.bgSide }}>Completada</option>
          <option value="paused" style={{ background: DS.bgSide }}>Pausada</option>
          <option value="dropped" style={{ background: DS.bgSide }}>Abandonada</option>
        </select>
      </Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit} saving={saving} onSubmit={submit} onClose={onClose}
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar esta meta?")) return;
          await finance.deleteGoal(goal.id); onClose?.();
        } : null}
      />
    </ModalShell>
  );
}
