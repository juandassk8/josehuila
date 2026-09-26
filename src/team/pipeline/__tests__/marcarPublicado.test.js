import { describe, it, expect } from "vitest";
import { marcarPublicado, elTipoCambiaElTrabajo } from "../pipelineConstants.js";

// Marcar publicado se hace desde dos pantallas —la fila del brief y la vista In
// Campaign— y estaban desincronizadas: la del trafficker escribía solo
// `publicado`, así que él marcaba sus anuncios y su barra seguía en cero.
describe("marcarPublicado", () => {
  it("publicar cierra el trabajo de la etapa", () => {
    expect(marcarPublicado(true)).toEqual({ publicado: true, stage_done: true });
  });

  it("despublicar lo reabre: si el anuncio se bajó, el trabajo vuelve", () => {
    expect(marcarPublicado(false)).toEqual({ publicado: false, stage_done: false });
  });
});

describe("elTipoCambiaElTrabajo", () => {
  it("solo en editar, que son dos oficios", () => {
    expect(elTipoCambiaElTrabajo("edit")).toBe(true);
  });

  it("no en las etapas donde el trabajo es el mismo", () => {
    for (const e of ["scripting", "film", "campaign", "feedback", "idea"]) {
      expect(elTipoCambiaElTrabajo(e)).toBe(false);
    }
  });
});
