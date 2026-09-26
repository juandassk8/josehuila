import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";
import { DateTimePicker } from "./DateTimePicker.jsx";
import { fmtDueDate, isOverdue, isDueToday } from "../../lib/dates.js";

export function DateDropdown({ date, time, onChange, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const overdue = isOverdue(date);
  const dueToday = isDueToday(date);
  const color = overdue ? DS.red : (dueToday ? DS.amber : DS.textSecondary);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }}
      >
        {children || (
          <span style={{ fontSize: 12, color, fontWeight: (overdue || dueToday) ? 600 : 500 }}>
            {date ? fmtDueDate(date) : <span style={{ color: DS.textMuted, opacity: 0.5 }}>—</span>}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100 }}>
          <DateTimePicker
            date={date}
            time={time}
            onChange={({ date, time }) => { onChange({ date, time }); }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
