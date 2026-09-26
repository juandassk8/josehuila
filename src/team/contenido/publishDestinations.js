// Destinos de publicación de un Content Item.
//
// Cada video se publica en 2 cuentas según su `tipo`:
//   - tipo "Likeness"  → IG Conexión + TikTok Conexión
//   - tipo "Autoridad" → IG Autoridad + TikTok Autoridad
//
// El campo `publish_destinations` en DB es un JSONB libre del shape:
//   { ig_authority: { done: bool, posted_at: ts }, ig_connection: {...}, ... }

export const DESTINATION_META = {
  ig_authority: {
    label: "IG Autoridad",
    handle: "@josehuilaa",
    icon: "📷",
    color: "#E4405F",
  },
  ig_connection: {
    label: "IG Conexión",
    handle: "@joseehuila",
    icon: "📷",
    color: "#E4405F",
  },
  tiktok_authority: {
    label: "TikTok Autoridad",
    handle: "@josehuilaa",
    icon: "🎵",
    color: "#000000",
  },
  tiktok_connection: {
    label: "TikTok Conexión",
    handle: "@joseehuila",
    icon: "🎵",
    color: "#000000",
  },
};

// Aceptamos variantes comunes y typos vistos en producción.
// "likness" (sin la primera 'e') es un typo que ya quedó en datos del user.
const LIKENESS_KEYWORDS = ["likeness", "likness", "conexion", "conexión", "connection"];
const AUTHORITY_KEYWORDS = ["autoridad", "authority"];

// Devuelve el array de destination keys requeridos según el tipo del item.
// `null` si el tipo no es ni Likeness ni Autoridad — en ese caso el widget
// de destinos no se renderiza (no sabemos dónde publicar).
export function requiredDestinations(tipo) {
  if (!tipo) return null;
  const t = String(tipo).toLowerCase().trim();
  if (LIKENESS_KEYWORDS.some((k) => t.includes(k))) {
    return ["ig_connection", "tiktok_connection"];
  }
  if (AUTHORITY_KEYWORDS.some((k) => t.includes(k))) {
    return ["ig_authority", "tiktok_authority"];
  }
  return null;
}

// Estado de las casillas de un item: array de { key, meta, done, posted_at }.
// Las casillas son las requeridas según el tipo. Si no hay tipo válido,
// devuelve null.
export function destinationStatus(item) {
  const required = requiredDestinations(item?.tipo);
  if (!required) return null;
  const map = item?.publish_destinations || {};
  return required.map((key) => {
    const entry = map[key] || {};
    return {
      key,
      meta: DESTINATION_META[key],
      done: !!entry.done,
      posted_at: entry.posted_at || null,
    };
  });
}

// True si TODAS las casillas requeridas están done.
export function allDestinationsDone(item) {
  const status = destinationStatus(item);
  if (!status || status.length === 0) return false;
  return status.every((d) => d.done);
}
