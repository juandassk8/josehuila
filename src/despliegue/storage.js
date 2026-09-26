import { database } from "../lib/backend.js";

const BUCKET = "despliegue-examples";

// Sube una imagen al bucket de ejemplos. Devuelve la URL pública.
export async function uploadExampleImage(file, { conceptId = "unknown" } = {}) {
  if (!file) throw new Error("No hay archivo");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const filename = `${conceptId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await database.storage
    .from(BUCKET)
    .upload(filename, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = database.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Sube un fotograma de portada (Blob JPEG extraído de un video en el navegador)
// al bucket de ejemplos y devuelve su URL pública. Es chico (~100-300KB), así
// que no toca los límites de tamaño del bucket.
export async function uploadCoverBlob(blob, { prefix = "inbox-covers" } = {}) {
  if (!blob) throw new Error("No hay imagen");
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await database.storage
    .from(BUCKET)
    .upload(filename, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = database.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Sube un video (File/Blob) al bucket de ejemplos y devuelve su URL pública.
// Sirve de PUENTE confiable para el respaldo a Drive: el navegador (IP residencial)
// sube acá, y el server baja de Supabase (sin CORS ni bloqueo de fbcdn) → Drive.
// La URL de Supabase no expira (a diferencia de fbcdn), así que además es preview.
export async function uploadVideoBlob(fileOrBlob, { prefix = "inbox-videos", ext = "mp4" } = {}) {
  if (!fileOrBlob) throw new Error("No hay video");
  const type = fileOrBlob.type || "video/mp4";
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "mp4";
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await database.storage
    .from(BUCKET)
    .upload(filename, fileOrBlob, { cacheControl: "3600", upsert: false, contentType: type });
  if (error) throw error;
  const { data } = database.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Sube un documento cualquiera (PDF, docx, txt…) y devuelve su URL pública.
// Para la info completa del producto (Content Pipeline → Configurar).
export async function uploadDoc(file, { prefix = "product-info" } = {}) {
  if (!file) throw new Error("No hay archivo");
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "bin";
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await database.storage
    .from(BUCKET)
    .upload(filename, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  const { data } = database.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Imagen de referencia de un slot ESTÁTICO del Content Pipeline. Mismo bucket
// que los ejemplos del despliegue —no hay razón para partir el almacenamiento en
// dos— pero bajo su propio prefijo, para poder mirar qué ocupa cada módulo.
//
// Acepta File (elegir/arrastrar) o Blob (pegar desde el portapapeles, que llega
// sin nombre). Devuelve la URL pública, que es lo único que se guarda en el slot.
export async function uploadSlotImage(fileOrBlob, { slotId = "sin-slot" } = {}) {
  if (!fileOrBlob) throw new Error("No hay imagen");
  const type = fileOrBlob.type || "image/png";
  if (!type.startsWith("image/")) throw new Error("Eso no es una imagen");
  const porNombre = (fileOrBlob.name || "").split(".").pop() || "";
  const ext = (porNombre || type.split("/")[1] || "png").toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
  const filename = `pipeline-slots/${slotId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await database.storage
    .from(BUCKET)
    .upload(filename, fileOrBlob, { cacheControl: "3600", upsert: false, contentType: type });
  if (error) throw error;
  const { data } = database.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

export async function deleteExampleImage(publicUrl) {
  if (!publicUrl) return;
  // Extrae el path después de `/storage/v1/object/public/<bucket>/`.
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  await database.storage.from(BUCKET).remove([path]);
}
