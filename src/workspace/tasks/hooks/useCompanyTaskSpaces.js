import { useCallback, useEffect, useState, useId } from "react";
import { database } from "../../../lib/backend.js";
import { listSpaces } from "../workspace_tasks_db.js";

export function useCompanyTaskSpaces(companyId) {
  // El nombre del canal lleva un id por instancia: dos hooks con el MISMO
  // nombre comparten canal y Supabase rechaza el segundo con "cannot add
  // postgres_changes callbacks after subscribe()".
  const uid = useId();
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setSpaces([]); setLoading(false); return; }
    const { data } = await listSpaces(companyId);
    setSpaces(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`${uid}_company_task_spaces_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_task_spaces" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load, uid]);

  return { spaces, loading, reload: load };
}
