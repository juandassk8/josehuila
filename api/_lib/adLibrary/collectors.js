import { MetaOfficialCollector } from './metaOfficial.js';
import { MetaWebCollector } from './metaWeb.js';
import { ScraplingCollector } from './scrapling.js';
import { CollectorCoordinator } from './collectorContract.js';

export function createCollector(source, { onAttempt, proxyCooldowns, proxies, settings, env = process.env } = {}) {
  if (source === 'meta_web') {
    const primary = new MetaWebCollector({ proxyCooldowns, proxies });
    const collectors = [{ engine: 'meta_web', create: () => primary }];
    if (env.ADLIB_SCRAPLING_ENABLED === 'true' && settings?.scrapling_enabled !== false) collectors.push({ engine: 'scrapling', create: () => new ScraplingCollector({
      endpoint: env.ADLIB_SCRAPLING_URL, token: env.ADLIB_SCRAPLING_TOKEN,
      proxies: primary.proxies, proxyCooldowns: primary.proxyCooldowns,
    }) });
    return new CollectorCoordinator(collectors, { onAttempt });
  }
  if (source === 'meta_official') return new CollectorCoordinator([{ engine: 'meta_official', create: () => new MetaOfficialCollector() }], { onAttempt });
  throw new Error('UNSUPPORTED_COLLECTOR');
}
