import { useEffect, useState, useCallback } from "react";
import { useCompanyId } from "../context.js";
import { getVoiceProfile, getExpertiseBase } from "../workspace_guiones_db.js";

// Wrapper con la misma firma que src/team/hooks/useVoiceProfile.js:
// devuelve { voice, expertise, loading, reload } — pero scoped al context.
export function useVoiceProfile() {
  const companyId = useCompanyId();
  const [voice, setVoice] = useState(null);
  const [expertise, setExpertise] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    const [vRes, eRes] = await Promise.all([getVoiceProfile(companyId), getExpertiseBase(companyId)]);
    setVoice(vRes.data || null);
    setExpertise(eRes.data || null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return { voice, expertise, loading, reload: load };
}
