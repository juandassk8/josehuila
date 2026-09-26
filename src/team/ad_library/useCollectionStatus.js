import { useEffect, useState } from 'react';
import { request } from './workspaceHelpers.js';
import { collectionPollDelay, collectionRevision } from './collectionState.js';

export function useCollectionStatus(companyId, brandId, refresh, onChange) {
  const [snapshot, setSnapshot] = useState(null);
  const key = `${companyId}:${brandId}`;
  useEffect(() => {
    if (!companyId || !brandId) return;
    let cancelled = false, inFlight = false, timer, previous;
    async function poll() {
      clearTimeout(timer);
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      let delay = 60_000;
      try {
        const status = await request('GET', { action: 'collection', companyId, brandId });
        if (cancelled) return;
        setSnapshot({ key, status });
        const next = collectionRevision(status);
        onChange(previous !== next); previous = next;
        delay = collectionPollDelay(status);
      } catch {
        if (!cancelled) setSnapshot(current => ({ key, status: current?.key === key
          ? { ...current.status, stale: true } : { phase: 'unavailable', stale: true } }));
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(poll, delay);
      }
    }
    const onVisibility = () => { if (!document.hidden) poll(); else clearTimeout(timer); };
    poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [companyId, brandId, key, refresh, onChange]);
  return snapshot?.key === key ? snapshot.status : null;
}
