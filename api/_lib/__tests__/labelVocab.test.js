import { describe, it, expect } from "vitest";
import { canonizarEtiqueta, claveEtiqueta, vocabularioParaPrompt, valorCanonicoDelGrupo, categoriaDominante, etiquetasCruzadas } from "../labelVocab.js";

// El vocabulario real del banco, ordenado por uso como llega del builder.
const SUBNICHO = ["Cabello", "Depilación", "Skincare", "Salud digestiva canina", "Salud íntima", "Pijamas"];
const NICHO = ["Salud", "Belleza", "Calzado", "Ropa", "Mascotas"];
const ANGULO = ["Caída de cabello", "Oferta", "Nuevo lanzamiento"];

describe("canonizarEtiqueta", () => {
  it("colapsa la misma palabra escrita distinto", () => {
    expect(canonizarEtiqueta("calzado", NICHO)).toBe("Calzado");
    expect(canonizarEtiqueta("  ROPA ", NICHO)).toBe("Ropa");
  });

  it("colapsa las variantes de orden, acento y plural", () => {
    expect(canonizarEtiqueta("Caida Cabello", ANGULO)).toBe("Caída de cabello");
    expect(canonizarEtiqueta("cabello caída", ANGULO)).toBe("Caída de cabello");
  });

  it("colapsa las compuestas contra la existente que contienen", () => {
    // Esto es lo que llenó el banco: el modelo junta conceptos en vez de elegir.
    expect(canonizarEtiqueta("Pijamas y ropa de dormir", SUBNICHO)).toBe("Pijamas");
    expect(canonizarEtiqueta("Lencería y pijamas", SUBNICHO)).toBe("Pijamas");
    expect(canonizarEtiqueta("Pijamas y ropa de descanso", SUBNICHO)).toBe("Pijamas");
    expect(canonizarEtiqueta("Salud digestiva y alergias caninas", SUBNICHO)).toBe("Salud digestiva canina");
  });

  it("ante varias que calzan, gana la más usada", () => {
    // `conocidas` viene ordenada por uso: Cabello se usa más que Skincare.
    expect(canonizarEtiqueta("Cabello y skincare", SUBNICHO)).toBe("Cabello");
  });

  it("deja pasar lo que de verdad es nuevo", () => {
    expect(canonizarEtiqueta("Ropa de dormir", SUBNICHO)).toBeNull();
    expect(canonizarEtiqueta("Sueño", SUBNICHO)).toBeNull();
  });

  it("no se traga la especificidad de lo que NO es compuesto", () => {
    // Contra los datos reales: "Salud hepática" se usa 11 veces y es un ángulo
    // propio; colapsarla contra "Salud" (126) borra justo lo que la hace útil.
    expect(canonizarEtiqueta("Salud hepática", ["Salud", "Oferta"])).toBeNull();
    expect(canonizarEtiqueta("Venta directa", ["Venta"])).toBeNull();
    expect(canonizarEtiqueta("Green Screen - Noticia", ["Green Screen"])).toBeNull();
  });

  it("no colapsa dos cosas distintas que comparten una palabra", () => {
    expect(canonizarEtiqueta("Salud íntima", ["Cabello", "Skincare"])).toBeNull();
    expect(canonizarEtiqueta("Salud íntima", ["Salud"])).toBeNull();
  });

  it("con fuzzy corrige erratas de marca", () => {
    expect(canonizarEtiqueta("Ag1", ["AG1", "Ryze"], { fuzzy: true })).toBe("AG1");
    expect(canonizarEtiqueta("Lummia", ["Lummia"], { fuzzy: true })).toBe("Lummia");
  });

  it("sin fuzzy no adivina", () => {
    expect(canonizarEtiqueta("Belezza", NICHO)).toBeNull();
  });

  it("no se rompe con basura", () => {
    expect(canonizarEtiqueta("", NICHO)).toBeNull();
    expect(canonizarEtiqueta(null, NICHO)).toBeNull();
    expect(canonizarEtiqueta("Salud", null)).toBeNull();
  });
});

describe("claveEtiqueta", () => {
  it("ignora mayúsculas, acentos y signos", () => {
    expect(claveEtiqueta("Caída de Cabello")).toBe(claveEtiqueta("caida de cabello"));
    expect(claveEtiqueta("PetLab Co.")).toBe("petlab co");
  });
});

describe("vocabularioParaPrompt", () => {
  it("ordena por uso y muestra el conteo", () => {
    expect(vocabularioParaPrompt({ Pijamas: 5, Cabello: 543, Skincare: 164 }))
      .toBe("Cabello (543), Skincare (164), Pijamas (5)");
  });
  it("recorta la cola larga", () => {
    const muchos = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`e${i}`, 60 - i]));
    expect(vocabularioParaPrompt(muchos, 5).split(", ")).toHaveLength(5);
  });

  // El conteo es un argumento de autoridad: "Salud (378)" le dice al modelo que
  // esa es la apuesta segura. Bien para una marca —dice cuál es la escritura
  // establecida—, veneno para el nicho: cuando llega un mercado que no está en
  // la lista, el número lo empuja al más grande. Así 80 anuncios de sillas gamer
  // terminaron en Salud.
  it("sin conteo, para las categorías donde el número empujaría a lo más grande", () => {
    const nichos = { Salud: 378, Belleza: 161, Ropa: 93 };
    expect(vocabularioParaPrompt(nichos, 40, { conConteo: false }))
      .toBe("Salud, Belleza, Ropa");
  });

  it("sin conteo conserva el orden por uso", () => {
    expect(vocabularioParaPrompt({ Ropa: 93, Salud: 378 }, 40, { conConteo: false }))
      .toBe("Salud, Ropa");
  });
});

describe("valorCanonicoDelGrupo", () => {
  it("en lo descriptivo gana la más simple, no la más usada", () => {
    // El caso real del banco: la compuesta se usa MÁS que la buena. Quedarse con
    // la más usada consagraría justo lo que queremos sacar.
    const pijamas = [
      { value: "Pijamas", count: 13 },
      { value: "Pijamas y ropa de dormir", count: 33 },
      { value: "Lencería y pijamas", count: 2 },
    ];
    expect(valorCanonicoDelGrupo(pijamas, "subnicho")).toBe("Pijamas");
  });

  it("el uso desempata entre dos igual de simples", () => {
    const caninas = [
      { value: "Salud digestiva canina", count: 34 },
      { value: "Salud digestiva e inmune canina", count: 2 },
    ];
    expect(valorCanonicoDelGrupo(caninas, "subnicho")).toBe("Salud digestiva canina");
    expect(valorCanonicoDelGrupo([
      { value: "Caida Cabello", count: 9 },
      { value: "Caída de cabello", count: 26 },
    ], "angulo")).toBe("Caída de cabello");
  });

  it("en marca manda el uso, que dice cuál es la escritura establecida", () => {
    // "Goodprotein" tiene una palabra menos y aun así es la equivocada.
    expect(valorCanonicoDelGrupo([
      { value: "Goodprotein", count: 1 },
      { value: "Good Protein", count: 4 },
    ], "marca")).toBe("Good Protein");
    expect(valorCanonicoDelGrupo([
      { value: "Prima Queen", count: 1 },
      { value: "Primal Queen", count: 84 },
    ], "marca")).toBe("Primal Queen");
  });

  it("aguanta la basura", () => {
    expect(valorCanonicoDelGrupo([], "nicho")).toBeNull();
    expect(valorCanonicoDelGrupo(null, "nicho")).toBeNull();
  });
});

// Los conteos REALES del banco, que son los que motivaron esto.
const REAL = {
  nicho:    { "Salud": 808, "Belleza": 262, "Ropa": 222, "Suplementos": 141, "Bajar de peso": 11 },
  subnicho: { "Cabello": 76, "Bajar de peso": 11, "Suplementos": 20, "Lipodema": 25 },
  angulo:   { "Bajar de peso": 186, "Salud": 449, "Belleza": 15, "Cabello": 12, "Lipodema": 32 },
};

describe("categoriaDominante", () => {
  it("manda la etiqueta a donde de verdad se usa", () => {
    // Justo el caso que reportó José: 186 como ángulo contra 11 como nicho.
    expect(categoriaDominante("Bajar de peso", REAL)).toBe("angulo");
    expect(categoriaDominante("Cabello", REAL)).toBe("subnicho");
  });

  it("no decide cuando la mayoría no es clara", () => {
    // "Salud" es nicho 808 y ángulo 449: mucho, pero no 3×. Y "Lipodema" 32/25.
    // Ahí lo correcto es no tocar nada y que decida una persona.
    expect(categoriaDominante("Salud", REAL)).toBeNull();
    expect(categoriaDominante("Lipodema", REAL)).toBeNull();
  });

  it("no dice nada de una etiqueta que vive en una sola categoría", () => {
    expect(categoriaDominante("Ropa", REAL)).toBeNull();
  });

  it("compara sin acentos ni mayúsculas", () => {
    expect(categoriaDominante("bajar de PESO", REAL)).toBe("angulo");
  });

  it("aguanta la basura", () => {
    expect(categoriaDominante("", REAL)).toBeNull();
    expect(categoriaDominante("Lo que sea", {})).toBeNull();
  });
});

describe("etiquetasCruzadas", () => {
  const cruzadas = etiquetasCruzadas(REAL);
  const porValor = Object.fromEntries(cruzadas.map((c) => [c.valor.toLowerCase(), c]));

  it("encuentra las que están en dos categorías", () => {
    expect(Object.keys(porValor).sort()).toEqual(
      ["bajar de peso", "belleza", "cabello", "lipodema", "salud", "suplementos"],
    );
  });

  it("separa las que se resuelven solas de las que hay que decidir", () => {
    expect(porValor["bajar de peso"].clara).toBe(true);
    expect(porValor["bajar de peso"].destino).toBe("angulo");
    expect(porValor["belleza"].clara).toBe(true);      // 262 contra 15
    expect(porValor["salud"].clara).toBe(false);       // 808 contra 449
    expect(porValor["lipodema"].clara).toBe(false);    // 32 contra 25
  });

  it("pone primero las que más pesan", () => {
    expect(cruzadas[0].valor.toLowerCase()).toBe("salud");   // 808+449
  });

  it("no inventa cruces donde no hay", () => {
    expect(etiquetasCruzadas({ nicho: { Ropa: 10 } })).toEqual([]);
    expect(etiquetasCruzadas({})).toEqual([]);
  });
});

describe("etiquetasCruzadas — dos escrituras NO son un cruce", () => {
  it("no reporta cruce cuando las dos variantes viven en la misma categoría", () => {
    // "AG1" 48 y "Ag1" 2 son la misma marca escrita de dos formas. Eso lo
    // resuelve el panel de duplicados, no el de categorías: reportarlo acá daba
    // "Marca 48 · Marca 2 → Marca", una reubicación que no hace nada.
    expect(etiquetasCruzadas({ marca: { "AG1": 48, "Ag1": 2 } })).toEqual([]);
  });

  it("suma las variantes de escritura antes de comparar categorías", () => {
    const r = etiquetasCruzadas({ nicho: { "Cabello": 40, "cabello": 40 }, angulo: { "Cabello": 12 } });
    expect(r).toHaveLength(1);
    expect(r[0].destino).toBe("nicho");
    expect(r[0].usos.find((u) => u.cat === "nicho").n).toBe(80);   // 40 + 40
    expect(r[0].clara).toBe(true);                                  // 80 ≥ 12×3
  });
});
