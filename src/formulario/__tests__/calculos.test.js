import { describe, it, expect } from "vitest";
import {
  calcular, senales, semaforoAire, conoceSusNumeros, nivelDeMeta,
  rentabilidadPorVenta, cpaDesdeCompras, roasDesdeIngresos, FACTOR_IVA,
} from "../calculos.js";

// El modelo (José, 2026-09-21): el cliente dice cuánto le queda de cada venta YA
// PAGANDO TODO, pauta incluida. El techo es eso más lo que hoy paga por la venta.
// `margen` es ese techo (lo que deja la venta antes de pagarla), para poder escribir
// los ejemplos del spec tal cual: «$100.000 con $30.000 de margen y CPA de $18.000».
const base = ({ ticket = 100_000, margen = 30_000, cpa = 18_000, ...extra } = {}) => ({
  ticket_promedio: ticket,
  cpa_mes: cpa,
  rentabilidad_neta: { valor: margen - cpa, unidad: "pesos", iva: "no_aplica" },
  ...extra,
});

describe("el semáforo del 2.1 — los ejemplos del spec", () => {
  it("$100.000 con $30.000 de margen: el CPA máximo es $30.000", () => {
    expect(calcular(base()).cpa_maximo).toBe(30_000);
  });

  it("pagando $18.000 por venta queda 40% de aire → verde", () => {
    const { salud_margen } = calcular(base({ cpa: 18_000 }));
    expect(salud_margen.aire).toBeCloseTo(0.4, 10);
    expect(salud_margen.semaforo).toBe("verde");
  });

  it("pagando $27.000 por venta queda 10% de aire → rojo", () => {
    const { salud_margen } = calcular(base({ cpa: 27_000 }));
    expect(salud_margen.aire).toBeCloseTo(0.1, 10);
    expect(salud_margen.semaforo).toBe("rojo");
  });

  it("los carros: $5 millones de margen y $400.000 de CPA → 92% → verde", () => {
    const { salud_margen } = calcular(base({ ticket: 50_000_000, margen: 5_000_000, cpa: 400_000 }));
    expect(salud_margen.aire).toBeCloseTo(0.92, 10);
    expect(salud_margen.semaforo).toBe("verde");
  });

  it("las gomitas: $8.000 de margen y $7.000 de CPA → 12% → rojo", () => {
    const { salud_margen } = calcular(base({ ticket: 20_000, margen: 8_000, cpa: 7_000 }));
    expect(salud_margen.aire).toBeCloseTo(0.125, 10);
    expect(salud_margen.semaforo).toBe("rojo");
  });

  it("los cortes: 40% es verde, 15% es amarillo, justo debajo de 15% es rojo", () => {
    expect(semaforoAire(0.4)).toBe("verde");
    expect(semaforoAire(0.3999)).toBe("amarillo");
    expect(semaforoAire(0.15)).toBe("amarillo");
    expect(semaforoAire(0.1499)).toBe("rojo");
    expect(semaforoAire(0)).toBe("rojo");
    expect(semaforoAire(-0.01)).toBe("rojo_profundo");
    expect(semaforoAire(null)).toBe(null);
  });
});

describe("de la rentabilidad neta al CPA máximo", () => {
  it("el caso de José: ticket $104.000, le queda el 20%, paga $22.915 por venta", () => {
    const c = calcular({ ticket_promedio: 104_000, cpa_mes: 22_915, rentabilidad_neta: { valor: 20, unidad: "pct", iva: "descontado" } });
    expect(c.rentabilidad_por_venta).toBe(20_800);
    expect(c.cpa_maximo).toBe(43_715);              // 20.800 que le quedan + 22.915 que paga
    expect(c.roas_equilibrio).toBeCloseTo(2.379, 3);
    expect(c.salud_margen.semaforo).toBe("verde");  // 47,6% de aire
  });

  it("en pesos o en %: salen los dos", () => {
    expect(rentabilidadPorVenta(100_000, { valor: 20, unidad: "pct", iva: "descontado" })).toEqual({ neto: 20_000, pct: 20 });
    expect(rentabilidadPorVenta(100_000, { valor: 20_000, unidad: "pesos", iva: "no_aplica" })).toEqual({ neto: 20_000, pct: 20 });
  });

  it("IVA: se descuenta solo si dice que su número todavía no lo trae", () => {
    expect(FACTOR_IVA).toBeCloseTo(1 - 0.19 / 1.19, 4);
    expect(rentabilidadPorVenta(100_000, { valor: 20, unidad: "pct", iva: "sin_descontar" }).neto).toBeCloseTo(16_806, 0);
    expect(rentabilidadPorVenta(100_000, { valor: 20, unidad: "pct", iva: "descontado" }).neto).toBe(20_000);
    expect(rentabilidadPorVenta(100_000, { valor: 20, unidad: "pct", iva: "no_aplica" }).neto).toBe(20_000);
  });

  it("la tasa de entrega y el reparto de pago ya NO mueven el CPA máximo", () => {
    const con = calcular(base({ reparto_pago: { contraentrega: 80, anticipado: 20 }, tasa_entrega: 60 }));
    expect(con.cpa_maximo).toBe(calcular(base()).cpa_maximo);
  });

  it("sin CPA o sin rentabilidad todavía, no inventa el techo", () => {
    expect(calcular({ ticket_promedio: 100_000, rentabilidad_neta: { valor: 20, unidad: "pct", iva: "descontado" } }).cpa_maximo).toBe(null);
    expect(calcular({ ticket_promedio: 100_000, cpa_mes: 18_000 }).cpa_maximo).toBe(null);
  });

  it("ROAS de equilibrio = ticket ÷ CPA máximo", () => {
    expect(calcular(base()).roas_equilibrio).toBeCloseTo(3.3333, 3);
  });

  it("el CPA objetivo lo da el cliente; el portal deriva qué parte del margen le queda", () => {
    expect(calcular(base({ cpa_objetivo: 21_000 })).margen_que_le_queda).toBeCloseTo(0.3, 10);
    expect(calcular(base()).margen_que_le_queda).toBe(null);
  });
});

describe("ventas, inversión y utilidad", () => {
  const r = base({
    facturacion_mes_pasado: 40_000_000,
    facturacion_objetivo_3m: 80_000_000,
    cpa_objetivo: 21_000,
  });
  const c = calcular(r);

  it("el promedio de tres meses lo saca el portal del total", () => {
    expect(calcular({ facturacion_3m_total: 330_000_000 }).facturacion_promedio_3m).toBe(110_000_000);
    expect(calcular({}).facturacion_promedio_3m).toBe(null);
  });

  it("ROAS general = facturación del mes ÷ pauta del mes", () => {
    expect(calcular({ facturacion_mes_pasado: 700_000_000, gasto_pauta_mes: 125_000_000 }).roas_general).toBeCloseTo(5.6, 10);
    expect(calcular({ facturacion_mes_pasado: 700_000_000 }).roas_general).toBe(null);
  });

  it("ventas actuales, necesarias y brecha", () => {
    expect(c.ventas_actuales).toBe(400);
    expect(c.ventas_necesarias).toBe(800);
    expect(c.brecha_ventas).toBe(400);
  });

  it("inversión necesaria: a su CPA de hoy y a CPA objetivo", () => {
    expect(c.inversion_necesaria_actual).toBe(800 * 18_000);
    expect(c.inversion_necesaria_objetivo).toBeCloseTo(800 * 21_000, 4);
  });

  it("utilidad proyectada: las dos versiones", () => {
    expect(c.utilidad_proyectada_actual).toBe(800 * (30_000 - 18_000));
    expect(c.utilidad_proyectada_objetivo).toBeCloseTo(800 * (30_000 - 21_000), 4);
  });
});

describe("Calcúlalo por mí", () => {
  it("CPA = inversión ÷ compras", () => {
    expect(cpaDesdeCompras(6_100_000, 100)).toBe(61_000);
    expect(cpaDesdeCompras(6_100_000, 0)).toBe(null);
  });
  it("ROAS = lo que facturó la pauta ÷ inversión", () => {
    expect(roasDesdeIngresos(18_000_000, 6_000_000)).toBe(3);
    expect(roasDesdeIngresos(18_000_000, 0)).toBe(null);
  });
});

describe("2.2 · ¿conoce sus números?", () => {
  it("tres casillas: 0 = sí · 1 = a medias · 2 o 3 = no", () => {
    expect(conoceSusNumeros({}).lectura).toBe("si");
    expect(conoceSusNumeros({ recompra: true }).lectura).toBe("a_medias");
    expect(conoceSusNumeros({ recompra: true, tasa_conversion: true }).lectura).toBe("no");
    expect(conoceSusNumeros({ recompra: true, tasa_conversion: true, porcentaje_carga: true })).toEqual({ marcadas: 3, de: 3, lectura: "no" });
  });
  it("el margen ya no lleva casilla: no cuenta", () => {
    expect(conoceSusNumeros({ margen_por_producto: true, categorias_detalle: true, cpa_mes: true }).marcadas).toBe(0);
  });
});

describe("nivel", () => {
  it("BASE por debajo de 100 millones, ESCALA de 100 a 500, ÉLITE de 500 en adelante", () => {
    expect(nivelDeMeta(99_999_999).nivel).toBe("BASE");
    expect(nivelDeMeta(100_000_000).nivel).toBe("ESCALA");
    expect(nivelDeMeta(499_999_999).nivel).toBe("ESCALA");
    expect(nivelDeMeta(500_000_000).nivel).toBe("ELITE");
    expect(nivelDeMeta(1_000_000_000)).toEqual({ nivel: "ELITE", sobre_escala: false });
    expect(nivelDeMeta(null)).toBe(null);
  });
  it("por encima de 1.000 millones sigue siendo ÉLITE, con sobre_escala", () => {
    expect(nivelDeMeta(1_500_000_000)).toEqual({ nivel: "ELITE", sobre_escala: true });
  });
});

describe("señales para el equipo", () => {
  it("semáforo en rojo (menos de 15% de aire) pone la alerta", () => {
    const r = base({ cpa: 27_000 });
    expect(senales(r, calcular(r))).toMatchObject({ alerta: true, motivos: ["margen_en_rojo"] });
  });
  it("las tres casillas 'no lo sé' ponen la alerta", () => {
    const nls = { recompra: true, tasa_conversion: true, porcentaje_carga: true };
    const r = base();
    expect(senales(r, calcular(r, nls), nls).motivos).toEqual(["tres_o_mas_no_lo_se"]);
  });
  it("un CPA mayor que el ticket no se rechaza: se marca para revisar", () => {
    const r = base({ cpa: 120_000, margen: 130_000 });
    expect(senales(r, calcular(r)).paraRevisar.cpa_mes).toBe(true);
  });
  it("una marca sana no prende nada", () => {
    const r = base();
    expect(senales(r, calcular(r))).toMatchObject({ alerta: false, motivos: [] });
  });
});

describe("sin datos no inventa", () => {
  it("formulario vacío: todo null, sin NaN", () => {
    const c = calcular({});
    for (const [k, v] of Object.entries(c)) {
      if (k === "conoce_numeros") continue;
      expect(v, k).toBe(null);
    }
  });
});
