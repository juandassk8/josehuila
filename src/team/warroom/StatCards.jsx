import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { isOverdue, isOnlineSince } from "../../lib/dates.js";

// SLA de la semana: % de tareas con vencimiento en la semana actual que se
// completaron a tiempo (completed_at <= due_date). Dato real, no inventado.
function weekSLA(tasks) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now); monday.setDate(now.getDate() + diff); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  const due = tasks.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= monday && d <= sunday;
  });
  if (!due.length) return null;
  const onTime = due.filter((t) =>
    t.status === "completado" && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date)
  ).length;
  return Math.round((onTime / due.length) * 100);
}

// Deltas reales vs el día anterior. Guardo un snapshot diario por miembro en
// localStorage; el delta es (hoy − snapshot de ayer). El primer día no hay
// base → no se muestra delta (nunca un número inventado).
function useDailyDeltas(memberId, values) {
  const [deltas, setDeltas] = useState(null);
  const sig = JSON.stringify(values);
  useEffect(() => {
    if (!memberId) return;
    const key = `warroom:kpi:${memberId}`;
    const today = new Date().toISOString().slice(0, 10);
    let store = null;
    try { store = JSON.parse(localStorage.getItem(key) || "null"); } catch { store = null; }
    let baseline = null;
    if (store && store.today && store.today.date === today) {
      baseline = store.prev?.values || null;
      store.today.values = values; // refrescar valores de hoy
    } else {
      const prev = store?.today || null; // el último snapshot pasa a ser "ayer"
      baseline = prev?.values || null;
      store = { prev, today: { date: today, values } };
    }
    try { localStorage.setItem(key, JSON.stringify(store)); } catch {}
    if (baseline) {
      const d = {};
      for (const k in values) d[k] = values[k] - (baseline[k] ?? values[k]);
      setDeltas(d);
    } else {
      setDeltas(null);
    }
  }, [memberId, sig]);
  return deltas;
}

export function StatCards({ tasks, members, currentMember }) {
  const open = tasks.filter((t) => t.status !== "completado");
  const urgent = open.filter((t) => t.priority === "urgente").length;
  const overdue = open.filter((t) => isOverdue(t.due_date)).length;
  const today = tasks.filter(
    (t) =>
      t.status === "completado" &&
      t.completed_at &&
      new Date(t.completed_at).toDateString() === new Date().toDateString()
  ).length;
  const mine = open.filter((t) => (t.assigneeIds || []).includes(currentMember?.id)).length;
  const sla = weekSLA(tasks);

  const values = { urgent, overdue, today, mine, sla: sla ?? 0 };
  const deltas = useDailyDeltas(currentMember?.id, values);

  // goodDir: +1 = subir es bueno, -1 = bajar es bueno, 0 = neutro (siempre muted)
  const cards = [
    { key: "urgent",  label: "Urgentes abiertas",  value: urgent, color: DS.red,    goodDir: -1 },
    { key: "overdue", label: "Vencidas",           value: overdue, color: DS.amber, goodDir: -1 },
    { key: "today",   label: "Completadas hoy",    value: today,  color: DS.green,  goodDir: 1 },
    { key: "mine",    label: "Mis tareas abiertas", value: mine,  color: DS.blue,   goodDir: 0 },
    { key: "sla",     label: "SLA de la semana",   value: sla == null ? "—" : `${sla}%`, color: DS.purple, goodDir: 1 },
  ];

  const deltaFor = (c) => {
    if (!deltas || deltas[c.key] == null || deltas[c.key] === 0) {
      return deltas ? { txt: "0", color: DS.textMuted } : null;
    }
    const d = deltas[c.key];
    const good = c.goodDir === 0 ? null : (d * c.goodDir > 0);
    const color = good == null ? DS.textMuted : good ? DS.green : DS.red;
    return { txt: `${d > 0 ? "+" : ""}${d}`, color };
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 24,
      }}
    >
      {cards.map((c, i) => {
        const delta = deltaFor(c);
        return (
          <div
            key={c.key}
            style={{
              padding: "16px 20px",
              borderLeft: i === 0 ? "none" : DS.border,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: DS.textMuted,
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
              {c.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: DS.textPrimary,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {c.value}
              </span>
              {delta && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: delta.color,
                  fontVariantNumeric: "tabular-nums", fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {delta.txt}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
