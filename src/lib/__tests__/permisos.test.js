import { describe, it, expect } from "vitest";
import { esDeInforce, puedeGestionarWorkspace, puedeRepartirCredenciales } from "../permisos.js";

// El caso que originó esto: José entraba a /cliente/<empresa>/despliegue y veía
// "Solo lectura" sobre datos que la base sí lo dejaba borrar.
const jose = { authMode: "client", esAdminPreview: true };          // Inforce por la puerta del cliente
const joseAdmin = { authMode: "admin", esAdminPreview: false };     // Inforce por /admin
const duenio = { authMode: "client", esAdminPreview: false, member: { is_owner: true, roles: [] } };
const pm = { authMode: "client", esAdminPreview: false, member: { roles: ["project_manager"] } };
const editor = { authMode: "client", esAdminPreview: false, member: { roles: ["editor"] } };
const anonimo = { authMode: "client", esAdminPreview: false, member: null };

describe("esDeInforce", () => {
  it("no depende de por qué puerta entró", () => {
    // Es la corrección: la misma persona, dos URLs, mismos permisos.
    expect(esDeInforce(joseAdmin)).toBe(true);
    expect(esDeInforce(jose)).toBe(true);
  });

  it("un cliente no lo es, tenga el rol que tenga", () => {
    expect(esDeInforce(duenio)).toBe(false);
    expect(esDeInforce(pm)).toBe(false);
    expect(esDeInforce(editor)).toBe(false);
  });

  it("aguanta que no le pasen nada", () => {
    expect(esDeInforce()).toBe(false);
    expect(esDeInforce({})).toBe(false);
  });
});

describe("puedeGestionarWorkspace", () => {
  it("Inforce gestiona cualquier empresa, entre por donde entre", () => {
    expect(puedeGestionarWorkspace(jose)).toBe(true);
    expect(puedeGestionarWorkspace(joseAdmin)).toBe(true);
  });

  it("del lado del cliente, quien la posee y quien la coordina", () => {
    expect(puedeGestionarWorkspace(duenio)).toBe(true);
    expect(puedeGestionarWorkspace(pm)).toBe(true);
  });

  it("los demás roles del cliente, no", () => {
    expect(puedeGestionarWorkspace(editor)).toBe(false);
    expect(puedeGestionarWorkspace(anonimo)).toBe(false);
  });

  it("sin la bandera de preview, el admin en el portal del cliente queda afuera", () => {
    // Esto es lo que pasaba ANTES del arreglo, y es lo que tiene que seguir
    // pasando si la bandera está apagada: un cliente que hereda la pantalla de
    // un admin que se fue no puede quedarse con sus permisos.
    expect(puedeGestionarWorkspace({ authMode: "client", esAdminPreview: false, member: null })).toBe(false);
  });
});

describe("puedeRepartirCredenciales", () => {
  it("Inforce, siempre", () => {
    expect(puedeRepartirCredenciales(jose)).toBe(true);
    expect(puedeRepartirCredenciales(joseAdmin)).toBe(true);
  });

  it("el dueño de la empresa, sí", () => {
    expect(puedeRepartirCredenciales(duenio)).toBe(true);
  });

  // La diferencia con `puedeGestionarWorkspace`, y la razón de que exista esta
  // función: el PM arma el equipo y le pone roles, pero una credencial es una
  // llave que sale de la cuenta y de eso responde el dueño.
  it("el project manager NO, aunque gestione todo lo demás", () => {
    expect(puedeGestionarWorkspace(pm)).toBe(true);
    expect(puedeRepartirCredenciales(pm)).toBe(false);
  });

  it("ningún otro rol, ni nadie sin ficha", () => {
    expect(puedeRepartirCredenciales(editor)).toBe(false);
    expect(puedeRepartirCredenciales(anonimo)).toBe(false);
    expect(puedeRepartirCredenciales()).toBe(false);
  });
});
