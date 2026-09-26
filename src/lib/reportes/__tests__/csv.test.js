import { describe, it, expect } from "vitest";
import { parseMetaCsv, parseCsvNumber, classifyObjective } from "../csv.js";

describe("parseCsvNumber", () => {
  it("parses Spanish format (1.234,56)", () => {
    expect(parseCsvNumber("1.234,56")).toBeCloseTo(1234.56);
  });
  it("parses English format (1,234.56)", () => {
    expect(parseCsvNumber("1,234.56")).toBeCloseTo(1234.56);
  });
  it("strips currency symbols", () => {
    expect(parseCsvNumber("$2500")).toBe(2500);
    expect(parseCsvNumber("$1,500.00")).toBe(1500);
  });
  it("returns null for empty / dash / n/a", () => {
    expect(parseCsvNumber("")).toBeNull();
    expect(parseCsvNumber("-")).toBeNull();
    expect(parseCsvNumber("N/A")).toBeNull();
    expect(parseCsvNumber(null)).toBeNull();
  });
});

describe("classifyObjective", () => {
  it("classifies purchase indicators", () => {
    expect(classifyObjective("offsite_conversion.fb_pixel_purchase")).toBe("purchase");
  });
  it("classifies messaging and video", () => {
    expect(classifyObjective("messaging_conversation_started")).toBe("messaging");
    expect(classifyObjective("video_view thruplay")).toBe("video");
  });
  it("falls back to other", () => {
    expect(classifyObjective("")).toBe("other");
    expect(classifyObjective("something_random")).toBe("other");
  });
});

describe("parseMetaCsv", () => {
  it("detects campaign level and computes spend totals", () => {
    // Use semicolon delimiter so "1.000" style thousands aren't needed;
    // plain integers keep the numbers unambiguous.
    const csv = [
      "Nombre de la campaña;Importe gastado;Impresiones;Compras;Valor de conversión de compras",
      "Campaña A;1000;50000;10;5000",
      "Campaña B;500;20000;2;1000",
      "Total;1500;70000;12;6000",
    ].join("\n");
    const r = parseMetaCsv(csv);
    expect(r.level).toBe("campaign");
    // "Total" row is filtered out; two campaigns with spend remain
    expect(r.entries).toHaveLength(2);
    expect(r.totals.spend).toBe(1500);
    expect(r.totals.impressions).toBe(70000);
    expect(r.totals.purchases).toBe(12);
    expect(r.totals.conversion).toBe(6000);
  });

  it("detects ad level via ad-name column", () => {
    const csv = [
      "Nombre del anuncio,Importe gastado,Impresiones",
      "Ad 1,300,10000",
    ].join("\n");
    const r = parseMetaCsv(csv);
    expect(r.level).toBe("ad");
    expect(r.entries[0].name).toBe("Ad 1");
    expect(r.entries[0].spend).toBe(300);
  });

  it("returns an error for empty input", () => {
    const r = parseMetaCsv("");
    expect(r.level).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
