// CRUD de scaling_scenarios. Cada row es un snapshot inmutable de inputs
// más cache del output (para preview en lista sin recalcular).

import { database } from "../../lib/backend.js";

export async function listScenarios(companyId, { includeArchived = false } = {}) {
  if (!companyId) return { data: [], error: null };
  let q = database
    .from("scaling_scenarios")
    .select("*")
    .eq("company_id", companyId);
  if (!includeArchived) q = q.eq("is_archived", false);
  return q.order("updated_at", { ascending: false }).limit(100);
}

export async function createScenario(payload) {
  return database
    .from("scaling_scenarios")
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select("*")
    .single();
}

export async function updateScenario(id, patch) {
  return database
    .from("scaling_scenarios")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteScenario(id) {
  return database.from("scaling_scenarios").delete().eq("id", id);
}
