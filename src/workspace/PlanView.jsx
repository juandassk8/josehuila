import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { DS } from "../lib/design.js";
import { PLAN_ORIGIN } from "../lib/urls.js";
import { useTheme } from "../lib/theme.jsx";
import { database } from "../lib/backend.js";
import PlanEmbed from "./PlanEmbed.jsx";
import { TaskModal } from "./tasks/TaskModal.jsx";
import { listSpaces, createTask } from "./tasks/workspace_tasks_db.js";
import { listTeamMembers } from "./team_db.js";
import {
  RESP, SECCIONES, fetchPlanes, clearPlanesCache, findPlan,
  loadPlanPasos, upsertPlanPaso, fechaCorta,
  loadPlanSubtareas, upsertPlanSubtarea, loadPlanMetas, setPlanMeta,
} from "./plan_data.js";

const FONT = DS.font;

// Iconos SVG de trazo (cero emoji) — viewBox 0 0 24 24.
const P = {
  external: "M14 3h7v7M21 3l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5",
  retry: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  clockSm: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4l2.5 1.5",
  chevron: "M6 9l6 6 6-6",
  chevronR: "M9 18l6-6-6-6",
  checkBold: "M5 12.5l4.5 4.5L19 7",
  checkSm: "M5 12.5l4.5 4.5L19 7",
  faseCheck: "M4 12.5l5 5L20 6.5",
  lines: "M8 4h13M8 12h13M8 20h13M3 4h.01M3 12h.01M3 20h.01",
  folder: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-12z",
  plus: "M12 5v14M5 12h14",
  cal: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M9 3v4M15 3v4",
  clip: "M9 3h6v3H9zM7 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M9 12h6M9 16h4",
  alert: "M12 9v5M12 17.5h.01M10.3 3.9 2.5 17.4A1.9 1.9 0 0 0 4.2 20.3h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z",
  link: "M13.5 6.5h2a4.5 4.5 0 0 1 0 9h-2M10.5 17.5h-2a4.5 4.5 0 0 1 0-9h2M8 12h8",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  close: "M6 6l12 12M18 6L6 18",
};

// Fila de una meta en el grid: celda izquierda (meta + detalle) + las 12 celdas
// semanales (children). Fragmento → cada celda entra directo al CSS grid padre.
function MetaRow({ meta, children }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, justifyContent: "center", padding: "4px 10px 4px 0", minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)", lineHeight: 1.3 }}>{meta.meta}</span>
        {meta.detalle && <span style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.35 }}>{meta.detalle}</span>}
      </div>
      {children}
    </>
  );
}

const Svg = ({ d, size = 15, sw = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
    <path d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FILTROS = [
  { key: "todas", label: "Todo el plan" },
  { key: "pendientes", label: "Pendientes" },
  { key: "hechos", label: "Completados" },
  { key: "futuro", label: "Adelante" },
];

// La ÚNICA regla que no puede ir inline (media query + keyframe del esqueleto).
const STYLE_ID = "plan-view-scoped";
function injectScopedStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @media (max-width: 1250px) {
      [data-plan-cols] { grid-template-columns: minmax(0,1fr) !important; }
      [data-plan-rail] { position: static !important; }
    }
    @keyframes plan-breathe { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
  `;
  document.head.appendChild(s);
}

// ── Vista Plan de implementación ─────────────────────────────────────────
// El portal es fuente de verdad de fases/accionables/checkboxes/progreso.
// El documento (iframe, riel derecho) es fuente de verdad de las 3 llamadas +
// estrategia de venta. Nunca dos progresos. El JSON es solo lectura; el portal
// solo escribe la tabla plan_pasos.
// Extrae el slug del plan desde la URL configurada, ej.
// "https://plan.josehuila.com/nubora/" → "nubora". Vacío si no hay URL.
function slugFromPlanUrl(url) {
  if (!url) return "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch { return ""; }
}

export function PlanView({ companyId, companyName = "", slug = "", isAdmin = false }) {
  const { isDark } = useTheme();
  const theme = isDark ? "dark" : "light";

  // ── URL del plan (legacy jsonb companies.objectives.plan_url) ──
  const [planUrl, setPlanUrl] = useState("");
  const [planUrlLoaded, setPlanUrlLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const objectivesRef = useRef({});

  // ── Datos del plan ──
  const [estadoView, setEstadoView] = useState("cargando"); // cargando|error|sin-plan|listo
  const [plan, setPlan] = useState(null);
  const [estadoPasos, setEstadoPasos] = useState({}); // paso_id -> row de plan_pasos
  const [estadoSubtareas, setEstadoSubtareas] = useState({}); // `${paso_id}::${idx}` -> row de plan_subtareas
  const [estadoMetas, setEstadoMetas] = useState({}); // `${meta_orden}::${semana}` -> valor 0|1

  // ── UI ──
  const [openPaso, setOpenPaso] = useState(null);
  const [closedFases, setClosedFases] = useState([]);
  const [filtro, setFiltro] = useState("todas");
  const [responsable, setResponsable] = useState(null);
  // Sin sección inicial → el documento abre desde arriba y NO auto-scrollea al
  // cargar (evita el "brinco". La navegación ocurre solo cuando el user toca una
  // llamada o "ver el contexto".
  const [seccion, setSeccion] = useState("");

  // ── Tareas del workspace (para Crear tarea / abrir tarea) ──
  const [members, setMembers] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [taskModal, setTaskModal] = useState(null); // { task, pasoId }

  const topRef = useRef(null);

  useEffect(() => { injectScopedStyles(); }, []);

  // 1) URL del plan configurada por admin (jsonb, sin migración).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await database.from("companies").select("objectives").eq("id", companyId).maybeSingle();
        if (cancelled) return;
        const obj = data?.objectives || {};
        objectivesRef.current = obj;
        setPlanUrl((obj.plan_url || "").trim());
      } catch { /* noop */ }
      finally { if (!cancelled) setPlanUrlLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // El plan se busca por el slug del plan_url si está configurado (así un admin
  // puede apuntar una empresa a cualquier plan); si no, por el slug de la empresa.
  // El ESTADO (plan_pasos) siempre va por el slug de la empresa → progreso aislado.
  const planSlug = slugFromPlanUrl(planUrl) || slug;

  // 2) JSON de accionables (caché) + estado de plan_pasos.
  const loadPlan = useCallback(async ({ force = false } = {}) => {
    setEstadoView("cargando");
    try {
      const data = await fetchPlanes({ force });
      const found = findPlan(data, planSlug);
      if (!found) { setPlan(null); setEstadoView("sin-plan"); return; }
      setPlan(found);
      try {
        const map = await loadPlanPasos(slug);
        setEstadoPasos(map);
      } catch { setEstadoPasos({}); }
      try {
        const subMap = await loadPlanSubtareas(slug);
        setEstadoSubtareas(subMap);
      } catch { setEstadoSubtareas({}); }
      try {
        const metasMap = await loadPlanMetas(slug);
        setEstadoMetas(metasMap);
      } catch { setEstadoMetas({}); }
      setEstadoView("listo");
    } catch {
      setEstadoView("error"); // las marcas guardadas no se tocan
    }
  }, [planSlug, slug]);

  useEffect(() => { if (planUrlLoaded) loadPlan(); }, [loadPlan, planUrlLoaded]);

  // Miembros + espacios para el modal de tareas (una vez que hay plan).
  useEffect(() => {
    if (estadoView !== "listo") return;
    let cancelled = false;
    (async () => {
      try {
        const [ms, sp] = await Promise.all([
          listTeamMembers(companyId).catch(() => []),
          listSpaces(companyId).then((r) => r.data || []).catch(() => []),
        ]);
        if (cancelled) return;
        setMembers(ms || []);
        setSpaces(sp || []);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [estadoView, companyId]);

  // ── Estado derivado ──
  const isDone = useCallback((id) => !!estadoPasos[id]?.completado, [estadoPasos]);

  const docUrl = (plan?.documento || planUrl || "").trim();
  const abrirDocUrl = (planUrl || plan?.documento || "").trim();

  const openDocumento = () => { if (abrirDocUrl) window.open(abrirDocUrl, "_blank", "noopener"); };

  // Marcar/desmarcar — optimista, recalcula % y estado de fase en el mismo tick.
  const toggleDone = (pasoId) => async () => {
    const prev = estadoPasos[pasoId] || {};
    const nextDone = !prev.completado;
    const completadoEn = nextDone ? new Date().toISOString() : null;
    setEstadoPasos((m) => ({ ...m, [pasoId]: { ...prev, completado: nextDone, completado_en: completadoEn } }));
    const { error } = await upsertPlanPaso(slug, pasoId, { completado: nextDone, completado_en: completadoEn });
    if (error) {
      setEstadoPasos((m) => ({ ...m, [pasoId]: prev })); // revertir
      alert(`No se pudo guardar la marca: ${error.message || error}`);
    }
  };

  // Marcar/desmarcar una subtarea — optimista + revertir en error (espeja toggleDone).
  const toggleSubtarea = (pasoId, idx) => async () => {
    const key = `${pasoId}::${idx}`;
    const prev = estadoSubtareas[key] || {};
    const nextDone = !prev.completado;
    const completadoEn = nextDone ? new Date().toISOString() : null;
    setEstadoSubtareas((m) => ({ ...m, [key]: { ...prev, completado: nextDone, completado_en: completadoEn } }));
    const { error } = await upsertPlanSubtarea(slug, pasoId, idx, { completado: nextDone, completado_en: completadoEn });
    if (error) {
      setEstadoSubtareas((m) => ({ ...m, [key]: prev })); // revertir
      alert(`No se pudo guardar la subtarea: ${error.message || error}`);
    }
  };

  // Meta semanal — rota los 3 estados (null→1→0→null), optimista + revertir.
  const cycleMeta = (metaOrden, semana) => async () => {
    const key = `${metaOrden}::${semana}`;
    const prev = estadoMetas[key]; // undefined/null = sin marcar, 1 = cumplido, 0 = no cumplido
    const next = prev === 1 ? 0 : prev === 0 ? null : 1; // null→1→0→null
    setEstadoMetas((m) => {
      const copy = { ...m };
      if (next === null) delete copy[key]; else copy[key] = next;
      return copy;
    });
    const { error } = await setPlanMeta(slug, metaOrden, semana, next);
    if (error) {
      setEstadoMetas((m) => {
        const copy = { ...m };
        if (prev === undefined || prev === null) delete copy[key]; else copy[key] = prev;
        return copy;
      });
      alert(`No se pudo guardar la meta: ${error.message || error}`);
    }
  };

  const toggleOpen = (id) => () => setOpenPaso((cur) => (cur === id ? null : id));
  const toggleFase = (id) => () =>
    setClosedFases((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // ── Crear tarea / abrir tarea ──
  const buildPasoTitle = (paso) => paso.accionable;

  const crearTarea = (paso) => async () => {
    // Crea la tarea con el título del accionable y su descripción; guarda tarea_id.
    const { data, error } = await createTask(companyId, {
      title: buildPasoTitle(paso),
      description: paso.descripcion || null,
      status: "pendiente",
      priority: "normal",
      created_by_label: "Plan",
    }, []);
    if (error || !data) { alert(`No se pudo crear la tarea: ${error?.message || error}`); return; }
    await upsertPlanPaso(slug, paso.id, { tarea_id: data.id });
    setEstadoPasos((m) => ({ ...m, [paso.id]: { ...(m[paso.id] || {}), tarea_id: data.id } }));
    // Abrir el modal en modo edición: ahí se le pone fecha y responsable.
    setTaskModal({ task: { ...data, assigneeIds: [] }, pasoId: paso.id });
  };

  const abrirTarea = (paso) => async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const tareaId = estadoPasos[paso.id]?.tarea_id;
    if (!tareaId) return;
    const { data } = await database
      .from("company_tasks")
      .select("*, assignees:company_task_assignees(member_id)")
      .eq("id", tareaId)
      .maybeSingle();
    if (!data) { alert("La tarea ya no existe."); return; }
    setTaskModal({ task: { ...data, assigneeIds: (data.assignees || []).map((a) => a.member_id) }, pasoId: paso.id });
  };

  // Al guardar el modal, sincroniza fecha + asignado del paso desde la tarea.
  const onTaskSaved = async () => {
    const pasoId = taskModal?.pasoId;
    const tareaId = taskModal?.task?.id;
    if (pasoId && tareaId) {
      const { data } = await database
        .from("company_tasks")
        .select("due_date, assignees:company_task_assignees(member_id)")
        .eq("id", tareaId)
        .maybeSingle();
      if (data) {
        const asignado = (data.assignees || [])[0]?.member_id || null;
        await upsertPlanPaso(slug, pasoId, { agendado_para: data.due_date || null, asignado_a: asignado });
        setEstadoPasos((m) => ({
          ...m,
          [pasoId]: { ...(m[pasoId] || {}), agendado_para: data.due_date || null, asignado_a: asignado, tarea_id: tareaId },
        }));
      }
    }
  };

  const memberName = (id) => members.find((m) => m.id === id)?.name || "";

  // "Ver el contexto" — no navega fuera; setSeccion → el riel manda inforce-goto.
  // cmd/ctrl-click deja que el navegador abra la pestaña nueva por el href.
  const verContexto = (sec) => (e) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
    if (e?.preventDefault) e.preventDefault();
    setSeccion(sec);
  };
  const contextoHref = (sec) => (docUrl ? `${docUrl}#${sec}` : `#${sec}`);

  const onNavPlan = useCallback(() => {
    try { topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* noop */ }
  }, []);

  // ── URL del plan (barra admin) ──
  const openEdit = () => { setDraft(planUrl || (slug ? `${PLAN_ORIGIN}/${slug}/` : "")); setEditing(true); };
  const saveUrl = async () => {
    setSaving(true);
    try {
      const nextObj = { ...(objectivesRef.current || {}), plan_url: draft.trim() || null };
      const { error } = await database.from("companies").update({ objectives: nextObj }).eq("id", companyId);
      if (error) throw error;
      objectivesRef.current = nextObj;
      setPlanUrl(draft.trim());
      setEditing(false);
    } catch (e) {
      alert(`No se pudo guardar la URL del plan: ${e?.message || e}`);
    } finally { setSaving(false); }
  };

  const contactarEquipo = () => {
    window.open("https://wa.me/", "_blank", "noopener");
  };

  // ── Cómputos de la vista (espeja el renderVals del diseño) ──
  const derived = useMemo(() => {
    if (!plan) return null;
    const fasesArr = plan.fases || [];
    const cuentanIds = fasesArr.filter((f) => !f.a_futuro).flatMap((f) => f.pasos.map((p) => p.id));
    const hechos = cuentanIds.filter((id) => isDone(id)).length;
    const pct = cuentanIds.length ? Math.round((hechos / cuentanIds.length) * 100) : 0;
    const fasesCuentan = fasesArr.filter((f) => !f.a_futuro);
    const nDone = fasesCuentan.filter((f) => f.pasos.every((p) => isDone(p.id))).length;
    const nCurso = fasesCuentan.filter((f) => f.pasos.some((p) => isDone(p.id)) && !f.pasos.every((p) => isDone(p.id))).length;
    const nFuturoPasos = fasesArr.filter((f) => f.a_futuro).reduce((a, f) => a + f.pasos.length, 0);
    const allIds = fasesArr.flatMap((f) => f.pasos.map((p) => p.id));

    const tramos = fasesArr.map((f) => {
      const total = f.pasos.length;
      const hf = f.pasos.filter((p) => isDone(p.id)).length;
      const done = hf === total, curso = hf > 0 && !done;
      return {
        id: f.id, orden: f.orden,
        num: String(f.orden).padStart(2, "0"),
        corto: f.corto || f.titulo?.split(" ").slice(0, 1).join(" ") || "",
        title: `${f.titulo} — ${hf} de ${total}`,
        fill: `${total ? Math.round((hf / total) * 100) : 0}%`,
        fillColor: f.a_futuro ? "var(--amber)" : done ? "var(--green)" : "var(--sel)",
        fillGlow: f.a_futuro ? "none" : done ? "0 0 14px rgba(52,192,138,0.35)" : "0 0 14px rgba(88,166,255,0.4)",
        trackBg: f.a_futuro ? "transparent" : "var(--chip)",
        trackBorder: f.a_futuro ? "1.5px dashed var(--line-2)" : "1px solid transparent",
        numFg: f.a_futuro ? "var(--amber)" : "var(--ink-4)",
        labelFg: f.a_futuro ? "var(--amber)" : done ? "var(--ink-2)" : curso ? "var(--ink)" : "var(--ink-3)",
        weight: total,
      };
    });

    const countFor = (k) => {
      if (k === "todas") return allIds.length;
      if (k === "futuro") return nFuturoPasos;
      return k === "hechos" ? allIds.filter((id) => isDone(id)).length : allIds.filter((id) => !isDone(id)).length;
    };

    const visibles = fasesArr.filter((f) => {
      if (responsable && !f.pasos.some((p) => p.responsable === responsable)) return false;
      if (filtro === "futuro") return f.a_futuro;
      if (filtro === "pendientes") return f.pasos.some((p) => !isDone(p.id));
      if (filtro === "hechos") return f.pasos.some((p) => isDone(p.id));
      return true;
    });

    const fases = visibles.map((f) => {
      const total = f.pasos.length;
      const hechosF = f.pasos.filter((p) => isDone(p.id)).length;
      const done = hechosF === total;
      const enCurso = hechosF > 0 && !done;
      const open = !closedFases.includes(f.id);

      const chip = f.a_futuro
        ? { label: "Adelante", bg: "rgba(240,169,59,0.15)", fg: "var(--amber)" }
        : done ? { label: "Completada", bg: "rgba(52,192,138,0.13)", fg: "var(--green)" }
        : enCurso ? { label: "En curso", bg: "var(--sel-soft)", fg: "var(--sel)" }
        : { label: "Pendiente", bg: "var(--chip)", fg: "var(--ink-3)" };

      const pasos = f.pasos
        .filter((p) => (responsable ? p.responsable === responsable : true))
        .filter((p) => (filtro === "pendientes" ? !isDone(p.id) : filtro === "hechos" ? isDone(p.id) : true))
        .map((p) => {
          const done2 = isDone(p.id);
          const r = RESP[p.responsable] || RESP["José"];
          const st = estadoPasos[p.id] || {};
          const tieneTarea = !!(st.tarea_id || st.agendado_para || st.asignado_a);
          const asignadoNombre = st.asignado_a ? memberName(st.asignado_a) : "";
          return {
            paso: p,
            num: String(p.orden).padStart(2, "0"),
            done: done2,
            open: openPaso === p.id,
            respInitial: (p.responsable || "?").charAt(0),
            respColor: r.color, respTint: r.tint, seccion: r.seccion, corta: r.corta, tema: r.tema,
            tieneTarea,
            tareaLabel: [st.agendado_para ? fechaCorta(st.agendado_para) : "", asignadoNombre ? `· ${asignadoNombre}` : ""].join(" ").trim() || "Ver la tarea",
            doneMeta: done2 && st.completado_en ? `Completado el ${fechaCorta(st.completado_en)}` : "",
          };
        });

      return {
        raw: f, pasos, open, done: done && !f.a_futuro,
        chip,
        ratio: f.a_futuro ? "—" : `${hechosF}/${total}`,
        barWidth: `${total ? Math.round((hechosF / total) * 100) : 0}%`,
        barColor: f.a_futuro ? "var(--amber)" : done ? "var(--green)" : "var(--sel)",
        railColor: f.a_futuro ? "transparent" : done ? "var(--green)" : enCurso ? "var(--sel)" : "var(--line)",
        numBg: f.a_futuro ? "transparent" : done ? "rgba(52,192,138,0.13)" : enCurso ? "var(--sel-soft)" : "var(--chip)",
        numFg: f.a_futuro ? "var(--amber)" : done ? "var(--green)" : enCurso ? "var(--sel)" : "var(--ink-3)",
        numBorder: f.a_futuro ? "var(--line-2)" : "transparent",
        futuroNota: f.a_futuro ? "Opcional: no cuenta para tu porcentaje de avance." : "",
      };
    });

    const responsables = Object.keys(RESP).map((n) => {
      const ids = fasesArr.flatMap((f) => f.pasos.filter((p) => p.responsable === n).map((p) => p.id));
      return {
        nombre: n, initial: n.charAt(0), tema: RESP[n].tema, color: RESP[n].color,
        ratio: `${ids.filter((id) => isDone(id)).length}/${ids.length}`,
        activo: responsable === n,
      };
    });

    return {
      pct, hechos, cuentan: cuentanIds.length, nDone, nCurso,
      fasesCuentanLen: fasesCuentan.length,
      allIdsLen: allIds.length, fasesLen: fasesArr.length,
      tramos, trackCols: tramos.map((t) => `${t.weight}fr`).join(" "),
      countFor, fases, responsables,
      sinMatch: fases.length === 0,
    };
  }, [plan, estadoPasos, closedFases, filtro, responsable, openPaso, isDone, members]);

  // ── Metas · grid de checkpoints semanales (12 semanas = un trimestre) ──
  const metasDerived = useMemo(() => {
    const metas = plan?.metas || [];
    if (!metas.length) return null;
    const semanas = Array.from({ length: 12 }, (_, i) => i + 1);
    const ordenadas = [...metas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    let cumplidos = 0, noCumplidos = 0;
    ordenadas.forEach((meta) => {
      semanas.forEach((s) => {
        const v = estadoMetas[`${meta.orden}::${s}`];
        if (v === 1) cumplidos += 1;
        else if (v === 0) noCumplidos += 1;
      });
    });
    const marcadas = cumplidos + noCumplidos;
    const pct = marcadas ? Math.round((cumplidos / marcadas) * 100) : null;
    return { metas: ordenadas, semanas, cumplidos, noCumplidos, marcadas, pct };
  }, [plan, estadoMetas]);

  const stripe = theme === "light" ? "rgba(30,82,170,0.05)" : "var(--hover)";
  const rowBgOpen = theme === "light" ? "rgba(30,82,170,0.035)" : "var(--hover)";

  // ── Chrome de la vista (header + barra admin) ──
  const header = (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", paddingTop: 22, paddingBottom: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-4)" }}>
          <span>{companyName || "Empresa"}</span><span style={{ opacity: 0.5 }}>/</span><span style={{ color: "var(--ink-3)" }}>Plan</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 13, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.032em", color: "var(--ink)", lineHeight: 1.1, margin: 0 }}>Plan de implementación</h1>
          {estadoView === "listo" && derived && (
            <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{derived.fasesLen} fases · {derived.allIdsLen} accionables</span>
          )}
        </div>
      </div>
      {estadoView === "listo" && abrirDocUrl && (
        <button data-action="plan.abrir-documento" onClick={openDocumento}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 17px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--sel-soft)", color: "var(--sel)", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>
          <Svg d={P.external} size={15} sw={1.9} /> Abrir el documento
        </button>
      )}
    </div>
  );

  const adminBar = isAdmin ? (
    <div data-action="plan.configurar-url" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", boxShadow: "var(--shadow)", fontFamily: FONT }}>
      {editing ? (
        <>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`${PLAN_ORIGIN}/<slug>/`}
            style={{ flex: 1, padding: "7px 11px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--surface-solid)", color: "var(--ink)", fontSize: 12, fontFamily: FONT, outline: "none" }} />
          <button onClick={saveUrl} disabled={saving} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: "var(--green)", color: "#FFFFFF", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>{saving ? "Guardando…" : "Guardar"}</button>
          <button onClick={() => setEditing(false)} style={ghost()}>Cancelar</button>
        </>
      ) : (
        <>
          <span style={{ color: "var(--ink-3)", display: "flex" }}><Svg d={P.link} size={14} sw={1.8} /></span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {planUrl || "Sin URL del plan configurada."}
          </span>
          <button onClick={openEdit} style={ghost()}>
            <Svg d={planUrl ? P.edit : P.plus} size={13} sw={1.9} />
            {planUrl ? "Cambiar URL" : "Configurar URL del plan"}
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <div ref={topRef} style={{ padding: "0 30px 44px", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, color: "var(--ink)" }}>
      {header}
      {adminBar}

      {estadoView === "cargando" && <Skeleton />}

      {estadoView === "error" && (
        <div style={{ border: "1px solid rgba(226,75,74,0.35)", borderRadius: 20, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "44px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center" }}><Svg d={P.alert} size={21} /></div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>No pudimos cargar tu plan</span>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: "46ch", margin: 0 }}>El archivo de accionables no respondió. Tus marcas están guardadas: no se pierde nada al reintentar.</p>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button data-action="new:plan.reintentar" onClick={() => { clearPlanesCache(); loadPlan({ force: true }); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 17px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--sel-soft)", color: "var(--sel)", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 600 }}>
              <Svg d={P.retry} size={15} /> Reintentar
            </button>
            <button data-action="new:plan.contactar-equipo" onClick={contactarEquipo}
              style={{ padding: "10px 17px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 500, boxShadow: "var(--shadow)" }}>Escribirle al equipo</button>
          </div>
        </div>
      )}

      {estadoView === "sin-plan" && (
        <div style={{ border: "1.5px dashed var(--line-2)", borderRadius: 20, padding: "56px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "var(--surface-2)", color: "var(--ink-4)", display: "grid", placeItems: "center" }}><Svg d={P.clip} size={22} sw={1.7} /></div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Tu plan todavía no está publicado</span>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: "48ch", margin: 0 }}>Sale de tus tres llamadas de consultoría. Cuando el equipo lo cierre, aparece acá con tus fases y tus accionables.</p>
          <button data-action="new:plan.contactar-equipo" onClick={contactarEquipo}
            style={{ marginTop: 4, padding: "10px 17px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 500, boxShadow: "var(--shadow)" }}>Escribirle al equipo</button>
        </div>
      )}

      {estadoView === "listo" && derived && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* AVANCE */}
          <section style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "20px 24px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, minWidth: 0 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 46, fontWeight: 500, letterSpacing: "-0.04em", color: "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{derived.pct}<span style={{ fontSize: 22, color: "var(--ink-3)" }}>%</span></span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Avance del acompañamiento</span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{derived.hechos}</span> de <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{derived.cuentan}</span> accionables · {derived.nDone} de {derived.fasesCuentanLen} fases cerradas
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 999, background: "rgba(52,192,138,0.13)", color: "var(--green)", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />{derived.nDone} completadas</span>
                <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 999, background: "var(--sel-soft)", color: "var(--sel)", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />{derived.nCurso} en curso</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: derived.trackCols, gap: 4, alignItems: "stretch" }}>
              {derived.tramos.map((t) => (
                <button key={t.id} data-action="new:plan.ir-a-fase" title={t.title}
                  onClick={() => { setFiltro("todas"); setResponsable(null); setClosedFases([]); }}
                  style={{ display: "flex", flexDirection: "column", gap: 7, border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left", minWidth: 0 }}>
                  <div style={{ height: 16, borderRadius: 6, overflow: "hidden", background: t.trackBg, border: t.trackBorder }}>
                    <div style={{ height: "100%", width: t.fill, background: t.fillColor, boxShadow: t.fillGlow, transition: "width .3s ease" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: t.numFg, fontVariantNumeric: "tabular-nums" }}>{t.num}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: t.labelFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.corto}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* METAS · checkpoints semanales */}
          {metasDerived && (
            <section style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "18px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Metas del trimestre</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Marca cada semana: verde si se cumplió, rojo si no. Un clic rota el estado.</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9, whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 500, letterSpacing: "-0.03em", color: metasDerived.pct === null ? "var(--ink-4)" : "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {metasDerived.pct === null ? "—" : `${metasDerived.pct}%`}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    de cumplimiento · <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>{metasDerived.cumplidos}/{metasDerived.marcadas}</span> semanas marcadas
                  </span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 260px) repeat(12, minmax(28px, 1fr))", gap: 4, minWidth: 620, alignItems: "stretch" }}>
                  {/* Fila de encabezado */}
                  <div />
                  {metasDerived.semanas.map((s) => (
                    <div key={`h${s}`} style={{ display: "grid", placeItems: "center", padding: "2px 0 6px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>S{s}</div>
                  ))}
                  {/* Una fila por meta */}
                  {metasDerived.metas.map((meta) => (
                    <MetaRow key={meta.orden} meta={meta}>
                      {metasDerived.semanas.map((s) => {
                        const v = estadoMetas[`${meta.orden}::${s}`];
                        const cumplido = v === 1, noCumplido = v === 0;
                        return (
                          <button key={`${meta.orden}-${s}`} data-action="new:plan.marcar-meta" onClick={cycleMeta(meta.orden, s)}
                            title={`${meta.meta} · S${s} — ${cumplido ? "Cumplido" : noCumplido ? "No cumplido" : "Sin marcar"}`}
                            style={{
                              minWidth: 28, minHeight: 28, height: "100%", borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center", fontFamily: FONT, padding: 0,
                              border: `1px solid ${cumplido ? "transparent" : noCumplido ? "transparent" : "var(--line)"}`,
                              background: cumplido ? "var(--green)" : noCumplido ? DS.red : "var(--chip)",
                              color: cumplido || noCumplido ? "#FFFFFF" : "transparent",
                            }}>
                            {cumplido && <Svg d={P.checkSm} size={13} sw={2.6} />}
                            {noCumplido && <Svg d={P.close} size={13} sw={2.6} />}
                          </button>
                        );
                      })}
                    </MetaRow>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* DOS COLUMNAS */}
          <div data-plan-cols="" style={{ display: "grid", gridTemplateColumns: "minmax(440px,1fr) minmax(304px,424px)", gap: 14, alignItems: "start" }}>
            {/* Columna izquierda: filtros + fases */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {FILTROS.map((f) => {
                  const on = filtro === f.key;
                  return (
                    <button key={f.key} data-action="new:plan.filtrar" onClick={() => setFiltro(f.key)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, whiteSpace: "nowrap", fontWeight: on ? 600 : 500, border: `1px solid ${on ? "transparent" : "var(--line)"}`, background: on ? "var(--sel-soft)" : "var(--surface)", color: on ? "var(--sel)" : "var(--ink-3)" }}>
                      {f.label}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{derived.countFor(f.key)}</span>
                    </button>
                  );
                })}
                <div style={{ flex: 1 }} />
                <button data-action="new:plan.colapsar-todo"
                  onClick={() => setClosedFases((c) => (c.length ? [] : (plan.fases || []).map((f) => f.id)))}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-3)", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", boxShadow: "var(--shadow)" }}>
                  <Svg d={P.lines} size={14} /> {closedFases.length ? "Abrir todo" : "Cerrar todo"}
                </button>
              </div>

              {derived.fases.map((fv) => {
                const f = fv.raw;
                return (
                  <section key={f.id} style={{ position: "relative", border: f.a_futuro ? "1.5px dashed var(--line-2)" : "1px solid var(--line)", borderRadius: 18, background: f.a_futuro ? "transparent" : "var(--surface)", boxShadow: f.a_futuro ? "none" : "var(--shadow)", opacity: f.a_futuro ? 0.78 : 1, overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: fv.railColor }} />
                    <div style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 13, alignItems: "start", padding: "16px 20px 15px 22px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: fv.numBg, color: fv.numFg, border: `1px solid ${fv.numBorder}` }}>
                        {fv.done
                          ? <Svg d={P.faseCheck} size={17} sw={2.2} />
                          : <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13.5, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{f.orden}</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          <h3 style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--ink)", lineHeight: 1.3, margin: 0 }}>{f.titulo}</h3>
                          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", background: fv.chip.bg, color: fv.chip.fg }}>{fv.chip.label}</span>
                        </div>
                        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-3)", margin: 0 }}>{f.descripcion}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
                            <Svg d={P.clock} size={12} sw={1.9} /> {f.tiempo}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{fv.ratio}</span>
                            <div style={{ width: 52, height: 5, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: fv.barWidth, borderRadius: 999, background: fv.barColor }} />
                            </div>
                          </div>
                        </div>
                        <button data-action="new:plan.colapsar-fase" onClick={toggleFase(f.id)} title={fv.open ? "Cerrar la fase" : "Abrir la fase"}
                          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Svg d={P.chevron} size={15} sw={2} style={{ transform: fv.open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .18s ease" }} />
                        </button>
                      </div>
                    </div>

                    {fv.open && (
                      <div style={{ borderTop: "1px solid var(--line)" }}>
                        {fv.pasos.map((pv) => {
                          const p = pv.paso;
                          const subs = p.subtareas || [];
                          const subDoneCount = subs.filter((_, idx) => estadoSubtareas[`${p.id}::${idx}`]?.completado).length;
                          return (
                            <div key={p.id} style={{ borderBottom: "1px solid var(--line)", background: pv.open ? rowBgOpen : "transparent" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 128px 116px 24px", gap: 11, alignItems: "center", padding: "12px 20px 12px 22px" }}>
                                <button data-action="new:plan.marcar-paso" onClick={toggleDone(p.id)} title={pv.done ? "Desmarcar accionable" : "Marcar como hecho"}
                                  style={{ width: 20, height: 20, borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center", border: `1.6px solid ${pv.done ? "transparent" : "var(--line-2)"}`, background: pv.done ? "var(--green)" : "transparent", color: pv.done ? "#FFFFFF" : "transparent" }}>
                                  {pv.done && <Svg d={P.checkSm} size={13} sw={2.6} />}
                                </button>
                                <button data-action="new:plan.expandir-paso" onClick={toggleOpen(p.id)}
                                  style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left", minWidth: 0, display: "flex", alignItems: "center", gap: 9 }}>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{pv.num}</span>
                                  <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, color: pv.done ? "var(--ink-4)" : "var(--ink)", textDecoration: pv.done ? "line-through" : "none" }}>{p.accionable}</span>
                                  {subs.length > 0 && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: "var(--chip)", color: subDoneCount === subs.length ? "var(--green)" : "var(--ink-3)", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{subDoneCount}/{subs.length}</span> subtareas
                                    </span>
                                  )}
                                </button>
                                <span style={{ display: "flex", alignItems: "center", gap: 7, justifySelf: "start", padding: "4px 10px 4px 5px", borderRadius: 999, background: pv.respTint, color: pv.respColor, fontSize: 11.5, fontWeight: 600, maxWidth: "100%", overflow: "hidden" }}>
                                  <span style={{ width: 19, height: 19, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: pv.respColor, flexShrink: 0 }}>{pv.respInitial}</span>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.responsable}</span>
                                </span>
                                <a data-action="plan.ver-contexto" href={contextoHref(pv.seccion)} onClick={verContexto(pv.seccion)} title={`Abrir el documento en la ${pv.corta} · ${pv.tema}`}
                                  style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "start", fontSize: 12, fontWeight: 600, color: "var(--sel)", whiteSpace: "nowrap", textDecoration: "none" }}>
                                  <Svg d={P.folder} size={13} sw={1.8} /> ver el contexto
                                </a>
                                <button data-action="new:plan.expandir-paso" onClick={toggleOpen(p.id)} title={pv.open ? "Cerrar el detalle" : "Ver la descripción completa"}
                                  style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "transparent", color: "var(--ink-4)", cursor: "pointer", display: "grid", placeItems: "center", justifySelf: "end" }}>
                                  <Svg d={P.chevron} size={14} sw={2} style={{ transform: pv.open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s ease" }} />
                                </button>
                              </div>

                              {subs.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 11, padding: "0 20px 12px 22px" }}>
                                  <div />
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "2px solid var(--line-2)", paddingLeft: 13 }}>
                                    {subs.map((texto, idx) => {
                                      const subDone = !!estadoSubtareas[`${p.id}::${idx}`]?.completado;
                                      return (
                                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
                                          <button data-action="new:plan.marcar-subtarea" onClick={toggleSubtarea(p.id, idx)} title={subDone ? "Desmarcar subtarea" : "Marcar subtarea"}
                                            style={{ width: 16, height: 16, borderRadius: 5, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, border: `1.5px solid ${subDone ? "transparent" : "var(--line-2)"}`, background: subDone ? "var(--green)" : "transparent", color: subDone ? "#FFFFFF" : "transparent" }}>
                                            {subDone && <Svg d={P.checkSm} size={11} sw={2.8} />}
                                          </button>
                                          <span style={{ fontSize: 12.5, lineHeight: 1.4, color: subDone ? "var(--ink-4)" : "var(--ink-2)", textDecoration: subDone ? "line-through" : "none" }}>{texto}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {pv.open && (
                                <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 11, padding: "0 20px 16px 22px" }}>
                                  <div />
                                  <div style={{ display: "flex", flexDirection: "column", gap: 13, borderLeft: "2px solid var(--line-2)", paddingLeft: 15 }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>Por qué</span>
                                      <p style={{ fontSize: 13.5, lineHeight: 1.68, color: "var(--ink-2)", margin: 0 }}>{p.descripcion}</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                                      <button data-action="new:plan.crear-tarea" onClick={crearTarea(p)} title="Crea la tarea en tu espacio: ahí le pones fecha y responsable"
                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 11, border: "1px solid var(--line-2)", background: "var(--surface-2)", color: "var(--ink)", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                                        <Svg d={P.plus} size={14} sw={2.2} /> Crear tarea
                                      </button>
                                      {pv.tieneTarea && (
                                        <a data-action="new:plan.agendar-paso" href="#" onClick={abrirTarea(p)} title="Abrir la tarea"
                                          style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 11, background: "var(--sel-soft)", color: "var(--sel)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none" }}>
                                          <Svg d={P.cal} size={14} sw={1.8} /> {pv.tareaLabel}
                                        </a>
                                      )}
                                      <a data-action="plan.ver-contexto" href={contextoHref(pv.seccion)} onClick={verContexto(pv.seccion)}
                                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 11, background: "var(--sel-soft)", color: "var(--sel)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none" }}>
                                        <Svg d={P.chevronR} size={14} sw={2} /> Ver el contexto en la {pv.corta}
                                      </a>
                                    </div>
                                    {pv.doneMeta && (
                                      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--green)" }}>
                                        <Svg d={P.checkBold} size={12} sw={2.4} /> {pv.doneMeta}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {fv.futuroNota && (
                          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 20px 12px 22px", color: "var(--amber)", fontSize: 12 }}>
                            <Svg d={P.clockSm} size={14} /> <span>{fv.futuroNota}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              {derived.sinMatch && (
                <div style={{ border: "1.5px dashed var(--line-2)", borderRadius: 18, padding: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Ningún accionable con este filtro</span>
                  <button data-action="new:plan.filtrar" onClick={() => { setFiltro("todas"); setResponsable(null); }}
                    style={{ padding: "8px 14px", borderRadius: 11, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 500 }}>Ver todas las fases</button>
                </div>
              )}
            </div>

            {/* Riel derecho */}
            <aside data-plan-rail="" style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <section style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Tus tres llamadas</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Solo lectura · lo que se marca vive en el plan</span>
                  </div>
                  {abrirDocUrl && (
                    <button data-action="plan.abrir-documento" onClick={openDocumento} title="Abrir en una pestaña nueva"
                      style={{ width: 30, height: 30, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Svg d={P.external} size={14} sw={1.8} />
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4, padding: "0 12px 12px" }}>
                  {SECCIONES.map((sec) => {
                    const on = seccion === sec.id;
                    return (
                      <button key={sec.id} data-action="new:plan.ir-a-seccion" onClick={() => setSeccion(sec.id)} title={`Ir a ${sec.label} del documento`}
                        style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 9px", borderRadius: 11, cursor: "pointer", fontFamily: FONT, textAlign: "left", border: `1px solid ${on ? "transparent" : "var(--line)"}`, background: on ? "var(--sel-soft)" : "transparent", minWidth: 0 }}>
                        <span style={{ width: "100%", height: 3, borderRadius: 999, background: sec.dot }} />
                        <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? "var(--sel)" : "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.label}</span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.quien}</span>
                      </button>
                    );
                  })}
                </div>
                {docUrl ? (
                  <PlanEmbed src={docUrl} section={seccion} isDark={isDark} onNavPlan={onNavPlan} />
                ) : (
                  <div style={{ height: 320, borderTop: "1px solid var(--line)", background: "var(--surface-solid)", display: "grid", placeItems: "center", padding: 20, textAlign: "center", backgroundImage: `repeating-linear-gradient(135deg, transparent 0 9px, ${stripe} 9px 10px)` }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.5 }}>El documento aparece cuando esté configurada su URL.</span>
                  </div>
                )}
              </section>

              <section style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-4)" }}>Quién responde por qué</span>
                {derived.responsables.map((r) => (
                  <button key={r.nombre} data-action="new:plan.filtrar-responsable" onClick={() => setResponsable(r.activo ? null : r.nombre)}
                    style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "7px 9px", borderRadius: 11, cursor: "pointer", fontFamily: FONT, textAlign: "left", border: `1px solid ${r.activo ? "transparent" : "var(--line)"}`, background: r.activo ? "var(--sel-soft)" : "transparent" }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#FFFFFF", background: r.color }}>{r.initial}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.tema}</span>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.ratio}</span>
                  </button>
                ))}
              </section>
            </aside>
          </div>
        </div>
      )}

      {taskModal && (
        <TaskModal
          task={taskModal.task}
          companyId={companyId}
          members={members}
          spaces={spaces}
          currentMember={null}
          onClose={() => setTaskModal(null)}
          onSaved={onTaskSaved}
        />
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 13, width: 220, borderRadius: 7, background: "var(--chip)", animation: "plan-breathe 1.4s ease-in-out infinite" }} />
        <div style={{ height: 16, borderRadius: 999, background: "var(--chip)", animation: "plan-breathe 1.4s ease-in-out .12s infinite" }} />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 20, background: "var(--surface)", boxShadow: "var(--shadow)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ height: 15, width: "44%", borderRadius: 7, background: "var(--chip)", animation: "plan-breathe 1.4s ease-in-out infinite" }} />
          <div style={{ height: 11, width: "70%", borderRadius: 6, background: "var(--chip)", animation: "plan-breathe 1.4s ease-in-out .15s infinite" }} />
        </div>
      ))}
    </div>
  );
}

function ghost() {
  return { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", color: "var(--ink-2)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT };
}
