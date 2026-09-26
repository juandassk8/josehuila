import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { DS } from "../../lib/design.js";
import { startTaskTimer, pauseTaskTimer, resetTaskTimer } from "./workspace_tasks_db.js";
import { logger } from "../../lib/logger.js";

// Formato HH:MM:SS o MM:SS
function formatSeconds(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

// Segundos actuales (elapsed) dado task
export function computeCurrentSeconds(task) {
  const base = task?.time_spent_seconds || 0;
  if (!task?.timer_started_at) return base;
  const started = new Date(task.timer_started_at).getTime();
  if (isNaN(started)) return base;
  return base + Math.max(0, Math.floor((Date.now() - started) / 1000));
}

const DURATION_OPTIONS = [
  { label: "5 min", seconds: 5 * 60 },
  { label: "15 min", seconds: 15 * 60 },
  { label: "25 min", seconds: 25 * 60 },
  { label: "45 min", seconds: 45 * 60 },
  { label: "60 min", seconds: 60 * 60 },
  { label: "90 min", seconds: 90 * 60 },
];

export function TaskTimer({ task, size = "md" }) {
  // Local optimistic state — overrides task prop when set
  const [overrideRunning, setOverrideRunning] = useState(null); // bool | null
  const [overrideSession, setOverrideSession] = useState(null); // ms | null
  const [overrideBase, setOverrideBase] = useState(null);       // seconds | null
  const [overrideMode, setOverrideMode] = useState(null);
  const [overrideDuration, setOverrideDuration] = useState(null);

  const [now, setNow] = useState(Date.now());
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupCoords, setPopupCoords] = useState({ top: 0, left: 0 });
  const [customMinutes, setCustomMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const popupRef = useRef(null);
  const popupPanelRef = useRef(null);
  const buttonRef = useRef(null);

  // Resolve effective values (override wins)
  const running = overrideRunning ?? !!task?.timer_started_at;
  const sessionStart = overrideSession ?? (task?.timer_started_at ? new Date(task.timer_started_at).getTime() : null);
  const base = overrideBase ?? (task?.time_spent_seconds || 0);
  const mode = overrideMode ?? task?.timer_mode ?? null;
  const duration = overrideDuration ?? task?.timer_duration_seconds ?? null;

  // When task prop catches up with our optimistic change, clear overrides
  useEffect(() => {
    if (
      overrideRunning !== null &&
      !!task?.timer_started_at === overrideRunning &&
      (task?.timer_started_at ? new Date(task.timer_started_at).getTime() : null) === overrideSession
    ) {
      setOverrideRunning(null);
      setOverrideSession(null);
      setOverrideBase(null);
      setOverrideMode(null);
      setOverrideDuration(null);
    }
  }, [task?.timer_started_at, task?.time_spent_seconds, task?.timer_mode, task?.timer_duration_seconds, overrideRunning, overrideSession]);

  // Tick
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, sessionStart]);

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return undefined;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopupOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen]);

  // Posiciona el popup con coords absolutas (viewport-relative, usa position: fixed)
  // para evitar que padres con overflow:hidden lo recorten.
  useLayoutEffect(() => {
    if (!popupOpen || !buttonRef.current) return;
    const POPUP_W = 260;
    const POPUP_H = 340;
    const btn = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btn.left;
    if (left + POPUP_W > vw - 8) left = Math.max(8, vw - POPUP_W - 8);

    let top = btn.bottom + 6;
    if (top + POPUP_H > vh - 8 && btn.top > POPUP_H + 8) {
      top = btn.top - POPUP_H - 6;
    }
    setPopupCoords({ top, left });
  }, [popupOpen]);

  const elapsed = running && sessionStart
    ? base + Math.max(0, Math.floor((now - sessionStart) / 1000))
    : base;

  // Display + color logic
  const isCountdown = mode === "temporizador" && duration != null;
  const remaining = isCountdown ? Math.max(0, duration - elapsed) : null;
  const hasStarted = elapsed > 0 || running;

  let displayText, displayColor, bgTint, borderTint;
  if (isCountdown) {
    displayText = formatSeconds(remaining);
    const pct = duration > 0 ? (remaining / duration) * 100 : 0;
    if (remaining === 0) {
      displayColor = DS.red; bgTint = `${DS.red}22`; borderTint = `${DS.red}66`;
    } else if (pct >= 70) {
      displayColor = DS.green; bgTint = `${DS.green}18`; borderTint = `${DS.green}55`;
    } else if (pct >= 35) {
      displayColor = DS.amber; bgTint = `${DS.amber}18`; borderTint = `${DS.amber}55`;
    } else {
      displayColor = DS.red; bgTint = `${DS.red}18`; borderTint = `${DS.red}55`;
    }
  } else {
    displayText = hasStarted ? formatSeconds(elapsed) : "—";
    if (running) {
      displayColor = DS.green; bgTint = `${DS.green}18`; borderTint = `${DS.green}55`;
    } else if (hasStarted) {
      displayColor = DS.textSecondary; bgTint = "transparent"; borderTint = DS.textHint;
    } else {
      displayColor = DS.textMuted; bgTint = "transparent"; borderTint = DS.textHint;
    }
  }

  // When user clicks the main button
  const handleMainClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (running) {
      // Pausa inmediata (optimistic)
      const currentElapsed = sessionStart ? Math.max(0, Math.floor((Date.now() - sessionStart) / 1000)) : 0;
      setOverrideRunning(false);
      setOverrideSession(null);
      setOverrideBase(base + currentElapsed);
      setBusy(true);
      try { await pauseTaskTimer(task.id); }
      catch (err) { logger.error(err); /* fallback will reconcile on next task prop */ }
      finally { setBusy(false); }
    } else if (hasStarted) {
      // Reanudar (optimistic)
      const startMs = Date.now();
      setOverrideRunning(true);
      setOverrideSession(startMs);
      setOverrideBase(base);
      setBusy(true);
      try { await startTaskTimer(task.id); }
      catch (err) { logger.error(err); }
      finally { setBusy(false); }
    } else {
      // Primera vez — abrir popup para elegir modo
      setPopupOpen(true);
    }
  };

  const startWithMode = async (nextMode, nextDuration) => {
    setPopupOpen(false);
    const startMs = Date.now();
    setOverrideRunning(true);
    setOverrideSession(startMs);
    setOverrideBase(0);
    setOverrideMode(nextMode);
    setOverrideDuration(nextDuration);
    setBusy(true);
    try {
      await startTaskTimer(task.id, { mode: nextMode, durationSeconds: nextDuration });
    } catch (err) {
      logger.error(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e?.stopPropagation?.();
    setPopupOpen(false);
    setOverrideRunning(false);
    setOverrideSession(null);
    setOverrideBase(0);
    setOverrideMode(null);
    setOverrideDuration(null);
    setBusy(true);
    try {
      await resetTaskTimer(task.id);
    } catch (err) {
      logger.error(err);
    } finally {
      setBusy(false);
    }
  };

  const fontSize = size === "sm" ? 10 : size === "lg" ? 13 : 11;
  const padding = size === "sm" ? "2px 8px" : size === "lg" ? "6px 12px" : "3px 10px";

  return (
    <div
      ref={popupRef}
      style={{ position: "relative", display: "inline-block" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        onClick={handleMainClick}
        title={running ? "Pausar" : hasStarted ? "Reanudar" : "Iniciar cronómetro o temporizador"}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding,
          borderRadius: 50,
          border: `1px solid ${borderTint}`,
          background: bgTint,
          color: displayColor,
          fontSize,
          fontFamily: DS.font,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
          lineHeight: 1,
          transition: "background 0.1s, border 0.1s, color 0.1s",
        }}
      >
        <span style={{ fontSize: fontSize + 1, lineHeight: 1 }}>
          {running ? "⏸" : hasStarted ? "▶" : isCountdown ? "⏱" : "▶"}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {displayText}
        </span>
        {hasStarted && !running && (
          <span
            onClick={reset}
            title="Reiniciar"
            style={{
              marginLeft: 4,
              fontSize: fontSize - 1,
              color: DS.textMuted,
              cursor: "pointer",
              padding: "0 2px",
            }}
          >
            ×
          </span>
        )}
      </button>

      {popupOpen && (
        <div
          ref={popupPanelRef}
          style={{
            position: "fixed",
            top: popupCoords.top,
            left: popupCoords.left,
            zIndex: 9999,
            background: DS.bgSide,
            border: DS.border,
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            width: 260,
            maxWidth: "calc(100vw - 16px)",
            fontFamily: DS.font,
          }}
        >
          <div style={{
            fontSize: 9, fontWeight: 700, color: DS.textMuted,
            letterSpacing: "0.14em", marginBottom: 10, textTransform: "uppercase",
          }}>
            Elegir modo
          </div>

          <button
            onClick={() => startWithMode("cronometro", null)}
            style={optionBtn(DS.green)}
          >
            <span style={{ fontSize: 14 }}>▶</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>Cronómetro</div>
              <div style={{ fontSize: 10, color: DS.textMuted }}>Cuenta hacia adelante</div>
            </div>
          </button>

          <div style={{
            fontSize: 9, fontWeight: 700, color: DS.textMuted,
            letterSpacing: "0.14em", margin: "12px 4px 8px", textTransform: "uppercase",
          }}>
            Temporizador (contrarreloj)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                onClick={() => startWithMode("temporizador", opt.seconds)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${DS.textHint}`,
                  background: "transparent",
                  color: DS.textPrimary,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: DS.font,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(127,127,127,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <input
              type="number"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              placeholder="Min"
              min="1"
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: 8,
                border: `1px solid ${DS.textHint}`,
                background: "transparent",
                color: DS.textPrimary,
                fontSize: 12,
                fontFamily: DS.font,
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const mins = parseInt(customMinutes, 10);
                  if (mins > 0) {
                    startWithMode("temporizador", mins * 60);
                    setCustomMinutes("");
                  }
                }
              }}
            />
            <button
              onClick={() => {
                const mins = parseInt(customMinutes, 10);
                if (mins > 0) {
                  startWithMode("temporizador", mins * 60);
                  setCustomMinutes("");
                }
              }}
              disabled={!customMinutes || parseInt(customMinutes, 10) <= 0}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                background: DS.textPrimary,
                color: DS.bg,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: DS.font,
                cursor: customMinutes ? "pointer" : "not-allowed",
                opacity: customMinutes ? 1 : 0.5,
              }}
            >
              Iniciar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function optionBtn(accent) {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${accent}40`,
    background: `${accent}12`,
    color: DS.textPrimary,
    cursor: "pointer",
    fontFamily: DS.font,
  };
}
