import { describe, it, expect } from "vitest";
import { asArray, asObject, normalizeBlueprint } from "../blueprintShape.js";

describe("asArray", () => {
  // El caso real: el modelo devolvió el array serializado y el `|| []` lo dejó
  // pasar porque un string es truthy. Reventó en el `.map`.
  it("recupera un array que vino serializado", () => {
    const serializado = '[\n  {"purpose": "abrir"},\n  {"purpose": "agitar"}\n]';
    expect(asArray(serializado)).toEqual([{ purpose: "abrir" }, { purpose: "agitar" }]);
  });

  it("un array de verdad pasa intacto", () => {
    const a = [{ x: 1 }];
    expect(asArray(a)).toBe(a);
  });

  it("un objeto suelto se envuelve", () => {
    expect(asArray({ purpose: "abrir" })).toEqual([{ purpose: "abrir" }]);
  });

  it("lo vacío o inválido da lista vacía, nunca revienta", () => {
    for (const v of [null, undefined, "", "   ", 42, true]) {
      expect(asArray(v)).toEqual([]);
    }
  });

  // Texto suelto donde iba una lista se descarta: meterlo como un beat de prosa
  // desordenaría el guion entero.
  it("texto que no es JSON se descarta", () => {
    expect(asArray("el anuncio abre con una pregunta")).toEqual([]);
  });

  it("un JSON que no es array igual devuelve algo usable", () => {
    expect(asArray('{"purpose":"abrir"}')).toEqual([{ purpose: "abrir" }]);
  });
});

describe("asObject", () => {
  it("recupera un objeto serializado", () => {
    expect(asObject('{"archetype":"dolor","words":12}')).toEqual({ archetype: "dolor", words: 12 });
  });

  it("un array NO es un objeto válido acá", () => {
    expect(asObject([1, 2])).toEqual({});
  });

  it("lo inválido da objeto vacío", () => {
    expect(asObject(null)).toEqual({});
    expect(asObject("no soy json")).toEqual({});
  });
});

describe("normalizeBlueprint", () => {
  it("arregla el blueprint que rompió en producción", () => {
    const roto = {
      premise: "el sujeto habla en primera persona",
      hook: { archetype: "dolor", devices: '["imperativo","tricolon"]' },
      beats: '[{"purpose":"abrir","words":20},{"purpose":"agitar","words":30}]',
      cta: '{"cta_type":"oferta directa","words":15}',
    };
    const ok = normalizeBlueprint(roto);
    expect(Array.isArray(ok.beats)).toBe(true);
    expect(ok.beats).toHaveLength(2);
    expect(ok.beats[0].purpose).toBe("abrir");
    expect(ok.hook.devices).toEqual(["imperativo", "tricolon"]);
    expect(ok.cta.cta_type).toBe("oferta directa");
    // Y lo que ya estaba bien no se toca.
    expect(ok.premise).toBe("el sujeto habla en primera persona");
  });

  it("un blueprint sano pasa sin cambios de contenido", () => {
    const sano = {
      premise: "p", arc: "a → b",
      hook: { archetype: "dolor", devices: ["x"], form: "f" },
      beats: [{ purpose: "abrir", form: "f", words: 20 }],
      cta: { cta_type: "oferta", words: 10 },
    };
    const ok = normalizeBlueprint(sano);
    expect(ok.beats).toEqual(sano.beats);
    expect(ok.hook.devices).toEqual(["x"]);
    expect(ok.arc).toBe("a → b");
  });

  // No inventa contenido: lo que falta queda vacío y el render ya sabe mostrar
  // "(sin beats)". Un blueprint pobre da un guion más flojo; uno con el tipo
  // equivocado tira el proceso entero.
  it("con campos ausentes no revienta y deja la forma correcta", () => {
    const ok = normalizeBlueprint({ premise: "p" });
    expect(ok.beats).toEqual([]);
    expect(ok.hook.devices).toEqual([]);
    expect(ok.cta).toEqual({});
  });

  it("descarta beats vacíos en vez de dejar objetos huecos", () => {
    const ok = normalizeBlueprint({ beats: [{ purpose: "abrir" }, null, "basura", {}] });
    expect(ok.beats).toEqual([{ purpose: "abrir" }]);
  });

  it("sin blueprint devuelve null", () => {
    expect(normalizeBlueprint(null)).toBeNull();
    expect(normalizeBlueprint("texto")).toBeNull();
  });
});

// El guardián del caché vive en el cliente (scriptAI.js) pero prueba la misma
// regla: un blueprint sin beats no sirve aunque la versión coincida.
describe("un blueprint solo sirve si tiene beats", () => {
  const usable = (bp) => Array.isArray(bp?.beats) && bp.beats.length > 0;

  it("con beats sirve", () => {
    expect(usable({ beats: [{ purpose: "abrir" }] })).toBe(true);
  });

  it("sin beats NO sirve, aunque tenga todo lo demás", () => {
    expect(usable({ beats: [], premise: "p", hook: { archetype: "dolor" }, arc: "a → b" })).toBe(false);
  });

  it("beats con el tipo equivocado tampoco sirve", () => {
    expect(usable({ beats: '[{"purpose":"abrir"}]' })).toBe(false);
    expect(usable({})).toBe(false);
    expect(usable(null)).toBe(false);
  });
});
