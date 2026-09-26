import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { usePathRoute } from "../../lib/router.jsx";
import { Topbar } from "../layout/Topbar.jsx";
import { useRutina } from "./useRutina.js";
import { RutinaCalendar } from "./RutinaCalendar.jsx";
import { RutinaHabits } from "./RutinaHabits.jsx";
import { RutinaReports } from "./RutinaReports.jsx";
import { TaskModal } from "../tasks/TaskModal.jsx";
import { getTaskTimeState, stopTaskSession } from "../tasks/taskTimeStore.js";
import {
  CATS, CAT_ORDER, DAY_SHORT, dateStr, dayIndex, fmtDur, fmtTime, mondayOf, pad,
} from "./rutinaShared.js";

const TABS = [["calendario", "Calendario"], ["habitos", "Hábitos"], ["tiempo", "Tiempo"], ["reportes", "Reportes"]];
const DEFAULT_ALARM_CFG = {
  start: Object.fromEntries(CAT_ORDER.map((c) => [c, 1])),
  pre: 5,
  preCats: { gym: 1, therapy: 1, calls: 1 },
  repeat: 1,
  custom: [
    { t: "10:00", l: "Batido de ganancia" },
    { t: "11:15", l: "Descanso de 10 minutos" },
    { t: "17:30", l: "Batido al llegar del gimnasio" },
  ],
};
function loadAlarmCfg() {
  try {
    const r = JSON.parse(localStorage.getItem("rutina_alarm_cfg") || "null");
    if (r && typeof r === "object") return { ...DEFAULT_ALARM_CFG, ...r, custom: Array.isArray(r.custom) ? r.custom.slice(0, 20) : DEFAULT_ALARM_CFG.custom };
  } catch { /* sin storage */ }
  return DEFAULT_ALARM_CFG;
}
const ls = (k, v) => {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* sin storage */ }
  return null;
};
const clock = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${h ? pad(m) : m}:${pad(s % 60)}`;
};

export function RutinaPage({ member, tasks, members, spaces, companies }) {
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const tab = TABS.some(([k]) => k === segments[1]) ? segments[1] : "calendario";
  const [monday, setMonday] = useState(() => mondayOf());
  const calendarMonday = useMemo(() => mondayOf(), []);
  const data = useRutina(member.id, tab === "habitos" ? monday : calendarMonday);
  const [openTask, setOpenTask] = useState(null); // tarea | "new"
  const myTasks = useMemo(
    () => (tasks || []).filter((t) => (t.assigneeIds || []).includes(member.id) || t.created_by === member.id),
    [tasks, member.id]
  );
  const tabsEl = (
    <div style={{ display: "flex", gap: 2, background: DS.bgCard, border: DS.border, borderRadius: 10, padding: 3, width: "fit-content" }}>
      {TABS.map(([k, label]) => (
        <button key={k} onClick={() => navigate(`/rutina/${k}`)} style={{
          fontFamily: DS.font, fontWeight: 700, fontSize: 12.5, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
          background: tab === k ? DS.textPrimary : "transparent", color: tab === k ? DS.bg : DS.textMuted,
        }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar title="Mi rutina" subtitle={new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} actions={tabsEl} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <NowBar blocks={data.blocks} checks={data.checks} />
        {tab === "calendario" && (
          <RutinaCalendar memberId={member.id} monday={calendarMonday} blocks={data.blocks} checks={data.checks} markBlock={data.markBlock} habits={data.habits} tasks={myTasks} onOpenTask={setOpenTask} />
        )}
        {tab === "habitos" && (
          <RutinaHabits memberId={member.id} reloadHabits={data.reloadHabits} monday={monday} setMonday={setMonday} habits={data.habits} logs={data.logs} weights={data.weights} markHabit={data.markHabit} saveWeight={data.saveWeight} />
        )}
        {tab === "tiempo" && <RutinaTime blocks={data.blocks} />}
        {tab === "reportes" && <RutinaReports memberId={member.id} blocks={data.blocks} />}
      </div>
      {openTask && (
        <TaskModal
          task={openTask === "new" ? null : openTask}
          members={members} spaces={spaces} companies={companies} currentMember={member}
          onClose={() => setOpenTask(null)} onSaved={() => setOpenTask(null)}
        />
      )}
      <div>
      </div>
    </div>
  );
}

// ---------- Ahora / Faltan / Sigue + alarmas ----------
function NowBar({ blocks }) {
  const [now, setNow] = useState(() => new Date());
  const [alarmOn, setAlarmOn] = useState(() => ls("rutina_alarm") === "1");
  const [pending, setPending] = useState(null); // id del bloque que acaba de empezar
  const [audioLive, setAudioLive] = useState(false);
  const [cfg, setCfg] = useState(loadAlarmCfg);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [flash, setFlash] = useState(null);
  const audio = useRef({ ctx: null, ring: null, warned: "", fired: {} });
  const updateCfg = (patch) => setCfg((prev) => { const next = { ...prev, ...patch }; ls("rutina_alarm_cfg", JSON.stringify(next)); return next; });
  const prevId = useRef(undefined);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = useMemo(() => (blocks || []).filter((b) => b.day === dayIndex(now)).sort((a, b) => a.start_min - b.start_min), [blocks, now]);
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const min = Math.floor(sec / 60);
  const cur = today.find((b) => min >= b.start_min && min < b.end_min) || null;
  const next = cur ? today[today.indexOf(cur) + 1] || null : today.find((b) => min < b.start_min) || null;

  const ensureAudio = () => {
    try {
      const a = audio.current;
      if (!a.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; a.ctx = new AC(); }
      if (a.ctx.state === "suspended") a.ctx.resume();
      setTimeout(() => setAudioLive(a.ctx.state === "running"), 150);
      return true;
    } catch { return false; }
  };
  const pattern = (dest, t0, soft) => {
    const ctx = audio.current.ctx;
    (soft ? [660, 880] : [880, 1108, 1318, 1108, 1318, 1760]).forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t0 + i * 0.17;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.42);
      o.connect(g); g.connect(dest); o.start(s); o.stop(s + 0.45);
    });
  };
  const killRing = () => { const a = audio.current; if (a.ring) { try { a.ring.master.disconnect(); } catch { /* ya cerrado */ } a.ring = null; } };
  // El sonido se programa por adelantado en el reloj de audio: suena a la hora exacta y
  // seguido aunque la pestaña esté en segundo plano (donde el navegador frena los timers).
  const startRing = (key, delay, continuous = !!cfg.repeat) => {
    const a = audio.current;
    if (!alarmOn || !a.ctx || a.ctx.state !== "running" || a.ring?.key === key) return;
    killRing();
    const master = a.ctx.createGain();
    master.connect(a.ctx.destination);
    const t0 = a.ctx.currentTime + Math.max(0.02, delay);
    for (let r = 0; r < (continuous ? 60 : 1); r++) pattern(master, t0 + r * 3, false);
    a.ring = { key, master, from: Date.now() + delay * 1000, until: Date.now() + (delay + (continuous ? 180 : 3)) * 1000 };
  };

  useEffect(() => {
    if (!blocks) return; // hasta que cargue la rutina no hay transición que anunciar
    const id = cur?.id ?? null;
    if (prevId.current !== undefined && id !== prevId.current) {
      if (id) { setPending(id); if (cfg.start[cur.category]) startRing(`${dateStr(now)}#${cur.start_min}`, 0); }
      else { setPending(null); killRing(); }
    }
    prevId.current = id;
    if (next) {
      const toNext = next.start_min * 60 - sec;
      if (toNext > 0 && toNext <= 75 && cfg.start[next.category]) startRing(`${dateStr(now)}#${next.start_min}`, toNext);
      const a = audio.current;
      const warnKey = `${dateStr(now)}w${next.start_min}`;
      if (alarmOn && a.ctx?.state === "running" && cfg.pre > 0 && cfg.preCats[next.category] && a.warned !== warnKey
        && toNext <= cfg.pre * 60 + 75 && toNext > cfg.pre * 60 - 10) {
        a.warned = warnKey;
        const delay = Math.max(0.02, toNext - cfg.pre * 60);
        pattern(a.ctx.destination, a.ctx.currentTime + delay, true);
        pattern(a.ctx.destination, a.ctx.currentTime + delay + 2.5, true);
      }
    }
    // Alarmas a hora fija
    const a2 = audio.current;
    cfg.custom.forEach((al, i) => {
      const m = /^(\d\d):(\d\d)$/.exec(al.t || "");
      if (!m) return;
      const diff = Number(m[1]) * 3600 + Number(m[2]) * 60 - sec;
      const key = `${dateStr(now)}c${i}${al.t}`;
      if (diff > -30 && diff <= 75 && !a2.fired[key]) {
        a2.fired[key] = 1;
        const delay = Math.max(0.02, diff);
        if (alarmOn && a2.ctx?.state === "running") for (let r = 0; r < 4; r++) pattern(a2.ctx.destination, a2.ctx.currentTime + delay + r * 2.5, false);
        setFlash({ text: `Alarma: ${al.l || al.t}`, from: Date.now() + delay * 1000, until: Date.now() + (delay + 90) * 1000 });
      }
    });
  }); // corre en cada tick (1 s): compara contra el reloj, no contra el render anterior

  useEffect(() => {
    if (!alarmOn) return undefined;
    const wake = () => ensureAudio();
    document.addEventListener("pointerdown", wake, true);
    return () => document.removeEventListener("pointerdown", wake, true);
  }, [alarmOn]);
  useEffect(() => () => killRing(), []);

  const toggleAlarm = () => {
    if (alarmOn && audioLive) { setAlarmOn(false); ls("rutina_alarm", "0"); killRing(); return; }
    setAlarmOn(true); ls("rutina_alarm", "1");
    if (ensureAudio()) setTimeout(() => { const a = audio.current; if (a.ctx?.state === "running") pattern(a.ctx.destination, a.ctx.currentTime + 0.05, true); }, 200);
  };
  const ack = () => {
    setPending(null); killRing();
    // Si arranca un bloque que no es de trabajo (almuerzo, gimnasio…) y hay una tarea corriendo, se pausa sola.
    if (cur && !CATS[cur.category]?.work && getTaskTimeState().active) {
      stopTaskSession({ endKind: "pausa", pauseKind: null, reason: `Sigo después · empezó ${cur.label}` });
    }
  };

  const ring = audio.current.ring;
  const ringing = pending && ring && Date.now() >= ring.from && Date.now() < ring.until;
  const left = cur ? cur.end_min * 60 - sec : next ? next.start_min * 60 - sec : null;
  const progress = cur ? Math.min(100, ((sec - cur.start_min * 60) / ((cur.end_min - cur.start_min) * 60)) * 100) : 0;

  const label = { fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.textMuted };
  const cell = { padding: "14px 18px", display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: "1 1 190px", borderLeft: DS.border };
  const dot = (cat) => <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: CATS[cat]?.color, marginRight: 8 }} />;
  if (blocks && !blocks.length) return null;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", background: DS.bgCard, borderRadius: 16, overflow: "hidden",
      border: ringing ? `1px solid ${DS.red}` : DS.border, boxShadow: ringing ? `0 0 0 3px ${DS.red}33` : "none",
    }}>
      <div style={{ ...cell, borderLeft: "none", flex: "1.3 1 220px" }}>
        <div style={label}>Ahora</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: DS.textPrimary }}>
          {cur ? <>{dot(cur.category)}{cur.label}</> : min >= (today[today.length - 1]?.end_min || 0) ? "A dormir" : "Todavía no arranca el día"}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: `${DS.textHint}55`, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: cur ? CATS[cur.category]?.color : "transparent", borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 12, color: DS.textMuted, fontVariantNumeric: "tabular-nums" }}>{cur ? `${fmtTime(cur.start_min)} – ${fmtTime(cur.end_min)}` : ""}</div>
      </div>
      <div style={cell}>
        <div style={label}>Faltan</div>
        <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{left != null ? clock(left) : "–"}</div>
        <div style={{ fontSize: 12, color: DS.textMuted }}>{cur ? `hasta las ${fmtTime(cur.end_min)}` : next ? "para arrancar" : ""}</div>
      </div>
      <div style={{ ...cell, flex: "1.3 1 220px" }}>
        <div style={label}>Sigue</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: DS.textPrimary }}>{next ? <>{dot(next.category)}{next.label}</> : "Dormir"}</div>
        <div style={{ fontSize: 12, color: DS.textMuted, fontVariantNumeric: "tabular-nums" }}>{next ? `${fmtTime(next.start_min)} · ${fmtDur(next.end_min - next.start_min)}` : ""}</div>
      </div>
      <div style={{ ...cell, flex: "0 1 170px", justifyContent: "center", alignItems: "flex-start" }}>
        {pending && cur && (
          <button onClick={ack} style={{ fontFamily: DS.font, fontWeight: 700, fontSize: 13, padding: "10px 14px", borderRadius: 10, border: "none", background: DS.blue, color: "#fff", cursor: "pointer" }}>
            Arrancar {cur.label}
          </button>
        )}
        {flash && Date.now() >= flash.from && Date.now() < flash.until && (
          <div style={{ fontSize: 12, fontWeight: 700, color: DS.amber }}>{flash.text}</div>
        )}
        <button onClick={toggleAlarm} style={{
          fontFamily: DS.font, fontWeight: 600, fontSize: 11.5, padding: "5px 10px", borderRadius: 50, cursor: "pointer", background: "transparent",
          border: `1px solid ${alarmOn && audioLive ? DS.green : DS.textHint}`, color: alarmOn && audioLive ? DS.green : DS.textMuted,
        }}>
          {!alarmOn ? "Activar alarmas" : audioLive ? "Alarmas activadas" : "Toca para activar el sonido"}
        </button>
        <button onClick={() => setCfgOpen((v) => !v)} style={{ background: "transparent", border: "none", padding: 0, color: DS.textMuted, fontSize: 11, fontFamily: DS.font, cursor: "pointer", textDecoration: "underline" }}>
          {cfgOpen ? "Cerrar" : "Configurar"}
        </button>
      </div>
      {cfgOpen && (
        <AlarmConfig cfg={cfg} updateCfg={updateCfg} onTest={() => { if (ensureAudio()) setTimeout(() => { const a = audio.current; if (a.ctx?.state === "running") pattern(a.ctx.destination, a.ctx.currentTime + 0.05, false); }, 200); }} />
      )}
    </div>
  );
}

function AlarmConfig({ cfg, updateCfg, onTest }) {
  const h3 = { fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted };
  const field = { padding: "6px 9px", borderRadius: 8, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 12.5, fontFamily: DS.font, outline: "none" };
  const ghost = { fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary };
  const chips = (obj, key) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {CAT_ORDER.filter((c) => c !== "other").map((c) => (
        <button key={c} aria-pressed={!!obj[c]} onClick={() => updateCfg({ [key]: { ...obj, [c]: obj[c] ? 0 : 1 } })} style={{
          fontFamily: DS.font, fontWeight: 700, fontSize: 11.5, padding: "5px 10px", borderRadius: 50, cursor: "pointer", background: "transparent",
          border: `1px solid ${obj[c] ? DS.textPrimary : DS.textHint}`, color: obj[c] ? DS.textPrimary : DS.textMuted,
        }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: CATS[c].color, marginRight: 6 }} />{CATS[c].name}</button>
      ))}
    </div>
  );
  const setCustom = (i, patch) => updateCfg({ custom: cfg.custom.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div style={{ flex: "1 1 100%", borderTop: DS.border, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={h3}>Suena cuando empieza un bloque de</div>{chips(cfg.start, "start")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={h3}>Aviso antes de que empiece</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: DS.textPrimary }}>
          <label htmlFor="al-pre">Avisarme</label>
          <select id="al-pre" value={cfg.pre} onChange={(e) => updateCfg({ pre: Number(e.target.value) })} style={field}>
            <option value={0}>nunca</option><option value={2}>2 min antes</option><option value={5}>5 min antes</option><option value={10}>10 min antes</option><option value={15}>15 min antes</option>
          </select>
          de estos bloques:
        </div>
        {chips(cfg.preCats, "preCats")}
      </div>
      <label htmlFor="al-repeat" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: DS.textPrimary }}>
        <input id="al-repeat" type="checkbox" checked={!!cfg.repeat} onChange={(e) => updateCfg({ repeat: e.target.checked ? 1 : 0 })} />
        Seguir sonando (hasta 3 minutos) hasta que le dé "Arrancar"
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={h3}>Alarmas a una hora fija</div>
        {cfg.custom.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input id={`al-t-${i}`} aria-label={`Hora de la alarma ${i + 1}`} type="time" value={a.t} onChange={(e) => setCustom(i, { t: e.target.value })} style={field} />
            <input id={`al-l-${i}`} aria-label={`Texto de la alarma ${i + 1}`} type="text" maxLength={60} value={a.l || ""} placeholder="Qué te recuerda" onChange={(e) => setCustom(i, { l: e.target.value })} style={{ ...field, flex: 1, minWidth: 140 }} />
            <button onClick={() => updateCfg({ custom: cfg.custom.filter((_, j) => j !== i) })} style={ghost}>Quitar</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => cfg.custom.length < 20 && updateCfg({ custom: [...cfg.custom, { t: "12:00", l: "" }] })} style={ghost}>+ Agregar alarma</button>
          <button onClick={onTest} style={ghost}>Probar sonido</button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: DS.textMuted }}>Suenan aunque estés en otra aplicación o pestaña, mientras el portal siga abierto en el navegador y el computador no esté suspendido. Se guardan en este dispositivo.</div>
    </div>
  );
}

// ---------- Tiempo planeado por categoría ----------
function RutinaTime({ blocks }) {
  const [sel, setSel] = useState(() => {
    try { return JSON.parse(ls("rutina_sel") || "null") || { deep: 1, light: 1, calls: 1 }; } catch { return { deep: 1, light: 1, calls: 1 }; }
  });
  const toggle = (c) => setSel((prev) => { const next = { ...prev, [c]: prev[c] ? 0 : 1 }; ls("rutina_sel", JSON.stringify(next)); return next; });
  const cats = CAT_ORDER.filter((c) => (blocks || []).some((b) => b.category === c));
  const per = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const o = Object.fromEntries(cats.map((c) => [c, 0]));
    (blocks || []).filter((b) => b.day === d).forEach((b) => { o[b.category] += b.end_min - b.start_min; });
    return o;
  });
  const week = Object.fromEntries(cats.map((c) => [c, per.reduce((a, o) => a + o[c], 0)]));
  const chosen = cats.filter((c) => sel[c]);
  const sumSel = (o) => chosen.reduce((a, c) => a + o[c], 0);
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DS.textMuted, padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" };
  const td = { padding: "7px 8px", textAlign: "center", fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: DS.textPrimary };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted }}>Elige qué categorías sumar</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cats.map((c) => (
            <button key={c} onClick={() => toggle(c)} aria-pressed={!!sel[c]} style={{
              fontFamily: DS.font, fontWeight: 700, fontSize: 12, padding: "6px 11px", borderRadius: 50, cursor: "pointer",
              border: `1px solid ${sel[c] ? DS.textPrimary : DS.textHint}`, background: "transparent", color: sel[c] ? DS.textPrimary : DS.textMuted,
            }}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: CATS[c].color, marginRight: 6 }} />{CATS[c].name}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {[
          ["Suma de lo seleccionado", `${fmtDur(sumSel(week))} a la semana`, `${chosen.map((c) => CATS[c].name).join(" + ") || "Nada seleccionado"} · ${fmtDur(sumSel(week) / 7)} por día en promedio`, true],
          ["Trabajo profundo", fmtDur(week.deep || 0), `a la semana · ${fmtDur((week.deep || 0) / 7)} por día`],
          ["Llamadas", fmtDur(week.calls || 0), "dailies y grupales"],
          ["Gimnasio", fmtDur(week.gym || 0), `${per.filter((o) => o.gym).length} días, puerta a puerta`],
        ].map(([k, v, sub, hl]) => (
          <div key={k} style={{ background: DS.bgCard, border: hl ? `1px solid ${DS.blue}` : DS.border, borderRadius: 14, padding: "12px 14px", gridColumn: hl ? "span 2" : "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted }}>{k}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: DS.textPrimary, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            <div style={{ fontSize: 12, color: DS.textMuted }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: DS.textPrimary }}>Tus horas despierto, día por día</div>
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 64px", gap: 10, fontSize: 10.5, color: DS.textMuted }}><span /><span /><span style={{ textAlign: "right" }}>selección</span></div>
        {per.map((o, d) => {
          const dayBlocks = (blocks || []).filter((b) => b.day === d).sort((a, b) => a.start_min - b.start_min);
          return (
            <div key={d} style={{ display: "grid", gridTemplateColumns: "36px 1fr 64px", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{DAY_SHORT[d]}</div>
              <div style={{ position: "relative", height: 26, borderRadius: 6, overflow: "hidden", background: `${DS.textHint}44` }}>
                {dayBlocks.map((b) => (
                  <div key={b.id} title={`${b.label} · ${fmtTime(b.start_min)} – ${fmtTime(b.end_min)}`} style={{
                    position: "absolute", top: 0, bottom: 0, left: `${((b.start_min - 360) / 960) * 100}%`, width: `${((b.end_min - b.start_min) / 960) * 100}%`,
                    background: CATS[b.category]?.color, opacity: sel[b.category] ? 1 : 0.22, borderRight: `1px solid ${DS.bgSide}`, boxSizing: "border-box",
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{fmtDur(sumSel(o))}</div>
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 64px", gap: 10, fontSize: 10.5, color: DS.textMuted }}>
          <span /><div style={{ display: "flex", justifyContent: "space-between" }}><span>6 am</span><span>10 am</span><span>2 pm</span><span>6 pm</span><span>10 pm</span></div><span />
        </div>
      </div>
      <div style={{ overflowX: "auto", background: DS.bgCard, border: DS.border, borderRadius: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: DS.font }}>
          <thead><tr><th style={{ ...th, textAlign: "left", paddingLeft: 14 }}>Categoría</th>{DAY_SHORT.map((d) => <th key={d} style={th}>{d}</th>)}<th style={th}>Semana</th><th style={th}>Promedio día</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c} style={{ borderTop: DS.border, opacity: sel[c] ? 1 : 0.55 }}>
                <td style={{ ...td, textAlign: "left", paddingLeft: 14, fontWeight: 600 }}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: CATS[c].color, marginRight: 8 }} />{CATS[c].name}</td>
                {per.map((o, i) => <td key={i} style={td}>{o[c] ? fmtDur(o[c]) : "–"}</td>)}
                <td style={{ ...td, fontWeight: 800 }}>{fmtDur(week[c])}</td><td style={td}>{fmtDur(week[c] / 7)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: DS.border, background: `${DS.textHint}22` }}>
              <td style={{ ...td, textAlign: "left", paddingLeft: 14, fontWeight: 800 }}>Suma de lo seleccionado</td>
              {per.map((o, i) => <td key={i} style={{ ...td, fontWeight: 800 }}>{fmtDur(sumSel(o))}</td>)}
              <td style={{ ...td, fontWeight: 800 }}>{fmtDur(sumSel(week))}</td><td style={{ ...td, fontWeight: 800 }}>{fmtDur(sumSel(week) / 7)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: DS.textMuted, margin: 0 }}>Este es el tiempo planeado según tu rutina. El tiempo real trabajado lo ves en Mi agenda y en Mi tiempo.</p>
    </div>
  );
}
