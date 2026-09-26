import { DS } from "../design.js";

// Estrategia balanceada: (1) exacto → (2) substring → (3) keywords 2+.
// Retorna el objeto del CSV o null.
export function findBestMatch(userName, csvAds) {
  if (!userName || !csvAds || csvAds.length === 0) return null;
  const STOP_WORDS = new Set(["el","la","los","las","de","del","y","con","en","por","para","mi","un","una","que","es","al","lo","le","se","su","sus","a","e","o"]);
  const normalize = (s) => String(s).toLowerCase()
    .replace(/n[uú]mero\s*/g, "#").replace(/numeral\s*/g, "#").replace(/num\s*/g, "#")
    .replace(/[^\w\sáéíóúñü#]/g, " ").replace(/\s+/g, " ").trim();
  const keywords = (s) => normalize(s).split(" ").filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  const extractNums = (s) => normalize(s).match(/\d{2,}/g) || [];

  const userLower = normalize(userName);
  const userKws = keywords(userName);
  const userNums = extractNums(userName);

  // (1) Exact match
  for (const csv of csvAds) {
    if (normalize(csv.name) === userLower) return csv;
  }

  // (2) Substring match (name del CSV contiene el del usuario o viceversa, mínimo 4 chars)
  if (userLower.length >= 4) {
    for (const csv of csvAds) {
      const csvLower = normalize(csv.name);
      if (csvLower.includes(userLower) || userLower.includes(csvLower)) return csv;
    }
  }

  // (3) Keyword + number overlap scoring
  if (userKws.length > 0 || userNums.length > 0) {
    const needed = Math.min(2, userKws.length);
    let best = null, bestScore = 0;
    for (const csv of csvAds) {
      const csvKws = keywords(csv.name);
      const csvNums = extractNums(csv.name);
      let score = 0;

      // Keyword hits
      const kwHits = userKws.filter(w => csvKws.includes(w)).length;
      score += kwHits;

      // Number matching bonus — numbers are very specific identifiers
      const numHits = userNums.filter(n => csvNums.includes(n)).length;
      score += numHits * 3;

      // Allow single long keyword match (>6 chars) — compound names like "8natflexdct15"
      const longKwMatch = userKws.some(w => w.length > 6 && csvKws.some(ck => ck.includes(w) || w.includes(ck)));
      if (longKwMatch) score += 2;

      const minNeeded = numHits > 0 ? 1 : needed;
      if ((kwHits >= minNeeded || numHits > 0 || longKwMatch) && score > bestScore) {
        best = csv; bestScore = score;
      }
    }
    if (best) return best;
  }

  return null;
}

// Enhanced matching: also tries to match by metrics mentioned in user text
export function findBestMatchWithMetrics(userName, csvAds, userMetrics) {
  // First try name-based matching
  const nameMatch = findBestMatch(userName, csvAds);
  if (nameMatch) return nameMatch;

  // If no name match but we have metrics, try metric-based matching
  if (!userMetrics || !csvAds || csvAds.length === 0) return null;

  const { spend, conversionValue, purchases } = userMetrics;
  if (!spend && !conversionValue && !purchases) return null;

  let best = null, bestScore = 0;
  for (const csv of csvAds) {
    let score = 0;
    // Check spend proximity (within 20%)
    if (spend && csv.spend) {
      const ratio = Math.min(spend, csv.spend) / Math.max(spend, csv.spend);
      if (ratio > 0.8) score += 3;
      else if (ratio > 0.5) score += 1;
    }
    // Check conversion value proximity
    if (conversionValue && csv.conversionValue) {
      const ratio = Math.min(conversionValue, csv.conversionValue) / Math.max(conversionValue, csv.conversionValue);
      if (ratio > 0.8) score += 3;
      else if (ratio > 0.5) score += 1;
    }
    // Check purchases exact or close
    if (purchases && csv.purchases) {
      if (purchases === csv.purchases) score += 4;
      else if (Math.abs(purchases - csv.purchases) <= 1) score += 2;
    }
    // Partial name overlap (even 1 keyword)
    if (userName) {
      const STOP_WORDS = new Set(["el","la","los","las","de","del","y","con","en","por","para","mi","un","una","que","es","al","lo","le","se","su","sus","a","e","o"]);
      const normalizeName = (s) => String(s).toLowerCase()
        .replace(/n[uú]mero\s*/g, "#").replace(/numeral\s*/g, "#").replace(/num\s*/g, "#")
        .replace(/[^\w\sáéíóúñü#]/g, " ").replace(/\s+/g, " ").trim();
      const keywords = (s) => normalizeName(s).split(" ").filter(w => w.length >= 2 && !STOP_WORDS.has(w));
      const extractNums = (s) => normalizeName(s).match(/\d{2,}/g) || [];
      const userKws = keywords(userName);
      const csvKws = keywords(csv.name);
      const hits = userKws.filter(w => csvKws.includes(w)).length;
      score += hits * 2;
      // Number matching bonus
      const userNums = extractNums(userName);
      const csvNums = extractNums(csv.name);
      const numHits = userNums.filter(n => csvNums.includes(n)).length;
      score += numHits * 4;
    }
    if (score > bestScore) { best = csv; bestScore = score; }
  }

  return bestScore >= 3 ? best : null;
}

// Clasifica la severidad de un anuncio según sus métricas y los objetivos del cliente.
// Retorna: "bueno" | "regular" | "malo" | "critico" | "sin_datos"
export function classifyAdSeverity(metricas, objectives = {}) {
  const { compras = 0, costo_por_compra = 0, gasto = 0 } = metricas || {};
  const targetCPP = objectives.costPerPurchaseTarget || 50000;
  const maxCPP = objectives.costPerPurchaseMax || 80000;

  // Crítico: gastó significativo sin compras
  if (compras === 0 && gasto > targetCPP) return "critico";

  // Si no hay datos o gasto mínimo
  if (compras === 0 && gasto <= targetCPP) return "sin_datos";

  // Calcular CPP si no viene dado
  const cpp = costo_por_compra > 0 ? costo_por_compra : (compras > 0 ? gasto / compras : 0);

  // Compara costo por compra vs objetivo
  if (cpp <= targetCPP * 1.10) return "bueno";  // dentro del 10% sobre objetivo
  if (cpp <= targetCPP * 1.30) return "regular"; // 10-30% sobre
  if (cpp <= maxCPP) return "regular";
  return "malo"; // más del 30% sobre o sobre el máximo
}

// Estilos por severidad de anuncio (reusable en Step2Ads y ReportView)
export function getAdSeverityStyle(severity) {
  const styles = {
    bueno:     { label: "Rendimiento bueno",     color: "#1DB97A", icon: "✓",  bg: "rgba(29,185,122,0.08)",  border: "rgba(29,185,122,0.4)" },
    regular:   { label: "Rendimiento regular",   color: "#F5A623", icon: "•",  bg: "rgba(245,166,35,0.06)",  border: "rgba(245,166,35,0.35)" },
    malo:      { label: "Rendimiento malo",      color: "#E24B4A", icon: "⚠",  bg: "rgba(226,75,74,0.08)",   border: "rgba(226,75,74,0.35)" },
    critico:   { label: "CRÍTICO — Pausar",       color: "#E24B4A", icon: "🚨", bg: "rgba(226,75,74,0.14)",   border: "rgba(226,75,74,0.55)" },
    sin_datos: { label: "Sin métricas",           color: DS.textMuted, icon: "—", bg: DS.bgCard, border: "rgba(120,119,116,0.3)" },
  };
  return styles[severity] || styles.sin_datos;
}
