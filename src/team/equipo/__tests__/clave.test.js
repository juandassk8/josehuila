import { describe, it, expect } from "vitest";
import { generarClave, revisarClave, textoParaMandar } from "../clave.js";

describe("la contraseña generada", () => {
  it("tiene 12 caracteres", () => {
    expect(generarClave()).toHaveLength(12);
  });

  it("no trae caracteres que se confundan al dictarla", () => {
    // I/l/1 y O/0 fuera: esta contraseña se lee por WhatsApp.
    const juntas = Array.from({ length: 200 }, generarClave).join("");
    expect(juntas).not.toMatch(/[Il1O0]/);
  });

  it("no repite", () => {
    const muchas = new Set(Array.from({ length: 500 }, generarClave));
    expect(muchas.size).toBe(500);
  });

  it("la que sale, pasa la revisión", () => {
    // Las dos mitades atadas: si alguien acorta el generador, esto se cae antes
    // de que se caiga el formulario.
    expect(revisarClave(generarClave()).ok).toBe(true);
  });
});

describe("la revisión", () => {
  it("rechaza vacía y corta", () => {
    expect(revisarClave("").ok).toBe(false);
    expect(revisarClave("   ").ok).toBe(false);
    expect(revisarClave("corta").ok).toBe(false);
  });

  it("acepta una de ocho", () => {
    expect(revisarClave("ochoocho").ok).toBe(true);
  });

  it("el error se puede mostrar tal cual", () => {
    for (const mala of ["", "corta"]) {
      expect(revisarClave(mala).error).toMatch(/\.$/);
    }
  });
});

describe("el mensaje que se copia", () => {
  it("dice de quién es", () => {
    // Cambiando dos contraseñas seguidas, esto es lo único que evita mandarle a
    // uno la del otro.
    const t = textoParaMandar({ nombre: "Deison", email: "deison@inforce.team", clave: "abc123xyz789" });
    expect(t).toContain("Deison");
    expect(t).toContain("deison@inforce.team");
    expect(t).toContain("abc123xyz789");
  });

  it("aguanta que no haya nombre", () => {
    const t = textoParaMandar({ email: "x@y.com", clave: "abc123xyz789" });
    expect(t).toContain("Inforce Central");
    expect(t).not.toContain("undefined");
  });
});
