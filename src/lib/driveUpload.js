import { buildApiHeaders } from "./apiAuth.js";

// Sube un video DIRECTO del navegador a Google Drive (respaldo del referente).
// Pide un token corto a /api/drive-upload-token (que resuelve la carpeta por
// formato) y hace un upload resumable contra la API de Drive. Es BEST-EFFORT:
// si Drive no está configurado o algo falla, devuelve null y el referente igual
// queda analizado/guardado — el respaldo es un extra, no un bloqueante.
//
// subfolder: "🟢 - <formato>" (emoji por etapa). filename: nombre legible.
export async function uploadVideoToDrive(file, { subfolder = null, filename = null } = {}) {
  if (!file) return null;
  try {
    // 1) Token + carpeta destino (server-side, con el refresh token del admin).
    const resp = await fetch("/api/drive-upload-token", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({ subfolder }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.enabled || !data.token) return null;
    const { token, folderId } = data;

    // 2) Iniciar sesión resumable con la metadata.
    const meta = { name: filename || file.name || `referente-${file.size}.mp4` };
    if (folderId) meta.parents = [folderId];
    const initResp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": file.type || "video/mp4",
          "X-Upload-Content-Length": String(file.size),
        },
        body: JSON.stringify(meta),
      }
    );
    if (!initResp.ok) return null;
    const uploadUrl = initResp.headers.get("location") || initResp.headers.get("Location");
    if (!uploadUrl) return null; // CORS no dejó leer Location → abortamos limpio

    // 3) Subir los bytes.
    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!putResp.ok) return null;
    const created = await putResp.json();
    const id = created.id;
    if (!id) return null;

    // 4) Permiso "cualquiera con el link" (lector) para que el respaldo sirva.
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    } catch { /* si falla el permiso, el archivo igual quedó subido */ }

    return created.webViewLink || `https://drive.google.com/file/d/${id}/view`;
  } catch {
    return null;
  }
}
