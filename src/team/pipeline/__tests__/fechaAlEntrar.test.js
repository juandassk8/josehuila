import { describe, it, expect } from "vitest";
import { fechaAlEntrar } from "../data/usePipeline.js";
import { dayKey } from "../../../workspace/tasks/centerModel.js";

// La fecha de un contenido es la de la etapa en la que está. En To Edit dice
// cuándo hay que editarlo; al pasarlo a In Campaign esa fecha deja de
// significar nada y la fila quedaba diciendo "hace 2 días" sobre algo que hay
// que publicar hoy.
describe("fechaAlEntrar", () => {
  const hoy = dayKey(new Date());

  it("entrar a campaña pone la fecha de hoy", () => {
    expect(fechaAlEntrar("campaign", "edit")).toEqual({ due: hoy });
    expect(fechaAlEntrar("campaign", "film")).toEqual({ due: hoy });
  });

  // Las fechas de To Edit vienen escalonadas, una por tanda: están planificadas
  // de antemano. Reiniciarlas al mover un lote borraría esa planificación.
  it("las demás etapas no tocan la fecha", () => {
    for (const e of ["idea", "scripting", "film", "edit", "feedback"]) {
      expect(fechaAlEntrar(e, "idea")).toEqual({});
    }
  });

  it("salir de campaña tampoco la toca", () => {
    expect(fechaAlEntrar("feedback", "campaign")).toEqual({});
  });

  // Reordenar dentro de la misma etapa no es entrar: no hay día nuevo que fijar.
  it("quedarse en campaña no la reinicia", () => {
    expect(fechaAlEntrar("campaign", "campaign")).toEqual({});
  });
});
