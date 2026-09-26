// DB helpers para onboarding (welcome modal + spotlight tours).
// Tabla: user_onboarding_progress (creada en db/user_onboarding_progress.sql).

import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// Trae el progress row para una identity. Si no existe, crea uno vacío.
export async function getProgress(identityKey, displayName, displayEmail) {
  if (!identityKey) return null;
  const { data, error } = await database
    .from("user_onboarding_progress")
    .select("*")
    .eq("identity_key", identityKey)
    .maybeSingle();
  if (error) {
    logger.error("[onboarding] getProgress failed:", error);
    return null;
  }
  if (data) return data;
  // No existe → crear (welcome no completado, sin tours)
  const { data: created, error: insErr } = await database
    .from("user_onboarding_progress")
    .insert({
      identity_key: identityKey,
      welcome_modal_completed: false,
      tours_completed: [],
      display_name: displayName || null,
      display_email: displayEmail || null,
    })
    .select()
    .single();
  if (insErr) {
    logger.error("[onboarding] create progress failed:", insErr);
    return null;
  }
  return created;
}

export async function markWelcomeCompleted(identityKey) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      welcome_modal_completed: true,
      welcome_modal_completed_at: new Date().toISOString(),
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] markWelcomeCompleted failed:", error);
}

export async function markTourCompleted(identityKey, tourKey) {
  if (!identityKey || !tourKey) return;
  // Append-if-missing en jsonb. Hacemos read-modify-write para no requerir
  // función de Postgres custom.
  const { data: row } = await database
    .from("user_onboarding_progress")
    .select("tours_completed")
    .eq("identity_key", identityKey)
    .maybeSingle();
  const current = Array.isArray(row?.tours_completed) ? row.tours_completed : [];
  if (current.includes(tourKey)) return;
  const next = [...current, tourKey];
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      tours_completed: next,
      last_tour_shown: tourKey,
      last_tour_shown_at: new Date().toISOString(),
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] markTourCompleted failed:", error);
}

// Resetea TODO el progress — útil si Jose quiere re-ver el onboarding para
// debug, o como botón "ver tutorial de nuevo" desde Ajustes.
export async function resetProgress(identityKey) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      welcome_modal_completed: false,
      welcome_modal_completed_at: null,
      tours_completed: [],
      video_tutorial_completed_at: null,
      video_tutorial_skipped_at: null,
      video_tutorial_step_index: 0,
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] resetProgress failed:", error);
}

// ---- Video tutorial (5-step intro con videos) ----

export async function markVideoTutorialCompleted(identityKey) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      video_tutorial_completed_at: new Date().toISOString(),
      video_tutorial_skipped_at: null,
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] markVideoTutorialCompleted failed:", error);
}

export async function markVideoTutorialSkipped(identityKey) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      video_tutorial_skipped_at: new Date().toISOString(),
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] markVideoTutorialSkipped failed:", error);
}

export async function updateVideoTutorialStep(identityKey, idx) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({ video_tutorial_step_index: idx })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] updateVideoTutorialStep failed:", error);
}

// Resetea solo el video tutorial — para botón "Ver tutoriales otra vez".
export async function resetVideoTutorial(identityKey) {
  if (!identityKey) return;
  const { error } = await database
    .from("user_onboarding_progress")
    .update({
      video_tutorial_completed_at: null,
      video_tutorial_skipped_at: null,
      video_tutorial_step_index: 0,
    })
    .eq("identity_key", identityKey);
  if (error) logger.error("[onboarding] resetVideoTutorial failed:", error);
}
