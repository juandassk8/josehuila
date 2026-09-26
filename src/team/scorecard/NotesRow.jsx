import { useState, useEffect, useRef } from "react";
import { DS } from "../../lib/design.js";
import { isoDate, DAY_LABELS_LONG } from "../../lib/weeks.js";
import { logger } from "../../lib/logger.js";

// 6 textareas (uno por día), cada uno con debounce save 800ms.
// notes: array de { date, note } ya cargadas.
// onSave({date, note}) → upsert a scorecard_notes.
export function NotesRow({ days, notes, onSave, disabled }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 8,
        marginTop: 12,
        padding: "16px 14px",
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 12,
      }}
    >
      {days.map((d, i) => {
        const dateStr = isoDate(d);
        const serverNote = (notes || []).find((n) => n.date === dateStr)?.note || "";
        // Key por fecha + valor del servidor → remonta sólo cuando cambia el valor
        // en DB (load inicial o realtime update desde otra pestaña). El autosave
        // local propaga al server, pero como el server value queda igual al local,
        // el key no cambia y no se remonta. Nunca se interrumpe la edición.
        return (
          <DayNote
            key={`${dateStr}:${serverNote}`}
            day={d}
            label={DAY_LABELS_LONG[i]}
            initial={serverNote}
            onSave={(note) => onSave({ date: dateStr, note })}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

function DayNote({ day, label, initial, onSave, disabled }) {
  const [value, setValue] = useState(initial);
  const timerRef = useRef(null);
  const latestRef = useRef(initial);
  const lastSavedRef = useRef(initial);

  const flush = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = latestRef.current;
    if (v === lastSavedRef.current) return;
    try {
      await onSave(v);
      lastSavedRef.current = v;
    } catch (e) {
      logger.error("note save failed", e);
    }
  };

  // flush on unmount
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    latestRef.current = v;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flush(); }, 800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: DS.textMuted,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label} {day.getDate()}
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={flush}
        disabled={disabled}
        placeholder="Nota del día…"
        rows={3}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${DS.textHint}`,
          background: "transparent",
          color: DS.textPrimary,
          fontSize: 12,
          fontFamily: DS.font,
          resize: "vertical",
          outline: "none",
          minHeight: 60,
        }}
      />
    </div>
  );
}
