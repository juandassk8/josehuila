// DB helpers para Platform Feedback.
// Tabla: platform_feedback (creada en db/platform_feedback.sql).
// Storage bucket: feedback-images (público).

import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// Catálogo de secciones — fuente única de verdad para el dropdown del widget
// y los filtros de la vista admin. Si agregás una sección, agregala acá.
export const FEEDBACK_SECTIONS = [
  { key: "warroom",    label: "🏠 War Room",          urlMatchers: ["/equipo/warroom", "/admin/", "/cliente/"] },
  { key: "reportes",   label: "📊 Reportes",          urlMatchers: ["/reporte", "/reportes", "/nuevo-reporte"] },
  { key: "pipeline",   label: "📋 Content Pipeline",  urlMatchers: ["/pipeline"] },
  { key: "despliegue", label: "🎨 Despliegue Creativo", urlMatchers: ["/despliegue"] },
  { key: "guionista",  label: "✍️ Guionista",         urlMatchers: ["/guiones", "/contenido/guiones"] },
  { key: "tareas",     label: "✅ Tareas",            urlMatchers: ["/tareas", "/agenda", "/equipo/tasks"] },
  { key: "equipo",     label: "👥 Equipo",            urlMatchers: ["/equipo/equipo", "/equipo/workspace"] },
  { key: "bug",        label: "🐛 Bug general",       urlMatchers: [] },
  { key: "sugerencia", label: "💡 Sugerencia",        urlMatchers: [] },
];

// Auto-detecta la sección a partir del path actual del browser.
// Devuelve "bug" como fallback (es lo más seguro — usuarios suelen reportar
// bugs y elegirán manualmente si era algo distinto).
export function detectSection(pathname) {
  if (typeof pathname !== "string") return "bug";
  for (const sec of FEEDBACK_SECTIONS) {
    for (const m of sec.urlMatchers) {
      if (pathname.includes(m)) return sec.key;
    }
  }
  return "bug";
}

export function sectionLabel(key) {
  return FEEDBACK_SECTIONS.find((s) => s.key === key)?.label || key;
}

// Sube una imagen al bucket. file = File del input/clipboard/drop.
// Devuelve la URL pública o null si falló.
export async function uploadFeedbackImage(file) {
  if (!file) return null;
  const ext = (file.name?.split(".").pop() || "png").toLowerCase().slice(0, 5);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${ts}_${rand}.${ext}`;
  const { error } = await database.storage
    .from("feedback-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    logger.error("[uploadFeedbackImage] failed:", error);
    return null;
  }
  const { data: pub } = database.storage.from("feedback-images").getPublicUrl(path);
  return pub?.publicUrl || null;
}

// Inserta un feedback. Acepta toda la metadata del reporter — el caller
// (FeedbackWidget) la arma desde el contexto disponible.
export async function submitFeedback(payload) {
  const row = {
    company_id: payload.companyId || null,
    company_name: payload.companyName || null,
    member_id: payload.memberId || null,
    team_member_id: payload.teamMemberId || null,
    reporter_name: payload.reporterName || null,
    reporter_email: payload.reporterEmail || null,
    reporter_role: payload.reporterRole || null,
    section: payload.section || "bug",
    title: payload.title || "(sin título)",
    body: payload.body || null,
    loom_url: payload.loomUrl || null,
    images: payload.images || [],
    url_path: payload.urlPath || null,
    user_agent: payload.userAgent || null,
    viewport: payload.viewport || null,
  };
  const { data, error } = await database
    .from("platform_feedback")
    .insert(row)
    .select()
    .single();
  if (error) {
    logger.error("[submitFeedback] failed:", error);
    throw error;
  }
  return data;
}

// Lista todo el feedback. Para la vista admin. Filtros opcionales.
export async function listFeedback({ status, section, companyId } = {}) {
  let q = database
    .from("platform_feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (section) q = q.eq("section", section);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) {
    logger.error("[listFeedback] failed:", error);
    return [];
  }
  return data || [];
}

// Cambia status + notas del admin. resolved_at se setea cuando status == resolved.
export async function updateFeedbackStatus(id, { status, admin_notes }) {
  const patch = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    patch.status = status;
    patch.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  }
  if (admin_notes !== undefined) patch.admin_notes = admin_notes;
  const { data, error } = await database
    .from("platform_feedback")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    logger.error("[updateFeedbackStatus] failed:", error);
    throw error;
  }
  return data;
}

export async function deleteFeedback(id) {
  const { error } = await database.from("platform_feedback").delete().eq("id", id);
  if (error) throw error;
}
