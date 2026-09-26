// ── SUPABASE DATA LAYER ──────────────────────────────────────────────────────
// Extraído de App.jsx (refactor God-component). sbFetch hace las llamadas REST
// a PostgREST respetando la RLS; el resto son helpers CRUD sobre companies/reports.
import { database, BACKEND_URL, BACKEND_ANON_KEY } from "./backend.js";
import { logger } from "./logger.js";

export async function sbFetch(path, options = {}) {
  // Si hay sesión Supabase, mandamos su JWT en Authorization (no la anon key),
  // para que PostgREST evalúe la RLS como el usuario logueado. Sin sesión (aún)
  // cae a la anon key. Requerido para que companies/reports respeten la RLS.
  let bearer = BACKEND_ANON_KEY;
  try {
    const { data } = await database.auth.getSession();
    if (data?.session?.access_token) bearer = data.session.access_token;
  } catch { /* sin sesión → anon */ }
  const res = await fetch(BACKEND_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      "apikey": BACKEND_ANON_KEY,
      "Authorization": "Bearer " + bearer,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    logger.error("Supabase error:", err);
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export async function dbGetCompanies() {
  const rows = await sbFetch("companies?select=*&order=created_at.asc");
  if (!rows) return [];
  return rows.map(r => ({
    ...r,
    objectives: r.objectives || {},
    reports: [],
  }));
}

export async function dbGetReports(companyId) {
  const rows = await sbFetch("reports?company_id=eq." + companyId + "&order=created_at.desc");
  if (!rows) return [];
  return rows.map(r => ({ id: r.id, ...r.data, createdAt: r.created_at }));
}

export async function dbSaveCompany(company) {
  const payload = {
    id: company.id,
    name: company.name,
    slug: company.name.toLowerCase().replace(/\s+/g, "-"),
    email: (company.email || "").trim().toLowerCase() || null,
    objectives: company.objectives || {},
  };
  await sbFetch("companies", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify(payload),
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
  });
}

export async function dbSaveReport(companyId, report) {
  const payload = {
    id: String(report.id),
    company_id: companyId,
    period: report.period || "",
    data: report,
  };
  await sbFetch("reports", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify(payload),
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
  });
}

export async function dbDeleteCompany(companyId) {
  await sbFetch("companies?id=eq." + companyId, { method: "DELETE", prefer: "return=minimal" });
}

// Toggle archive flag — soft hide en panel general. Reversible vía
// "Ver archivadas (N)". Ver db/companies_archived.sql para la columna.
export async function dbSetCompanyArchived(companyId, archived) {
  await sbFetch("companies?id=eq." + companyId, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ archived: !!archived }),
  });
}

export async function dbDeleteReport(reportId) {
  await sbFetch("reports?id=eq." + reportId, { method: "DELETE", prefer: "return=minimal" });
}
