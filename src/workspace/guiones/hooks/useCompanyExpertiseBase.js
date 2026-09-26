import { useEffect, useState, useCallback } from "react";
import { getExpertiseBase } from "../workspace_guiones_db.js";

export function useCompanyExpertiseBase(companyId) {
  const [expertise, setExpertise] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setExpertise(null); setLoading(false); return; }
    const { data } = await getExpertiseBase(companyId);
    setExpertise(data || null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return { expertise, loading, reload: load };
}
