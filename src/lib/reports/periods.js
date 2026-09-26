// Utilidades de parsing de fechas de reportes. Copiadas de App.jsx.

const MONTHS_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

export function parsePeriodDates(period) {
  if (!period) return null;
  const p = period.trim();

  let m = p.match(/^(\d+)\s*[–\-]\s*(\d+)\s+de\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS_ES[m[3].toLowerCase()];
    if (mo !== undefined) return { from: new Date(+m[4], mo, +m[1]), to: new Date(+m[4], mo, +m[2]) };
  }

  m = p.match(/^(\d+)\s+de\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS_ES[m[2].toLowerCase()];
    if (mo !== undefined) {
      const d = new Date(+m[3], mo, +m[1]);
      return { from: d, to: d };
    }
  }

  m = p.match(/^(\d+)\s+(\w+)\s*[–\-]\s*(\d+)\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo1 = MONTHS_ES[m[2].toLowerCase()];
    const mo2 = MONTHS_ES[m[4].toLowerCase()];
    if (mo1 !== undefined && mo2 !== undefined) {
      return { from: new Date(+m[5], mo1, +m[1]), to: new Date(+m[5], mo2, +m[3]) };
    }
  }

  m = p.match(/(\d{4}-\d{2}-\d{2})\s*[–\-]\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return { from: new Date(m[1] + "T12:00:00"), to: new Date(m[2] + "T12:00:00") };

  return null;
}

export function getReportDates(report) {
  if (!report) return null;
  if (report.dateFrom && report.dateTo) {
    return {
      from: new Date(report.dateFrom + "T12:00:00"),
      to: new Date(report.dateTo + "T12:00:00"),
    };
  }
  return parsePeriodDates(report.period);
}

// Ordena reportes por fecha (más reciente primero).
export function sortReportsByDate(reports) {
  return [...reports].sort((a, b) => {
    const da = getReportDates(a)?.from?.getTime() || 0;
    const db = getReportDates(b)?.from?.getTime() || 0;
    if (db !== da) return db - da;
    // Fallback: por createdAt.
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

export function reportPeriodLabel(report) {
  return report?.period || "Sin período";
}

// Etiqueta corta tipo "15 abr 2026"
const SHORT_MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
export function shortDate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getDate()} ${SHORT_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
