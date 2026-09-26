import { permitido } from "./_lib/throttle.js";

// Vercel serverless function. Recibe { email } y notifica al admin (Jose).
// Por ahora: log a Vercel + envío opcional vía Resend si está configurado.
// Para activar emails: setear env var RESEND_API_KEY y ADMIN_EMAIL en Vercel.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });

  // Validar formato — evita basura/inyección y reduce spam.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "email inválido" });
  }
  // Tres por correo cada quince minutos. El endpoint no puede pedir sesión —quien
  // olvidó la clave no tiene cómo probar quién es— así que sin esto una sola
  // persona (o un script) le llena la casilla a Jose.
  //
  // Se responde 200, no 429: contestar distinto según si el correo pasó el freno
  // le diría a quien prueba que ese correo existe. Para quien de verdad olvidó su
  // clave el resultado es el mismo, porque el aviso ya salió en el primer intento.
  // Además por IP: rotando correos se saltaba el freno por email.
  const ip = String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "").trim() || "sin-ip";
  if (!permitido(`ip:${ip}`, { max: 6, ventanaMs: 15 * 60 * 1000 }) || !permitido(email, { max: 3, ventanaMs: 15 * 60 * 1000 })) {
    console.log("[password-reset-notify] frenado por repeticion");
    return res.status(200).json({ ok: true });
  }

  // Escape para no inyectar HTML en el mail al admin.
  const safeEmail = email.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  // No logueamos el email (era PII en los logs de Vercel). Solo el evento.
  console.log(`[password-reset-notify] reset requested at ${new Date().toISOString()}`);

  // Si hay credenciales de Resend, enviamos email al admin.
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "manuelhuila123@gmail.com";

  if (RESEND_API_KEY && ADMIN_EMAIL) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Inforce <noreply@portal.josehuila.com>",
          to: [ADMIN_EMAIL],
          subject: `🔐 Password reset solicitado: ${safeEmail}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px;">
              <h2 style="margin: 0 0 12px;">Password reset solicitado</h2>
              <p>El usuario <strong>${safeEmail}</strong> pidió resetear su contraseña a las
              <strong>${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}</strong>.</p>
              <p style="color: #666; font-size: 13px;">Esto es solo una notificación de seguridad.
              Supabase ya envió el link de reseteo al usuario directamente.</p>
            </div>
          `,
        }),
      });
      if (!r.ok) {
        console.error("[password-reset-notify] Resend error:", await r.text());
      }
    } catch (e) {
      console.error("[password-reset-notify] Resend failed:", e);
    }
  }

  return res.status(200).json({ ok: true });
}
