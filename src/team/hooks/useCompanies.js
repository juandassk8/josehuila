import { useEffect, useState, useCallback } from "react";
import { listCompanies, listReportsDates } from "../data/db.js";

export function useCompanies() {
  const [companies, setCompanies] = useState([]);
  const [reportsByCompany, setReportsByCompany] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cRes, rRes] = await Promise.all([listCompanies(), listReportsDates()]);
    setCompanies(cRes.data || []);

    const map = {};
    (rRes.data || []).forEach((r) => {
      if (!map[r.company_id]) map[r.company_id] = r.created_at;
    });
    setReportsByCompany(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { companies, lastReportByCompany: reportsByCompany, loading, reload: load };
}
