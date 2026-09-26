import { describe, it, expect } from "vitest";
import { mensajeErrorMiembro, limitarNumero } from "../errores_miembro.js";

describe("mensajeErrorMiembro", () => {
  // El caso real: un dueño carga dos veces a la misma persona.
  it("el correo repetido deja de ser jerga de Postgres", () => {
    const m = mensajeErrorMiembro({
      code: "23505",
      message: 'duplicate key value violates unique constraint "company_team_members_email_uniq"',
    });
    expect(m).not.toMatch(/constraint|duplicate key/i);
    expect(m).toContain("Ya hay alguien en este equipo con ese correo");
    // El mensaje tiene que decir qué hacer, no solo qué pasó.
    expect(m).toContain("editá su ficha");
  });

  // Supabase no siempre manda `code`, según por dónde salga el error.
  it("lo reconoce por el texto cuando no viene el código", () => {
    const m = mensajeErrorMiembro({ message: 'duplicate key value violates unique constraint "x"' });
    expect(m).toContain("Ya hay alguien en este equipo");
  });

  it("traduce RLS, cumpleaños y falta de conexión", () => {
    expect(mensajeErrorMiembro({ code: "42501" })).toContain("no tiene permiso");
    expect(mensajeErrorMiembro({ message: "new row violates row-level security policy" })).toContain("no tiene permiso");
    expect(mensajeErrorMiembro({ code: "23514" })).toContain("día va de 1 a 31");
    expect(mensajeErrorMiembro({ message: "TypeError: Failed to fetch" })).toContain("Se cortó la conexión");
  });

  // Un error que no está en el repertorio conserva su texto: para un caso raro,
  // el mensaje del motor ayuda más que un "algo salió mal".
  it("lo desconocido pasa tal cual", () => {
    expect(mensajeErrorMiembro({ message: "algo muy raro pasó" })).toBe("algo muy raro pasó");
    expect(mensajeErrorMiembro(null)).toBe("No se pudo guardar.");
  });
});

describe("limitarNumero", () => {
  it("recorta lo que la base no acepta", () => {
    expect(limitarNumero("45", 1, 31)).toBe("31");
    expect(limitarNumero("99", 1, 12)).toBe("12");
    expect(limitarNumero("0", 1, 31)).toBe("1");
  });

  it("deja pasar lo válido y el campo vacío", () => {
    expect(limitarNumero("15", 1, 31)).toBe("15");
    expect(limitarNumero("", 1, 31)).toBe("");
    expect(limitarNumero(null, 1, 31)).toBe("");
  });

  it("ignora lo que no sea número", () => {
    expect(limitarNumero("2a", 1, 31)).toBe("2");
    expect(limitarNumero("abc", 1, 31)).toBe("");
  });
});
