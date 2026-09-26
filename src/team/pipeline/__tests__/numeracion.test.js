// La numeración de los creativos.
//
// Cada caso de acá es un pedido de José escrito como prueba. No verifican una función:
// verifican que Nath pueda repartir guiones sin tener que auditar números a mano, y que
// las UGC nombren los archivos de Drive con un número que después se pueda cruzar.

import { describe, it, expect } from "vitest";
import { ordenarContenidos, renumerar, fueraDeOrden } from "../numeracion.js";

const s = (id, num, concepto, tipo = "video") => ({ id, num, concepto, tipo });

describe("ordenarContenidos", () => {
  it("junta los conceptos en bloques contiguos", () => {
    // El caso real: un animado quedó en medio de los UGC porque se agregó después.
    const revuelto = [
      s("a", 1, "UGC"), s("b", 2, "UGC"), s("c", 3, "Animado"),
      s("d", 4, "UGC"), s("e", 5, "Testimonial"),
    ];
    expect(ordenarContenidos(revuelto).map((x) => x.concepto))
      .toEqual(["UGC", "UGC", "UGC", "Animado", "Testimonial"]);
  });

  it("respeta el orden de conceptos que Nath ya eligió", () => {
    // El orden entre bloques no se inventa: manda el número más bajo de cada uno. Si
    // los testimoniales empiezan antes que los UGC, siguen antes.
    const l = [s("a", 1, "Testimonial"), s("b", 2, "UGC"), s("c", 9, "Testimonial")];
    expect(ordenarContenidos(l).map((x) => x.concepto))
      .toEqual(["Testimonial", "Testimonial", "UGC"]);
  });

  it("manda los estáticos después de los videos", () => {
    // Se reparten a personas distintas: los videos a las UGC, los estáticos a diseño.
    const l = [s("a", 1, "UGC", "estatico"), s("b", 2, "UGC", "video")];
    expect(ordenarContenidos(l).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("no muta la lista que recibe", () => {
    const l = [s("a", 3, "UGC"), s("b", 1, "UGC")];
    ordenarContenidos(l);
    expect(l.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("los que no tienen concepto van juntos al final, no cada uno por su lado", () => {
    const l = [s("a", 1, ""), s("b", 2, "UGC"), s("c", 3, null)];
    expect(ordenarContenidos(l).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});

describe("renumerar", () => {
  it("numera corrido de 001 en adelante, sin saltos", () => {
    const { cambios, ultimo } = renumerar([
      { slots: [s("a", 7, "UGC"), s("b", 9, "UGC"), s("c", 12, "Testimonial")] },
    ]);
    expect(cambios.map((c) => c.num)).toEqual([1, 2, 3]);
    expect(ultimo).toBe(3);
  });

  it("los briefs siguientes continúan, no reinician", () => {
    // El pedido textual: «a partir del Brief 5 vuelve a 001, y los briefs 6, 7, 8
    // siguen la numeración corrida desde ahí».
    const { cambios, ultimo } = renumerar([
      { slots: [s("a", 40, "UGC"), s("b", 41, "UGC")] },
      { slots: [s("c", 42, "UGC")] },
    ]);
    expect(cambios.map((c) => c.num)).toEqual([1, 2, 3]);
    expect(ultimo).toBe(3);
  });

  it("arranca donde le digan, para no pisar lo ya repartido", () => {
    const { cambios } = renumerar([{ slots: [s("a", 1, "UGC")] }], 30);
    expect(cambios[0].num).toBe(31);
  });

  it("no devuelve los que ya están en su sitio", () => {
    // Cada escritura de más marca una fila como modificada sin motivo, y el board lo
    // miran varias personas a la vez.
    const { cambios } = renumerar([{ slots: [s("a", 1, "UGC"), s("b", 2, "UGC")] }]);
    expect(cambios).toEqual([]);
  });

  it("un número nunca se repite dentro de la tanda", () => {
    const { cambios } = renumerar([
      { slots: [s("a", 5, "UGC"), s("b", 5, "Testimonial")] },
      { slots: [s("c", 5, "UGC")] },
    ]);
    const nums = cambios.map((c) => c.num);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe("fueraDeOrden", () => {
  it("no ofrece renumerar cuando no hace falta", () => {
    expect(fueraDeOrden([s("a", 1, "UGC"), s("b", 2, "UGC")])).toBe(0);
  });

  it("cuenta los que se moverían", () => {
    expect(fueraDeOrden([s("a", 1, "UGC"), s("b", 2, "Animado"), s("c", 3, "UGC")]))
      .toBeGreaterThan(0);
  });
});
