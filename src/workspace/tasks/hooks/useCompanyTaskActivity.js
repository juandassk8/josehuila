import { useCallback, useEffect, useState, useId } from "react";
import { database } from "../../../lib/backend.js";
import { listTaskActivity } from "../workspace_tasks_db.js";

export function useCompanyTaskActivity(companyId, limit = 50) {
  // El nombre del canal lleva un id por instancia: dos hooks con el MISMO
  // nombre comparten canal y Supabase rechaza el segundo con "cannot add
  // postgres_changes callbacks after subscribe()".
  const uid = useId();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setEvents([]); setLoading(false); return; }
    const { data } = await listTaskActivity(companyId, limit);
    setEvents(data || []);
    setLoading(false);
  }, [companyId, limit]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`${uid}_company_task_activity_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_task_activity" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load, uid]);

  return { events, loading, reload: load };
}
