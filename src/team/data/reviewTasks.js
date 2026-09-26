// Auto-tareas de revisión. Cuando un slot del pipeline entra a review_status
// "requested", agrupamos en una única tarea por (company_id, review_kind) y
// la asignamos a los reviewers del equipo. Idempotente: si la tarea ya
// existe (status != completado), solo refrescamos updated_at.
//
// Si nadie tiene is_reviewer=true, fallback: asignar a todos los team_members
// con role in (admin, member) para que alguien la reciba sin configuración.
//
// `syncReviewTasks()` hace un scan completo: reconcilia la realidad del DB
// con las tareas abiertas — crea las faltantes, cierra las huérfanas.

import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

const STAGE_LABEL = {
  idea: "ideas",
  scripting: "scripts",
  to_film: "rodaje",
  to_edit: "edición",
};

const REVIEW_STAGES = Object.keys(STAGE_LABEL);

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Link al workspace admin de la empresa: /admin/{slug}/pipeline.
// Nat (team member con sesión Supabase) se auto-autentica como admin al
// abrirlo en pestaña nueva (App.jsx detecta la session y salta el PIN).
function buildPipelineUrl(origin, slug) {
  if (!slug) return `${origin}/admin`;
  return `${origin}/admin/${slug}/pipeline`;
}

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

// Devuelve a quién asignar las tareas automáticas. Orden de preferencia:
//   1. team_members con is_reviewer = true (configuración explícita)
//   2. team_members cuyo nombre o email matchee "nat" (heurística de dominio)
//   3. primer admin creado (último recurso — nunca queda sin assignee)
// El objetivo es que por default Nat reciba las tareas sin configuración,
// pero sin asignarlas a TODO el equipo (eso spammeaba Mis Tareas de todos).
export async function getReviewers() {
  const { data: explicit } = await database
    .from("team_members")
    .select("id, name, email, role, is_reviewer")
    .eq("is_reviewer", true);
  if (explicit && explicit.length > 0) return explicit;

  // Heurística por nombre — el dominio siempre usa "Nat" como reviewer default.
  const { data: byName } = await database
    .from("team_members")
    .select("id, name, email, role")
    .or("name.ilike.nat%,email.ilike.%nat%");
  if (byName && byName.length > 0) return byName;

  // Último recurso: primer admin.
  const { data: admins } = await database
    .from("team_members")
    .select("id, name, email, role")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1);
  return admins || [];
}

// Reconcilia los assignees: task_assignees == set(reviewers). Elimina los que
// sobran (p.ej. assignees de una lógica previa que ensanchaba el fallback) y
// agrega los que faltan. Solo afecta tareas auto-generadas — no manuales.
async function ensureAssignees(taskId, reviewers) {
  if (!taskId) return;
  const target = new Set((reviewers || []).map((r) => r.id));
  const { data: existing } = await database
    .from("task_assignees")
    .select("member_id")
    .eq("task_id", taskId);
  const current = new Set((existing || []).map((x) => x.member_id));

  const toAdd = [...target].filter((id) => !current.has(id))
    .map((id) => ({ task_id: taskId, member_id: id }));
  const toRemove = [...current].filter((id) => !target.has(id));

  if (toAdd.length > 0) {
    await database.from("task_assignees").insert(toAdd);
  }
  if (toRemove.length > 0) {
    await database
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("member_id", toRemove);
  }
}

// Crea o refresca la tarea auto-generada agrupada por (company_id, stage).
export async function upsertReviewTask({ companyId, boardId, stage, slotId }) {
  if (!stage || !REVIEW_STAGES.includes(stage)) return null;
  const company = await resolveCompany({ companyId, boardId });
  if (!company) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkUrl = buildPipelineUrl(origin, company.slug);
  const stageLabel = STAGE_LABEL[stage] || stage;
  const title = `Revisar ${stageLabel} · ${company.name}`;

  const reviewers = await getReviewers();

  const { data: existing } = await database
    .from("tasks")
    .select("id, description, status, updated_at, due_date")
    .eq("auto_generated", true)
    .eq("review_kind", stage)
    .eq("company_id", company.id)
    .neq("status", "completado")
    .order("created_at", { ascending: false })
    .limit(1);

  // Due date = hoy (YYYY-MM-DD en zona local). Las revisiones son same-day
  // para que aparezcan con prioridad visual en la agenda.
  const todayLocal = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  if (existing && existing.length > 0) {
    const t = existing[0];
    await database
      .from("tasks")
      .update({
        updated_at: new Date().toISOString(),
        link_url: linkUrl,
        title,
        // Si la tarea estaba sin due_date (creada antes del fix), la llenamos.
        // Si ya tiene una, no la pisamos para no afectar una decisión manual.
        ...(t.due_date ? {} : { due_date: todayLocal }),
      })
      .eq("id", t.id);
    await ensureAssignees(t.id, reviewers);
    return t;
  }

  const { data: task, error } = await database
    .from("tasks")
    .insert({
      title,
      description: `Revisión automática · ${stageLabel}`,
      status: "pendiente",
      priority: "normal",
      due_date: todayLocal,
      company_id: company.id,
      review_kind: stage,
      slot_id: slotId || null,
      auto_generated: true,
      link_url: linkUrl,
    })
    .select("*")
    .single();
  if (error) {
    logger.error("[upsertReviewTask] failed:", error);
    return null;
  }
  await ensureAssignees(task.id, reviewers);
  return task;
}

// Cierra la tarea agrupada (company, stage) si NO queda ningún slot con
// review_status=requested dentro de esa agrupación. Llamar después de que un
// slot sale de `requested` (manual o por aprobación).
//
// Antes salía con `return` cuando no había board activo, dejando tasks
// huérfanas para siempre (caso "VH Kids" del feedback de Natt). Ahora si
// no hay board, igual cerramos la task — no tiene a dónde apuntar.
export async function closeReviewTaskIfEmpty({ companyId, boardId, stage }) {
  if (!stage || !REVIEW_STAGES.includes(stage)) return;
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

  // Caso huérfano: la company no tiene board activo (archivado/borrado).
  // La task no tiene contexto vivo — la cerramos directo.
  if (!bid && cid) {
    await database
      .from("tasks")
      .update({
        status: "completado",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("auto_generated", true)
      .eq("review_kind", stage)
      .eq("company_id", cid)
      .neq("status", "completado");
    return;
  }
  if (!bid) return;

  // ¿Queda algún slot con review_status=requested en esa (board, stage)?
  const { data: pending } = await database
    .from("despliegue_slots")
    .select("id")
    .eq("board_id", bid)
    .eq("status", stage)
    .eq("review_status", "requested")
    .limit(1);
  if (pending && pending.length > 0) return; // sigue abierta

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
    .from("tasks")
    .update({
      status: "completado",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("auto_generated", true)
    .eq("review_kind", stage)
    .eq("company_id", cid)
    .neq("status", "completado");
}

// Scan global de reconciliación. Corre al entrar al módulo team — crea
// tareas faltantes para slots que ya estaban en pide_revision, y cierra
// tareas auto-generadas huérfanas (sin slots que pidan revisión).
export async function syncReviewTasks() {
  try {
    // 1) Traer todos los slots que piden revisión en stages revisables.
    const { data: slots, error } = await database
      .from("despliegue_slots")
      .select("id, board_id, status, review_status")
      .eq("review_status", "requested")
      .in("status", REVIEW_STAGES);
    if (error) throw error;

    // 2) Agrupar por (board_id, stage) y upsertear tarea por grupo.
    const groupMap = new Map(); // key: `${board_id}|${stage}` → slotId representativo
    for (const s of slots || []) {
      const key = `${s.board_id}|${s.status}`;
      if (!groupMap.has(key)) groupMap.set(key, s.id);
    }
    for (const [key, slotId] of groupMap) {
      const [boardId, stage] = key.split("|");
      await upsertReviewTask({ boardId, stage, slotId });
    }

    // 3) Cerrar tareas auto_generated abiertas cuyo (company, stage) ya no
    // tiene slots en pide_revision. closeReviewTaskIfEmpty es idempotente y
    // ahora también cierra cuando la company perdió su board active (huérfanas).
    const { data: openTasks } = await database
      .from("tasks")
      .select("id, company_id, review_kind, slot_id")
      .eq("auto_generated", true)
      .neq("status", "completado")
      .not("review_kind", "is", null)
      .not("company_id", "is", null);

    for (const t of openTasks || []) {
      await closeReviewTaskIfEmpty({ companyId: t.company_id, stage: t.review_kind });
    }

    // 4) Cerrar tasks auto-generated cuyo slot_id referenciado ya no existe
    // en la DB (slot eliminado). Estas son las "VH Kids fantasma" del feedback.
    const tasksWithSlot = (openTasks || []).filter((t) => t.slot_id);
    if (tasksWithSlot.length > 0) {
      const slotIds = [...new Set(tasksWithSlot.map((t) => t.slot_id))];
      const { data: existing } = await database
        .from("despliegue_slots")
        .select("id")
        .in("id", slotIds);
      const aliveSet = new Set((existing || []).map((s) => s.id));
      const orphanIds = tasksWithSlot
        .filter((t) => !aliveSet.has(t.slot_id))
        .map((t) => t.id);
      if (orphanIds.length > 0) {
        await database
          .from("tasks")
          .update({
            status: "completado",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", orphanIds);
      }
    }
  } catch (e) {
    logger.error("[syncReviewTasks] failed:", e);
  }
}
