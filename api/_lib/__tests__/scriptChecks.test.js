// Cada caso de acá salió de un guion real que Jose devolvió porque el hook no
// enganchaba con el body. Son la red que evita que vuelvan a pasar.
import { describe, it, expect } from "vitest";
import {
  checkHookVariety, checkVoice, checkTimeFrame, checkList,
  checkWordBudget, checkScript, countListBeats, measureWords, countWords,
} from "../scriptChecks.js";

const hooks = (arr) => arr.map((text, i) => ({ text, archetype: ["callout", "dolor", "creencia", "pregunta", "error"][i] }));
const body = (arr) => arr.map((text) => ({ text }));

describe("checkHookVariety", () => {
  it("exige exactamente 5", () => {
    expect(checkHookVariety(hooks(["a", "b", "c"]))).toContain("exactamente 5");
  });
  it("exige 5 arquetipos distintos", () => {
    const h = hooks(["uno dos tres", "dos tres cuatro", "tres cuatro cinco", "cuatro cinco seis", "cinco seis siete"]);
    h[1].archetype = "callout";
    expect(checkHookVariety(h)).toContain("DISTINTOS");
  });
  it("marca aperturas repetidas", () => {
    expect(checkHookVariety(hooks(["si tu perro ladra", "si tu perro corre", "otra cosa distinta", "cuarta entrada acá", "quinta entrada acá"]))).toContain("mismas 3 palabras");
  });
  it("pasa cuando están bien", () => {
    expect(checkHookVariety(hooks(["alfa uno dos", "beta tres cuatro", "gama cinco seis", "delta siete ocho", "epsilon nueve diez"]))).toBeNull();
  });
});

describe("checkVoice — el referente del perro que le habla al dueño", () => {
  const bodyPerro = body([
    "A veces es el sarro en mis dientes, las encías que no sanan.",
    "Es mi manera de decirte que algo pasa en mi boca.",
    "Mi salud depende de eso más de lo que crees.",
  ]);
  it("marca los hooks que le hablan al dueño desde afuera", () => {
    const r = checkVoice(hooks([
      "Si pudiera hablarle a mi dueño esto le diría",
      "Tu perro te lame la cara y giras la cabeza",
      "Revisaste los dientes de tu perro alguna vez",
      "Hay algo que llevo meses queriendo decirte",
      "Antes me dejabas subir a tu cama",
    ]), bodyPerro);
    expect(r).toContain("2, 3");
    expect(r).toContain("primera persona");
  });
  it("pasa si los 5 respetan la voz", () => {
    expect(checkVoice(hooks([
      "Si pudiera hablarle a mi dueño esto le diría",
      "Hay algo que llevo meses queriendo decirte",
      "Nunca te preguntaste por qué me alejo",
      "Antes me dejabas dormir en la cama",
      "Casi nadie sabe lo que siento",
    ]), bodyPerro)).toBeNull();
  });
  it("no se dispara si el body no tiene voz marcada", () => {
    expect(checkVoice(hooks(["a", "b", "c", "d", "e"]), body(["Un texto neutro sin marcas."]))).toBeNull();
  });
});

describe("checkTimeFrame — el referente de la progresión de 30 días", () => {
  const bodyProgresion = body([
    "Después del primer día, la boca empieza a cambiar.",
    "Después de una semana, el aliento mejora.",
  ]);
  it("marca los hooks que no plantan el plazo", () => {
    const r = checkTimeFrame(hooks([
      "Esto es lo que pasaría si lo usaras por 30 días",
      "El sarro no es cosmético, es una infección",
      "Casi todos esperan a que el veterinario lo mencione",
      "Hace cuánto que no le miras los dientes",
      "No es que tenga mala higiene",
    ]), bodyProgresion);
    expect(r).toContain("2, 3, 4, 5");
  });
  it("pasa si los 5 plantan el marco", () => {
    expect(checkTimeFrame(hooks([
      "Esto es lo que pasaría si lo usaras por 30 días",
      "Dale 30 días y mira lo que cambia",
      "Qué pasaría si por un mes hicieras esto",
      "En 30 días vas a ver la diferencia",
      "Durante 3 semanas pasa algo curioso",
    ]), bodyProgresion)).toBeNull();
  });
  it("no se dispara si el body no arranca en secuencia", () => {
    expect(checkTimeFrame(hooks(["a", "b", "c", "d", "e"]), body(["El sarro es una infección activa."]))).toBeNull();
  });
});

describe("checkList — el referente de Grüns, '4 razones por las que…'", () => {
  const bodyLista = body([
    "Primero, protege las encías de tu perro con Peluna Fresh.",
    "Segundo, un litro rinde 60 días.",
    "Tercero, no necesita cepillado.",
    "Y por último, es apto para braquicéfalos.",
  ]);
  const subjects = ["Peluna Fresh", "Enfermedad Periodontal"];

  it("cuenta los beats enumerados", () => {
    expect(countListBeats(bodyLista)).toBe(4);
    expect(countListBeats(body(["Un texto suelto", "Otro texto suelto"]))).toBe(0);
  });

  it("marca el hook que promete una lista de OTRA cosa (el fallo real)", () => {
    const r = checkList(hooks([
      "Cuatro razones por las que Peluna Fresh cuida sin anestesia",
      "Cada vez que llevas tu pug al veterinario hay cuatro razones para evitar llegar a eso",
      "tercero distinto acá",
      "cuarto distinto acá",
      "quinto distinto acá",
    ]), bodyLista, subjects);
    expect(r).toContain("2");
    expect(r).toContain("lista de otra cosa");
  });

  it("marca cuando el número no coincide con los beats", () => {
    const r = checkList(hooks([
      "Tres razones por las que Peluna Fresh funciona",
      "b", "c", "d", "e",
    ]), bodyLista, subjects);
    expect(r).toContain("enumera 4");
    expect(r).toContain("dice 3");
  });

  it("pasa si todos anuncian la misma lista sobre lo mismo", () => {
    expect(checkList(hooks([
      "Cuatro razones por las que Peluna Fresh es el mejor amigo de los braquicéfalos",
      "Te doy cuatro razones para probar Peluna Fresh esta semana",
      "una entrada sin anuncio de lista",
      "otra entrada sin anuncio",
      "otra más sin anuncio",
    ]), bodyLista, subjects)).toBeNull();
  });

  it("no se dispara si el body no es una lista", () => {
    expect(checkList(hooks(["Cuatro razones para algo", "b", "c", "d", "e"]), body(["Texto corrido sin ordinales."]), subjects)).toBeNull();
  });
});

describe("checkWordBudget", () => {
  const out = { hooks: [{ text: "una dos tres cuatro cinco" }], body: [{ text: "palabra ".repeat(100).trim() }], cta: { text: "cierre corto acá" } };
  it("marca si se pasa", () => {
    expect(checkWordBudget(out, 50)).toContain("Recortá");
  });
  it("marca si se queda corto", () => {
    expect(checkWordBudget(out, 300)).toContain("Sumá");
  });
  it("pasa dentro de la tolerancia", () => {
    const { total } = measureWords(out);
    expect(checkWordBudget(out, total)).toBeNull();
  });
});

describe("countWords", () => {
  it("cuenta palabras con acentos y apóstrofes", () => {
    expect(countWords("el niño está aquí")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords(null)).toBe(0);
  });
});

describe("checkScript", () => {
  it("junta todos los problemas encontrados", () => {
    const r = checkScript({
      hooks: hooks(["Tres razones por las que algo", "b uno dos", "c uno dos", "d uno dos", "e uno dos"]),
      body: body(["Primero, Peluna Fresh cuida.", "Segundo, rinde mucho.", "Tercero, es fácil.", "Cuarto, es seguro."]),
      cta: { text: "cierre" },
    }, 500, { subjects: ["Peluna Fresh"] });
    expect(r).toContain("dice 3");
    expect(r).toContain("Sumá");
  });

  it("devuelve null si el guion está coherente", () => {
    const out = {
      hooks: hooks(["alfa uno dos", "beta tres cuatro", "gama cinco seis", "delta siete ocho", "epsilon nueve diez"]),
      body: body(["Un cuerpo corriente sin ordinales ni marcas de persona."]),
      cta: { text: "cierre breve" },
    };
    expect(checkScript(out, measureWords(out).total, { subjects: ["Peluna Fresh"] })).toBeNull();
  });
});
