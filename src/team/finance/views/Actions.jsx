// Action Engine — to-do list de cosas accionables.
// Las acciones pueden venir del AI Advisor (con [ACTION] tags) o crearse a mano.

import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions as ModalActionsBar } from "../modals/AccountModal.jsx";
import { formatRelativeDate } from "../lib/finance_math.js";

const PRIORITY_COLOR = {
  critical: "#E54B4B",
  high: "#F59E0B",
  medium: "#3B82F6",
  low: "#888888",
};
const PRIORITY_LABEL = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

const STATUS_LABEL = { pending: "Pendiente", in_progress: "En curso", completed: "Completada" };

export function ActionsView({ finance }) {
  const { actions } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);
  const [filter, setFilter] = useState("active"); // active | today | all

  const filtered = useMemo(() => {
    let arr = actions;
    if (filter === "active") {
      arr = arr.filter((a) => a.status === "pending" || a.status === "in_progress");
    } else if (filter === "today") {
      const today = new Date(); today.setHours(23, 59, 59, 999);
      arr = arr.filter((a) =>
        (a.status === "pending" || a.status === "in_progress") &&
        (a.priority === "critical" || a.priority === "high" ||
         (a.deadline && new Date(a.deadline) <= today))
      );
    }
    // Sort: status (pending > in_progress > completed) → priority → deadline
    return [...arr].sort((a, b) => {
      const statusOrder = { pending: 0, in_progress: 1, completed: 2, dismissed: 3 };
      const sd = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      if (sd !== 0) return sd;
      const pd = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (pd !== 0) return pd;
      const aDate = a.deadline || "9999-12-31";
      const bDate = b.deadline || "9999-12-31";
      return aDate.localeCompare(bDate);
    });
  }, [actions, filter]);

  const counts = useMemo(() => {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    return {
      all: actions.length,
      active: actions.filter((a) => a.status === "pending" || a.status === "in_progress").length,
      today: actions.filter((a) =>
        (a.status === "pending" || a.status === "in_progress") &&
        (a.priority === "critical" || a.priority === "high" ||
         (a.deadline && new Date(a.deadline) <= today))
      ).length,
    };
  }, [actions]);

  const handleToggleStatus = async (action, e) => {
    e.stopPropagation();
    const nextStatus = action.status === "completed" ? "pending" : "completed";
    await finance.updateAction(action.id, {
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, padding: 4, background: DS.bgCard, border: DS.border, borderRadius: 50 }}>
          {[
            { k: "today",  label: `Hoy · ${counts.today}` },
            { k: "active", label: `Activas · ${counts.active}` },
            { k: "all",    label: `Todas · ${counts.all}` },
          ].map((f) => {
            const active = filter === f.k;
            return (
              <button key={f.k} onClick={() => setFilter(f.k)} style={{
                padding: "6px 14px", borderRadius: 50, border: "none",
                background: active ? DS.bgSide : "transparent",
                color: active ? DS.textPrimary : DS.textSecondary,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}>{f.label}</button>
            );
          })}
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva acción</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          {actions.length === 0
            ? "Sin acciones. El AI Advisor va a generar acciones automáticamente cuando le pidas recomendaciones."
            : filter === "today" ? "Sin acciones para hoy. 🎉"
            : "Sin acciones que matcheen el filtro."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((a) => {
            const done = a.status === "completed";
            const overdue = a.deadline && new Date(a.deadline) < new Date() && !done;
            const pColor = PRIORITY_COLOR[a.priority] || DS.textMuted;
            return (
              <button key={a.id} onClick={() => setEditing(a)} style={{
                padding: "12px 14px", borderRadius: 12,
                background: DS.bgCard,
                border: `1px solid ${overdue ? withAlpha(DS.red, "55") : withAlpha(pColor, "33")}`,
                cursor: "pointer", fontFamily: DS.font, color: DS.textPrimary,
                display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
                opacity: done ? 0.55 : 1,
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: 3, background: pColor,
                }} />
                <button
                  onClick={(e) => handleToggleStatus(a, e)}
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${done ? DS.green : DS.textHint}`,
                    background: done ? DS.green : "transparent",
                    cursor: "pointer", flexShrink: 0, marginTop: 2,
                    color: "#fff", fontSize: 11, padding: 0,
                  }}
                  title={done ? "Marcar como pendiente" : "Marcar como completada"}
                >{done ? "✓" : ""}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: DS.textPrimary,
                    textDecoration: done ? "line-through" : "none",
                  }}>{a.title}</div>
                  {a.description && (
                    <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                      {a.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", fontSize: 10, flexWrap: "wrap" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 50,
                      background: withAlpha(pColor, "22"), color: pColor,
                      fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>{PRIORITY_LABEL[a.priority]}</span>
                    {a.deadline && (
                      <span style={{ color: overdue ? DS.red : DS.textMuted, fontWeight: overdue ? 700 : 400 }}>
                        {overdue ? "⚠️" : "📅"} {formatRelativeDate(a.deadline)}
                      </span>
                    )}
                    {a.generated_by === "ai" && (
                      <span style={{ color: DS.green, fontWeight: 600, fontSize: 9 }}>
                        🤖 AI ADVISOR
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openNew && <ActionModal action={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <ActionModal action={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ActionModal({ action, finance, onClose }) {
  const isEdit = !!action;
  const [title, setTitle] = useState(action?.title || "");
  const [description, setDescription] = useState(action?.description || "");
  const [priority, setPriority] = useState(action?.priority || "medium");
  const [deadline, setDeadline] = useState(action?.deadline || "");
  const [status, setStatus] = useState(action?.status || "pending");
  const [outcomeNotes, setOutcomeNotes] = useState(action?.outcome_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError("Título requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority, status,
      deadline: deadline || null,
      outcome_notes: outcomeNotes.trim() || null,
      completed_at: status === "completed" ? (action?.completed_at || new Date().toISOString()) : null,
    };
    try {
      if (isEdit) await finance.updateAction(action.id, payload);
      else await finance.createAction(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar esta acción?")) return;
    await finance.deleteAction(action.id);
    onClose?.();
  };

  return (
    <ModalShell title={isEdit ? "Editar acción" : "Nueva acción"} onClose={onClose}>
      <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={darkInput} /></Field>
      <Field label="Descripción"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} /></Field>
      <Field label="Prioridad">
        <div style={{ display: "flex", gap: 6 }}>
          {PRIORITY_ORDER.map((p) => {
            const active = priority === p;
            const c = PRIORITY_COLOR[p];
            return (
              <button key={p} onClick={() => setPriority(p)} style={{
                padding: "6px 12px", borderRadius: 50,
                border: `1px solid ${active ? c : DS.textHint}`,
                background: active ? `${c}22` : "transparent",
                color: active ? c : DS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}>{PRIORITY_LABEL[p]}</button>
            );
          })}
        </div>
      </Field>
      <Field label="Deadline"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={darkInput} /></Field>
      <Field label="Estado">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v} style={{ background: DS.bgSide }}>{l}</option>
          ))}
        </select>
      </Field>
      {status === "completed" && (
        <Field label="Notas de outcome (qué pasó cuando se completó)">
          <textarea value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} />
        </Field>
      )}

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActionsBar
        isEdit={isEdit} saving={saving} onSubmit={submit} onClose={onClose}
        onDelete={isEdit ? handleDelete : null}
      />
    </ModalShell>
  );
}
