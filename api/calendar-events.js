// Eventos del Google Calendar del miembro para "Mi rutina" (solo lectura).
// El miembro guarda en routine_settings.calendar_ics_url la "dirección secreta en formato
// iCal" de su calendario; acá se descarga del lado del servidor (el navegador no puede por
// CORS), se expanden las recurrencias y se devuelven las instancias de la ventana pedida.
import { requireTeamMember, serviceClient, sendAuthError } from "./_lib/auth.js";
import { parseIcsEvents } from "./_lib/ics.js";

// Solo direcciones iCal de Google Calendar: evita que el endpoint sirva de proxy a cualquier URL.
const ALLOWED = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^\s]+\.ics$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  let user;
  try { user = await requireTeamMember(req); } catch (err) { return sendAuthError(res, err); }

  const from = Date.parse(req.body?.from);
  const to = Date.parse(req.body?.to);
  if (!from || !to || to <= from || to - from > 40 * 864e5) return res.status(400).json({ error: "rango inválido" });

  const { data, error } = await serviceClient().from("routine_settings").select("calendar_ics_url").eq("owner_id", user.id).maybeSingle();
  if (error) return res.status(500).json({ error: "no se pudo leer la configuración" });
  const url = (data?.calendar_ics_url || "").trim();
  if (!url) return res.status(200).json({ connected: false, events: [] });
  if (!ALLOWED.test(url)) return res.status(400).json({ connected: true, error: "La dirección guardada no es una dirección iCal de Google Calendar." });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: "error" });
    clearTimeout(timer);
    if (!r.ok) {
      const hint = /\/public\//i.test(url)
        ? 'Pegaste la dirección PÚBLICA. Abre "Google Calendar" aquí y pega la "Dirección secreta en formato iCal" (la que trae "private" en el enlace).'
        : `Google respondió ${r.status}. Revisa que la dirección siga vigente.`;
      return res.status(502).json({ connected: true, error: hint });
    }
    const text = await r.text();
    if (!text.includes("BEGIN:VCALENDAR")) return res.status(502).json({ connected: true, error: "La dirección no devolvió un calendario." });
    res.setHeader("Cache-Control", "private, max-age=120");
    // Enlace para abrir cada evento en Google Calendar en modo edición (mover la hora, cambiar
    // invitados…). Se arma aquí para no mandar al navegador la dirección secreta del calendario.
    const calendarId = decodeURIComponent((url.match(/\/ical\/([^/]+)\//) || [])[1] || "");
    const events = parseIcsEvents(text, from, to).map(({ uid, instance, ...ev }) => {
      const st = new Date(ev.start);
      let editUrl = `https://calendar.google.com/calendar/r/day/${st.getUTCFullYear()}/${st.getUTCMonth() + 1}/${st.getUTCDate()}`;
      if (uid && /@google\.com$/i.test(uid) && calendarId) {
        const eventId = uid.replace(/@google\.com$/i, "") + (instance ? `_${instance}` : "");
        const eid = Buffer.from(`${eventId} ${calendarId}`).toString("base64").replace(/=+$/, "");
        editUrl = `https://calendar.google.com/calendar/r/eventedit/${eid}?authuser=${encodeURIComponent(calendarId)}`;
      }
      return { ...ev, editUrl };
    });
    return res.status(200).json({ connected: true, events });
  } catch {
    return res.status(502).json({ connected: true, error: "No se pudo leer el calendario." });
  }
}
