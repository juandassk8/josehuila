// Constantes compartidas del módulo de Despliegue Creativo.

export const STAGES = [
  // Colores neón, saturados, tipo billboard — dan el look "caro".
  { key: "tofu", label: "Top Of The Funnel",    sub: "Atraer público nuevo", color: "#27E38F" },
  { key: "mofu", label: "Middle Of The Funnel", sub: "Considerar y confiar", color: "#FFD23F" },
  { key: "bofu", label: "Bottom Of The Funnel", sub: "Convertir y cerrar",   color: "#FF3A3A" },
];

export const FORMATS = [
  { key: "static", label: "Estáticos" },
  { key: "video", label: "Video" },
];

export const STATES = [
  { key: "pending",  label: "Por producir", color: "transparent", border: "dashed" },
  { key: "produced", label: "Producido",    color: "#3B8BD4", border: "solid" },
  { key: "testing",  label: "En testing",   color: "#D4A93B", border: "solid" },
  { key: "winner",   label: "Winner",       color: "#1D9E75", border: "solid" },
  { key: "paused",   label: "Pausado",      color: "#9A9A92", border: "solid" },
];

export const STATE_COLOR = Object.fromEntries(STATES.map((s) => [s.key, s.color]));
export const STATE_LABEL = Object.fromEntries(STATES.map((s) => [s.key, s.label]));

// Lunes 00:00 → Domingo 23:59.
export function weekRangeISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // distancia a lunes
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { from: monday, to: sunday };
}

// "13–19 abr 2026" o "28 mar – 3 abr 2026"
const SHORT_MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
export function weekLabelES(monday) {
  const { from, to } = weekRangeISO(monday);
  const sameMonth = from.getMonth() === to.getMonth();
  const sameYear = from.getFullYear() === to.getFullYear();
  const f = `${from.getDate()} ${SHORT_MONTHS[from.getMonth()]}`;
  const t = `${to.getDate()} ${SHORT_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  if (sameMonth && sameYear) {
    return `${from.getDate()}–${to.getDate()} ${SHORT_MONTHS[from.getMonth()]} ${to.getFullYear()}`;
  }
  return `${f} – ${t}`;
}
