import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays, subDays, addMonths, subMonths,
} from "date-fns";

// ============================================================
// CAMPOS DISPONIBLES
// ============================================================

export const FILTER_FIELDS = [
  { key: "status",       label: "Estado",            icon: "◎", type: "enum",   multi: true },
  { key: "priority",     label: "Prioridad",         icon: "🚩", type: "enum",  multi: true },
  { key: "assignee",     label: "Persona asignada",  icon: "👤", type: "member", multi: true, nullable: true },
  { key: "creator",      label: "Creador",           icon: "👥", type: "member", multi: false },
  { key: "space",        label: "Espacio",           icon: "🗂",  type: "space",  multi: true, nullable: true },
  { key: "due_date",     label: "Fecha límite",      icon: "📅", type: "date",   multi: true, nullable: true },
  { key: "completed_at", label: "Fecha de cierre",   icon: "✓",  type: "date",   multi: true, nullable: true },
  { key: "created_at",   label: "Fecha de creación", icon: "🕒", type: "date",   multi: true },
];

// ============================================================
// OPERADORES
// ============================================================

export const OPERATORS_BY_TYPE = {
  enum:   ["is", "is_not"],
  member: ["is", "is_not", "is_set", "is_not_set"],
  space:  ["is", "is_not", "is_set", "is_not_set"],
  date:   ["is", "is_not", "is_set", "is_not_set"],
};

export const OPERATOR_LABEL = {
  is: "Es",
  is_not: "No es",
  is_set: "Está establecida",
  is_not_set: "No está establecida",
};

export function operatorsFor(field) {
  const f = FILTER_FIELDS.find((x) => x.key === field);
  if (!f) return ["is", "is_not"];
  const ops = OPERATORS_BY_TYPE[f.type] || ["is", "is_not"];
  return f.nullable ? ops : ops.filter((o) => o !== "is_set" && o !== "is_not_set");
}

// ============================================================
// VALORES ENUM
// ============================================================

export const STATUS_OPTIONS = [
  { value: "pendiente",  label: "Pendiente" },
  { value: "en_curso",   label: "En curso" },
  { value: "completado", label: "Completado" },
];

export const PRIORITY_OPTIONS = [
  { value: "urgente", label: "Urgente" },
  { value: "alta",    label: "Alta" },
  { value: "normal",  label: "Normal" },
  { value: "baja",    label: "Baja" },
];

// ============================================================
// VALORES DE FECHA
// ============================================================

export const DATE_VALUES = [
  { value: "hoy",              label: "Hoy" },
  { value: "ayer",             label: "Ayer" },
  { value: "manana",           label: "Mañana" },
  { value: "proximos_7",       label: "Próximos 7 días" },
  { value: "ultimos_7",        label: "Últimos 7 días" },
  { value: "esta_semana",      label: "Esta semana" },
  { value: "proxima_semana",   label: "Próxima semana" },
  { value: "ultima_semana",    label: "Última semana" },
  { value: "este_mes",         label: "Este mes" },
  { value: "ultimo_mes",       label: "Último mes" },
  { value: "mes_siguiente",    label: "Mes siguiente" },
  { value: "hoy_y_antes",      label: "Hoy y antes" },
  { value: "despues_de_hoy",   label: "Después de hoy" },
  { value: "atrasado",         label: "Atrasado (solo vencidas)" },
];

// ============================================================
// RESOLVER DE RANGOS DE FECHA
// ============================================================

export function resolveDateRange(key, now = new Date()) {
  const today = startOfDay(now);
  const endToday = endOfDay(now);
  switch (key) {
    case "hoy":
      return { start: today, end: endToday };
    case "ayer":
      return { start: startOfDay(subDays(today, 1)), end: endOfDay(subDays(today, 1)) };
    case "manana":
      return { start: startOfDay(addDays(today, 1)), end: endOfDay(addDays(today, 1)) };
    case "proximos_7":
      return { start: today, end: endOfDay(addDays(today, 7)) };
    case "ultimos_7":
      return { start: startOfDay(subDays(today, 7)), end: endToday };
    case "esta_semana":
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case "proxima_semana": {
      const n = addDays(today, 7);
      return { start: startOfWeek(n, { weekStartsOn: 1 }), end: endOfWeek(n, { weekStartsOn: 1 }) };
    }
    case "ultima_semana": {
      const p = subDays(today, 7);
      return { start: startOfWeek(p, { weekStartsOn: 1 }), end: endOfWeek(p, { weekStartsOn: 1 }) };
    }
    case "este_mes":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "ultimo_mes": {
      const p = subMonths(today, 1);
      return { start: startOfMonth(p), end: endOfMonth(p) };
    }
    case "mes_siguiente": {
      const n = addMonths(today, 1);
      return { start: startOfMonth(n), end: endOfMonth(n) };
    }
    case "hoy_y_antes":
      return { start: null, end: endToday };
    case "despues_de_hoy":
      return { start: startOfDay(addDays(today, 1)), end: null };
    case "atrasado":
      return { start: null, end: endOfDay(subDays(today, 1)), taskGuard: (t) => t.status !== "completado" };
    default:
      return null;
  }
}

// Parse una due_date (YYYY-MM-DD) como fecha local (no UTC).
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr !== "string") return new Date(dateStr);
  // Si ya tiene T, es timestamp
  if (dateStr.includes("T")) return new Date(dateStr);
  // YYYY-MM-DD → mediodía local para evitar shifts de TZ
  return new Date(dateStr + "T12:00:00");
}

function matchesDateRange(dateValue, key, now, task) {
  if (!dateValue) return false;
  const range = resolveDateRange(key, now);
  if (!range) return false;
  if (range.taskGuard && !range.taskGuard(task)) return false;
  const d = parseLocalDate(dateValue);
  if (!d) return false;
  if (range.start && d.getTime() < range.start.getTime()) return false;
  if (range.end && d.getTime() > range.end.getTime()) return false;
  return true;
}

// ============================================================
// APLICACIÓN DE FILTROS
// ============================================================

// rule = { id, field, operator, value }
// state = { rules: rule[] }
export function ruleMatchesTask(task, rule, { now = new Date() } = {}) {
  const { field, operator, value } = rule;
  if (!field || !operator) return true;

  // Obtener el valor del task para el campo
  let taskValue;
  switch (field) {
    case "status": taskValue = task.status; break;
    case "priority": taskValue = task.priority; break;
    case "assignee": taskValue = task.assigneeIds || []; break;
    case "creator": taskValue = task.created_by; break;
    case "space": taskValue = task.space_id; break;
    case "due_date": taskValue = task.due_date; break;
    case "completed_at": taskValue = task.completed_at; break;
    case "created_at": taskValue = task.created_at; break;
    default: return true;
  }

  // is_set / is_not_set
  if (operator === "is_set") {
    if (Array.isArray(taskValue)) return taskValue.length > 0;
    return taskValue != null && taskValue !== "";
  }
  if (operator === "is_not_set") {
    if (Array.isArray(taskValue)) return taskValue.length === 0;
    return taskValue == null || taskValue === "";
  }

  // is / is_not — valor puede ser scalar o array (multi)
  const values = Array.isArray(value) ? value : (value != null ? [value] : []);
  if (values.length === 0) return true; // regla incompleta → no filtra

  const isDate = ["due_date", "completed_at", "created_at"].includes(field);

  let matches = false;
  if (field === "assignee") {
    // taskValue es array de ids de asignados. Regla matchea si intersecta.
    matches = values.some((v) => (taskValue || []).includes(v));
  } else if (isDate) {
    matches = values.some((v) => matchesDateRange(taskValue, v, now, task));
  } else {
    matches = values.some((v) => v === taskValue);
  }

  return operator === "is_not" ? !matches : matches;
}

// Agrupa las reglas en grupos AND separados por conectores "or".
// Ej.: [A, B(and), C(or), D(and)] → [[A, B], [C, D]]
function groupRulesByConnector(rules) {
  const groups = [];
  let current = [];
  rules.forEach((r, i) => {
    if (i === 0 || r.connector !== "or") {
      current.push(r);
    } else {
      if (current.length) groups.push(current);
      current = [r];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

export function applyTaskFilters(tasks, state, ctx = {}) {
  const rules = state?.rules || [];
  if (!rules.length) return tasks;
  const now = ctx.now || new Date();
  const groups = groupRulesByConnector(rules);
  // Entre grupos: OR. Dentro de cada grupo: AND.
  return (tasks || []).filter((t) =>
    groups.some((g) => g.every((r) => ruleMatchesTask(t, r, { now })))
  );
}

// ============================================================
// CONSTRUCTORES Y PRESETS
// ============================================================

let _ruleId = 0;
export function newRule(field = "status") {
  _ruleId += 1;
  const ops = operatorsFor(field);
  return {
    id: `r_${Date.now()}_${_ruleId}`,
    field,
    operator: ops[0] || "is",
    value: [],
    connector: "and",
  };
}

export function emptyFilterState() {
  return { rules: [] };
}

// Default que el usuario pidió: fecha límite Hoy o Ayer.
export function defaultHoyAyer() {
  return {
    rules: [
      { id: "default_hoy_ayer", field: "due_date", operator: "is", value: ["hoy", "ayer"] },
    ],
  };
}

// Preset: Mis tareas
export function presetMisTareas(memberId) {
  return {
    rules: [
      { id: "preset_mine", field: "assignee", operator: "is", value: [memberId] },
    ],
  };
}

// ============================================================
// LABELS
// ============================================================

export function fieldLabel(key) {
  return FILTER_FIELDS.find((f) => f.key === key)?.label || key;
}

export function operatorLabel(op) {
  return OPERATOR_LABEL[op] || op;
}
