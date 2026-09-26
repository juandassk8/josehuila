// Cola de trabajos de la Bandeja — encolar, avanzar, cancelar, reintentar.
//
// El import de una marca no cabe en una invocación: el scrape es una llamada a
// Apify de hasta 230s y después vienen N clasificaciones de hasta 300s cada una.
// Ochenta anuncios son horas. Así que cada `tick` reclama un job, avanza lo que
// le entra en su presupuesto de tiempo, guarda dónde quedó y se va. El siguiente
// tick sigue.
//
// Lo dispara pg_cron cada minuto (solo si hay cola) y, para que arranque al
// instante, un "kick" que manda el navegador al encolar.
//
// Un archivo con acción por query param, como api/finance-ai.js.

import {
  requireTeamMember, requireTeamMemberOrWorker, sendAuthError, serviceClient, isWorkerCall,
} from "./_lib/auth.js";
import { scrapeAdLibrary, urlDePagina, urlDeBusqueda } from "./_lib/apify.js";
import { importAds, parseDiscoverAds } from "./_lib/inboxImport.js";
import { rehostCovers } from "./_lib/covers.js";
import { buildKnownFormats, buildKnownLabels, parcheDeResultadoIA } from "./_lib/inboxAi.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } }, maxDuration: 300 };

const LEASE_SECS = 360;      // > maxDuration: un tick vivo no pierde su lease
const BUDGET_MS = 235_000;   // el tick corta acá y deja el resto para el próximo
const CLASSIFY_CONC = 4;     // clasificaciones en vuelo a la vez
const LOTE_PENDIENTES = 60;
const MAX_ADS_PER_JOB = 300;
const MAX_QUEUED_JOBS = 8;

// Degradación del scrape: si Apify no termina en 230s, el próximo tick pide menos.
const ESCALERA_COUNT = [500, 250, 120];

const ahora = () => Date.now();

/** La URL pública, para que el worker se llame a sí mismo. */
function baseUrl() {
  return process.env.PUBLIC_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`)
    || "http://localhost:3000";
}

function cabecerasInternas() {
  const h = { "Content-Type": "application/json" };
  if (process.env.IMPORT_WORKER_SECRET) h["x-worker-secret"] = process.env.IMPORT_WORKER_SECRET;
  // Si el deployment está protegido, un self-call sin esto devuelve 401 y
  // fallan TODOS los anuncios a la vez.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    h["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  return h;
}

async function parchear(sb, id, patch) {
  await sb.from("import_jobs").update(patch).eq("id", id);
}

/** Suelta el lease. El `locked_by` evita que un tick zombi pise a su reemplazo. */
async function soltar(sb, job, worker, patch = {}) {
  await sb.from("import_jobs")
    .update({ ...patch, locked_by: null, locked_at: null, lease_until: null })
    .eq("id", job.id).eq("locked_by", worker);
}

// ─── Fases ───────────────────────────────────────────────────────────────────

async function faseScraping(sb, job, worker) {
  const intento = job.scrape_attempts || 0;
  if (intento >= ESCALERA_COUNT.length) {
    await soltar(sb, job, worker, {
      status: "failed", finished_at: new Date().toISOString(),
      error: "Meta no devolvió anuncios ni pidiendo menos cantidad",
    });
    return;
  }
  const count = Math.min(job.scrape_count || 300, ESCALERA_COUNT[intento]);
  await parchear(sb, job.id, { phase_detail: `Buscando en Meta (hasta ${count})…` });

  const url = job.page_id
    ? urlDePagina(job.page_id)
    : urlDeBusqueda(job.brand || job.raw_input);

  const out = await scrapeAdLibrary([url], { count });

  if (out.ok === false || !(out.results || []).length) {
    // No es un fallo definitivo: el próximo tick pide menos y suele pasar.
    await soltar(sb, job, worker, {
      scrape_attempts: intento + 1,
      phase_detail: `Meta no respondió (${out.reason || "sin anuncios"}). Reintentando con menos.`,
    });
    return;
  }

  await sb.from("import_job_ads")
    .upsert({ job_id: job.id, ads: out.results, scraped_at: new Date().toISOString() });

  await soltar(sb, job, worker, {
    status: "importing",
    found_ads: out.results.length,
    phase_detail: `Encontrados ${out.results.length}. Guardando…`,
  });
}

async function faseImporting(sb, job, worker) {
  const { data: blob } = await sb.from("import_job_ads").select("ads").eq("job_id", job.id).maybeSingle();
  const crudos = blob?.ads || [];
  if (!crudos.length) {
    await soltar(sb, job, worker, { status: "scraping", phase_detail: "Se perdió el scrape; se rehace." });
    return;
  }

  const { ads, brand } = parseDiscoverAds(crudos, {
    brand: job.brand || job.raw_input,
    topN: Math.min(job.top_n || 100, MAX_ADS_PER_JOB),
    mediaOnly: job.media_only || null,
  });

  const res = await importAds(sb, ads, {
    companyId: job.company_id,
    pipelineType: job.pipeline_type,
    incluirCopias: job.incluir_copias,
    createdBy: job.created_by,
    importJobId: job.id,
    rehostCovers,
    onProgress: (m) => parchear(sb, job.id, { phase_detail: m }).catch(() => {}),
    onError: (m, e) => console.error(`[import-jobs] ${m}`, e?.message || e),
  });

  // El blob ya no hace falta y ocupa. Los pendientes salen de reference_inbox.
  await sb.from("import_job_ads").update({ ads: [] }).eq("job_id", job.id);

  await soltar(sb, job, worker, {
    status: "classifying",
    brand_resolved: brand || null,
    total_ads: res.created.length,
    skipped_ads: res.skipped,
    phase_detail: res.created.length ? `Analizando 0/${res.created.length}…` : "Nada nuevo que analizar.",
  });
}

/** Clasifica un anuncio llamando a /api/classify-ad. Devuelve 'ok' | 'needs_file' | 'fail'. */
async function clasificarUno(sb, item, formats, labels) {
  const videoUrl = item.ai_raw?.video_url || null;
  const cover = item.cover_url || null;
  const transcript = (typeof item.transcript === "string" && item.transcript.trim()) ? item.transcript : null;
  const forcedMarca = item.suggested_labels?.marca?.[0] || null;
  // El copy que Meta publica con el anuncio: para un estático sin
  // transcripción es la única fuente de texto que hay.
  const base = { knownFormats: formats, knownLabels: labels, forcedMarca, adCopy: item.ad_copy || null };

  let body;
  if (videoUrl) body = { ...base, videoUrl, coverUrl: cover, transcript: transcript || undefined };
  else if (transcript) body = { ...base, transcript, coverUrl: cover };
  else if (cover) body = { ...base, coverUrl: cover, imageOnly: true };
  else body = { ...base, sourceUrl: item.source_url };

  await sb.from("reference_inbox").update({ status: "enriching" }).eq("id", item.id);

  try {
    // Por HTTP y no en proceso: classify-ad mantiene el mp4 entero en memoria,
    // así que cuatro en proceso comparten los mismos 300s y los mismos 2GB. Por
    // HTTP cada una se lleva su propia invocación, y esperar I/O es casi gratis.
    const resp = await fetch(`${baseUrl()}/api/classify-ad`, {
      method: "POST", headers: cabecerasInternas(), body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);

    if (data.needsFile) {
      await sb.from("reference_inbox").update({
        status: "pending",
        ai_raw: { ...(item.ai_raw || {}), needs_file: true, needs_file_reason: data.reason || null },
      }).eq("id", item.id);
      return "needs_file";
    }

    if (!data.video_url && item.ai_raw?.video_url) data.video_url = item.ai_raw.video_url;
    await sb.from("reference_inbox").update(parcheDeResultadoIA(data, item)).eq("id", item.id);
    return "ok";
  } catch (e) {
    console.error(`[import-jobs] clasificar ${item.id} falló: ${e.message}`);
    await sb.from("reference_inbox").update({ status: "pending" }).eq("id", item.id);
    return "fail";
  }
}

async function faseClassifying(sb, job, worker, t0) {
  const { data: pend } = await sb.from("reference_inbox")
    .select("id, source_url, cover_url, transcript, ad_copy, suggested_labels, suggested_stage, suggested_format, ai_raw, target_concept_id")
    .eq("import_job_id", job.id)
    .is("enriched_at", null)
    .neq("status", "rejected")
    .limit(LOTE_PENDIENTES);

  if (!pend?.length) {
    await soltar(sb, job, worker, {
      status: "done", finished_at: new Date().toISOString(),
      phase_detail: null,
    });
    return;
  }

  const [formats, labels] = await Promise.all([buildKnownFormats(sb), buildKnownLabels(sb)]);

  let done = job.done_ads || 0, fallos = job.failed_ads || 0, sinArchivo = job.needs_file_ads || 0;
  let ultimaEscritura = 0;
  const cola = [...pend];
  let cancelado = false;

  const guardar = async (forzar = false) => {
    // 83 anuncios son 83 UPDATEs y 83 mensajes de realtime. Con throttle bastan ~20.
    if (!forzar && ahora() - ultimaEscritura < 3000) return;
    ultimaEscritura = ahora();
    await parchear(sb, job.id, {
      done_ads: done, failed_ads: fallos, needs_file_ads: sinArchivo,
      phase_detail: `Analizando ${done}/${job.total_ads || pend.length}…`,
      lease_until: new Date(ahora() + LEASE_SECS * 1000).toISOString(),
    });
  };

  const trabajador = async () => {
    while (cola.length && !cancelado) {
      if (ahora() - t0 > BUDGET_MS) return;          // se acabó el tick
      const item = cola.shift();
      if (!item) return;
      const r = await clasificarUno(sb, item, formats, labels);
      if (r === "ok") done++; else if (r === "needs_file") sinArchivo++; else fallos++;
      await guardar();
    }
  };

  // Cancelación cooperativa: se relee el estado mientras corre el lote.
  const vigilante = setInterval(async () => {
    const { data } = await sb.from("import_jobs").select("status").eq("id", job.id).maybeSingle();
    if (data?.status === "canceled") cancelado = true;
  }, 8000);

  try {
    await Promise.all(Array.from({ length: CLASSIFY_CONC }, trabajador));
  } finally {
    clearInterval(vigilante);
  }

  await guardar(true);

  if (cancelado) {
    await soltar(sb, job, worker, { status: "canceled", finished_at: new Date().toISOString() });
    return;
  }
  // Si quedaron pendientes, el próximo tick sigue. Si no, el próximo cierra.
  await soltar(sb, job, worker, {});
}

// ─── Acciones ────────────────────────────────────────────────────────────────

async function tick(req, res) {
  const sb = serviceClient();
  const worker = `w-${Math.random().toString(36).slice(2, 9)}`;
  const t0 = ahora();

  const { data: jobs, error } = await sb.rpc("claim_import_job", {
    p_worker: worker, p_lease_secs: LEASE_SECS, p_max_running: 1,
  });
  if (error) return res.status(500).json({ error: error.message });

  const job = jobs?.[0];
  if (!job) return res.status(200).json({ ok: true, idle: true });

  try {
    if (job.status === "scraping") await faseScraping(sb, job, worker);
    else if (job.status === "importing") await faseImporting(sb, job, worker);
    else if (job.status === "classifying") await faseClassifying(sb, job, worker, t0);
    else await soltar(sb, job, worker, {});
  } catch (e) {
    console.error(`[import-jobs] tick ${job.id} reventó: ${e.message}`);
    // No se marca failed: la lease vence y otro tick lo reintenta desde su fase.
    await soltar(sb, job, worker, { phase_detail: `Error: ${e.message}` });
  }

  return res.status(200).json({ ok: true, job: job.id, fase: job.status, ms: ahora() - t0 });
}

async function enqueue(req, res, user) {
  const sb = serviceClient();
  const b = req.body || {};

  const raw = String(b.rawInput || b.brand || "").trim();
  if (!raw) return res.status(400).json({ error: "Falta qué importar" });

  const { count: enCola } = await sb.from("import_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "scraping", "importing", "classifying"]);
  if ((enCola || 0) >= MAX_QUEUED_JOBS) {
    return res.status(429).json({ error: `Ya hay ${enCola} trabajos en cola. Espera a que bajen.` });
  }

  const fila = {
    kind: b.kind || "brand",
    raw_input: raw,
    brand: b.brand || null,
    page_id: b.pageId || null,
    source_ref: b.sourceRef || null,
    top_n: Math.min(Number(b.topN) || 100, MAX_ADS_PER_JOB),
    scrape_count: Math.min(Number(b.scrapeCount) || 300, 500),
    media_only: b.mediaOnly || null,
    incluir_copias: !!b.incluirCopias,
    company_id: b.companyId || null,
    pipeline_type: b.pipelineType || "ads",
    created_by: user?.id || null,
  };

  const { data, error } = await sb.from("import_jobs").insert(fila).select().single();
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Esa marca ya está en la cola." });
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true, job: data });
}

async function cambiarEstado(req, res, nuevo) {
  const sb = serviceClient();
  const id = req.body?.id || req.query?.id;
  if (!id) return res.status(400).json({ error: "Falta id" });

  const patch = nuevo === "canceled"
    ? { status: "canceled", finished_at: new Date().toISOString() }
    : { status: "queued", attempts: 0, scrape_attempts: 0, error: null, finished_at: null, phase_detail: null };

  const { data, error } = await sb.from("import_jobs").update(patch).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, job: data });
}

export default async function handler(req, res) {
  const action = req.query?.action || "tick";

  try {
    if (action === "tick") {
      // El cron entra con el secreto; una persona del equipo también puede
      // forzar un tick desde el navegador.
      if (!isWorkerCall(req)) await requireTeamMember(req);
      return await tick(req, res);
    }
    const user = await requireTeamMemberOrWorker(req);
    if (action === "enqueue") return await enqueue(req, res, user);
    if (action === "cancel") return await cambiarEstado(req, res, "canceled");
    if (action === "retry") return await cambiarEstado(req, res, "queued");
    return res.status(400).json({ error: `Acción desconocida: ${action}` });
  } catch (err) {
    return sendAuthError(res, err);
  }
}
