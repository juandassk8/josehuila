import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { DS } from "../../lib/design.js";
import { fmtShort, fmtTime } from "../../lib/dates.js";
import { RecurrenceModal } from "./RecurrenceModal.jsx";
import { labelForRecurrence } from "../../lib/recurrence.js";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  subMonths, format, isSameDay, isSameMonth, nextMonday, nextSaturday,
} from "date-fns";
import { es } from "date-fns/locale";

const QUICK_DATES = [
  { label: "Hoy", fn: () => new Date() },
  {
    label: () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(next.getHours() + 1, 0, 0, 0);
      const h = next.getHours();
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = h % 12 || 12;
      return `Más tarde ${h12}:00 ${ampm}`;
    },
    fn: () => {
      const now = new Date();
      now.setHours(now.getHours() + 1, 0, 0, 0);
      return now;
    },
    includesTime: true,
  },
  { label: "Mañana", fn: () => addDays(new Date(), 1) },
  { label: "Próxima semana", fn: () => nextMonday(new Date()), sub: () => format(nextMonday(new Date()), "EEE", { locale: es }) },
  { label: "Próximo fin de semana", fn: () => nextSaturday(new Date()), sub: () => format(nextSaturday(new Date()), "EEE", { locale: es }) },
  { label: "2 semanas", fn: () => addDays(new Date(), 14), sub: () => format(addDays(new Date(), 14), "d MMM", { locale: es }) },
  { label: "4 semanas", fn: () => addDays(new Date(), 28), sub: () => format(addDays(new Date(), 28), "d MMM", { locale: es }) },
  { label: "8 semanas", fn: () => addDays(new Date(), 56), sub: () => format(addDays(new Date(), 56), "d MMM", { locale: es }) },
];

function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      const label = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      slots.push({ label, value });
    }
  }
  return slots;
}
const TIME_SLOTS = generateTimeSlots();

// timeEnd es opcional: si el consumidor lo pasa (aunque sea ""), el selector ofrece franja "Desde / Hasta".
export function DateTimePicker({ date, time, timeEnd, onChange, onClose, recurrence, onRecurrenceChange }) {
  const hasRange = timeEnd !== undefined;
  const [editingEnd, setEditingEnd] = useState(false);
  const timeListRef = useRef(null);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (date) return new Date(date + "T12:00:00");
    return new Date();
  });
  const [showTime, setShowTime] = useState(!!time);
  const ref = useRef(null);
  const [hAlign, setHAlign] = useState("left");   // "left" | "right"
  const [vAlign, setVAlign] = useState("below");  // "below" | "above"

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Ajuste de posición para que nunca se salga del viewport
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw - 8) setHAlign("right");
    if (rect.bottom > vh - 8 && rect.top > rect.height) setVAlign("above");
  }, [showTime]);

  const today = new Date();

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const rows = [];
    let day = calStart;
    while (day <= calEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(day));
        day = addDays(day, 1);
      }
      rows.push(week);
    }
    return rows;
  }, [viewMonth]);

  const selectDate = (d) => {
    emit({ date: format(d, "yyyy-MM-dd") });
  };

  const selectQuick = (qd) => {
    const d = qd.fn();
    const newDate = format(d, "yyyy-MM-dd");
    let newTime = time;
    if (qd.includesTime) {
      newTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      setShowTime(true);
    }
    emit({ date: newDate, time: newTime });
    setViewMonth(d);
  };

  const emit = (patch) => onChange({ date, time, ...(hasRange ? { timeEnd: timeEnd || null } : {}), ...patch });
  const selectTime = (t) => {
    if (hasRange && editingEnd) { emit({ timeEnd: t }); return; }
    // Al mover el inicio, un fin que quede antes deja de tener sentido.
    emit({ time: t, ...(hasRange && timeEnd && timeEnd <= t ? { timeEnd: null } : {}) });
    if (hasRange) setEditingEnd(true);
  };
  const activeTime = hasRange && editingEnd ? timeEnd : time;

  // La lista de horas abre en la hora elegida o, si no hay, en la hora actual (no a las 12:00 am).
  useLayoutEffect(() => {
    if (!showTime || !timeListRef.current) return;
    const target = activeTime || (() => {
      const n = new Date();
      const m = Math.floor(n.getMinutes() / 15) * 15;
      return `${String(n.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    })();
    const el = timeListRef.current.querySelector(`[data-slot="${target}"]`);
    if (el) timeListRef.current.scrollTop = Math.max(0, el.offsetTop - 60);
  }, [showTime, editingEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearDate = () => {
    emit({ date: null, time: null, ...(hasRange ? { timeEnd: null } : {}) });
  };

  const clearTime = () => {
    emit({ time: null, ...(hasRange ? { timeEnd: null } : {}) });
    setEditingEnd(false);
    setShowTime(false);
  };

  const selectedDate = date ? new Date(date + "T12:00:00") : null;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: vAlign === "above" ? "auto" : "calc(100% + 6px)",
        bottom: vAlign === "above" ? "calc(100% + 6px)" : "auto",
        left: hAlign === "right" ? "auto" : 0,
        right: hAlign === "right" ? 0 : "auto",
        background: DS.bgSide,
        border: DS.border,
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        zIndex: 300,
        width: showTime ? (hasRange ? 544 : 520) : 420,
        maxWidth: "calc(100vw - 32px)",
        fontFamily: DS.font,
        color: DS.textPrimary,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: DS.border,
      }}>
        <span style={{ fontSize: 11, color: DS.textMuted, fontWeight: 600 }}>Fecha de inicio</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {date && (
            <span style={{
              padding: "4px 10px", borderRadius: 50,
              background: DS.green + "22", color: DS.green,
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {fmtShort(date)}
              {time && ` ${fmtTime(time)}`}
              <button onClick={clearDate} style={{
                background: "transparent", border: "none", color: DS.green,
                cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.7,
              }}>×</button>
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowTime(!showTime); }}
            style={{
              padding: "4px 10px", borderRadius: 50, cursor: "pointer",
              border: `1px solid ${showTime ? DS.blue : DS.textHint}`,
              background: showTime ? DS.blue + "22" : "transparent",
              color: showTime ? DS.blue : DS.textSecondary,
              fontSize: 11, fontWeight: 600,
            }}
          >
            {showTime ? "Ocultar tiempo" : "Agregar tiempo"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Quick dates column */}
        <div style={{
          width: 160, padding: "8px 6px",
          borderRight: DS.border,
        }}>
          {QUICK_DATES.map((qd, i) => {
            const labelText = typeof qd.label === "function" ? qd.label() : qd.label;
            const subText = qd.sub ? qd.sub() : null;
            return (
              <button
                key={i}
                onClick={() => selectQuick(qd)}
                style={{
                  width: "100%", padding: "7px 10px", borderRadius: 6,
                  border: "none", background: "transparent", cursor: "pointer",
                  textAlign: "left", display: "flex", justifyContent: "space-between",
                  alignItems: "center", color: DS.textPrimary, fontSize: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span>{labelText}</span>
                {subText && <span style={{ fontSize: 10, color: DS.textMuted }}>{subText}</span>}
              </button>
            );
          })}
        </div>

        {/* Calendar grid */}
        <div style={{ flex: 1, padding: "8px 12px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10,
          }}>
            <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} style={navArrow}>◀</button>
            <span style={{
              fontSize: 13, fontWeight: 600, color: DS.textPrimary, textTransform: "capitalize",
            }}>
              {format(viewMonth, "MMMM yyyy", { locale: es })}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setViewMonth(new Date())} style={{
                ...navArrow, fontSize: 10, fontWeight: 700, padding: "3px 8px",
              }}>Hoy</button>
              <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} style={navArrow}>▶</button>
            </div>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1,
            textAlign: "center",
          }}>
            {["do", "lu", "ma", "mi", "ju", "vi", "sá"].map((d) => (
              <div key={d} style={{ fontSize: 10, color: DS.textMuted, padding: "4px 0", fontWeight: 600 }}>{d}</div>
            ))}
            {weeks.flatMap((week) =>
              week.map((day) => {
                const isToday = isSameDay(day, today);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const inMonth = isSameMonth(day, viewMonth);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => selectDate(day)}
                    style={{
                      padding: "6px 0", borderRadius: "50%", border: "none",
                      cursor: "pointer",
                      fontSize: 12, fontWeight: isToday || isSelected ? 700 : 400,
                      color: !inMonth ? DS.textHint : isSelected ? DS.textPrimary : isToday ? DS.blue : DS.textPrimary,
                      background: isSelected ? DS.blue : isToday ? DS.blue + "22" : "transparent",
                      width: 30, height: 30, display: "flex", alignItems: "center",
                      justifyContent: "center", margin: "1px auto",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = DS.bgCard;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = isToday ? DS.blue + "22" : "transparent";
                    }}
                  >
                    {format(day, "d")}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Time column */}
        {showTime && (
          <div ref={timeListRef} style={{
            width: hasRange ? 124 : 100, borderLeft: DS.border, position: "relative",
            maxHeight: 280, overflowY: "auto", padding: "4px 0",
          }}>
            {hasRange && (
              <div style={{ display: "flex", gap: 2, padding: "2px 6px 6px", position: "sticky", top: -4, background: DS.bgSide, zIndex: 1 }}>
                {[["Desde", false, time], ["Hasta", true, timeEnd]].map(([label, isEnd, val]) => (
                  <button key={label} onClick={() => setEditingEnd(isEnd)} disabled={isEnd && !time} style={{
                    flex: 1, padding: "4px 2px", borderRadius: 6, cursor: isEnd && !time ? "not-allowed" : "pointer", fontFamily: DS.font,
                    border: `1px solid ${editingEnd === isEnd ? DS.blue : DS.textHint}`, background: editingEnd === isEnd ? DS.blue + "22" : "transparent",
                    color: editingEnd === isEnd ? DS.blue : DS.textSecondary, fontSize: 9.5, fontWeight: 700, lineHeight: 1.25, opacity: isEnd && !time ? 0.5 : 1,
                  }}>{label}<br />{val ? fmtTime(val) : "–"}</button>
                ))}
              </div>
            )}
            {time && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 8px", borderBottom: DS.border,
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 10, color: DS.green, fontWeight: 600 }}>{fmtTime(time)}</span>
                <button onClick={clearTime} style={{
                  background: "transparent", border: "none", color: DS.textMuted,
                  cursor: "pointer", fontSize: 10,
                }}>×</button>
              </div>
            )}
            {TIME_SLOTS.filter((slot) => !(hasRange && editingEnd && time && slot.value <= time)).map((slot) => (
              <button
                key={slot.value}
                data-slot={slot.value}
                onClick={() => selectTime(slot.value)}
                style={{
                  width: "100%", padding: "5px 10px", borderRadius: 4,
                  border: "none", cursor: "pointer", textAlign: "left",
                  background: activeTime === slot.value ? DS.blue + "22" : "transparent",
                  color: activeTime === slot.value ? DS.blue : DS.textSecondary,
                  fontSize: 11, fontWeight: activeTime === slot.value ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (activeTime !== slot.value) e.currentTarget.style.background = DS.bgCard;
                }}
                onMouseLeave={(e) => {
                  if (activeTime !== slot.value) e.currentTarget.style.background = "transparent";
                }}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recurrence button */}
      {onRecurrenceChange && (
        <div style={{ borderTop: DS.border, padding: "10px 12px", position: "relative" }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowRecurrence(!showRecurrence); }}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: recurrence?.pattern ? DS.blue : DS.textSecondary,
              fontSize: 12, fontFamily: DS.font, padding: "4px 0",
              display: "flex", alignItems: "center", gap: 6, width: "100%",
            }}
          >
            <span>🔄</span>
            <span style={{ flex: 1, textAlign: "left" }}>
              {recurrence?.pattern ? labelForRecurrence(recurrence) : "Establecer como recurrente"}
            </span>
            <span style={{ color: DS.textMuted }}>▸</span>
          </button>
          {showRecurrence && (
            <RecurrenceModal
              value={recurrence}
              onSave={(val) => {
                onRecurrenceChange(val);
                setShowRecurrence(false);
              }}
              onClose={() => setShowRecurrence(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

const navArrow = {
  padding: "4px 8px", borderRadius: 6,
  border: DS.border,
  background: "transparent", color: DS.textSecondary,
  cursor: "pointer", fontSize: 12, fontWeight: 600,
};
