import { describe, it, expect } from "vitest";
import { mergeLabelValue } from "../labels.js";

describe("mergeLabelValue", () => {
  it("appends a genuinely new value", () => {
    expect(mergeLabelValue(["Nike"], "Adidas")).toEqual(["Nike", "Adidas"]);
  });

  it("does NOT add a case-only variant (keeps original casing)", () => {
    // "ryze" when "Ryze" exists → no duplicate, existing casing preserved.
    expect(mergeLabelValue(["Ryze"], "ryze")).toEqual(["Ryze"]);
    expect(mergeLabelValue(["Ryze"], "RYZE")).toEqual(["Ryze"]);
  });

  it("collapses accent-only variants (Ángulo vs angulo)", () => {
    expect(mergeLabelValue(["Ángulo"], "angulo")).toEqual(["Ángulo"]);
    expect(mergeLabelValue(["angulo"], "Ángulo")).toEqual(["angulo"]);
  });

  it("ignores surrounding whitespace when comparing", () => {
    expect(mergeLabelValue(["Calzado"], "  calzado ")).toEqual(["Calzado"]);
  });

  it("does not mutate the input array", () => {
    const arr = ["Nike"];
    const out = mergeLabelValue(arr, "Adidas");
    expect(arr).toEqual(["Nike"]);
    expect(out).not.toBe(arr);
  });

  it("treats a non-array first arg as empty", () => {
    expect(mergeLabelValue(null, "Nike")).toEqual(["Nike"]);
    expect(mergeLabelValue(undefined, "Nike")).toEqual(["Nike"]);
  });

  it("does not append empty / whitespace-only values", () => {
    expect(mergeLabelValue(["Nike"], "")).toEqual(["Nike"]);
    expect(mergeLabelValue(["Nike"], "   ")).toEqual(["Nike"]);
    expect(mergeLabelValue(["Nike"], null)).toEqual(["Nike"]);
  });

  it("dedups a sequence fed one value at a time (write-path simulation)", () => {
    // Simula applyLabelDelta / addLabelsToVariations agregando de a uno.
    let arr = [];
    for (const v of ["Ryze", "ryze", "RYZE", "Nike", "níke"]) arr = mergeLabelValue(arr, v);
    expect(arr).toEqual(["Ryze", "Nike"]);
  });
});
