import { useEffect, useState, useCallback } from "react";
import { getVoiceProfile, getExpertiseBase } from "../data/guionesDb.js";

export function useVoiceProfile() {
  const [voice, setVoice] = useState(null);
  const [expertise, setExpertise] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [vRes, eRes] = await Promise.all([getVoiceProfile(), getExpertiseBase()]);
    setVoice(vRes.data || null);
    setExpertise(eRes.data || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { voice, expertise, loading, reload: load };
}
