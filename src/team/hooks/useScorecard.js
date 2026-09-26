import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listKpis, listEntries, listNotes } from "../data/scorecardDb.js";
import { weekDaysMonToSat, isoDate } from "../../lib/weeks.js";

// Carga kpis + entries + notes para (memberId, weekStart).
// weekStart: Date del lunes de la semana.
export function useScorecard(memberId, weekStart) {
  const [kpis, setKpis] = useState([]);
  const [entries, setEntries] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const weekKey = weekStart ? isoDate(weekStart) : null;

  const load = useCallback(async () => {
    if (!memberId || !weekStart) {
      setKpis([]);
      setEntries([]);
      setNotes([]);
      setLoading(false);
      return;
    }
    const days = weekDaysMonToSat(weekStart);
    const from = isoDate(days[0]);
    const to = isoDate(days[5]);

    const [kRes, eRes, nRes] = await Promise.all([
      listKpis(memberId),
      listEntries(memberId, from, to),
      listNotes(memberId, from, to),
    ]);
    setKpis(kRes.data || []);
    setEntries(eRes.data || []);
    setNotes(nRes.data || []);
    setLoading(false);
  }, [memberId, weekKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!memberId || !weekStart) return undefined;
    load();
    const channelName = `scorecard_${memberId}_${weekKey}`;
    const channel = database
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_kpis", filter: `member_id=eq.${memberId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_entries", filter: `member_id=eq.${memberId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_notes", filter: `member_id=eq.${memberId}` },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [memberId, weekKey, load]);

  return { kpis, entries, notes, loading, reload: load };
}

// Versión ligera para preview (hoy + ayer) sin depender de semana.
// Retorna kpis + entries de los últimos 2 días.
export function useScorecardPreview(memberId) {
  const [kpis, setKpis] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!memberId) {
      setKpis([]);
      setEntries([]);
      setLoading(false);
      return;
    }
    const today = new Date();
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const from = isoDate(y);
    const to = isoDate(today);

    const [kRes, eRes] = await Promise.all([
      listKpis(memberId),
      listEntries(memberId, from, to),
    ]);
    setKpis(kRes.data || []);
    setEntries(eRes.data || []);
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return undefined;
    load();
    const channel = database
      .channel(`scorecard_preview_${memberId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_kpis", filter: `member_id=eq.${memberId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_entries", filter: `member_id=eq.${memberId}` },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [memberId, load]);

  return { kpis, entries, loading, reload: load };
}
