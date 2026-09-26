// CRUD de company_ugcs. kind='ugc' para creadores de video, 'designer' para estáticos.

import { database } from "../lib/backend.js";

export async function listUgcsForCompany(companyId, { kind, includeArchived = false } = {}) {
  if (!companyId) return { data: [], error: null };
  let q = database
    .from("company_ugcs")
    .select("*")
    .eq("company_id", companyId);
  if (kind) q = q.eq("kind", kind);
  if (!includeArchived) q = q.eq("archived", false);
  return q.order("name", { ascending: true });
}

export async function createUgc(companyId, { name, kind = "ugc" }) {
  return database
    .from("company_ugcs")
    .insert({ company_id: companyId, name, kind })
    .select("*")
    .single();
}

export async function archiveUgc(id) {
  return database.from("company_ugcs")
    .update({ archived: true }).eq("id", id).select("*").single();
}

export async function deleteUgc(id) {
  return database.from("company_ugcs").delete().eq("id", id);
}
