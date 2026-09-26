import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import {
  yesterdayISODate,
  todayISODate,
} from "../../lib/weeks.js";

// Carga de una sola consulta todas las kpis + entries de ayer/hoy
// para un conjunto de memberIds — útil para pintar chips en TeamStrip.
export function useScorecardPreviews(memberIds) {
  const [kpisByMember, setKpisByMember] = useState({});
  const [entriesByMember, setEntriesByMember] = useState({});
  const [loading, setLoading] = useState(true);

  const key = (memberIds || []).slice().sort().join(",");

  const load = useCallback(async () => {
    if (!memberIds || memberIds.length === 0) {
      setKpisByMember({});
      setEntriesByMember({});
      setLoading(false);
      return;
    }

    const yesterday = yesterdayISODate();
    const today = todayISODate();

    const [kRes, eRes] = await Promise.all([
      database
        .from("scorecard_kpis")
        .select("id, member_id")
        .in("member_id", memberIds)
        .eq("archived", false),
      database
        .from("scorecard_entries")
        .select("kpi_id, member_id, date, value")
        .in("member_id", memberIds)
        .gte("date", yesterday)
        .lte("date", today),
    ]);

    const kBy = {};
    for (const k of kRes.data || []) {
      if (!kBy[k.member_id]) kBy[k.member_id] = [];
      kBy[k.member_id].push(k);
    }
    const eBy = {};
    for (const e of eRes.data || []) {
      if (!eBy[e.member_id]) eBy[e.member_id] = [];
      eBy[e.member_id].push(e);
    }
    setKpisByMember(kBy);
    setEntriesByMember(eBy);
    setLoading(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const channel = database
      .channel(`scorecard_previews_${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_kpis" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_entries" },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [key, load]);

  return { kpisByMember, entriesByMember, loading };
}
