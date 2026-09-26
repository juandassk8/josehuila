// Helpers CRUD de notifications.
// Inserta/lista/marca-leído por recipient_key.

import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// La tabla `notifications` puede no existir en este proyecto (feature a medio
// armar). Cuando Supabase responde "tabla no encontrada" (PGRST205) la
// desactivamos en memoria para NO inundar la consola con 404 en cada poll.
// No rompe nada: simplemente la campana de notificaciones queda inactiva.
let _notifsUnavailable = false;
const _isMissingTable = (e) =>
  !!e && (e.code === "PGRST205" || /Could not find the table/i.test(e.message || ""));

export async function listNotifications(recipientKey, { limit = 30 } = {}) {
  if (!recipientKey || _notifsUnavailable) return [];
  const { data, error } = await database
    .from("notifications")
    .select("*")
    .eq("recipient_key", recipientKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (_isMissingTable(error)) { _notifsUnavailable = true; return []; }
    logger.error("[notifications] list failed:", error);
    return [];
  }
  return data || [];
}

export async function countUnread(recipientKey) {
  if (!recipientKey || _notifsUnavailable) return 0;
  const { count, error } = await database
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_key", recipientKey)
    .is("read_at", null);
  if (error) {
    if (_isMissingTable(error)) _notifsUnavailable = true;
    return 0;
  }
  return count || 0;
}

export async function markAsRead(id) {
  if (!id || _notifsUnavailable) return;
  await database
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllAsRead(recipientKey) {
  if (!recipientKey || _notifsUnavailable) return;
  await database
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_key", recipientKey)
    .is("read_at", null);
}

// Dispara una notificación. El caller pasa recipient_key — para tareas auto
// se resuelve desde el member asignado (ver helper abajo).
export async function createNotification({
  recipientKey, kind, title, body, icon, linkUrl,
  companyId, companyName, actorName, metadata,
}) {
  if (!recipientKey || !kind || !title || _notifsUnavailable) return null;
  const { data, error } = await database
    .from("notifications")
    .insert({
      recipient_key: recipientKey,
      kind,
      title,
      body: body || null,
      icon: icon || null,
      link_url: linkUrl || null,
      company_id: companyId || null,
      company_name: companyName || null,
      actor_name: actorName || null,
      metadata: metadata || null,
    })
    .select()
    .single();
  if (error) {
    if (_isMissingTable(error)) { _notifsUnavailable = true; return null; }
    logger.error("[notifications] create failed:", error);
    return null;
  }
  return data;
}

// Helper: convierte un company_team_members.id en el recipient_key "member:<id>".
// El stageTasks loguea miembros por id → usa este helper para mandar notif.
export function memberRecipientKey(memberId) {
  return memberId ? `member:${memberId}` : null;
}

export function teamMemberRecipientKey(teamMemberId) {
  return teamMemberId ? `team:${teamMemberId}` : null;
}
