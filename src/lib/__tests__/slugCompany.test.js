import { describe, it, expect } from "vitest";
import { slugifyCompany } from "../authAccess.js";

// El caso real: Brahian entraba al portal y quedaba para siempre en "Preparando
// tu tablero…". Su empresa tiene el slug "brahian---drop" guardado, pero esta
// función lo re-slugificaba a "brahian-drop", redirigía a una URL que no existe
// en la base y la empresa nunca se encontraba.
describe("slugifyCompany", () => {
  it("el slug guardado se respeta tal cual, aunque no se vea prolijo", () => {
    expect(slugifyCompany({ name: "Brahian - Drop", slug: "brahian---drop" })).toBe("brahian---drop");
    expect(slugifyCompany({ name: "Alexis - Drop", slug: "alexis---drop" })).toBe("alexis---drop");
  });

  it("con acentos también: es un identificador, no un texto a normalizar", () => {
    expect(slugifyCompany({ name: "Artillería Fox", slug: "artillería-fox" })).toBe("artillería-fox");
  });

  it("sin slug guardado, se deriva del nombre", () => {
    expect(slugifyCompany({ name: "Peluna Pets" })).toBe("peluna-pets");
    expect(slugifyCompany({ name: "Artillería Fox" })).toBe("artilleria-fox");
  });

  it("aguanta que no le pasen nada", () => {
    expect(slugifyCompany(null)).toBe("");
    expect(slugifyCompany({})).toBe("");
  });
});
