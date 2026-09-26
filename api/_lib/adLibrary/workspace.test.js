import { expect, it } from 'vitest';
import { readCursor, workspaceParams } from './workspace.js';

it('rejects a cursor from another sort and malformed identifiers before interpolating a database filter', () => {
  const cursor = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  expect(() => readCursor(cursor({ value: 10, id: '00000000-0000-0000-0000-000000000001', sort: 'newest' }), 'longest')).toThrow('Cursor inválido');
  expect(() => readCursor(cursor({ value: 10, id: 'x),status.eq.active', sort: 'newest' }), 'newest')).toThrow('Cursor inválido');
  expect(readCursor(cursor({ value: 10, id: '00000000-0000-0000-0000-000000000001', sort: 'longest' }), 'longest')).toEqual({ p_after: 10, p_after_id: '00000000-0000-0000-0000-000000000001' });
});

it('keeps company/user scope on every query and bounds search input', () => {
  expect(workspaceParams('company', 'user', { saved: 'true', search: '  50% _ ' })).toMatchObject({ p_company: 'company', p_user: 'user', p_saved: true, p_search: '50% _' });
  expect(() => workspaceParams('company', 'user', { search: 'x'.repeat(121) })).toThrow();
  expect(() => workspaceParams('company', 'user', { sort: 'spend' })).toThrow();
});
