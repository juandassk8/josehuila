import { database } from "../../lib/backend.js";

// Data layer del módulo Guiones scoped por company_id. Espejo de
// src/team/data/guionesDb.js pero cada query filtra por empresa.

// ---- Formats ----

export async function listFormats(companyId) {
  return database
    .from("company_script_formats")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
}

export async function getFormat(id) {
  return database.from("company_script_formats").select("*").eq("id", id).single();
}

export async function createFormat(companyId, payload) {
  return database
    .from("company_script_formats")
    .insert({ ...payload, company_id: companyId, updated_at: new Date().toISOString() })
    .select()
    .single();
}

export async function updateFormat(id, patch) {
  return database
    .from("company_script_formats")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}

export async function deleteFormat(id) {
  return database.from("company_script_formats").delete().eq("id", id);
}

// ---- Script Structures (frameworks de copy: PAS, AIDA, etc.) ----
// Devuelve globales (company_id null) + custom de la empresa, ambas no archivadas.

export async function listStructures(companyId) {
  const { data, error } = await database
    .from("company_script_structures")
    .select("*")
    .or(`company_id.eq.${companyId},and(is_global.eq.true,company_id.is.null)`)
    .eq("archived", false)
    .order("is_global", { ascending: false })
    .order("name", { ascending: true });
  return { data, error };
}

export async function createStructure(companyId, payload) {
  return database
    .from("company_script_structures")
    .insert({
      ...payload,
      company_id: companyId,
      is_global: false,
      archived: false,
    })
    .select()
    .single();
}

export async function updateStructure(id, patch) {
  return database
    .from("company_script_structures")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
}

export async function archiveStructure(id) {
  return database
    .from("company_script_structures")
    .update({ archived: true })
    .eq("id", id);
}

// Helper: agrega una transcripción como ejemplo a un formato existente.
// El formato tiene `examples jsonb` que es array de {title, transcript, is_own}.
export async function addExampleToFormat(formatId, example) {
  const { data: current, error: gErr } = await database
    .from("company_script_formats")
    .select("examples")
    .eq("id", formatId)
    .single();
  if (gErr) return { error: gErr };
  const next = Array.isArray(current?.examples) ? [...current.examples, example] : [example];
  return database
    .from("company_script_formats")
    .update({ examples: next, updated_at: new Date().toISOString() })
    .eq("id", formatId)
    .select()
    .single();
}

// ---- Voice Profile (single row por empresa) ----

export async function getVoiceProfile(companyId) {
  return database
    .from("company_voice_profile")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
}

// Alias para compatibilidad con components portados del team module.
export async function updateVoiceProfile(companyId, patch) {
  return upsertVoiceProfile(companyId, patch);
}

// Alias para compatibilidad con components portados.
export async function updateExpertiseBase(companyId, patch) {
  return upsertExpertiseBase(companyId, patch);
}

export async function upsertVoiceProfile(companyId, patch) {
  // Upsert atómico sobre company_id (que tiene constraint UNIQUE). Esto es
  // más robusto que el check+insert/update manual (elimina la race y la chance
  // de pisar una fila recién creada). onConflict requiere columna indexada
  // unique — company_id lo es.
  const payload = { company_id: companyId, ...patch, updated_at: new Date().toISOString() };
  return database
    .from("company_voice_profile")
    .upsert(payload, { onConflict: "company_id" })
    .select()
    .single();
}

// ---- Expertise Base (single row por empresa) ----

export async function getExpertiseBase(companyId) {
  return database
    .from("company_expertise_base")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
}

export async function upsertExpertiseBase(companyId, patch) {
  const { data: existing } = await database
    .from("company_expertise_base")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) {
    return database
      .from("company_expertise_base")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
  }
  return database
    .from("company_expertise_base")
    .insert({ company_id: companyId, ...patch })
    .select()
    .single();
}

// ---- Expertise Documents ----

export async function listExpertiseDocs(companyId) {
  return database
    .from("company_expertise_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
}

export async function createExpertiseDoc(companyId, payload) {
  return database
    .from("company_expertise_documents")
    .insert({ ...payload, company_id: companyId })
    .select()
    .single();
}

export async function deleteExpertiseDoc(id) {
  return database.from("company_expertise_documents").delete().eq("id", id);
}

// ---- Scripts ----
// Nota: format_id puede apuntar a despliegue_concepts.id (no a company_script_formats),
// por eso NO hacemos FK join — el FK fue dropped en company_scripts_concept_link.sql.
// El nombre del concepto se resuelve en código vía useFormats/useCompanyConcepts.

export async function listScripts(companyId) {
  return database
    .from("company_scripts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
}

export async function getScript(id) {
  return database
    .from("company_scripts")
    .select("*")
    .eq("id", id)
    .single();
}

export async function createScript(companyId, payload) {
  return database
    .from("company_scripts")
    .insert({ ...payload, company_id: companyId, updated_at: new Date().toISOString() })
    .select("*")
    .single();
}

export async function updateScript(id, patch) {
  return database
    .from("company_scripts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteScript(id) {
  return database.from("company_scripts").delete().eq("id", id);
}
