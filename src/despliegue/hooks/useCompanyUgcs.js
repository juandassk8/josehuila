// Lista reactiva de UGCs/diseñadores de una empresa. Realtime suscripción a
// company_ugcs para que el "+ Nuevo" inline aparezca sin refrescar.

import { useCallback, useEffect, useState } from "react";
import { database } from "../../lib/backend.js";
import { listUgcsForCompany } from "../ugcs_db.js";

export function useCompanyUgcs(companyId, kind) {
  const [ugcs, setUgcs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setUgcs([]); setLoading(false); return; }
    const { data } = await listUgcsForCompany(companyId, { kind });
    setUgcs(data || []);
    setLoading(false);
  }, [companyId, kind]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`company_ugcs_${companyId}_${kind || "all"}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "company_ugcs", filter: `company_id=eq.${companyId}` },
        () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, kind, load]);

  return { ugcs, loading, reload: load };
}
