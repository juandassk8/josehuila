import { useEffect, useState, useCallback, useRef } from "react";
import { database } from "../../lib/backend.js";
import { listTasks, purgeOldTrash } from "../data/db.js";
import { logger } from "../../lib/logger.js";

// Normaliza y deduplica por id. Las dedup es defensiva: si por cualquier razón
// (race en realtime, dos paths que cargan, etc.) la query devuelve la misma fila
// dos veces, no queremos renderizar dos cards con la misma key — eso causa
// layout caótico en el board (cards superpuestos, drag confundido).
const normalize = (rows) => {
  const seen = new Set();
  const out = [];
  for (const t of (rows || [])) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ ...t, assigneeIds: (t.assignees || []).map((a) => a.member_id) });
  }
  return out;
};

export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Token de load: cuando hay burst de realtime events durante un drag-reorder,
  // varios load() corren en paralelo. Sin token, el último que termina (que
  // puede ser uno viejo) sobrescribe el setTasks de uno más nuevo → la UI
  // titila entre snapshots viejo y nuevo. El token garantiza que sólo el load
  // más reciente puede setear el state.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const myToken = ++loadTokenRef.current;
    const { data, error } = await listTasks();
    if (myToken !== loadTokenRef.current) return; // stale load: descartar
    // BLINDAJE ANTI-PÉRDIDA: nunca vaciar la lista por un fallo de carga.
    if (error) {
      logger.error("[useTasks] carga falló, se conserva la lista actual:", error.message);
      setLoading(false);
      return;
    }
    const rows = normalize(data || []);
    if (rows.length === 0) {
      const { data: sess } = await database.auth.getSession();
      if (!sess?.session) {
        logger.warn("[useTasks] resultado vacío sin sesión válida — no se vacía la vista.");
        setLoading(false);
        return;
      }
    }
    if (myToken !== loadTokenRef.current) return; // re-check antes de setTasks
    setTasks(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    purgeOldTrash().catch(() => {});
    load();
    // Debounce realtime: un drag-reorder triggea muchos UPDATEs (status + N
    // sort_orders) → muchos eventos realtime → muchos load() en burst. Sin
    // coalescing, eso satura la red y agrava la race condition. 150ms es
    // suficiente para colapsar un burst de drag en un único reload sin sentir
    // lag perceptible.
    let scheduled = null;
    const requestReload = () => {
      if (scheduled) clearTimeout(scheduled);
      scheduled = setTimeout(() => { scheduled = null; load(); }, 150);
    };
    const tasksChannel = database
      .channel("tasks_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, requestReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, requestReload)
      .subscribe();
    return () => {
      if (scheduled) clearTimeout(scheduled);
      database.removeChannel(tasksChannel);
    };
  }, [load]);

  return { tasks, loading, reload: load };
}
