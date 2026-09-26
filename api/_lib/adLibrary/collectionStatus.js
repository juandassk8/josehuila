// Distinguish an unstarted import from a successful crawl with no matching ads.
export function collectionStatus(brand, queue, run = null) {
  const pending = ['waiting', 'waiting-children', 'delayed', 'prioritized', 'active'].includes(queue.job?.state);
  let phase;
  if (!queue.available || !queue.workers) phase = 'unavailable';
  else if (queue.job?.state === 'active') phase = 'running';
  else if (queue.paused) phase = 'paused';
  else if (queue.retryAt && (pending || !brand.last_complete_scan_at)) phase = 'rate_limited';
  else if (queue.job?.state === 'delayed') phase = 'retrying';
  else if (pending) phase = 'queued';
  else if (run?.status === 'failed' || brand.last_crawl_status === 'failed') phase = 'failed';
  else if (brand.last_complete_scan_at) phase = 'ready';
  else phase = 'pending';
  return {
    phase, hasCompleteScan: !!brand.last_complete_scan_at,
    queued: pending, retryAt: phase === 'rate_limited' ? queue.retryAt : null,
    nextScheduledAt: brand.next_crawl_at || null,
    lastCompleteAt: brand.last_complete_scan_at || null,
    errorCode: run?.error_code || null,
    progress: queue.job?.state === 'active' ? queue.job.progress || null : null,
    // Exclude moving cooldown TTLs so polling does not reset pagination.
    revision: [run?.id, run?.status, run?.ads_seen, run?.finished_at, brand.last_complete_scan_at].filter(value => value != null).join('|'),
  };
}
