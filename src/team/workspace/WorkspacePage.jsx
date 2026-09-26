import { useMemo } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { WorkspaceCard } from "./WorkspaceCard.jsx";
import { ManualesPanel } from "./ManualesPanel.jsx";
import { useScorecard } from "../hooks/useScorecard.js";
import { dayStatus, buildEntryLookup, valuesForDay, weeklyHitoPct } from "../scorecard/scorecardStatus.js";
import { weekStartMonday, weekDaysMonToSat, isoDate } from "../../lib/weeks.js";

export function WorkspacePage({
  targetMember,
  currentMember,
  tasks,
  onOpenScorecard,
  onOpenTracking,
  onOpenMyTasks,
  onBack,
}) {
  const memberId = targetMember?.id;
  const accent = targetMember?.color || DS.blue;
  const isOwner = currentMember?.id === memberId;

  // Preview scorecard: usa semana actual completa para % semanal + status ayer/hoy
  const weekStart = useMemo(() => weekStartMonday(new Date()), []);
  const { kpis, entries, loading: sLoading } = useScorecard(memberId, weekStart);

  const days = useMemo(() => weekDaysMonToSat(weekStart), [weekStart]);
  const lookup = useMemo(() => buildEntryLookup(entries), [entries]);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const todayValues = valuesForDay(kpis, lookup, today);
  const yesterdayValues = valuesForDay(kpis, lookup, yesterday);

  const hasScorecard = kpis.length > 0;

  const scorecardChips = hasScorecard
    ? [
        { label: "Ayer", status: dayStatus({ values: yesterdayValues, date: yesterday }) },
        { label: "Hoy", status: dayStatus({ values: todayValues, date: today }) },
      ]
    : [{ label: "Sin configurar", status: "gris" }];

  const dayValues = days.map((d) => kpis.map((k) => lookup[k.id]?.[isoDate(d)] ?? null));
  const weekPct = weeklyHitoPct(dayValues);

  const scorecardMetric = hasScorecard
    ? `${weekPct}% semanal · ${kpis.length} KPI${kpis.length === 1 ? "" : "s"}`
    : null;

  // Mis tareas: conteo pendientes hoy + vencidas
  const todayStr = isoDate(today);
  const myPending = (tasks || []).filter(
    (t) => t.status !== "completado" && (t.assigneeIds || []).includes(memberId)
  );
  const dueToday = myPending.filter((t) => t.due_date === todayStr).length;
  const overdue = myPending.filter((t) => t.due_date && t.due_date < todayStr).length;

  const tasksMetric = `${myPending.length} pendiente${myPending.length === 1 ? "" : "s"}${
    dueToday ? ` · ${dueToday} hoy` : ""
  }${overdue ? ` · ${overdue} vencida${overdue === 1 ? "" : "s"}` : ""}`;

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title={isOwner ? "Mi espacio" : `Espacio de ${targetMember?.name || "…"}`}
        subtitle="Scorecard · Master Tracking · Mis Tareas · Manuales"
        accent={accent}
        actions={
          onBack ? (
            <button
              onClick={onBack}
              style={{
                padding: "6px 14px",
                borderRadius: 50,
                border: `1px solid ${DS.textHint}`,
                background: "transparent",
                color: DS.textSecondary,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: DS.font,
                cursor: "pointer",
              }}
            >
              ← War Room
            </button>
          ) : null
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <WorkspaceCard
          icon="✅"
          title="Scorecard"
          subtitle={sLoading ? "Cargando…" : "Diario · L-S"}
          chips={scorecardChips}
          metric={scorecardMetric || (sLoading ? "" : "Sin KPIs configurados")}
          cta={hasScorecard ? "Abrir scorecard →" : "Configurar →"}
          onClick={onOpenScorecard}
          accent={DS.green}
        />

        <WorkspaceCard
          icon="📡"
          title="Master Tracking"
          subtitle="Clientes & hitos"
          chips={[
            { label: "Contenido", status: "gris" },
            { label: "Performance", status: "gris" },
          ]}
          metric="Todos los clientes · vista semanal"
          cta="Abrir tracking →"
          onClick={onOpenTracking}
          accent={DS.blue}
        />

        <WorkspaceCard
          icon="📋"
          title="Mis Tareas"
          subtitle="Lo asignado a ti"
          chips={[
            { label: `${dueToday} hoy`, status: dueToday > 0 ? "naranja" : "gris" },
            { label: `${overdue} vencidas`, status: overdue > 0 ? "rojo" : "gris" },
          ]}
          metric={tasksMetric}
          cta="Ver tareas →"
          onClick={onOpenMyTasks}
          accent={DS.purple}
        />

        <ManualesPanel
          targetMember={targetMember}
          currentMember={currentMember}
          accent={accent}
        />
      </div>
    </div>
  );
}
