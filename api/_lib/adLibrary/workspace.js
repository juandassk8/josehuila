import { AuthError } from '../auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function workspaceParams(companyId, userId, query) {
  const invalid = () => { throw new AuthError(400, 'Filtro de biblioteca inválido'); };
  const status = query.status || 'all', format = query.format || 'all', sort = query.sort || 'newest';
  const search = String(query.search || '').trim(), groupType = query.groupType || '', groupValue = String(query.groupValue || '');
  if (!['active', 'historical', 'all'].includes(status) || !['all', 'video', 'image', 'carousel'].includes(format) ||
    !['newest', 'longest'].includes(sort) || search.length > 120 || !['', 'landing', 'hook', 'launch', 'domain'].includes(groupType) ||
    groupValue.length > 2048 || (query.brandId && !uuid.test(query.brandId))) invalid();
  return { p_company: companyId, p_user: userId, p_brand: query.brandId || null, p_status: status,
    p_search: search, p_format: format, p_saved: query.saved === 'true', p_group_type: groupType, p_group_value: groupValue };
}

export function readCursor(raw, sort) {
  if (!raw) return { p_after: null, p_after_id: null };
  try {
    if (String(raw).length > 300) throw new Error();
    const cursor = JSON.parse(Buffer.from(String(raw), 'base64url').toString());
    if (!Number.isFinite(cursor.value) || !uuid.test(cursor.id) || cursor.sort !== sort) throw new Error();
    return { p_after: cursor.value, p_after_id: cursor.id };
  } catch { throw new AuthError(400, 'Cursor inválido'); }
}
