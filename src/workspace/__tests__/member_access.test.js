import { describe, it, expect } from "vitest";
import { allowedNavForMember, memberCanAccess, NAV_KEYS } from "../member_access.js";
import { puedeGenerarGuiones } from "../../../api/_lib/guionista.js";

// Quién puede entrar a qué dentro del workspace de un cliente.
//
// Esto se testea porque el portal se estaba contradiciendo: el menú lateral le
// mostraba "Content Pipeline" al editor —lo decide este archivo— y la pantalla
// le respondía "Coming Soon", porque el render estaba gateado por `isAdmin`.
// Johan abría su tarea de edición y no tenía dónde ver el video.

const johan = { name: "Johan", roles: ["editor"] };
const alejandro = { name: "Alejandro", roles: ["editor", "content"] };
const daniel = { name: "Daniel", roles: ["project_manager"] };
const steven = { name: "Steven", roles: ["trafficker"] };
const allison = { name: "Allison", roles: ["designer"] };

describe("el equipo entra al Content Pipeline", () => {
  it("el editor, que es quien edita los videos", () => {
    expect(memberCanAccess(johan, "pipeline")).toBe(true);
  });

  it("el trafficker, cuyas tareas SON etapas del pipeline", () => {
    // "Publicar y optimizar" y "Recoger feedback" salen de campaign/feedback.
    expect(memberCanAccess(steven, "pipeline")).toBe(true);
  });

  it("el diseñador y el project manager", () => {
    expect(memberCanAccess(allison, "pipeline")).toBe(true);
    expect(memberCanAccess(daniel, "pipeline")).toBe(true);
  });

  it("y todos ven sus Tareas", () => {
    for (const m of [johan, alejandro, daniel, steven, allison]) {
      expect(memberCanAccess(m, "tareas")).toBe(true);
    }
  });
});

describe("lo que sigue cerrado", () => {
  it("el editor no ve reportes ni despliegue", () => {
    expect(memberCanAccess(johan, "reportes")).toBe(false);
    expect(memberCanAccess(johan, "despliegue")).toBe(false);
  });

  it("el diseñador tampoco", () => {
    expect(memberCanAccess(allison, "reportes")).toBe(false);
  });
});

describe("los accesos se suman entre roles", () => {
  it("quien tiene dos roles ve la unión de los dos", () => {
    // Es justo lo que le pasaba a Johan con el rol "content" de más.
    const soloEditor = allowedNavForMember(johan);
    const editorYContent = allowedNavForMember(alejandro);
    for (const k of soloEditor) expect(editorYContent).toContain(k);
    expect(editorYContent).toContain("plan");   // lo aporta `content`
  });
});

describe("quien manda ve todo", () => {
  it("el dueño de la empresa", () => {
    expect(allowedNavForMember({ is_owner: true, roles: [] })).toEqual(NAV_KEYS);
  });

  it("el equipo interno de Inforce, que tiene `role` en singular", () => {
    expect(allowedNavForMember({ role: "admin", name: "Jose" })).toEqual(NAV_KEYS);
  });

  it("el admin en preview, que entra sin fila de miembro", () => {
    // `currentMember` queda en null a propósito para no recortarle el menú.
    expect(allowedNavForMember(null)).toEqual(NAV_KEYS);
    expect(memberCanAccess(null, "pipeline")).toBe(true);
  });
});

describe("alguien sin ningún rol", () => {
  it("al menos ve Resumen, Content Pipeline, Tareas y Equipo, no una pantalla vacía", () => {
    const nav = allowedNavForMember({ name: "Nuevo", roles: [] });
    expect(nav).toEqual(["home", "pipeline", "adlibrary", "crear-imagenes", "tareas", "equipo"]);
  });

  // La ficha del propio cliente suele quedar sin roles, y así entraba al
  // Content Pipeline y se topaba con un "Coming Soon" de algo que sí existe.
  it("entra al Content Pipeline igual", () => {
    expect(memberCanAccess({ name: "Cliente", roles: [] }, "pipeline")).toBe(true);
  });
});

describe("quién puede pedirle guiones a la IA", () => {
  it("la empresa habilitada, entre cualquiera", () => {
    expect(puedeGenerarGuiones({ companyId: "1776898591543", esInforce: false })).toBe(true);
    expect(puedeGenerarGuiones({ companyId: "otra", slug: "peluna-pets", esInforce: false })).toBe(true);
  });

  // Gastar tokens del pool de una cuenta que no lo tiene habilitado es del
  // equipo, que sabe lo que cuesta.
  it("el equipo de Inforce, en cualquier empresa", () => {
    expect(puedeGenerarGuiones({ companyId: "otra", slug: "bh-kids", esInforce: true })).toBe(true);
  });

  it("un cliente de otra empresa, no", () => {
    expect(puedeGenerarGuiones({ companyId: "otra", slug: "bh-kids", esInforce: false })).toBe(false);
    expect(puedeGenerarGuiones({})).toBe(false);
  });
});
