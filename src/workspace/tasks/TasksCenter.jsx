import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DS } from "../../lib/design.js";
import {
  ESTADOS, PRIO_BY_KEY,
  dayKey, humanDay, shortDay, fechaTono, enAlcanceSemana, estaAtrasada,
  groupByEstado, groupByFecha, groupByPersona, diasConTareas, iniciales, faltaPara,
  esDe, resumenDelDia, agruparMiembrosPorRol, rolLabel, quienesLaTienen,
} from "./centerModel.js";
import { RANGOS, VISTA_SIN_DIAS, leerPrefs, guardarPrefs, resolverQuien } from "./tasksPrefs.js";
import { DateCalendar } from "./DateCalendar.jsx";

// Centro de Tareas — el tablero donde el equipo lleva la operación de la cuenta.
//
// Tres lecturas de las MISMAS tareas: por estado (qué está trabado), por fecha
// (qué entra hoy) y por persona (quién está cargado). Arrastrar una tarjeta
// cambia el dato que define su columna: el estado en la primera vista, la fecha
// en la segunda.
//
// La lógica de agrupación y calendario vive en `centerModel.js`, sin React, para
// poder testearla. Acá solo hay pintura y eventos.

const ICON = {
  estado: "M4 6h16M4 12h10M4 18h7",
  fecha: "M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  persona: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 7.5a3 3 0 1 0 0 .01M21 19v-1a4 4 0 0 0-3-3.87",
  reloj: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  mas: "M12 5v14M5 12h14",
  bandera: "M5 21V4h10l-1 3h6v8h-8l-1-3H5",
  chevron: "M6 9l6 6 6-6",
  x: "M6 6l12 12M18 6L6 18",
};

function Icon({ d, size = 15, fill = "none" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Cierra el popover con un clic en cualquier parte del documento. Los clics de
// adentro paran la propagación en su propio contenedor.
function useClickOutside(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const cerrar = () => onClose();
    document.addEventListener("click", cerrar);
    return () => document.removeEventListener("click", cerrar);
  }, [open, onClose]);
}

const stop = (e) => e.stopPropagation();

export function TasksCenter({
  companyId, companyName, nombreEmpresa, members, tasks, currentMember,
  onOpenTask, onNewTask, onPatch,
}) {
  const miId = currentMember?.id || null;
  // Las preferencias se leen UNA vez, al montar. Releerlas después haría que el
  // tablero se moviera solo mientras alguien lo está usando.
  const [prefs] = useState(() => leerPrefs(companyId, miId));

  const [vista, setVista] = useState(prefs.vista);
  // `null` hasta que se sepa: ver `resolverQuien`.
  const [quien, setQuien] = useState(() => resolverQuien(prefs, miId, members));
  // Los días se guardan POR VISTA, no en una sola variable: dejar "Hoy" en Por
  // estado y ver otra cosa en Por persona son dos preferencias distintas. Y
  // "Por fecha" no tiene días porque ahí los días son las columnas.
  const [diasPorVista, setDiasPorVista] = useState(() => prefs.dias || {});
  const [span, setSpan] = useState(prefs.span);
  const [abierto, setAbierto] = useState(null);   // 'fecha' | 'personas' | null

  // El equipo llega en otra consulta: cuando aterriza, recién ahí se sabe si uno
  // es parte de él y el tablero se acomoda en lo suyo.
  useEffect(() => {
    setQuien((q) => (q === null ? resolverQuien(prefs, miId, members) : q));
  }, [prefs, miId, members]);

  const personas = quien || [];
  const setPersonas = (next) => setQuien((q) => (typeof next === "function" ? next(q || []) : next));

  const dias = vista === VISTA_SIN_DIAS ? [] : (diasPorVista[vista] || []);
  const setDias = (next) => setDiasPorVista((m) => ({
    ...m, [vista]: typeof next === "function" ? next(m[vista] || []) : next,
  }));

  useEffect(() => {
    if (quien === null) return;   // sin resolver todavía: guardar sería inventar una elección
    guardarPrefs(companyId, miId, { vista, quien, dias: diasPorVista, span });
  }, [companyId, miId, vista, quien, diasPorVista, span]);

  const hoy = useMemo(() => dayKey(new Date()), []);
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const membersById = useMemo(() => Object.fromEntries((members || []).map((m) => [m.id, m])), [members]);

  const deEstaGente = useMemo(() => tasks.filter((t) => esDe(t, personas)), [tasks, personas]);

  const visibles = useMemo(() => {
    // En "Por fecha" los días SON las columnas, así que ahí no se filtra.
    if (vista === VISTA_SIN_DIAS) return deEstaGente;
    return dias.length
      ? deEstaGente.filter((t) => dias.includes(t.fecha))
      : deEstaGente.filter((t) => enAlcanceSemana(t, hoy));
  }, [deEstaGente, dias, vista, hoy]);

  // Lo atrasado se calcula ANTES del filtro de días. Elegir "Hoy" no puede hacer
  // desaparecer la franja de atrasado: es lo único del tablero que exige una
  // decisión, y esconderla al filtrar era la vista mintiendo.
  const atrasadas = useMemo(() => deEstaGente.filter((t) => estaAtrasada(t, hoy)), [deEstaGente, hoy]);

  // El resumen sale de TODAS mis tareas, no de las visibles: filtrar por "Hoy"
  // no puede esconder cuántas llevo atrasadas.
  const resumen = useMemo(
    () => resumenDelDia(tasks, miId ? [miId] : [], hoy),
    [tasks, miId, hoy],
  );

  const conFiltros = dias.length > 0 || personas.length > 0;
  const limpiar = () => { setDias([]); setPersonas([]); };

  return (
    <div style={{ padding: "22px 28px 72px", maxWidth: 1680, margin: "0 auto", fontFamily: DS.font, color: "var(--ink)" }}>
      <Header companyName={companyName} ahora={ahora} onNewTask={onNewTask}
        currentMember={currentMember} resumen={resumen} />

      <ViewBar
        vista={vista} onVista={setVista}
        dias={dias} setDias={setDias}
        span={span} setSpan={setSpan}
        personas={personas} setPersonas={setPersonas}
        abierto={abierto} setAbierto={setAbierto}
        members={members} nombreEmpresa={nombreEmpresa || companyName} miId={miId}
        tasks={tasks} hoy={hoy}
        conFiltros={conFiltros} onLimpiar={limpiar}
        total={visibles.length}
      />

      {vista === "estado" && <VistaEstado tasks={visibles} atrasadas={atrasadas} hoy={hoy} onOpenTask={onOpenTask} onPatch={onPatch} membersById={membersById} miId={miId} />}
      {vista === "fecha" && <VistaFecha tasks={visibles} span={span} hoy={hoy} onOpenTask={onOpenTask} onPatch={onPatch} membersById={membersById} miId={miId} />}
      {vista === "persona" && <VistaPersona tasks={visibles} members={members} hoy={hoy} onOpenTask={onOpenTask} membersById={membersById} miId={miId} />}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────
// Una línea que dice cómo venís antes de que toques un filtro: quién sos, de qué
// te ocupás y qué tan apretado está el día. Lo atrasado se pinta distinto porque
// es lo único de acá que exige una decisión.
function MiLinea({ currentMember, resumen }) {
  const rol = rolLabel((currentMember.roles || [])[0]);
  const partes = [
    `${resumen.hoy} para hoy`,
    resumen.atrasadas ? `${resumen.atrasadas} ${resumen.atrasadas === 1 ? "atrasada" : "atrasadas"}` : null,
    `${resumen.abiertas} ${resumen.abiertas === 1 ? "abierta" : "abiertas"}`,
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
      <span style={{ fontWeight: 700, color: "var(--ink-2)" }}>{currentMember.name}</span>
      {rol && <span style={{ color: "var(--ink-4)" }}>· {rol}</span>}
      <span style={{ color: "var(--ink-4)" }}>—</span>
      {partes.map((p, i) => (
        <span key={p} style={{ color: i === 1 && resumen.atrasadas ? "var(--brand)" : "var(--ink-3)", fontWeight: i === 1 && resumen.atrasadas ? 700 : 500 }}>
          {p}{i < partes.length - 1 ? " ·" : ""}
        </span>
      ))}
    </div>
  );
}

function Header({ companyName, ahora, onNewTask, currentMember, resumen }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-4)" }}>
          <span>{companyName}</span><span>/</span><span>Tareas</span>
        </div>
        <h1 style={{ fontSize: 29, fontWeight: 700, letterSpacing: "-0.032em", margin: "4px 0 0" }}>Centro de Tareas</h1>
        {currentMember && <MiLinea currentMember={currentMember} resumen={resumen} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="glass" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: 12, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
          <span style={{ color: "var(--ink-3)", display: "flex" }}><Icon d={ICON.reloj} size={14} /></span>
          Daily 8:00
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{faltaPara("8:00", ahora)}</span>
        </div>
        <button type="button" onClick={onNewTask}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 17px", borderRadius: 12, border: "none", cursor: "pointer",
            background: "var(--sel)", color: "#fff", fontFamily: DS.font, fontSize: 13, fontWeight: 700, boxShadow: "var(--sel-rim)" }}>
          <Icon d={ICON.mas} size={15} /> Nueva tarea
        </button>
      </div>
    </div>
  );
}

// ── Barra de vistas y filtros ────────────────────────────────────────
function ViewBar({ vista, onVista, dias, setDias, span, setSpan, personas, setPersonas, abierto, setAbierto, members, nombreEmpresa, miId, tasks, hoy, conFiltros, onLimpiar, total }) {
  const VISTAS = [
    { key: "estado", label: "Por estado", d: ICON.estado },
    { key: "fecha", label: "Por fecha", d: ICON.fecha },
    { key: "persona", label: "Por persona", d: ICON.persona },
  ];

  const anclaFecha = useRef(null);
  const anclaPersonas = useRef(null);

  // En "Por fecha" el chip no elige días —los días son las columnas— sino cuánto
  // se ve hacia adelante. Así el control significa algo en las tres vistas en
  // vez de vaciarse y quedar de adorno.
  const porRango = vista === VISTA_SIN_DIAS;

  const etiquetaDias = porRango
    ? (RANGOS.find((r) => r.span === span)?.label || "Esta semana")
    : dias.length === 0 ? "Esta semana"
      : dias.length === 1 ? `${humanDay(dias[0], hoy)} · ${shortDay(dias[0])}`
        : `${dias.length} días`;

  const soloMias = !!miId && personas.length === 1 && personas[0] === miId;
  const etiquetaPersonas = personas.length === 0 ? "Todos"
    : soloMias ? "Mías"
      : personas.length === 1 ? (members.find((m) => m.id === personas[0])?.name || "1 persona")
        : `${personas.length} personas`;

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 14px 10px", margin: "0 -14px 4px", borderRadius: 14,
      background: "var(--surface)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
      <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
        {VISTAS.map((v) => {
          const on = vista === v.key;
          return (
            <button key={v.key} type="button" onClick={() => onVista(v.key)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9, border: "none", cursor: "pointer",
                fontFamily: DS.font, fontSize: 12.5, fontWeight: 600,
                background: on ? "var(--surface-solid)" : "transparent", color: on ? "var(--sel)" : "var(--ink-3)" }}>
              <Icon d={v.d} size={14} /> {v.label}
            </button>
          );
        })}
      </div>

      <span style={{ width: 1, height: 24, background: "var(--line)" }} />

      <div ref={anclaFecha} style={{ position: "relative" }} onClick={stop}>
        <Pill icon={ICON.fecha} label={etiquetaDias} activo={porRango ? span !== 7 : dias.length > 0}
          onClick={() => setAbierto(abierto === "fecha" ? null : "fecha")} />
        {abierto === "fecha" && (porRango
          ? <RangoPopover anchorRef={anclaFecha} span={span} setSpan={setSpan} onClose={() => setAbierto(null)} />
          : <DatePopover anchorRef={anclaFecha} dias={dias} setDias={setDias} hoy={hoy} tasks={tasks} onClose={() => setAbierto(null)} />
        )}
      </div>

      <div ref={anclaPersonas} style={{ position: "relative" }} onClick={stop}>
        <Pill icon={ICON.persona} label={etiquetaPersonas} activo={personas.length > 0}
          onClick={() => setAbierto(abierto === "personas" ? null : "personas")} />
        {abierto === "personas" && (
          <PeoplePopover anchorRef={anclaPersonas} members={members} nombreEmpresa={nombreEmpresa} miId={miId} tasks={tasks}
            personas={personas} setPersonas={setPersonas} onClose={() => setAbierto(null)} />
        )}
      </div>

      {conFiltros && (
        <button type="button" onClick={onLimpiar}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)" }}>
          Limpiar
        </button>
      )}

      <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-4)" }}>{total} tareas</span>
    </div>
  );
}

function Pill({ icon, label, activo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 999, cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600,
        background: activo ? "var(--sel-soft)" : "var(--surface-2)", color: activo ? "var(--sel)" : "var(--ink-2)",
        border: `1px solid ${activo ? "rgba(38,100,204,0.30)" : "var(--line)"}` }}>
      <Icon d={icon} size={14} /> {label}
      <span style={{ opacity: 0.5, display: "flex" }}><Icon d={ICON.chevron} size={13} /></span>
    </button>
  );
}

// El popover se dibuja FUERA del tablero, colgado del body.
//
// Antes iba `position: absolute` dentro de la píldora, y la píldora vive dentro
// del contenedor con scroll de la página: cuando el tablero tenía pocas tareas
// ese contenedor medía poco y le cortaba media lista al calendario y al selector
// de personas. Un portal no tiene ancestros que lo recorten. La altura se limita
// a lo que queda de pantalla, así que la lista scrollea sola en vez de quedar
// tapada, y si no entra abajo se abre hacia arriba.
function Popover({ anchorRef, children, width = 300, onClose }) {
  useClickOutside(true, onClose);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margen = 16;
    const abajo = window.innerHeight - r.bottom - margen;
    const arriba = r.top - margen;
    const haciaArriba = abajo < 240 && arriba > abajo;
    setPos({
      left: Math.max(margen, Math.min(r.left, window.innerWidth - width - margen)),
      top: haciaArriba ? undefined : r.bottom + 8,
      bottom: haciaArriba ? window.innerHeight - r.top + 8 : undefined,
      maxHeight: Math.max(200, (haciaArriba ? arriba : abajo) - 8),
    });
  }, [anchorRef, width]);

  if (!pos) return null;
  return createPortal(
    <div onClick={stop} className="glass"
      style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 10001, width,
        maxHeight: pos.maxHeight, overflow: "auto", borderRadius: 16,
        background: "var(--surface-solid)", boxShadow: "var(--shadow-lg)", padding: 14 }}>
      {children}
    </div>,
    document.body,
  );
}

// ── Calendario del filtro ────────────────────────────────────────────
function DatePopover({ anchorRef, dias, setDias, hoy, tasks, onClose }) {
  const conTareas = useMemo(() => diasConTareas(tasks), [tasks]);
  return (
    <Popover anchorRef={anchorRef} width={300} onClose={onClose}>
      <DateCalendar mode="multi" value={dias} hoy={hoy} conTareas={conTareas} onChange={setDias} />
    </Popover>
  );
}

// ── Cuánto se ve hacia adelante (solo en "Por fecha") ────────────────
function RangoPopover({ anchorRef, span, setSpan, onClose }) {
  return (
    <Popover anchorRef={anchorRef} width={200} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {RANGOS.map((r) => (
          <FilaPopover key={r.span} on={span === r.span} tipo="radio"
            onClick={() => { setSpan(r.span); onClose(); }} texto={r.label} />
        ))}
      </div>
    </Popover>
  );
}

// ── Personas ─────────────────────────────────────────────────────────
// Arriba los dos atajos que se usan de verdad —lo mío y todo— y después el
// equipo agrupado por rol, que es como uno piensa en la gente: "¿quién edita?",
// no "¿quién empieza con J?".
function PeoplePopover({ anchorRef, members, nombreEmpresa, miId, tasks, personas, setPersonas, onClose }) {
  const grupos = useMemo(() => agruparMiembrosPorRol(members, { companyName: nombreEmpresa }), [members, nombreEmpresa]);
  const cuenta = (id) => tasks.filter((t) => esDe(t, [id])).length;
  const toggle = (id) => setPersonas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const soloMias = !!miId && personas.length === 1 && personas[0] === miId;

  return (
    <Popover anchorRef={anchorRef} width={276} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {miId && (
          <FilaPopover on={soloMias} tipo="radio" onClick={() => setPersonas([miId])}
            texto="Mías" cuenta={cuenta(miId)} fuerte />
        )}
        <FilaPopover on={personas.length === 0} tipo="radio" onClick={() => setPersonas([])}
          texto="Todos" cuenta={tasks.length} fuerte />

        {members.length === 0 && (
          <span style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "8px 9px" }}>Esta empresa todavía no tiene equipo.</span>
        )}

        {/* El título del grupo selecciona el área entera: así el PM ve toda la
            carga de edición de un clic, en vez de ir tildando persona por
            persona. */}
        {grupos.map((g) => (
          <div key={g.key} style={{ marginTop: 6 }}>
            <button type="button" onClick={() => setPersonas(g.miembros.map((m) => m.id))}
              title={`Ver todo lo de ${g.label}`}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer",
                padding: "4px 9px 3px", fontFamily: DS.font, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
              {g.label}
            </button>
            {g.miembros.map((m) => (
              <FilaPopover key={m.id} on={personas.includes(m.id)} onClick={() => toggle(m.id)}
                texto={m.name} cuenta={cuenta(m.id)} punto={m.color || "var(--ink-3)"} />
            ))}
          </div>
        ))}
      </div>
    </Popover>
  );
}

// Fila de popover. `tipo="radio"` para las opciones que se excluyen entre sí
// (Mías / Todos / el rango): una casilla ahí sugeriría que se pueden sumar.
function FilaPopover({ on, tipo = "check", onClick, texto, cuenta, punto, fuerte }) {
  const radio = tipo === "radio";
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%",
        fontFamily: DS.font, border: "none", background: on ? "var(--sel-soft)" : "transparent" }}>
      <span style={{ width: 16, height: 16, flex: "none", borderRadius: radio ? 999 : 5, display: "grid", placeItems: "center",
        background: on && !radio ? "var(--sel)" : "transparent", border: `1.5px solid ${on ? "var(--sel)" : "var(--line-2)"}` }}>
        {on && (radio
          ? <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--sel)" }} />
          : <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>)}
      </span>
      {punto && <span style={{ width: 7, height: 7, borderRadius: 999, flex: "none", background: punto }} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: fuerte ? 700 : 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
      {cuenta !== undefined && <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{cuenta}</span>}
    </button>
  );
}

// ── Columna reutilizable ─────────────────────────────────────────────
function Columna({ color, titulo, sub, count, destacada, onDrop, children }) {
  const [encima, setEncima] = useState(false);
  return (
    <div
      onDragOver={onDrop ? (e) => { e.preventDefault(); setEncima(true); } : undefined}
      onDragLeave={onDrop ? () => setEncima(false) : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); setEncima(false); onDrop(e.dataTransfer.getData("text/plain")); } : undefined}
      /* La altura mínima no es estética: sin ella una columna vacía mide lo que
         mide su cabecera y soltarle una tarjeta encima es apuntarle a nada. */
      style={{ borderRadius: 18, padding: 12, minHeight: 140,
        background: encima ? "var(--sel-soft)" : "var(--surface-2)",
        border: `1px solid ${encima || destacada ? "var(--line-2)" : "var(--line)"}`,
        boxShadow: encima ? "var(--sel-rim)" : "none",
        display: "flex", flexDirection: "column", gap: 9, minWidth: 0,
        transition: "background .12s ease, border-color .12s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 3px" }}>
        {color && <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flex: "none" }} />}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: destacada ? "var(--sel)" : "var(--ink)" }}>{titulo}</span>
        {sub && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{sub}</span>}
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>{count}</span>
      </div>
      {count === 0
        ? <span style={{ fontSize: 12, color: "var(--ink-4)", padding: "6px 3px" }}>Sin tareas</span>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}

// ── Tarjeta ──────────────────────────────────────────────────────────
// Tres datos y ninguna acción: qué hay que hacer, quién lo hace y para cuándo.
// La bandera es la prioridad —lo que se mira para ordenar el día— y la fecha
// avisa sola cuando ya se pasó. Bloquear se hace arrastrando a su columna o
// desde el chip de Estado, que es donde vive el estado.
function Tarjeta({ t, hoy, onOpen, membersById = {}, miId = null }) {
  // De quiénes es, con uno mismo primero: ver el nombre de otro en la tarea que
  // te toca a vos es desorientador.
  const quien = quienesLaTienen(t, membersById, miId);
  const bloqueada = t.estado === "bloqueado";
  const prio = PRIO_BY_KEY[t.prio];
  const fecha = fechaTono(t.fecha, hoy);
  const TONO = { vencido: "var(--brand)", hoy: "var(--amber)", futuro: "var(--ink-4)" };
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={() => onOpen(t)}
      style={{ padding: "11px 12px", borderRadius: 14, cursor: "grab", background: "var(--surface-solid)",
        border: `1px solid ${bloqueada ? "rgba(217,63,62,0.42)" : "var(--line)"}`,
        display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: "var(--ink)" }}>{t.titulo || "Sin título"}</span>
        <span title={`Prioridad ${prio?.label || ""}`}
          style={{ flex: "none", marginTop: 1, display: "flex", color: prio?.color || "var(--ink-4)", opacity: t.prio === "baja" ? 0.45 : 1 }}>
          <Icon d={ICON.bandera} size={14} />
        </span>
      </div>
      {t.nota && !t.total && (
        <span style={{ fontSize: 12, lineHeight: 1.4, color: bloqueada ? "var(--brand)" : "var(--ink-3)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.nota}</span>
      )}
      {/* Tarea armada por el pipeline: el avance vale más que la descripción,
          que dice lo mismo con palabras. */}
      {t.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((t.done / t.total) * 100)}%`, height: "100%", borderRadius: 999,
              background: t.done >= t.total ? "var(--green)" : "var(--sel)", transition: "width .3s ease" }} />
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{t.done}/{t.total}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, flex: "none", borderRadius: 999, display: "grid", placeItems: "center",
          background: quien.nombre ? quien.color : "var(--chip)", color: quien.nombre ? "#fff" : "var(--ink-4)", fontSize: 9.5, fontWeight: 700 }}>
          {iniciales(quien.nombre)}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ color: "var(--ink)", fontWeight: 600 }}>{quien.texto}</b>
          {quien.rol && <span style={{ color: "var(--ink-4)" }}> · {quien.rol}</span>}
        </span>
        {fecha.texto && (
          <span style={{ flex: "none", fontSize: 11, fontWeight: fecha.tono === "futuro" ? 500 : 700, color: TONO[fecha.tono] }}>
            {fecha.texto}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Vista por estado ─────────────────────────────────────────────────
// Lo vencido sale de las columnas y va a una franja propia arriba: mezclado con
// la semana no se distingue lo que hay que hacer de lo que ya se debía.
function VistaEstado({ tasks, atrasadas, hoy, onOpenTask, onPatch, membersById, miId }) {
  const [abierta, setAbierta] = useState(() => {
    try { return localStorage.getItem("tareas_atrasado_cerrado") !== "1"; } catch { return true; }
  });
  const alternar = () => setAbierta((v) => {
    try { localStorage.setItem("tareas_atrasado_cerrado", v ? "1" : "0"); } catch { /* modo privado */ }
    return !v;
  });

  // `atrasadas` llega de arriba porque se calcula sin el filtro de días; acá
  // solo hay que sacarlas de las columnas para que no salgan dos veces.
  const resto = tasks.filter((t) => !estaAtrasada(t, hoy));
  const cols = groupByEstado(resto);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {atrasadas.length > 0 && (
        <section style={{ borderRadius: 14, padding: "9px 11px", background: "var(--brand-soft)", border: "1px solid rgba(226,75,74,0.28)" }}>
          <button type="button" onClick={alternar}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "2px 3px", border: "none", background: "transparent", cursor: "pointer", fontFamily: DS.font }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--brand)" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand)" }}>Atrasado</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--brand)" }}>{atrasadas.length}</span>
            <span style={{ marginLeft: "auto", display: "flex", color: "var(--brand)", transform: abierta ? "rotate(180deg)" : "none" }}>
              <Icon d={ICON.chevron} size={14} />
            </span>
          </button>
          {/* `auto-fit` y no `auto-fill`: con `auto-fill` el navegador reserva
              columnas vacías del ancho del contenedor, así que una sola tarea
              atrasada dejaba un rectángulo rojo enorme con una tarjetita adentro. */}
          {abierta && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, max-content))", gap: 8, marginTop: 9 }}>
              {atrasadas.map((t) => <Tarjeta key={t.id} t={t} hoy={hoy} onOpen={onOpenTask} membersById={membersById} miId={miId} />)}
            </div>
          )}
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, alignItems: "start" }}>
        {cols.map((c) => (
          <Columna key={c.key} color={c.color} titulo={c.label} count={c.tasks.length}
            onDrop={(id) => id && onPatch(id, { status: c.key })}>
            {c.tasks.map((t) => <Tarjeta key={t.id} t={t} hoy={hoy} onOpen={onOpenTask} membersById={membersById} miId={miId} />)}
          </Columna>
        ))}
      </div>
    </div>
  );
}

// ── Vista por fecha ──────────────────────────────────────────────────
function VistaFecha({ tasks, span, hoy, onOpenTask, onPatch, membersById, miId }) {
  const cols = groupByFecha(tasks, [], hoy, span);
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
      {cols.map((c) => (
        <div key={c.key || "sin"} style={{ flex: "0 0 288px", minWidth: 0 }}>
          <Columna
            titulo={c.label}
            sub={c.pasado && c.sinCerrar ? `${c.sinCerrar} sin cerrar` : c.sub}
            count={c.tasks.length}
            destacada={c.hoy}
            onDrop={c.key ? (id) => id && onPatch(id, { due_date: c.key }) : undefined}>
            {c.tasks.map((t) => <Tarjeta key={t.id} t={t} hoy={hoy} onOpen={onOpenTask} membersById={membersById} miId={miId} />)}
          </Columna>
        </div>
      ))}
    </div>
  );
}

// ── Vista por persona ────────────────────────────────────────────────
function VistaPersona({ tasks, members, hoy, onOpenTask, membersById, miId }) {
  const cols = groupByPersona(tasks, members);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
      {cols.map((p) => {
        const total = p.tasks.length;
        const pct = total ? Math.round((p.hechas / total) * 100) : 0;
        return (
          <div key={p.id || "libres"} style={{ borderRadius: 18, padding: 14, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, flex: "none", borderRadius: 999, display: "grid", placeItems: "center",
                background: p.id ? p.color : "var(--chip)", color: p.id ? "#fff" : "var(--ink-4)", fontSize: 11, fontWeight: 700 }}>
                {iniciales(p.nombre)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{p.rol}</div>
              </div>
              {p.bloqueos > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", color: "var(--brand)", background: "var(--brand-soft)" }}>
                  {p.bloqueos} {p.bloqueos === 1 ? "bloqueo" : "bloqueos"}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--green)", borderRadius: 999 }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{p.hechas}/{total}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {total === 0 && <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Sin tareas</span>}
              {p.tasks.map((t) => {
                const hecha = t.estado === "completado";
                return (
                  <button key={t.id} type="button" onClick={() => onOpenTask(t)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                      border: "none", background: "transparent", fontFamily: DS.font }}>
                    <span style={{ width: 6, height: 6, flex: "none", borderRadius: 999, background: ESTADOS.find((e) => e.key === t.estado)?.color || "var(--ink-3)" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: hecha ? "var(--ink-4)" : "var(--ink)", textDecoration: hecha ? "line-through" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo || "Sin título"}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-4)", flex: "none" }}>{t.fecha ? humanDay(t.fecha, hoy) : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
