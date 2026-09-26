import { describe, it, expect } from "vitest";
import {
  calcularTope, calcularProduccion, repartirPorEmbudo, planDeCadencia,
} from "../cadencia.js";

// El ejemplo del curso, clase 8.3: pauta $20M/semana, CPA $20.000, prueba 4x,
// 30% a testeo. Tiene que dar tope 75 y meta 30.
const EJEMPLO = {
  pautaSemanal: 20_000_000, pctTesteo: 30,
  cpaObjetivo: 20_000, multiplicadorPrueba: 4,
};

describe("calcularTope", () => {
  it("reproduce el ejemplo del curso", () => {
    expect(calcularTope(EJEMPLO)).toBe(75);
  });

  // Prometer un creativo que no se puede pagar entero es peor que prometer uno
  // menos: a medio financiar no gasta su presupuesto de prueba y no prueba nada.
  it("nunca promete un creativo que no se paga completo", () => {
    expect(calcularTope({ ...EJEMPLO, pautaSemanal: 20_500_000 })).toBe(76);
    expect(calcularTope({ ...EJEMPLO, pautaSemanal: 6_600_000 })).toBe(24);
  });

  it("sin datos da cero, no NaN", () => {
    expect(calcularTope({})).toBe(0);
    expect(calcularTope({ ...EJEMPLO, cpaObjetivo: 0 })).toBe(0);
    expect(calcularTope({ ...EJEMPLO, pctTesteo: 0 })).toBe(0);
  });
});

describe("calcularProduccion", () => {
  it("40% del tope, como manda el curso", () => {
    expect(calcularProduccion(75)).toBe(30);
    expect(calcularProduccion(50)).toBe(20);
  });

  it("se puede subir hasta el tope si hay músculo", () => {
    expect(calcularProduccion(75, 100)).toBe(75);
    expect(calcularProduccion(75, 60)).toBe(45);
  });

  // Con tope 1, el 40% redondea a 0 y la cuenta se quedaría sin producir nada.
  it("con un tope chico igual produce al menos uno", () => {
    expect(calcularProduccion(1)).toBe(1);
    expect(calcularProduccion(2)).toBe(1);
  });

  it("sin tope no inventa producción", () => {
    expect(calcularProduccion(0)).toBe(0);
  });
});

describe("repartirPorEmbudo", () => {
  it("el ejemplo del curso: 30 se parte en 18 / 9 / 3", () => {
    expect(repartirPorEmbudo(30)).toEqual({ tofu: 18, mofu: 9, bofu: 3 });
  });

  it("y con 50: 30 / 15 / 5", () => {
    expect(repartirPorEmbudo(50)).toEqual({ tofu: 30, mofu: 15, bofu: 5 });
  });

  // Redondear cada parte por separado puede perder o inventar un creativo.
  it("las partes suman siempre el total", () => {
    for (const n of [7, 11, 13, 23, 29, 31, 47]) {
      const r = repartirPorEmbudo(n);
      expect(r.tofu + r.mofu + r.bofu).toBe(n);
    }
  });

  it("respeta un reparto propio", () => {
    expect(repartirPorEmbudo(20, { tofu: 40, mofu: 40, bofu: 20 }))
      .toEqual({ tofu: 8, mofu: 8, bofu: 4 });
  });
});

describe("planDeCadencia", () => {
  it("los tres pasos encadenados, con el ejemplo del curso", () => {
    expect(planDeCadencia(EJEMPLO)).toEqual({
      tope: 75,
      produccion: 30,
      reservaParaEscalar: 45,
      porEtapa: { tofu: 18, mofu: 9, bofu: 3 },
    });
  });

  // Lo que estaba mal antes: el reparto se aplicaba al TOPE. Esta prueba fija
  // que ya no, porque el error no se ve a simple vista — los números salen y
  // parecen razonables, solo que son 2,5 veces los que corresponden.
  it("el embudo se reparte sobre la produccion, NO sobre el tope", () => {
    const p = planDeCadencia(EJEMPLO);
    expect(p.porEtapa.tofu + p.porEtapa.mofu + p.porEtapa.bofu).toBe(p.produccion);
    expect(p.porEtapa.tofu).toBe(18);   // sobre el tope habria dado 45
  });

  it("al 100% no queda reserva para escalar", () => {
    const p = planDeCadencia({ ...EJEMPLO, pctCadencia: 100 });
    expect(p.produccion).toBe(75);
    expect(p.reservaParaEscalar).toBe(0);
  });
});
