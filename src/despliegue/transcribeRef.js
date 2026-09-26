// Transcribir el video de un referente del banco, bajo demanda.
//
// Reusa /api/classify-ad en modo `transcript_only` (Whisper, sin Claude), que ya
// existía para el backfill masivo del banco. Acá se usa de a uno: desde el visor
// del referente y desde el generador de guiones, que necesita el texto sí o sí.
//
// El resultado se guarda en `despliegue_variations.transcript`, así que se paga
// UNA sola vez por referente sin importar quién lo dispare.

import { database } from "../lib/backend.js";
import { buildApiHeaders } from "../lib/apiAuth.js";
import { variationVideoUrl } from "../lib/driveLinks.js";

// `ref` es una fila de despliegue_variations o el snapshot que guarda el slot.
// Devuelve { ok, transcript } | { ok: false, reason, noAudio? }.
export async function transcribeVariation(ref) {
  const id = ref?.id;
  const videoUrl = variationVideoUrl(ref);
  if (!videoUrl) {
    return { ok: false, reason: "Este referente no tiene respaldo de video para transcribir." };
  }

  let data;
  try {
    const resp = await fetch("/api/classify-ad", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({ mode: "transcript_only", videoUrl }),
    });
    data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, reason: data?.error || `Error ${resp.status}` };
  } catch (e) {
    return { ok: false, reason: e?.message || "No se pudo contactar el servidor" };
  }

  if (data.ok && data.transcript?.trim()) {
    const transcript = data.transcript.trim();
    if (id) await database.from("despliegue_variations").update({ transcript }).eq("id", id);
    return { ok: true, transcript };
  }

  if (data.ok && data.noAudio) {
    // Se marca para que ni el visor ni el backfill del banco lo reintenten:
    // hay videos que solo tienen música y nunca van a tener guion.
    if (id) {
      await database
        .from("despliegue_variations")
        .update({ bank_labels: { ...(ref.bank_labels || {}), _audio: "none" } })
        .eq("id", id);
    }
    return { ok: false, noAudio: true, reason: "El video no tiene voz (solo música o sin audio)." };
  }

  return { ok: false, reason: data.reason || "No se pudo transcribir el video." };
}
