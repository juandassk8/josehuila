import { describe, expect, it } from 'vitest';
import { collectionCopy, collectionNotice, collectionRevision } from './collectionState.js';

describe('collection messaging', () => {
  it('does not promise immediate content when a follow failed to enqueue', () => {
    expect(collectionNotice({ queued: false }, true)).toContain('No se pudo poner la consulta en cola');
    expect(collectionNotice({ queued: false, cached: true }, true)).toContain('biblioteca ya está disponible');
  });
  it('explains shared source waiting without promising a completion time', () => {
    expect(collectionCopy({ phase: 'rate_limited', retryAt: '2026-09-26T07:22:25Z' }).description).toContain('Esa hora no garantiza');
    expect(collectionCopy({ phase: 'running', progress: { adsSeen: 29 } }).description).toContain('29 anuncios recibidos');
  });
  it('refreshes on progress or completion but preserves pagination across idle polls', () => {
    const pending = { phase: 'rate_limited', revision: 'one', retryAt: '2026-09-26T07:22:25Z' };
    expect(collectionRevision(pending)).toBe(collectionRevision({ ...pending, retryAt: '2026-09-26T07:22:26Z' }));
    expect(collectionRevision(pending)).not.toBe(collectionRevision({ ...pending, phase: 'ready' }));
    expect(collectionRevision({ phase: 'running', progress: { adsSeen: 1 } })).not.toBe(collectionRevision({ phase: 'running', progress: { adsSeen: 2 } }));
  });
});
