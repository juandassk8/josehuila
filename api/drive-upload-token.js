// Entrega al navegador un access token corto de Google Drive + la carpeta
// destino, para que el equipo suba videos de referentes DIRECTO a Drive (sin
// pasar por Vercel/Supabase — esquiva el límite de body y no gasta egress).
//
// Solo miembros del equipo (admin). El token es de scope drive.file: solo puede
// tocar archivos que la propia app crea, así que su exposición al browser del
// admin es de bajo riesgo. Se usa una vez y expira solo.
import { requireTeamAdmin, sendAuthError } from "./_lib/auth.js";
import { driveEnabled, prepareBrowserUpload } from "./_lib/drive.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    await requireTeamAdmin(req);
  } catch (err) {
    return sendAuthError(res, err);
  }
  if (!driveEnabled()) {
    return res.status(200).json({ ok: true, enabled: false });
  }
  try {
    const subfolder = (req.body?.subfolder || "").toString().slice(0, 100) || null;
    const { token, folderId } = await prepareBrowserUpload(subfolder);
    return res.status(200).json({ ok: true, enabled: true, token, folderId });
  } catch (e) {
    return res.status(500).json({ error: `No se pudo preparar la subida a Drive: ${e.message}` });
  }
}
