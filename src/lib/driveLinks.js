// Helpers de links de Google Drive (lado cliente).

// ¿Es un link de Google Drive?
export function isDriveLink(url) {
  return /drive\.google\.com|docs\.google\.com/i.test(url || "");
}

// Extrae el id del archivo de un link de Drive (/d/<id>/ o ?id=<id>).
export function driveFileId(url) {
  const m = (url || "").match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  return m ? (m[1] || m[2]) : null;
}

// URL para EMBEBER el video en un <iframe> y reproducirlo dentro de la app.
export function drivePreviewUrl(url) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

// URL de descarga directa del binario (para el server) — usada al analizar.
export function driveDownloadUrl(url) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

// URL descargable del video de un referente/creativo, para mandársela al server
// (transcripción, análisis). El respaldo canónico vive en `drive_url`: si es de
// Drive hay que convertirlo a link de descarga directa, si no se usa tal cual.
// Sin respaldo no hay video que bajar — devuelve null y el caller avisa.
export function variationVideoUrl(v) {
  const d = v?.drive_url;
  if (!d) return null;
  return isDriveLink(d) ? driveDownloadUrl(d) : d;
}
