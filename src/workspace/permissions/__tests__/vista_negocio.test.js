import { describe, it, expect } from "vitest";
import { puedeVerNumerosDelNegocio } from "../vista_negocio.js";

// El caso que originó la regla: Johan abre el portal a editar y lo primero que
// veía era cuánto factura el cliente.
const johan = { member: { roles: ["editor"] } };
const disenador = { member: { roles: ["designer"] } };
const trafficker = { member: { roles: ["trafficker"] } };
const pm = { member: { roles: ["project_manager"] } };
const duenio = { member: { is_owner: true, roles: [] } };
const copy = { member: { roles: ["copywriter"] } };

describe("puedeVerNumerosDelNegocio", () => {
  it("los ve quien los necesita para trabajar", () => {
    expect(puedeVerNumerosDelNegocio(trafficker)).toBe(true);   // es su trabajo
    expect(puedeVerNumerosDelNegocio(pm)).toBe(true);
    expect(puedeVerNumerosDelNegocio(duenio)).toBe(true);
  });

  it("no los ve quien entra a ejecutar", () => {
    expect(puedeVerNumerosDelNegocio(johan)).toBe(false);
    expect(puedeVerNumerosDelNegocio(disenador)).toBe(false);
    expect(puedeVerNumerosDelNegocio(copy)).toBe(false);
  });

  it("el equipo de Inforce los ve, entre por donde entre", () => {
    expect(puedeVerNumerosDelNegocio({ esInforce: true, member: null })).toBe(true);
    expect(puedeVerNumerosDelNegocio({ esInforce: true, member: johan.member })).toBe(true);
  });

  it("quien tiene varios roles suma: alcanza con uno que califique", () => {
    expect(puedeVerNumerosDelNegocio({ member: { roles: ["editor", "trafficker"] } })).toBe(true);
  });

  it("sin datos, no", () => {
    expect(puedeVerNumerosDelNegocio()).toBe(false);
    expect(puedeVerNumerosDelNegocio({})).toBe(false);
    expect(puedeVerNumerosDelNegocio({ member: { roles: null } })).toBe(false);
  });
});
