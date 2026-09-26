import { describe, expect, it } from 'vitest';
import { metaRateLimitError, rateLimitDelayMs, sourceCooldownMs } from './retryPolicy.js';

describe('source retry policy', () => {
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
