// Parser mínimo de iCalendar (.ics) para leer un Google Calendar en modo solo lectura.
// Soporta VEVENT con DTSTART/DTEND (UTC "Z", con TZID, o fecha sola = todo el día),
// RRULE básicas (DAILY / WEEKLY+BYDAY / MONTHLY / YEARLY con INTERVAL, UNTIL, COUNT),
// EXDATE, RECURRENCE-ID (instancias movidas) y STATUS:CANCELLED.
// Devuelve instancias dentro de [fromMs, toMs) como { title, start, end, allDay, location }.

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(s) {
  return (s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

// Offset (ms) de una zona IANA en un instante dado.
function tzOffsetMs(utcMs, tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - utcMs;
  } catch {
    return 0;
  }
}

// Hora de pared (y, m, d, h, mi, s) en la zona `tz` → epoch ms.
function wallToMs(w, tz) {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  if (!tz || tz === "UTC") return guess;
  const off = tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(guess - off, tz);
}

function parseDateValue(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const wall = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const allDay = !m[4];
  const tz = m[7] ? "UTC" : params.TZID || null;
  return { wall, allDay, tz };
}

function parseLine(line) {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rest] = left.split(";");
  const params = {};
  rest.forEach((p) => { const [k, v] = p.split("="); if (k) params[k.toUpperCase()] = (v || "").replace(/^"|"$/g, ""); });
  return { name: name.toUpperCase(), params, value };
}

function parseRRule(value) {
  const r = {};
  value.split(";").forEach((kv) => { const [k, v] = kv.split("="); if (k) r[k.toUpperCase()] = v; });
  return r;
}

const wallKey = (w) => `${w.y}-${w.m}-${w.d}T${w.h}:${w.mi}`;
const dayNumber = (w) => Math.floor(Date.UTC(w.y, w.m - 1, w.d) / 864e5);
const weekdayOf = (w) => (new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay() + 6) % 7; // 0 = lunes
function addDays(w, n) {
  const d = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { ...w, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function parseIcsEvents(text, fromMs, toMs, fallbackTz = "America/Bogota") {
  const lines = unfold(text);
  const events = [];
  let cur = null;
  let calTz = fallbackTz;
  for (const raw of lines) {
    const line = parseLine(raw);
    if (!line) continue;
    if (!cur && line.name === "X-WR-TIMEZONE" && line.value) calTz = line.value.trim();
    if (line.name === "BEGIN" && line.value === "VEVENT") { cur = { exdates: [] }; continue; }
    if (line.name === "END" && line.value === "VEVENT") { if (cur?.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (line.name === "DTSTART") cur.start = parseDateValue(line.value, line.params);
    else if (line.name === "DTEND") cur.end = parseDateValue(line.value, line.params);
    else if (line.name === "DURATION") cur.duration = line.value;
    else if (line.name === "SUMMARY") cur.title = unescapeText(line.value);
    else if (line.name === "LOCATION") cur.location = unescapeText(line.value);
    else if (line.name === "DESCRIPTION") cur.description = (line.value || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
    else if (line.name === "X-GOOGLE-CONFERENCE") cur.conference = line.value.trim();
    else if (line.name === "URL") cur.url = line.value.trim();
    else if (line.name === "UID") cur.uid = line.value;
    else if (line.name === "STATUS") cur.status = line.value.toUpperCase();
    else if (line.name === "RRULE") cur.rrule = parseRRule(line.value);
    else if (line.name === "RECURRENCE-ID") cur.recurrenceId = parseDateValue(line.value, line.params);
    else if (line.name === "EXDATE") line.value.split(",").forEach((v) => { const d = parseDateValue(v, line.params); if (d) cur.exdates.push(d); });
  }

  const tzOf = (dv) => dv.tz || calTz;
  const toMsOf = (dv) => (dv.allDay ? wallToMs({ ...dv.wall, h: 0, mi: 0, s: 0 }, calTz) : wallToMs(dv.wall, tzOf(dv)));

  // Instancias movidas o canceladas de una serie: reemplazan a la generada por la RRULE.
  const overrides = new Set();
  events.forEach((e) => { if (e.recurrenceId && e.uid) overrides.add(`${e.uid}|${toMsOf(e.recurrenceId)}`); });

  const out = [];
  // instanceMs: inicio ORIGINAL de la instancia dentro de una serie (null si el evento no se repite).
  const push = (e, startMs, durMs, instanceMs = null) => {
    if (startMs >= toMs || startMs + durMs <= fromMs) return;
    const plain = (e.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    const found = `${e.conference || ""} ${e.location || ""} ${plain} ${e.url || ""}`.match(/https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com|[\w.-]*whereby\.com)\/[^\s"<>)]+/i);
    out.push({
      title: e.title || "(sin título)", location: e.location || null, allDay: !!e.start.allDay,
      description: plain.slice(0, 1500) || null, joinUrl: found ? found[0] : null,
      uid: e.uid || null, instance: instanceMs != null ? new Date(instanceMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") : null,
      start: new Date(startMs).toISOString(), end: new Date(startMs + durMs).toISOString(),
    });
  };

  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    const startMs = toMsOf(e.start);
    let durMs = e.end ? toMsOf(e.end) - startMs : e.start.allDay ? 864e5 : 36e5;
    if (!e.end && e.duration) {
      const dm = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(e.duration);
      if (dm) durMs = ((+dm[1] || 0) * 1440 + (+dm[2] || 0) * 60 + (+dm[3] || 0)) * 6e4 || durMs;
    }
    if (durMs <= 0) durMs = 18e5;

    if (!e.rrule) { push(e, startMs, durMs, e.recurrenceId ? toMsOf(e.recurrenceId) : null); continue; }

    const r = e.rrule;
    const freq = r.FREQ;
    const interval = Math.max(1, parseInt(r.INTERVAL || "1", 10));
    const count = r.COUNT ? parseInt(r.COUNT, 10) : null;
    const untilDv = r.UNTIL ? parseDateValue(r.UNTIL, {}) : null;
    const untilMs = untilDv ? (untilDv.allDay ? wallToMs({ ...untilDv.wall, h: 23, mi: 59, s: 59 }, tzOf(e.start)) : toMsOf(untilDv)) : Infinity;
    const byDay = r.BYDAY ? r.BYDAY.split(",").map((c) => DAY_CODES.indexOf(c.replace(/^[+-]?\d+/, ""))).filter((n) => n >= 0) : null;
    const exKeys = new Set(e.exdates.map((d) => (d.allDay ? `${d.wall.y}-${d.wall.m}-${d.wall.d}` : wallKey(d.wall))));
    const w0 = e.start.wall;
    const day0 = dayNumber(w0);
    const week0 = Math.floor((day0 - weekdayOf(w0)) / 7);
    let produced = 0;

    // Recorre día por día desde el inicio de la serie (tope: 6 años) hasta el fin de la ventana.
    for (let i = 0; i < 2200; i++) {
      const w = addDays(w0, i);
      const dn = day0 + i;
      let match = false;
      if (freq === "DAILY") match = i % interval === 0 && (!byDay || byDay.includes(weekdayOf(w)));
      else if (freq === "WEEKLY") {
        const wk = Math.floor((dn - weekdayOf(w)) / 7);
        match = (wk - week0) % interval === 0 && (byDay ? byDay.includes(weekdayOf(w)) : weekdayOf(w) === weekdayOf(w0));
      } else if (freq === "MONTHLY") {
        const months = (w.y - w0.y) * 12 + (w.m - w0.m);
        match = w.d === w0.d && months % interval === 0;
      } else if (freq === "YEARLY") match = w.d === w0.d && w.m === w0.m && (w.y - w0.y) % interval === 0;
      if (!match) continue;
      const instMs = e.start.allDay ? wallToMs({ ...w, h: 0, mi: 0, s: 0 }, calTz) : wallToMs(w, tzOf(e.start));
      if (instMs > untilMs || instMs >= toMs) break;
      produced += 1;
      if (count && produced > count) break;
      const exKey = e.start.allDay ? `${w.y}-${w.m}-${w.d}` : wallKey(w);
      if (exKeys.has(exKey)) continue;
      if (e.uid && overrides.has(`${e.uid}|${instMs}`)) continue;
      push(e, instMs, durMs, instMs);
    }
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
}
