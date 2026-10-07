// Versioned heuristic, not an estimate of impressions, spend, sales or ROAS.
export const SIGNAL_VERSION = 1;
const DAY = 86400000;
const clamp = n => Math.max(0, Math.min(100, n));
export function verifiedImpressionOrder(postData) {
  try {
    const variables = JSON.parse(new URLSearchParams(postData).get('variables') || '{}');
    const stack = [variables]; let visited = 0;
    while (stack.length && ++visited < 10000) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      for (const key of ['sort_data', 'sortData']) {
        const order = node[key];
        if (String(order?.mode).toLowerCase() === 'total_impressions' && ['desc', 'descending'].includes(String(order.direction).toLowerCase())) return true;
      }
      stack.push(...Object.values(node).filter(v => v && typeof v === 'object'));
    }
  } catch { /* Unverified ordering cannot contribute to a signal. */ }
  return false;
}

export function buildSignals(snapshots, { now = Date.now() } = {}) {
  const days = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot || snapshot.active_status !== 'active' || snapshot.ordering !== 'total_impressions_desc_request' || !Array.isArray(snapshot.entries) || snapshot.entries.length < 5) continue;
    if (snapshot.entries.some(e => !/^\d+$/.test(e?.id || '') || !Number.isFinite(e.rank) || e.rank < 1 || e.rank > snapshot.entries.length)
      || new Set(snapshot.entries.map(e => e.id)).size !== snapshot.entries.length) continue;
    const time = Date.parse(snapshot.observed_at);
    if (!Number.isFinite(time) || time > now || now - time > 21 * DAY) continue;
    const day = new Date(time).toISOString().slice(0, 10);
    if (!days.has(day) || Date.parse(days.get(day).observed_at) < time) days.set(day, snapshot);
  }
  const series = [...days.values()].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const latest = series.at(-1);
  if (!latest) return { version: SIGNAL_VERSION, ads: [], reason: 'no_comparable_snapshot', days: 0 };
  const country = latest.country;
  const comparable = series.filter(s => s.country === country);
  const daily = comparable.map(s => ({ ...s, byId: new Map(s.entries.map(entry => [entry.id, entry])) }));
  const percentile = (entry, snapshot) => clamp(100 * (snapshot.entries.length - entry.rank) / (snapshot.entries.length - 1));
  const ads = latest.entries.map(entry => {
    const history = daily.filter(s => s.byId.has(entry.id)).map(s => {
      const observed = s.byId.get(entry.id);
      return { date: s.observed_at, position: observed.rank, total: s.entries.length, percentile: Math.round(percentile(observed, s)) };
    });
    const position = percentile(entry, latest), previous = history.at(-2);
    const delta = previous ? position - previous.percentile : null;
    const age = entry.startedAt ? (Date.parse(latest.observed_at) - Date.parse(entry.startedAt)) / DAY : null;
    const ageDays = Number.isFinite(age) && age >= 0 ? Math.floor(age) : null;
    const freshness = ageDays === null ? null : position * Math.exp(-ageDays / 14);
    // Missing history/age contributes no invented neutral evidence; reweight available components.
    const components = [[position, .65], ...(delta === null ? [] : [[clamp(50 + delta), .20]]), ...(freshness === null ? [] : [[freshness, .15]])];
    const score = Math.round(components.reduce((n, [v, w]) => n + v * w, 0) / components.reduce((n, [, w]) => n + w, 0));
    const priorHistory = history.slice(0, -1);
    const rebound = position >= 70 && priorHistory.some((point, i) => point.percentile <= 40 && priorHistory.slice(0, i).some(p => p.percentile >= 70));
    let state = 'primera_observacion';
    if (rebound) state = 'retoma_posiciones';
    else if (ageDays !== null && ageDays <= 7 && position >= 80) state = 'nuevo_destacado';
    else if (delta !== null && delta >= 15) state = 'en_ascenso';
    else if (delta !== null && delta <= -15) state = 'pierde_posiciones';
    else if (history.length >= 3 && history.slice(-3).every(p => p.percentile >= 70)) state = 'posicion_sostenida';
    else if (history.length >= 2) state = 'sin_cambio_destacado';
    return { source_ad_id: entry.id, score, state, position: entry.rank, total: latest.entries.length,
      percentile: Math.round(position), delta: delta === null ? null : Math.round(delta), ageDays, observedDays: history.length, history };
  }).sort((a, b) => b.score - a.score || a.position - b.position || a.source_ad_id.localeCompare(b.source_ad_id));
  return { version: SIGNAL_VERSION, observedAt: latest.observed_at, country, days: comparable.length,
    stale: now - Date.parse(latest.observed_at) > 2 * DAY, ads };
}

export async function saveSignalSnapshot(client, brand, run, completion, collectionMethod) {
  const ranking = completion?.ranking;
  if (collectionMethod !== 'live' || completion.engine !== 'meta_web' || completion.activeStatus !== 'active'
    || ranking?.ordering !== 'total_impressions_desc_request' || !Array.isArray(ranking.entries)
    || ranking.entries.length < 5 || ranking.entries.length > 10000) return false;
  const response = await client.from('ad_library_signal_days').upsert({
    brand_id: brand.id, run_id: run.id, observed_day: new Date(run.started_at).toISOString().slice(0, 10), observed_at: run.started_at,
    country: completion.country, active_status: 'active', ordering: ranking.ordering, entries: ranking.entries,
  }, { onConflict: 'brand_id,observed_day,country' });
  if (response.error) throw Error('SIGNAL_SNAPSHOT_FAILED');
  return true;
}
