import { useCallback, useEffect, useState, useId } from "react";
import { database } from "../../../lib/backend.js";
import { listTasks, purgeOldTrash } from "../workspace_tasks_db.js";

// Shape normalizer — assignees viene como [{member_id}] desde el JOIN.
const normalize = (rows) =>
  (rows || []).map((t) => ({
    ...t,
    assigneeIds: (t.assignees || []).map((a) => a.member_id),
  }));

// Suscripción realtime a tareas de una empresa. Filtramos por company_id en
// cada reload (Supabase realtime dispara sin filtro; re-leemos con scope).
export function useCompanyTasks(companyId) {
  // El nombre del canal lleva un id por instancia: dos hooks con el MISMO
  // nombre comparten canal y Supabase rechaza el segundo con "cannot add
  // postgres_changes callbacks after subscribe()".
  const uid = useId();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setTasks([]); setLoading(false); return; }
    const { data } = await listTasks(companyId);
    setTasks(normalize(data));
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    // Fire-and-forget: limpia papelera con más de 30 días de esta empresa.
    purgeOldTrash(companyId).catch(() => {});
    load();
    const channel = database
      .channel(`${uid}_company_tasks_changes_${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_tasks" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_task_assignees" },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(channel);
  }, [companyId, load, uid]);

  return { tasks, loading, reload: load };
}
