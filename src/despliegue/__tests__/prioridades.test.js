import { describe, it, expect } from "vitest";
import {
  ordenarPorPrioridad, puntajeDePrioridad, esPrioritaria,
  hayPrioridades, cuantasPrioritarias,
} from "../labels.js";

const ref = (id, nicho, angulo) => ({ id, bank_labels: { nicho: nicho ? [nicho] : [], angulo: angulo ? [angulo] : [] } });

const lista = [
  ref("calzado-oferta", "Calzado", "Oferta"),
  ref("salud-oferta", "Salud", "Oferta"),
  ref("salud-peso", "Salud", "Bajar de peso"),
  ref("belleza-peso", "Belleza", "Bajar de peso"),
  ref("sin-nada", null, null),
];

describe("sin configurar, no pasa nada", () => {
  // La garantía más importante: las cuentas que no lo usen no tienen que notar
  // ningún cambio de orden.
  it("devuelve la MISMA lista, sin copiar ni reordenar", () => {
    expect(ordenarPorPrioridad(lista, undefined)).toBe(lista);
    expect(ordenarPorPrioridad(lista, {})).toBe(lista);
    expect(ordenarPorPrioridad(lista, { nicho: [], angulo: [] })).toBe(lista);
    expect(hayPrioridades({ nicho: [] })).toBe(false);
  });
});

describe("el nicho manda sobre el ángulo", () => {
  const prio = { nicho: ["Salud", "Belleza"], angulo: ["Bajar de peso", "Oferta"] };

  it("todo lo de Salud va antes que lo de Belleza, aunque el ángulo diga otra cosa", () => {
    // "salud-oferta" tiene el ángulo #2 y "belleza-peso" el #1. Si el puntaje se
    // sumara, belleza-peso se colaría arriba. Jerárquico: primero el nicho.
    expect(ordenarPorPrioridad(lista, prio).map((r) => r.id)).toEqual([
      "salud-peso", "salud-oferta", "belleza-peso", "calzado-oferta", "sin-nada",
    ]);
  });

  it("dentro del mismo nicho sí ordena el ángulo", () => {
    const soloSalud = [ref("a", "Salud", "Oferta"), ref("b", "Salud", "Bajar de peso")];
    expect(ordenarPorPrioridad(soloSalud, prio).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("lo no priorizado queda al final en su orden original", () => {
    const r = ordenarPorPrioridad(lista, { nicho: ["Salud"] }).map((x) => x.id);
    expect(r.slice(0, 2).sort()).toEqual(["salud-oferta", "salud-peso"]);
    expect(r.slice(2)).toEqual(["calzado-oferta", "belleza-peso", "sin-nada"]);
  });

  it("no muta la lista que recibe", () => {
    const copia = [...lista];
    ordenarPorPrioridad(lista, prio);
    expect(lista).toEqual(copia);
  });
});

describe("una referencia con varias etiquetas vale por la mejor", () => {
  it("si es de Salud y de Ropa, cuenta como Salud", () => {
    const mixta = { id: "m", bank_labels: { nicho: ["Ropa", "Salud"], angulo: [] } };
    const soloRopa = { id: "r", bank_labels: { nicho: ["Ropa"], angulo: [] } };
    const r = ordenarPorPrioridad([soloRopa, mixta], { nicho: ["Salud", "Ropa"] });
    expect(r.map((x) => x.id)).toEqual(["m", "r"]);
  });
});

describe("modo solo prioridades", () => {
  const prio = { nicho: ["Salud"], soloPrioridades: true };

  it("saca lo que no priorizaste", () => {
    expect(ordenarPorPrioridad(lista, prio).map((r) => r.id))
      .toEqual(["salud-oferta", "salud-peso"]);
  });

  it("apagado, lo deja al final", () => {
    expect(ordenarPorPrioridad(lista, { ...prio, soloPrioridades: false })).toHaveLength(5);
  });
});

describe("puntaje y conteo", () => {
  it("Infinity es 'no está en ninguna lista'", () => {
    expect(puntajeDePrioridad(ref("x", "Ropa", "Otro"), { nicho: ["Salud"] })).toEqual([Infinity, Infinity]);
    expect(esPrioritaria(ref("x", "Ropa"), { nicho: ["Salud"] })).toBe(false);
  });

  // Ordenar las tarjetas de concepto se apoya en esto: gana la que tiene MÁS
  // referencias de lo que te interesa, no la que tiene una sola muy buena.
  it("cuenta cuántas prioritarias hay adentro", () => {
    expect(cuantasPrioritarias(lista, { nicho: ["Salud"] })).toBe(2);
    expect(cuantasPrioritarias(lista, {})).toBe(0);
  });
});

describe("distinctValues no repite la misma etiqueta con otro casing", () => {
  it("'Calzado' y 'calzado' son una sola opción", async () => {
    const { distinctValues } = await import("../labels.js");
    const vs = [
      { bank_labels: { nicho: ["Calzado"] } },
      { bank_labels: { nicho: ["calzado"] } },
      { bank_labels: { nicho: ["CALZADO "] } },
      { bank_labels: { nicho: ["Salud"] } },
    ];
    expect(distinctValues(vs, "nicho")).toEqual(["Calzado", "Salud"]);
  });
});
