import { describe, it, expect } from "vitest";
import {
  countScriptWords,
  estimateScriptDuration,
  secondsForWords,
  formatDurationLabel,
  PRIMARY_PACE_WPM,
} from "../scriptDuration.js";

describe("countScriptWords", () => {
  it("returns 0 for empty / non-string input", () => {
    expect(countScriptWords("")).toBe(0);
    expect(countScriptWords(null)).toBe(0);
    expect(countScriptWords(undefined)).toBe(0);
    expect(countScriptWords(123)).toBe(0);
  });

  it("counts plain spoken words", () => {
    expect(countScriptWords("hola mundo esto es")).toBe(4);
  });

  it("strips structural section labels (HOOKS / BODY / CTA)", () => {
    expect(countScriptWords("HOOKS uno dos BODY tres CTA")).toBe(3);
  });

  it("strips Hook N: markers but keeps the spoken line", () => {
    expect(countScriptWords("Hook 1: mira esto")).toBe(2);
  });

  it("does not strip the word 'hook' used mid-sentence", () => {
    expect(countScriptWords("el hook funciona muy bien")).toBe(5);
  });

  it("counts words inside HTML converting block closes to spaces", () => {
    expect(countScriptWords("<p>hola mundo</p><p>otra linea</p>")).toBe(4);
  });

  it("strips markdown heading prefixes and emphasis", () => {
    expect(countScriptWords("## Titulo grande **negrita**")).toBe(3);
  });
});

describe("secondsForWords", () => {
  it("computes seconds from words and wpm", () => {
    expect(secondsForWords(190, 190)).toBe(60);
    expect(secondsForWords(95, 190)).toBe(30);
  });

  it("never returns less than 1 second", () => {
    expect(secondsForWords(0, 190)).toBe(1);
    expect(secondsForWords(1, 190)).toBe(1);
  });
});

describe("formatDurationLabel", () => {
  it("formats sub-minute as seconds", () => {
    expect(formatDurationLabel(45)).toBe("45s");
  });

  it("formats whole minutes without seconds", () => {
    expect(formatDurationLabel(120)).toBe("2m");
  });

  it("formats minutes and seconds", () => {
    expect(formatDurationLabel(90)).toBe("1m 30s");
  });
});

describe("estimateScriptDuration", () => {
  it("returns null when there are no words", () => {
    expect(estimateScriptDuration("")).toBeNull();
    expect(estimateScriptDuration("HOOKS BODY CTA")).toBeNull();
  });

  it("returns words, seconds and label at the primary pace", () => {
    const r = estimateScriptDuration("uno dos tres cuatro cinco");
    expect(r.words).toBe(5);
    expect(r.seconds).toBe(secondsForWords(5, PRIMARY_PACE_WPM));
    expect(typeof r.label).toBe("string");
  });
});
