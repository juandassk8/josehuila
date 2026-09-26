import { useState, useEffect, useRef } from "react";
import { DS, PRIORITY_COLORS, PRIORITY_LABEL, STATUS_LABEL } from "../../lib/design.js";
import { fmtShort, fmtTime } from "../../lib/dates.js";
import { createTask, updateTask, deleteTask, replaceAssignees } from "../data/db.js";
import { DateTimePicker } from "./DateTimePicker.jsx";
import { FlagIcon } from "./PriorityDropdown.jsx";
import { TaskTimer, formatEstimate } from "./TaskTimer.jsx";
import { listHabits } from "../rutina/rutinaDb.js";

const PRIORITIES = ["urgente", "alta", "normal", "baja"];
const STATUSES = ["pendiente", "en_curso", "completado"];

export function TaskModal({ task, members, spaces, companies, currentMember, defaultStatus, defaultSpaceId, defaultCompanyId, onClose, onSaved }) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState(task?.status || defaultStatus || "pendiente");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [dueTime, setDueTime] = useState(task?.due_time || "");
  const [dueTimeEnd, setDueTimeEnd] = useState(task?.due_time_end || "");
  const [habitKey, setHabitKey] = useState(task?.habit_key || "");
  const [habits, setHabits] = useState([]);
  const [recurrence, setRecurrence] = useState(
    task?.recurrence_pattern
      ? {
          pattern: task.recurrence_pattern,
          interval: task.recurrence_interval || 1,
          active: task.recurrence_active !== false,
          nextStatus: task.recurrence_next_status || null,
          days: task.recurrence_days || null,
        }
      : null
  );
  const [container, setContainer] = useState(
    task?.company_id ? "company" : (defaultCompanyId ? "company" : "space")
  );
  const [spaceId, setSpaceId] = useState(task?.space_id || defaultSpaceId || "");
  const [companyId, setCompanyId] = useState(task?.company_id || defaultCompanyId || "");
  // Al CREAR: auto-asignar al creador. Al editar: usa lo que ya tiene.
  const [assigneeIds, setAssigneeIds] = useState(
    task?.assigneeIds || (currentMember?.id ? [currentMember.id] : [])
  );
  const [estimate, setEstimate] = useState(task?.estimate_minutes ? String(task.estimate_minutes) : "");
  const [workType, setWorkType] = useState(task?.work_type || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Which dropdown is open (only one at a time)
  const [openDropdown, setOpenDropdown] = useState(null);
  const descRef = useRef(null);

  // Hábitos del miembro, para poder enlazar la tarea con uno.
  useEffect(() => {
    if (!currentMember?.id) return undefined;
    let alive = true;
    listHabits(currentMember.id).then(({ data }) => { if (alive) setHabits(data || []); });
    return () => { alive = false; };
  }, [currentMember?.id]);

  useEffect(() => {
    if (!task && container === "space" && !spaceId && spaces?.length) {
      // Solo como último recurso si no hay defaultSpaceId y no se eligió nada.
      setSpaceId(spaces[0].id);
    }
  }, [task, container, spaceId, spaces]);

  const toggleAssignee = (id) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleDropdown = (name) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const submit = async () => {
    setError("");
    if (!title.trim()) { setError("Escribe un título."); return; }
    if (container === "space" && !spaceId) { setError("Selecciona un espacio."); return; }
    if (container === "company" && !companyId) { setError("Selecciona una empresa."); return; }
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status, priority,
      due_date: dueDate || null,
      due_time: dueTime || null,
      due_time_end: dueTime && dueTimeEnd ? dueTimeEnd : null,
      habit_key: habitKey || null,
      recurrence_days: recurrence?.pattern === "dias_semana" ? recurrence.days || null : null,
      space_id: container === "space" ? spaceId : null,
      company_id: container === "company" ? companyId : null,
      recurrence_pattern: recurrence?.pattern || null,
      recurrence_interval: recurrence?.interval || 1,
      recurrence_active: !!recurrence?.active,
      recurrence_next_status: recurrence?.nextStatus || null,
      estimate_minutes: parseInt(estimate, 10) > 0 ? Math.min(6000, parseInt(estimate, 10)) : null,
      work_type: workType || null,
    };
    if (status === "completado") {
      payload.completed_at = task?.completed_at || new Date().toISOString();
      payload.completed_by = task?.completed_by || currentMember?.id;
    } else { payload.completed_at = null; payload.completed_by = null; }

    if (isEdit) {
      const { error: err } = await updateTask(task.id, payload);
      if (err) { setError(err.message); setSaving(false); return; }
      await replaceAssignees(task.id, assigneeIds);
    } else {
      payload.created_by = currentMember?.id;
      const { error: err } = await createTask(payload, assigneeIds);
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
  const currentCompany = companies?.find((c) => c.id === companyId);
  const containerLabel = container === "company"
    ? (currentCompany?.name || "Empresa")
    : (currentSpace ? `${currentSpace.icon || "📁"} ${currentSpace.name}` : "Espacio");

  const selectedAssignees = assigneeIds.map((id) => members?.find((m) => m.id === id)).filter(Boolean);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "80px 20px 40px", zIndex: 9999, fontFamily: DS.font,
      }}
    >
      <div
        onClick={() => setOpenDropdown(null)}
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 16, width: "100%", maxWidth: 640,
          boxShadow: "0 20px 80px rgba(0,0,0,0.6)", color: DS.textPrimary,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* ── Top bar ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: DS.border,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleDropdown("container"); }}
                style={topBarBtn()}
              >
                {container === "company" ? "🏢" : "☰"} {containerLabel} ▾
              </button>
              {openDropdown === "container" && (
                <DropdownPanel>
                  <div style={dropdownHeader()}>ESPACIOS</div>
                  {(spaces || []).map((s) => (
                    <DropdownItem key={s.id} active={container === "space" && spaceId === s.id}
                      onClick={() => { setContainer("space"); setSpaceId(s.id); setOpenDropdown(null); }}>
                      {s.icon || "📁"} {s.name}
                    </DropdownItem>
                  ))}
                  <div style={dropdownHeader()}>EMPRESAS</div>
                  {(companies || []).map((c) => (
                    <DropdownItem key={c.id} active={container === "company" && companyId === c.id}
                      onClick={() => { setContainer("company"); setCompanyId(c.id); setOpenDropdown(null); }}>
                      🏢 {c.name}
                    </DropdownItem>
                  ))}
                </DropdownPanel>
              )}
            </div>
            <span style={{ fontSize: 12, color: DS.textMuted }}>●  Tarea</span>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 16, padding: "4px 8px",
          }}>✕</button>
        </div>

        {/* ── Title ── */}
        <div style={{ padding: "20px 24px 0" }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); descRef.current?.focus(); } }}
            placeholder={'Escribe el nombre de Tarea o "/" para los comandos'}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: DS.textPrimary, fontSize: 22, fontWeight: 500, fontFamily: DS.font,
              padding: 0, letterSpacing: "-0.01em",
            }}
          />
        </div>

        {/* ── Description ── */}
        <div style={{ padding: "10px 24px 16px" }}>
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            placeholder="Añade una descripción o escribe con ✧ IA"
            rows={2}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: DS.textSecondary, fontSize: 14, fontFamily: DS.font,
              resize: "vertical", padding: 0, lineHeight: 1.6, minHeight: 40,
            }}
          />
        </div>

        {/* ── Toolbar (badges) ── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 24px",
          borderTop: DS.border,
          alignItems: "center",
        }}>
          {/* Status badge */}
          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "status"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("status"); }}
              color={status === "completado" ? DS.green : status === "en_curso" ? DS.amber : DS.textSecondary}
              bold
            >
              {STATUS_LABEL[status]?.toUpperCase()}
            </Badge>
            {openDropdown === "status" && (
              <DropdownPanel>
                {STATUSES.map((s) => (
                  <DropdownItem key={s} active={status === s}
                    onClick={() => { setStatus(s); setOpenDropdown(null); }}>
                    {STATUS_LABEL[s]}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Assignees badge */}
          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "assignees"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("assignees"); }}
            >
              👤 {selectedAssignees.length ? selectedAssignees.map((m) => m.name).join(", ") : "Persona asignada"}
            </Badge>
            {openDropdown === "assignees" && (
              <DropdownPanel>
                {(members || []).map((m) => (
                  <DropdownItem key={m.id} active={assigneeIds.includes(m.id)}
                    onClick={() => toggleAssignee(m.id)}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: m.color || DS.blue, color: DS.textPrimary,
                      fontSize: 10, fontWeight: 700, display: "inline-flex",
                      alignItems: "center", justifyContent: "center", marginRight: 8,
                    }}>{m.name?.charAt(0).toUpperCase()}</span>
                    {m.name}
                    {assigneeIds.includes(m.id) && <span style={{ marginLeft: "auto", color: DS.green }}>✓</span>}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Date badge */}
          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "date"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("date"); }}
              color={dueDate ? DS.green : undefined}
            >
              📅 {dueDate ? (
                <>
                  {fmtShort(dueDate)}{dueTime ? ` ${fmtTime(dueTime)}${dueTimeEnd ? ` – ${fmtTime(dueTimeEnd)}` : ""}` : ""}
                  <button onClick={(e) => { e.stopPropagation(); setDueDate(""); setDueTime(""); setDueTimeEnd(""); }}
                    style={{ background: "transparent", border: "none", color: DS.green, cursor: "pointer", fontSize: 11, padding: "0 0 0 4px", opacity: 0.7 }}>×</button>
                </>
              ) : "Fecha"}
            </Badge>
            {openDropdown === "date" && (
              <DateTimePicker
                date={dueDate}
                time={dueTime}
                timeEnd={dueTimeEnd}
                onChange={({ date, time, timeEnd }) => { setDueDate(date || ""); setDueTime(time || ""); setDueTimeEnd(time ? timeEnd || "" : ""); }}
                recurrence={recurrence}
                onRecurrenceChange={setRecurrence}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* Priority badge */}
          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "priority"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("priority"); }}
              color={PRIORITY_COLORS[priority]}
            >
              <FlagIcon color={PRIORITY_COLORS[priority]} size={11} /> {PRIORITY_LABEL[priority]}
            </Badge>
            {openDropdown === "priority" && (
              <DropdownPanel>
                {PRIORITIES.map((p) => (
                  <DropdownItem key={p} active={priority === p}
                    onClick={() => { setPriority(p); setOpenDropdown(null); }}>
                    <FlagIcon color={PRIORITY_COLORS[p]} size={13} />
                    <span style={{ marginLeft: 8 }}>{PRIORITY_LABEL[p]}</span>
                    {priority === p && <span style={{ marginLeft: "auto", color: DS.green }}>✓</span>}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Estimado + tipo de trabajo */}
          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "estimate"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("estimate"); }}
              color={estimate ? DS.green : undefined}
            >
              ⏱ {parseInt(estimate, 10) > 0 ? formatEstimate(parseInt(estimate, 10)) : "Estimado"}
            </Badge>
            {openDropdown === "estimate" && (
              <DropdownPanel>
                {[15, 25, 45, 60, 90, 120, 180].map((m) => (
                  <DropdownItem key={m} active={parseInt(estimate, 10) === m}
                    onClick={() => { setEstimate(String(m)); setOpenDropdown(null); }}>
                    {formatEstimate(m)}
                  </DropdownItem>
                ))}
                <div style={{ display: "flex", gap: 6, padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number" min="1" placeholder="Minutos" value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") setOpenDropdown(null); }}
                    style={{
                      flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 8, border: `1px solid ${DS.textHint}`,
                      background: "transparent", color: DS.textPrimary, fontSize: 12, fontFamily: DS.font, outline: "none",
                    }}
                  />
                  {estimate && (
                    <button onClick={() => { setEstimate(""); setOpenDropdown(null); }}
                      style={{ background: "transparent", border: "none", color: DS.textMuted, cursor: "pointer", fontSize: 11 }}>
                      Quitar
                    </button>
                  )}
                </div>
              </DropdownPanel>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <Badge
              active={openDropdown === "workType"}
              onClick={(e) => { e.stopPropagation(); toggleDropdown("workType"); }}
              color={workType === "profundo" ? DS.blue || DS.green : workType === "liviano" ? DS.amber : workType === "personal" ? DS.purple : undefined}
            >
              {workType === "profundo" ? "🧠 Pesado" : workType === "liviano" ? "🪶 Liviano" : workType === "personal" ? "🌱 Personal" : "Tipo"}
            </Badge>
            {openDropdown === "workType" && (
              <DropdownPanel>
                {[["profundo", "🧠 Trabajo pesado"], ["liviano", "🪶 Trabajo liviano"], ["personal", "🌱 Personal (no es trabajo)"], ["", "Sin definir"]].map(([v, label]) => (
                  <DropdownItem key={v || "none"} active={workType === v}
                    onClick={() => { setWorkType(v); setOpenDropdown(null); }}>
                    {label}
                    {workType === v && <span style={{ marginLeft: "auto", color: DS.green }}>✓</span>}
                  </DropdownItem>
                ))}
              </DropdownPanel>
            )}
          </div>

          {/* Reunión: abre Google Calendar con el evento ya lleno (fecha, hora y título); solo falta Guardar */}
          {dueDate && dueTime && (
            <a
              href={googleCalendarLink({ title, description, date: dueDate, time: dueTime, timeEnd: dueTimeEnd, estimate })}
              target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              title="Abre Google Calendar con esta reunión ya llena; le das Guardar y queda en tu calendario"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, textDecoration: "none",
                border: `1px solid ${DS.purple}66`, background: `${DS.purple}14`, color: DS.textPrimary, fontSize: 12, fontWeight: 600, fontFamily: DS.font,
              }}
            >📅 Crear en Google Calendar</a>
          )}

          {/* Enlace con un hábito: al completarla marca el hábito y su bloque en Mi rutina */}
          {habits.length > 0 && (
            <div style={{ position: "relative" }}>
              <Badge
                active={openDropdown === "habit"}
                onClick={(e) => { e.stopPropagation(); toggleDropdown("habit"); }}
                color={habitKey ? DS.green : undefined}
              >
                {habitKey ? `🔗 ${habits.find((h) => h.key === habitKey)?.name || "Hábito"}` : "Hábito"}
              </Badge>
              {openDropdown === "habit" && (
                <DropdownPanel>
                  {[{ key: "", name: "Ninguno" }, ...habits].map((h) => (
                    <DropdownItem key={h.key || "none"} active={habitKey === h.key}
                      onClick={() => { setHabitKey(h.key); setOpenDropdown(null); }}>
                      {h.name}
                      {habitKey === h.key && <span style={{ marginLeft: "auto", color: DS.green }}>✓</span>}
                    </DropdownItem>
                  ))}
                </DropdownPanel>
              )}
            </div>
          )}

          <span style={{ color: DS.textHint, fontSize: 16, cursor: "default" }}>⋯</span>

          {isEdit && task && (
            <div style={{ marginLeft: "auto" }}>
              <TaskTimer task={task} size="md" />
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            margin: "0 24px 12px", padding: "10px 12px",
            background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)",
            borderRadius: 10, color: DS.red, fontSize: 12,
          }}>{error}</div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px", borderTop: DS.border,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isEdit && (
              <button onClick={remove} disabled={saving} style={{
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid rgba(226,75,74,0.2)", background: "transparent",
                color: DS.red, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }} title="Mover a papelera (se puede restaurar)">🗑 Mover a papelera</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onClose} disabled={saving} style={{
              padding: "10px 20px", borderRadius: 8,
              background: "transparent", border: DS.border,
              color: DS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{
              padding: "10px 22px", borderRadius: 8, border: "none",
              background: DS.textPrimary, color: DS.bg, fontSize: 13, fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear Tarea"}
              {!isEdit && <span style={{ opacity: 0.5 }}>▾</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable sub-components ──

function Badge({ children, active, onClick, color, bold }) {
  const accent = color || DS.textSecondary;
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 6, cursor: "pointer",
        border: `1px solid ${active ? accent : DS.textHint}`,
        background: active ? accent + "15" : DS.bgCard,
        color: color ? accent : DS.textPrimary,
        fontSize: 12, fontWeight: bold ? 800 : 600,
        display: "flex", alignItems: "center", gap: 4,
        whiteSpace: "nowrap", letterSpacing: bold ? "0.08em" : "0",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >{children}</button>
  );
}

// Hover/active backgrounds que funcionan en light y dark (neutro translúcido)
const HOVER_BG = "rgba(127,127,127,0.10)";
const ACTIVE_BG = "rgba(127,127,127,0.18)";

function DropdownPanel({ children }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "calc(100% + 4px)", left: 0,
        background: DS.bgSide, border: DS.border,
        borderRadius: 10, padding: 6, zIndex: 300, minWidth: 200,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: 280, overflowY: "auto",
      }}
    >{children}</div>
  );
}

function DropdownItem({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "8px 10px", borderRadius: 6,
        border: "none", background: active ? ACTIVE_BG : "transparent",
        cursor: "pointer", textAlign: "left", color: DS.textPrimary, fontSize: 12,
        display: "flex", alignItems: "center", fontFamily: DS.font,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = HOVER_BG; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? ACTIVE_BG : "transparent"; }}
    >{children}</button>
  );
}

// Funciones en vez de constantes — así leen DS al momento del render
// (evita valores congelados al module-load antes de applyTheme).
const topBarBtn = () => ({
  padding: "6px 12px", borderRadius: 6,
  border: DS.border,
  background: "transparent", color: DS.textSecondary,
  cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: DS.font,
  display: "flex", alignItems: "center", gap: 6,
});

const dropdownHeader = () => ({
  fontSize: 9, fontWeight: 700, color: DS.textMuted,
  padding: "8px 10px 4px", letterSpacing: "0.12em",
  textTransform: "uppercase",
});

// Enlace de "evento nuevo" de Google Calendar con los datos de la tarea ya puestos.
function googleCalendarLink({ title, description, date, time, timeEnd, estimate }) {
  const compact = (d, t) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const [h, m] = time.split(":").map(Number);
  let end = timeEnd && timeEnd > time ? timeEnd : null;
  if (!end) {
    const total = Math.min(23 * 60 + 59, h * 60 + m + (parseInt(estimate, 10) > 0 ? parseInt(estimate, 10) : 30));
    end = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: (title || "Reunión").trim(),
    dates: `${compact(date, time)}/${compact(date, end)}`,
    details: (description || "").trim(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
