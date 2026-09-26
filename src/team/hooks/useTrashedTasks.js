import { useCallback, useEffect, useState } from "react";
import { database } from "../../lib/backend.js";
import { listTrashedTasks } from "../data/db.js";
import { logger } from "../../lib/logger.js";

const normalize = (rows) =>
  (rows || []).map((t) => ({
    ...t,
    assigneeIds: (t.assignees || []).map((a) => a.member_id),
  }));

export function useTrashedTasks() {
  const [trashed, setTrashed] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await listTrashedTasks();
    // Anti-wipe: no vaciar la papelera por un fallo de carga.
    if (error) {
      logger.error("[useTrashedTasks] carga falló, se conserva la lista actual:", error.message);
      setLoading(false);
      return;
    }
    setTrashed(normalize(data || []));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = database
      .channel("trashed_tasks_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [load]);

  return { trashed, loading, reload: load };
}
