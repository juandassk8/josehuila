// ── CSV IMPORT (Meta Ads) ────────────────────────────────────────────────────
// Parser de CSV puro (sin dependencias). Auto-detecta delimiter, maneja quotes,
// y entiende formatos numéricos tanto en español (1.234,56) como en inglés (1,234.56).
export function parseCsvText(text) {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Auto-detect delimiter based on first non-empty line
  const firstLine = (text.split(/\r?\n/).find(l => l.trim()) || "");
  const countOutside = (line, ch) => {
    let n = 0, q = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') q = !q;
      else if (line[i] === ch && !q) n++;
    }
    return n;
  };
  const counts = { ",": countOutside(firstLine, ","), ";": countOutside(firstLine, ";"), "\t": countOutside(firstLine, "\t") };
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const parseLine = (line) => {
    const result = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === delim && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result.map(s => s.trim());
  };

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], delim };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const values = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] !== undefined ? values[i] : ""; });
    return obj;
  });
  return { headers, rows, delim };
}

// Parser numérico robusto que maneja ambos formatos ES y EN, con símbolos de moneda.
export function parseCsvNumber(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "n/a") return null;
  // Remove currency symbols, spaces, percent sign
  s = s.replace(/[\s%$€£¥₹₽COPUSDMXNARS]/gi, "");
  s = s.replace(/[^\d.,\-]/g, "");
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastPeriod = s.lastIndexOf(".");
  if (lastComma >= 0 && lastPeriod >= 0) {
    // Both present — the later one is the decimal separator
    if (lastComma > lastPeriod) {
      // Spanish: "1.234,56"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // English: "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) {
      // Likely decimal
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Patterns de columnas de Meta Ads — español e inglés
export const META_CSV_COLUMNS = {
  reportStart: { label: "Inicio informe", numeric: false, patterns: [
    /inicio\s+del?\s+informe/i, /^report\s+start/i, /fecha\s+de\s+inicio/i,
  ]},
  reportEnd: { label: "Fin informe", numeric: false, patterns: [
    /fin\s+del?\s+informe/i, /^report\s+end/i, /fecha\s+de\s+fin/i,
  ]},
  campaignName: { label: "Campaña", numeric: false, patterns: [
    /nombre\s+de\s+la\s+campa/i, /nombre\s+de\s+campa/i, /^campa[ñn]a$/i,
    /campaign\s*name/i, /^campaign$/i,
  ]},
  adsetName: { label: "Conjunto de anuncios", numeric: false, patterns: [
    /nombre\s+del\s+conjunto\s+de\s+anuncios/i, /nombre\s+del\s+conjunto/i,
    /ad\s*set\s+name/i, /^ad\s*set$/i, /^conjunto\s+de\s+anuncios$/i,
  ]},
  adName: { label: "Anuncio", numeric: false, patterns: [
    /nombre\s+del\s+anuncio/i, /^nombre\s+del\s+anuncio/i,
    /^ad\s+name/i, /^anuncio$/i,
  ]},
  delivery: { label: "Estado", numeric: false, patterns: [
    /entrega\s+de\s+la\s+campa/i, /entrega\s+del\s+conjunto\s+de\s+anuncios/i,
    /entrega\s+del\s+anuncio/i, /^entrega$/i, /^estado$/i, /estado\s+de\s+la\s+campa/i,
    /^delivery$/i, /^status$/i, /campaign\s+delivery/i, /ad\s*set\s+delivery/i, /ad\s+delivery/i,
  ]},
  spend: { label: "Gasto", numeric: true, patterns: [
    /importe\s+gastado/i, /monto\s+gastado/i, /^gasto$/i, /dinero\s+gastado/i,
    /amount\s+spent/i, /^spend$/i, /^cost$/i,
  ]},
  impressions: { label: "Impresiones", numeric: true, patterns: [
    /^impresiones$/i, /^impressions$/i,
  ]},
  reach: { label: "Alcance", numeric: true, patterns: [
    /^alcance$/i, /^reach$/i,
  ]},
  frequency: { label: "Frecuencia", numeric: true, patterns: [
    /^frecuencia$/i, /^frequency$/i,
  ]},
  results: { label: "Resultados", numeric: true, patterns: [
    /^resultados$/i, /^results$/i,
  ]},
  resultIndicator: { label: "Tipo resultado", numeric: false, patterns: [
    /indicador\s+de\s+resultado/i, /^result\s+indicator/i, /result\s+type/i,
  ]},
  costPerResult: { label: "Costo/resultado", numeric: true, patterns: [
    /costo\s+por\s+resultados?/i, /cost\s+per\s+result/i,
  ]},
  budget: { label: "Presupuesto", numeric: true, patterns: [
    /presupuesto\s+del?\s+conjunto\s+de\s+anuncios/i, /presupuesto\s+del?\s+conjunto/i,
    /^presupuesto$/i, /ad\s*set\s+budget/i, /^budget$/i,
  ]},
  budgetType: { label: "Tipo presupuesto", numeric: false, patterns: [
    /tipo\s+de\s+presupuesto/i, /budget\s+type/i,
  ]},
  linkClicks: { label: "Clics enlace", numeric: true, patterns: [
    /clics?\s+en\s+el\s+enlace/i, /clics?\s+enlace/i, /link\s+clicks?/i,
  ]},
  allClicks: { label: "Clics (todos)", numeric: true, patterns: [
    /clics?\s*\(todos\)/i, /clicks?\s*\(all\)/i, /^clics$/i, /^clicks$/i,
  ]},
  ctr: { label: "CTR", numeric: true, patterns: [
    /ctr.*enlace/i, /ctr.*link/i, /link.*click.*through/i, /^ctr/i, /porcentaje\s+de\s+clics/i,
  ]},
  cpc: { label: "CPC", numeric: true, patterns: [
    /cpc.*enlace/i, /cost\s+per\s+link\s+click/i, /^cpc/i, /costo\s+por\s+clic/i,
  ]},
  // Hook y hold NO vienen de fábrica en Meta: son métricas personalizadas que se
  // crean una vez (Reproducciones 3s ÷ Impresiones, y hasta el final ÷
  // Impresiones). Los patrones están puestos de antemano para que, el día que se
  // creen y se exporten, entren solas sin tocar código.
  hookRate: { label: "Hook rate", numeric: true, patterns: [
    /hook\s*rate/i, /tasa\s+de\s+enganche/i, /retenci[oó]n\s+3\s*s/i,
  ]},
  holdRate: { label: "Hold rate", numeric: true, patterns: [
    /hold\s*rate/i, /tasa\s+de\s+retenci[oó]n/i, /retenci[oó]n\s+(hasta\s+el\s+)?final/i,
  ]},
  cpm: { label: "CPM", numeric: true, patterns: [
    /^cpm/i, /costo\s+por\s+mil/i, /cost\s+per\s+1\s*,?\s*000\s+impressions/i,
  ]},
  pageVisits: { label: "Vistas página", numeric: true, patterns: [
    /visualizaciones\s+de\s+(la\s+)?p[aá]gina\s+de\s+destino/i, /vistas?\s+de\s+p[aá]gina/i,
    /visitas?\s+a\s+(la\s+)?p[aá]gina/i, /landing\s+page\s+views?/i,
  ]},
  costPerPageVisit: { label: "Costo/visita", numeric: true, patterns: [
    /costo\s+por\s+visita/i, /cost\s+per\s+landing\s+page/i, /cost\s+per\s+page\s+view/i,
  ]},
  checkoutReachRate: { label: "Ida a checkout", numeric: true, patterns: [
    /ida\s+a\s+checkout/i, /rate.*checkout/i,
  ]},
  initiatedCheckouts: { label: "Pagos iniciados", numeric: true, patterns: [
    /pagos\s+iniciados/i, /inicios\s+de\s+pago/i, /checkouts?\s+initiated/i, /initiate.*checkout/i,
  ]},
  costPerInitiatedCheckout: { label: "Costo/pago iniciado", numeric: true, patterns: [
    /costo\s+por\s+pago\s+iniciado/i, /cost\s+per\s+checkout\s+initiated/i,
  ]},
  checkoutConversionRate: { label: "Conversion checkout", numeric: true, patterns: [
    /conversion\s+checkout/i, /conversi[oó]n\s+checkout/i, /checkout\s+conversion/i,
  ]},
  purchases: { label: "Compras", numeric: true, patterns: [
    /compras\s+en\s+el\s+sitio\s+web/i, /compras\s+del?\s+sitio/i, /meta\s+pixel.*purchases/i,
    /website\s+purchases/i, /^compras$/i, /^purchases$/i,
  ]},
  costPerPurchase: { label: "Costo/compra", numeric: true, patterns: [
    /costo\s+por\s+compra/i, /cost\s+per\s+purchase/i,
  ]},
  conversionValue: { label: "Valor conversión", numeric: true, patterns: [
    /valor\s+de\s+conversi[oó]n\s+de\s+compras/i, /valor\s+de\s+conversi[oó]n.*compras?/i,
    /valor\s+de\s+las?\s+compras/i, /valor\s+de\s+conversi[oó]n\s+de\s+las?\s+compras/i,
    /website\s+purchases?\s+conversion\s+value/i, /purchases?\s+conversion\s+value/i,
    /purchase\s+value/i, /conversion\s+value/i,
  ]},
  roas: { label: "ROAS resultados", numeric: true, patterns: [
    /roas\s+de\s+resultados?/i, /roas\s+del?\s+resultado/i,
  ]},
  roasIndicator: { label: "Tipo ROAS", numeric: false, patterns: [
    /indicador\s+de\s+roas/i, /roas\s+indicator/i, /roas\s+type/i,
  ]},
  purchaseRoas: { label: "ROAS compras", numeric: true, patterns: [
    /roas\s*\(retorno\s+de\s+la\s+inversi.n/i, /retorno\s+de\s+la\s+inversi.n.*publicidad/i,
    /roas.*compras?/i, /purchase\s+roas/i, /return\s+on\s+ad\s+spend/i, /^roas$/i,
  ]},
};

// Clasifica el objetivo de una campaña según el Indicador de resultado
export function classifyObjective(indicator) {
  if (!indicator) return "other";
  const s = String(indicator).toLowerCase();
  if (s.includes("fb_pixel_purchase") || s.includes("offsite_conversion.purchase") || /\bpurchase\b/.test(s)) return "purchase";
  if (s.includes("messaging") || s.includes("conversation")) return "messaging";
  if (s.includes("video") || s.includes("thruplay")) return "video";
  if (s.includes("post_engagement") || s.includes("engagement")) return "engagement";
  if (s.includes("lead")) return "lead";
  if (s.includes("landing_page_view") || s.includes("link_click")) return "traffic";
  return "other";
}

export function matchCsvColumns(headers) {
  const mapping = {};
  const used = new Set();
  for (const [key, def] of Object.entries(META_CSV_COLUMNS)) {
    for (const header of headers) {
      if (used.has(header)) continue;
      if (def.patterns.some(p => p.test(header))) {
        mapping[key] = header;
        used.add(header);
        break;
      }
    }
  }
  const unmapped = headers.filter(h => !used.has(h));
  return { mapping, unmapped };
}

export function parseMetaCsv(text) {
  const { headers, rows, delim } = parseCsvText(text);
  if (headers.length === 0) {
    return { level: null, entries: [], totals: {}, mapping: {}, unmapped: [], headers: [], delim, error: "Archivo vacío" };
  }
  const { mapping, unmapped } = matchCsvColumns(headers);

  // DETECTAR NIVEL del CSV según qué columna de nombre tiene
  // Orden importa: "ad" primero (más específico), luego "adset", luego "campaign"
  let level, nameKey;
  if (mapping.adName) {
    level = "ad"; nameKey = "adName";
  } else if (mapping.adsetName) {
    level = "adset"; nameKey = "adsetName";
  } else if (mapping.campaignName) {
    level = "campaign"; nameKey = "campaignName";
  } else {
    return { level: null, entries: [], totals: {}, mapping, unmapped, headers, delim,
      error: "No se detectó el nivel del CSV (campaña, conjunto o anuncio). ¿Es un export de Meta Ads?" };
  }

  // Parse todas las filas primero (sin filtrar)
  const allEntries = rows.map((row, idx) => {
    const c = { _row: idx + 2 };
    for (const [key, col] of Object.entries(mapping)) {
      const val = row[col];
      const def = META_CSV_COLUMNS[key];
      if (def.numeric) c[key] = parseCsvNumber(val);
      else c[key] = val || "";
    }
    // Normalize name field según el nivel
    c.name = c[nameKey];
    c.level = level;
    c.objective = classifyObjective(c.resultIndicator);
    return c;
  }).filter(c => c.name && c.name.toLowerCase() !== "total" && !c.name.toLowerCase().startsWith("total"));

  // Detectar rango de fechas del informe (toma la primera fila con datos válidos)
  const csvDateFrom = allEntries.find(c => c.reportStart)?.reportStart || null;
  const csvDateTo = allEntries.find(c => c.reportEnd)?.reportEnd || null;

  // Conteo por objetivo (antes de filtrar)
  const objectiveCounts = allEntries.reduce((acc, c) => {
    acc[c.objective] = (acc[c.objective] || 0) + 1;
    return acc;
  }, {});

  // FILTRADO según nivel:
  // - Campañas: solo purchase + con gasto (para rellenar métricas principales)
  // - Conjuntos/Anuncios: solo con gasto (mantener todos los objetivos para análisis granular y matching)
  let entries;
  // Incluir TODAS las campañas con gasto (para matching de análisis + totales correctos)
  entries = allEntries.filter(c => (c.spend || 0) > 0);

  const filteredOutCount = allEntries.length - entries.length;

  // Totales se computan sobre TODAS las campañas con gasto (no solo purchase)
  const allWithSpend = allEntries.filter(c => (c.spend || 0) > 0);
  const sum = (key) => allWithSpend.reduce((a, c) => a + (c[key] || 0), 0);
  const totals = level === "campaign" ? {
    spend:              sum("spend"),
    impressions:        sum("impressions"),
    reach:              sum("reach"),
    clicks:             sum("linkClicks") || sum("allClicks"),
    purchases:          sum("purchases"),
    conversion:         sum("conversionValue"),
    pageVisits:         sum("pageVisits"),
    initiatedCheckouts: sum("initiatedCheckouts"),
  } : {};

  return {
    level, entries, totals, mapping, unmapped, headers, delim,
    csvDateFrom, csvDateTo, objectiveCounts, filteredOutCount,
    totalRows: allEntries.length,
    // Backward compat: si es campaña, también expone como `campaigns`
    ...(level === "campaign" ? { campaigns: entries } : {}),
  };
}
