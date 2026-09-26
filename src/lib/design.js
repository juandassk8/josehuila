// Shared design system — import from App.jsx (legacy monolith) and src/team/*.
// Theme-aware: DS values update when applyTheme() is called from ThemeProvider.

export const DS = {
  bg: "#000000",
  bgSide: "#06080B",
  bgCard: "rgba(20,24,30,0.52)",
  border: "1px solid rgba(180,200,225,0.11)",
  borderHover: "1px solid rgba(150,215,240,0.26)",
  borderDash: "1.5px dashed rgba(180,200,225,0.11)",
  red: "#E24B4A",
  green: "#34C08A",
  amber: "#F0A93B",
  blue: "#58A6FF",
  purple: "#9B7BF0",
  pink: "#EC6FA8",
  yellow: "#E9C435",
  sel: "#6FB8FF",
  neon: "#5FDEF0",
  textPrimary: "#EFF4FC",
  textSecondary: "#A2B5D4",
  textMuted: "#6F84A6",
  textHint: "#4E628A",
  radius: 16,
  radiusSm: 12,
  font: "'Plus Jakarta Sans', system-ui, sans-serif",
};

// Mutable style presets — also updated by applyTheme()
export const darkCard = {
  background: "rgba(20,24,30,0.52)",
  border: "1px solid rgba(180,200,225,0.11)",
  borderRadius: DS.radius,
  padding: "20px",
  backdropFilter: "blur(24px) saturate(1.25)",
  WebkitBackdropFilter: "blur(24px) saturate(1.25)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(180,200,225,0.035), 0 16px 40px rgba(0,0,0,0.78)",
};

export const darkInput = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: DS.radiusSm,
  border: "1px solid rgba(180,200,225,0.14)",
  fontSize: 14,
  boxSizing: "border-box",
  background: "rgba(20,24,30,0.5)",
  color: "#EFF4FC",
  outline: "none",
  fontFamily: DS.font,
};

export const darkBtn = {
  padding: "10px 22px",
  borderRadius: 50,
  border: "none",
  background: "#EFF4FC",
  color: "#06080B",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: DS.font,
  letterSpacing: "0.02em",
};

export const darkBtnGhost = {
  padding: "10px 22px",
  borderRadius: 50,
  background: "transparent",
  border: "1px solid rgba(180,200,225,0.26)",
  color: "rgba(226,236,252,0.75)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: DS.font,
  letterSpacing: "0.02em",
};

export const darkBtnRed = {
  padding: "10px 22px",
  borderRadius: 50,
  border: "none",
  background: DS.red,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: DS.font,
  letterSpacing: "0.02em",
};

// Theme application — mutates DS and preset objects in place
// Dark mode: original Inforce dark theme
const DARK_VALUES = {
  bg: "#000000", bgSide: "#06080B", bgCard: "rgba(20,24,30,0.52)",
  border: "1px solid rgba(180,200,225,0.11)", borderHover: "1px solid rgba(150,215,240,0.26)",
  borderDash: "1.5px dashed rgba(180,200,225,0.11)",
  red: "#E24B4A", green: "#34C08A", amber: "#F0A93B", blue: "#58A6FF", purple: "#9B7BF0",
  pink: "#EC6FA8", yellow: "#E9C435", sel: "#6FB8FF", neon: "#5FDEF0",
  textPrimary: "#EFF4FC", textSecondary: "#A2B5D4",
  textMuted: "#6F84A6", textHint: "#4E628A",
};

// Light mode: premium claro (CLAUDE.md §1 — :root.light)
const LIGHT_VALUES = {
  bg: "#EBF2FC", bgSide: "#FFFFFF", bgCard: "rgba(255,255,255,0.60)",
  border: "1px solid rgba(38,100,204,0.16)", borderHover: "1px solid rgba(38,100,204,0.30)",
  borderDash: "1.5px dashed rgba(38,100,204,0.16)",
  red: "#D93F3E", green: "#17976A", amber: "#C4801C", blue: "#2664CC", purple: "#6E54D0",
  pink: "#D4497F", yellow: "#B58C15", sel: "#1F62C8", neon: "#1E8FB8",
  textPrimary: "#0B1626", textSecondary: "#465879",
  textMuted: "#7183A1", textHint: "#93A3BD",
};

export function applyTheme(isDark) {
  const vals = isDark ? DARK_VALUES : LIGHT_VALUES;
  Object.assign(DS, vals);

  // Update darkCard — superficie glass premium
  darkCard.background = DS.bgCard;
  darkCard.border = DS.border;
  darkCard.backdropFilter = isDark ? "blur(24px) saturate(1.25)" : "blur(20px) saturate(1.22)";
  darkCard.WebkitBackdropFilter = darkCard.backdropFilter;
  darkCard.boxShadow = isDark
    ? "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(180,200,225,0.035), 0 16px 40px rgba(0,0,0,0.78)"
    : "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.55), 0 8px 28px rgba(16,44,100,0.10)";

  // Update darkInput
  darkInput.border = `1px solid ${isDark ? "rgba(180,200,225,0.14)" : "rgba(38,100,204,0.20)"}`;
  darkInput.background = isDark ? "rgba(20,24,30,0.5)" : "#FFFFFF";
  darkInput.color = DS.textPrimary;

  // Update darkBtn — confirmar: ink sobre bg (CLAUDE.md §6)
  darkBtn.background = isDark ? "#EFF4FC" : "#0B1626";
  darkBtn.color = isDark ? "#06080B" : "#FFFFFF";

  // Update darkBtnGhost
  darkBtnGhost.border = `1px solid ${isDark ? "rgba(180,200,225,0.26)" : "rgba(38,100,204,0.24)"}`;
  darkBtnGhost.color = isDark ? "rgba(226,236,252,0.75)" : "rgba(11,22,38,0.66)";

  // Update darkBtnRed
  darkBtnRed.background = DS.red;

  // Sync CSS class for index.css custom properties
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("light", !isDark);
  }
}

// Combina un color base con un alpha hex (ej. "22", "55", "14"). Maneja
// tanto hex (#RGB / #RRGGBB) como rgba(). Garantiza CSS válido — evita
// el bug de concatenar `rgba(...)22` que produce sintaxis inválida.
//
// Ejemplos:
//   withAlpha("#1DB97A", "22")            → "#1DB97A22"
//   withAlpha("rgba(255,255,255,0.3)", "22") → "rgba(255, 255, 255, 0.133)"
export function withAlpha(color, hexAlpha) {
  if (!color || typeof color !== "string") return color;
  if (color.startsWith("#")) {
    if (color.length === 9) return color.slice(0, 7) + hexAlpha;
    if (color.length === 4) {
      const r = color[1], g = color[2], b = color[3];
      return `#${r}${r}${g}${g}${b}${b}${hexAlpha}`;
    }
    return color + hexAlpha;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    const a = (parseInt(hexAlpha, 16) / 255).toFixed(3);
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }
  return color;
}

// Fixed priority colors (not theme-dependent, so they stay consistent across modes)
export const PRIORITY_COLORS = {
  urgente: "#E24B4A",
  alta: "#F0A93B",
  normal: "#58A6FF",
  baja: "#6F84A6",
};

export const PRIORITY_LABEL = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baja: "Baja",
};

export const STATUS_LABEL = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completado: "Completado",
};

export const ROLE_LABEL = {
  admin: "Admin",
  member: "Miembro",
  editor: "Editor",
};

export const DEFAULT_MEMBER_COLORS = [
  "#58A6FF",
  "#34C08A",
  "#F0A93B",
  "#9B7BF0",
  "#E24B4A",
  "#EC6FA8",
  "#5FDEF0",
  "#F0813B",
];
