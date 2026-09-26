import { describe, it, expect, vi } from 'vitest';
import { creativeService } from './service.js';

const actor = { user_id: 'u-a', company_id: 'company-a' };
const reference = { id: 'ref-a', media: [{ object_key: 'private/key', mime_type: 'image/png' }] };
const product = { id: 'p-a', name: 'Producto real', benefit: 'Beneficio aprobado', documents: [{ secret_url: 'private' }] };
const input = { reference_id: 'ref-a', product_id: 'p-a', title: 'Mi creativo', image: { file_id: 'file-a', download_url: 'https://example.com/a.png' } };
function fixture({ allowed = true, existing, locked = true } = {}) {
  const connection = { release: vi.fn(), query: vi.fn(async sql => {
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked }] };
    if (sql.includes('source_file_id')) return { rows: existing ? [existing] : [] };
    if (sql.includes('count(*)')) return { rows: [{ total: 0 }] };
    return { rows: [] };
  }) };
  const db = { connect: async () => connection, query: vi.fn(async sql => {
    if (sql.includes('creative_company_access')) return { rows: [{ allowed }] };
    if (sql.includes('creative_context')) return { rows: [{ context: { company: { id: actor.company_id }, references: [reference], products: [product] } }] };
    return { rows: [] };
  }) };
  const storage = { put: vi.fn(async () => ({ sha256: 'hash', objectKey: 'stored', bytes: 100, mimeType: 'image/png' })),
    read: vi.fn(async () => Buffer.from('image')), close: vi.fn() };
  const receive = vi.fn(async () => ({ buffer: Buffer.from('image'), mimeType: 'image/png' }));
  return { service: creativeService({ db, storageFactory: () => storage, receive }), db, connection, storage, receive };
}
describe('creative storage boundaries', () => {
  it('rejects a foreign reference before downloading or writing bytes', async () => {
    const f = fixture();
    await expect(f.service.save(actor, { ...input, reference_id: 'other-company-ref' })).rejects.toMatchObject({ status: 404 });
    expect(f.receive).not.toHaveBeenCalled(); expect(f.storage.put).not.toHaveBeenCalled();
  });
  it('rejects a foreign product before downloading', async () => {
    const f = fixture(); await expect(f.service.save(actor, { ...input, product_id: 'foreign-product' })).rejects.toMatchObject({ status: 404 });
    expect(f.receive).not.toHaveBeenCalled();
  });
  it('blocks disconnected company access', async () => {
    const f = fixture({ allowed: false }); await expect(f.service.save(actor, input)).rejects.toMatchObject({ status: 403 });
    expect(f.receive).not.toHaveBeenCalled();
  });
  it('returns a retried file without a second R2 write', async () => {
    const f = fixture({ existing: { id: 'image-a', ad_id: 'ref-a', product_id: 'p-a', title: 'Mi creativo' } });
    expect(await f.service.save(actor, input)).toMatchObject({ id: 'image-a', already_saved: true });
    expect(f.storage.put).not.toHaveBeenCalled(); expect(f.receive).not.toHaveBeenCalled();
  });
  it('serializes saves for one company', async () => {
    const f = fixture({ locked: false }); await expect(f.service.save(actor, input)).rejects.toMatchObject({ status: 429 });
    expect(f.receive).not.toHaveBeenCalled(); expect(f.connection.query).toHaveBeenCalledWith('rollback');
  });
  it('persists only the authorized company and product with content addressed storage', async () => {
    const f = fixture(); expect(await f.service.save(actor, input)).toMatchObject({ saved: true, already_saved: false });
    const call = f.connection.query.mock.calls.find(([sql]) => sql.startsWith('insert into'));
    expect(call[1].slice(1, 7)).toEqual(['company-a','u-a','ref-a','p-a','Producto real','Mi creativo']);
    expect(f.storage.close).toHaveBeenCalled(); expect(f.connection.release).toHaveBeenCalled();
  });
  it('includes existing flat product fields but excludes document links', async () => {
    const f = fixture(); const result = await f.service.brief(actor, input);
    expect(result.data.product.benefit).toBe('Beneficio aprobado'); expect(result.data.product.documents).toBeUndefined();
  });
});
