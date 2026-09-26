import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { DS } from "../../lib/design.js";
import { dayCapacity } from "./routine.js";
import { useTaskTime, elapsedOf } from "./taskTimeStore.js";
import { useRoutineBlocks } from "../rutina/rutinaShared.js";

function fmtMin(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

// "¿Me alcanza el día?" — capacidad de trabajo de la rutina vs. lo estimado en
// las tareas de hoy (vencen hoy o están vencidas), y ritmo: trabajado vs. esperado.
export function DayCapacity({ tasks, memberId, onOpenRoutine }) {
  const { totals, active, todaySeconds } = useTaskTime();
  const blocks = useRoutineBlocks(memberId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const todayStr = format(now, "yyyy-MM-dd");
  const cap = useMemo(() => dayCapacity(blocks, now), [blocks, now]);

  const plan = useMemo(() => {
    const out = { profundo: 0, liviano: 0, sinTipo: 0, sinEstimado: 0, pendientes: 0, hechasHoy: 0, personales: 0, personalMin: 0 };
    (tasks || []).forEach((task) => {
      if (task.status === "completado") {
        if ((task.completed_at || "").slice(0, 10) === todayStr) out.hechasHoy += 1;
        return;
      }
      if (!task.due_date || task.due_date > todayStr) return;
      if (task.work_type === "personal") { out.personales += 1; out.personalMin += task.estimate_minutes || 0; return; }
      out.pendientes += 1;
      if (!task.estimate_minutes) { out.sinEstimado += 1; return; }
      const running = active?.task_id === task.id ? elapsedOf(active) : 0;
      const spentMin = ((task.time_spent_seconds || 0) + (totals[task.id] || 0) + running) / 60;
      const left = Math.max(0, task.estimate_minutes - spentMin);
      if (task.work_type === "profundo") out.profundo += left;
      else if (task.work_type === "liviano") out.liviano += left;
      else out.sinTipo += left;
    });
    return out;
  }, [tasks, totals, active, todayStr]);

  const capTotal = cap.total.profundo + cap.total.liviano;
  if (blocks === null) return null;
  if (!capTotal) {
    return (
      <div style={{
        background: DS.bgCard, border: DS.border, borderRadius: 14, padding: "12px 18px", marginBottom: 14,
        fontFamily: DS.font, fontSize: 12, color: DS.textMuted, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        Arma tu rutina con bloques de trabajo y aquí verás si el día te alcanza.
        {onOpenRoutine && (
          <button onClick={onOpenRoutine} style={{
            border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, borderRadius: 50,
            padding: "5px 12px", fontSize: 11, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
          }}>Ir a Mi rutina</button>
        )}
      </div>
    );
  }

  const remaining = cap.remaining.profundo + cap.remaining.liviano;
  const needed = plan.profundo + plan.liviano + plan.sinTipo;
  const margin = remaining - needed;
  const workedMin = (todaySeconds + (active ? elapsedOf(active) : 0)) / 60;
  const expectedMin = cap.elapsed.profundo + cap.elapsed.liviano;
  const pace = workedMin - expectedMin;

  let verdict, verdictColor;
  if (!plan.pendientes) { verdict = "Sin tareas para hoy"; verdictColor = DS.textMuted; }
  else if (needed === 0) { verdict = "Ponles estimado a tus tareas"; verdictColor = DS.amber; }
  else if (margin >= 0) { verdict = `Te alcanza · sobran ${fmtMin(margin)}`; verdictColor = DS.green; }
  else { verdict = `No te alcanza · faltan ${fmtMin(-margin)}`; verdictColor = DS.red; }

  const paceText =
    expectedMin < 5 ? "El día de trabajo apenas arranca"
    : Math.abs(pace) < 10 ? "Vas al ritmo de tu rutina"
    : pace > 0 ? `Vas adelantado ${fmtMin(pace)}`
    : `Vas atrasado ${fmtMin(-pace)}`;
  const paceColor = expectedMin < 5 || Math.abs(pace) < 10 ? DS.textSecondary : pace > 0 ? DS.green : DS.red;

  const label = { fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase" };
  const big = { fontSize: 20, fontWeight: 800, color: DS.textPrimary, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" };
  const small = { fontSize: 11, color: DS.textMuted };
  const cell = { display: "flex", flexDirection: "column", gap: 4, minWidth: 150, flex: "1 1 150px" };

  return (
    <div style={{
      background: DS.bgCard, border: DS.border, borderRadius: 14, padding: "14px 18px",
      marginBottom: 14, fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px", alignItems: "flex-start" }}>
        <div style={cell}>
          <div style={label}>Te queda hoy para trabajar</div>
          <div style={big}>{fmtMin(remaining)}</div>
          <div style={small}>
            🧠 {fmtMin(cap.remaining.profundo)} pesado · 🪶 {fmtMin(cap.remaining.liviano)} liviano
          </div>
        </div>
        <div style={cell}>
          <div style={label}>Tus tareas de hoy suman</div>
          <div style={big}>{fmtMin(needed)}</div>
          <div style={small}>
            {plan.pendientes} pendiente{plan.pendientes === 1 ? "" : "s"}
            {plan.sinEstimado > 0 && <span style={{ color: DS.amber }}> · {plan.sinEstimado} sin estimado</span>}
            {plan.hechasHoy > 0 && <> · {plan.hechasHoy} hecha{plan.hechasHoy === 1 ? "" : "s"} hoy</>}
            {plan.personales > 0 && <> · 🌱 {plan.personales} personal{plan.personales === 1 ? "" : "es"}{plan.personalMin ? ` (${fmtMin(plan.personalMin)}, aparte)` : " (aparte)"}</>}
          </div>
        </div>
        <div style={{ ...cell, flex: "2 1 220px" }}>
          <div style={label}>¿Te alcanza el día?</div>
          <div style={{ ...big, fontSize: 17, color: verdictColor }}>{verdict}</div>
          <div style={small}>
            {plan.profundo > cap.remaining.profundo
              ? `Ojo: tienes ${fmtMin(plan.profundo)} de trabajo pesado y solo ${fmtMin(cap.remaining.profundo)} de bloque pesado`
              : "Cuenta las tareas que vencen hoy y las vencidas"}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: paceColor }}>{paceText}</span>
          <span style={{ ...small, fontVariantNumeric: "tabular-nums" }}>
            Trabajado hoy {fmtMin(workedMin)} · a esta hora deberías llevar {fmtMin(expectedMin)} de {fmtMin(capTotal)}
          </span>
        </div>
        <div style={{ position: "relative", height: 8, borderRadius: 4, background: `${DS.textHint}55`, overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0, width: `${Math.min(100, (workedMin / capTotal) * 100)}%`,
            background: paceColor === DS.red ? DS.red : DS.green, borderRadius: 4, transition: "width 0.4s",
          }} />
          <div style={{
            position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, (expectedMin / capTotal) * 100)}%`,
            width: 2, background: DS.textPrimary,
          }} title="Donde deberías ir a esta hora" />
        </div>
      </div>
    </div>
  );
}
