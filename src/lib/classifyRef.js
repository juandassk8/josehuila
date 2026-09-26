import { buildApiHeaders } from "./apiAuth.js";
import { uploadExampleImage } from "../despliegue/storage.js";

// Analiza una referencia a partir de un link de Drive, un link de Meta y/o una
// imagen, y DEVUELVE los campos sugeridos (marca/nicho/ángulo/formato, nombre,
// descripción, etapa, portada). No escribe en ninguna tabla — el modal que lo
// llama decide qué hacer con el resultado. Reusa /api/classify-ad.
//
// Prioridad de fuente: Drive (video real → transcript + respaldo) → imagen
// (estáticos / portada que subís) → Meta (último recurso, puede bloquear).

function isDriveLink(url) {
  return /drive\.google\.com|docs\.google\.com/i.test(url || "");
}
function driveDownloadUrl(url) {
  const m = (url || "").match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  const id = m && (m[1] || m[2]);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

// Destila la descripción + ejecución GENERAL de un formato a partir de sus
// referencias (array de { transcript, notes, labels, name }). Reusa /api/classify-ad
// en modo "synthesize". Devuelve { description, execution }.
export async function synthesizeFormat(references, { formatName = "" } = {}) {
  const resp = await fetch("/api/classify-ad", {
    method: "POST", headers: await buildApiHeaders(),
    body: JSON.stringify({ mode: "synthesize", references, formatName }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return { description: data.description || "", execution: data.execution || "" };
}

// Extrae la estrategia de venta (ángulos/objeciones/conciencia) de un texto libre
// pegado (el plan de implementación). Devuelve { angles, objections, awareness },
// cada uno array de { title, desc }.
export async function extractStrategy(text) {
  const resp = await fetch("/api/classify-ad", {
    method: "POST", headers: await buildApiHeaders(),
    body: JSON.stringify({ mode: "strategy_extract", text }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return { angles: data.angles || [], objections: data.objections || [], awareness: data.awareness || [] };
}

export async function classifyReference({
  driveUrl = "", metaUrl = "", imageUrl = "", file = null,
  conceptId = "ref-analyze", knownFormats = [], knownLabels = {}, onProgress = null,
} = {}) {
  // Portada para que la IA "vea" el anuncio: archivo subido > URL pegada.
  let coverUrl = imageUrl?.trim() || null;
  if (file) { onProgress?.("Subiendo imagen…"); coverUrl = await uploadExampleImage(file, { conceptId }); }

  let body;
  if (driveUrl && isDriveLink(driveUrl)) {
    onProgress?.("Abriendo el video de Drive…");
    body = { videoUrl: driveDownloadUrl(driveUrl), backupUrl: driveUrl, coverUrl, knownFormats, knownLabels };
  } else if (coverUrl) {
    onProgress?.("Analizando la imagen…");
    body = { coverUrl, imageOnly: true, knownFormats, knownLabels };
  } else if (metaUrl?.trim()) {
    onProgress?.("Abriendo el anuncio de Meta…");
    body = { sourceUrl: metaUrl.trim(), knownFormats, knownLabels };
  } else {
    throw new Error("Pegá el link de Drive, el de Meta, o subí una imagen para analizar.");
  }

  onProgress?.("Analizando con IA…");
  const resp = await fetch("/api/classify-ad", {
    method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  if (data.needsFile) throw new Error(data.reason || "No se pudo analizar. Subí una imagen o compartí el Drive como 'Cualquiera con el link'.");
  return { ...data, cover_url: data.cover_url || coverUrl };
}
