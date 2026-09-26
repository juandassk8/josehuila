import { describe, it, expect } from "vitest";
import {
  catalogo, LLAMADAS, llamadaDe, puedeEditar, puntosDe, noAplica, estaCalificado,
  progresoDimension, progresoLlamada, notaDimension, datosDelFormulario, calculadoPara, pasosDe, primerPasoPendiente,
} from "../estandar.js";

describe("el catálogo sale completo del Estándar", () => {
  it("diez dimensiones, 111 puntos y 4 aspiracionales", () => {
    expect(catalogo.dimensiones.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(catalogo.dimensiones.reduce((n, d) => n + d.puntos.length, 0)).toBe(111);
    expect(catalogo.aspiracional.puntos.map((p) => p.id)).toEqual(["A.1", "A.2", "A.3", "A.4"]);
  });
  it("ningún id repetido, y todo punto dice cómo se califica", () => {
    const ids = catalogo.dimensiones.flatMap((d) => d.puntos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of catalogo.dimensiones) for (const p of d.puntos) {
      expect(["1_10", "si_no", "descripcion", "otro"], p.id).toContain(p.califica);
      expect(p.id.startsWith(`${d.n}.`), p.id).toBe(true);
    }
  });
  it("todo punto de 1 a 10 que se califica en vivo trae escrito qué es un 10 y qué es un 1", () => {
    // El 2.1 no: no lo califica nadie, sale calculado del formulario.
    const sinAncla = catalogo.dimensiones.flatMap((d) => d.puntos).filter((p) => p.califica === "1_10" && p.origen !== "calculado" && (!p.diez || !p.uno)).map((p) => p.id);
    expect(sinAncla).toEqual([]);
  });
});

describe("quién llena qué", () => {
  it("las tres llamadas cubren las diez dimensiones, sin repetir", () => {
    const todas = LLAMADAS.flatMap((l) => l.dimensiones).sort((a, b) => a - b);
    expect(todas).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("el reparto es el del mapa del Estándar", () => {
    for (const l of LLAMADAS) for (const n of l.dimensiones) {
      expect(catalogo.dimensiones.find((d) => d.n === n).audita, `D${n}`).toBe(l.quien);
    }
  });
  it("cada uno edita lo suyo; un admin puede corregir cualquiera", () => {
    const deison = { name: "Deison", role: "member" };
    expect(llamadaDe(deison).id).toBe("deison");
    expect(puedeEditar(deison, 5)).toBe(true);
    expect(puedeEditar(deison, 3)).toBe(false);
    expect(llamadaDe({ name: "Jose", role: "admin" }).id).toBe("jose");
    expect(puedeEditar({ name: "Nath", role: "admin" }, 3)).toBe(true);
    expect(puedeEditar({ name: "Johan", role: "member" }, 4)).toBe(false);
    expect(puedeEditar(null, 1)).toBe(false);
  });
});

describe("los puntos condicionales se ocultan solos", () => {
  it("marca aspiracional: el 1.5 y el 1.9 no aplican, y entran A.1–A.4", () => {
    expect(noAplica("1.5", { tipoMarca: "aspiracional" })).toBeTruthy();
    expect(noAplica("1.9", { tipoMarca: "aspiracional" })).toBeTruthy();
    expect(noAplica("1.5", { tipoMarca: "marca_propia" })).toBe(null);
    expect(puntosDe(1, { aspiracional: true }).map((p) => p.id)).toContain("A.1");
    expect(puntosDe(1).map((p) => p.id)).not.toContain("A.1");
    expect(noAplica("A.2", { tipoMarca: "marca_propia" })).toBeTruthy();
  });
  it("el 1.9 solo aplica si el grueso del mercado está en conciencia 1–2", () => {
    const con = (distribucion) => ({ tipoMarca: "marca_propia", notas: { "1.7": { calificacion: { distribucion } } } });
    expect(noAplica("1.9", con([40, 30, 20, 5, 5]))).toBe(null);
    expect(noAplica("1.9", con([5, 10, 40, 30, 15]))).toBeTruthy();
    expect(noAplica("1.9", { tipoMarca: "marca_propia" })).toBe(null);   // sin 1.7 todavía, se muestra
  });
  it("el 8.1 en No apaga incentivos y canales (8.6–8.8), pero no el AOV", () => {
    const ctx = { notas: { "8.1": { calificacion: { si: false } } } };
    expect(noAplica("8.6", ctx)).toBeTruthy();
    expect(noAplica("8.8", ctx)).toBeTruthy();
    expect(noAplica("8.4", ctx)).toBe(null);
    expect(noAplica("8.6", { notas: { "8.1": { calificacion: { si: true } } } })).toBe(null);
  });
  it("lo que no aplica no cuenta en el progreso", () => {
    const base = progresoDimension(8, {});
    const sinRecompra = progresoDimension(8, { notas: { "8.1": { calificacion: { si: false } } } });
    expect(base.total).toBe(13);
    expect(sinRecompra.total).toBe(10);
    expect(sinRecompra.ocultos).toBe(3);
  });
});

describe("progreso y nota", () => {
  it("un punto está calificado cuando tiene lo que su tipo pide", () => {
    expect(estaCalificado({ califica: "1_10" }, { calificacion: { nota: 7 } })).toBe(true);
    expect(estaCalificado({ califica: "1_10" }, { descripcion: "solo texto" })).toBe(false);
    expect(estaCalificado({ califica: "si_no" }, { calificacion: { si: false } })).toBe(true);
    expect(estaCalificado({ califica: "descripcion" }, { descripcion: "  " })).toBe(false);
    expect(estaCalificado({ califica: "descripcion" }, { descripcion: "Vende por WhatsApp" })).toBe(true);
    expect(estaCalificado({ califica: "1_10" }, undefined)).toBe(false);
  });
  it("la nota de la dimensión es el promedio de lo ya calificado", () => {
    const notas = { "1.1": { calificacion: { nota: 8 } }, "1.2": { calificacion: { nota: 4 } } };
    expect(notaDimension(1, { notas })).toBe(6);
    expect(notaDimension(1, {})).toBe(null);
  });
  it("el progreso de la llamada suma sus dimensiones", () => {
    const nath = LLAMADAS.find((l) => l.id === "nath");
    expect(progresoLlamada(nath, {})).toEqual({ total: 27, hechos: 0 });
  });
});

describe("lo que ya dijo el cliente en el formulario", () => {
  const perfil = [
    { campo: "productos_principales", puntos_estandar: ["1.0", "2.0"], valor: [] },
    { campo: "rentabilidad_neta", puntos_estandar: ["2.1"], valor: {} },
    { campo: "tasa_conversion", puntos_estandar: ["6.1", "2.2"], valor: 1.8 },
    { campo: "salud_margen", puntos_estandar: ["2.1"], valor: { aire: 0.47, semaforo: "verde" } },
    { campo: "conoce_numeros", puntos_estandar: ["2.2"], valor: { marcadas: 1, de: 3, lectura: "a_medias" } },
  ];
  it("por punto y por dimensión, con los datos de base N.0", () => {
    expect(datosDelFormulario(perfil, { punto: "6.1" }).map((f) => f.campo)).toEqual(["tasa_conversion"]);
    expect(datosDelFormulario(perfil, { dimension: 1 }).map((f) => f.campo)).toEqual(["productos_principales"]);
    expect(datosDelFormulario(perfil, { dimension: 10 })).toEqual([]);
  });
  it("el 2.1 y el 2.2 salen calculados del formulario", () => {
    expect(calculadoPara("2.1", perfil).semaforo).toBe("verde");
    expect(calculadoPara("2.2", perfil).lectura).toBe("a_medias");
    expect(calculadoPara("3.1", perfil)).toBe(null);
  });
});

describe("paso a paso: de a pocas fichas, no una lista de catorce", () => {
  it("un paso por sección, y las secciones largas se parten en tandas de tres", () => {
    const pasos = pasosDe(puntosDe(3));
    expect(pasos.every((x) => x.puntos.length <= 3)).toBe(true);
    expect(pasos.flatMap((x) => x.puntos.map((p) => p.id))).toEqual(puntosDe(3).map((p) => p.id));
    expect(pasos[0].seccion).toMatch(/ÁNGULOS/);
  });
  it("una dimensión sin secciones también se parte", () => {
    expect(pasosDe(puntosDe(1)).length).toBe(4);      // 11 puntos → 3+3+3+2
  });
  it("retoma en el primer paso con algo pendiente", () => {
    const pasos = pasosDe(puntosDe(1));
    const notas = { "1.1": { calificacion: { nota: 8 } }, "1.2": { calificacion: { nota: 4 } }, "1.3": { calificacion: { nota: 6 } } };
    expect(primerPasoPendiente(pasos, notas)).toBe(1);
    expect(primerPasoPendiente(pasos, {})).toBe(0);
  });
});
