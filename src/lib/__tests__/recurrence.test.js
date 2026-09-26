import { describe, it, expect } from "vitest";
import { calculateNextDate, labelForPattern } from "../recurrence.js";

describe("calculateNextDate", () => {
  it("returns null for missing or unknown pattern", () => {
    expect(calculateNextDate("2026-01-01", null)).toBeNull();
    expect(calculateNextDate("2026-01-01", "nope")).toBeNull();
  });

  it("adds days for diariamente", () => {
    expect(calculateNextDate("2026-01-01", "diariamente")).toBe("2026-01-02");
    expect(calculateNextDate("2026-01-01", "diariamente", 5)).toBe("2026-01-06");
  });

  it("adds a week for semanal", () => {
    expect(calculateNextDate("2026-01-01", "semanal")).toBe("2026-01-08");
  });

  it("adds a month for mensual", () => {
    expect(calculateNextDate("2026-01-15", "mensual")).toBe("2026-02-15");
  });

  it("adds a year for anual", () => {
    expect(calculateNextDate("2026-01-15", "anual")).toBe("2027-01-15");
  });

  it("treats days_after like a day offset", () => {
    expect(calculateNextDate("2026-01-01", "days_after", 3)).toBe("2026-01-04");
  });
});

describe("labelForPattern", () => {
  it("returns the human label for a known pattern", () => {
    expect(labelForPattern("semanal")).toBe("Semanal");
    expect(labelForPattern("anual")).toBe("Anual");
  });

  it("falls back to 'Recurrente' for unknown patterns", () => {
    expect(labelForPattern("xyz")).toBe("Recurrente");
    expect(labelForPattern(null)).toBe("Recurrente");
  });
});
