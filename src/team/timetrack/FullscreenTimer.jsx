// Overlay fullscreen del timer. Domina la pantalla con HH:MM:SS gigante.
//
// Atajos:
//   Espacio          pausa / reanuda
//   1..9             switch a categoría N (orden visible)
//   N                focus al input de nota
//   F                toggle fullscreen del navegador (no cierra el overlay)
//   Esc              cerrar el overlay (la sesión sigue corriendo)

import { useEffect, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { CategoryChip } from "./CategoryChip.jsx";
import { TaskPicker } from "./TaskPicker.jsx";
import {
  formatHMS,
  formatMs,
  formatHumanDurationLong,
  getSessionElapsedMs,
} from "./lib/timeMath.js";

export function FullscreenTimer({
  categories,
  activeSession,
  activeCategory,
  activeSpace,
  todayTotalSeconds,
  weekTotalSeconds,
  myTasks = [],
  mySpaces = [],
  onSwitch,
  onPause,
  onResume,
  onClose,
  onEditNote,
  onPickTask,
  onCompleteTask,
  onUncompleteTask,
  onFinishTask,
}) {
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState("");
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const noteInputRef = useRef(null);
  const rafRef = useRef(null);

  // Reset display y nota cuando cambia (o desaparece) la sesión activa.
  useEffect(() => {
    setElapsed(activeSession ? getSessionElapsedMs(activeSession) : 0);
    setNote(activeSession?.note || "");
  }, [activeSession?.id, activeSession]);

  // El picker pre-start de TimeTrackerPage ya capturó la elección de tarea
  // antes de arrancar la sesión. Acá NO auto-abrimos — sólo si el user
  // presiona T explícitamente o clickea la pill.

  // Tick a 60fps mientras hay sesión activa.
  useEffect(() => {
    if (!activeSession) return undefined;
    const tick = () => {
      setElapsed(getSessionElapsedMs(activeSession));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeSession?.id, activeSession?.started_at, activeSession]);

  // Atajos.
  useEffect(() => {
    const handler = (e) => {
      // Si el foco está en input/textarea, sólo respondemos a Esc.
      const tag = (e.target?.tagName || "").toLowerCase();
      const inField = tag === "input" || tag === "textarea";

      if (e.key === "Escape") {
        if (inField) {
          e.target.blur();
          return;
        }
        onClose?.();
        return;
      }
      if (inField) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (activeSession) onPause?.();
        else onResume?.();
        return;
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        noteInputRef.current?.focus();
        return;
      }
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (!activeSession && onResume) {
          // Paused → reanudar y abrir picker después.
          Promise.resolve(onResume()).then(() => setTaskPickerOpen(true));
        } else {
          setTaskPickerOpen((v) => !v);
        }
        return;
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const cat = categories[idx];
        if (cat) {
          e.preventDefault();
          onSwitch?.(cat.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeSession, categories, onPause, onResume, onSwitch, onClose]);

  // NOTA: no pedimos fullscreen del navegador automáticamente. El user
  // necesita poder cambiar de app/pestaña mientras trabaja. El overlay
  // cubre el viewport del browser igual; si el user quiere fullscreen OS
  // completo puede apretar `F`.

  // Persiste la nota con debounce para no spammear updates.
  useEffect(() => {
    if (!activeSession || !onEditNote) return undefined;
    const initial = activeSession.note || "";
    if (note === initial) return undefined;
    const t = setTimeout(() => {
      onEditNote(note);
    }, 500);
    return () => clearTimeout(t);
  }, [note, activeSession, onEditNote]);

  const accent = activeCategory?.color || DS.blue;
  const isPaused = !activeSession;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: DS.bg,
        color: DS.textPrimary,
        fontFamily: DS.font,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Halo de color difuso del background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 35%, ${withAlpha(accent, "22")} 0%, transparent 60%)`,
          pointerEvents: "none",
          transition: "background 0.4s",
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          padding: "20px 28px",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            color: DS.textMuted,
            fontWeight: 700,
          }}
        >
          MI TIEMPO
        </div>
        <div style={{ flex: 1 }} />
        <KeyHint label="Espacio" desc={isPaused ? "Reanudar" : "Pausar"} />
        <KeyHint label="1-9" desc="Cambiar" />
        <KeyHint label="T" desc="Tarea" />
        <KeyHint label="N" desc="Nota" />
        <KeyHint label="Esc" desc="Cerrar" />
        <button
          onClick={onClose}
          title="Salir del modo grande (Esc)"
          style={{
            background: "transparent",
            border: `1px solid ${DS.textHint}`,
            color: DS.textSecondary,
            borderRadius: 8,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: DS.font,
            marginLeft: 8,
          }}
        >
          ✕
        </button>
      </div>

      {/* Centro: timer */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        {/* Categoría activa */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: activeCategory ? 1 : 0.4,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: accent,
              boxShadow: !isPaused ? `0 0 0 6px ${withAlpha(accent, "33")}` : "none",
              animation: !isPaused ? "tt-pulse 1.6s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "0.01em" }}>
            {activeCategory?.icon} {activeCategory?.name || "En pausa"}
          </span>
        </div>

        {/* Tarea activa — pill clickeable que abre el TaskPicker.
            Visible siempre que estés en fullscreen. En pausa, click reanuda
            la última categoría y abre el picker después. */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              if (!activeSession && onResume) {
                Promise.resolve(onResume()).then(() => setTaskPickerOpen(true));
              } else {
                setTaskPickerOpen((v) => !v);
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${activeSession?.task_label ? withAlpha(accent, "55") : DS.textHint}`,
              background: activeSession?.task_label ? withAlpha(accent, "14") : "rgba(255,255,255,0.04)",
              color: activeSession?.task_label ? DS.textPrimary : DS.textSecondary,
              fontSize: 13,
              fontFamily: DS.font,
              fontWeight: 500,
              cursor: "pointer",
              maxWidth: "min(560px, 80vw)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: !activeSession ? 0.7 : 1,
            }}
            title={activeSession?.task_label || "Elegir tarea"}
          >
            {activeSession?.task_label ? (
              <>📋 <span>{activeSession.task_label}</span></>
            ) : !activeSession ? (
              <>○ <span>Elegir tarea — reanudar (T)</span></>
            ) : (
              <>○ <span>Elegir tarea (T)</span></>
            )}
            <span style={{ opacity: 0.5, fontSize: 10 }}>▾</span>
          </button>

          {taskPickerOpen && activeSession && (
            <TaskPicker
              tasks={myTasks}
              spaces={mySpaces}
              space={activeCategory /* activeSpaceRoot pasado como activeCategory */}
              currentTaskId={activeSession.task_id || null}
              onPick={(picked) => {
                onPickTask?.(picked);
              }}
              onCompleteTask={onCompleteTask}
              onUncompleteTask={onUncompleteTask}
              onClose={() => setTaskPickerOpen(false)}
              anchor="bottom"
            />
          )}
        </div>

        {/* Display HH:MM:SS + .ms */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "min(2vw, 24px)",
            fontFamily: "ui-monospace, 'JetBrains Mono', 'SF Mono', monospace",
            fontVariantNumeric: "tabular-nums",
            color: DS.textPrimary,
          }}
        >
          <div
            style={{
              fontSize: "clamp(96px, 18vw, 240px)",
              fontWeight: 200,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {formatHMS(elapsed)}
          </div>
          <div
            style={{
              fontSize: "clamp(28px, 5vw, 64px)",
              fontWeight: 300,
              color: DS.textSecondary,
              lineHeight: 1.2,
              paddingBottom: "0.18em",
            }}
          >
            .{formatMs(elapsed)}
          </div>
        </div>

        {/* Stats compactas */}
        <div
          style={{
            display: "flex",
            gap: 28,
            color: DS.textSecondary,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span>
            Hoy <span style={{ color: DS.textPrimary, fontWeight: 600 }}>{formatHumanDurationLong(todayTotalSeconds)}</span>
          </span>
          <span style={{ color: DS.textHint }}>·</span>
          <span>
            Esta semana <span style={{ color: DS.textPrimary, fontWeight: 600 }}>{formatHumanDurationLong(weekTotalSeconds)}</span>
          </span>
        </div>

        {/* Pausa / Reanudar + nota */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {isPaused ? (
            <button
              onClick={onResume}
              style={{
                padding: "12px 26px",
                borderRadius: 999,
                border: "none",
                background: DS.green,
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: DS.font,
                letterSpacing: "0.02em",
                boxShadow: `0 0 0 6px ${withAlpha(DS.green, "22")}`,
              }}
            >
              ▶ Reanudar (Espacio)
            </button>
          ) : (
            <>
              <button
                onClick={onPause}
                style={{
                  padding: "12px 26px",
                  borderRadius: 999,
                  border: `1px solid ${DS.textHint}`,
                  background: "rgba(255,255,255,0.04)",
                  color: DS.textPrimary,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: DS.font,
                  letterSpacing: "0.02em",
                }}
                title="Pausa el timer. La tarea queda abierta para retomarla después."
              >
                ⏸ Pausar tarea (Espacio)
              </button>
              {activeSession?.task_id && onFinishTask && (
                <button
                  onClick={onFinishTask}
                  style={{
                    padding: "12px 22px",
                    borderRadius: 999,
                    border: `1px solid ${withAlpha(DS.green, "55")}`,
                    background: withAlpha(DS.green, "14"),
                    color: DS.green,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: DS.font,
                    letterSpacing: "0.02em",
                  }}
                  title="Marca la tarea como completada y cierra el timer."
                >
                  ✅ Finalizar tarea
                </button>
              )}
            </>
          )}

          <input
            ref={noteInputRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anota qué estás haciendo… (N)"
            disabled={!activeSession}
            style={{
              padding: "11px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: DS.textPrimary,
              fontSize: 13,
              fontFamily: DS.font,
              minWidth: 280,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Bottom: chips de categorías */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "20px 28px 28px",
          borderTop: `1px solid ${DS.textHint}`,
        }}
      >
        {categories.map((cat, idx) => (
          <CategoryChip
            key={cat.id}
            category={cat}
            isActive={activeCategory?.id === cat.id}
            onClick={() => onSwitch?.(cat.id)}
            variant="fullscreen"
            hotkey={idx < 9 ? String(idx + 1) : null}
          />
        ))}
        {/* Las categorías son los espacios del sidebar; ya no se crean acá. */}
      </div>

      <style>{`
        @keyframes tt-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${withAlpha(accent, "33")}; }
          50%      { box-shadow: 0 0 0 10px ${withAlpha(accent, "00")}; }
        }
      `}</style>
    </div>
  );
}

function KeyHint({ label, desc }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: DS.textMuted,
        letterSpacing: "0.02em",
      }}
    >
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          padding: "2px 7px",
          borderRadius: 5,
          border: `1px solid ${DS.textHint}`,
          color: DS.textSecondary,
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ opacity: 0.7 }}>{desc}</span>
    </span>
  );
}
