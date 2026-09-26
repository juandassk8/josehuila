// Hook central del time tracker.
// Carga categorías + 365 días de sesiones (incluida la activa), suscribe a
// realtime con filter owner_id=eq.${memberId} y expone los mutators.

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { database } from "../../../lib/backend.js";
import {
  listCategories,
  createCategory as dbCreateCategory,
  updateCategory as dbUpdateCategory,
  archiveCategory as dbArchiveCategory,
  reorderCategories as dbReorderCategories,
  listSessions,
  getActiveSession,
  startSession as dbStartSession,
  endActiveSession as dbEndActiveSession,
  switchSession as dbSwitchSession,
  updateSession as dbUpdateSession,
  deleteSession as dbDeleteSession,
  listMyOpenTasks,
} from "../data/timeTrackerDb.js";
import { listSpaces } from "../../data/db.js";
import { addDays, startOfDay } from "date-fns";
import { logger } from "../../../lib/logger.js";

const DEFAULT_SEED = [
  { name: "Marca personal", color: "#8B5CF6", icon: "✨", sort_order: 10 },
  { name: "Agencia", color: "#378ADD", icon: "🏢", sort_order: 20 },
  { name: "Otros", color: "#6B7280", icon: "•", sort_order: 30 },
];

export function useTimeTracker(memberId) {
  const [categories, setCategories] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [mySpaces, setMySpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const load = useCallback(async () => {
    if (!memberId) {
      setCategories([]);
      setSessions([]);
      setActiveSession(null);
      setMyTasks([]);
      setMySpaces([]);
      setLoading(false);
      return;
    }
    const fromIso = addDays(startOfDay(new Date()), -365).toISOString();
    const toIso = addDays(startOfDay(new Date()), 1).toISOString();

    const [cRes, sRes, aRes, tasksList, spacesRes] = await Promise.all([
      listCategories(memberId),
      listSessions(memberId, fromIso, toIso),
      getActiveSession(memberId),
      listMyOpenTasks(memberId),
      listSpaces(),
    ]);

    const cats = cRes.data || [];
    setCategories(cats);
    setSessions(sRes.data || []);
    setActiveSession(aRes.data || null);
    setMyTasks(tasksList || []);
    setMySpaces(spacesRes.data || []);
    setLoading(false);

    // Seed silencioso si nunca se han creado categorías.
    if (cats.length === 0 && !seededRef.current) {
      seededRef.current = true;
      try {
        await Promise.all(DEFAULT_SEED.map((p) => dbCreateCategory(memberId, p)));
        // El realtime hará el reload; pero forzamos por si la sub aún no está.
        const reload = await listCategories(memberId);
        setCategories(reload.data || []);
      } catch (e) {
        // Si otro tab seedó primero, los unique indexes lo bloquean — está bien.
        logger.warn("seed time tracker categories:", e?.message);
      }
    }
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return undefined;
    load();
    const channel = database
      .channel(`time_tracker_${memberId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_tracker_categories", filter: `owner_id=eq.${memberId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_tracker_sessions", filter: `owner_id=eq.${memberId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_assignees", filter: `member_id=eq.${memberId}` },
        () => listMyOpenTasks(memberId).then((t) => setMyTasks(t || []))
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_task_assignees", filter: `member_id=eq.${memberId}` },
        () => listMyOpenTasks(memberId).then((t) => setMyTasks(t || []))
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [memberId, load]);

  // ---- Mutators ----

  const createCategory = useCallback(
    async (payload) => {
      if (!memberId) return;
      const sort_order =
        categories.length > 0
          ? Math.max(...categories.map((c) => c.sort_order || 0)) + 10
          : 10;
      const { data, error } = await dbCreateCategory(memberId, { sort_order, ...payload });
      if (error) throw error;
      // Optimistic — realtime llegará luego.
      setCategories((prev) => [...prev, data]);
      return data;
    },
    [memberId, categories]
  );

  const updateCategory = useCallback(async (id, patch) => {
    const { data, error } = await dbUpdateCategory(id, patch);
    if (error) throw error;
    setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  }, []);

  const archiveCategory = useCallback(async (id) => {
    const { error } = await dbArchiveCategory(id);
    if (error) throw error;
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const reorderCategories = useCallback(async (orderedList) => {
    setCategories(orderedList); // optimistic
    await dbReorderCategories(orderedList);
  }, []);

  // Start: arranca o cambia sesión. Pivotea sobre el space (no la category
  // como en la versión vieja).
  //
  // spaceId: el espacio (root o subspace) donde se hace el trabajo.
  // taskOpts: { taskId, taskKind, taskLabel } — opcionales. Si no se pasan,
  //   la sesión va sin tarea (sólo espacio).
  const start = useCallback(
    async (spaceId, taskOpts = {}) => {
      if (!memberId || !spaceId) return null;
      const nextTaskId = taskOpts.taskId || null;
      const opts = { spaceId, ...taskOpts };

      if (activeSession) {
        const sameSpace = (activeSession.space_id || null) === spaceId;
        const sameTask = (activeSession.task_id || null) === nextTaskId;
        if (sameSpace && sameTask) return activeSession;
        // Distinto space o distinta task → switch atómico (cierra + abre).
        const { data, error } = await dbSwitchSession(memberId, opts);
        if (error) throw error;
        setActiveSession(data);
        setSessions((prev) => {
          const closedAt = new Date().toISOString();
          return [
            data,
            ...prev.map((s) =>
              s.id === activeSession.id && !s.ended_at ? { ...s, ended_at: closedAt } : s
            ),
          ];
        });
        return data;
      }
      const { data, error } = await dbStartSession(memberId, opts);
      if (error) throw error;
      setActiveSession(data);
      setSessions((prev) => [data, ...prev]);
      return data;
    },
    [memberId, activeSession]
  );

  const pause = useCallback(async () => {
    if (!memberId || !activeSession) return;
    const closedAt = new Date().toISOString();
    const closingId = activeSession.id;
    setActiveSession(null);
    setSessions((prev) =>
      prev.map((s) => (s.id === closingId ? { ...s, ended_at: closedAt } : s))
    );
    await dbEndActiveSession(memberId, closedAt);
  }, [memberId, activeSession]);

  // Reanuda: arranca una sesión nueva con mismo space Y misma tarea que la
  // última cerrada (preserva el contexto de trabajo).
  const resume = useCallback(async () => {
    if (!memberId) return null;
    const lastClosed = sessions.find((s) => s.ended_at);
    if (!lastClosed) return null;
    const spaceId = lastClosed.space_id;
    if (!spaceId) return null; // sesión legacy sin space — no podemos reanudar limpio
    return start(spaceId, {
      taskId: lastClosed.task_id || null,
      taskKind: lastClosed.task_kind || null,
      taskLabel: lastClosed.task_label || null,
    });
  }, [memberId, sessions, start]);

  const switchTo = useCallback((spaceId, taskOpts = {}) => start(spaceId, taskOpts), [start]);

  // Cambia la tarea sin tocar el space activo. Si no hay sesión activa,
  // no hace nada (no podemos asignar tarea sin saber el espacio).
  const switchTask = useCallback(
    async (taskOpts = {}) => {
      if (!activeSession?.space_id) return null;
      return start(activeSession.space_id, taskOpts);
    },
    [activeSession, start]
  );

  const updateSession = useCallback(async (id, patch) => {
    const { data, error } = await dbUpdateSession(id, patch);
    if (error) throw error;
    setSessions((prev) => prev.map((s) => (s.id === id ? data : s)));
    if (activeSession?.id === id) setActiveSession(data.ended_at ? null : data);
    return data;
  }, [activeSession]);

  const deleteSession = useCallback(async (id) => {
    await dbDeleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSession?.id === id) setActiveSession(null);
  }, [activeSession]);

  // Detalle de la categoría activa (legacy — para sesiones viejas).
  const activeCategory = useMemo(() => {
    if (!activeSession) return null;
    return categories.find((c) => c.id === activeSession.category_id) || null;
  }, [activeSession, categories]);

  // Space exacto donde corre la sesión (puede ser subspace) + el space root
  // ascendiendo por parent_space_id. Lo que se usa en el UI principal.
  const activeSpace = useMemo(() => {
    if (!activeSession?.space_id) return null;
    return mySpaces.find((s) => s.id === activeSession.space_id) || null;
  }, [activeSession?.space_id, mySpaces]);

  const activeSpaceRoot = useMemo(() => {
    if (!activeSpace) return null;
    let cur = activeSpace;
    while (cur?.parent_space_id) {
      const parent = mySpaces.find((s) => s.id === cur.parent_space_id);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }, [activeSpace, mySpaces]);

  return {
    categories,
    sessions,
    activeSession,
    activeCategory,
    activeSpace,
    activeSpaceRoot,
    myTasks,
    mySpaces,
    loading,
    // mutators
    createCategory,
    updateCategory,
    archiveCategory,
    reorderCategories,
    start,
    pause,
    resume,
    switchTo,
    switchTask,
    updateSession,
    deleteSession,
    reload: load,
  };
}
