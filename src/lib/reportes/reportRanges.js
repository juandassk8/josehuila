// ── DATE RANGE HELPERS ───────────────────────────────────────────────────────
export const MONTHS_ES = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };

export function parsePeriodDates(period) {
  if (!period) return null;
  const p = period.trim();

  // "D – D de MMM YYYY" — same month range
  let m = p.match(/^(\d+)\s*[–\-]\s*(\d+)\s+de\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS_ES[m[3].toLowerCase()];
    if (mo !== undefined) return { from: new Date(+m[4], mo, +m[1]), to: new Date(+m[4], mo, +m[2]) };
  }

  // "D de MMM YYYY" — single day
  m = p.match(/^(\d+)\s+de\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS_ES[m[2].toLowerCase()];
    if (mo !== undefined) { const d = new Date(+m[3], mo, +m[1]); return { from: d, to: d }; }
  }

  // "D MMM – D MMM YYYY" — different months
  m = p.match(/^(\d+)\s+(\w+)\s*[–\-]\s*(\d+)\s+(\w+)\s+(\d{4})/);
  if (m) {
    const mo1 = MONTHS_ES[m[2].toLowerCase()], mo2 = MONTHS_ES[m[4].toLowerCase()];
    if (mo1 !== undefined && mo2 !== undefined)
      return { from: new Date(+m[5], mo1, +m[1]), to: new Date(+m[5], mo2, +m[3]) };
  }

  // "YYYY-MM-DD – YYYY-MM-DD" fallback
  m = p.match(/(\d{4}-\d{2}-\d{2})\s*[–\-]\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return { from: new Date(m[1] + "T12:00:00"), to: new Date(m[2] + "T12:00:00") };

  return null;
}

export function getReportDates(report) {
  if (report.dateFrom && report.dateTo)
    return { from: new Date(report.dateFrom + "T12:00:00"), to: new Date(report.dateTo + "T12:00:00") };
  return parsePeriodDates(report.period);
}

export function selectReportsForRange(reports, queryFrom, queryTo) {
  const parsed = reports.map(r => {
    const dates = getReportDates(r);
    if (!dates) return null;
    const duration = (dates.to - dates.from) / 86400000;
    return { report: r, from: dates.from, to: dates.to, duration };
  }).filter(Boolean);

  // Keep only reports that overlap with the query range
  const overlapping = parsed.filter(p => p.from <= queryTo && p.to >= queryFrom);

  // Sort longest first — prefer broad reports over daily ones
  overlapping.sort((a, b) => b.duration - a.duration);

  // Greedy non-overlapping selection
  const selected = [];
  for (const item of overlapping) {
    const overlapsSelected = selected.some(s => s.from <= item.to && s.to >= item.from);
    if (!overlapsSelected) selected.push(item);
  }

  return selected.map(s => s.report);
}

export function distributeDaily(reports, queryFrom, queryTo) {
  const dayMs = 86400000;
  const selected = selectReportsForRange(reports, queryFrom, queryTo);
  const days = {};
  let d = new Date(queryFrom);
  while (d <= queryTo) {
    days[d.toISOString().split("T")[0]] = null;
    d = new Date(d.getTime() + dayMs);
  }
  for (const report of selected) {
    const dates = getReportDates(report);
    if (!dates) continue;
    const reportDays = Math.max(1, Math.round((dates.to - dates.from) / dayMs) + 1);
    const dConv = (report.conversion || 0) / reportDays;
    const dSp   = (report.spend      || 0) / reportDays;
    const dPur  = (report.purchases  || 0) / reportDays;
    let rd = new Date(Math.max(dates.from.getTime(), queryFrom.getTime()));
    const rdEnd = new Date(Math.min(dates.to.getTime(), queryTo.getTime()));
    while (rd <= rdEnd) {
      const key = rd.toISOString().split("T")[0];
      if (key in days) {
        if (!days[key]) days[key] = { conversion: 0, spend: 0, purchases: 0 };
        days[key].conversion += dConv;
        days[key].spend      += dSp;
        days[key].purchases  += dPur;
      }
      rd = new Date(rd.getTime() + dayMs);
    }
  }
  return Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      conversion:      v ? v.conversion  : null,
      spend:           v ? v.spend       : null,
      purchases:       v ? v.purchases   : null,
      roas:            v && v.spend > 0  ? v.conversion / v.spend : null,
      costPerPurchase: v && v.purchases > 0 ? v.spend / v.purchases : null,
    }));
}
