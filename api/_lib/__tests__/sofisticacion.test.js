import { describe, it, expect } from "vitest";
import { bloqueSofisticacion, nivelValido, NIVELES } from "../sofisticacion.js";

describe("nivelValido", () => {
  it("acepta 1 a 5 y nada más", () => {
    [1, 2, 3, 4, 5].forEach((n) => expect(nivelValido(n)).toBe(true));
    [0, 6, -1, 2.5, null, undefined, "", "tres", NaN].forEach((n) => expect(nivelValido(n)).toBe(false));
  });

  it("un número en texto sirve: viene así de la base y del select", () => {
    expect(nivelValido("3")).toBe(true);
  });
});

describe("bloqueSofisticacion", () => {
  // Sin dato NO se inventa un registro. Escribir en el nivel equivocado es peor
  // que escribir sin la regla.
  it("sin nivel cargado no dice nada", () => {
    expect(bloqueSofisticacion(null)).toBe("");
    expect(bloqueSofisticacion(undefined)).toBe("");
    expect(bloqueSofisticacion(0)).toBe("");
    expect(bloqueSofisticacion(9)).toBe("");
  });

  it("manda UN solo nivel, no los cinco", () => {
    const b = bloqueSofisticacion(3);
    expect(b).toContain("NIVEL 3 DE 5");
    expect(b).toContain(NIVELES[3].hace);
    // Los registros que NO son el suyo no aparecen desarrollados.
    expect(b).not.toContain(NIVELES[1].hace);
    expect(b).not.toContain(NIVELES[5].hace);
  });

  it("lleva qué hacer, qué evitar y un ejemplo del registro", () => {
    const b = bloqueSofisticacion(4);
    expect(b).toContain("QUÉ HACER:");
    expect(b).toContain("QUÉ EVITAR:");
    expect(b).toContain("hidroxiapatita");   // el ejemplo del nivel 4
  });

  // "Un paso adelante de la competencia", no dos.
  it("nombra el nivel siguiente sin desarrollarlo", () => {
    const b = bloqueSofisticacion(2);
    expect(b).toContain("nivel 3");
    expect(b).not.toContain(NIVELES[3].ejemplo);
  });

  it("en el nivel 5 no hay siguiente que ofrecer", () => {
    const b = bloqueSofisticacion(5);
    expect(b).toContain("NIVEL 5 DE 5");
    expect(b).not.toContain("medio paso");
  });

  it("deja claro que define el registro y no el contenido", () => {
    expect(bloqueSofisticacion(1)).toContain("REGISTRO");
  });
});
