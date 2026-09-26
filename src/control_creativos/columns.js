// Configuración de las 12 columnas del v1.
//
// type:
//   - "text"     → texto plano editable
//   - "dropdown" → chip con color; opciones en creative_column_options
//   - "date"     → date picker (yyyy-mm-dd)
//   - "link"     → URL; muestra "Abrir" si está llena
//
// `seed`: defaults que se siembran la primera vez que un dropdown se abre
// en una empresa. El user puede agregar/editar/eliminar.

export const COLUMNS = [
  {
    key: "creative_number",
    label: "Creativo",
    type: "text",
    width: 100,
    placeholder: "#001",
    align: "left",
  },
  {
    key: "format",
    label: "Formato",
    type: "dropdown",
    width: 110,
    seed: [
      { value: "Video",    color: "#CFE2F3" },
      { value: "Estático", color: "#FCE5CD" },
    ],
  },
  {
    key: "hook",
    label: "Hook",
    type: "dropdown",
    width: 80,
    seed: [
      { value: "#1", color: "#E8EAED" },
      { value: "#2", color: "#E8EAED" },
      { value: "#3", color: "#E8EAED" },
      { value: "#4", color: "#E8EAED" },
      { value: "#5", color: "#E8EAED" },
    ],
  },
  {
    key: "product",
    label: "Producto",
    type: "dropdown",
    width: 160,
    seed: [], // poblado por el user
  },
  {
    key: "tipo",
    label: "Tipo",
    type: "dropdown",
    width: 110,
    seed: [
      { value: "UGC",   color: "#D9EAD3" },
      { value: "IA",    color: "#D0E0E3" },
      { value: "Pixar", color: "#FFE599" },
    ],
  },
  {
    key: "editor",
    label: "Editor",
    type: "dropdown",
    width: 160,
    seed: [],
    // Las opciones vienen de company_team_members con rol "editor" — no se
    // pueden editar desde el dropdown manager (se gestionan en Equipo).
    teamSourced: true,
  },
  {
    key: "due_date",
    label: "Fecha de entrega",
    type: "date",
    width: 150,
  },
  {
    key: "script_url",
    label: "Carpeta Guion",
    type: "link",
    width: 140,
  },
  {
    key: "draft_url",
    label: "Carpeta Borrador",
    type: "link",
    width: 150,
  },
  {
    key: "creatives_url",
    label: "Carpeta Creativos",
    type: "link",
    width: 160,
  },
  {
    key: "ad_status",
    label: "Estado Anuncio",
    type: "dropdown",
    width: 150,
    seed: [
      { value: "Por publicar", color: "#FFF2CC" },
      { value: "Publicado",    color: "#D9EAD3" },
      { value: "Pausado",      color: "#F4CCCC" },
      { value: "Sin lanzar",   color: "#E8EAED" },
    ],
  },
  {
    key: "calidad",
    label: "Calidad",
    type: "dropdown",
    width: 100,
    seed: [
      { value: "A+", color: "#B6D7A8" },
      { value: "A",  color: "#D9EAD3" },
      { value: "B",  color: "#FFF2CC" },
      { value: "C",  color: "#F4CCCC" },
    ],
  },
];

export const COLUMNS_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

// Paleta tipo Sheets/Notion para el color picker.
export const COLOR_PALETTE = [
  "#E8EAED", "#F4CCCC", "#FCE5CD", "#FFF2CC",
  "#D9EAD3", "#D0E0E3", "#CFE2F3", "#D9D2E9",
  "#EAD1DC", "#B6D7A8", "#A4C2F4", "#B4A7D6",
];

// Letras de columna estilo Sheets (A, B, C, ...).
export const COLUMN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Auto-sugerencia del siguiente número de creativo. Si todas las filas tienen
// formato "#NNN", devuelve el siguiente. Si no, queda vacío.
export function suggestNextCreativeNumber(items) {
  const nums = items
    .map((i) => i.creative_number || "")
    .map((s) => {
      const m = s.match(/^#?(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n != null);
  if (nums.length === 0) return "";
  const next = Math.max(...nums) + 1;
  return "#" + String(next).padStart(3, "0");
}

// Genera el label de un delivery: "Entrega #2 - Creativo 006-010" si hay items
// numerados, o solo "Entrega #N" si está vacío. El user puede override en `name`.
export function deliveryLabel(delivery, items = []) {
  if (delivery.name && delivery.name.trim()) return delivery.name.trim();
  const base = `Entrega #${delivery.delivery_number}`;
  const nums = items
    .map((i) => i.creative_number || "")
    .map((s) => {
      const m = s.match(/^#?(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n != null);
  if (nums.length === 0) return base;
  const min = String(Math.min(...nums)).padStart(3, "0");
  const max = String(Math.max(...nums)).padStart(3, "0");
  return `${base} - Creativo ${min}-${max}`;
}
