export const fmt = (n) => isNaN(n) ? "0" : Math.round(n).toLocaleString("es-CO");
export const fmtM = (n) => {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${fmt(n)}`;
};
export const pct = (n) => isNaN(n) ? "0%" : `${Number(n).toFixed(2)}%`;
export const num = (v) => parseFloat(String(v || "0").replace(/\./g, "").replace(",", ".")) || 0;
