import { describe, it, expect } from "vitest";
import { parseAutoKey, agruparPorConcepto, etiquetaItem } from "../autoTaskItems.js";

describe("parseAutoKey", () => {
  it("separa brief, etapa, tipo y fecha", () => {
    expect(parseAutoKey("b1|edit|video|2026-08-06"))
      .toEqual({ briefId: "b1", etapa: "edit", tipo: "video", fecha: "2026-08-06" });
    expect(parseAutoKey("b1|edit|estatico|"))
      .toEqual({ briefId: "b1", etapa: "edit", tipo: "estatico", fecha: "" });
  });
  it("la fecha vacía es un grupo real, no un error", () => {
    expect(parseAutoKey("b1|edit|video|")).toEqual({ briefId: "b1", etapa: "edit", tipo: "video", fecha: "" });
  });
  // Las tareas creadas antes de separar videos de estáticos. Leer "video" como
  // fecha hacía que la consulta pidiera `due = 'video'` y la lista quedaba en
  // "No se pudieron cargar los contenidos".
  it("una clave vieja de tres partes sigue siendo fecha, no tipo", () => {
    expect(parseAutoKey("b1|edit|2026-08-06")).toEqual({ briefId: "b1", etapa: "edit", tipo: "", fecha: "2026-08-06" });
  });
  it("devuelve null si la clave no sirve", () => {
    expect(parseAutoKey("b1|edit")).toBeNull();
    expect(parseAutoKey("")).toBeNull();
    expect(parseAutoKey(null)).toBeNull();
  });
});

describe("agruparPorConcepto", () => {
  const slots = [
    { id: 1, num: 1, concepto: "Transformacional", stage_done: true },
    { id: 2, num: 2, concepto: "Transformacional" },
    { id: 3, num: 3, concepto: "IA Animado" },
    { id: 4, num: 4, stage_done: true },
  ];

  it("agrupa y cuenta lo hecho por concepto", () => {
    const g = agruparPorConcepto(slots);
    expect(g.map((x) => [x.concepto, x.done, x.total])).toEqual([
      ["Transformacional", 1, 2],
      ["IA Animado", 0, 1],
      ["Sin concepto", 1, 1],
    ]);
  });

  it("respeta el orden en que aparecen — los slots vienen por número", () => {
    expect(agruparPorConcepto(slots).map((x) => x.concepto)).toEqual(["Transformacional", "IA Animado", "Sin concepto"]);
  });

  it("no se rompe sin datos", () => {
    expect(agruparPorConcepto([])).toEqual([]);
    expect(agruparPorConcepto(null)).toEqual([]);
  });
});

describe("etiquetaItem", () => {
  it("arma número y descripción", () => {
    expect(etiquetaItem({ num: 1, producto: "Peluna Fresh", angulo: "Mal aliento", descripcion: "Pelo del sillón" }))
      .toBe("#001  Peluna Fresh · Mal aliento · Pelo del sillón");
  });
  it("con solo el número no deja separadores sueltos", () => {
    expect(etiquetaItem({ num: 12 })).toBe("#012");
  });
  it("salta los campos vacíos", () => {
    expect(etiquetaItem({ num: 3, producto: "Peluna", angulo: "", descripcion: "  " })).toBe("#003  Peluna");
  });
});
