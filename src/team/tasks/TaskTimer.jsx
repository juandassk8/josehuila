import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { DS } from "../../lib/design.js";
import { pauseTaskTimer, updateTask, setTaskStatus } from "../data/db.js";
import { logger } from "../../lib/logger.js";
import { useTaskTime, startTaskSession, stopTaskSession, elapsedOf } from "./taskTimeStore.js";
import { PausePanel } from "./PausePanel.jsx";

// Formato HH:MM:SS o MM:SS
function formatSeconds(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function formatEstimate(min) {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Segundos del timer viejo (columna time_spent_seconds). Se conserva como base
// para no perder el tiempo registrado antes del timer real por sesiones.
export function computeCurrentSeconds(task) {
  const base = task?.time_spent_seconds || 0;
  if (!task?.timer_started_at) return base;
  const started = new Date(task.timer_started_at).getTime();
  if (isNaN(started)) return base;
  return base + Math.max(0, Math.floor((Date.now() - started) / 1000));
}

const ESTIMATE_OPTIONS = [15, 25, 45, 60, 90, 120];

export function TaskTimer({ task, size = "md" }) {
  const { active, totals, memberId } = useTaskTime();
  const [, setNow] = useState(Date.now());
  const [popup, setPopup] = useState(null); // 'estimate' | 'pause' | null
  const [popupCoords, setPopupCoords] = useState({ top: 0, left: 0 });
  const [customMinutes, setCustomMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  const legacyRunning = !!task?.timer_started_at;
  const sessionRunning = !!active && active.task_id === task?.id;
  const running = sessionRunning || legacyRunning;
  const elapsed =
    computeCurrentSeconds(task) + (totals[task?.id] || 0) + (sessionRunning ? elapsedOf(active) : 0);
  const estimateSec = task?.estimate_minutes ? task.estimate_minutes * 60 : null;
  const hasStarted = elapsed > 0 || running;
  const over = estimateSec != null && elapsed > estimateSec;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!popup) return undefined;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPopup(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popup]);

  // Coords absolutas (position: fixed) para que padres con overflow:hidden no recorten el popup.
  useLayoutEffect(() => {
    if (!popup || !buttonRef.current) return;
    const POPUP_W = 270;
    const POPUP_H = popup === "pause" ? 330 : 250;
    const btn = buttonRef.current.getBoundingClientRect();
    let left = btn.left;
    if (left + POPUP_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - POPUP_W - 8);
    let top = btn.bottom + 6;
    if (top + POPUP_H > window.innerHeight - 8 && btn.top > POPUP_H + 8) top = btn.top - POPUP_H - 6;
    setPopupCoords({ top, left });
  }, [popup]);

  let color, bgTint, borderTint;
  if (over) {
    color = DS.red; bgTint = `${DS.red}18`; borderTint = `${DS.red}55`;
  } else if (running) {
    color = DS.green; bgTint = `${DS.green}18`; borderTint = `${DS.green}55`;
  } else if (hasStarted) {
    color = DS.textSecondary; bgTint = "transparent"; borderTint = DS.textHint;
  } else {
    color = DS.textMuted; bgTint = "transparent"; borderTint = DS.textHint;
  }

  const start = async () => {
    setPopup(null);
    setBusy(true);
    try { await startTaskSession(task); }
    catch (err) { logger.error(err); }
    finally { setBusy(false); }
  };

  const startWithEstimate = async (minutes) => {
    setPopup(null);
    setCustomMinutes("");
    if (minutes > 0) {
      const { error } = await updateTask(task.id, { estimate_minutes: minutes });
      if (error) logger.error(error);
    }
    await start();
  };

  const stop = async ({ endKind, pauseKind, reason }) => {
    setPopup(null);
    setBusy(true);
    try {
      await stopTaskSession({ endKind, pauseKind, reason: reason || null });
      if (endKind === "terminada") await setTaskStatus(task.id, "completado", memberId);
    } catch (err) { logger.error(err); }
    finally { setBusy(false); }
  };

  const handleMainClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (legacyRunning && !sessionRunning) {
      // Timer del sistema viejo: se pausa y su tiempo queda guardado como base.
      setBusy(true);
      try { await pauseTaskTimer(task.id); }
      catch (err) { logger.error(err); }
      finally { setBusy(false); }
      return;
    }
    if (sessionRunning) { setPopup((p) => (p === "pause" ? null : "pause")); return; }
    if (!hasStarted && !task?.estimate_minutes) { setPopup((p) => (p === "estimate" ? null : "estimate")); return; }
    await start();
  };

  const fontSize = size === "sm" ? 10 : size === "lg" ? 13 : 11;
  const padding = size === "sm" ? "2px 8px" : size === "lg" ? "6px 12px" : "3px 10px";
  const timeText = hasStarted ? formatSeconds(elapsed) : "—";

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-block" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        onClick={handleMainClick}
        title={running ? "Pausar" : hasStarted ? "Reanudar" : "Iniciar"}
        disabled={busy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding, borderRadius: 50,
          border: `1px solid ${borderTint}`, background: bgTint, color, fontSize,
          fontFamily: DS.font, fontWeight: 700, cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap", lineHeight: 1, transition: "background 0.1s, border 0.1s, color 0.1s",
        }}
      >
        <span style={{ fontSize: fontSize + 1, lineHeight: 1 }}>{running ? "⏸" : "▶"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{timeText}</span>
        {estimateSec != null && (
          <span style={{ fontWeight: 500, opacity: 0.75 }}>/ {formatEstimate(task.estimate_minutes)}</span>
        )}
      </button>

      {popup && (
        <div
          style={{
            position: "fixed", top: popupCoords.top, left: popupCoords.left, zIndex: 9999,
            background: DS.bgSide, border: DS.border, borderRadius: 12, padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)", width: 270, maxWidth: "calc(100vw - 16px)",
            fontFamily: DS.font,
          }}
        >
          {popup === "estimate" ? (
            <>
              <div style={labelStyle()}>¿Cuánto crees que te toma?</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {ESTIMATE_OPTIONS.map((m) => (
                  <button key={m} onClick={() => startWithEstimate(m)} style={chipStyle()}>
                    {formatEstimate(m)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <input
                  type="number" min="1" placeholder="Min" value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    const mins = parseInt(customMinutes, 10);
                    if (e.key === "Enter" && mins > 0) startWithEstimate(mins);
                  }}
                  style={inputStyle()}
                />
                <button
                  onClick={() => { const mins = parseInt(customMinutes, 10); if (mins > 0) startWithEstimate(mins); }}
                  disabled={!(parseInt(customMinutes, 10) > 0)}
                  style={{ ...primaryBtn(), opacity: parseInt(customMinutes, 10) > 0 ? 1 : 0.5 }}
                >
                  Iniciar
                </button>
              </div>
              <button onClick={() => startWithEstimate(0)} style={linkBtn()}>Empezar sin estimado</button>
            </>
          ) : (
            <PausePanel onStop={stop} />
          )}
        </div>
      )}
    </div>
  );
}

const labelStyle = () => ({
  fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em",
  marginBottom: 10, textTransform: "uppercase",
});
const chipStyle = () => ({
  padding: "7px 10px", borderRadius: 8, border: `1px solid ${DS.textHint}`, background: "transparent",
  color: DS.textPrimary, fontSize: 11, fontWeight: 600, fontFamily: DS.font, cursor: "pointer",
});
const inputStyle = () => ({
  flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: 8, border: `1px solid ${DS.textHint}`,
  background: "transparent", color: DS.textPrimary, fontSize: 12, fontFamily: DS.font, outline: "none",
});
const primaryBtn = () => ({
  padding: "7px 14px", borderRadius: 8, border: "none", background: DS.textPrimary, color: DS.bg,
  fontSize: 11, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
});
const linkBtn = () => ({
  marginTop: 10, width: "100%", background: "transparent", border: "none", color: DS.textMuted,
  fontSize: 11, fontFamily: DS.font, cursor: "pointer", textDecoration: "underline",
});
