import { createHash } from 'node:crypto';

export class ProxyCooldowns {
  constructor(now = Date.now) { this.now = now; this.until = new Map(); }
  key(proxy) { return createHash('sha256').update(JSON.stringify([proxy?.server || 'direct', proxy?.username || ''])).digest('hex'); }
  remaining(proxy) {
    const key = this.key(proxy);
    const remaining = Math.max(0, (this.until.get(key) || 0) - this.now());
    if (!remaining) this.until.delete(key);
    return remaining;
  }
  block(proxy, duration) { this.until.set(this.key(proxy), this.now() + Math.max(duration, this.remaining(proxy))); }
}

// Use the worker's existing Redis connection. No addresses/credentials in keys.
export class RedisProxyCooldowns extends ProxyCooldowns {
  constructor(redis) { super(); this.redis = redis; }
  async remaining(proxy) { return Math.max(0, await this.redis.pttl(`adlib:proxy-cooldown:${this.key(proxy)}`)); }
  async block(proxy, duration) {
    await this.redis.eval(`local ttl = redis.call('PTTL', KEYS[1])
      if ttl < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end
      return 1`, 1, `adlib:proxy-cooldown:${this.key(proxy)}`, Math.ceil(duration));
  }
}
