// Generadores centralizados de URLs del portal.
//
// Tres zonas:
//   /cliente/:slug             → portal cliente (PIN-gated, read-only)
//   /admin                     → portal admin legacy (Supabase auth, App.jsx)
//   /equipo                    → Inforce Central (Supabase auth, módulo equipo)
//
// Toda generación de URLs debe pasar por acá para que cambios de esquema no
// requieran buscar literales dispersos en App.jsx.

// Dónde vive el portal. Estaba escrito a mano en doce lugares —App.jsx, el
// modal de accesos del cliente, los comentarios—, así que mudarlo de dominio
// era buscar literales por todo el repo y olvidarse de dos.
//
// Es una constante y no `window.location.origin` a propósito: estos links se
// COPIAN y se le mandan al cliente por WhatsApp. Generados desde un deploy de
// preview, saldrían apuntando a la URL del preview.
const ORIGIN = import.meta.env.VITE_PUBLIC_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
export const PORTAL_HOST = new URL(ORIGIN).host;

// El sitio de los documentos de plan. Vive aparte (Netlify), y por eso tiene su
// propia mudanza: hasta que `plan.inforceconsulting.com` no esté dado de alta
// allá y resuelto en la DNS, esto NO se cambia o los planes dejan de cargar.
export const PLAN_HOST = PORTAL_HOST;
export const PLAN_ORIGIN = `${ORIGIN}/planes`;

export function getCompanySlug(company) {
  if (!company) return "";
  return company.slug || company.name?.toLowerCase().replace(/\s+/g, "-") || "";
}

// ─── Zona cliente ─────────────────────────────────────────────────────────
export function getClientHomeUrl(slug) {
  return `${ORIGIN}/cliente/${slug}`;
}

export function getClientReportUrl(slug, reportId) {
  return `${ORIGIN}/cliente/${slug}/reporte/${reportId}`;
}

export function clientHomePath(slug) {
  return `/cliente/${slug}`;
}

export function clientReportPath(slug, reportId) {
  return `/cliente/${slug}/reporte/${reportId}`;
}

// ─── Zona admin (App.jsx, legacy) ─────────────────────────────────────────
export function adminHomePath() {
  return "/admin";
}

export function adminCompanyPath(slug) {
  return `/admin/${slug}`;
}

export function adminReportPath(slug, reportId) {
  return `/admin/${slug}/reporte/${reportId}`;
}

export function adminEditReportPath(slug, reportId) {
  return `/admin/${slug}/editar/${reportId}`;
}

export function adminNewReportPath(slug) {
  return `/admin/${slug}/nuevo-reporte`;
}

export function adminSelectReportTypePath(slug) {
  return `/admin/${slug}/tipo-reporte`;
}

export function adminEditCompanyPath(slug) {
  return `/admin/${slug}/editar-empresa`;
}

export function adminNewCompanyPath() {
  return "/admin/nueva-empresa";
}

// ─── Zona equipo (Inforce Central) ────────────────────────────────────────
export const TEAM_PREFIX = "/equipo";

export function teamHomePath() {
  return "/equipo";
}

export function teamCompanyPath(companyId) {
  return `/equipo/empresas/${companyId}`;
}

export function teamCompanyAdsPath(companyId) {
  return `/equipo/empresas/${companyId}/anuncios`;
}

export function teamCompanyWorkspacePath(companyId) {
  return `/equipo/empresas/${companyId}/reportes`;
}

export function teamCompanyWorkspaceReportPath(companyId, reportId) {
  return `/equipo/empresas/${companyId}/reportes/${reportId}`;
}

// Mapeo legacy hash → pathname (para compat redirect en mount).
// Los hashes del equipo (#/<view>/...) se migraron a /equipo/<view>/...
export function legacyHashToPath(hash) {
  const clean = String(hash || "").replace(/^#\/?/, "");
  if (!clean) return null;
  return `${TEAM_PREFIX}/${clean}`;
}
