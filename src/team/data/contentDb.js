import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

// ---- Content Items ----
export async function listContentItems() {
  return database
    .from("content_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function createContentItem(payload) {
  return database.from("content_items").insert(payload).select().single();
}

export async function updateContentItem(id, patch) {
  return database.from("content_items").update(patch).eq("id", id).select().single();
}

// Toggle del flag archived. Soft-hide manual independiente del status —
// killed/promoted siguen siendo estados terminales del pipeline; archived
// es solo "sacalo de mi vista, no lo necesito ahora". Reversible con el
// toggle "Ver archivadas (N)" del header.
export async function setContentArchived(id, archived) {
  return database.from("content_items").update({ archived: !!archived }).eq("id", id).select().single();
}

export async function setContentStatus(id, status) {
  // Cuando el item entra a "posted" o "trial", marcamos el timestamp de
  // entrada — el frontend usa posted_at para el auto-paso a trial a las 72h.
  const patch = { status };
  if (status === "posted") patch.posted_at = new Date().toISOString();
  if (status === "trial") patch.trial_at = new Date().toISOString();
  return database.from("content_items").update(patch).eq("id", id).select().single();
}

// Auto-paso de posted → trial para videos con +72h en posted.
// Se llama al montar el board del Content Pipeline. Best-effort: si la
// columna `posted_at` no existe (SQL no corrida), simplemente no hace nada.
export async function autoPromoteToTrial({ hoursThreshold = 72 } = {}) {
  try {
    const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
    const { data, error } = await database
      .from("content_items")
      .select("id")
      .eq("status", "posted")
      .eq("kind", "video")
      .lt("posted_at", cutoff);
    if (error || !data?.length) return 0;
    const ids = data.map((i) => i.id);
    const { error: uErr } = await database
      .from("content_items")
      .update({ status: "trial", trial_at: new Date().toISOString() })
      .in("id", ids);
    if (uErr) return 0;
    return ids.length;
  } catch (e) {
    logger.warn("[autoPromoteToTrial] skipped:", e?.message);
    return 0;
  }
}

// Toggle de una casilla de destino. `done=true` setea posted_at del destino.
// Devuelve el item actualizado para que el caller decida si auto-paso a posted.
export async function togglePublishDestination(item, destinationKey, done) {
  const current = item.publish_destinations || {};
  const next = {
    ...current,
    [destinationKey]: done
      ? { done: true, posted_at: new Date().toISOString() }
      : { done: false, posted_at: null },
  };
  return database
    .from("content_items")
    .update({ publish_destinations: next })
    .eq("id", item.id)
    .select()
    .single();
}

export async function deleteContentItem(id) {
  return database.from("content_items").delete().eq("id", id);
}

// ---- Content Metrics ----
export async function listMetrics(contentItemId) {
  return database
    .from("content_metrics")
    .select("*")
    .eq("content_item_id", contentItemId)
    .order("captured_at", { ascending: false });
}

export async function addMetrics(payload) {
  return database.from("content_metrics").insert(payload).select().single();
}

export async function listAllPostedWithMetrics() {
  return database
    .from("content_items")
    .select("*, metrics:content_metrics(*)")
    .eq("status", "posted")
    .order("scheduled_date", { ascending: false });
}
