// Cliente de la cola de importación.
//
// El navegador solo encola y mira; el trabajo lo hace el worker del servidor.
// Por eso acá no hay nada de scraping ni de análisis: son cuatro llamadas y una
// lectura.

import { database } from "../../lib/backend.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";

const ACTIVOS = ["queued", "scraping", "importing", "classifying"];

async function llamar(action, body = {}) {
  const resp = await fetch(`/api/import-jobs?action=${action}`, {
    method: "POST",
    headers: await buildApiHeaders(),
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return data;
}

export async function enqueueImportJob(opts) {
  const out = await llamar("enqueue", opts);
  // Sin await y sin romper si falla: es solo para que arranque en un segundo en
  // vez de esperar al cron. Si el usuario cierra la pestaña, el cron lo recoge.
  llamar("tick").catch(() => {});
  return out.job;
}

export const cancelImportJob = (id) => llamar("cancel", { id });
export const retryImportJob = (id) => llamar("retry", { id });

/** Los activos + los terminados de las últimas 24h. */
export async function listImportJobs() {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await database
    .from("import_jobs")
    .select("*")
    .or(`status.in.(${ACTIVOS.join(",")}),finished_at.gte.${desde}`)
    .order("seq", { ascending: true });
  if (error) throw error;
  return data || [];
}

export const esActivo = (j) => ACTIVOS.includes(j?.status);

/** Texto humano del estado. El enum no se le muestra a nadie. */
export function textoDeEstado(job, posicionEnCola = 0) {
  switch (job.status) {
    case "queued": return posicionEnCola > 0 ? `En cola (${posicionEnCola}º)` : "En cola";
    case "scraping": return "Buscando en Meta…";
    case "importing": return `Guardando ${job.found_ads || ""} anuncios…`.replace("  ", " ");
    case "classifying": return `Analizando ${job.done_ads}/${job.total_ads || "?"}`;
    case "done": return `${job.total_ads} traídos · ${job.done_ads} analizados`;
    case "failed": return job.error || "Falló";
    case "canceled": return "Cancelado";
    default: return job.status;
  }
}

/**
 * Minutos que faltan, derivados del ritmo real de este job.
 * Devuelve null hasta tener con qué estimar — un ETA inventado es peor que
 * ninguno.
 */
export function minutosRestantes(job) {
  if (job.status !== "classifying" || !job.started_at || job.done_ads < 3) return null;
  const transcurrido = Date.now() - new Date(job.started_at).getTime();
  const porAnuncio = transcurrido / job.done_ads;
  const faltan = (job.total_ads || 0) - job.done_ads;
  if (faltan <= 0) return null;
  return Math.max(1, Math.round((faltan * porAnuncio) / 60000));
}
