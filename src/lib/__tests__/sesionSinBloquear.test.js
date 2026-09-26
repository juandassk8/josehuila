import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// El caso real: otra pestaña se queda con el candado de `navigator.locks` y
// `getSession()` NO RESUELVE NUNCA —no falla, espera—. El arranque del portal la
// esperaba, así que el cliente veía el spinner para siempre.
const SESION = { access_token: "tok", user: { id: "u1", email: "brahian@x.com" } };

describe("getSessionSinBloquear", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.localStorage = {
      _d: {},
      getItem(k) { return this._d[k] ?? null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const cargar = async (getSession) => {
    vi.doMock("../localClient.js", () => ({
      createClient: () => ({ auth: { getSession } }),
    }));
    return (await import("../backend.js")).getSessionSinBloquear;
  };

  it("si el candado no suelta, no espera: lee la sesión del storage", async () => {
    localStorage.setItem("inforce-local-auth", JSON.stringify(SESION));
    const colgada = () => new Promise(() => {});   // nunca resuelve
    const fn = await cargar(colgada);
    const res = await fn(30);
    expect(res.data.session.user.id).toBe("u1");
    expect(res.agotado).toBe(true);
  });

  it("sin nada en el storage, devuelve null en vez de colgarse", async () => {
    const fn = await cargar(() => new Promise(() => {}));
    const res = await fn(30);
    expect(res.data.session).toBe(null);
  });

  it("cuando responde a tiempo, gana la respuesta de verdad", async () => {
    const fn = await cargar(async () => ({ data: { session: SESION } }));
    const res = await fn(1000);
    expect(res.data.session).toEqual(SESION);
    expect(res.agotado).toBe(false);
  });

  it("aguanta el formato viejo con currentSession adentro", async () => {
    localStorage.setItem("inforce-local-auth", JSON.stringify({ currentSession: SESION }));
    const fn = await cargar(() => new Promise(() => {}));
    expect((await fn(30)).data.session.user.email).toBe("brahian@x.com");
  });

  it("un storage corrupto no rompe el arranque", async () => {
    localStorage.setItem("inforce-local-auth", "{no es json");
    const fn = await cargar(() => new Promise(() => {}));
    expect((await fn(30)).data.session).toBe(null);
  });
});
