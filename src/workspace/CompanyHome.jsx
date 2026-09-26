import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useCompanyMask } from "../lib/censor.jsx";
import { getBoardByCompany, listConcepts } from "../despliegue/db.js";
import {
  PIPELINE_STATUSES,
  listSlotsForBoard,
  currentWeekIso,
} from "../despliegue/pipeline_db.js";
import { ROLE_BY_KEY } from "./team_roles.js";
import { listTeamMembers } from "./team_db.js";
import { CompanyMemberProfile } from "./CompanyMemberProfile.jsx";
import { useCompanyTasks } from "./tasks/hooks/useCompanyTasks.js";
import { TaskModal } from "./tasks/TaskModal.jsx";
import { TasksBoard } from "./tasks/TasksBoard.jsx";
import { puedeVerNumerosDelNegocio, MOTIVO_SIN_NUMEROS } from "./permissions/vista_negocio.js";
import { dayKey, addDays } from "./tasks/centerModel.js";

// Resumen (Cliente) — CompanyHome. Portado del diseño "Cliente — Resumen".
// Estructura: header (título Resumen + período + compartir) → KPIs (4) →
// tira "Tu equipo Inforce" → tabs Operación/Contenido.
//   Operación: Tareas de la cuenta + (Actividad reciente · Próximas entregas).
//   Contenido: Cumplimiento semanal + Pipeline de la semana + Estrategia por embudo.
// Los tokens salen de index.css (var(--...)) → doble tema sin re-render.

const PERIOD_OPTIONS = [
  { key: "today", label: "Hoy", days: 1 },
  { key: "7d",    label: "7 días", days: 7 },
  { key: "30d",   label: "30 días", days: 30 },
  { key: "90d",   label: "3 meses", days: 90 },
];

// Iconos SVG de trazo (cero emoji).
const IC = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5",
  link: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1",
  check2: "M20 6 9 17l-5-5",
  ops: "M9 3h6v3H9zM7 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M9 12h6M9 16h4",
  film: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 9h18M3 15h18M8.5 3v18M15.5 3v18",
  filter: "M3 5h18M6 12h12M10 19h4",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 5l7 7-7 7",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  crown: "M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-1.7 11H4.7L3 7z",
  gauge: "M22 12h-4l-3 9L9 3l-3 9H2",
  retry: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  warn: "M10.3 3.9 2.5 17.5A1.7 1.7 0 0 0 4 20h16a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0zM12 9v4M12 17h.01",
};

// Tinte fijo (los `${color}22` no funcionan con var()).
const TINT = {
  green: "rgba(52,192,138,0.13)", amber: "rgba(240,169,59,0.15)",
  brand: "var(--brand-soft)", sel: "var(--sel-soft)",
  purple: "rgba(155,123,240,0.15)", chip: "var(--chip)",
};

const MAX_LIVE_CARDS = 6;

const Icon = ({ d, size = 15, sw = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
    <path d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Board de tareas (columnas + colores de prioridad).
const BOARD_COLS = [
  { key: "pendiente",  label: "Pendiente",  color: "var(--sel)" },
  { key: "en_curso",   label: "En curso",   color: "var(--amber)" },
  { key: "completado", label: "Completado", color: "var(--green)" },
];
const PRIO = {
  urgente: { color: "var(--brand)", bg: "var(--brand-soft)", label: "Urgente" },
  alta:    { color: "var(--amber)", bg: TINT.amber, label: "Alta" },
  normal:  { color: "var(--sel)",   bg: "var(--sel-soft)", label: "Normal" },
  baja:    { color: "var(--ink-3)", bg: "var(--chip)", label: "Baja" },
};
// Tiempo relativo simple: "hace 6 min" / "hace 2 h" / "hace 3 d" / "ayer".
function fmtRel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return "ayer";
  return `hace ${days} d`;
}

export function CompanyHome({ companyId, companyName, companySlug, isAdmin, esInforce = false, currentMember = null, onNavigate, reports = [], objectives = null, calcMetrics = null }) {
  const { isDark } = useTheme();
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);

  const [board, setBoard] = useState(null);
  const [slots, setSlots] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [activeTab, setActiveTab] = useState("operations");
  const [profileMember, setProfileMember] = useState(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const canShareClientLink = isAdmin || currentMember?.is_owner;
  const slug = companySlug
    || (companyName || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const clientUrl = typeof window !== "undefined" && slug ? `${window.location.origin}/cliente/${slug}` : "";

  const handleCopyClientLink = async () => {
    if (!clientUrl) return;
    try {
      await navigator.clipboard.writeText(clientUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch (e) {
      window.prompt("Copia este link:", clientUrl);
    }
  };

  const { tasks } = useCompanyTasks(companyId);
  const membersForTasks = useMemo(
    () => members.map((m) => ({ ...m, color: m.avatar_color || "var(--blue)" })),
    [members]
  );

  const weekIso = useMemo(() => currentWeekIso(), []);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const b = await getBoardByCompany(companyId);
      setBoard(b);
      const loads = [listTeamMembers(companyId)];
      if (b) {
        loads.push(listSlotsForBoard(b.id));
        loads.push(listConcepts(b.id));
      }
      const [ms, sl = [], cs = []] = await Promise.all(loads);
      setMembers(ms);
      setSlots(sl);
      setConcepts(cs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const b = await getBoardByCompany(companyId);
        if (cancelled) return;
        setBoard(b);
        const loads = [listTeamMembers(companyId)];
        if (b) {
          loads.push(listSlotsForBoard(b.id));
          loads.push(listConcepts(b.id));
        }
        const [ms, sl = [], cs = []] = await Promise.all(loads);
        if (cancelled) return;
        setMembers(ms);
        setSlots(sl);
        setConcepts(cs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const periodDef = PERIOD_OPTIONS.find((p) => p.key === period) || PERIOD_OPTIONS[2];
  const kpis = useMemo(() => aggregateKpis(reports, periodDef.days, calcMetrics), [reports, periodDef.days, calcMetrics]);

  const lastReportLabel = useMemo(() => {
    const dates = (reports || []).map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    const d = new Date(dates[dates.length - 1]);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  }, [reports]);

  const weekSlots = useMemo(() => slots.filter((s) => s.week_iso === weekIso), [slots, weekIso]);
  const countsByStatus = useMemo(() => {
    const m = {};
    for (const s of PIPELINE_STATUSES) m[s.key] = 0;
    for (const s of weekSlots) if (m[s.status] !== undefined) m[s.status] += 1;
    return m;
  }, [weekSlots]);

  const config = board?.config || {};
  const spend = Number(config.weekly_spend) || 0;
  const aov = Number(config.aov) || 0;
  const mult = Number(config.kill_rule_multiplier) || 3;
  const budgetPerCreative = aov * mult;
  const testingShare = Number(config?.budget_split?.testing ?? 30);
  const testingBudget = spend * (testingShare / 100);
  const weekTarget = (budgetPerCreative > 0 && testingBudget > 0)
    ? Math.floor(testingBudget / budgetPerCreative)
    : 0;
  const doneWeek = countsByStatus["in_campaign"] + countsByStatus["feedback"];

  const fmtCOP = (n) => `$${Math.round(n || 0).toLocaleString("es-CO")}`;
  const fmtNum = (n) => Math.round(n || 0).toLocaleString("es-CO");


  // Próximas entregas: tareas abiertas con fecha, ordenadas por vencimiento (datos reales).
  const upcoming = useMemo(() => {
    const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
    return (tasks || [])
      .filter((t) => t.status !== "completado" && t.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 4)
      .map((t) => {
        const who = (t.assigneeIds || []).map((id) => memberById[id]?.name?.split(" ")[0]).filter(Boolean)[0] || "Sin asignar";
        const overdue = new Date(t.due_date + "T23:59:59") < new Date(new Date().toDateString());
        const dueLabel = fmtDue(t.due_date);
        return { id: t.id, title: t.title, who, stage: t.status === "en_curso" ? "En curso" : "Pendiente", due: overdue ? `Vencida ${dueLabel}` : dueLabel, overdue, task: t };
      });
  }, [tasks, members]);

  // Actividad reciente: derivada de tareas reales (últimas por updated_at).
  const activity = useMemo(() => {
    const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
    return (tasks || [])
      .slice()
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .slice(0, 8)
      .map((t) => {
        const m = (t.assigneeIds || []).map((id) => memberById[id]).filter(Boolean)[0];
        const verb = t.status === "completado" ? "completó" : (t.status === "en_curso" ? "avanzó en" : "creó");
        return {
          id: t.id, task: t,
          who: m?.name?.split(" ")[0] || "Equipo",
          initial: (m?.name || "•").charAt(0).toUpperCase(),
          color: m?.avatar_color || "var(--ink-4)",
          verb, title: t.title,
          when: fmtRel(t.updated_at || t.created_at),
        };
      });
  }, [tasks, members]);

  // Board agrupado por estado (para el mini-board de Operación).
  const boardByStatus = useMemo(() => {
    const g = { pendiente: [], en_curso: [], completado: [] };
    for (const t of tasks || []) if (g[t.status]) g[t.status].push(t);
    return g;
  }, [tasks]);

  const roasTarget = objectives?.roasTarget || 3;
  const roasVal = kpis && kpis.spend > 0 ? kpis.revenue / kpis.spend : null;

  // Los números de la cuenta no son para todos: un editor entra a editar, y hasta
  // ahora lo primero que leía al abrir el portal era cuánto factura el cliente.
  const verNumeros = puedeVerNumerosDelNegocio({ esInforce, member: currentMember });

  const kpiCards = [
    {
      label: "Ventas atribuidas", color: "var(--green)",
      hint: "Total facturado en el período según los reportes cargados.",
      value: kpis ? fmtCOP(kpis.revenue) : "—",
      sub: kpis ? `${fmtNum(kpis.purchases)} compras` : "sin datos",
    },
    {
      label: "Inversión", color: "var(--sel)",
      hint: "Cuánto se invirtió en pauta en el período.",
      value: kpis ? fmtCOP(kpis.spend) : "—",
      sub: kpis ? "en pauta" : "sin datos",
    },
    {
      label: "Costo por compra", color: "var(--amber)",
      hint: "Cuánto costó en pauta conseguir cada compra (inversión ÷ compras). Más bajo es mejor.",
      value: kpis && kpis.purchases > 0 ? fmtCOP(kpis.spend / kpis.purchases) : "—",
      sub: kpis ? "por compra" : "sin datos",
    },
    {
      label: "ROAS", color: "var(--purple)",
      hint: `Por cada $1 invertido, cuántos $ vuelven en ventas. Objetivo de la cuenta: ${roasTarget}×.`,
      value: roasVal != null ? `${roasVal.toFixed(2)}×` : "—",
      sub: `objetivo ${roasTarget}×`,
      strong: roasVal != null && roasVal >= roasTarget ? "var(--green)" : null,
    },
  ];

  // El Resumen es la foto de cómo va la cuenta, no el archivo. Traía las 57
  // completadas de siempre —una vencida hacía 105 días al lado de la de ayer—
  // porque `listTasks` no corta por nada.
  const tareasDelTablero = useMemo(() => {
    const corte = addDays(dayKey(new Date()), -7);
    return (tasks || []).filter((t) => {
      if (t.status !== "completado") return true;
      const cuando = (t.completed_at || t.updated_at || "").slice(0, 10);
      return !cuando || cuando >= corte;
    });
  }, [tasks]);
  const completadasOcultas = (tasks || []).filter((t) => t.status === "completado").length
    - tareasDelTablero.filter((t) => t.status === "completado").length;

  // Quién está con algo HOY. Antes decía "N trabajando ahora" contando cuántos
  // miembros existen, que es otra cosa completamente.
  const trabajoPorMiembro = useMemo(() => {
    const hoy = dayKey(new Date());
    const map = {};
    for (const t of tasks || []) {
      if (t.status === "completado") continue;
      const suyas = (t.assignees || []).map((a) => a.member_id).filter(Boolean);
      const urgente = !t.due_date || t.due_date <= hoy;
      for (const id of suyas) {
        const ya = map[id];
        // Se muestra lo más urgente: lo vencido o de hoy le gana a lo de mañana.
        if (!ya || (urgente && !ya.urgente)) map[id] = { titulo: t.title, urgente };
      }
    }
    return map;
  }, [tasks]);
  const liveCount = Object.keys(trabajoPorMiembro).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, fontFamily: DS.font, color: "var(--ink)", padding: "20px 28px 48px", maxWidth: 1520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", marginBottom: 18,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-4)" }}>
            <Icon d={IC.home} size={13} />
            <span>{displayName}</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: "var(--ink-3)" }}>Resumen</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", margin: 0, lineHeight: 1.1 }}>
            Resumen
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, padding: 4, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            {PERIOD_OPTIONS.map((p) => {
              const on = period === p.key;
              return (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  style={{
                    padding: "7px 13px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12.5, whiteSpace: "nowrap",
                    background: on ? "var(--surface)" : "transparent",
                    color: on ? "var(--ink)" : "var(--ink-3)", fontWeight: on ? 600 : 500,
                    boxShadow: on ? "var(--shadow)" : "none",
                  }}>{p.label}</button>
              );
            })}
          </div>
          <div title={lastReportLabel ? "Los datos son tan frescos como el último reporte cargado — no es tiempo real" : "Aún no hay reportes cargados para esta empresa"}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 13px",
              borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)",
              boxShadow: "var(--shadow)", cursor: "help",
            }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: lastReportLabel ? "var(--green)" : "var(--ink-4)" }} />
            <span style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
              {lastReportLabel ? `Actualizado ${lastReportLabel}` : "Sin reportes aún"}
            </span>
          </div>
          {canShareClientLink && clientUrl && (
            <button onClick={handleCopyClientLink} title={clientUrl}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12,
                cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
                boxShadow: "var(--shadow)",
                border: `1px solid ${linkCopied ? "rgba(52,192,138,0.45)" : "var(--line)"}`,
                background: linkCopied ? "rgba(52,192,138,0.14)" : "var(--surface)",
                color: linkCopied ? "var(--green)" : "var(--ink-2)",
              }}>
              <Icon d={linkCopied ? IC.check2 : IC.link} size={14} sw={1.9} />
              {linkCopied ? "Link copiado" : "Compartir link cliente"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TeamSkeletons />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* KPIs — solo para quien los necesita para trabajar. Cuando no van, se
              dice por qué en vez de dejar un hueco donde antes había números. */}
          {!verNumeros && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", padding: "15px 17px", fontSize: 12.5, color: "var(--ink-3)" }}>
              {MOTIVO_SIN_NUMEROS}
            </div>
          )}
          {verNumeros && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {kpiCards.map((k) => (
              <div key={k.label} style={{
                minWidth: 0, border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)",
                padding: "15px 17px", display: "flex", flexDirection: "column", gap: 9, boxShadow: "var(--shadow)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: k.color, boxShadow: `0 0 10px ${k.color}` }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--ink-3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
                  <span title={k.hint} style={{ flexShrink: 0, width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--line-2)", color: "var(--ink-4)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, cursor: "help" }}>?</span>
                </div>
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.035em", color: k.strong || (k.value === "—" ? "var(--ink-3)" : "var(--ink)"), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{k.sub}</div>
              </div>
            ))}
          </div>
          )}

          {/* Equipo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Tu equipo Inforce</span>
              {members.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--green)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
                  {liveCount} con trabajo pendiente
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button onClick={() => onNavigate?.("equipo")}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 11, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                Ver todo el equipo
                <Icon d={IC.chevron} size={13} sw={2.4} />
              </button>
            </div>

            {members.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "22px 20px", borderRadius: 18, border: "1.5px dashed var(--line-2)", background: "var(--surface-2)", color: "var(--ink-3)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-3)" }}><Icon d={IC.users} size={20} sw={1.7} /></span>
                <span style={{ flex: 1, minWidth: 200 }}>Aún no hay personas asignadas a esta empresa.</span>
                {isAdmin && (
                  <button onClick={() => onNavigate?.("equipo")} style={{ border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "2px 4px" }}>Agregar personas →</button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, minWidth: 0, overflowX: "auto", paddingBottom: 4 }}>
                {members.slice(0, MAX_LIVE_CARDS).map((m) => (
                  <MemberCard key={m.id} member={m} task={trabajoPorMiembro[m.id]} onClick={() => setProfileMember(m)} isDark={isDark} />
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", width: "fit-content" }}>
            {[
              { key: "operations", label: "Operación", icon: IC.ops },
              { key: "content", label: "Contenido", icon: IC.film },
            ].map((t) => {
              const on = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none",
                    cursor: "pointer", fontFamily: "inherit", fontSize: 13, whiteSpace: "nowrap",
                    background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)",
                    fontWeight: on ? 600 : 500, boxShadow: on ? "var(--shadow)" : "none",
                  }}>
                  <Icon d={t.icon} size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === "operations" ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.4fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>

              {/* Tareas de la cuenta */}
              <div style={{ minWidth: 0, border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Tareas de la cuenta</span>
                  <button onClick={() => setNewTaskOpen(true)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                      border: "1px solid rgba(111,184,255,0.38)", background: "linear-gradient(180deg, #1f2942, #141b2e)", color: "#EAF2FF",
                      boxShadow: "0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                    <Icon d={IC.plus} size={14} sw={2.4} />
                    Nueva tarea
                  </button>
                </div>
                {completadasOcultas > 0 && (
                  <div style={{ marginBottom: 10, fontSize: 11.5, color: "var(--ink-4)" }}>
                    Mostrando lo cerrado esta semana ·{" "}
                    <button type="button" onClick={() => onNavigate?.("tareas")}
                      style={{ border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: 0 }}>
                      ver las {completadasOcultas} anteriores →
                    </button>
                  </div>
                )}
                <TasksBoard
                  tasks={tareasDelTablero}
                  members={membersForTasks}
                  spaces={[]}
                  companies={[]}
                  currentMember={currentMember}
                  hideHeader
                  onOpenTask={(t) => setEditingTask(t)}
                  onCreate={() => setNewTaskOpen(true)}
                />
              </div>

              {/* Columna derecha */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Actividad reciente</span>
                  </div>
                  {activity.length === 0 ? (
                    <div style={{ padding: "24px 10px", textAlign: "center", fontSize: 12.5, color: "var(--ink-4)", borderTop: "1px solid var(--line)" }}>Sin movimientos recientes.</div>
                  ) : activity.map((ev) => (
                    <div key={ev.id} onClick={() => setEditingTask(ev.task)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700, color: "#FFFFFF", flexShrink: 0, background: ev.color }}>{ev.initial}</span>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-2)", textWrap: "pretty" }}>
                          <b style={{ color: "var(--ink)", fontWeight: 600 }}>{ev.who}</b> {ev.verb} {ev.title}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{ev.when}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--shadow)" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Próximas entregas</span>
                  {upcoming.length === 0 ? (
                    <div style={{ padding: "24px 10px", textAlign: "center", fontSize: 12.5, color: "var(--ink-4)", borderTop: "1px solid var(--line)" }}>Sin entregas programadas.</div>
                  ) : upcoming.map((u) => (
                    <div key={u.id} onClick={() => setEditingTask(u.task)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: u.overdue ? "var(--brand)" : "var(--sel)" }} />
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{u.who} · {u.stage}</span>
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: u.overdue ? "var(--brand)" : "var(--ink-2)", whiteSpace: "nowrap" }}>{u.due}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

              {/* Cumplimiento semanal + pipeline */}
              <div style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", padding: "18px 20px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: 24, alignItems: "center", boxShadow: "var(--shadow)" }}>
                {weekTarget > 0 ? (
                  <CumplimientoBlock doneWeek={doneWeek} weekTarget={weekTarget} onNavigate={onNavigate} isAdmin={isAdmin} isOwner={currentMember?.is_owner} />
                ) : (
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Sin meta semanal configurada</span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", textWrap: "pretty" }}>Falta inversión semanal, ticket promedio y regla de corte para calcular la meta de creativos.</span>
                  </div>
                )}
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-4)" }}>Pipeline de la semana</span>
                    <button onClick={() => onNavigate?.("pipeline")} style={{ border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Ver pipeline →</button>
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {PIPELINE_STATUSES.map((s) => (
                      <button key={s.key} onClick={() => onNavigate?.("pipeline")}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
                        {s.label}
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: (countsByStatus[s.key] || 0) > 0 ? "var(--ink)" : "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{countsByStatus[s.key] || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Estrategia por embudo */}
              <ContentFunnel concepts={concepts} slotsTotal={weekSlots.length} pipelineTotal={PIPELINE_STATUSES.reduce((n, s) => n + (countsByStatus[s.key] || 0), 0)} onNavigate={onNavigate} />
            </div>
          )}
        </div>
      )}

      {profileMember && (
        <CompanyMemberProfile
          member={profileMember}
          isAdmin={isAdmin}
          onClose={() => setProfileMember(null)}
          onEdit={() => { setProfileMember(null); onNavigate?.("equipo"); }}
        />
      )}

      {(newTaskOpen || editingTask) && (
        <TaskModal
          task={editingTask}
          companyId={companyId}
          members={membersForTasks}
          spaces={[]}
          currentMember={null}
          onClose={() => { setNewTaskOpen(false); setEditingTask(null); }}
          onSaved={() => { setNewTaskOpen(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}

// ───────── Tarjeta de miembro (tira "Tu equipo Inforce") ─────────
function MemberCard({ member, task, onClick, isDark }) {
  const roleKeys = member.roles || [];
  const primaryRole = roleKeys.length > 0 ? ROLE_BY_KEY[roleKeys[0]] : null;
  const accent = member.avatar_color || primaryRole?.color || "var(--blue)";
  const roleLabel = member.is_owner ? "Dueña" : (primaryRole?.label || "Miembro");
  const initials = (member.name || "?").split(" ").map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();

  return (
    <div onClick={onClick}
      style={{ flex: "0 0 236px", maxWidth: 300, border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", padding: 15, display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, color: "#FFFFFF", background: accent }}>{initials}</div>
          <span style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", border: "2.5px solid var(--surface-solid)", background: "var(--green)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name.split(" ")[0]}</span>
            {member.is_owner && <span style={{ color: "var(--yellow)", flexShrink: 0 }}><Icon d={IC.crown} size={13} sw={1.7} /></span>}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleLabel} · en línea</span>
        </div>
        <span title="El scorecard por funciones del rol aún no tiene datos" style={{ flexShrink: 0, width: 9, height: 9, borderRadius: "50%", cursor: "help", background: "var(--line-2)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)" }}>Trabajando en</span>
        <span style={{ fontSize: 12.5, lineHeight: 1.45, minHeight: 36, color: task?.label ? "var(--ink-2)" : "var(--ink-4)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textWrap: "pretty" }}>
          {task?.titulo || "Sin nada pendiente"}
        </span>
      </div>
    </div>
  );
}

function CumplimientoBlock({ doneWeek, weekTarget, onNavigate, isAdmin, isOwner }) {
  const pct = weekTarget > 0 ? Math.min(100, Math.round((doneWeek / weekTarget) * 100)) : 0;
  const color = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--amber)" : "var(--brand)";
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Cumplimiento semanal</span>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "var(--ink-3)" }}>
        <span>{doneWeek} de {weekTarget} creativos en campaña</span>
        {(isAdmin || isOwner) && (
          <button onClick={() => onNavigate?.("despliegue")} style={{ border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "2px 4px" }}>Ajustar cadencia →</button>
        )}
      </div>
    </div>
  );
}

function ContentFunnel({ concepts, slotsTotal, pipelineTotal, onNavigate }) {
  const STAGES = [
    { key: "tofu", label: "TOFU", sub: "Atraer", color: "#34C08A", border: "rgba(52,192,138,0.22)", bg: "rgba(52,192,138,0.06)" },
    { key: "mofu", label: "MOFU", sub: "Considerar", color: "#F0A93B", border: "rgba(240,169,59,0.22)", bg: "rgba(240,169,59,0.06)" },
    { key: "bofu", label: "BOFU", sub: "Convertir", color: "#E24B4A", border: "rgba(226,75,74,0.22)", bg: "rgba(226,75,74,0.06)" },
  ];
  const counts = {
    tofu: concepts.filter((c) => c.stage === "tofu").length,
    mofu: concepts.filter((c) => c.stage === "mofu").length,
    bofu: concepts.filter((c) => c.stage === "bofu").length,
  };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Estrategia por embudo</span>
        <button onClick={() => onNavigate?.("despliegue")} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
          Ver canvas <Icon d={IC.chevron} size={13} sw={2.4} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {STAGES.map((s) => (
          <button key={s.key} onClick={() => onNavigate?.("despliegue")}
            style={{ minWidth: 0, padding: "15px 17px", borderRadius: 14, border: `1px solid ${s.border}`, background: s.bg, display: "flex", flexDirection: "column", gap: 3, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.13em", color: s.color }}>{s.label}</span>
            <span style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 5 }}>{s.sub}</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{counts[s.key]}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>conceptos</span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 13 }}>
        <span>{concepts.length} conceptos activos</span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>{slotsTotal} slots en el pipeline</span>
      </div>
    </div>
  );
}

function TeamSkeletons() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", padding: "15px 17px", minHeight: 96, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "var(--surface-2)", borderRadius: 8,height: 11, width: "60%" }} />
            <div style={{ background: "var(--surface-2)", borderRadius: 8,height: 26, width: "40%" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ flex: "1 1 0", minWidth: 196, border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", padding: 15, minHeight: 140, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 11 }}>
              <div style={{ background: "var(--surface-2)", width: 36, height: 36, borderRadius: "50%" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: "var(--surface-2)", borderRadius: 8,height: 11, width: "70%" }} />
                <div style={{ background: "var(--surface-2)", borderRadius: 8,height: 9, width: "46%" }} />
              </div>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 8,height: 32, width: "100%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDue(dateStr) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  } catch { return dateStr; }
}


function aggregateKpis(reports, days, calcMetrics) {
  if (!reports || reports.length === 0 || !calcMetrics) return null;
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const inRange = reports.filter((r) => {
    if (!r.date) return false;
    const d = new Date(r.date);
    return d >= cutoff && d <= now;
  });
  if (inRange.length === 0) {
    const fallback = reports.slice(0, Math.min(reports.length, days >= 30 ? 4 : 1));
    return reduceReports(fallback, calcMetrics);
  }
  return reduceReports(inRange, calcMetrics);
}

function reduceReports(reports, calcMetrics) {
  let revenue = 0, spend = 0, purchases = 0;
  for (const r of reports) {
    const m = calcMetrics(r) || {};
    revenue += Number(r.revenue) || (Number(r.spend) || 0) * (Number(m.roas) || 0) || 0;
    spend += Number(r.spend) || 0;
    purchases += Number(r.purchases) || 0;
  }
  return { revenue, spend, purchases, reports: reports.length };
}
