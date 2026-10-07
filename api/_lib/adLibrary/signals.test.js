import { describe, it, expect, vi } from 'vitest';
import { buildSignals, saveSignalSnapshot, verifiedImpressionOrder } from './signals.js';
const snapshot = (day, rank = 1, extra = {}) => ({ country: 'ALL', active_status: 'active', ordering: 'total_impressions_desc_request',
  observed_at: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`,
  entries: Array.from({ length: 10 }, (_, i) => ({ id: String(100000 + i), rank: i === 0 ? rank : i + 1, startedAt: '2026-10-01T12:00:00Z' })), ...extra });
const options = { now: Date.parse('2026-10-10T12:00:00Z') };
const first = values => buildSignals(values, options).ads.find(ad => ad.source_ad_id === '100000');
describe('relative daily creative signals', () => {
  it('requires explicit impression sorting in request variables, not unrelated words or the URL alone', () => {
    expect(verifiedImpressionOrder('sort_data[mode]=total_impressions')).toBe(false);
    expect(verifiedImpressionOrder(new URLSearchParams({ variables: JSON.stringify({ sortData: { mode: 'TOTAL_IMPRESSIONS', direction: 'DESC' } }) }).toString())).toBe(true);
    expect(verifiedImpressionOrder(new URLSearchParams({ variables: JSON.stringify({ sortData: { mode: 'TOTAL_IMPRESSIONS', direction: 'ASC' } }) }).toString())).toBe(false);
  });
  it('does not invent scores from unknown order, historic imports, tiny cohorts, corrupt ranks or future data', () => {
    for (const value of [snapshot(9, 1, { ordering: null }), snapshot(9, 1, { active_status: 'all' }), snapshot(9, 1, { entries: [] }), snapshot(11), snapshot(9, 0)]) expect(buildSignals([value], options).ads).toEqual([]);
  });
  it('uses one observation per day and does not create trends from repeated hourly scans', () => {
    const value = first([snapshot(8, 1), { ...snapshot(8, 2), observed_at: '2026-10-08T18:00:00Z' }]);
    expect(value.observedDays).toBe(1); expect(value.delta).toBe(null); expect(value.position).toBe(2);
  });
  it('identifies rise, fall and recovery without treating missing days as zero', () => {
    expect(first([snapshot(1, 9), snapshot(9, 2)]).state).toBe('en_ascenso');
    expect(first([snapshot(1, 1), snapshot(9, 9)]).state).toBe('pierde_posiciones');
    expect(first([snapshot(1, 1), snapshot(3, 9), snapshot(9, 2)]).state).toBe('retoma_posiciones');
    expect(first([snapshot(1), snapshot(9)]).history).toHaveLength(2);
  });
  it('distinguishes actual launch from first observation and keeps missing dates unknown', () => {
    expect(first([snapshot(2)]).state).toBe('nuevo_destacado');
    const old = snapshot(9); old.entries[0].startedAt = '2025-01-01T00:00:00Z';
    expect(first([old]).state).toBe('primera_observacion');
    old.entries[0].startedAt = null;
    expect(first([old])).toMatchObject({ ageDays: null, score: 100, delta: null });
  });
  it('compares only within country, bounds scores and labels stale evidence', () => {
    const data = buildSignals([snapshot(1, 9, { country: 'CO' }), snapshot(5, 1)], options);
    expect(data.stale).toBe(true); expect(data.days).toBe(1);
    expect(data.ads.every(ad => ad.score >= 0 && ad.score <= 100)).toBe(true);
    expect(data.ads[0].delta).toBe(null);
  });
  it('does not write rankings for partial, different-engine or all-status collections', async () => {
    const from = vi.fn();
    for (const completion of [{}, { engine: 'scrapling' }, { engine: 'meta_web', activeStatus: 'all' }])
      expect(await saveSignalSnapshot({ from }, {}, {}, completion, 'live')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
  it('stores the UTC day even when PostgreSQL returns a local offset near midnight', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    await saveSignalSnapshot({ from: () => ({ upsert }) }, { id: 'brand' }, { id: 'run', started_at: '2026-10-07T00:30:00+02:00' },
      { engine: 'meta_web', activeStatus: 'active', country: 'ALL', ranking: { ordering: 'total_impressions_desc_request', entries: snapshot(6).entries } }, 'live');
    expect(upsert.mock.calls[0][0].observed_day).toBe('2026-10-06');
  });
});
