import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import {
  listSlotsForBoard,
  updateSlot,
  deleteSlot,
  PIPELINE_STATUSES,
} from "../despliegue/pipeline_db.js";
import { getBoardByCompany, listConcepts } from "../despliegue/db.js";
import { SlotModal } from "../despliegue/SlotModal.jsx";
import { useCompanyTasks } from "./tasks/hooks/useCompanyTasks.js";
import { useCompanyTaskSpaces } from "./tasks/hooks/useCompanyTaskSpaces.js";
import { listTeamMembers } from "./team_db.js";
import { TasksBoard } from "./tasks/TasksBoard.jsx";
import { TasksList } from "./tasks/TasksList.jsx";
import { TaskModal } from "./tasks/TaskModal.jsx";
import { useCompanyMask } from "../lib/censor.jsx";
import { logger } from "../lib/logger.js";

// Agenda — vista mensual que muestra los slots según sus fechas de edición y
// publicación. Cada bar es un slot clickeable que abre el SlotModal.

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CompanyAgenda({ companyId, companyName, isAdmin }) {
  const { isDark } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);

  const [board, setBoard] = useState(null);
  const [slots, setSlots] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openSlot, setOpenSlot] = useState(null);
  const [viewMode, setViewMode] = useState("calendar"); // 'calendar' | 'list' | 'board'
  const [editingTask, setEditingTask] = useState(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [members, setMembers] = useState([]);

  const { tasks } = useCompanyTasks(companyId);
  const { spaces } = useCompanyTaskSpaces(companyId);
  const membersForTasks = useMemo(
    () => members.map((m) => ({ ...m, color: m.avatar_color || T.blue })),
    [members, T.blue]
  );

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const ms = await listTeamMembers(companyId);
      if (!cancelled) setMembers(ms || []);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const b = await getBoardByCompany(companyId);
        if (cancelled) return;
        setBoard(b);
        if (!b) { setSlots([]); setConcepts([]); return; }
        const [sl, cs] = await Promise.all([listSlotsForBoard(b.id), listConcepts(b.id)]);
        if (cancelled) return;
        setSlots(sl);
        setConcepts(cs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const monthGrid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) {
      if (s.edition_date) {
        (map[s.edition_date] ||= []).push({ slot: s, type: "edit" });
      }
      if (s.publication_date) {
        (map[s.publication_date] ||= []).push({ slot: s, type: "publish" });
      }
    }
    // Overlay tasks con due_date en el día correspondiente.
    for (const t of tasks) {
      if (t.due_date && t.status !== "completado") {
        (map[t.due_date] ||= []).push({ task: t, type: "task" });
      }
    }
    return map;
  }, [slots, tasks]);

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
    try {
      await updateSlot(openSlot.id, patch);
    } catch (e) {
      logger.error("update slot failed", e);
    }
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
      padding: "40px 48px 80px",
      maxWidth: 1280, margin: "0 auto",
      color: T.textPrimary, fontFamily: T.font,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Agenda · {displayName}
          </div>
          <h1 style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em",
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
            borderRadius: 10,
          }}>
            <ViewBtn label="🗓 Calendario" active={viewMode === "calendar"} onClick={() => setViewMode("calendar")} T={T} isDark={isDark} />
            <ViewBtn label="☰ Lista" active={viewMode === "list"} onClick={() => setViewMode("list")} T={T} isDark={isDark} />
            <ViewBtn label="📋 Tablero" active={viewMode === "board"} onClick={() => setViewMode("board")} T={T} isDark={isDark} />
          </div>
          {viewMode === "calendar" && (
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
          )}
          {viewMode !== "calendar" && (
            <button
              onClick={() => setNewTaskOpen(true)}
              style={{
                padding: "9px 16px", borderRadius: 50, border: "none",
                background: T.textPrimary, color: T.bg,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + Nueva tarea
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 16, marginBottom: 14, fontSize: 11, color: T.textMuted }}>
        <Legend color="#C94C9E" label="Edición" />
        <Legend color="#1DB97A" label="Publicación" />
      </div>

      {loading ? (
        <div style={{ color: T.textMuted, fontSize: 13, padding: 20 }}>Cargando agenda…</div>
      ) : viewMode === "list" ? (
        <TasksList
          tasks={tasks}
          members={membersForTasks}
          spaces={spaces}
          companies={[]}
          onOpenTask={(t) => setEditingTask(t)}
        />
      ) : viewMode === "board" ? (
        <TasksBoard
          tasks={tasks}
          members={membersForTasks}
          spaces={spaces}
          companies={[]}
          currentMember={null}
          onOpenTask={(t) => setEditingTask(t)}
        />
      ) : !board ? (
        <EmptyState T={T} isAdmin={isAdmin} />
      ) : (
        <>
          {/* Day headers */}
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

          {/* Month grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6,
          }}>
            {monthGrid.map((day) => (
              <DayCell
                key={day.iso}
                day={day}
                isCurrentMonth={day.month === cursor.getMonth()}
                events={eventsByDate[day.iso] || []}
                concepts={concepts}
                onSlotClick={setOpenSlot}
                onTaskClick={(t) => setEditingTask(t)}
                T={T}
                isDark={isDark}
              />
            ))}
          </div>

          {/* Footer stats */}
          <div style={{
            marginTop: 24, padding: "14px 18px",
            background: T.bgCard, border: T.border, borderRadius: T.radius,
            display: "flex", gap: 20, fontSize: 12, color: T.textSecondary,
            flexWrap: "wrap",
          }}>
            <span>{slots.length} slots totales</span>
            <span>·</span>
            <span>{slots.filter((s) => s.edition_date && isInMonth(s.edition_date, cursor)).length} ediciones este mes</span>
            <span>·</span>
            <span>{slots.filter((s) => s.publication_date && isInMonth(s.publication_date, cursor)).length} publicaciones este mes</span>
          </div>
        </>
      )}

      {openSlot && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: T.bg,
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

      {(editingTask || newTaskOpen) && (
        <TaskModal
          task={editingTask}
          companyId={companyId}
          members={membersForTasks}
          spaces={spaces}
          currentMember={null}
          onClose={() => { setEditingTask(null); setNewTaskOpen(false); }}
          onSaved={() => { setEditingTask(null); setNewTaskOpen(false); }}
        />
      )}
    </div>
  );
}

function ViewBtn({ label, active, onClick, T, isDark }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 8, border: "none",
        background: active ? T.bgCard : "transparent",
        color: active ? T.textPrimary : T.textMuted,
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: active ? (isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(15,15,15,0.05)") : "none",
      }}
    >
      {label}
    </button>
  );
}

function DayCell({ day, isCurrentMonth, events, concepts, onSlotClick, onTaskClick, T, isDark }) {
  const today = isSameDay(new Date(), day.date);
  const bg = today
    ? (isDark ? "rgba(55,138,221,0.08)" : "rgba(55,138,221,0.05)")
    : T.bgCard;
  const numColor = !isCurrentMonth ? T.textHint : (today ? T.blue : T.textPrimary);

  return (
    <div style={{
      minHeight: 108,
      padding: "8px 10px",
      background: bg,
      border: today ? `1px solid ${T.blue}55` : T.border,
      borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{
        fontSize: 11, fontWeight: today ? 800 : 600,
        color: numColor,
        marginBottom: 2,
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
      title={`${isEdit ? "Edición" : "Publicación"} · ${title}`}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 6px", borderRadius: 4,
        background: `${color}${isDark ? "22" : "15"}`,
        border: `1px solid ${color}44`,
        color: T.textPrimary,
        fontSize: 10.5, fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
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

function EmptyState({ T, isAdmin }) {
  return (
    <div style={{
      padding: "40px 20px", textAlign: "center",
      background: T.bgCard, border: T.border, borderRadius: T.radius,
      color: T.textMuted, fontSize: 13,
    }}>
      Todavía no hay creativos planeados. Andá a Despliegue para empezar.
    </div>
  );
}

// ───── Helpers ───────────────────────────────────────────────────────────

function buildMonthGrid(cursor) {
  // Construye grilla de 6 semanas (42 días) comenzando en Lunes.
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  // getDay: Sun=0..Sat=6. Queremos Mon=0..Sun=6.
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

function isInMonth(isoDate, cursorDate) {
  if (!isoDate) return false;
  const d = new Date(isoDate + "T00:00:00");
  return d.getMonth() === cursorDate.getMonth() && d.getFullYear() === cursorDate.getFullYear();
}
