import { describe, it, expect } from "vitest";
import {
  mapaEtiquetasPorConcepto, opcionesPorCategoria, conceptoPasaEtiquetas, textoBuscable,
} from "../bankFilters.js";

// Dos referencias del mismo concepto, con etiquetas distintas: el concepto
// "tiene" la unión de las dos.
const VARS = [
  { concept_id: "c1", bank_labels: { marca: ["Pijamas Auge"], nicho: ["Ropa"], subnicho: ["Pijamas"] } },
  { concept_id: "c1", bank_labels: { marca: ["Momo Pijamas"], nicho: ["Ropa"], angulo: ["Oferta"] } },
  { concept_id: "c2", bank_labels: { marca: ["Nooro"], nicho: ["Salud"], angulo: ["Bajar de peso"] } },
  { concept_id: "c3", bank_labels: {} },
];

describe("mapaEtiquetasPorConcepto", () => {
  const m = mapaEtiquetasPorConcepto(VARS);

  it("junta las etiquetas de todas las referencias del concepto", () => {
    expect([...m.get("c1").marca].sort()).toEqual(["Momo Pijamas", "Pijamas Auge"]);
    expect([...m.get("c1").nicho]).toEqual(["Ropa"]);          // sin repetir
    expect([...m.get("c1").angulo]).toEqual(["Oferta"]);
  });

  it("ignora los que no tienen etiquetas", () => {
    expect(m.has("c3")).toBe(false);
  });

  it("aguanta la basura", () => {
    expect(mapaEtiquetasPorConcepto(null).size).toBe(0);
    expect(mapaEtiquetasPorConcepto([{ bank_labels: { marca: ["X"] } }]).size).toBe(0);  // sin concept_id
  });
});

describe("opcionesPorCategoria", () => {
  const ops = opcionesPorCategoria(mapaEtiquetasPorConcepto(VARS));

  it("cuenta en cuántos conceptos aparece cada valor, del más usado al menos", () => {
    expect(ops.nicho).toEqual([{ valor: "Ropa", n: 1 }, { valor: "Salud", n: 1 }]);
    expect(ops.marca.map((o) => o.valor).sort()).toEqual(["Momo Pijamas", "Nooro", "Pijamas Auge"]);
  });
});

describe("conceptoPasaEtiquetas", () => {
  const m = mapaEtiquetasPorConcepto(VARS);
  const c1 = m.get("c1"), c2 = m.get("c2");

  it("sin filtros pasa todo", () => {
    expect(conceptoPasaEtiquetas(c1, {})).toBe(true);
    expect(conceptoPasaEtiquetas(undefined, {})).toBe(true);
  });

  it("O dentro de una categoría", () => {
    expect(conceptoPasaEtiquetas(c1, { marca: ["Nooro", "Pijamas Auge"] })).toBe(true);
    expect(conceptoPasaEtiquetas(c1, { marca: ["Nooro"] })).toBe(false);
  });

  it("Y entre categorías: se acota cruzando ejes", () => {
    expect(conceptoPasaEtiquetas(c1, { nicho: ["Ropa"], subnicho: ["Pijamas"] })).toBe(true);
    expect(conceptoPasaEtiquetas(c1, { nicho: ["Ropa"], subnicho: ["Cabello"] })).toBe(false);
    expect(conceptoPasaEtiquetas(c2, { nicho: ["Salud"], angulo: ["Bajar de peso"] })).toBe(true);
  });

  it("compara sin acentos ni mayúsculas", () => {
    expect(conceptoPasaEtiquetas(c1, { subnicho: ["PIJAMÁS"] })).toBe(true);
  });

  it("el etiquetado viejo (`bank_tags`) sigue valiendo para nicho", () => {
    // Hay conceptos que solo tienen bank_tags: sin esto desaparecen del filtro.
    expect(conceptoPasaEtiquetas(undefined, { nicho: ["Mascotas"] }, { bankTags: ["Mascotas"] })).toBe(true);
    expect(conceptoPasaEtiquetas(undefined, { marca: ["Mascotas"] }, { bankTags: ["Mascotas"] })).toBe(false);
  });

  it("un concepto sin etiquetas no pasa un filtro de etiqueta", () => {
    expect(conceptoPasaEtiquetas(undefined, { nicho: ["Ropa"] })).toBe(false);
  });
});

describe("textoBuscable", () => {
  it("incluye las etiquetas, que antes quedaban afuera", () => {
    const sets = mapaEtiquetasPorConcepto(VARS).get("c1");
    const t = textoBuscable({ name: "Catálogo", company_name: "Auge" }, sets);
    expect(t).toContain("pijamas auge");
    expect(t).toContain("oferta");
    expect(t).toContain("catálogo");
  });

  it("no se rompe sin datos", () => {
    expect(textoBuscable(null, null)).toBe("");
  });
});
