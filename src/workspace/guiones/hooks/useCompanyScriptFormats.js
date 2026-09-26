import { useEffect, useState, useCallback } from "react";
import { database } from "../../../lib/backend.js";
import { listFormats } from "../workspace_guiones_db.js";

export function useCompanyScriptFormats(companyId) {
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setFormats([]); setLoading(false); return; }
    const { data } = await listFormats(companyId);
    setFormats(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const channel = database
      .channel(`company_script_formats_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_script_formats" }, () => load())
      .subscribe();
    return () => database.removeChannel(channel);
  }, [companyId, load]);

  return { formats, loading, reload: load };
}
