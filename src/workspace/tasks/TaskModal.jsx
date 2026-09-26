import { useState, useEffect, useRef } from "react";
import { DS, PRIORITY_COLORS, PRIORITY_LABEL, STATUS_LABEL } from "../../lib/design.js";
import { fmtShort, fmtTime } from "../../lib/dates.js";
import { createTask, updateTask, deleteTask, replaceAssignees } from "./workspace_tasks_db.js";
import { DateTimePicker } from "./DateTimePicker.jsx";
import { FlagIcon } from "./PriorityDropdown.jsx";
import { TaskTimer } from "./TaskTimer.jsx";

const PRIORITIES = ["urgente", "alta", "normal", "baja"];
const STATUSES = ["pendiente", "en_curso", "completado"];

// Iconos SVG de trazo (cero emoji).
const IC = {
  close: "M18 6 6 18M6 6l12 12",
  chevron: "M6 9.5l6 6 6-6",
  ring: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  user: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  calendar: "M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 4.5zM3 9.5h18M8 2.5v4M16 2.5v4",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
};
const Icon = ({ d, size = 14, sw = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
    <path d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function TaskModal({ task, companyId, members, spaces, currentMember, defaultStatus, defaultSpaceId, onClose, onSaved }) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState(task?.status || defaultStatus || "pendiente");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [dueTime, setDueTime] = useState(task?.due_time || "");
  const [recurrence, setRecurrence] = useState(
    task?.recurrence_pattern
      ? {
          pattern: task.recurrence_pattern,
          interval: task.recurrence_interval || 1,
          active: task.recurrence_active !== false,
          nextStatus: task.recurrence_next_status || null,
        }
      : null
  );
  const [spaceId, setSpaceId] = useState(task?.space_id || defaultSpaceId || "");
  const [assigneeIds, setAssigneeIds] = useState(
    task?.assigneeIds || (currentMember?.id ? [currentMember.id] : [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openDropdown, setOpenDropdown] = useState(null);
  const descRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleAssignee = (id) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleDropdown = (name) => setOpenDropdown((prev) => (prev === name ? null : name));

  const submit = async () => {
    setError("");
    if (!title.trim()) { setError("Escribe un título."); return; }
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status, priority,
      due_date: dueDate || null,
      due_time: dueTime || null,
      space_id: spaceId || null,
      recurrence_pattern: recurrence?.pattern || null,
      recurrence_interval: recurrence?.interval || 1,
      recurrence_active: !!recurrence?.active,
      recurrence_next_status: recurrence?.nextStatus || null,
    };
    if (status === "completado") {
      payload.completed_at = task?.completed_at || new Date().toISOString();
      payload.completed_by = task?.completed_by || currentMember?.id || null;
    } else { payload.completed_at = null; payload.completed_by = null; }

    if (isEdit) {
      const { error: err } = await updateTask(task.id, payload);
      if (err) { setError(err.message); setSaving(false); return; }
      await replaceAssignees(task.id, assigneeIds);
    } else {
      payload.created_by = currentMember?.id || null;
      payload.created_by_label = currentMember?.name || "Admin";
      const { error: err } = await createTask(companyId, payload, assigneeIds);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    onSaved?.();
    onClose?.();
  };

  const remove = async () => {
    if (!isEdit) return;
    setSaving(true);
    await deleteTask(task.id);
    setSaving(false);
    onSaved?.();
    onClose?.();
  };

  const currentSpace = spaces?.find((s) => s.id === spaceId);
  const selectedAssignees = assigneeIds.map((id) => members?.find((m) => m.id === id)).filter(Boolean);

  const statusColor = status === "completado" ? "var(--green)" : status === "en_curso" ? "var(--amber)" : "var(--sel)";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(8,8,14,0.62)",
        backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "72px 20px 40px", zIndex: 9999, fontFamily: DS.font,
        overflowY: "auto",
      }}
    >
      <div
        onClick={() => setOpenDropdown(null)}
        style={{
          background: "var(--surface-solid)", border: "1px solid var(--line)",
          borderRadius: 20, width: "100%", maxWidth: 720, height: "fit-content",
          boxShadow: "var(--shadow-lg)", color: "var(--ink)",
          display: "flex", flexDirection: "column", overflow: "visible",
        }}
      >
        {/* ── Top bar ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleDropdown("container"); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10,
                  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: DS.font,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentSpace?.color || "var(--sel)", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  {currentSpace ? currentSpace.name : "Sin espacio"}
                </span>
                <Icon d={IC.chevron} size={13} style={{ color: "var(--ink-3)" }} />
              </button>
              {openDropdown === "container" && (
                <DropdownPanel>
                  <div style={dropdownHeader()}>Espacio</div>
                  <DropdownItem active={!spaceId} onClick={() => { setSpaceId(""); setOpenDropdown(null); }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-4)", marginRight: 9 }} />
                    Sin espacio
                  </DropdownItem>
                  {(spaces || []).map((s) => (
                    <DropdownItem key={s.id} active={spaceId === s.id} onClick={() => { setSpaceId(s.id); setOpenDropdown(null); }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color || "var(--sel)", marginRight: 9 }} />
                      {s.name}
                    </DropdownItem>
                  ))}
                </DropdownPanel>
              )}
            </div>
            <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Tarea de la cuenta</span>
          </div>
          <button onClick={onClose} title="Cerrar" style={{
            display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 10,
            background: "transparent", border: "none", color: "var(--ink-3)", cursor: "pointer",
          }}><Icon d={IC.close} size={17} sw={2} /></button>
        </div>

        {/* ── Title + description ── */}
        <div style={{ padding: "20px 22px 4px" }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); descRef.current?.focus(); } }}
            placeholder="Nueva tarea"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontSize: 26, fontWeight: 700, fontFamily: DS.font,
              padding: 0, letterSpacing: "-0.02em",
            }}
          />
        </div>
        <div style={{ padding: "6px 22px 16px" }}>
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            placeholder="Añade una descripción o escribe con ✧ IA"
            rows={2}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: "var(--ink-2)", fontSize: 14, fontFamily: DS.font,
              resize: "vertical", padding: 0, lineHeight: 1.6, minHeight: 34,
            }}
          />
        </div>

        {/* ── Pills de propiedad ── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, padding: "14px 22px",
          borderTop: "1px solid var(--line)", alignItems: "center",
        }}>
          {/* Estado */}
          <div style={{ position: "relative" }}>
            <Pill active={openDropdown === "status"} onClick={(e) => { e.stopPropagation(); toggleDropdown("status"); }}>
              <Icon d={IC.ring} size={14} style={{ color: statusColor }} />
              {STATUS_LABEL[status]}
            </Pill>
            {openDropdown === "status" && (
              <DropdownPanel>
                {STATUSES.map((s) => (
                  <DropdownItem key={s} active={status === s} onClick={() => { setStatus(s); setOpenDropdown(null); }}>
                    {STATUS_LABEL[s]}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Asignados */}
          <div style={{ position: "relative" }}>
            <Pill active={openDropdown === "assignees"} onClick={(e) => { e.stopPropagation(); toggleDropdown("assignees"); }}>
              <Icon d={IC.user} size={14} style={{ color: "var(--ink-3)" }} />
              {selectedAssignees.length ? selectedAssignees.map((m) => m.name.split(" ")[0]).join(", ") : "Sin asignar"}
            </Pill>
            {openDropdown === "assignees" && (
              <DropdownPanel>
                {(members || []).map((m) => (
                  <DropdownItem key={m.id} active={assigneeIds.includes(m.id)} onClick={() => toggleAssignee(m.id)}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", background: m.color || "var(--sel)", color: "#FFFFFF",
                      fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 9,
                    }}>{m.name?.charAt(0).toUpperCase()}</span>
                    {m.name}
                    {assigneeIds.includes(m.id) && <span style={{ marginLeft: "auto", color: "var(--green)" }}>✓</span>}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Fecha */}
          <div style={{ position: "relative" }}>
            <Pill active={openDropdown === "date"} onClick={(e) => { e.stopPropagation(); toggleDropdown("date"); }} accent={dueDate ? "var(--sel)" : undefined}>
              <Icon d={IC.calendar} size={14} style={{ color: dueDate ? "var(--sel)" : "var(--ink-3)" }} />
              {dueDate ? (
                <>
                  {fmtShort(dueDate)}{dueTime ? ` ${fmtTime(dueTime)}` : ""}
                  <span onClick={(e) => { e.stopPropagation(); setDueDate(""); setDueTime(""); }}
                    style={{ color: "var(--ink-3)", cursor: "pointer", fontSize: 13, padding: "0 0 0 4px", opacity: 0.8 }}>×</span>
                </>
              ) : "Sin fecha"}
            </Pill>
            {openDropdown === "date" && (
              <DateTimePicker
                date={dueDate} time={dueTime}
                onChange={({ date, time }) => { setDueDate(date || ""); setDueTime(time || ""); }}
                recurrence={recurrence} onRecurrenceChange={setRecurrence}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* Prioridad */}
          <div style={{ position: "relative" }}>
            <Pill active={openDropdown === "priority"} onClick={(e) => { e.stopPropagation(); toggleDropdown("priority"); }} accent={PRIORITY_COLORS[priority]}>
              <FlagIcon color={priority === "normal" ? "var(--brand)" : PRIORITY_COLORS[priority]} size={12} />
              {priority === "normal" && !isEdit ? "Prioridad" : PRIORITY_LABEL[priority]}
            </Pill>
            {openDropdown === "priority" && (
              <DropdownPanel>
                {PRIORITIES.map((p) => (
                  <DropdownItem key={p} active={priority === p} onClick={() => { setPriority(p); setOpenDropdown(null); }}>
                    <FlagIcon color={PRIORITY_COLORS[p]} size={13} />
                    <span style={{ marginLeft: 9 }}>{PRIORITY_LABEL[p]}</span>
                    {priority === p && <span style={{ marginLeft: "auto", color: "var(--green)" }}>✓</span>}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Timer real — solo al editar una tarea existente */}
          {isEdit && task && (
            <div style={{ marginLeft: "auto" }}><TaskTimer task={task} size="md" /></div>
          )}
        </div>

        {/* ── Actividad ── */}
        <div style={{ padding: "4px 22px 14px", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)", padding: "12px 0 4px" }}>Actividad</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "6px 0" }}>
            {isEdit ? "Los cambios en esta tarea aparecerán acá." : "La actividad va a aparecer cuando se cree la tarea."}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            margin: "0 22px 12px", padding: "10px 12px",
            background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.3)",
            borderRadius: 10, color: "var(--brand)", fontSize: 12.5,
          }}>{error}</div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 22px", borderTop: "1px solid var(--line)", background: "var(--surface-2)",
          borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
        }}>
          <div>
            {isEdit && (
              <button onClick={remove} disabled={saving} title="Mover a papelera (se puede restaurar)" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12,
                border: "1px solid rgba(226,75,74,0.35)", background: "transparent",
                color: "var(--brand)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}><Icon d={IC.trash} size={14} sw={1.7} /> Mover a papelera</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={onClose} disabled={saving} style={{
              padding: "10px 18px", borderRadius: 12, background: "transparent", border: "1px solid var(--line)",
              color: "var(--ink-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
            }}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{
              padding: "11px 22px", borderRadius: 12,
              border: "1px solid rgba(111,184,255,0.38)",
              background: "linear-gradient(180deg, #1f2942, #141b2e)",
              color: "#EAF2FF", fontSize: 13, fontWeight: 700,
              boxShadow: "0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
              cursor: saving ? "wait" : "pointer", fontFamily: DS.font,
            }}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──
function Pill({ children, active, onClick, accent }) {
  const bColor = active ? (accent || "var(--sel)") : "var(--line)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 11,
        border: `1px solid ${bColor}`, background: active ? "var(--sel-soft)" : "var(--surface)",
        color: "var(--ink)", fontSize: 12.5, fontWeight: 600, fontFamily: DS.font,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >{children}</button>
  );
}

function DropdownPanel({ children }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0,
        background: "var(--surface-solid)", border: "1px solid var(--line)",
        borderRadius: 14, padding: 6, zIndex: 300, minWidth: 210,
        boxShadow: "var(--shadow-lg)", maxHeight: 300, overflowY: "auto",
      }}
    >{children}</div>
  );
}

function DropdownItem({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "8px 10px", borderRadius: 8,
        border: "none", background: active ? "var(--sel-soft)" : "transparent",
        cursor: "pointer", textAlign: "left", color: active ? "var(--sel)" : "var(--ink)", fontSize: 12.5,
        display: "flex", alignItems: "center", fontFamily: DS.font, fontWeight: active ? 600 : 500,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--sel-soft)" : "transparent"; }}
    >{children}</button>
  );
}

const dropdownHeader = () => ({
  fontSize: 11, fontWeight: 600, color: "var(--ink-4)",
  padding: "8px 10px 5px", letterSpacing: "0.02em",
});
