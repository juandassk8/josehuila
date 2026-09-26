import { describe, it, expect, beforeEach } from "vitest";
import { leerPrefs, guardarPrefs, prefsKey, resolverQuien } from "../tasksPrefs.js";

// localStorage de mentira: la lógica no depende del navegador.
function almacenFalso(inicial = {}) {
  const data = { ...inicial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const EMPRESA = "peluna";
const YO = "member-johan";

describe("prefsKey", () => {
  it("separa por empresa Y por persona", () => {
    // Dos personas en el mismo computador no se pisan la vista.
    expect(prefsKey(EMPRESA, YO)).not.toBe(prefsKey(EMPRESA, "member-daniel"));
    expect(prefsKey(EMPRESA, YO)).not.toBe(prefsKey("otra", YO));
  });
});

describe("leerPrefs / guardarPrefs", () => {
  let s;
  beforeEach(() => { s = almacenFalso(); });

  it("sin nada guardado devuelve el default", () => {
    expect(leerPrefs(EMPRESA, YO, s)).toEqual({ vista: "estado", quien: null, dias: {}, span: 7 });
  });

  it("guarda y devuelve lo mismo", () => {
    guardarPrefs(EMPRESA, YO, { vista: "persona", quien: [YO], dias: { estado: ["2026-08-06"] }, span: 14 }, s);
    expect(leerPrefs(EMPRESA, YO, s)).toEqual({
      vista: "persona", quien: [YO], dias: { estado: ["2026-08-06"] }, span: 14,
    });
  });

  it("guarda los días POR VISTA, cada una la suya", () => {
    guardarPrefs(EMPRESA, YO, { vista: "estado", quien: [], dias: { estado: ["2026-08-06"], persona: ["2026-08-10"] }, span: 7 }, s);
    const p = leerPrefs(EMPRESA, YO, s);
    expect(p.dias.estado).toEqual(["2026-08-06"]);
    expect(p.dias.persona).toEqual(["2026-08-10"]);
  });

  it("NO guarda los días de 'Por fecha'", () => {
    // Ahí los días son las columnas: la vista abre siempre en la semana.
    guardarPrefs(EMPRESA, YO, { vista: "fecha", quien: [], dias: { fecha: ["2026-08-06"] }, span: 7 }, s);
    expect(leerPrefs(EMPRESA, YO, s).dias.fecha).toBeUndefined();
  });

  it("distingue 'nunca eligió' de 'eligió ver todo'", () => {
    guardarPrefs(EMPRESA, YO, { vista: "estado", quien: [], dias: {}, span: 7 }, s);
    expect(leerPrefs(EMPRESA, YO, s).quien).toEqual([]);   // eligió Todos
    expect(leerPrefs(EMPRESA, "otro", s).quien).toBeNull(); // nunca eligió
  });

  it("aguanta basura guardada sin tumbar el tablero", () => {
    const roto = almacenFalso({ [prefsKey(EMPRESA, YO)]: "{no es json" });
    expect(leerPrefs(EMPRESA, YO, roto).vista).toBe("estado");

    const raro = almacenFalso({ [prefsKey(EMPRESA, YO)]: JSON.stringify({ vista: "galaxia", quien: "yo", span: 999 }) });
    expect(leerPrefs(EMPRESA, YO, raro)).toEqual({ vista: "estado", quien: null, dias: {}, span: 7 });
  });

  it("sin almacenamiento sigue funcionando", () => {
    expect(leerPrefs(EMPRESA, YO, null).vista).toBe("estado");
    expect(() => guardarPrefs(EMPRESA, YO, { vista: "estado" }, null)).not.toThrow();
  });
});

describe("resolverQuien", () => {
  const equipo = [{ id: YO }, { id: "member-daniel" }];

  it("la primera vez arranca en lo mío", () => {
    expect(resolverQuien({ quien: null }, YO, equipo)).toEqual([YO]);
  });

  it("respeta lo que ya elegiste, aunque sea 'todos'", () => {
    expect(resolverQuien({ quien: [] }, YO, equipo)).toEqual([]);
    expect(resolverQuien({ quien: ["member-daniel"] }, YO, equipo)).toEqual(["member-daniel"]);
  });

  it("espera al equipo antes de decidir", () => {
    // Sin la espera, un arranque rápido guardaría "Todos" como si lo hubieras
    // elegido vos, y ya nunca volvería a abrir en lo tuyo.
    expect(resolverQuien({ quien: null }, YO, [])).toBeNull();
    expect(resolverQuien({ quien: null }, YO, undefined)).toBeNull();
  });

  it("si no sos del equipo de esta empresa, muestra todo", () => {
    expect(resolverQuien({ quien: null }, "admin-de-afuera", equipo)).toEqual([]);
    expect(resolverQuien({ quien: null }, null, equipo)).toEqual([]);
  });
});
