import { describe, it, expect } from "vitest";
import { getReportDates, selectReportsForRange, distributeDaily } from "../reportRanges.js";

const D = (s) => new Date(s + "T12:00:00");

describe("getReportDates", () => {
  it("uses explicit dateFrom/dateTo when present", () => {
    const r = getReportDates({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
    expect(r.from.getFullYear()).toBe(2026);
    expect(r.from.getMonth()).toBe(0);
    expect(r.to.getDate()).toBe(31);
  });
  it("falls back to parsing the period string", () => {
    const r = getReportDates({ period: "1 – 15 de ene 2026" });
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getDate()).toBe(15);
    expect(r.from.getMonth()).toBe(0);
  });
});

describe("selectReportsForRange", () => {
  it("prefers the longest report and avoids overlapping ones", () => {
    const reports = [
      { id: "wide", dateFrom: "2026-01-01", dateTo: "2026-01-31" },
      { id: "day", dateFrom: "2026-01-10", dateTo: "2026-01-10" },
      { id: "outside", dateFrom: "2026-03-01", dateTo: "2026-03-05" },
    ];
    const selected = selectReportsForRange(reports, D("2026-01-01"), D("2026-01-31"));
    const ids = selected.map((r) => r.id);
    expect(ids).toContain("wide");
    // the daily report overlaps the wide one → excluded
    expect(ids).not.toContain("day");
    // the March report is outside the query range → excluded
    expect(ids).not.toContain("outside");
  });
});

describe("distributeDaily", () => {
  it("spreads a report's metrics evenly across its days", () => {
    const reports = [
      { dateFrom: "2026-01-01", dateTo: "2026-01-02", conversion: 200, spend: 100, purchases: 4 },
    ];
    const daily = distributeDaily(reports, D("2026-01-01"), D("2026-01-02"));
    expect(daily).toHaveLength(2);
    expect(daily[0].spend).toBeCloseTo(50);
    expect(daily[0].conversion).toBeCloseTo(100);
    expect(daily[0].roas).toBeCloseTo(2);
    expect(daily[0].costPerPurchase).toBeCloseTo(25);
  });
});
