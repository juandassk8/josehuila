// Script de una sola vez para obtener el GOOGLE_DRIVE_REFRESH_TOKEN.
//
// Requisitos previos (en Google Cloud Console, con tu cuenta):
//   1. Crear un proyecto (o usar uno).
//   2. Habilitar "Google Drive API".
//   3. Pantalla de consentimiento OAuth → tipo "Externo" → agregarte como test
//      user NO hace falta si publicás la app; con scope drive.file podés
//      publicarla ("In production") sin verificación de Google.
//   4. Credenciales → Crear credenciales → ID de cliente OAuth → tipo
//      "Aplicación de escritorio". Copiá el Client ID y Client Secret.
//
// Uso:
//   GOOGLE_DRIVE_CLIENT_ID=xxx GOOGLE_DRIVE_CLIENT_SECRET=yyy node scripts/drive-auth.mjs
//
// Abre una URL en tu navegador, autorizás con TU cuenta de Google, y el script
// imprime el refresh token. Lo pegás en las env vars de Vercel:
//   GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN

import http from "node:http";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Falta GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET en el entorno.");
  process.exit(1);
}

const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent",
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  if (!code) { res.writeHead(400).end("Sin código."); return; }
  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: "authorization_code",
      }),
    });
    const data = await tokenResp.json();
    if (!tokenResp.ok || !data.refresh_token) {
      res.writeHead(500).end("No se obtuvo refresh_token. Revocá el acceso de la app en https://myaccount.google.com/permissions y volvé a correr.");
      console.error("Respuesta:", data);
      server.close();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<h2>✅ Listo. Ya podés cerrar esta pestaña y volver a la terminal.</h2>");
    console.log("\n─────────────────────────────────────────────");
    console.log("GOOGLE_DRIVE_REFRESH_TOKEN=" + data.refresh_token);
    console.log("─────────────────────────────────────────────");
    console.log("\nPegá esa línea (y el CLIENT_ID/SECRET) en las Environment Variables de Vercel.\n");
    server.close();
  } catch (e) {
    res.writeHead(500).end("Error: " + e.message);
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("\n1) Abrí esta URL en tu navegador y autorizá con TU cuenta de Google:\n");
  console.log(authUrl + "\n");
  console.log("2) Al terminar, el refresh token aparece acá abajo.\n");
});
