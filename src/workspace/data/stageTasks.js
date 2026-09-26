// Auto-tareas por stage del Content Pipeline (workspace cliente).
//
// Patrón idéntico a `team/data/reviewTasks.js` (que maneja a Nat para
// revisiones), pero target = `company_team_members` con el rol relevante,
// y target table = `company_tasks`.
//
// Cuando un slot entra a un stage que requiere acción de un rol específico
// (scripting → copywriter, to_film → content/UGC, to_edit → editor,
// to_design → designer, in_campaign → trafficker), se crea/refresca una
// tarea AGRUPADA por (company_id, stage_kind) y se asigna a los miembros
// del equipo de la empresa con ese rol.
//
// `syncStageTasks(companyId)` reconcilia: scan completo de slots vs tareas
// auto-generated. Crea las faltantes, cierra las huérfanas. Se corre al
// montar el ContentPipeline.
//
// `autoMoveStaleInCampaign(companyId)` mueve a `feedback` los slots que
// llevan 3+ días en `in_campaign`. Se corre al montar también — sin cron.

import { database } from "../../lib/backend.js";
import { createNotification, memberRecipientKey } from "../../notifications/notifications_db.js";
import { logger } from "../../lib/logger.js";

const STAGE_TO_ROLE = {
  scripting:   "copywriter",
  to_film:     "content",
  to_edit:     "editor",
  to_design:   "designer",
  in_campaign: "trafficker",
  feedback:    "trafficker",
};

const STAGE_LABEL_TITLE = {
  scripting:   "Escribir guiones",
  to_film:     "Grabar contenido",
  to_edit:     "Editar videos",
  to_design:   "Diseñar estáticos",
  in_campaign: "Optimizar campaña",
  feedback:    "Recoger feedback",
};

const STAGE_KINDS = Object.keys(STAGE_TO_ROLE);

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Resuelve company {id, name, slug} desde companyId o desde boardId.
async function resolveCompany({ companyId, boardId }) {
  let id = companyId || null;
  if (!id && boardId) {
    const { data } = await database
      .from("despliegue_boards")
      .select("company_id")
      .eq("id", boardId)
      .maybeSingle();
    id = data?.company_id || null;
  }
  if (!id) return null;
  const { data } = await database
    .from("companies")
    .select("id, name, slug")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { id, name: id, slug: slugify(id) };
  return {
    id: data.id,
    name: data.name || data.id,
    slug: data.slug || slugify(data.name || data.id),
  };
}

// Devuelve los miembros target del equipo de la empresa para un rol dado.
// Si no hay nadie con ese rol, fallback al owner (siempre debe haber owner).
async function getTargetsForStage(companyId, stage) {
  const role = STAGE_TO_ROLE[stage];
  if (!role) return [];
  const { data: members } = await database
    .from("company_team_members")
    .select("id, roles, is_owner")
    .eq("company_id", companyId);
  const all = members || [];
  const targets = all.filter((m) =>
    Array.isArray(m.roles) && m.roles.includes(role)
  );
  if (targets.length > 0) return targets;
  // Fallback: owner.
  return all.filter((m) => m.is_owner);
}

// Reconcilia assignees de la tarea auto-generated.
// Devuelve los member_id que son NUEVOS (para notificar solo a ellos).
async function ensureAssignees(taskId, targets) {
  if (!taskId) return [];
  const target = new Set((targets || []).map((t) => t.id));
  const { data: existing } = await database
    .from("company_task_assignees")
    .select("member_id")
    .eq("task_id", taskId);
  const current = new Set((existing || []).map((x) => x.member_id));
  const toAdd = [...target].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !target.has(id));

  if (toAdd.length > 0) {
    await database.from("company_task_assignees").insert(
      toAdd.map((id) => ({ task_id: taskId, member_id: id }))
    );
  }
  if (toRemove.length > 0) {
    await database
      .from("company_task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("member_id", toRemove);
  }
  return toAdd; // nuevos = candidatos para notificación
}

// Crea o refresca la tarea auto-generated agrupada por (company_id, stage).
// Si ya existe abierta → bumpea updated_at + reconcilia assignees.
// Si no → crea + asigna.
export async function upsertStageTask({ companyId, boardId, stage, slotId }) {
  if (!stage || !STAGE_KINDS.includes(stage)) return null;
  const company = await resolveCompany({ companyId, boardId });
  if (!company) return null;

  const targets = await getTargetsForStage(company.id, stage);
  // Si no hay ni siquiera owner, no creamos tarea (la asignaríamos al vacío).
  if (targets.length === 0) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkUrl = company.slug ? `${origin}/admin/${company.slug}/pipeline` : "";
  const titleLabel = STAGE_LABEL_TITLE[stage] || stage;
  const title = `${titleLabel} · ${company.name}`;

  // Due date = hoy (YYYY-MM-DD local).
  const todayLocal = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  const { data: existing } = await database
    .from("company_tasks")
    .select("id, due_date, updated_at")
    .eq("auto_generated", true)
    .eq("stage_kind", stage)
    .eq("company_id", company.id)
    .neq("status", "completado")
    .order("created_at", { ascending: false })
    .limit(1);

  const notifyNewAssignees = async (newIds) => {
    if (!newIds || newIds.length === 0) return;
    for (const memberId of newIds) {
      await createNotification({
        recipientKey: memberRecipientKey(memberId),
        kind: "task_assigned",
        title: titleLabel,
        body: `Nueva tarea automática en ${company.name}`,
        icon: "✅",
        linkUrl: `${origin}/cliente/${company.slug}/tareas`,
        companyId: company.id,
        companyName: company.name,
        metadata: { stage, slotId: slotId || null },
      });
    }
  };

  if (existing && existing.length > 0) {
    const t = existing[0];
    await database
      .from("company_tasks")
      .update({
        updated_at: new Date().toISOString(),
        title,
        link_url: linkUrl,
        ...(t.due_date ? {} : { due_date: todayLocal }),
      })
      .eq("id", t.id);
    const newIds = await ensureAssignees(t.id, targets);
    await notifyNewAssignees(newIds);
    return t;
  }

  const { data: task, error } = await database
    .from("company_tasks")
    .insert({
      company_id: company.id,
      title,
      description: `Tarea automática · ${titleLabel.toLowerCase()}`,
      status: "pendiente",
      priority: "normal",
      due_date: todayLocal,
      stage_kind: stage,
      slot_id: slotId || null,
      auto_generated: true,
      link_url: linkUrl,
      created_by_label: "Sistema",
    })
    .select("*")
    .single();
  if (error) {
    logger.error("[upsertStageTask] failed:", error);
    return null;
  }
  const newIds = await ensureAssignees(task.id, targets);
  await notifyNewAssignees(newIds);
  return task;
}

// Cierra la tarea agrupada (company, stage) si NO queda ningún slot en ese
// stage dentro de la empresa.
export async function closeStageTaskIfEmpty({ companyId, boardId, stage }) {
  if (!stage || !STAGE_KINDS.includes(stage)) return;
  let cid = companyId || null;
  let bid = boardId || null;
  if (!bid && cid) {
    const { data } = await database
      .from("despliegue_boards")
      .select("id")
      .eq("company_id", cid)
      .eq("active", true)
      .maybeSingle();
    bid = data?.id || null;
  }
  if (!bid) return;

  const { data: pending } = await database
    .from("despliegue_slots")
    .select("id")
    .eq("board_id", bid)
    .eq("status", stage)
    .limit(1);
  if (pending && pending.length > 0) return; // sigue habiendo slots

  if (!cid) {
    const { data: b } = await database
      .from("despliegue_boards")
      .select("company_id")
      .eq("id", bid)
      .maybeSingle();
    cid = b?.company_id || null;
  }
  if (!cid) return;

  await database
    .from("company_tasks")
    .update({
      status: "completado",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("auto_generated", true)
    .eq("stage_kind", stage)
    .eq("company_id", cid)
    .neq("status", "completado");
}

// Scan completo de reconciliación. Corre al montar el ContentPipeline.
// Crea tareas faltantes para stages con slots activos. Cierra tareas
// huérfanas cuyo stage ya no tiene slots.
export async function syncStageTasks(companyId) {
  if (!companyId) return;
  try {
    // 1) Resolver la board activa de la empresa.
    const { data: board } = await database
      .from("despliegue_boards")
      .select("id")
      .eq("company_id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (!board?.id) return;

    // 2) Traer slots actuales de stages que tienen tarea automática.
    const { data: slots, error } = await database
      .from("despliegue_slots")
      .select("id, status")
      .eq("board_id", board.id)
      .in("status", STAGE_KINDS);
    if (error) throw error;

    // 3) Agrupar por stage y upsertear tarea por grupo (un slot representativo).
    const byStage = new Map();
    for (const s of slots || []) {
      if (!byStage.has(s.status)) byStage.set(s.status, s.id);
    }
    for (const [stage, slotId] of byStage) {
      await upsertStageTask({ companyId, boardId: board.id, stage, slotId });
    }

    // 4) Cerrar tareas auto_generated abiertas cuyo stage ya no tiene slots.
    for (const stage of STAGE_KINDS) {
      if (!byStage.has(stage)) {
        await closeStageTaskIfEmpty({ companyId, boardId: board.id, stage });
      }
    }
  } catch (e) {
    logger.error("[syncStageTasks] failed:", e);
  }
}

// Mueve a `feedback` los slots que llevan 3+ días en `in_campaign`. Se corre
// al cargar el pipeline. La tarea de feedback se crea automáticamente vía
// el trigger normal de `updateSlot`.
export async function autoMoveStaleInCampaign(companyId) {
  if (!companyId) return [];
  try {
    const { data: board } = await database
      .from("despliegue_boards")
      .select("id")
      .eq("company_id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (!board?.id) return [];

    const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await database
      .from("despliegue_slots")
      .select("id, in_campaign_at")
      .eq("board_id", board.id)
      .eq("status", "in_campaign")
      .lt("in_campaign_at", threshold);

    const moved = [];
    for (const s of stale || []) {
      const { error } = await database
        .from("despliegue_slots")
        .update({ status: "feedback" })
        .eq("id", s.id);
      if (!error) moved.push(s.id);
    }
    if (moved.length > 0) {
      // Refrescar tareas de campaña/feedback ahora que cambió el balance.
      await closeStageTaskIfEmpty({ companyId, boardId: board.id, stage: "in_campaign" });
      await upsertStageTask({ companyId, boardId: board.id, stage: "feedback", slotId: moved[0] });
    }
    return moved;
  } catch (e) {
    logger.error("[autoMoveStaleInCampaign] failed:", e);
    return [];
  }
}

export { STAGE_TO_ROLE, STAGE_LABEL_TITLE, STAGE_KINDS };
