import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DS } from "../../lib/design.js";
import { setTaskStatus } from "../data/db.js";
import {
  useTaskTime, startTaskSession, stopTaskSession, startFreePause, finishPause, updatePauseNote, elapsedOf,
} from "../tasks/taskTimeStore.js";
import { CATS, dateStr, dayIndex, pad, useRoutineBlocks } from "./rutinaShared.js";

const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${h ? pad(m) : m}:${pad(s % 60)}`;
};
const ls = (k, v) => {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* sin storage */ }
  return null;
};
// Ventana flotante mínima: una sola fila (tiempo + iconos). Crece solo cuando hace falta.
const PIP = { w: 300, h: 58, hNote: 100, hOpen: 250 };

// Widget de foco: qué estoy haciendo y cuánto llevo, con botones directos para
// Descanso / Interrupción (arrancan un contador), Terminar, Volver y elegir tarea.
// Vive en la página (arrastrable, dos tamaños, ocultable) o "flota sobre todo" el
// computador en una ventana Picture-in-Picture siempre encima.
export function FocusWidget({ member, tasks }) {
  const { active, pause, totals, memberId } = useTaskTime();
  const blocks = useRoutineBlocks(member?.id);
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState(() => ls("focus_widget_collapsed") === "1");
  const [small, setSmall] = useState(() => ls("focus_widget_small") === "1");
  const [panel, setPanel] = useState(null); // 'note' | 'tasks' | null
  const [note, setNote] = useState("");
  const [noteDraft, setNoteDraft] = useState(null);
  const [pip, setPip] = useState(null);
  const [pos, setPos] = useState(() => { try { return JSON.parse(ls("focus_widget_pos") || "null"); } catch { return null; } });
  const drag = useRef(null);
  const moved = useRef(false);

  // El reloj corre en la ventana flotante cuando existe: una pestaña en segundo plano frena sus timers.
  useEffect(() => {
    const host = pip || window;
    const id = host.setInterval(() => setNow(new Date()), 1000);
    return () => host.clearInterval(id);
  }, [pip]);
  useEffect(() => () => { try { pip?.close(); } catch { /* ya cerrada */ } }, [pip]);

  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const min = Math.floor(sec / 60);
  const block = (blocks || []).find((b) => b.day === dayIndex(now) && min >= b.start_min && min < b.end_min) || null;
  const task = active?.task_id ? (tasks || []).find((t) => t.id === active.task_id) : null;
  if (!active && !pause && !block) return null;

  const elapsed = active ? (task?.time_spent_seconds || 0) + (totals[active.task_id] || 0) + elapsedOf(active) : 0;
  const estimateSec = task?.estimate_minutes ? task.estimate_minutes * 60 : null;
  const over = estimateSec != null && elapsed > estimateSec;
  const blockLeft = block ? block.end_min * 60 - sec : null;
  const pauseSec = pause ? elapsedOf(pause) : 0;
  const isBreak = pause?.kind === "descanso";
  const accent = pause ? (isBreak ? DS.green : DS.amber) : active ? (over ? DS.red : DS.green) : CATS[block?.category]?.color || DS.textHint;

  // Tareas para arrancar desde el widget: mías, abiertas, de hoy o vencidas primero.
  const today = dateStr(now);
  const myOpen = (tasks || [])
    .filter((t) => t.status !== "completado" && ((t.assigneeIds || []).includes(member?.id) || t.created_by === member?.id))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .filter((t, _i, arr) => (arr.some((x) => x.due_date && x.due_date <= today) ? t.due_date && t.due_date <= today : true))
    .slice(0, 8);

  // mode: false = fila mínima · "note" = fila + nota de la interrupción · true = lista de tareas
  const resizePip = (mode) => {
    if (!pip) return;
    const chrome = Math.max(0, pip.outerHeight - pip.innerHeight); // barra de título del navegador
    const h = mode === "note" ? PIP.hNote : mode ? PIP.hOpen : PIP.h;
    try { pip.resizeTo(Math.max(PIP.w, pip.outerWidth), h + chrome); } catch { /* el navegador puede negarlo */ }
  };
  const openPanel = (p) => setPanel((cur) => { const next = cur === p ? null : p; resizePip(next ? true : pause && !isBreak ? "note" : false); return next; });
  const toggle = () => setCollapsed((v) => { ls("focus_widget_collapsed", v ? "0" : "1"); return !v; });

  // Un toque pausa de una (el tiempo de trabajo se detiene y arranca el contador).
  // La nota de la interrupción se escribe después, mientras dura o al volver.
  const doPause = async (kind, why) => {
    setPanel(null); setNote("");
    resizePip(kind === "interrupcion" ? "note" : false);
    await startFreePause(kind, why || null);
  };
  // Pausa neutral: ni descanso ni interrupción (p. ej. se acabó el bloque y toca almorzar).
  const pauseForLater = async () => {
    setPanel(null);
    await stopTaskSession({ endKind: "pausa", pauseKind: null, reason: block ? `Sigo después · tocaba ${block.label}` : "Sigo después" });
  };
  const finishTask = async () => {
    const taskId = active?.task_id;
    await stopTaskSession({ endKind: "terminada" });
    if (taskId) await setTaskStatus(taskId, "completado", memberId);
  };
  const resume = async () => {
    resizePip(false);
    const t = (tasks || []).find((x) => x.id === pause?.task_id) || (pause?.task_id ? { id: pause.task_id, title: pause.task_label } : null);
    if (t) await startTaskSession(t); else await finishPause();
  };
  const startTask = async (t) => { setPanel(null); resizePip(false); await startTaskSession(t); };
  const saveNote = () => { if (noteDraft !== null) { updatePauseNote(noteDraft.trim()); setNoteDraft(null); } };

  const openPip = async () => {
    if (!("documentPictureInPicture" in window)) {
      window.alert("Tu navegador no permite ventanas flotantes. Funciona en Chrome o Edge actualizados.");
      return;
    }
    try {
      const w = await window.documentPictureInPicture.requestWindow({ width: PIP.w, height: pause && !isBreak ? PIP.hNote : PIP.h });
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
      w.document.title = "Foco";
      w.document.body.style.cssText = `margin:0;background:${DS.bgSide};font-family:${DS.font};overflow:hidden`;
      w.addEventListener("pagehide", () => setPip(null));
      setPanel(null);
      setPip(w);
    } catch { /* el usuario cerró o negó la ventana */ }
  };

  // ---- arrastre (solo en la página) ----
  const onPointerDown = (e) => {
    if (e.target.closest("[data-nodrag]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, x0: e.clientX, y0: e.clientY };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4) moved.current = true;
    if (!moved.current) return;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - d.w - 8, e.clientX - d.dx)),
      y: Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.dy)),
    });
  };
  const onPointerUp = () => {
    if (drag.current && moved.current) setPos((p) => { ls("focus_widget_pos", JSON.stringify(p)); return p; });
    drag.current = null;
  };
  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onDoubleClick: () => { setPos(null); ls("focus_widget_pos", "null"); } };

  // ---- piezas ----
  const title = pause ? (isBreak ? "En descanso" : "Interrupción") : active ? (task?.title || active.task_label || "Tarea en curso") : block?.label;
  const bigTime = pause ? clock(pauseSec) : active ? clock(elapsed) : clock(blockLeft);
  const sub = pause
    ? (pause.task_label ? `Pausaste: ${pause.task_label}` : block ? `${block.label} · faltan ${clock(blockLeft)}` : "")
    : active
      ? `${estimateSec != null ? `de ${task.estimate_minutes} min${over ? " · te pasaste" : ""}` : "sin estimado"}${block ? ` · ${block.label}, faltan ${clock(blockLeft)}` : ""}`
      : "faltan en este bloque · sin tarea corriendo";

  const pill = (color, filled) => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 50, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: DS.font, fontSize: 11.5, fontWeight: 700, lineHeight: 1,
    border: `1px solid ${color}${filled ? "" : "77"}`, background: filled ? color : `${color}14`, color: filled ? "#fff" : DS.textPrimary,
  });
  const mini = (color, filled) => ({
    width: 30, height: 30, borderRadius: "50%", cursor: "pointer", padding: 0, flexShrink: 0, fontSize: 14, lineHeight: 1, fontFamily: DS.font, fontWeight: 800,
    border: `1px solid ${color}${filled ? "" : "77"}`, background: filled ? color : `${color}14`, color: filled ? "#fff" : DS.textPrimary,
  });
  const quiet = { width: 24, height: 24, borderRadius: "50%", border: "none", background: "transparent", color: DS.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, fontFamily: DS.font, flexShrink: 0 };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0, boxShadow: `0 0 0 4px ${accent}22` }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {pause ? (isBreak ? "☕ " : "⚠️ ") : ""}{title}
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, color: pause || active ? accent : DS.textPrimary, fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: "auto" }}>{bigTime}</span>
        </div>
        <div style={{ fontSize: 10.5, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{sub}</div>
      </div>
      {!pip && (
        <div data-nodrag style={{ display: "flex", flexShrink: 0 }}>
          <button onClick={openPip} title="Flotar sobre todo el computador" style={quiet}>⧉</button>
          <button onClick={() => setSmall((v) => { ls("focus_widget_small", v ? "0" : "1"); return !v; })} title={small ? "Más grande" : "Más pequeño"} style={quiet}>{small ? "A+" : "A−"}</button>
          <button onClick={toggle} title="Ocultar" style={quiet}>–</button>
        </div>
      )}
    </div>
  );

  const actions = (
    <div data-nodrag style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
      {pause ? (
        <>
          <button onClick={resume} style={pill(DS.green, true)}>▶ {pause.task_id ? "Retomar la tarea" : "Retomar"}</button>
          {pause.task_id && <button onClick={() => { resizePip(false); finishPause(); }} style={pill(DS.textHint)}>Terminar pausa</button>}
        </>
      ) : (
        <>
          <button onClick={() => doPause("descanso")} title="Pausar por descanso: arranca un contador" style={pill(DS.green)}>☕ Descanso</button>
          <button onClick={() => doPause("interrupcion")} title="Tuve una interrupción: pausa el trabajo y arranca un contador; la nota la escribes después" style={pill(DS.amber)}>⚠️ Interrupción</button>
          {active && <button onClick={pauseForLater} title="Pausar la tarea y seguir después (no cuenta como descanso ni interrupción)" style={pill(DS.textHint)}>⏸ Sigo después</button>}
          {active
            ? <button onClick={finishTask} title="Terminé la tarea" style={pill(DS.green, true)}>✓ Terminé</button>
            : <button onClick={() => openPanel("tasks")} title="Arrancar una tarea" style={pill(DS.blue, true)}>▶ Tarea</button>}
        </>
      )}
    </div>
  );

  const field = { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 9, fontSize: 12.5, fontFamily: DS.font, outline: "none", background: "transparent", color: DS.textPrimary };
  const extras = (
    <div data-nodrag>
      {pause && !isBreak && (
        <input
          id="focus-pause-note" aria-label="Nota de la interrupción" type="text" maxLength={280}
          value={noteDraft ?? (pause.note || "")} placeholder="¿Cuál fue la interrupción?"
          onChange={(e) => setNoteDraft(e.target.value)} onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ ...field, marginTop: 8, border: `1px solid ${pause.note ? DS.textHint : `${DS.amber}aa`}` }}
        />
      )}
      {panel === "note" && !pause && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <textarea
            autoFocus rows={2} maxLength={280} value={note} placeholder="¿Cuál fue la interrupción? (puedes llenarlo después)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doPause("interrupcion", note); } }}
            style={{ ...field, border: `1px solid ${DS.amber}88`, resize: "none" }}
          />
          <button onClick={() => doPause("interrupcion", note)} style={{ ...pill(DS.amber, true), justifyContent: "center" }}>
            {note.trim() ? "Pausar y guardar nota" : "Pausar, anoto después"}
          </button>
        </div>
      )}
      {panel === "tasks" && !active && !pause && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, maxHeight: 170, overflowY: "auto" }}>
          {myOpen.length ? myOpen.map((t) => (
            <button key={t.id} onClick={() => startTask(t)} style={{
              textAlign: "left", padding: "7px 10px", borderRadius: 9, border: `1px solid ${DS.textHint}`, background: "transparent",
              color: DS.textPrimary, fontSize: 12, fontWeight: 600, fontFamily: DS.font, cursor: "pointer",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0,
            }}>▶ {t.title}{t.estimate_minutes ? ` · ${t.estimate_minutes} min` : ""}</button>
          )) : <div style={{ fontSize: 11.5, color: DS.textMuted }}>No tienes tareas abiertas para hoy.</div>}
        </div>
      )}
    </div>
  );

  // ---- ventana flotante sobre todo el computador ----
  if (pip) {
    return (
      <>
        {createPortal(
          <div style={{ padding: "8px 10px", fontFamily: DS.font, borderTop: `3px solid ${accent}`, minHeight: "100vh", boxSizing: "border-box", background: DS.bgSide }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: pause || active ? accent : DS.textPrimary, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {pause ? (isBreak ? "☕ " : "⚠️ ") : ""}{bigTime}
              </span>
              <span title={`${title} · ${sub}`} style={{ fontSize: 11, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{title}</span>
              {pause ? (
                <button onClick={resume} title={pause.task_id ? "Retomar la tarea" : "Retomar"} style={{ ...mini(DS.green, true), width: "auto", padding: "0 11px", fontSize: 12 }}>▶ Retomar</button>
              ) : (
                <>
                  <button onClick={() => doPause("descanso")} title="Descanso" style={mini(DS.green)}>☕</button>
                  <button onClick={() => doPause("interrupcion")} title="Interrupción" style={mini(DS.amber)}>⚠️</button>
                  {active && <button onClick={pauseForLater} title="Pausar, sigo después" style={mini(DS.textHint)}>⏸</button>}
                  {active
                    ? <button onClick={finishTask} title="Terminé la tarea" style={mini(DS.green, true)}>✓</button>
                    : <button onClick={() => openPanel("tasks")} title="Arrancar una tarea" style={mini(DS.blue, true)}>▶</button>}
                </>
              )}
            </div>
            {extras}
          </div>,
          pip.document.body
        )}
        <button onClick={() => { try { pip.close(); } catch { /* ya cerrada */ } setPip(null); }} style={{
          position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 800, fontFamily: DS.font, cursor: "pointer",
          background: DS.bgSide, border: DS.border, borderRadius: 50, padding: "7px 14px", fontSize: 11.5, fontWeight: 700, color: DS.textMuted,
        }}>⧉ Flotando sobre tu pantalla · traer de vuelta</button>
      </>
    );
  }

  const shell = {
    position: "fixed", zIndex: 800, fontFamily: DS.font, cursor: "grab", touchAction: "none", userSelect: "none",
    // Tamaño pequeño con transform (no con `zoom`): `zoom` también escala left/top, y por eso el
    // widget se corría hacia arriba al arrastrarlo y no llegaba al borde de abajo.
    ...(pos
      ? { left: pos.x, top: pos.y, transformOrigin: "top left", transform: small ? "scale(0.82)" : "none" }
      : { left: "50%", bottom: 16, transformOrigin: "bottom center", transform: `translateX(-50%)${small ? " scale(0.82)" : ""}` }),
    background: DS.bgSide, border: `1px solid ${accent}66`, borderRadius: 18, boxShadow: "0 10px 34px rgba(0,0,0,0.22)",
    padding: "10px 12px 12px 14px", width: 330, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
  };

  if (collapsed) {
    return (
      <button {...dragProps} onClick={() => { if (!moved.current) toggle(); }} title="Mostrar · arrástrame para moverme" style={{
        ...shell, width: "auto", borderRadius: 50, padding: "8px 14px", color: pause || active ? accent : DS.textPrimary,
        fontWeight: 800, fontSize: 12, fontVariantNumeric: "tabular-nums",
      }}>
        {pause ? `${isBreak ? "☕" : "⚠️"} ${clock(pauseSec)}` : active ? `⏱ ${clock(elapsed)}` : `${block.label} · ${clock(blockLeft)}`}
      </button>
    );
  }

  return (
    <div style={shell} {...dragProps} title="Arrástrame para moverme · doble clic para volver al centro">
      {header}
      {actions}
      {extras}
    </div>
  );
}
