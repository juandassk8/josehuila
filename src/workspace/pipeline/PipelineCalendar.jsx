import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";
import { useCompanyMask } from "../../lib/censor.jsx";
import {
  listSlotsForBoard,
  updateSlot,
  deleteSlot,
} from "../../despliegue/pipeline_db.js";
import { getBoardByCompany, listConcepts } from "../../despliegue/db.js";
import { SlotModal } from "../../despliegue/SlotModal.jsx";
import { useCompanyTasks } from "../tasks/hooks/useCompanyTasks.js";
import { listTeamMembers } from "../team_db.js";
import { TaskModal } from "../tasks/TaskModal.jsx";
import { logger } from "../../lib/logger.js";

// Calendario mensual del Content Pipeline. Muestra:
//   - Slots de despliegue con publication_date (📤) y edition_date (✂️)
//   - Tareas con due_date (✅) pendientes
// Sub-tabs Videos / Estáticos filtran los slots por `type`.
// Adaptado desde CompanyAgenda.jsx (que se deprecará al validarse este calendario).

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const CALENDAR_FILTERS = [
  { key: "all",    label: "Todo" },
  { key: "video",  label: "🎥 Videos" },
  { key: "static", label: "🖼 Estáticos" },
];

export function PipelineCalendar({ companyId, companyName, isAdmin }) {
  const { isDark } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);

  const [board, setBoard] = useState(null);
  const [slots, setSlots] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openSlot, setOpenSlot] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [filter, setFilter] = useState("all");

  const { tasks } = useCompanyTasks(companyId);
  const membersForTasks = useMemo(
    () => members.map((m) => ({ ...m, color: m.avatar_color || T.blue })),
    [members, T.blue]
  );

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const b = await getBoardByCompany(companyId);
        if (cancelled) return;
        setBoard(b);
        const loads = [listTeamMembers(companyId)];
        if (b) {
          loads.push(listSlotsForBoard(b.id));
          loads.push(listConcepts(b.id));
        }
        const [ms, sl = [], cs = []] = await Promise.all(loads);
        if (cancelled) return;
        setMembers(ms || []);
        setSlots(sl);
        setConcepts(cs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const filteredSlots = useMemo(() => {
    if (filter === "all") return slots;
    return slots.filter((s) => s.type === filter);
  }, [slots, filter]);

  const monthGrid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const s of filteredSlots) {
      if (s.edition_date) {
        (map[s.edition_date] ||= []).push({ slot: s, type: "edit" });
      }
      if (s.publication_date) {
        (map[s.publication_date] ||= []).push({ slot: s, type: "publish" });
      }
    }
    for (const t of tasks) {
      if (t.due_date && t.status !== "completado") {
        (map[t.due_date] ||= []).push({ task: t, type: "task" });
      }
    }
    return map;
  }, [filteredSlots, tasks]);

  const monthLabel = cursor.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleSlotUpdate = async (patch) => {
    if (!openSlot) return;
    const next = { ...openSlot, ...patch };
    setOpenSlot(next);
    setSlots((prev) => prev.map((s) => (s.id === openSlot.id ? next : s)));
    try { await updateSlot(openSlot.id, patch); } catch (e) { logger.error(e); }
  };

  const handleSlotDelete = async () => {
    if (!openSlot) return;
    if (!confirm(`¿Eliminar "${openSlot.title || "slot"}"?`)) return;
    const id = openSlot.id;
    setOpenSlot(null);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    try { await deleteSlot(id); } catch (e) { logger.error(e); }
  };

  return (
    <div style={{
      padding: "22px 28px 72px",
      maxWidth: 1440, margin: "0 auto",
      color: T.textPrimary, fontFamily: T.font,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            Calendario · {displayName}
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em",
            color: T.textPrimary, margin: "6px 0 0",
            textTransform: "capitalize",
          }}>
            {monthLabel}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            display: "flex", gap: 3, padding: 3,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(55,53,47,0.04)",
            border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(55,53,47,0.05)",
            borderRadius: 50,
          }}>
            {CALENDAR_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "6px 14px", borderRadius: 50, border: "none",
                  background: filter === f.key
                    ? (isDark ? "rgba(255,255,255,0.09)" : "#FFFFFF")
                    : "transparent",
                  color: filter === f.key ? T.textPrimary : T.textMuted,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  boxShadow: filter === f.key
                    ? (isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(15,15,15,0.06)")
                    : "none",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <IconBtn onClick={goPrev} T={T} isDark={isDark} title="Mes anterior">‹</IconBtn>
            <button
              onClick={goToday}
              style={{
                padding: "8px 14px", borderRadius: 50,
                border: T.border, background: "transparent",
                color: T.textPrimary, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Hoy
            </button>
            <IconBtn onClick={goNext} T={T} isDark={isDark} title="Mes siguiente">›</IconBtn>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 16, marginBottom: 14, fontSize: 11, color: T.textMuted }}>
        <Legend color="#C94C9E" label="✂️ Edición" />
        <Legend color="#1DB97A" label="📤 Publicación" />
        <Legend color="#8B5CF6" label="✅ Tarea" />
      </div>

      {loading ? (
        <div style={{ color: T.textMuted, fontSize: 13, padding: 20 }}>Cargando calendario…</div>
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6,
            marginBottom: 6,
          }}>
            {DAY_LABELS.map((d) => (
              <div key={d} style={{
                fontSize: 10, color: T.textMuted, fontWeight: 700,
                letterSpacing: "0.1em", textAlign: "left",
                padding: "6px 8px", textTransform: "uppercase",
              }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6,
          }}>
            {monthGrid.map((day) => (
              <DayCell
                key={day.iso}
                day={day}
                isCurrentMonth={day.month === cursor.getMonth()}
                events={eventsByDate[day.iso] || []}
                onSlotClick={setOpenSlot}
                onTaskClick={(t) => setEditingTask(t)}
                T={T}
                isDark={isDark}
              />
            ))}
          </div>
        </>
      )}

      {openSlot && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000, background: T.bg,
        }}>
          <SlotModal
            slot={openSlot}
            concepts={concepts}
            isAdmin={isAdmin}
            companyId={companyId}
            onClose={() => setOpenSlot(null)}
            onUpdate={handleSlotUpdate}
            onDelete={handleSlotDelete}
            simpleMode
          />
        </div>
      )}

      {editingTask && (
        <TaskModal
          task={editingTask}
          companyId={companyId}
          members={membersForTasks}
          spaces={[]}
          currentMember={null}
          onClose={() => setEditingTask(null)}
          onSaved={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

function DayCell({ day, isCurrentMonth, events, onSlotClick, onTaskClick, T, isDark }) {
  const today = isSameDay(new Date(), day.date);
  const bg = today
    ? (isDark ? "rgba(55,138,221,0.08)" : "rgba(55,138,221,0.05)")
    : T.bgCard;
  const numColor = !isCurrentMonth ? T.textHint : (today ? T.blue : T.textPrimary);

  return (
    <div style={{
      minHeight: 108, padding: "8px 10px",
      background: bg,
      border: today ? `1px solid ${T.blue}55` : T.border,
      borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{
        fontSize: 11, fontWeight: today ? 800 : 600,
        color: numColor, marginBottom: 2,
      }}>
        {day.date.getDate()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0 }}>
        {events.slice(0, 4).map((ev, i) => (
          <EventBar
            key={`${(ev.slot || ev.task)?.id}-${ev.type}-${i}`}
            event={ev}
            onClick={() => {
              if (ev.type === "task") onTaskClick?.(ev.task);
              else onSlotClick(ev.slot);
            }}
            T={T}
            isDark={isDark}
          />
        ))}
        {events.length > 4 && (
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, marginTop: 2 }}>
            +{events.length - 4} más
          </div>
        )}
      </div>
    </div>
  );
}

function EventBar({ event, onClick, T, isDark }) {
  const isTask = event.type === "task";
  const isEdit = event.type === "edit";
  const color = isTask ? "#8B5CF6" : (isEdit ? "#C94C9E" : "#1DB97A");
  const label = isTask ? "✅" : (isEdit ? "✂️" : "📤");
  const title = isTask
    ? (event.task.title || "Tarea")
    : (event.slot.title || event.slot.ad_name || "Sin título");
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 6px", borderRadius: 4,
        background: `${color}${isDark ? "22" : "15"}`,
        border: `1px solid ${color}44`,
        color: T.textPrimary,
        fontSize: 10.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 10, flexShrink: 0 }}>{label}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {title}
      </span>
    </button>
  );
}

function IconBtn({ onClick, children, T, isDark, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: T.border, background: "transparent",
        color: T.textPrimary, fontSize: 16, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span>{label}</span>
    </div>
  );
}

function buildMonthGrid(cursor) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const firstDow = (first.getDay() + 6) % 7;
  const start = new Date(y, m, 1 - firstDow);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({
      date: d,
      month: d.getMonth(),
      iso: toIso(d),
    });
  }
  return out;
}

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
