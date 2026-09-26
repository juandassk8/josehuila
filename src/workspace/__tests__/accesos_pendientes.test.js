import { describe, it, expect } from "vitest";
import { accesosPendientes, textoAccesosPendientes } from "../accesos_pendientes.js";

const persona = (extra) => ({ name: "Alguien", email: "a@b.com", auth_user_id: "u1", ...extra });

describe("accesosPendientes", () => {
  it("los pools de UGC nunca cuentan", () => {
    const r = accesosPendientes([
      persona({ name: "UGCs externos", is_ugc_pool: true, auth_user_id: null, email: null }),
      persona({ name: "Jose", auth_user_id: null }),
    ]);
    expect(r.total).toBe(1);
    expect(r.conCorreo[0].name).toBe("Jose");
  });

  it("quien ya entra no aparece", () => {
    expect(accesosPendientes([persona(), persona()]).total).toBe(0);
  });

  // Son dos arreglos distintos: a uno se le crea la clave, al otro hay que
  // pedirle el correo primero.
  it("separa a quien tiene correo de quien no", () => {
    const r = accesosPendientes([
      persona({ name: "Con", auth_user_id: null }),
      persona({ name: "Sin", auth_user_id: null, email: "" }),
      persona({ name: "Nulo", auth_user_id: null, email: null }),
    ]);
    expect(r.conCorreo.map((m) => m.name)).toEqual(["Con"]);
    expect(r.sinCorreo.map((m) => m.name)).toEqual(["Sin", "Nulo"]);
  });

  it("un correo de solo espacios cuenta como sin correo", () => {
    expect(accesosPendientes([persona({ auth_user_id: null, email: "   " })]).sinCorreo).toHaveLength(1);
  });
});

describe("textoAccesosPendientes", () => {
  it("sin pendientes no dice nada", () => {
    expect(textoAccesosPendientes([persona()])).toBe("");
    expect(textoAccesosPendientes([])).toBe("");
  });

  it("nombra al dueño, que es el caso grave", () => {
    const t = textoAccesosPendientes([persona({ name: "Sergio", auth_user_id: null, is_owner: true })]);
    expect(t).toContain("1 persona está cargada");
    expect(t).toContain("el dueño (Sergio)");
    expect(t).toContain("crear la credencial");
  });

  // El caso real de Bh Kids: cuatro fichas, ninguna con correo.
  it("si a ninguna le falta solo la clave, manda a pedir el correo", () => {
    const t = textoAccesosPendientes([
      persona({ name: "Jose", auth_user_id: null, email: null, is_owner: true }),
      persona({ name: "Jul", auth_user_id: null, email: null }),
      persona({ name: "UGCs", auth_user_id: null, email: null, is_ugc_pool: true }),
    ]);
    expect(t).toContain("2 personas están cargadas");
    expect(t).toContain("Ninguna tiene correo cargado");
    expect(t).not.toContain("UGCs");
  });

  it("mezcla: dice cuántas de las que faltan no tienen correo", () => {
    const t = textoAccesosPendientes([
      persona({ name: "A", auth_user_id: null }),
      persona({ name: "B", auth_user_id: null, email: null }),
    ]);
    expect(t).toContain("1 no tiene correo cargado");
  });
});
