import { describe, expect, it } from 'vitest';
import { metaRateLimitError, rateLimitDelayMs, sourceCooldownMs, retryAfterMs } from './retryPolicy.js';

describe('source retry policy', () => {
  it('preserves longer source waits expressed as seconds or HTTP dates', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(retryAfterMs('7200', now)).toBe(7_200_000);
    expect(retryAfterMs('Mon, 28 Sep 2026 14:00:00 GMT', now)).toBe(7_200_000);
    for (const value of [null, '', 'invalid', '0', '-1', 'Mon, 28 Sep 2026 11:00:00 GMT'])
      expect(retryAfterMs(value, now)).toBeUndefined();
  });
  it('uses fifteen minutes instead of six hours and permits a bounded configuration', () => {
    expect(sourceCooldownMs({})).toBe(900_000);
    expect(sourceCooldownMs({ ADLIB_RATE_LIMIT_COOLDOWN_SECONDS: '60' })).toBe(60_000);
    expect(sourceCooldownMs({ ADLIB_RATE_LIMIT_COOLDOWN_SECONDS: '3600' })).toBe(3_600_000);
    for (const seconds of ['0', '-1', '59', '3601', 'NaN', '', '90.5']) {
      expect(sourceCooldownMs({ ADLIB_RATE_LIMIT_COOLDOWN_SECONDS: seconds })).toBe(900_000);
    }
  });
  it('preserves a remaining route cooldown rather than starting it over', () => {
    const error = metaRateLimitError(1234.5);
    expect(error.message).toBe('META_RATE_LIMITED');
    expect(rateLimitDelayMs(error)).toBe(1235);
    expect(metaRateLimitError(0).retryAfterMs).toBe(900_000);
    expect(metaRateLimitError(Infinity).retryAfterMs).toBe(900_000);
  });
});
