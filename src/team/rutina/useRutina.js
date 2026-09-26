import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "../../lib/logger.js";
import {
  listChecks, setCheck, listHabits, listHabitLogs, setHabitLog, listWeights, setWeight,
} from "./rutinaDb.js";
import { addDays, dateStr, useRoutineBlocks } from "./rutinaShared.js";

// Estado de "Mi rutina" para una semana: bloques, checks por bloque, hábitos,
// registro de hábitos y peso. Las escrituras son optimistas.
export function useRutina(memberId, monday) {
  const blocks = useRoutineBlocks(memberId);
  const [checks, setChecks] = useState({}); // `${blockId}|${date}` → 1 | 3
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState({}); // `${habitId}|${date}` → 1 | 2 | 3
  const [weights, setWeights] = useState({}); // date → kg
  const [loading, setLoading] = useState(true);
  const token = useRef(0);

  const from = dateStr(monday);
  const to = dateStr(addDays(monday, 6));

  useEffect(() => {
    if (!memberId) return;
    const my = ++token.current;
    (async () => {
      const [c, h, l, w] = await Promise.all([
        listChecks(memberId, from, to), listHabits(memberId), listHabitLogs(memberId, from, to), listWeights(memberId),
      ]);
      if (my !== token.current) return;
      [c, h, l, w].forEach((r) => r.error && logger.warn("[rutina]", r.error.message));
      setChecks(Object.fromEntries((c.data || []).map((r) => [`${r.block_id}|${r.date}`, r.value])));
      setHabits(h.data || []);
      setLogs(Object.fromEntries((l.data || []).map((r) => [`${r.habit_id}|${r.date}`, r.value])));
      setWeights(Object.fromEntries((w.data || []).map((r) => [r.date, Number(r.kg)])));
      setLoading(false);
    })();
  }, [memberId, from, to]);

  const habitByKey = useMemo(() => Object.fromEntries(habits.map((h) => [h.key, h])), [habits]);

  const markHabit = useCallback(async (habitId, date, value) => {
    setLogs((prev) => {
      const next = { ...prev };
      if (value) next[`${habitId}|${date}`] = value; else delete next[`${habitId}|${date}`];
      return next;
    });
    const { error } = await setHabitLog(memberId, habitId, date, value);
    if (error) logger.error("[rutina] hábito:", error.message);
  }, [memberId]);

  // Marca un bloque (✓ / ✕ / vacío) y recalcula el hábito enlazado a ese día:
  // todos ✓ → hecho · algunos ✓ → a medias · solo ✕ → no · nada → vacío.
  const markBlock = useCallback(async (block, date, value) => {
    const nextChecks = { ...checks };
    if (value) nextChecks[`${block.id}|${date}`] = value; else delete nextChecks[`${block.id}|${date}`];
    setChecks(nextChecks);
    const { error } = await setCheck(memberId, block.id, date, value);
    if (error) logger.error("[rutina] check:", error.message);
    const habit = block.habit_key && habitByKey[block.habit_key];
    if (!habit) return;
    const group = (blocks || []).filter((b) => b.day === block.day && b.habit_key === block.habit_key);
    const vals = group.map((b) => nextChecks[`${b.id}|${date}`] || 0);
    const yes = vals.filter((v) => v === 1).length;
    const no = vals.filter((v) => v === 3).length;
    const result = yes === vals.length ? 1 : yes > 0 ? 2 : no > 0 ? 3 : 0;
    await markHabit(habit.id, date, result);
  }, [checks, blocks, habitByKey, memberId, markHabit]);

  const saveWeight = useCallback(async (date, kg) => {
    setWeights((prev) => {
      const next = { ...prev };
      if (kg) next[date] = kg; else delete next[date];
      return next;
    });
    const { error } = await setWeight(memberId, date, kg);
    if (error) logger.error("[rutina] peso:", error.message);
  }, [memberId]);

  const reloadHabits = useCallback(async () => {
    const { data, error } = await listHabits(memberId);
    if (error) logger.warn("[rutina]", error.message); else setHabits(data || []);
  }, [memberId]);

  return { blocks, checks, habits, logs, weights, loading, markBlock, markHabit, saveWeight, reloadHabits };
}
