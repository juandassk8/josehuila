import { describe, it, expect } from "vitest";
import { patchDeConcepto, patchDeProducto, opcionesDelLote } from "../loteCampos.js";

const NIVELES = { Transformacional: "tofu", Testimonial: "mofu" };

describe("poner el concepto en tanda", () => {
  it("trae el nivel de conciencia del banco cuando el slot no tenía", () => {
    expect(patchDeConcepto({ nivel_conciencia: "" }, "Transformacional", NIVELES))
      .toEqual({ concepto: "Transformacional", nivel_conciencia: "tofu" });
  });

  it("NO le pisa el nivel a quien ya lo tenía puesto", () => {
    // Esta es la razón de que el patch se decida por slot. Plano, poner el
    // concepto en diez de una le borraría el nivel a los que entran por otro
    // punto del embudo a propósito — y nadie revisa diez filas para notarlo.
    expect(patchDeConcepto({ nivel_conciencia: "bofu" }, "Transformacional", NIVELES))
      .toEqual({ concepto: "Transformacional" });
  });

  it("si el concepto no tiene nivel en el banco, solo pone el concepto", () => {
    expect(patchDeConcepto({ nivel_conciencia: "" }, "Sin banco", NIVELES))
      .toEqual({ concepto: "Sin banco" });
  });

  it("aguanta que no le pasen el mapa", () => {
    expect(patchDeConcepto({}, "X")).toEqual({ concepto: "X" });
  });
});

describe("poner el producto en tanda", () => {
  const PRODS = [{ id: "p1", name: "Peluna Fresh – Perros" }, { id: "p2", name: "Peluna Gatos" }];

  it("va con su id", () => {
    expect(patchDeProducto("Peluna Gatos", PRODS)).toEqual({ producto: "Peluna Gatos", product_id: "p2" });
  });

  it("un producto que no está en la lista no inventa id", () => {
    expect(patchDeProducto("Otro", PRODS)).toEqual({ producto: "Otro", product_id: null });
  });
});

describe("qué ángulos y creadores se ofrecen", () => {
  const PRODS = [
    { id: "p1", name: "Fresh", creators: ["Ana", "Beto"], touchpoints: { angles: [{ title: "Olor" }, { title: "Sarro" }] } },
    { id: "p2", name: "Gatos", creators: ["Caro"], touchpoints: { angles: [{ title: "Bolas de pelo" }] } },
  ];
  const CAT = { angulos: ["Olor", "Sarro", "Bolas de pelo"], creadores: ["Ana", "Beto", "Caro"] };

  it("todos del mismo producto → los de ese producto", () => {
    const r = opcionesDelLote([{ product_id: "p1" }, { product_id: "p1" }], PRODS, CAT);
    expect(r.angulos).toEqual(["Olor", "Sarro"]);
    expect(r.creadores).toEqual(["Ana", "Beto"]);
  });

  it("productos mezclados → los de la empresa entera", () => {
    // Ofrecer los del primero sería inventarse cuál de los dos manda.
    const r = opcionesDelLote([{ product_id: "p1" }, { product_id: "p2" }], PRODS, CAT);
    expect(r.angulos).toEqual(CAT.angulos);
    expect(r.creadores).toEqual(CAT.creadores);
  });

  it("cruza por nombre cuando el slot no tiene product_id", () => {
    // Los slots viejos guardaron el nombre y no el id.
    const r = opcionesDelLote([{ producto: "Gatos" }], PRODS, CAT);
    expect(r.angulos).toEqual(["Bolas de pelo"]);
  });

  it("un producto sin ángulos cargados cae a los de la empresa", () => {
    const sinAngulos = [{ id: "p3", name: "Nuevo", creators: [], touchpoints: {} }];
    const r = opcionesDelLote([{ product_id: "p3" }], sinAngulos, CAT);
    expect(r.angulos).toEqual(CAT.angulos);
    expect(r.creadores).toEqual(CAT.creadores);
  });

  it("sin nada elegido no revienta", () => {
    expect(opcionesDelLote([], PRODS, CAT).angulos).toEqual(CAT.angulos);
  });
});
