// Utilidades puras para cálculo de métricas de reportes.
// Copiadas de App.jsx para que Inforce Central pueda renderizar stats sin
// reusar el monolito. Ambas implementaciones deben mantenerse en sync hasta
// que una extracción mayor las consolide en un solo lugar.

export const defaultObjectives = {
  roasMin: 4,
  roasTarget: 6,
  costPerPurchaseMax: 80000,
  costPerPurchaseTarget: 50000,
  revenueActual: 0,
  revenueTarget: 0,
  cpm: 12000,
  cpcTarget: 600,
  ctrTarget: 2,
  pageLoadMin: 80,
  checkoutRateTarget: 15,
  costPerInitiatedTarget: 10000,
  checkoutConversionTarget: 20,
};

export function calcMetrics(d) {
  if (!d || !d.spend || !d.clicks) return null;
  const roas = d.conversion / d.spend;
  const ctr = (d.clicks / d.impressions) * 100;
  const cpc = d.spend / d.clicks;
  const cpm = (d.spend / d.impressions) * 1000;
  const pageLoadRate = d.pageVisits ? (d.pageVisits / d.clicks) * 100 : null;
  const costPerVisit = d.pageVisits ? d.spend / d.pageVisits : null;
  const checkoutRate = d.pageVisits ? (d.initiatedCheckouts / d.pageVisits) * 100 : null;
  const costPerInitiated = d.initiatedCheckouts ? d.spend / d.initiatedCheckouts : null;
  const checkoutConversion = d.initiatedCheckouts ? (d.purchases / d.initiatedCheckouts) * 100 : null;
  const avgTicket = d.purchases ? d.conversion / d.purchases : null;
  const costPerPurchase = d.purchases ? d.spend / d.purchases : null;
  return {
    roas, ctr, cpc, cpm,
    pageLoadRate, costPerVisit, checkoutRate, costPerInitiated,
    checkoutConversion, avgTicket, costPerPurchase,
  };
}

// Formato amigable para mostrar en UI.
export function fmtCOP(n) {
  if (n == null || !isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export function fmtNum(n, digits = 2) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtInt(n) {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("es-CO");
}

// Formato compacto para cards: $1.2M, $450K, $12.345
export function fmtCOPCompact(n) {
  if (n == null || !isFinite(n) || n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

// Clasifica un valor según objetivo. "higher"|"lower" indica la dirección mejor.
// Devuelve "good" | "warn" | "bad".
export function classifyMetric(value, target, min, direction = "higher") {
  if (value == null || !isFinite(value)) return "neutral";
  if (direction === "higher") {
    if (target != null && value >= target) return "good";
    if (min != null && value >= min) return "warn";
    return "bad";
  }
  // direction === "lower" → menor es mejor
  if (target != null && value <= target) return "good";
  if (min != null && value <= min) return "warn";
  return "bad";
}
