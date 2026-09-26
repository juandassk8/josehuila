import { describe, it, expect } from "vitest";
import {
  getLabels,
  hasAnyLabel,
  normLabel,
  variationMatches,
  hasActiveFilters,
  linkMatches,
  groupVariations,
  NO_LABEL,
} from "../labels.js";

describe("normLabel", () => {
  it("lowercases, trims and strips accents", () => {
    expect(normLabel("Calzado ")).toBe("calzado");
    expect(normLabel("CALZADO")).toBe("calzado");
    expect(normLabel("Ángulo")).toBe("angulo");
  });

  it("handles null / non-string", () => {
    expect(normLabel(null)).toBe("");
    expect(normLabel(42)).toBe("42");
  });
});

describe("getLabels / hasAnyLabel", () => {
  it("normalizes missing bank_labels to empty arrays per category", () => {
    const l = getLabels({});
    expect(l.marca).toEqual([]);
    expect(l.nicho).toEqual([]);
    expect(hasAnyLabel({})).toBe(false);
  });

  it("keeps only truthy values and reports presence", () => {
    const v = { bank_labels: { marca: ["Nike", "", null], nicho: [] } };
    expect(getLabels(v).marca).toEqual(["Nike"]);
    expect(hasAnyLabel(v)).toBe(true);
  });
});

describe("variationMatches", () => {
  const v = { bank_labels: { marca: ["Nike"], nicho: ["Calzado"] } };

  it("passes when no filters are active", () => {
    expect(variationMatches(v, {})).toBe(true);
  });

  it("matches case/accent-insensitively (OR within a category)", () => {
    expect(variationMatches(v, { marca: ["nike"] })).toBe(true);
    expect(variationMatches(v, { marca: new Set(["NIKE"]) })).toBe(true);
  });

  it("applies AND across categories", () => {
    expect(variationMatches(v, { marca: ["Nike"], nicho: ["Calzado"] })).toBe(true);
    expect(variationMatches(v, { marca: ["Nike"], nicho: ["Ropa"] })).toBe(false);
  });
});

describe("hasActiveFilters", () => {
  it("detects active selections in any category", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ marca: [] })).toBe(false);
    expect(hasActiveFilters({ marca: ["x"] })).toBe(true);
    expect(hasActiveFilters({ nicho: new Set(["x"]) })).toBe(true);
  });
});

describe("linkMatches", () => {
  const withMeta = { meta_ads_library_url: "http://m" };
  const withBoth = { meta_ads_library_url: "http://m", drive_url: "http://d" };
  const none = {};

  it("returns true for 'all' / empty filter", () => {
    expect(linkMatches(none, "all")).toBe(true);
    expect(linkMatches(none, null)).toBe(true);
  });

  it("filters by presence of meta / drive links", () => {
    expect(linkMatches(withMeta, "meta")).toBe(true);
    expect(linkMatches(withMeta, "meta_no_drive")).toBe(true);
    expect(linkMatches(withBoth, "meta_no_drive")).toBe(false);
    expect(linkMatches(withBoth, "meta_and_drive")).toBe(true);
    expect(linkMatches(none, "no_link")).toBe(true);
  });
});

describe("groupVariations", () => {
  it("groups by first value, orders by count desc, sin-etiqueta last", () => {
    const vs = [
      { bank_labels: { marca: ["Nike"] } },
      { bank_labels: { marca: ["Nike"] } },
      { bank_labels: { marca: ["Adidas"] } },
      { bank_labels: {} },
    ];
    const groups = groupVariations(vs, "marca");
    expect(groups.map((g) => g.value)).toEqual(["Nike", "Adidas", NO_LABEL]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[2].label).toBe("Sin etiqueta");
  });
});
