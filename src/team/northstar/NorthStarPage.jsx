import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import {
  getYear, getMonth, ensureWeek,
  currentYear, currentMonth, currentIsoWeek,
} from "./db.js";
import { NorthStarYearCard } from "./NorthStarYearCard.jsx";
import { NorthStarMonthCard } from "./NorthStarMonthCard.jsx";
import { NorthStarWeekPlanner } from "./NorthStarWeekPlanner.jsx";

// 🏔 North Star — admin-only. Vista anidada: año → mes → semana actual.
// Tres cards apiladas. Cada una se edita inline y persiste a Supabase
// con debounce / on-blur. El histórico de semanas pasadas se navega
// con flechas dentro del WeekPlanner.
export function NorthStarPage() {
  const year = currentYear();
  const month = currentMonth();
  const [weekIso, setWeekIso] = useState(() => currentIsoWeek());

  const [yearData, setYearData] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Carga inicial: año, mes actual y semana visible. Si la semana no
  // existe en DB, la creamos con la plantilla por defecto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [y, m, w] = await Promise.all([
          getYear(year),
          getMonth(year, month),
          ensureWeek(year, weekIso, month),
        ]);
        if (cancelled) return;
        setYearData(y);
        setMonthData(m);
        setWeekData(w);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Error cargando North Star");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, month, weekIso]);

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title="🏔 North Star"
        subtitle={`Tu plan estratégico ${year} · Mes ${month} · Semana ${weekIso} ISO`}
        accent={DS.purple}
      />

      {error && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 14,
          background: `${DS.red}14`, border: `1px solid ${DS.red}55`,
          color: DS.red, fontSize: 12, fontWeight: 600,
        }}>
          {error}
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4, fontWeight: 500 }}>
            Probablemente faltan las tablas. Corré <code>db/north_star.sql</code> en Supabase.
          </div>
        </div>
      )}

      {loading && !error && (
        <div style={{ padding: "60px 20px", textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
          Cargando…
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <NorthStarYearCard
            year={year}
            data={yearData}
            onUpdate={(next) => setYearData(next)}
          />

          <NorthStarMonthCard
            year={year}
            month={month}
            data={monthData}
            onUpdate={(next) => setMonthData(next)}
          />

          <NorthStarWeekPlanner
            year={year}
            weekIso={weekIso}
            month={month}
            data={weekData}
            onChangeWeek={(nextWeek) => setWeekIso(nextWeek)}
            onUpdate={(next) => setWeekData(next)}
          />
        </div>
      )}
    </div>
  );
}
