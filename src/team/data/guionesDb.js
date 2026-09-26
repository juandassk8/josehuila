import { database } from "../../lib/backend.js";

// ---- Script Formats ----
export async function listFormats() {
  return database
    .from("script_formats")
    .select("*")
    .order("name", { ascending: true });
}

export async function getFormat(id) {
  return database.from("script_formats").select("*").eq("id", id).single();
}

export async function createFormat(payload) {
  return database
    .from("script_formats")
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
}

export async function updateFormat(id, patch) {
  return database
    .from("script_formats")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}

export async function deleteFormat(id) {
  return database.from("script_formats").delete().eq("id", id);
}

// ---- Voice Profile (single row) ----
export async function getVoiceProfile() {
  return database.from("voice_profile").select("*").limit(1).single();
}

export async function updateVoiceProfile(patch) {
  // Get the single row id first
  const { data } = await database.from("voice_profile").select("id").limit(1).single();
  if (!data) return { data: null, error: { message: "No voice profile row" } };
  return database
    .from("voice_profile")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .select()
    .single();
}

// ---- Expertise Base (single row) ----
export async function getExpertiseBase() {
  return database.from("expertise_base").select("*").limit(1).single();
}

export async function updateExpertiseBase(patch) {
  const { data } = await database.from("expertise_base").select("id").limit(1).single();
  if (!data) return { data: null, error: { message: "No expertise row" } };
  return database
    .from("expertise_base")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .select()
    .single();
}

// ---- Expertise Documents ----
export async function listExpertiseDocs() {
  return database
    .from("expertise_documents")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function createExpertiseDoc(payload) {
  return database
    .from("expertise_documents")
    .insert(payload)
    .select()
    .single();
}

export async function deleteExpertiseDoc(id) {
  return database.from("expertise_documents").delete().eq("id", id);
}

// ---- Scripts ----
export async function listScripts() {
  return database
    .from("scripts")
    .select("*, format:script_formats(id, name)")
    .order("created_at", { ascending: false });
}

export async function getScript(id) {
  return database
    .from("scripts")
    .select("*, format:script_formats(id, name, description, structure, examples)")
    .eq("id", id)
    .single();
}

export async function createScript(payload) {
  return database
    .from("scripts")
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select("*, format:script_formats(id, name)")
    .single();
}

export async function updateScript(id, patch) {
  return database
    .from("scripts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, format:script_formats(id, name)")
    .single();
}

export async function deleteScript(id) {
  return database.from("scripts").delete().eq("id", id);
}
