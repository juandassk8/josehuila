import { useCallback, useEffect, useState, useId } from "react";
import { database } from "../../../lib/backend.js";
import { listTrashedTasks } from "../workspace_tasks_db.js";

const normalize = (rows) =>
  (rows || []).map((t) => ({
    ...t,
    assigneeIds: (t.assignees || []).map((a) => a.member_id),
  }));

export function useCompanyTrashedTasks(companyId) {
  // El nombre del canal lleva un id por instancia: dos hooks con el MISMO
  // nombre comparten canal y Supabase rechaza el segundo con "cannot add
  // postgres_changes callbacks after subscribe()".
  const uid = useId();
  const [trashed, setTrashed] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setTrashed([]); setLoading(false); return; }
    const { data } = await listTrashedTasks(companyId);
    setTrashed(normalize(data));
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`${uid}_company_trashed_tasks_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_tasks" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load, uid]);

  return { trashed, loading, reload: load };
}
