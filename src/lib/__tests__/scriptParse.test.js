import { describe, it, expect } from "vitest";
import { extractTitleFromScript, stripTitleSection } from "../scriptParse.js";

describe("extractTitleFromScript", () => {
  it("extracts a heading-style title", () => {
    expect(extractTitleFromScript("## TÍTULO: El gran hook\n\n## HOOKS")).toBe("El gran hook");
  });

  it("handles title without accent and with markdown emphasis", () => {
    expect(extractTitleFromScript("**TITULO** Mira esto")).toBe("Mira esto");
  });

  it("strips wrapping quotes", () => {
    expect(extractTitleFromScript('## TÍTULO: "Hola mundo"')).toBe("Hola mundo");
  });

  it("strips trailing punctuation", () => {
    expect(extractTitleFromScript("## TÍTULO: Hola mundo.")).toBe("Hola mundo");
  });

  it("returns null when no title block", () => {
    expect(extractTitleFromScript("solo texto sin titulo")).toBeNull();
    expect(extractTitleFromScript("")).toBeNull();
    expect(extractTitleFromScript(null)).toBeNull();
  });
});

describe("stripTitleSection", () => {
  it("removes everything before HOOKS", () => {
    expect(stripTitleSection("## TÍTULO: x\n## HOOKS\nHook 1: hola")).toBe(
      "## HOOKS\nHook 1: hola",
    );
  });

  it("returns original text when there is no HOOKS section", () => {
    expect(stripTitleSection("nada que cortar")).toBe("nada que cortar");
  });

  it("passes through non-string input", () => {
    expect(stripTitleSection(null)).toBeNull();
  });
});
