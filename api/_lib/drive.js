// Cliente mínimo de Google Drive (REST v3, raw fetch — sin la librería pesada
// googleapis). Sube videos de referentes al Drive del admin (Jose) usando un
// refresh token OAuth guardado en env. El almacenamiento es la cuota del Drive
// del dueño del token; no hay costo extra de plataforma.
//
// Env vars requeridas (se configuran una vez en Vercel):
//   GOOGLE_DRIVE_CLIENT_ID       — OAuth client id (Google Cloud Console)
//   GOOGLE_DRIVE_CLIENT_SECRET   — OAuth client secret
//   GOOGLE_DRIVE_REFRESH_TOKEN   — refresh token del admin (scripts/drive-auth.mjs)
//   GOOGLE_DRIVE_FOLDER_ID       — (opcional) id de carpeta destino ya existente
//   GOOGLE_DRIVE_FOLDER_NAME     — (opcional) nombre de carpeta a crear/usar (default "Inforce Referentes")
//
// Scope usado: drive.file (solo archivos que crea la app). No es "restringido",
// así que la app OAuth puede publicarse a producción SIN verificación de Google
// (y el refresh token no expira a los 7 días como en modo test).
//
// Ver scripts/drive-auth.mjs para obtener el refresh token la primera vez.

// ¿Está configurada la integración con Drive?
export function driveEnabled() {
  return !!(process.env.GOOGLE_DRIVE_CLIENT_ID &&
            process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
            process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

// Cache del access token en memoria del lambda (se refresca solo al expirar).
let _tok = { value: null, exp: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (_tok.value && now < _tok.exp - 60_000) return _tok.value;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Drive OAuth: ${data.error_description || data.error || resp.status}`);
  _tok = { value: data.access_token, exp: now + (data.expires_in || 3600) * 1000 };
  return _tok.value;
}

// Cache de ids de carpeta por (parent, nombre). Con scope drive.file la
// búsqueda solo ve carpetas creadas por la app — así reencuentra la que creó
// antes y no duplica.
const _folderCache = new Map();

async function ensureFolder(token, name, parentId) {
  const key = `${parentId || "root"}/${name}`;
  if (_folderCache.has(key)) return _folderCache.get(key);
  const parts = [`name='${name.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", "trashed=false"];
  if (parentId) parts.push(`'${parentId}' in parents`);
  const q = encodeURIComponent(parts.join(" and "));
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (r.ok && d.files?.[0]?.id) { _folderCache.set(key, d.files[0].id); return d.files[0].id; }
  } catch { /* si falla la búsqueda, creamos abajo */ }
  const meta = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const cr = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const cd = await cr.json();
  if (!cr.ok) throw new Error(`Drive carpeta: ${JSON.stringify(cd)}`);
  _folderCache.set(key, cd.id);
  return cd.id;
}

// Resuelve la carpeta destino: carpeta madre (env FOLDER_ID o FOLDER_NAME) y,
// si se pasa un subfolder (ej "🟡 - Founder"), la subcarpeta por formato dentro.
async function resolveFolderId(token, subfolder) {
  let parentId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
  if (!parentId) {
    parentId = await ensureFolder(token, process.env.GOOGLE_DRIVE_FOLDER_NAME || "Inforce Referentes", null);
  }
  if (subfolder && subfolder.trim()) return ensureFolder(token, subfolder.trim(), parentId);
  return parentId;
}

// Prepara una subida DESDE EL NAVEGADOR: mintea un access token corto y resuelve
// la carpeta destino (madre + subcarpeta por formato). El browser sube el video
// directo a Drive con este token (drive.file → solo toca archivos de la app),
// esquivando el límite de body de Vercel y sin pasar por Supabase.
export async function prepareBrowserUpload(subfolder) {
  const token = await getAccessToken();
  const folderId = await resolveFolderId(token, subfolder);
  return { token, folderId };
}

// Sube un buffer a Drive via upload resumable (aguanta videos grandes de una
// sola pasada porque ya tenemos todos los bytes en memoria). Deja el archivo
// como "cualquiera con el link puede ver" para que el link de respaldo sirva
// aunque el link de Meta expire. `subfolder` = carpeta por formato/etapa.
// Devuelve { link, id }.
export async function uploadToDrive({ buffer, filename, mimeType = "video/mp4", subfolder = null }) {
  if (!buffer?.length) throw new Error("buffer vacío");
  const token = await getAccessToken();
  const folderId = await resolveFolderId(token, subfolder);

  // 1) Iniciar sesión resumable con la metadata del archivo.
  const meta = { name: filename || `referente-${Date.now()}.mp4` };
  if (folderId) meta.parents = [folderId];
  const initResp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(buffer.length),
      },
      body: JSON.stringify(meta),
    }
  );
  if (!initResp.ok) throw new Error(`Drive init: ${initResp.status} ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get("location");
  if (!uploadUrl) throw new Error("Drive no devolvió URL de subida");

  // 2) Subir los bytes en un solo PUT.
  const putResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(buffer.length) },
    body: buffer,
  });
  const file = await putResp.json();
  if (!putResp.ok) throw new Error(`Drive upload: ${putResp.status} ${JSON.stringify(file)}`);

  // 3) Permiso "cualquiera con el link" (lector) para que el respaldo sea usable.
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
  } catch { /* si falla el permiso, el archivo igual quedó subido */ }

  const link = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  return { link, id: file.id };
}
