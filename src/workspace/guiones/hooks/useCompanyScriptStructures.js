import { useCallback, useEffect, useState } from "react";
import { database } from "../../../lib/backend.js";
import { listStructures } from "../workspace_guiones_db.js";

// Estructuras de guion (frameworks de copy) para una empresa.
// Incluye globales pre-seedeadas (PAS, AIDA, etc.) + custom de la empresa.

export function useCompanyScriptStructures(companyId) {
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setStructures([]); setLoading(false); return; }
    const { data } = await listStructures(companyId);
    setStructures(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`company_script_structures_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_script_structures" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load]);

  return { structures, loading, reload: load };
}
