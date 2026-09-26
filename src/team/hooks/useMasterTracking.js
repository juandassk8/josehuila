import { useCallback, useEffect, useState } from "react";
import { database } from "../../lib/backend.js";
import {
  listContentMilestones,
  listPerformanceReports,
  listSlaSupport,
} from "../data/trackingDb.js";
import { isoDate, weekDaysMonToSat } from "../../lib/weeks.js";

export function useMasterTracking(weekStart) {
  const [milestones, setMilestones] = useState([]);
  const [reports, setReports] = useState([]);
  const [sla, setSla] = useState([]);
  const [loading, setLoading] = useState(true);

  const weekStartISO = weekStart ? isoDate(weekStart) : null;
  const weekEndISO = weekStart ? isoDate(weekDaysMonToSat(weekStart)[5]) : null;

  const load = useCallback(async () => {
    if (!weekStartISO) return;
    setLoading(true);
    const [m, r, s] = await Promise.all([
      listContentMilestones(weekStartISO),
      listPerformanceReports(weekStartISO, weekEndISO),
      listSlaSupport(weekStartISO, weekEndISO),
    ]);
    setMilestones(m.data || []);
    setReports(r.data || []);
    setSla(s.data || []);
    setLoading(false);
  }, [weekStartISO, weekEndISO]);

  useEffect(() => {
    load();
    if (!weekStartISO) return;
    const ch = database
      .channel(`mt_${weekStartISO}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_milestones" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "performance_reports" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sla_support" },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(ch);
  }, [load, weekStartISO]);

  return { milestones, reports, sla, loading, reload: load };
}
