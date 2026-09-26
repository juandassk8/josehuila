import { useEffect, useMemo, useState, useCallback } from "react";
import { database } from "../../../lib/backend.js";
import { listScripts } from "../workspace_guiones_db.js";

// pipelineType = 'ads' | 'organic' | null (null = todos, modo legacy).
// Filtramos en memoria — el realtime trae TODO y re-filtramos en el select.
// Así si el admin togglea el tipo, los scripts se filtran sin refetch.
export function useCompanyScripts(companyId, pipelineType = null) {
  const [allScripts, setAllScripts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setAllScripts([]); setLoading(false); return; }
    const { data } = await listScripts(companyId);
    setAllScripts(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const channel = database
      .channel(`company_scripts_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_scripts" }, () => load())
      .subscribe();
    return () => database.removeChannel(channel);
  }, [companyId, load]);

  const scripts = useMemo(() => {
    if (!pipelineType) return allScripts;
    return allScripts.filter((s) => (s.pipeline_type || "ads") === pipelineType);
  }, [allScripts, pipelineType]);

  return { scripts, loading, reload: load };
}
