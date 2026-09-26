import { describe, it, expect } from "vitest";
import { usuarioDeAcceso, claveDeAcceso } from "../acceso.js";

describe("el usuario del portal: marca + nombre @inforce.team", () => {
  it("La Milenaria + José → lamilenaria.jose@inforce.team", () => {
    expect(usuarioDeAcceso("La Milenaria", "José")).toBe("lamilenaria.jose@inforce.team");
    expect(usuarioDeAcceso("Gomibox", "Camilo")).toBe("gomibox.camilo@inforce.team");
  });
  it("solo el primer nombre, sin tildes, eñes ni símbolos", () => {
    expect(usuarioDeAcceso("Peluna Pets S.A.S.", "María José Núñez")).toBe("pelunapetssas.maria@inforce.team");
  });
  it("la ñ pasa a n", () => {
    expect(usuarioDeAcceso("Doña Piña", "Íñigo")).toBe("donapina.inigo@inforce.team");
  });
  it("si ya existe, el siguiente intento lleva número", () => {
    expect(usuarioDeAcceso("Gomibox", "Camilo", 1)).toBe("gomibox.camilo2@inforce.team");
  });
  it("nunca sale vacío", () => {
    expect(usuarioDeAcceso("", "")).toBe("marca.socio@inforce.team");
  });
});

describe("la contraseña", () => {
  const azar = (n) => Array.from({ length: n }, (_, i) => i * 7);
  it("la marca adelante y ocho caracteres al azar", () => {
    const c = claveDeAcceso("La Milenaria", azar);
    expect(c).toMatch(/^La-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(claveDeAcceso("Gomibox", azar)).toMatch(/^Gomibox-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it("sin caracteres que se confundan", () => {
    const todos = (n) => Array.from({ length: n }, (_, i) => i);
    expect(claveDeAcceso("x", todos)).not.toMatch(/[01OIl]/);
  });
  it("no se puede adivinar desde el usuario: cambia con el azar", () => {
    expect(claveDeAcceso("Gomibox", azar)).not.toBe(claveDeAcceso("Gomibox", (n) => Array.from({ length: n }, (_, i) => i * 11 + 3)));
  });
});
