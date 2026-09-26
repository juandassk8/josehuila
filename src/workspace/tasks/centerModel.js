// Lógica pura del Centro de Tareas: traducción fila↔tarjeta, agrupaciones y
// calendario. Sin React y sin Supabase, así se testea de verdad.
//
// El "hoy" y la lista de miembros siempre se pasan por parámetro: una función
// que lee el reloj por su cuenta no se puede testear ni congelar en una vista.

import { ROLE_BY_KEY } from "../team_roles.js";

// ── Estados ──────────────────────────────────────────────────────────
// Las claves son las de la columna `status`; las etiquetas son las que se ven.
export const ESTADOS = [
  { key: "pendiente", label: "Pendiente", color: "var(--ink-3)" },
  { key: "en_curso", label: "En curso", color: "var(--sel)" },
  { key: "completado", label: "Hecho", color: "var(--green)" },
  { key: "bloqueado", label: "Bloqueado", color: "var(--brand)" },
];
export const ESTADO_BY_KEY = Object.fromEntries(ESTADOS.map((e) => [e.key, e]));

// ── Prioridad ────────────────────────────────────────────────────────
// La tabla guarda urgente/alta/normal/baja; el tablero muestra tres niveles.
// `urgente` de tareas viejas se lee como Alta en vez de perderse.
export const PRIOS = [
  { key: "alta", label: "Alta", color: "var(--brand)" },
  { key: "normal", label: "Media", color: "var(--amber)" },
  { key: "baja", label: "Baja", color: "var(--ink-4)" },
];
export const PRIO_BY_KEY = Object.fromEntries(PRIOS.map((p) => [p.key, p]));
export const normalizePrio = (p) => (p === "urgente" ? "alta" : PRIO_BY_KEY[p] ? p : "normal");

// ── Roles ────────────────────────────────────────────────────────────
// Los del equipo (team_roles.js) más "Reunión", que es una tarea del calendario
// y no una función de nadie.
export const ROLES_TAREA = [
  { key: "owner", label: "Estratega", color: "#F5A623" },
  { key: "copywriter", label: "Copywriter", color: "#3B8BD4" },
  { key: "project_manager", label: "Project Manager", color: "#8B5CF6" },
  { key: "content", label: "Content", color: "#E24B4A" },
  { key: "editor", label: "Editor", color: "#C94C9E" },
  { key: "designer", label: "Diseñador", color: "#1DB97A" },
  { key: "trafficker", label: "Trafficker", color: "#06B6D4" },
  { key: "reunion", label: "Reunión", color: "#7183A1" },
];
export const ROL_BY_KEY = Object.fromEntries(ROLES_TAREA.map((r) => [r.key, r]));
export const rolLabel = (key) => ROL_BY_KEY[key]?.label || ROLE_BY_KEY[key]?.label || "";
export const rolColor = (key) => ROL_BY_KEY[key]?.color || ROLE_BY_KEY[key]?.color || "var(--ink-3)";

// ── Fechas ───────────────────────────────────────────────────────────
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Clave de día en horario LOCAL. `toISOString()` convierte a UTC y en Colombia
// (UTC-5) cualquier hora de la tarde salta al día siguiente.
export function dayKey(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// 'YYYY-MM-DD' → Date local al mediodía. El mediodía evita que un cambio de
// horario de verano corra el día.
export function fromKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function addDays(key, n) {
  const d = fromKey(key);
  if (!d) return key;
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// "Hoy" / "Mañana" / "Ayer" / "jueves" dentro de la semana / "27 jul" lejos.
export function humanDay(key, todayKey) {
  const d = fromKey(key);
  if (!d) return "";
  const diff = Math.round((fromKey(key) - fromKey(todayKey)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  if (diff > 1 && diff < 7) return DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase());
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Cómo se ve la fecha EN LA TARJETA, con su aviso.
//
// No es lo mismo "el jueves" que "hace tres días": lo vencido tiene que gritar y
// lo de hoy tiene que verse. Devuelve el texto y el tono, y quien pinta decide
// el color — así el criterio de qué está tarde vive en un solo lugar.
//   tono: 'vencido' (rojo) · 'hoy' (ámbar) · 'futuro' (gris) · '' (sin fecha)
export function fechaTono(key, todayKey) {
  if (!key) return { texto: "", tono: "" };
  const d = fromKey(key), hoy = fromKey(todayKey);
  if (!d || !hoy) return { texto: "", tono: "" };
  const diff = Math.round((d - hoy) / 86400000);
  if (diff === 0) return { texto: "Hoy", tono: "hoy" };
  if (diff === -1) return { texto: "Ayer", tono: "vencido" };
  if (diff < -1) return { texto: `hace ${-diff} días`, tono: "vencido" };
  return { texto: humanDay(key, todayKey), tono: "futuro" };
}

export const shortDay = (key) => {
  const d = fromKey(key);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : "";
};

export const monthLabel = (y, m) => {
  const largos = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${largos[m]} ${y}`;
};

// Rejilla del mes: 6 semanas de 7 días arrancando en LUNES, con los días de los
// meses vecinos que completan la primera y la última semana — esos también se
// pueden elegir, así que se devuelven como días normales marcados `fuera`.
export function monthGrid(year, month) {
  const primero = new Date(year, month, 1, 12);
  // getDay(): 0=domingo. Con la semana en lunes, el domingo queda 6.
  const offset = (primero.getDay() + 6) % 7;
  const inicio = new Date(year, month, 1 - offset, 12);
  const semanas = [];
  for (let s = 0; s < 6; s++) {
    const semana = [];
    for (let d = 0; d < 7; d++) {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + s * 7 + d);
      semana.push({ key: dayKey(dia), num: dia.getDate(), fuera: dia.getMonth() !== month });
    }
    semanas.push(semana);
  }
  return semanas;
}

// Los atajos de la barra. Devuelven listas de claves de día.
export function chipRange(chip, todayKey) {
  const hoy = fromKey(todayKey);
  if (!hoy) return [];
  switch (chip) {
    case "ayer": return [addDays(todayKey, -1)];
    case "hoy": return [todayKey];
    case "manana": return [addDays(todayKey, 1)];
    case "finde": {
      // El sábado y el domingo de ESTA semana (lunes a domingo).
      const desdeLunes = (hoy.getDay() + 6) % 7;
      return [addDays(todayKey, 5 - desdeLunes), addDays(todayKey, 6 - desdeLunes)];
    }
    case "semana": {
      const desdeLunes = (hoy.getDay() + 6) % 7;
      return Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - desdeLunes));
    }
    default: return [];
  }
}

// El alcance por defecto del tablero: lo que de verdad importa esta semana.
//
// Antes, sin días elegidos, el chip decía "Esta semana" y no filtraba nada: salía
// una tarea terminada hacía 103 días al lado de la de hoy. Ahora "Esta semana"
// quiere decir tres cosas, y ninguna es ruido:
//
//   · cae en esta semana (lunes a domingo),
//   · o no tiene fecha y sigue abierta —hay que ponérsela—,
//   · o está vencida y sin cerrar —está atrasada—.
//
// Lo que queda afuera es exactamente lo que ya no hay que mirar: lo terminado,
// tenga fecha vieja o no tenga ninguna.
export function enAlcanceSemana(t, todayKey) {
  if (chipRange("semana", todayKey).includes(t.fecha)) return true;
  if (t.estado === "completado") return false;
  return !t.fecha || t.fecha < todayKey;
}

// ¿Se le pasó la fecha y sigue abierta? Es lo que va a la franja de arriba.
export function estaAtrasada(t, todayKey) {
  return !!t.fecha && t.fecha < todayKey && t.estado !== "completado";
}

// ── Quién ────────────────────────────────────────────────────────────
// ¿La tarea es de alguna de estas personas? Mira a TODOS los asignados.
//
// La tarjeta muestra una sola persona (`who` = el primero de la lista), y el
// filtro comparaba contra ese. Pero las tareas del Content Pipeline se le
// asignan a todo el que tenga el rol: con dos editores, el segundo filtraba por
// su nombre y no veía su propia tarea.
//
// Sin nadie elegido no filtra: "todos" es la ausencia de filtro, no una lista.
export function esDe(t, memberIds) {
  if (!memberIds?.length) return true;
  const asignados = t.asignados?.length ? t.asignados : (t.who ? [t.who] : []);
  return asignados.some((id) => memberIds.includes(id));
}

// Cómo venís hoy, para la línea de arriba.
//
// Se calcula sobre TODAS tus tareas y no sobre las que se están viendo: si no,
// filtrar por "Hoy" escondería el número de atrasadas, que es justo el que hay
// que ver.
export function resumenDelDia(tasks, memberIds, todayKey) {
  const abiertas = (tasks || []).filter((t) => esDe(t, memberIds) && t.estado !== "completado");
  return {
    hoy: abiertas.filter((t) => t.fecha === todayKey).length,
    atrasadas: abiertas.filter((t) => estaAtrasada(t, todayKey)).length,
    abiertas: abiertas.length,
  };
}

// El equipo agrupado por rol, para el selector de personas.
//
// `company_team_members` no es una lista de gente: guarda también la fila de la
// empresa (`is_owner`, con el nombre del cliente) y la del pool de creadoras
// externas (`is_ugc_pool`). Salían mezcladas con el equipo como si fueran
// personas — "Peluna Pets" al lado de Johan, con 0 tareas.
//
// Bajan a "Otros" en vez de desaparecer: si alguna tarea quedó asignada ahí, hay
// que poder encontrarla. Y quien tiene varios roles aparece una sola vez, bajo
// el primero — el mismo criterio que usa la tarjeta para mostrar el rol.
export function agruparMiembrosPorRol(members, { companyName = "" } = {}) {
  const esLaEmpresa = (m) =>
    !!companyName && String(m.name || "").trim().toLowerCase() === String(companyName).trim().toLowerCase();

  const grupos = new Map();
  const push = (key, label, m) => {
    if (!grupos.has(key)) grupos.set(key, { key, label, miembros: [] });
    grupos.get(key).miembros.push(m);
  };

  const otros = [];
  for (const m of members || []) {
    if (m.is_ugc_pool || esLaEmpresa(m)) { otros.push(m); continue; }
    const rol = (m.roles || []).find((r) => ROL_BY_KEY[r] || ROLE_BY_KEY[r]) || "";
    push(rol || "sin_rol", rol ? rolLabel(rol) : "Sin rol", m);
  }

  // En el orden en que se trabaja, no alfabético.
  const orden = ROLES_TAREA.map((r) => r.key).filter((k) => k !== "reunion");
  const salida = [
    ...orden.filter((k) => grupos.has(k)).map((k) => grupos.get(k)),
    ...(grupos.has("sin_rol") ? [grupos.get("sin_rol")] : []),
  ];
  if (otros.length) salida.push({ key: "otros", label: "Otros", miembros: otros });
  return salida;
}

// ── De quiénes es la tarea ───────────────────────────────────────────
// Con varios asignados, el que mira va PRIMERO.
//
// Las tareas del Content Pipeline caen a todo el que tenga el rol: si hay dos
// editores, la de edición es de los dos. La tarjeta pintaba solo al primero de
// la lista, así que Johan filtraba por "Mías" y leía "Alejandro · Editor" en su
// propio trabajo. Uno tiene que poder buscarse a sí mismo en su tablero.
export function quienesLaTienen(t, membersById = {}, yoId = null) {
  const ids = t?.asignados?.length ? t.asignados : (t?.who ? [t.who] : []);
  const orden = yoId && ids.includes(yoId) ? [yoId, ...ids.filter((x) => x !== yoId)] : ids;
  const gente = orden.map((id) => membersById[id]).filter(Boolean);
  if (!gente.length) return { texto: "Sin asignar", color: "var(--ink-3)", nombre: "", rol: "" };

  const [primero, ...resto] = gente;
  // Con tres o más los nombres tapan el título; con dos entran cómodos.
  const texto = resto.length === 0 ? primero.name
    : resto.length === 1 ? `${primero.name} y ${resto[0].name}`
      : `${primero.name} y ${resto.length} más`;
  return {
    texto,
    nombre: primero.name || "",
    color: primero.color || "var(--ink-3)",
    // El rol solo cuando la tarea es de una sola persona: con dos, decir el rol
    // de una sería atribuirle a la otra algo que no es suyo.
    rol: resto.length ? "" : rolLabel((primero.roles || [])[0]),
  };
}

// ── Fila de Supabase → tarjeta ───────────────────────────────────────
// `who` es el PRIMER asignado. Se conserva porque el chip de persona del modal
// edita a uno solo; para MOSTRAR de quién es, usar `quienesLaTienen`.
export function toTask(row, membersById = {}) {
  const asignados = (row.assignees || []).map((a) => a.member_id).filter(Boolean);
  const who = asignados[0] || null;
  return {
    id: row.id,
    titulo: row.title || "",
    nota: row.description || "",
    tipo: row.tipo === "ritmo" ? "ritmo" : "puntual",
    rol: row.rol || "",
    who,
    whoNombre: membersById[who]?.name || "",
    whoColor: membersById[who]?.color || "var(--ink-3)",
    // El rol que se muestra es el de LA PERSONA, no el de la tarea: es lo que
    // dice de qué se ocupa quien la tiene.
    whoRol: rolLabel((membersById[who]?.roles || [])[0]),
    prio: normalizePrio(row.priority),
    estado: ESTADO_BY_KEY[row.status] ? row.status : "pendiente",
    fecha: row.due_date || "",
    asignados,
    spaceId: row.space_id || null,
    // Las tareas que arma el Content Pipeline traen su avance: "9 de 21".
    auto: !!row.auto_generated,
    autoKey: row.auto_key || null,
    // De dónde salió, para poder volver: el brief y la etapa del Content Pipeline.
    briefId: row.brief_id || null,
    etapa: row.stage_kind || null,
    done: Number.isFinite(row.auto_done) ? row.auto_done : null,
    total: Number.isFinite(row.auto_total) ? row.auto_total : null,
  };
}

// ── Agrupaciones ─────────────────────────────────────────────────────
export function groupByEstado(tasks) {
  return ESTADOS.map((e) => ({ ...e, tasks: tasks.filter((t) => t.estado === e.key) }));
}

// Una columna por día. Sin días elegidos, de hoy en adelante (`span` días).
// Las tareas sin fecha se juntan aparte para que no desaparezcan del tablero.
export function groupByFecha(tasks, dias, todayKey, span = 7) {
  const keys = dias?.length
    ? [...new Set(dias)].sort()
    : Array.from({ length: span }, (_, i) => addDays(todayKey, i));
  const cols = keys.map((key) => {
    const delDia = tasks.filter((t) => t.fecha === key);
    return {
      key,
      label: humanDay(key, todayKey),
      sub: shortDay(key),
      hoy: key === todayKey,
      pasado: key < todayKey,
      sinCerrar: delDia.filter((t) => t.estado !== "completado").length,
      tasks: delDia,
    };
  });
  const sinFecha = tasks.filter((t) => !t.fecha);
  if (sinFecha.length) {
    cols.push({ key: "", label: "Sin fecha", sub: "", hoy: false, pasado: false, sinCerrar: 0, tasks: sinFecha });
  }
  return cols;
}

export function groupByPersona(tasks, members) {
  const cols = members.map((m) => {
    const suyas = tasks.filter((t) => t.who === m.id);
    return {
      id: m.id,
      nombre: m.name || "Sin nombre",
      rol: rolLabel((m.roles || [])[0]) || "Sin rol",
      color: m.color || "var(--ink-3)",
      hechas: suyas.filter((t) => t.estado === "completado").length,
      bloqueos: suyas.filter((t) => t.estado === "bloqueado").length,
      tasks: suyas,
    };
  });
  const libres = tasks.filter((t) => !t.who);
  if (libres.length) {
    cols.push({
      id: null, nombre: "Sin asignar", rol: "—", color: "var(--ink-4)",
      hechas: libres.filter((t) => t.estado === "completado").length,
      bloqueos: libres.filter((t) => t.estado === "bloqueado").length,
      tasks: libres,
    });
  }
  return cols;
}

// Días que tienen al menos una tarea — el puntito del calendario.
export function diasConTareas(tasks) {
  return new Set(tasks.map((t) => t.fecha).filter(Boolean));
}

// Iniciales para el avatar: dos como mucho, sin partirse con nombres de una palabra.
export function iniciales(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// Cuánto falta para la daily. Devuelve "en 3 h", "en 25 min" o "mañana".
export function faltaPara(hora, ahora) {
  const [h, m] = String(hora || "8:00").split(":").map(Number);
  const objetivo = new Date(ahora);
  objetivo.setHours(h || 0, m || 0, 0, 0);
  let diff = objetivo - ahora;
  if (diff < 0) return "mañana";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `en ${mins} min`;
  return `en ${Math.round(mins / 60)} h`;
}
