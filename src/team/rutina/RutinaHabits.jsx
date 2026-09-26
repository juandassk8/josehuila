import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { DAY_LETTER, addDays, dateStr, dayIndex, mondayOf } from "./rutinaShared.js";
import { HabitsEditor } from "./HabitsEditor.jsx";

const MARK = ["", "✓", "~", "✕"];
const MARK_NAME = ["sin marcar", "lo hice", "a medias", "no lo hice"];
const GOAL_KG = 65;

export function RutinaHabits({ memberId, monday, setMonday, habits, logs, weights, markHabit, saveWeight, reloadHabits }) {
  const [showPeso, setShowPeso] = useState(false);
  const [editing, setEditing] = useState(false);
  const thisWeek = mondayOf().getTime() === monday.getTime();
  const todayCol = thisWeek ? dayIndex() : -1;
  const dates = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => dateStr(addDays(monday, i))), [monday]);
  const pesoDate = thisWeek ? dates[dayIndex()] : dates[6];
  const colors = ["transparent", DS.green, DS.amber, DS.red];

  let done = 0;
  let total = 0;
  const rows = habits.map((h) => {
    const vals = dates.map((d) => logs[`${h.id}|${d}`] || 0);
    const count = vals.reduce((a, v) => a + (v === 1 ? 1 : v === 2 ? 0.5 : 0), 0);
    done += Math.min(count, h.target);
    total += h.target;
    return { h, vals, count };
  });
  const groups = [];
  rows.forEach((r) => {
    const g = groups.find((x) => x.name === r.h.grp);
    if (g) g.rows.push(r); else groups.push({ name: r.h.grp, rows: [r] });
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  const o = { day: "numeric", month: "short" };
  const ghost = {
    fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer",
    border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary,
  };
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DS.textMuted, padding: "8px 5px", textAlign: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={ghost} onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior">←</button>
        <div style={{ fontWeight: 700, fontSize: 13, minWidth: 160, textAlign: "center", color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
          {monday.toLocaleDateString("es-CO", o)} – {addDays(monday, 6).toLocaleDateString("es-CO", o)}
        </div>
        <button style={ghost} onClick={() => setMonday(addDays(monday, 7))} aria-label="Semana siguiente">→</button>
        {!thisWeek && <button style={ghost} onClick={() => setMonday(mondayOf())}>Esta semana</button>}
        <span style={{ flex: 1 }} />
        <button style={ghost} onClick={() => setEditing(true)}>Editar hábitos</button>
      </div>
      {editing && <HabitsEditor memberId={memberId} habits={habits} onClose={() => setEditing(false)} onChanged={reloadHabits} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 30px", alignItems: "center", background: DS.bgCard, border: DS.border, borderRadius: 14, padding: "14px 18px" }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
          <div style={{ fontSize: 12, color: DS.textMuted }}>de la semana cumplida</div>
        </div>
        <div style={{ fontSize: 12, color: DS.textMuted }}>{done % 1 ? done.toFixed(1) : done} de {total} puntos de la semana</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, borderLeft: DS.border, paddingLeft: 30 }}>
          <label htmlFor="peso-hoy" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted }}>
            {thisWeek ? "Peso de hoy (kg)" : "Peso del domingo de esa semana (kg)"}
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <WeightInput id="peso-hoy" value={weights[pesoDate]} onSave={(kg) => saveWeight(pesoDate, kg)} big />
            <button style={ghost} onClick={() => setShowPeso((v) => !v)}>{showPeso ? "Ocultar progreso" : "Ver mi progreso"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: DS.textMuted, marginLeft: "auto" }}>
          {[1, 2, 3].map((v) => (
            <span key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 14, height: 14, borderRadius: 5, background: colors[v], display: "inline-block" }} />
              {MARK_NAME[v][0].toUpperCase() + MARK_NAME[v].slice(1)}
            </span>
          ))}
        </div>
      </div>

      {showPeso && <PesoPanel weights={weights} dates={dates} saveWeight={saveWeight} />}

      <div style={{ overflowX: "auto", background: DS.bgCard, border: DS.border, borderRadius: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: DS.font }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", paddingLeft: 14 }}>Hábito</th>
              {DAY_LETTER.map((d, i) => <th key={d} style={{ ...th, background: i === todayCol ? `${DS.blue}14` : "transparent" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={`g-${g.name}`}>
                <td colSpan={8} style={{ ...th, textAlign: "left", paddingLeft: 14, background: `${DS.textHint}22` }}>{g.name}</td>
              </tr>,
              ...g.rows.map(({ h, vals, count }) => {
                const complete = count >= h.target;
                return (
                  <tr key={h.id} style={{ borderTop: DS.border }}>
                    <td style={{ padding: "7px 6px 7px 14px", minWidth: 150 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: DS.textPrimary }}>{h.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11, color: complete ? DS.green : DS.textMuted }}>
                        <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, background: `${DS.textHint}55`, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, (count / h.target) * 100)}%`, background: complete ? DS.green : DS.blue, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: complete ? 700 : 400 }}>{count % 1 ? count.toFixed(1) : count} / {h.target}</span>
                      </div>
                    </td>
                    {vals.map((v, i) => {
                      const off = h.days && !h.days[i];
                      return (
                        <td key={i} style={{ textAlign: "center", padding: "6px 3px", background: i === todayCol ? `${DS.blue}14` : "transparent" }}>
                          <button
                            onClick={() => markHabit(h.id, dates[i], (v + 1) % 4)}
                            aria-label={`${h.name} · ${DAY_LETTER[i]} · ${MARK_NAME[v]}`}
                            style={{
                              width: 30, height: 30, borderRadius: 9, padding: 0, cursor: "pointer", lineHeight: 1, fontSize: 15, fontWeight: 800,
                              color: "#fff", opacity: off && !v ? 0.35 : 1,
                              border: `1.5px solid ${v ? colors[v] : DS.textHint}`, background: v ? colors[v] : "transparent",
                            }}
                          >{MARK[v]}</button>
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {!habits.length && <div style={{ fontSize: 13, color: DS.textMuted }}>Todavía no tienes hábitos configurados.</div>}
      <p style={{ fontSize: 12, color: DS.textMuted, margin: 0, maxWidth: 640 }}>
        Regla: nunca falles dos veces. Un rojo es un accidente; dos seguidos es un hábito nuevo. "A medias" vale medio punto.
        Los cuadros apagados son días en que ese hábito no toca. Varios se marcan solos cuando chequeas el bloque en el calendario.
      </p>
    </div>
  );
}

function WeightInput({ id, value, onSave, big }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      id={id} type="number" inputMode="decimal" step="0.1" min="30" max="200" placeholder="–"
      value={draft ?? (value ?? "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const kg = parseFloat(draft);
        onSave(isNaN(kg) ? null : kg);
        setDraft(null);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{
        width: big ? 92 : "100%", boxSizing: "border-box", padding: big ? "7px 9px" : "7px 2px", textAlign: big ? "left" : "center",
        borderRadius: 9, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary,
        fontSize: big ? 17 : 13, fontWeight: 800, fontFamily: DS.font, outline: "none",
      }}
    />
  );
}

function PesoPanel({ weights, dates, saveWeight }) {
  const pts = Object.keys(weights).sort().map((d) => ({ d, t: new Date(`${d}T12:00:00`).getTime(), v: weights[d] }));
  const stat = { background: DS.bgSide, border: DS.border, borderRadius: 12, padding: "10px 12px" };
  const avg = (a) => a.reduce((x, y) => x + y.v, 0) / a.length;
  const fd = (t) => new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  let body = <p style={{ fontSize: 12, color: DS.textMuted, margin: 0 }}>Anota tu peso cada mañana y aquí vas a ver la curva.</p>;
  let trend = { text: "Sin datos todavía", color: DS.textMuted };
  let stats = null;
  if (pts.length) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    const wk = 7 * 864e5;
    const recent = pts.filter((p) => p.t > last.t - wk);
    const prev = pts.filter((p) => p.t <= last.t - wk && p.t > last.t - 2 * wk);
    const delta = prev.length ? avg(recent) - avg(prev) : last.v - first.v;
    if (pts.length < 2) trend = { text: "Falta otro registro para ver la tendencia", color: DS.textMuted };
    else if (delta > 0.15) trend = { text: `En ascenso · +${delta.toFixed(1)} kg`, color: DS.green };
    else if (delta < -0.15) trend = { text: `En descenso · ${delta.toFixed(1)} kg`, color: DS.red };
    else trend = { text: "Estable", color: DS.textSecondary };
    const diff = last.v - first.v;
    stats = [
      ["Peso actual", `${last.v.toFixed(1)} kg`, fd(last.t)],
      ["Desde que empezaste", `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} kg`, `arrancaste en ${first.v.toFixed(1)} kg`],
      ["Promedio últimos 7 días", `${avg(recent).toFixed(1)} kg`, `${recent.length} registro${recent.length === 1 ? "" : "s"}`],
      [`Te faltan para ${GOAL_KG}`, `${Math.max(0, GOAL_KG - last.v).toFixed(1)} kg`, `meta ${GOAL_KG} kg`],
    ];
    const W = 640, Hh = 220, pl = 46, pr = 16, pt = 14, pb = 28;
    const lo = Math.floor(Math.min(...pts.map((p) => p.v)) - 1);
    const hi = Math.ceil(Math.max(...pts.map((p) => p.v)) + 1);
    const t0 = first.t;
    const t1 = Math.max(last.t, t0 + 6 * 864e5);
    const X = (t) => pl + ((t - t0) / (t1 - t0)) * (W - pl - pr);
    const Y = (v) => pt + ((hi - v) / (hi - lo)) * (Hh - pt - pb);
    const stepY = hi - lo <= 4 ? 1 : hi - lo <= 10 ? 2 : 5;
    const ticks = [];
    for (let v = lo; v <= hi; v += stepY) ticks.push(v);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
    body = (
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Curva de peso" style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={DS.textHint} strokeOpacity="0.5" strokeWidth="1" />
            <text x={pl - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={DS.textMuted}>{v} kg</text>
          </g>
        ))}
        {pts.length > 1 && <path d={`${path} L${X(last.t)} ${Hh - pb} L${X(first.t)} ${Hh - pb} Z`} fill={DS.blue} opacity="0.1" />}
        {pts.length > 1 && <path d={path} fill="none" stroke={DS.blue} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <circle key={p.d} cx={X(p.t)} cy={Y(p.v)} r={i === pts.length - 1 ? 5 : 3} fill={i === pts.length - 1 ? DS.blue : DS.bgSide} stroke={DS.blue} strokeWidth="2">
            <title>{`${fd(p.t)}: ${p.v.toFixed(1)} kg`}</title>
          </circle>
        ))}
        <text x={pl} y={Hh - 8} fontSize="11" fill={DS.textMuted}>{fd(t0)}</text>
        <text x={W - pr} y={Hh - 8} textAnchor="end" fontSize="11" fill={DS.textMuted}>{fd(t1)}</text>
      </svg>
    );
  }

  return (
    <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DS.textPrimary }}>Tu peso · meta {GOAL_KG} kg</div>
        <span style={{ fontWeight: 800, fontSize: 12, padding: "5px 12px", borderRadius: 50, border: `1px solid ${trend.color}`, color: trend.color }}>{trend.text}</span>
      </div>
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {stats.map(([k, v, s]) => (
            <div key={k} style={stat}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              <div style={{ fontSize: 11.5, color: DS.textMuted }}>{s}</div>
            </div>
          ))}
        </div>
      )}
      {body}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 8 }}>Pesos de la semana que estás viendo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
          {dates.map((d, i) => (
            <div key={d} style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "center", fontSize: 11, fontWeight: 800, color: DS.textMuted }}>
              <label htmlFor={`pw-${i}`}>{DAY_LETTER[i]}</label>
              <WeightInput id={`pw-${i}`} value={weights[d]} onSave={(kg) => saveWeight(d, kg)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
