import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { saveBlock, deleteBlock } from "./rutinaDb.js";
import {
  CATS, CAT_ORDER, DAY_NAMES, DAY_SHORT, addDays, dateStr, dayIndex, fmtDur, fmtTime, fromHHMM,
  nowMinutes, reloadRoutineBlocks, toHHMM,
} from "./rutinaShared.js";
import { RutinaNotes } from "./RutinaNotes.jsx";
import { CalendarConnect } from "./CalendarConnect.jsx";
import { fetchCalendarEvents } from "./rutinaDb.js";
import { updateTask } from "../data/db.js";

const ZOOMS = [44, 60, 84, 120, 168, 232];

// ¿Esta tarea y este evento de Google Calendar son la misma reunión? Mismo día, misma hora de
// inicio y títulos equivalentes (uno contiene al otro, sin tildes ni signos).
const norm = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function sameMeeting(task, ev) {
  if (!task.due_time || ev.allDay) return false;
  if (dateStr(new Date(ev.start)) !== task.due_date) return false;
  const a = norm(task.title);
  const b = norm(ev.title);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}
const minutesOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmmOf = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
// Empareja cada tarea con UN evento (el de hora más cercana) para que dos reuniones con el
// mismo nombre el mismo día no se crucen. Devuelve Map(taskId → evento).
function matchMeetings(tasks, events) {
  const taken = new Set();
  const out = new Map();
  (tasks || []).filter((t) => t.status !== "completado" && t.due_time).forEach((t) => {
    let best = null;
    events.forEach((ev, i) => {
      if (taken.has(i) || !sameMeeting(t, ev)) return;
      const st = new Date(ev.start);
      const gap = Math.abs(st.getHours() * 60 + st.getMinutes() - (minutesOf(t.due_time) ?? 0));
      if (!best || gap < best.gap) best = { i, ev, gap };
    });
    if (best) { taken.add(best.i); out.set(t.id, best.ev); }
  });
  return out;
}
const ls = (k, v) => {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* sin storage */ }
  return null;
};

export function RutinaCalendar({ memberId, monday, blocks, checks, markBlock, habits, tasks, onOpenTask }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const [view, setView] = useState(() => (ls("rutina_view") === "week" ? "week" : "day"));
  const [selDay, setSelDay] = useState(dayIndex());
  const [zoom, setZoom] = useState(() => ({
    day: Number(ls("rutina_zday")) || 3,
    week: Number(ls("rutina_zweek")) || 1,
  }));
  const [editing, setEditing] = useState(null); // bloque | { nuevo }
  const [editMode, setEditMode] = useState(false);
  const [legend, setLegend] = useState(false);
  // Google Calendar: eventos de la semana (solo lectura)
  const [gcal, setGcal] = useState({ connected: false, events: [], error: null });
  const [gcalOpen, setGcalOpen] = useState(false);
  const [gcalTick, setGcalTick] = useState(0);
  const [openEvent, setOpenEvent] = useState(null); // { ev, task }
  const meetings = useMemo(() => matchMeetings(tasks, gcal.events), [tasks, gcal.events]);
  const taskOfEvent = (ev) => (tasks || []).find((t) => meetings.get(t.id) === ev) || null;
  // Google Calendar manda: si moviste la reunión allá, la tarea enlazada toma la hora nueva.
  const synced = useRef(new Set());
  useEffect(() => {
    meetings.forEach((ev, taskId) => {
      const t = (tasks || []).find((x) => x.id === taskId);
      if (!t) return;
      const time = hhmmOf(new Date(ev.start));
      const timeEnd = dateStr(new Date(ev.end)) === t.due_date ? hhmmOf(new Date(ev.end)) : null;
      const key = `${taskId}|${time}|${timeEnd}`;
      if ((t.due_time || "").slice(0, 5) === time && (t.due_time_end || null) === timeEnd) return;
      if (synced.current.has(key)) return;
      synced.current.add(key);
      updateTask(taskId, { due_time: time, due_time_end: timeEnd });
    });
  }, [meetings, tasks]);
  useEffect(() => {
    let alive = true;
    fetchCalendarEvents(monday.toISOString(), addDays(monday, 7).toISOString())
      .then((r) => { if (alive) setGcal({ connected: r.connected, events: r.events, error: r.error }); })
      .catch(() => { if (alive) setGcal((g) => ({ ...g, error: "No se pudo leer el calendario." })); });
    const id = setInterval(() => setGcalTick((n) => n + 1), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [monday, gcalTick]);
  const scrollRef = useRef(null);
  const headRef = useRef(null);

  const single = view === "day";
  const H = ZOOMS[zoom[view]];
  const today = dayIndex();
  const mNow = nowMinutes();
  const list = single ? [selDay] : [0, 1, 2, 3, 4, 5, 6];

  const range = useMemo(() => {
    const all = blocks || [];
    if (!all.length) return [360, 1320];
    const start = Math.floor(Math.min(...all.map((b) => b.start_min)) / 60) * 60;
    const end = Math.ceil(Math.max(...all.map((b) => b.end_min)) / 60) * 60;
    return [start, end];
  }, [blocks]);
  const [START, END] = range;
  const total = ((END - START) / 60) * H;
  const step = H >= 160 ? 15 : H >= 84 ? 30 : 60;

  const scrollToNow = (smooth) => {
    const sc = scrollRef.current;
    if (!sc || !sc.clientHeight) return;
    const showsToday = single ? selDay === today : true;
    const top = showsToday && mNow >= START && mNow <= END
      ? (headRef.current?.offsetHeight || 0) + ((mNow - START) / 60) * H - sc.clientHeight * 0.28
      : 0;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  };
  // Al entrar (o cambiar vista/zoom/día) el calendario se para en la hora actual.
  useLayoutEffect(() => { scrollToNow(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view, H, selDay, blocks === null]);

  useEffect(() => { ls("rutina_view", view); }, [view]);
  const changeZoom = (dz) => setZoom((z) => {
    const v = Math.max(0, Math.min(ZOOMS.length - 1, z[view] + dz));
    ls(view === "day" ? "rutina_zday" : "rutina_zweek", String(v));
    return { ...z, [view]: v };
  });

  const hours = [];
  for (let m = START; m <= END; m += step) hours.push(m);

  const pill = (active) => ({
    fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 50, cursor: "pointer",
    border: `1px solid ${active ? DS.blue : DS.textHint}`, background: active ? DS.blue : "transparent",
    color: active ? "#fff" : DS.textPrimary,
  });
  const ghost = {
    fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer",
    border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 2, background: DS.bgCard, border: DS.border, borderRadius: 10, padding: 3 }}>
          {[["day", "Día"], ["week", "Semana"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "none",
              cursor: "pointer", background: view === k ? DS.textPrimary : "transparent", color: view === k ? DS.bg : DS.textMuted,
            }}>{label}</button>
          ))}
        </div>
        {single && DAY_SHORT.map((d, i) => (
          <button key={d} onClick={() => setSelDay(i)} style={pill(i === selDay)}>{d}{i === today ? " · hoy" : ""}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => { if (single && selDay !== today) setSelDay(today); setTimeout(() => scrollToNow(true), 30); }} style={ghost}>Ir a ahora</button>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: DS.textMuted }}>
          <button onClick={() => changeZoom(-1)} disabled={zoom[view] <= 0} style={{ ...ghost, padding: "4px 10px" }} aria-label="Menos detalle">−</button>
          Detalle
          <button onClick={() => changeZoom(1)} disabled={zoom[view] >= ZOOMS.length - 1} style={{ ...ghost, padding: "4px 10px" }} aria-label="Más detalle">+</button>
        </div>
        <button onClick={() => onOpenTask?.("new")} style={ghost} title="Crea una tarea con fecha y hora: aparece dentro de tu día">+ Tarea con hora</button>
        <button onClick={() => setGcalOpen(true)} style={{ ...ghost, borderColor: gcal.error ? DS.red : gcal.connected ? DS.green : DS.textHint, color: gcal.error ? DS.red : gcal.connected ? DS.green : DS.textPrimary }} title={gcal.error || "Ver tus llamadas y eventos dentro del día"}>
          {gcal.connected ? `Google Calendar · ${gcal.events.length}` : "Conectar Google Calendar"}
        </button>
        <button onClick={() => setLegend((v) => !v)} style={ghost}>{legend ? "Ocultar colores" : "Colores"}</button>
        <button onClick={() => setEditMode((v) => !v)} style={{ ...ghost, borderColor: editMode ? DS.amber : DS.textHint, color: editMode ? DS.amber : DS.textPrimary }}>
          {editMode ? "Listo" : "Editar rutina"}
        </button>
      </div>

      {legend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 11.5, color: DS.textMuted }}>
          {CAT_ORDER.map((c) => (
            <span key={c}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: CATS[c].color, marginRight: 6 }} />{CATS[c].name}</span>
          ))}
        </div>
      )}
      {editMode && (
        <div style={{ fontSize: 12, color: DS.amber, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          Toca un bloque para editarlo.
          <button onClick={() => setEditing({ day: single ? selDay : today, start_min: 720, end_min: 780, label: "", category: "light", note: "", habit_key: "" })} style={ghost}>+ Agregar bloque</button>
        </div>
      )}

      <div style={{ display: "grid", gap: 14, alignItems: "start", gridTemplateColumns: single ? "minmax(0, 1fr) minmax(0, 270px)" : "minmax(0, 1fr)" }}>
      <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 14, overflow: "hidden" }}>
        <div ref={scrollRef} style={{ overflow: "auto", maxHeight: "min(72vh, 780px)", padding: "0 10px 14px 0", overscrollBehavior: "contain" }}>
          <div style={{ minWidth: single ? 0 : 880 }}>
            <div ref={headRef} style={{
              display: "grid", gridTemplateColumns: `58px repeat(${list.length}, minmax(0, 1fr))`, columnGap: 6,
              position: "sticky", top: 0, zIndex: 6, background: DS.bgSide, borderBottom: DS.border, marginBottom: 8,
            }}>
              <div />
              {list.map((i) => (
                <div key={i} style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center",
                  padding: "12px 4px 10px", color: i === today ? DS.blue : DS.textMuted,
                }}>
                  {DAY_NAMES[i]}{i === today ? " · hoy" : ""}
                  {gcal.events.filter((ev) => ev.allDay && dateStr(new Date(ev.start)) === dateStr(addDays(monday, i))).map((ev, k) => (
                    <div key={k} title={ev.title} style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0, textTransform: "none", color: DS.purple, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `58px repeat(${list.length}, minmax(0, 1fr))`, columnGap: 6 }}>
              <div style={{ position: "relative", height: total }}>
                {hours.map((m) => (
                  <span key={m} style={{
                    position: "absolute", right: 8, top: ((m - START) / 60) * H, whiteSpace: "nowrap",
                    transform: m === START ? "none" : m === END ? "translateY(-100%)" : "translateY(-50%)",
                    fontSize: m % 60 ? 10 : 11, opacity: m % 60 ? 0.7 : 1, color: DS.textMuted, fontVariantNumeric: "tabular-nums",
                  }}>{m % 60 ? fmtTime(m, false) : fmtTime(m)}</span>
                ))}
              </div>
              {list.map((i) => {
                const date = dateStr(addDays(monday, i));
                return (
                  <div key={i} style={{
                    position: "relative", height: total, borderRadius: 8,
                    backgroundColor: i === today ? `${DS.blue}10` : "transparent",
                    backgroundImage: `repeating-linear-gradient(to bottom, ${DS.textHint}55 0 1px, transparent 1px ${(H * step) / 60}px)`,
                  }}>
                    {(blocks || []).filter((b) => b.day === i).map((b) => {
                      const hgt = ((b.end_min - b.start_min) / 60) * H;
                      const tiny = hgt < (single ? 40 : 34);
                      const v = checks[`${b.id}|${date}`] || 0;
                      const deep = b.category === "deep";
                      const color = CATS[b.category]?.color || CATS.other.color;
                      const past = i < today || (i === today && b.end_min <= mNow);
                      const chk = Math.min(28, Math.max(12, hgt - 8));
                      return (
                        <div
                          key={b.id}
                          onClick={editMode ? () => setEditing(b) : undefined}
                          title={`${fmtTime(b.start_min)} – ${fmtTime(b.end_min)} · ${b.label}`}
                          style={{
                            position: "absolute", left: 2, right: 2, top: ((b.start_min - START) / 60) * H + 1,
                            height: Math.max(12, hgt - 2), borderRadius: 7, overflow: "hidden", boxSizing: "border-box",
                            padding: tiny ? `0 ${single ? 48 : 7}px 0 ${single ? 12 : 7}px` : single ? "6px 48px 6px 12px" : "4px 8px",
                            fontSize: hgt < 20 ? 10.5 : single ? 13.5 : 12, lineHeight: 1.3, fontFamily: DS.font,
                            background: deep ? color : `${color}33`, border: `1px solid ${deep ? color : `${color}77`}`,
                            color: deep ? "#fff" : DS.textPrimary, opacity: past ? 0.62 : 1,
                            cursor: editMode ? "pointer" : "default", outline: editMode ? `1px dashed ${DS.amber}` : "none",
                            ...(tiny ? { display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" } : {}),
                          }}
                        >
                          <b style={{ fontWeight: tiny ? 600 : 700, display: tiny ? "inline" : "block", textDecoration: v === 1 ? "line-through" : "none" }}>
                            {!single && tiny ? `${fmtTime(b.start_min, false)} ` : ""}{b.label}
                          </b>
                          {(single || !tiny) && (
                            <small style={{ display: tiny ? "inline" : "block", fontSize: "0.88em", color: deep ? "rgba(255,255,255,.82)" : DS.textMuted, fontVariantNumeric: "tabular-nums" }}>
                              {fmtTime(b.start_min, false)} – {fmtTime(b.end_min)}{single || hgt >= 44 ? ` · ${fmtDur(b.end_min - b.start_min)}` : ""}
                            </small>
                          )}
                          {b.note && !tiny && hgt >= (single ? 62 : 70) && (
                            <small style={{ display: "block", fontSize: "0.88em", color: deep ? "rgba(255,255,255,.82)" : DS.textMuted }}>{b.note}</small>
                          )}
                          {single && !editMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markBlock(b, date, v === 0 ? 1 : v === 1 ? 3 : 0); }}
                              aria-label={`${b.label} · ${v === 1 ? "lo hice" : v === 3 ? "no lo hice" : "sin marcar"}`}
                              style={{
                                position: "absolute", right: 10, top: `min(50%, 22px)`, transform: "translateY(-50%)",
                                width: 28, height: chk, borderRadius: 8, padding: 0, cursor: "pointer", lineHeight: 1,
                                fontWeight: 800, fontSize: chk < 22 ? 11 : 15, color: "#fff",
                                border: `1.5px solid ${v === 1 ? DS.green : v === 3 ? DS.red : "rgba(127,127,127,.55)"}`,
                                background: v === 1 ? DS.green : v === 3 ? DS.red : DS.bgSide,
                              }}
                            >{v === 1 ? "✓" : v === 3 ? "✕" : ""}</button>
                          )}
                        </div>
                      );
                    })}
                    {(tasks || []).filter((t) => t.due_date === date && t.due_time && t.status !== "completado" && !meetings.has(t.id)).map((t) => {
                      const m = /^(\d{1,2}):(\d{2})/.exec(t.due_time);
                      if (!m) return null;
                      const startMin = Number(m[1]) * 60 + Number(m[2]);
                      if (startMin < START || startMin >= END) return null;
                      const mEnd = /^(\d{1,2}):(\d{2})/.exec(t.due_time_end || "");
                      const endMin = mEnd ? Number(mEnd[1]) * 60 + Number(mEnd[2]) : null;
                      const len = Math.max(15, endMin && endMin > startMin ? endMin - startMin : t.estimate_minutes || 30);
                      const hgt = Math.max(18, (len / 60) * H - 2);
                      return (
                        <div
                          key={t.id}
                          onClick={() => onOpenTask?.(t)}
                          title={`${fmtTime(startMin)}${endMin ? ` – ${fmtTime(endMin)}` : ""} · ${t.title}`}
                          style={{
                            position: "absolute", left: single ? "38%" : 10, right: single ? 56 : 2, top: ((startMin - START) / 60) * H + 1, height: hgt,
                            zIndex: 4, borderRadius: 7, boxSizing: "border-box", padding: "2px 8px", overflow: "hidden", cursor: "pointer",
                            background: DS.bgSide, border: `1.5px solid ${DS.amber}`, boxShadow: "0 4px 14px rgba(0,0,0,.18)",
                            fontFamily: DS.font, fontSize: single ? 12.5 : 11, lineHeight: 1.3, color: DS.textPrimary,
                            display: "flex", alignItems: hgt < 34 ? "center" : "flex-start", gap: 6, whiteSpace: hgt < 34 ? "nowrap" : "normal",
                          }}
                        >
                          <b style={{ color: DS.amber, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(startMin, false)}</b>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                        </div>
                      );
                    })}
                    {gcal.events.filter((ev) => !ev.allDay && dateStr(new Date(ev.start)) === date).map((ev, ei) => {
                      const st = new Date(ev.start);
                      const en = new Date(ev.end);
                      const startMin = st.getHours() * 60 + st.getMinutes();
                      const endMin = Math.max(startMin + 15, dateStr(en) === date ? en.getHours() * 60 + en.getMinutes() : END);
                      if (startMin >= END || endMin <= START) return null;
                      const top = ((Math.max(startMin, START) - START) / 60) * H + 1;
                      const hgt = Math.max(18, ((Math.min(endMin, END) - Math.max(startMin, START)) / 60) * H - 2);
                      const tinyEv = hgt < 38;
                      const linkedTask = taskOfEvent(ev);
                      return (
                        <div key={`g${ei}`} role="button" tabIndex={0}
                          onClick={() => setOpenEvent({ ev, task: linkedTask })}
                          onKeyDown={(e) => { if (e.key === "Enter") setOpenEvent({ ev, task: linkedTask }); }}
                          title={`${fmtTime(startMin)} – ${fmtTime(Math.min(endMin, 1439))} · ${ev.title}${ev.location ? ` · ${ev.location}` : ""}`} style={{
                          // Carril propio a la derecha, con el mismo lenguaje visual de los bloques (relleno sólido).
                          position: "absolute", left: single ? "62%" : "50%", right: single ? 50 : 2, top, height: hgt, zIndex: 5,
                          borderRadius: 8, boxSizing: "border-box", padding: tinyEv ? "0 9px" : "5px 10px", overflow: "hidden",
                          background: DS.purple, border: `1px solid ${DS.bgSide}`, boxShadow: "0 2px 8px rgba(0,0,0,.18)",
                          fontFamily: DS.font, fontSize: single ? 12.5 : 11, lineHeight: 1.3, color: "#fff",
                          display: "flex", flexDirection: tinyEv ? "row" : "column", alignItems: tinyEv ? "center" : "flex-start", gap: tinyEv ? 6 : 1,
                          whiteSpace: tinyEv ? "nowrap" : "normal", cursor: "pointer",
                        }}>
                          <span style={{ fontSize: "0.85em", fontWeight: 600, opacity: 0.85, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {fmtTime(startMin, false)}{tinyEv ? "" : ` – ${fmtTime(Math.min(endMin, 1439))}`}
                          </span>
                          <b style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{ev.joinUrl ? "🎥 " : ""}{ev.title}</b>
                        </div>
                      );
                    })}
                    {i === today && mNow >= START && mNow <= END && (
                      <div style={{ position: "absolute", left: 0, right: 0, top: ((mNow - START) / 60) * H, height: 2, background: DS.red, zIndex: 3, pointerEvents: "none" }}>
                        <span style={{ position: "absolute", left: -4, top: -4, width: 10, height: 10, borderRadius: "50%", background: DS.red }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <RutinaNotes memberId={memberId} column={single} />
      </div>

      {openEvent && (
        <EventCard
          ev={openEvent.ev} task={openEvent.task}
          onClose={() => setOpenEvent(null)}
          onOpenTask={(t) => { setOpenEvent(null); onOpenTask?.(t); }}
        />
      )}
      {gcalOpen && (
        <CalendarConnect memberId={memberId} error={gcal.error} onClose={() => setGcalOpen(false)} onChanged={() => setGcalTick((n) => n + 1)} />
      )}
      {blocks && !blocks.length && (
        <div style={{ fontSize: 13, color: DS.textMuted }}>
          Todavía no tienes rutina. Dale a <b>Editar rutina → + Agregar bloque</b> para armarla.
        </div>
      )}

      {editing && (
        <BlockEditor
          block={editing} habits={habits} memberId={memberId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadRoutineBlocks(memberId); }}
        />
      )}
    </div>
  );
}

function BlockEditor({ block, habits, memberId, onClose, onSaved }) {
  const [label, setLabel] = useState(block.label || "");
  const [start, setStart] = useState(toHHMM(block.start_min));
  const [end, setEnd] = useState(toHHMM(block.end_min));
  const [category, setCategory] = useState(block.category || "light");
  const [note, setNote] = useState(block.note || "");
  const [habitKey, setHabitKey] = useState(block.habit_key || "");
  const [days, setDays] = useState([block.day]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = !block.id;

  const submit = async () => {
    const s = fromHHMM(start);
    const e = fromHHMM(end);
    if (!label.trim()) return setError("Ponle un nombre al bloque.");
    if (s == null || e == null || e <= s) return setError("La hora de fin debe ser después de la de inicio.");
    setBusy(true);
    const targets = isNew ? days : [block.day];
    for (const day of targets) {
      const { error: err } = await saveBlock(memberId, { id: block.id, day, start_min: s, end_min: e, label, category, note, habit_key: habitKey });
      if (err) { setError(err.message); setBusy(false); return; }
    }
    onSaved();
  };
  const remove = async () => {
    if (!window.confirm(`¿Quitar "${block.label}" del ${DAY_NAMES[block.day].toLowerCase()}?`)) return;
    setBusy(true);
    const { error: err } = await deleteBlock(block.id);
    if (err) { setError(err.message); setBusy(false); return; }
    onSaved();
  };

  const field = {
    width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: `1px solid ${DS.textHint}`,
    background: "transparent", color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none",
  };
  const lab = { fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5, display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", background: DS.bgSide, border: DS.border, borderRadius: 16, padding: 20, fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DS.textPrimary }}>{isNew ? "Nuevo bloque" : `Editar bloque · ${DAY_NAMES[block.day]}`}</div>
        <div><label style={lab} htmlFor="rb-label">Nombre</label><input id="rb-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} style={field} placeholder="Ej: Trabajar, Gimnasio, Almuerzo" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lab} htmlFor="rb-start">Empieza</label><input id="rb-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} style={field} /></div>
          <div><label style={lab} htmlFor="rb-end">Termina</label><input id="rb-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={field} /></div>
        </div>
        <div>
          <span style={lab}>Tipo</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CAT_ORDER.map((c) => (
              <button key={c} onClick={() => setCategory(c)} style={{
                fontFamily: DS.font, fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 50, cursor: "pointer",
                border: `1px solid ${category === c ? CATS[c].color : DS.textHint}`, background: category === c ? `${CATS[c].color}22` : "transparent", color: DS.textPrimary,
              }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: CATS[c].color, marginRight: 6 }} />{CATS[c].name}</button>
            ))}
          </div>
        </div>
        {isNew && (
          <div>
            <span style={lab}>Días</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAY_SHORT.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button key={d} onClick={() => setDays((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))} style={{
                    fontFamily: DS.font, fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 50, cursor: "pointer",
                    border: `1px solid ${on ? DS.blue : DS.textHint}`, background: on ? DS.blue : "transparent", color: on ? "#fff" : DS.textPrimary,
                  }}>{d}</button>
                );
              })}
            </div>
          </div>
        )}
        <div><label style={lab} htmlFor="rb-note">Nota (opcional)</label><input id="rb-note" value={note} onChange={(e) => setNote(e.target.value)} style={field} /></div>
        <div>
          <label style={lab} htmlFor="rb-habit">Al marcarlo, cuenta para el hábito</label>
          <select id="rb-habit" value={habitKey} onChange={(e) => setHabitKey(e.target.value)} style={field}>
            <option value="">Ninguno</option>
            {habits.map((h) => <option key={h.id} value={h.key}>{h.name}</option>)}
          </select>
        </div>
        {error && <div style={{ fontSize: 12, color: DS.red }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          {!isNew ? <button onClick={remove} disabled={busy} style={{ background: "transparent", border: "none", color: DS.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>Quitar bloque</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 50, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>Cancelar</button>
            <button onClick={submit} disabled={busy} style={{ padding: "8px 16px", borderRadius: 50, border: "none", background: DS.textPrimary, color: DS.bg, fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: DS.font }}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Ficha de una reunión de Google Calendar: hora, link para unirse, lugar, descripción y,
// si existe, la tarea del portal que corresponde a esa misma reunión.
function EventCard({ ev, task, onClose, onOpenTask }) {
  const st = new Date(ev.start);
  const en = new Date(ev.end);
  const hm = (d) => fmtTime(d.getHours() * 60 + d.getMinutes());
  const ghost = { padding: "8px 14px", borderRadius: 50, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: DS.bgSide, border: DS.border, borderTop: `4px solid ${DS.purple}`, borderRadius: 16, padding: 22, fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.purple }}>Google Calendar</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: DS.textPrimary, lineHeight: 1.25 }}>{ev.title}</div>
        <div style={{ fontSize: 13, color: DS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
          {st.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} · {hm(st)} – {hm(en)}
        </div>
        {ev.joinUrl && (
          <a href={ev.joinUrl} target="_blank" rel="noreferrer" style={{
            alignSelf: "flex-start", padding: "10px 18px", borderRadius: 50, background: DS.purple, color: "#fff",
            fontSize: 13, fontWeight: 800, textDecoration: "none",
          }}>🎥 Unirme a la llamada</a>
        )}
        {ev.editUrl && (
          <a href={ev.editUrl} target="_blank" rel="noreferrer" title="Abre este evento en Google Calendar para cambiarle la hora, los invitados o cancelarlo" style={{
            alignSelf: "flex-start", padding: "8px 14px", borderRadius: 50, border: `1px solid ${DS.textHint}`, color: DS.textPrimary,
            fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}>✏️ Ajustar en Google Calendar</a>
        )}
        {ev.location && <div style={{ fontSize: 12.5, color: DS.textSecondary }}>📍 {ev.location}</div>}
        {ev.description && (
          <div style={{ fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", borderTop: DS.border, paddingTop: 10 }}>{ev.description}</div>
        )}
        {!ev.joinUrl && !ev.description && <div style={{ fontSize: 12, color: DS.textMuted }}>Este evento no trae descripción ni link de llamada.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {task && <button onClick={() => onOpenTask(task)} style={ghost}>Abrir la tarea</button>}
          <button onClick={onClose} style={{ ...ghost, background: DS.textPrimary, color: DS.bg, borderColor: DS.textPrimary }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
