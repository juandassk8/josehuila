import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { logger } from "../../lib/logger.js";
import { listSessionsBetween, listTasksByIds } from "./rutinaDb.js";
import { listPausesBetween, setPauseRowNote } from "../timetrack/data/timeTrackerDb.js";
import { DAY_SHORT, addDays, dayIndex, fmtDur, mondayOf } from "./rutinaShared.js";

// Reportes de la semana: tiempo real vs. planeado, qué me interrumpe y estimado vs. real.
export function RutinaReports({ memberId, blocks }) {
  const [monday, setMonday] = useState(() => mondayOf());
  const [sessions, setSessions] = useState(null);
  const [tasks, setTasks] = useState({});
  const [pauses, setPauses] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await listSessionsBetween(memberId, monday.toISOString(), addDays(monday, 7).toISOString());
      if (!alive) return;
      if (error) { logger.warn("[reportes]", error.message); setSessions([]); return; }
      setSessions(data || []);
      listPausesBetween(memberId, monday.toISOString(), addDays(monday, 7).toISOString()).then((r) => { if (alive) setPauses(r.data || []); });
      const ids = [...new Set((data || []).map((s) => s.task_id).filter(Boolean))];
      const t = await listTasksByIds(ids);
      if (alive) setTasks(Object.fromEntries((t.data || []).map((x) => [x.id, x])));
    })();
    return () => { alive = false; };
  }, [memberId, monday]);

  const report = useMemo(() => {
    const planned = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      (blocks || []).filter((b) => b.day === d && (b.category === "deep" || b.category === "light")).reduce((a, b) => a + b.end_min - b.start_min, 0));
    const real = [0, 0, 0, 0, 0, 0, 0];
    const byType = { profundo: 0, liviano: 0, personal: 0, otro: 0 };
    const perTask = {};
    (sessions || []).forEach((s) => {
      const min = (s.duration_seconds || 0) / 60;
      const task = tasks[s.task_id];
      byType[task?.work_type || "otro"] += min;
      // Lo personal se mide aparte: no cuenta como horas de trabajo.
      if (task?.work_type !== "personal") real[dayIndex(new Date(s.started_at))] += min;
      if (s.task_id) {
        const p = perTask[s.task_id] || (perTask[s.task_id] = { label: s.task_label, min: 0, sessions: 0 });
        p.min += min;
        p.sessions += 1;
      }
    });
    const taskRows = Object.entries(perTask).map(([id, p]) => {
      const t = tasks[id];
      return { id, label: t?.title || p.label || "Tarea", real: p.min, est: t?.estimate_minutes || null, sessions: p.sessions, done: t?.status === "completado" };
    }).sort((a, b) => b.real - a.real);
    // Pausas medidas: descansos e interrupciones con su duración.
    const pausesList = pauses.filter((x) => x.kind === "interrupcion").map((x) => ({
      id: x.id, at: x.started_at, label: tasks[x.task_id]?.title || x.task_label || "Sin tarea corriendo", note: x.note || "",
      min: x.ended_at ? (x.duration_seconds || 0) / 60 : null,
    }));
    const breakRows = pauses.filter((x) => x.kind === "descanso");
    const sumMin = (arr) => arr.reduce((a, x) => a + (x.ended_at ? (x.duration_seconds || 0) / 60 : 0), 0);
    return {
      planned, real, byType, taskRows, pausesList,
      breaks: breakRows.length, breakMin: sumMin(breakRows), issueMin: sumMin(pauses.filter((x) => x.kind === "interrupcion")),
    };
  }, [sessions, tasks, blocks, pauses]);

  const thisWeek = mondayOf().getTime() === monday.getTime();
  const daysSoFar = thisWeek ? dayIndex() + 1 : 7;
  const realTotal = report.real.reduce((a, b) => a + b, 0);
  const plannedSoFar = report.planned.slice(0, daysSoFar).reduce((a, b) => a + b, 0);
  const issues = report.pausesList.length;
  const noNote = report.pausesList.filter((x) => !x.note).length;
  const withEst = report.taskRows.filter((r) => r.est && r.done && r.real >= 5);
  const accuracy = withEst.length ? withEst.reduce((a, r) => a + r.real / r.est, 0) / withEst.length : null;
  const maxBar = Math.max(1, ...report.planned, ...report.real);
  const o = { day: "numeric", month: "short" };

  const ghost = { fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary };
  const card = { background: DS.bgCard, border: DS.border, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 };
  const label = { fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted };
  const big = { fontSize: 24, fontWeight: 800, color: DS.textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 };
  const small = { fontSize: 11.5, color: DS.textMuted };
  const th = { ...label, padding: "8px 8px", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "8px 8px", fontSize: 12.5, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={ghost} onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior">←</button>
        <div style={{ fontWeight: 700, fontSize: 13, minWidth: 160, textAlign: "center", color: DS.textPrimary }}>
          {monday.toLocaleDateString("es-CO", o)} – {addDays(monday, 6).toLocaleDateString("es-CO", o)}
        </div>
        <button style={ghost} onClick={() => setMonday(addDays(monday, 7))} aria-label="Semana siguiente" disabled={thisWeek}>→</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <div style={card}><div style={label}>Trabajo real medido</div><div style={big}>{fmtDur(realTotal)}</div><div style={small}>de {fmtDur(plannedSoFar)} planeadas hasta hoy · {plannedSoFar ? Math.round((realTotal / plannedSoFar) * 100) : 0}%</div></div>
        <div style={card}><div style={label}>Por tipo de trabajo</div><div style={big}>🧠 {fmtDur(report.byType.profundo)}</div><div style={small}>🪶 {fmtDur(report.byType.liviano)} liviano · {fmtDur(report.byType.otro)} sin tipo · 🌱 {fmtDur(report.byType.personal)} personal (aparte)</div></div>
        <div style={card}><div style={label}>Pausas</div><div style={big}>⚠️ {issues} · ☕ {report.breaks}</div><div style={small}>{issues} interrupci{issues === 1 ? "ón" : "ones"} · {fmtDur(report.issueMin)}{noNote ? ` (${noNote} sin nota)` : ""} · {report.breaks} descanso{report.breaks === 1 ? "" : "s"} · {fmtDur(report.breakMin)}</div></div>
        <div style={card}><div style={label}>Qué tan bien estimas</div><div style={big}>{accuracy ? `${Math.round(accuracy * 100)}%` : "–"}</div><div style={small}>{accuracy ? (accuracy > 1.1 ? "Te demoras más de lo que crees" : accuracy < 0.9 ? "Terminas antes de lo que crees" : "Tus estimados son realistas") : "Falta completar tareas con estimado"}</div></div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DS.textPrimary }}>Horas de trabajo por día: real contra planeado</div>
        <div style={{ display: "flex", gap: 14, ...small }}>
          <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: DS.blue, marginRight: 6 }} />Real (con el timer)</span>
          <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: `${DS.textHint}`, marginRight: 6 }} />Planeado en la rutina</span>
        </div>
        {DAY_SHORT.map((d, i) => (
          <div key={d} style={{ display: "grid", gridTemplateColumns: "36px 1fr 120px", gap: 10, alignItems: "center" }}>
            <div style={{ ...label, fontSize: 11 }}>{d}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ height: 9, borderRadius: 4, width: `${(report.real[i] / maxBar) * 100}%`, minWidth: report.real[i] ? 3 : 0, background: DS.blue }} />
              <div style={{ height: 9, borderRadius: 4, width: `${(report.planned[i] / maxBar) * 100}%`, background: DS.textHint }} />
            </div>
            <div style={{ ...small, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtDur(report.real[i])} / {fmtDur(report.planned[i])}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DS.textPrimary }}>Qué te saca del trabajo</div>
          {report.pausesList.length ? report.pausesList.map((x) => (
            <PauseRow key={x.id} pause={x} onSaved={(note) => setPauses((prev) => prev.map((pp) => (pp.id === x.id ? { ...pp, note: note || null } : pp)))} />
          )) : <div style={small}>Cuando pauses por una interrupción, aquí queda cuánto duró y tu nota (la puedes llenar después).</div>}
        </div>

        <div style={{ ...card, overflowX: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DS.textPrimary }}>Tareas: estimado contra real</div>
          {report.taskRows.length ? (
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: DS.font }}>
              <thead><tr><th style={th}>Tarea</th><th style={th}>Estimado</th><th style={th}>Real</th><th style={th}>Sesiones</th></tr></thead>
              <tbody>
                {report.taskRows.slice(0, 12).map((r) => {
                  const over = r.est && r.real > r.est * 1.1;
                  return (
                    <tr key={r.id} style={{ borderTop: DS.border }}>
                      <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.done ? "✓ " : ""}{r.label}</td>
                      <td style={td}>{r.est ? fmtDur(r.est) : "–"}</td>
                      <td style={{ ...td, fontWeight: 700, color: over ? DS.red : DS.textPrimary }}>{fmtDur(r.real)}</td>
                      <td style={td}>{r.sessions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div style={small}>{sessions === null ? "Cargando…" : "Todavía no hay tiempo medido esta semana. Dale ▶ a una tarea en Mi agenda."}</div>}
        </div>
      </div>
    </div>
  );
}

function PauseRow({ pause, onSaved }) {
  const [draft, setDraft] = useState(null);
  const when = new Date(pause.at).toLocaleString("es-CO", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const save = async () => {
    if (draft === null) return;
    const note = draft.trim();
    setDraft(null);
    if (note === pause.note) return;
    const { error } = await setPauseRowNote(pause.id, note);
    if (error) logger.error("[reportes] nota:", error.message); else onSaved(note);
  };
  return (
    <div style={{ borderTop: DS.border, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: DS.textMuted }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pause.label}</span>
        <span style={{ whiteSpace: "nowrap" }}>{when}{pause.min != null ? ` · duró ${fmtDur(pause.min)}` : " · en curso"}</span>
      </div>
      <input
        id={`pause-note-${pause.id}`} aria-label={`Nota de la pausa en ${pause.label}`} type="text" maxLength={280}
        value={draft ?? pause.note} placeholder="Sin nota: ¿qué pasó?"
        onChange={(e) => setDraft(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{
          width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, fontSize: 12.5, fontFamily: DS.font, outline: "none",
          border: `1px solid ${pause.note ? DS.textHint : `${DS.amber}aa`}`, background: "transparent", color: DS.textPrimary,
        }}
      />
    </div>
  );
}
