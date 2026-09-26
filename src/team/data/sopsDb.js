import { database } from "../../lib/backend.js";

// SOPs / Manuales — Central Command por miembro.

export async function listSops(ownerId) {
  return database
    .from("sops")
    .select("*")
    .eq("owner_id", ownerId)
    .order("group_sort", { ascending: true })
    .order("sort_order", { ascending: true });
}

export async function createSop(payload) {
  return database.from("sops").insert(payload).select().single();
}

export async function updateSop(id, patch) {
  return database.from("sops").update(patch).eq("id", id).select().single();
}

export async function deleteSop(id) {
  return database.from("sops").delete().eq("id", id);
}
