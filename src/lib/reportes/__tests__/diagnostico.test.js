import { describe, it, expect } from "vitest";
import {
  diagnosticarCadena, frecuencia, senalDeFatiga, nivelDeFatiga, queHacer, UMBRALES_CURSO,
} from "../diagnostico.js";

// Una cadena entera sana, para ir rompiendo un eslabón por vez.
const SANA = {
  hookRate: 0.35, holdRate: 0.20, ctr: 0.02,
  cargaPagina: 0.90, pagosIniciados: 0.10, pagosIniciadosEsperado: 0.05,
  conversionCheckout: 0.55,
};

describe("diagnosticarCadena", () => {
  it("con todo sano no señala nada y concluye que es del negocio", () => {
    const r = diagnosticarCadena(SANA);
    expect(r.primerRoto).toBeNull();
    expect(r.cadenaCompleta).toBe(true);
    expect(r.conclusion).toBe("negocio");
  });

  // Lo esencial de la clase: se lee EN ORDEN y se para en el primero.
  it("para en el PRIMER roto, aunque haya otros más abajo", () => {
    const r = diagnosticarCadena({ ...SANA, hookRate: 0.10, conversionCheckout: 0.05 });
    expect(r.primerRoto.key).toBe("hook");
    expect(r.primerRoto.accion).toContain("3 primeros segundos");
  });

  it("cada eslabón manda a arreglar su pieza, no todo el anuncio", () => {
    expect(diagnosticarCadena({ ...SANA, holdRate: 0.05 }).primerRoto.key).toBe("hold");
    expect(diagnosticarCadena({ ...SANA, ctr: 0.004 }).primerRoto.key).toBe("clic");
    expect(diagnosticarCadena({ ...SANA, cargaPagina: 0.5 }).primerRoto.key).toBe("carga");
    expect(diagnosticarCadena({ ...SANA, conversionCheckout: 0.1 }).primerRoto.key).toBe("checkout");
  });

  it("distingue el tramo: el anuncio de la web", () => {
    expect(diagnosticarCadena({ ...SANA, ctr: 0.004 }).primerRoto.tramo).toBe("anuncio");
    expect(diagnosticarCadena({ ...SANA, cargaPagina: 0.5 }).primerRoto.tramo).toBe("web");
  });

  // Lo que más importa hoy: el Tramo 2 no viene en la exportación de Meta.
  it("un eslabón sin datos NO se saltea en silencio", () => {
    const soloAnuncio = { hookRate: 0.35, holdRate: 0.20, ctr: 0.02 };
    const r = diagnosticarCadena(soloAnuncio);
    expect(r.cadenaCompleta).toBe(false);
    expect(r.sinDatos).toEqual(["carga", "intencion", "checkout"]);
    // No puede decir "está todo bien": nadie miró la web.
    expect(r.conclusion).not.toBe("negocio");
    expect(r.conclusion).toBe("incompleta");
  });

  it("un roto medible gana sobre los agujeros de más abajo", () => {
    const r = diagnosticarCadena({ hookRate: 0.05, holdRate: 0.20, ctr: 0.02 });
    expect(r.primerRoto.key).toBe("hook");
  });

  it("los umbrales del curso son sobreescribibles por cuenta", () => {
    const flojo = { ...SANA, ctr: 0.006 };
    expect(diagnosticarCadena(flojo).primerRoto.key).toBe("clic");
    expect(diagnosticarCadena(flojo, { umbrales: { ctrFlojo: 0.003 } }).primerRoto).toBeNull();
  });

  it("los umbrales por defecto son los del curso", () => {
    expect(UMBRALES_CURSO.hookRate).toBe(0.30);
    expect(UMBRALES_CURSO.ctr).toBe(0.015);
    expect(UMBRALES_CURSO.conversionCheckout).toBe(0.40);
  });
});

describe("frecuencia y su doble señal", () => {
  it("es impresiones sobre alcance", () => {
    expect(frecuencia({ impresiones: 4_000_000, alcance: 2_000_000 })).toBe(2);
    expect(frecuencia({ impresiones: 700_000, alcance: 100_000 })).toBe(7);
  });

  it("sin alcance no divide por cero", () => {
    expect(frecuencia({ impresiones: 100, alcance: 0 })).toBe(0);
  });

  // El punto del diseño: 7 en BOFU es normal. Sin comparar contra el período
  // anterior no se puede hablar de fatiga.
  it("una frecuencia alta pero estable NO es fatiga", () => {
    const bofu = { impresiones: 700_000, alcance: 100_000, cpm: 12_000 };
    expect(senalDeFatiga(bofu, bofu).fatiga).toBe(false);
  });

  it("es fatiga solo cuando la frecuencia y el CPM suben JUNTOS", () => {
    const antes = { impresiones: 400_000, alcance: 100_000, cpm: 10_000 };
    const despues = { impresiones: 700_000, alcance: 100_000, cpm: 14_000 };
    const r = senalDeFatiga(despues, antes);
    expect(r.fatiga).toBe(true);
    expect(r.accion).toContain("No mates al ganador");
  });

  it("la frecuencia sola no alcanza", () => {
    const antes = { impresiones: 400_000, alcance: 100_000, cpm: 10_000 };
    const despues = { impresiones: 700_000, alcance: 100_000, cpm: 9_000 };
    expect(senalDeFatiga(despues, antes).fatiga).toBe(false);
  });

  it("sin período anterior no afirma nada", () => {
    expect(senalDeFatiga({ impresiones: 700_000, alcance: 100_000 }).fatiga).toBe(false);
  });
});

describe("nivelDeFatiga", () => {
  it("se resuelve de afuera hacia adentro", () => {
    expect(nivelDeFatiga({ cpmSubeEnLaCuenta: true, conceptoEntero: true }).nivel).toBe(3);
    expect(nivelDeFatiga({ conceptoEntero: true }).nivel).toBe(2);
    expect(nivelDeFatiga({}).nivel).toBe(1);
  });

  it("cada nivel manda a hacer algo distinto", () => {
    expect(nivelDeFatiga({}).accion).toContain("variaciones");
    expect(nivelDeFatiga({ conceptoEntero: true }).accion).toContain("No insistas con este concepto");
    expect(nivelDeFatiga({ cpmSubeEnLaCuenta: true }).accion).toContain("público nuevo");
  });
});

describe("queHacer — el orden entre la cadena y la fatiga", () => {
  const antes = { impresiones: 400_000, alcance: 100_000, cpm: 10_000 };
  const despues = { impresiones: 700_000, alcance: 100_000, cpm: 14_000 };

  // La decisión de diseño: la cadena primero. Rotar creativos cuando lo roto era
  // el checkout cuesta producción y no arregla nada.
  it("con un eslabón roto manda a la cadena, aunque haya señal de fatiga", () => {
    const r = queHacer({
      metricas: { ...SANA, conversionCheckout: 0.05 },
      actual: despues, previo: antes,
    });
    expect(r.via).toBe("cadena");
    expect(r.accion).toContain("envío");
  });

  it("solo con la cadena sana entera trata la fatiga", () => {
    const r = queHacer({ metricas: SANA, actual: despues, previo: antes });
    expect(r.via).toBe("fatiga");
    expect(r.nivel.nivel).toBe(1);
  });

  // Con agujeros no se puede descartar la web, así que tampoco se puede
  // concluir fatiga: eso mandaría a producir creativos por las dudas.
  it("con la cadena incompleta no salta a fatiga: pide los datos que faltan", () => {
    const r = queHacer({
      metricas: { hookRate: 0.35, holdRate: 0.20, ctr: 0.02 },
      actual: despues, previo: antes,
    });
    expect(r.via).toBe("incompleta");
    expect(r.accion).toContain("Meta");
  });

  it("cadena sana y sin fatiga: el problema es de negocio", () => {
    const r = queHacer({ metricas: SANA, actual: antes, previo: antes });
    expect(r.via).toBe("negocio");
    expect(r.accion).toContain("márgenes");
  });
});
