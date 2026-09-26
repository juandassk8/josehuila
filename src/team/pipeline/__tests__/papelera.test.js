import { describe, it, expect } from "vitest";
import { haceCuanto, contenidosTexto } from "../papeleraTexto.js";

// El reloj fijo: sin esto la prueba mide contra "ahora" y falla sola algún día.
const AHORA = Date.parse("2026-08-18T15:00:00Z");
const haceSegundos = (s) => new Date(AHORA - s * 1000).toISOString();

describe("haceCuanto", () => {
  it("lo recién borrado no dice '0 min'", () => {
    expect(haceCuanto(haceSegundos(3), AHORA)).toBe("recién");
    expect(haceCuanto(haceSegundos(59), AHORA)).toBe("recién");
  });

  it("minutos, horas, días y meses, cada uno en su corte", () => {
    expect(haceCuanto(haceSegundos(60), AHORA)).toBe("hace 1 min");
    expect(haceCuanto(haceSegundos(45 * 60), AHORA)).toBe("hace 45 min");
    expect(haceCuanto(haceSegundos(3600), AHORA)).toBe("hace 1 hora");
    expect(haceCuanto(haceSegundos(5 * 3600), AHORA)).toBe("hace 5 horas");
    expect(haceCuanto(haceSegundos(24 * 3600), AHORA)).toBe("hace 1 día");
    expect(haceCuanto(haceSegundos(3 * 24 * 3600), AHORA)).toBe("hace 3 días");
    expect(haceCuanto(haceSegundos(60 * 24 * 3600), AHORA)).toBe("hace 2 meses");
  });

  // Un reloj corrido en el equipo daba fechas en el futuro y salía "hace -2 min".
  it("una fecha futura no da negativos", () => {
    expect(haceCuanto(new Date(AHORA + 90_000).toISOString(), AHORA)).toBe("recién");
  });

  it("sin fecha no inventa nada", () => {
    expect(haceCuanto(null, AHORA)).toBe("");
    expect(haceCuanto("cualquier cosa", AHORA)).toBe("");
  });
});

describe("contenidosTexto", () => {
  it("distingue no saber de saber que hay cero", () => {
    expect(contenidosTexto(null)).toBe("…");
    expect(contenidosTexto(0)).toBe("0 contenidos");
  });

  it("singular y plural", () => {
    expect(contenidosTexto(1)).toBe("1 contenido");
    expect(contenidosTexto(17)).toBe("17 contenidos");
  });
});
