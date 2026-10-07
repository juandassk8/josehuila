import { describe, expect, it, vi } from 'vitest';
import { ProxyCooldowns, RedisProxyCooldowns } from './proxyCooldowns.js';

describe('shared proxy pauses', () => {
  const proxy = { server: 'http://private.example:1234', username: 'secret-user' };
  it('retains the longer pause and expires using remaining time', () => {
    let now = 100;
    const state = new ProxyCooldowns(() => now);
    state.block(proxy, 1000);
    now += 500;
    state.block(proxy, 10);
    expect(state.remaining(proxy)).toBe(500);
    now += 500;
    expect(state.remaining(proxy)).toBe(0);
  });
  it('uses the same opaque persisted key across collectors and reconstructed workers', async () => {
    const redis = { pttl: vi.fn(async () => 1500), eval: vi.fn() };
    const first = new RedisProxyCooldowns(redis), restarted = new RedisProxyCooldowns(redis);
    await first.block(proxy, 2000);
    expect(await restarted.remaining(proxy)).toBe(1500);
    expect(redis.eval.mock.calls[0][2]).toBe(redis.pttl.mock.calls[0][0]);
    expect(redis.pttl.mock.calls[0][0]).toMatch(/^adlib:proxy-cooldown:[a-f0-9]{64}$/);
    expect(redis.eval.mock.calls[0][3]).toBe(2000);
  });
  it('fails closed when persisted route state cannot be read', async () => {
    const state = new RedisProxyCooldowns({ pttl: async () => { throw new Error('REDIS_UNAVAILABLE'); } });
    await expect(state.remaining(proxy)).rejects.toThrow('REDIS_UNAVAILABLE');
  });
});
