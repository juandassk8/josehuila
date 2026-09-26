import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

// Helper: convierte el { data, error } de Supabase en throw-on-error.
// Crítico: si NO tiramos error, los handlers ignoran el fallo y la UI
// cree que se guardó. Bug del 2026-04-23 — usuarios perdían trabajo
// porque inserts fallaban silenciosamente (enum value, missing column,
// RLS, etc.) sin que nadie se enterara.
function unwrap(label) {
  return ({ data, error }) => {
    if (error) {
      logger.error(`[trackingDb] ${label} failed:`, error);
      const msg = error.message || error.code || "Error desconocido";
      throw new Error(`${label}: ${msg}`);
    }
    return data;
  };
}

// ---- Content milestones ----
export async function listContentMilestones(weekStartISO) {
  // listSomething sigue retornando { data, error } para no romper callers.
  return database
    .from("content_milestones")
    .select("*")
    .eq("week_start", weekStartISO)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function createContentMilestone(payload) {
  return database
    .from("content_milestones")
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single()
    .then(unwrap("crear hito de contenido"));
}

export async function updateContentMilestone(id, patch) {
  return database
    .from("content_milestones")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
    .then(unwrap("actualizar hito de contenido"));
}

export async function deleteContentMilestone(id) {
  return database
    .from("content_milestones")
    .delete()
    .eq("id", id)
    .then(unwrap("eliminar hito de contenido"));
}

// ---- Performance reports ----
export async function listPerformanceReports(weekStartISO, weekEndISO) {
  return database
    .from("performance_reports")
    .select("*")
    .gte("report_date", weekStartISO)
    .lte("report_date", weekEndISO)
    .order("report_date", { ascending: true });
}

export async function upsertPerformanceReport(payload) {
  return database
    .from("performance_reports")
    .upsert(
      { ...payload, updated_at: new Date().toISOString() },
      { onConflict: "company_id,report_date,report_type" }
    )
    .select()
    .single()
    .then(unwrap("guardar reporte de performance"));
}

export async function deletePerformanceReport(id) {
  return database
    .from("performance_reports")
    .delete()
    .eq("id", id)
    .then(unwrap("eliminar reporte de performance"));
}

// ---- SLA Support ----
export async function listSlaSupport(weekStartISO, weekEndISO) {
  return database
    .from("sla_support")
    .select("*")
    .gte("day_date", weekStartISO)
    .lte("day_date", weekEndISO)
    .order("day_date", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function createSlaItem(payload) {
  return database
    .from("sla_support")
    .insert(payload)
    .select()
    .single()
    .then(unwrap("crear duda SLA"));
}

export async function updateSlaItem(id, patch) {
  return database
    .from("sla_support")
    .update(patch)
    .eq("id", id)
    .select()
    .single()
    .then(unwrap("actualizar duda SLA"));
}

export async function deleteSlaItem(id) {
  return database
    .from("sla_support")
    .delete()
    .eq("id", id)
    .then(unwrap("eliminar duda SLA"));
}

// ---- Auto-fill from legacy companies/reports tables ----
// Devuelve { company, recentReports } — usado para prefill de PerformanceReportModal.
export async function getCompanyTrackingContext(companyId) {
  const [companyRes, reportsRes] = await Promise.all([
    database
      .from("companies")
      .select("id, name, objectives")
      .eq("id", companyId)
      .maybeSingle(),
    database
      .from("reports")
      .select("id, data, period, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  return {
    company: companyRes.data || null,
    recentReports: reportsRes.data || [],
  };
}

