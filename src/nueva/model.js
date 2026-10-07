export const AUTH_ROUTES = new Set(['login', 'registro', 'recuperar']);
export function safeReturnPath(value) {
  if (typeof value !== 'string' || !/^\/nueva(?:\/|$)/.test(value) || /[\\\r\n]/.test(value)) return '/nueva';
  try {
    const url = new URL(value, 'https://inforce.invalid');
    if (url.origin !== 'https://inforce.invalid' || !/^\/nueva(?:\/|$)/.test(url.pathname)) return '/nueva';
    if (AUTH_ROUTES.has(url.pathname.split('/')[2])) return '/nueva';
    return url.pathname + url.search;
  } catch { return '/nueva'; }
}
export function isPlatformAdmin(member) { return member?.active !== false && member?.role === 'admin'; }
export function canManageBrand(company, user, member, memberships = []) {
  if (member?.active !== false && ['admin', 'member'].includes(member?.role)) return true;
  if (member?.active !== false && member?.id) return false;
  if (company?.owner_user_id === user?.id && user?.id) return true;
  return memberships.some(row => row.company_id === company?.id && row.auth_user_id === user?.id
    && (row.is_owner || row.roles?.includes('project_manager')));
}
export function selectedCompany(companies, requested) {
  return companies.find(row => String(row.id) === String(requested)) || companies[0] || null;
}
export function initials(name) { return String(name || 'I').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
export function publicUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function routeFor(page, companyId) {
  return `/nueva/${page}${companyId ? `?empresa=${encodeURIComponent(companyId)}` : ''}`;
}
