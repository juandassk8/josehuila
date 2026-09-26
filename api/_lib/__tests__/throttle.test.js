import { describe, it, expect, beforeEach } from "vitest";
import { permitido, _reset } from "../throttle.js";

describe("permitido", () => {
  beforeEach(() => _reset());
  const T0 = 1_700_000_000_000;

  it("deja pasar el tope y frena el siguiente", () => {
    for (let i = 0; i < 3; i++) expect(permitido("a@b.com", { max: 3, ahora: T0 })).toBe(true);
    expect(permitido("a@b.com", { max: 3, ahora: T0 })).toBe(false);
  });

  it("cada clave lleva su propia cuenta", () => {
    for (let i = 0; i < 3; i++) permitido("a@b.com", { max: 3, ahora: T0 });
    expect(permitido("otro@b.com", { max: 3, ahora: T0 })).toBe(true);
  });

  it("pasada la ventana vuelve a pasar", () => {
    for (let i = 0; i < 3; i++) permitido("a@b.com", { max: 3, ventanaMs: 1000, ahora: T0 });
    expect(permitido("a@b.com", { max: 3, ventanaMs: 1000, ahora: T0 + 500 })).toBe(false);
    expect(permitido("a@b.com", { max: 3, ventanaMs: 1000, ahora: T0 + 1500 })).toBe(true);
  });

  // Mayúsculas y espacios no sirven para esquivarlo.
  it("normaliza la clave", () => {
    for (let i = 0; i < 3; i++) permitido("a@b.com", { max: 3, ahora: T0 });
    expect(permitido("  A@B.COM ", { max: 3, ahora: T0 })).toBe(false);
  });

  it("sin clave no frena a nadie", () => {
    expect(permitido("", { max: 1, ahora: T0 })).toBe(true);
    expect(permitido(null, { max: 1, ahora: T0 })).toBe(true);
  });
});
