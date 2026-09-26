// Calculate the next due date based on a recurrence pattern.
// Returns ISO date string (YYYY-MM-DD) or null.
export function calculateNextDate(currentDate, pattern, interval = 1, days = null) {
  if (!pattern) return null;
  if (pattern === "dias_semana") {
    // days: 7 posiciones L..D (1 = toca). La siguiente es el próximo día marcado DESPUÉS de hoy
    // (o de la fecha de la tarea, si es futura), así una tarea vencida no renace en el pasado.
    const valid = Array.isArray(days) && days.some(Boolean);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const due = currentDate ? new Date(currentDate + "T12:00:00") : today;
    const from = due > today ? due : today;
    for (let i = 1; i <= 7; i++) {
      const c = new Date(from); c.setDate(from.getDate() + i);
      if (!valid || days[(c.getDay() + 6) % 7]) return localIso(c);
    }
    return null;
  }
  const base = currentDate ? new Date(currentDate + "T12:00:00") : new Date();
  const d = new Date(base);

  switch (pattern) {
    case "diariamente":
      d.setDate(d.getDate() + interval);
      break;
    case "semanal":
      d.setDate(d.getDate() + 7 * interval);
      break;
    case "mensual":
      d.setMonth(d.getMonth() + interval);
      break;
    case "anual":
      d.setFullYear(d.getFullYear() + interval);
      break;
    case "days_after":
      d.setDate(d.getDate() + interval);
      break;
    default:
      return null;
  }

  return d.toISOString().slice(0, 10);
}

export const RECURRENCE_PATTERNS = [
  { value: "diariamente", label: "Diariamente" },
  { value: "semanal", label: "Semanal" },
  { value: "dias_semana", label: "Días específicos de la semana" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
  { value: "days_after", label: "Días después de..." },
];

export function labelForPattern(pattern) {
  const p = RECURRENCE_PATTERNS.find((x) => x.value === pattern);
  return p?.label || "Recurrente";
}

function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];
export function labelForRecurrence(rec) {
  if (rec?.pattern === "dias_semana" && Array.isArray(rec.days)) {
    const picked = DAY_LETTERS.filter((_, i) => rec.days[i]);
    return picked.length ? `Cada ${picked.join(" · ")}` : "Días específicos";
  }
  return labelForPattern(rec?.pattern);
}
