import { describe, it, expect } from "vitest";
import { miembroActivo } from "../useTeamAuth.js";

// El caso real: Johan figura en `team_members` como editor DESACTIVADO. La
// pantalla lo dejaba entrar a Inforce Central y la base no le devolvía una sola
// fila —`is_team_member()` sí exige `active`—, así que veía su nombre arriba y
// todo lo demás en blanco.
describe("miembroActivo", () => {
  it("un desactivado no es del equipo acá", () => {
    expect(miembroActivo({ id: "1", name: "Johan", role: "editor", active: false })).toBe(null);
  });

  it("un activo pasa tal cual", () => {
    const row = { id: "2", name: "Nath", role: "admin", active: true };
    expect(miembroActivo(row)).toBe(row);
  });

  // Las filas viejas no tienen la columna. `is_team_admin()` las trata como
  // activas (`coalesce(active, true)`) y acá tiene que decir lo mismo, o la
  // interfaz y los datos se vuelven a contradecir.
  it("sin el campo, se asume activo — igual que en la base", () => {
    const row = { id: "3", name: "Jose", role: "admin" };
    expect(miembroActivo(row)).toBe(row);
  });

  it("aguanta que no haya fila", () => {
    expect(miembroActivo(null)).toBe(null);
    expect(miembroActivo(undefined)).toBe(null);
  });
});
