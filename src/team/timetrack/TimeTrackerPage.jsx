// "Mi tiempo" — vista personal del time tracker.
// Compone hook + componentes. Maneja modo fullscreen vs compacto.

import { useState, useEffect, useMemo, useRef } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { useTimeTracker } from "./hooks/useTimeTracker.js";
import { CategoryChip } from "./CategoryChip.jsx";
import { FullscreenTimer } from "./FullscreenTimer.jsx";
import { StatsPanel } from "./StatsPanel.jsx";
import { TaskPicker } from "./TaskPicker.jsx";
import { markTaskCompleted, markTaskUncompleted } from "./data/timeTrackerDb.js";
import {
  rangeForPeriod,
  totalsBySpaceRoot,
  totalSecondsInRange,
  formatHMS,
  formatMs,
  formatHumanDurationLong,
  getSessionElapsedMs,
} from "./lib/timeMath.js";
import { logger } from "../../lib/logger.js";

export function TimeTrackerPage({ member }) {
  const memberId = member?.id;
  const tt = useTimeTracker(memberId);
  const {
    sessions,
    activeSession,
    activeSpace,
    activeSpaceRoot,
    myTasks,
    mySpaces,
    loading,
    start,
    pause,
    switchTask,
    updateSession,
    reload,
  } = tt;

  const [period, setPeriod] = useState("today");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  // Pre-start picker: cuando el user clickea un space card, en vez de arrancar
  // el timer guardamos el space acá y abrimos el TaskPicker. El timer arranca
  // recién cuando el user elige tarea (o "Sin tarea").
  const [pendingSpace, setPendingSpace] = useState(null);

  // Cards = spaces root visibles para el user: shared roots + Personal privado del owner.
  const cardSpaces = useMemo(() => {
    return (mySpaces || []).filter(
      (s) => !s.parent_space_id && (s.visibility === "shared" || s.owner_id === memberId)
    );
  }, [mySpaces, memberId]);

  // Tick para refrescar el "Now Playing" bar y los totales en vivo de la sesión activa.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), activeSession ? 250 : 30000);
    return () => clearInterval(id);
  }, [activeSession]);

  // Watchdog: si la sesión activa lleva > 8h, sugerimos pausar.
  const stale = useMemo(() => {
    if (!activeSession) return null;
    const hours = (nowTick - new Date(activeSession.started_at).getTime()) / 3600000;
    return hours > 8 ? { hours } : null;
  }, [activeSession, nowTick]);

  // Cuando arranca una sesión por primera vez, abre fullscreen automáticamente.
  // Si el usuario cierra fullscreen pero el timer sigue, no lo re-abrimos solo.
  const lastSessionIdRef = useRef(null);
  useEffect(() => {
    if (!activeSession) return;
    if (lastSessionIdRef.current !== activeSession.id) {
      lastSessionIdRef.current = activeSession.id;
      setFullscreenOpen(true);
    }
  }, [activeSession?.id, activeSession]);

  // Totales del rango actual y "vivos" (suma del elapsed de sesión activa).
  const [from, to] = useMemo(() => rangeForPeriod(period), [period]);
  const totalsMap = useMemo(
    () => totalsBySpaceRoot(sessions, mySpaces, from, to, nowTick),
    [sessions, mySpaces, from, to, nowTick]
  );
  const totalSec = useMemo(
    () => totalSecondsInRange(sessions, from, to, nowTick),
    [sessions, from, to, nowTick]
  );

  // Para el header/fullscreen: totales hoy y semana son siempre los mismos
  // sin importar el período seleccionado (son referencia constante).
  const [todayFrom, todayTo] = useMemo(() => rangeForPeriod("today"), []);
  const [weekFrom, weekTo] = useMemo(() => rangeForPeriod("week"), []);
  const todayTotalSec = useMemo(
    () => totalSecondsInRange(sessions, todayFrom, todayTo, nowTick),
    [sessions, todayFrom, todayTo, nowTick]
  );
  const weekTotalSec = useMemo(
    () => totalSecondsInRange(sessions, weekFrom, weekTo, nowTick),
    [sessions, weekFrom, weekTo, nowTick]
  );

  // Última sesión cerrada (para "Continuar").
  const lastClosed = useMemo(
    () => sessions.find((s) => s.ended_at),
    [sessions]
  );
  const recentlyClosed =
    lastClosed && nowTick - new Date(lastClosed.ended_at).getTime() < 5 * 60 * 1000;

  // ---- Handlers ----

  // Click en card de space → abre picker (NO arranca timer todavía).
  const handleSpaceClick = (space) => {
    setPendingSpace(space);
  };

  // Confirma la elección desde el picker pre-start. Si el user picó una
  // tarea, usamos el space_id de la tarea (puede ser subspace específico);
  // si no, el root del card clickeado.
  const handleConfirmStart = async ({ taskId, taskKind, taskLabel }) => {
    if (!pendingSpace) return;
    const taskObj = myTasks.find((t) => t.id === taskId);
    const sessionSpaceId = taskObj?.space_id || pendingSpace.id;
    try {
      await start(sessionSpaceId, { taskId, taskKind, taskLabel });
    } catch (e) {
      alert(`No se pudo iniciar: ${e.message || e}`);
    } finally {
      setPendingSpace(null);
    }
  };

  const handleSwitch = async (spaceId) => {
    // Switch desde el fullscreen también pasa por picker pre-start.
    const sp = mySpaces.find((s) => s.id === spaceId);
    if (sp) setPendingSpace(sp);
  };

  const handlePause = async () => {
    try {
      await pause();
    } catch (e) {
      alert(`No se pudo pausar: ${e.message || e}`);
    }
  };

  const handleResume = async () => {
    if (lastClosed && lastClosed.space_id) {
      await start(lastClosed.space_id, {
        taskId: lastClosed.task_id || null,
        taskKind: lastClosed.task_kind || null,
        taskLabel: lastClosed.task_label || null,
      });
    }
  };

  const handleEditNote = async (note) => {
    if (!activeSession) return;
    try {
      await updateSession(activeSession.id, { note });
    } catch (e) {
      logger.warn("no se pudo guardar nota:", e?.message);
    }
  };

  // Cambia la tarea de la sesión activa. Crea una sesión nueva si la tarea
  // efectivamente cambia (la RPC cierra la actual y abre una nueva atómica).
  const handlePickTask = async ({ taskId, taskKind, taskLabel }) => {
    if (!activeSession) return;
    try {
      await switchTask({ taskId, taskKind, taskLabel });
    } catch (e) {
      alert(`No se pudo cambiar la tarea: ${e?.message || e}`);
    }
  };

  // Quick-complete desde el picker: marca tarea como completada y refresca
  // la lista para que desaparezca al instante.
  const handleCompleteTask = async ({ taskId, taskKind }) => {
    try {
      const { error } = await markTaskCompleted(taskId, taskKind);
      if (error) throw error;
      await reload();
    } catch (e) {
      alert(`No se pudo completar: ${e?.message || e}`);
    }
  };

  // Deshacer un quick-complete (vía toast del picker). Revierte status a 'pendiente'.
  const handleUncompleteTask = async ({ taskId, taskKind }) => {
    try {
      const { error } = await markTaskUncompleted(taskId, taskKind);
      if (error) throw error;
      await reload();
    } catch (e) {
      alert(`No se pudo deshacer: ${e?.message || e}`);
    }
  };

  // Finaliza la tarea actual: marca status=completado + cierra la sesión.
  // Es distinto de pausar — el user dice "no me importa retomarla, ya está".
  const handleFinishTask = async () => {
    if (!activeSession?.task_id) return;
    const taskLabel = activeSession.task_label || "esta tarea";
    if (!window.confirm(`¿Finalizar "${taskLabel}"?\nSe marca como completada y se cierra el timer.`)) return;
    try {
      const { error } = await markTaskCompleted(activeSession.task_id, activeSession.task_kind);
      if (error) throw error;
      await pause();
    } catch (e) {
      alert(`No se pudo finalizar: ${e?.message || e}`);
    }
  };

  const handleStaleTrim = async () => {
    if (!activeSession) return;
    const proposedHour = prompt(
      "¿A qué hora paraste? (formato HH:MM, hoy)",
      "18:00"
    );
    if (!proposedHour) return;
    const m = proposedHour.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      alert("Formato inválido. Usa HH:MM, ej. 18:30.");
      return;
    }
    const end = new Date();
    end.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    if (end <= new Date(activeSession.started_at)) {
      alert("La hora de fin debe ser posterior al inicio.");
      return;
    }
    if (end > new Date()) {
      alert("La hora de fin no puede ser futura.");
      return;
    }
    await updateSession(activeSession.id, { ended_at: end.toISOString() });
  };

  // ---- Render ----

  if (loading) {
    return (
      <div
        style={{
          padding: "60px 32px",
          color: DS.textMuted,
          fontSize: 12,
          letterSpacing: "0.1em",
          fontFamily: DS.font,
        }}
      >
        CARGANDO TU TIEMPO…
      </div>
    );
  }

  return (
    <div style={{ padding: "26px 32px 80px", fontFamily: DS.font, color: DS.textPrimary }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Mi tiempo
          </h1>
          <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 4 }}>
            Hoy llevas <strong style={{ color: DS.textPrimary }}>{formatHumanDurationLong(todayTotalSec)}</strong>
            {" · "}Esta semana <strong style={{ color: DS.textPrimary }}>{formatHumanDurationLong(weekTotalSec)}</strong>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {recentlyClosed && !activeSession && (
          <button
            onClick={handleResume}
            style={{
              padding: "9px 18px",
              borderRadius: 999,
              border: `1px solid ${DS.green}`,
              background: withAlpha(DS.green, "14"),
              color: DS.green,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: DS.font,
              letterSpacing: "0.02em",
            }}
          >
            ▶ Continuar última sesión
          </button>
        )}
        {/* Las categorías ahora son los espacios del sidebar. Crear un espacio
            nuevo se hace desde el panel de Spaces. */}
      </div>

      {/* Watchdog banner */}
      {stale && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 18px",
            background: withAlpha(DS.amber, "14"),
            border: `1px solid ${withAlpha(DS.amber, "55")}`,
            borderRadius: 12,
            marginBottom: 20,
            fontSize: 13,
            color: DS.textPrimary,
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ flex: 1 }}>
            Llevas <strong>{stale.hours.toFixed(1)} h</strong> en{" "}
            <strong>{activeSpaceRoot?.name || activeSpace?.name || "esta sesión"}</strong>. ¿Olvidaste pausar?
          </span>
          <button
            onClick={handleStaleTrim}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${DS.amber}`,
              background: "transparent",
              color: DS.amber,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: DS.font,
            }}
          >
            Recortar a hora exacta
          </button>
          <button
            onClick={handlePause}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: "none",
              background: DS.amber,
              color: "#000",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: DS.font,
            }}
          >
            Pausar ahora
          </button>
        </div>
      )}

      {/* Now playing bar */}
      {activeSession && activeSpaceRoot && (
        <NowPlayingBar
          activeSession={activeSession}
          activeSpaceRoot={activeSpaceRoot}
          activeSpace={activeSpace}
          nowTick={nowTick}
          onOpenFullscreen={() => setFullscreenOpen(true)}
          onPause={handlePause}
        />
      )}

      {/* Grid de cards = spaces root. Cada card muestra el tiempo acumulado
          de la sesiones cuyo space_id está en ese root o sus descendientes. */}
      {cardSpaces.length === 0 ? (
        <EmptyCategories />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {cardSpaces.map((sp) => {
            const sec = totalsMap.get(sp.id) || 0;
            const pct = totalSec === 0 ? 0 : sec / totalSec;
            return (
              <CategoryChip
                key={sp.id}
                category={sp}
                isActive={activeSpaceRoot?.id === sp.id}
                totalSeconds={sec}
                percent={pct}
                onClick={() => handleSpaceClick(sp)}
              />
            );
          })}
        </div>
      )}

      <StatsPanel
        categories={cardSpaces}
        sessions={sessions}
        period={period}
        onChangePeriod={setPeriod}
        now={nowTick}
        mySpaces={mySpaces}
      />

      {fullscreenOpen && (
        <FullscreenTimer
          categories={cardSpaces}
          activeSession={activeSession}
          activeCategory={activeSpaceRoot}
          activeSpace={activeSpace}
          todayTotalSeconds={todayTotalSec}
          weekTotalSeconds={weekTotalSec}
          myTasks={myTasks}
          mySpaces={mySpaces}
          onSwitch={handleSwitch}
          onPause={handlePause}
          onResume={handleResume}
          onClose={() => setFullscreenOpen(false)}
          onEditNote={handleEditNote}
          onPickTask={handlePickTask}
          onCompleteTask={handleCompleteTask}
          onUncompleteTask={handleUncompleteTask}
          onFinishTask={handleFinishTask}
        />
      )}

      {/* Picker pre-start: aparece al clickear una card de space. */}
      {pendingSpace && (
        <TaskPicker
          mode="modal"
          title={`${pendingSpace.icon || "•"} ${pendingSpace.name} — Elegí una tarea`}
          tasks={myTasks}
          spaces={mySpaces}
          space={pendingSpace}
          currentTaskId={null}
          onPick={handleConfirmStart}
          onCompleteTask={handleCompleteTask}
          onUncompleteTask={handleUncompleteTask}
          onClose={() => setPendingSpace(null)}
        />
      )}
    </div>
  );
}

// Barra fija que muestra la sesión activa cuando no estás en fullscreen.
function NowPlayingBar({ activeSession, activeSpaceRoot, activeSpace, nowTick, onOpenFullscreen, onPause }) {
  const elapsedMs = getSessionElapsedMs(activeSession, nowTick);
  const color = activeSpaceRoot?.color || DS.blue;
  const subspaceLabel = activeSpace && activeSpace.id !== activeSpaceRoot?.id ? activeSpace.name : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        background: withAlpha(color, "14"),
        border: `1px solid ${withAlpha(color, "55")}`,
        borderRadius: 14,
        marginBottom: 20,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 4px ${withAlpha(color, "33")}`,
          animation: "tt-now-pulse 1.6s ease-in-out infinite",
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span>{activeSpaceRoot?.icon || "•"} {activeSpaceRoot?.name}{subspaceLabel ? ` · ${subspaceLabel}` : ""}</span>
        {activeSession.task_label && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: DS.textSecondary,
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${DS.textHint}`,
              maxWidth: 320,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={activeSession.task_label}
          >
            📋 {activeSession.task_label}
          </span>
        )}
      </span>
      <div
        style={{
          fontFamily: "ui-monospace, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 22,
          fontWeight: 300,
          letterSpacing: "0.01em",
          marginLeft: 4,
        }}
      >
        {formatHMS(elapsedMs)}
        <span style={{ fontSize: 14, color: DS.textSecondary, marginLeft: 4 }}>
          .{formatMs(elapsedMs)}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onOpenFullscreen}
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          border: `1px solid ${DS.textHint}`,
          background: "rgba(255,255,255,0.05)",
          color: DS.textPrimary,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: DS.font,
        }}
      >
        ⛶ Ampliar
      </button>
      <button
        onClick={onPause}
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          border: "none",
          background: DS.textPrimary,
          color: DS.bg,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: DS.font,
        }}
      >
        ⏸ Pausar
      </button>
      <style>{`
        @keyframes tt-now-pulse {
          0%, 100% { box-shadow: 0 0 0 4px ${withAlpha(color, "33")}; }
          50%      { box-shadow: 0 0 0 8px ${withAlpha(color, "11")}; }
        }
      `}</style>
    </div>
  );
}

function EmptyCategories() {
  return (
    <div
      style={{
        padding: "48px 28px",
        border: DS.borderDash,
        borderRadius: DS.radius,
        background: DS.bgCard,
        textAlign: "center",
        marginBottom: 28,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>⏱</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: DS.textPrimary, marginBottom: 6 }}>
        Aún no tienes espacios compartidos
      </div>
      <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 18 }}>
        Las cards de Mi tiempo se arman desde tus espacios del sidebar. Creá un espacio (Agencia, Marca Personal, etc.) desde la sección Espacios.
      </div>
    </div>
  );
}
