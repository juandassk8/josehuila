import { describe, it, expect } from "vitest";
import {
  buildAdName, buildCreativeName, conceptoEtiqueta, formatNum,
  stagesFor, etapaRealPara, STAGES, NIVEL_COLOR, NIVELES,
} from "../pipelineConstants.js";

describe("la etiqueta se compone, no se guarda", () => {
  it("pega el nivel de conciencia al concepto", () => {
    expect(conceptoEtiqueta({ concepto: "UGC", nivel_conciencia: "mofu" })).toBe("UGC MOFU");
  });

  it("sin nivel queda el concepto solo — es opcional, no falta nada", () => {
    expect(conceptoEtiqueta({ concepto: "UGC" })).toBe("UGC");
  });

  it("con nivel y sin concepto queda el nivel solo", () => {
    expect(conceptoEtiqueta({ nivel_conciencia: "bofu" })).toBe("BOFU");
  });

  it("un nivel que no existe no ensucia la etiqueta", () => {
    expect(conceptoEtiqueta({ concepto: "UGC", nivel_conciencia: "zofu" })).toBe("UGC");
  });

  it("cambiar el concepto cambia la etiqueta sola", () => {
    const slot = { concepto: "UGC", nivel_conciencia: "tofu" };
    expect(conceptoEtiqueta(slot)).toBe("UGC TOFU");
    expect(conceptoEtiqueta({ ...slot, concepto: "Testimonial" })).toBe("Testimonial TOFU");
  });
});

describe("el nivel de conciencia cierra la nomenclatura", () => {
  const slot = {
    num: 53, producto: "Fresh Breath", angulo: "Mal aliento",
    concepto: "UGC", nivel_conciencia: "mofu", creador: "Nath", desc: "gancho fuerte",
  };

  it("el nivel va último, no pegado al concepto — es lo que el ojo busca al final del nombre", () => {
    expect(buildAdName(slot)).toBe("Creativo #053 - Fresh Breath - Mal aliento - UGC - Nath - gancho fuerte - MOFU");
  });

  it("el nombre del creativo es el mismo sin el prefijo", () => {
    expect(buildCreativeName(slot)).toBe("Fresh Breath - Mal aliento - UGC - Nath - gancho fuerte - MOFU");
  });

  it("sin nivel el nombre no queda con un guion colgando", () => {
    expect(buildCreativeName({ ...slot, nivel_conciencia: "" })).toBe("Fresh Breath - Mal aliento - UGC - Nath - gancho fuerte");
  });

  it("donde el nivel se dibuja como etiqueta de color, no se repite en el texto", () => {
    expect(buildCreativeName(slot, { conNivel: false })).toBe("Fresh Breath - Mal aliento - UGC - Nath - gancho fuerte");
  });

  it('omite "Sin creador" y los campos vacíos', () => {
    expect(buildAdName({ num: 7, producto: "Gel", creador: "Sin creador" })).toBe("Creativo #007 - Gel");
  });

  it("un slot en blanco no tiene nombre que mostrar", () => {
    expect(buildCreativeName({ num: 1 })).toBe("");
  });
});

describe("el número del creativo", () => {
  it("va a tres dígitos", () => {
    expect(formatNum(1)).toBe("#001");
    expect(formatNum(53)).toBe("#053");
  });

  it("no se corta al pasar de 999", () => {
    expect(formatNum(1000)).toBe("#1000");
    expect(formatNum(12345)).toBe("#12345");
  });
});

describe("un estático no pasa por To Film", () => {
  it("el video ve todas las etapas", () => {
    expect(stagesFor("video")).toEqual(STAGES);
  });

  it("al estático no se le ofrece grabar", () => {
    expect(stagesFor("estatico")).not.toContain("film");
    expect(stagesFor("estatico")).toEqual(["idea", "scripting", "edit", "campaign", "feedback"]);
  });

  it("un estático que YA quedó en To Film igual ve su etapa — si no, el select miente sobre dónde está", () => {
    expect(stagesFor("estatico", "film")).toContain("film");
    expect(stagesFor("estatico", "film")).toEqual(STAGES);
  });

  it("mandar la tanda a To Film manda los estáticos a diseño", () => {
    expect(etapaRealPara("estatico", "film")).toBe("edit");
    expect(etapaRealPara("video", "film")).toBe("film");
  });

  it("el resto de las etapas no se toca", () => {
    for (const s of STAGES.filter((x) => x !== "film")) {
      expect(etapaRealPara("estatico", s)).toBe(s);
      expect(etapaRealPara("video", s)).toBe(s);
    }
  });
});

describe("el semáforo del nivel de conciencia", () => {
  it("verde arriba, ámbar en el medio, rojo abajo — se lee sin leer la etiqueta", () => {
    expect(NIVEL_COLOR.tofu).toBe("var(--green)");
    expect(NIVEL_COLOR.mofu).toBe("var(--amber)");
    expect(NIVEL_COLOR.bofu).toBe("var(--brand)");
  });

  it("los tres niveles tienen color; ninguno se queda sin pintar", () => {
    for (const n of NIVELES) expect(NIVEL_COLOR[n.key]).toBeTruthy();
  });
});
