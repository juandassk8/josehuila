import { MetaOfficialCollector } from './metaOfficial.js';
import { MetaWebCollector } from './metaWeb.js';

export function createCollector(source) {
  if (source === 'meta_web') return new MetaWebCollector();
  if (source === 'meta_official') return new MetaOfficialCollector();
  throw new Error('UNSUPPORTED_COLLECTOR');
}
