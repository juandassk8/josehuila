import { useEffect, useState, useCallback } from "react";
import { getVoiceProfile } from "../workspace_guiones_db.js";

export function useCompanyVoiceProfile(companyId) {
  const [voice, setVoice] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setVoice(null); setLoading(false); return; }
    const { data } = await getVoiceProfile(companyId);
    setVoice(data || null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return { voice, loading, reload: load };
}
