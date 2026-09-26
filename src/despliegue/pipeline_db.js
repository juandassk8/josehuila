import { database } from "../lib/backend.js";
import { upsertReviewTask, closeReviewTaskIfEmpty } from "../team/data/reviewTasks.js";
import { logger } from "../lib/logger.js";

// Content Pipeline — DB helpers para despliegue_slots.
//
// Los slots son los creativos en producción semanal. Se mueven por el kanban
// (videos):    idea → scripting → to_film → to_edit → in_campaign → feedback.
// (estáticos): idea → to_design → in_campaign → feedback.
// Cada slot también tiene un review_status (pending/requested/approved/changes_requested)
// que indica en qué estado de revisión está dentro de su columna actual.

export const PIPELINE_STATUSES = [
  { key: "idea",        label: "Idea",        color: "#8A8E8B" },
  { key: "scripting",   label: "Scripting",   color: "#3B8BD4" },
  { key: "to_film",     label: "To Film",     color: "#E24B4A" },
  { key: "to_edit",     label: "To Edit",     color: "#C94C9E" },
  { key: "to_design",   label: "To Design",   color: "#8B5CF6" },
  { key: "in_campaign", label: "In Campaign", color: "#D4A93B" },
  { key: "feedback",    label: "Feedback",    color: "#1D9E75" },
];

export const REVIEW_STATUSES = {
  pending:            { label: "Trabajando",      icon: "⏳", color: "#9A9A92" },
  requested:          { label: "Pide revisión",   icon: "👀", color: "#3B8BD4" },
  approved:           { label: "Aprobado",        icon: "✅", color: "#1D9E75" },
  changes_requested:  { label: "Cambios pedidos", icon: "✏️", color: "#E24B4A" },
};

// Columnas donde tiene sentido tener review_status. En in_campaign/feedback no aplica.
export const COLUMNS_WITH_REVIEW = ["idea", "scripting", "to_film", "to_edit"];

// ISO week para la semana actual, formato "2026-W17".
export function currentWeekIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ───── Slots ─────────────────────────────────────────────────────────────

export async function listSlotsForBoard(boardId) {
  const { data, error } = await database
    .from("despliegue_slots")
    .select("*")
    .eq("board_id", boardId)
    .order("column_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createSlot(payload) {
  const { data, error } = await database
    .from("despliegue_slots")
    .insert({
      week_iso: payload.week_iso || currentWeekIso(),
      status: payload.status || "idea",
      review_status: payload.review_status || "pending",
      ...payload,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSlot(id, patch) {
  const update = { ...patch };
  // Si entra a in_campaign por primera vez, registrar timestamp.
  if (patch.status === "in_campaign" && !patch.in_campaign_at) {
    update.in_campaign_at = new Date().toISOString();
  }
  const { data, error } = await database
    .from("despliegue_slots")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // Loop slot → variation: cuando un slot entra (o está) en in_campaign y
  // tiene concept_id, creamos la variation correspondiente en el canvas de
  // Despliegue Creativo para que el concepto muestre el creativo producido.
  // Es idempotente: si ya hay una variation vinculada, no duplica.
  if (data.status === "in_campaign" && data.concept_id) {
    ensureVariationForSlot(data).catch((e) => logger.error("ensureVariationForSlot", e));
  }

  // Auto-tarea de revisión: si el slot entró a "requested" en un stage
  // revisable, creamos/refrescamos la tarea agrupada por company+stage.
  // Background — no bloquea la respuesta de updateSlot ni rompe si falla.
  if (patch.review_status === "requested" && ["idea", "scripting", "to_film", "to_edit"].includes(data.status)) {
    upsertReviewTask({
      boardId: data.board_id,
      stage: data.status,
      slotId: data.id,
    }).catch((e) => logger.error("[updateSlot] upsertReviewTask failed:", e));
  }

  // Auto-close: si el slot SALE de requested (aprobado, cambios pedidos,
  // trabajando) o cambia de stage, la tarea agrupada puede quedar huérfana.
  if (patch.review_status && patch.review_status !== "requested") {
    // status anterior desconocido — la nueva lectura 'data' ya tiene el nuevo.
    // Chequeamos TODOS los stages del board para cerrar cualquier tarea vacía.
    for (const stg of ["idea", "scripting", "to_film", "to_edit"]) {
      closeReviewTaskIfEmpty({
        boardId: data.board_id,
        stage: stg,
      }).catch((e) => logger.error("[updateSlot] closeReviewTaskIfEmpty failed:", e));
    }
  }
  // También si el slot cambió de status (se movió de columna), la tarea del
  // stage viejo puede quedar vacía. Cubre el caso del drag kanban.
  if (patch.status && patch.status !== data.status) {
    // data.status ya es el nuevo; el viejo no lo tenemos, así que barremos todos.
    for (const stg of ["idea", "scripting", "to_film", "to_edit"]) {
      closeReviewTaskIfEmpty({
        boardId: data.board_id,
        stage: stg,
      }).catch(() => {});
    }
  }

  // Acá vivía la auto-tarea por stage del despliegue. Ya no: las arma el
  // Content Pipeline agrupadas por (brief, etapa) y con avance real
  // (`src/team/pipeline/data/pipelineTasks.js`). Con las dos fuentes vivas
  // aparecían dos tareas de "Editar videos" diciendo cosas distintas.

  return data;
}

// Idempotent: solo crea la variation si no existe una vinculada al slot.
async function ensureVariationForSlot(slot) {
  // 1) Si el slot ya tiene linked_variation_id, refrescamos campos clave y chau.
  if (slot.linked_variation_id) {
    await database.from("despliegue_variations").update({
      name: slot.title || slot.ad_name || null,
      drive_url: slot.edited_content_url || slot.raw_content_url || null,
      notes: slot.review_notes || null,
    }).eq("id", slot.linked_variation_id);
    return;
  }

  // 2) Fallback: buscar variation existente por source_slot_id (por si el
  //    link en slot se perdió pero la variation ya existía).
  const { data: existing } = await database
    .from("despliegue_variations")
    .select("id")
    .eq("source_slot_id", slot.id)
    .maybeSingle();
  if (existing) {
    await database.from("despliegue_slots").update({ linked_variation_id: existing.id }).eq("id", slot.id);
    return;
  }

  // 3) Crear nueva variation + vincular de vuelta al slot.
  const label = `P${Math.floor(Date.now() / 1000) % 100000}`;
  const { data: created, error } = await database
    .from("despliegue_variations")
    .insert({
      concept_id: slot.concept_id,
      source_slot_id: slot.id,
      source_type: "produced",
      label,
      name: slot.title || slot.ad_name || null,
      state: "produced",
      file_url: null,
      drive_url: slot.edited_content_url || slot.raw_content_url || null,
      meta_ads_library_url: null,
      notes: slot.review_notes || null,
      produced_at: slot.in_campaign_at || new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { logger.error("create variation from slot", error); return; }
  await database.from("despliegue_slots").update({ linked_variation_id: created.id }).eq("id", slot.id);
}

export async function deleteSlot(id) {
  const { error } = await database.from("despliegue_slots").delete().eq("id", id);
  if (error) throw error;
}

// Reordenar slots dentro de su columna. Recibe un array ordenado de {id, column_order}.
export async function reorderSlots(updates) {
  await Promise.all(
    updates.map((u) =>
      database
        .from("despliegue_slots")
        .update({ column_order: u.column_order })
        .eq("id", u.id)
    )
  );
}

// ───── Weekly Plans (Fase 2) ─────────────────────────────────────────────

export async function getWeeklyPlan(boardId, weekIso) {
  const { data } = await database
    .from("despliegue_weekly_plans")
    .select("*")
    .eq("board_id", boardId)
    .eq("week_iso", weekIso)
    .maybeSingle();
  return data || null;
}

export async function upsertWeeklyPlan(payload) {
  // upsert por (board_id, week_iso) gracias al UNIQUE constraint.
  const { data, error } = await database
    .from("despliegue_weekly_plans")
    .upsert(payload, { onConflict: "board_id,week_iso" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Genera slots en la columna `idea` del pipeline, uno por cada "cupo" del plan.
// activeConcepts: [{ concept_id, concept_name, stage, format, slots_count }]
// Retorna los slots creados.
export async function generateSlotsFromPlan({ boardId, weeklyPlanId, weekIso, activeConcepts }) {
  const rows = [];
  for (const a of activeConcepts) {
    for (let i = 0; i < (a.slots_count || 0); i++) {
      rows.push({
        board_id: boardId,
        weekly_plan_id: weeklyPlanId,
        concept_id: a.concept_id,
        concept_name: a.concept_name,
        stage: a.stage,
        format: a.format,
        status: "idea",
        review_status: "pending",
        title: `${a.concept_name || "Creativo"} #${i + 1}`,
        week_iso: weekIso,
        column_order: i,
      });
    }
  }
  if (rows.length === 0) return [];
  const { data, error } = await database
    .from("despliegue_slots")
    .insert(rows)
    .select();
  if (error) throw error;
  return data || [];
}

// Cuenta cuántos slots de esta semana ya existen para no duplicar al regenerar.
export async function countSlotsForWeek(boardId, weekIso) {
  const { count, error } = await database
    .from("despliegue_slots")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId)
    .eq("week_iso", weekIso);
  if (error) throw error;
  return count || 0;
}
