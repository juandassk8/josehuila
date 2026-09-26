import { describe, it, expect } from "vitest";
import {
  hechoEnEtapa, resumenPorBriefEtapa, elegirDestinatarios,
  tituloTarea, descripcionTarea, grupoCompleto, ETAPA_A_ROL, tareasSinClave, tareasDeClaveVieja, unaALaVez,
} from "../pipelineTasks.js";

const BRIEFS = [{ id: "b1", n: "Brief 1" }, { id: "b2", n: "Brief 2" }];

describe("hechoEnEtapa", () => {
  it("solo cuenta el check explícito", () => {
    expect(hechoEnEtapa({ stage_done: true })).toBe(true);
    expect(hechoEnEtapa({ stage_done: false })).toBe(false);
    expect(hechoEnEtapa({})).toBe(false);
  });
  it("la carpeta llena YA NO cuenta — se prepara antes de editar", () => {
    expect(hechoEnEtapa({ drive: "https://drive/x", stage_done: false })).toBe(false);
  });
});

describe("resumenPorBriefEtapa", () => {
  const slots = [
    { id: "s1", brief: "b1", stage: "edit", due: "2026-08-06", concepto: "Transformacional (Tofu)", stage_done: true },
    { id: "s2", brief: "b1", stage: "edit", due: "2026-08-06", concepto: "Transformacional (Tofu)" },
    { id: "s3", brief: "b1", stage: "edit", due: "2026-08-07", concepto: "IA Animado (Tofu)" },
    { id: "s4", brief: "b1", stage: "edit", due: "2026-08-07", concepto: "B-Roll (Tofu)" },
    { id: "s5", brief: "b1", stage: "edit", concepto: "Oferta (Bofu)" },     // sin fecha
    { id: "s6", brief: "b1", stage: "idea", due: "2026-08-06" },              // idea no genera
    { id: "s7", brief: null, stage: "edit", due: "2026-08-06" },              // sin brief
  ];

  it("hace un grupo por día de entrega", () => {
    const g = resumenPorBriefEtapa(BRIEFS, slots);
    expect(g.map((x) => x.fecha)).toEqual(["2026-08-06", "2026-08-07", ""]);
    expect(g.map((x) => x.total)).toEqual([2, 2, 1]);
  });

  it("los sin fecha van juntos y al final, no se pierden", () => {
    const g = resumenPorBriefEtapa(BRIEFS, slots);
    expect(g.at(-1)).toMatchObject({ fecha: "", total: 1 });
  });

  it("cuenta lo hecho con el check", () => {
    const [seis] = resumenPorBriefEtapa(BRIEFS, slots);
    expect(seis).toMatchObject({ done: 1, total: 2 });
  });

  it("la clave incluye el tipo y la fecha — es lo que evita los duplicados", () => {
    const g = resumenPorBriefEtapa(BRIEFS, slots);
    expect(g[0].key).toBe("b1|edit|video|2026-08-06");
    expect(g.at(-1).key).toBe("b1|edit|video|");
    expect(new Set(g.map((x) => x.key)).size).toBe(g.length);
  });

  it("separa los estáticos de los videos", () => {
    // Editar un video y diseñar un estático son trabajos distintos, de gente
    // distinta. Antes caían juntos en una tarea llamada "Editar videos".
    const mixto = [
      { id: "s1", brief: "b1", stage: "edit", tipo: "video", due: "2026-08-06", concepto: "Transformacional" },
      { id: "s2", brief: "b1", stage: "edit", tipo: "estatico", due: "2026-08-06", concepto: "Oferta" },
    ];
    const g = resumenPorBriefEtapa(BRIEFS, mixto);
    expect(g).toHaveLength(2);
    expect(g.map((x) => tituloTarea(x)).sort()).toEqual([
      "Diseñar estáticos · Oferta", "Editar videos · Transformacional",
    ]);
  });

  // La otra mitad de la regla, y la que faltaba: donde el tipo NO cambia el
  // oficio, no se separa. Al trafficker le llegaban dos "Publicar y optimizar"
  // el mismo día —una de videos y otra de estáticos— por una diferencia que a
  // él no le cambia nada: subir un anuncio es subir un anuncio.
  it("publicar NO se parte por tipo: es el mismo trabajo", () => {
    const mixto = [
      { id: "s1", brief: "b1", stage: "campaign", tipo: "video", due: "2026-08-11", concepto: "UGC" },
      { id: "s2", brief: "b1", stage: "campaign", tipo: "estatico", due: "2026-08-11", concepto: "Oferta" },
    ];
    const g = resumenPorBriefEtapa(BRIEFS, mixto);
    expect(g).toHaveLength(1);
    expect(tituloTarea(g[0])).toBe("Publicar y optimizar · UGC y Oferta");
    expect(g[0].total).toBe(2);
  });

  it("mandar a grabar y recoger feedback, tampoco", () => {
    const mixto = [
      { id: "s1", brief: "b1", stage: "film", tipo: "video", due: "", concepto: "UGC" },
      { id: "s2", brief: "b1", stage: "film", tipo: "estatico", due: "", concepto: "Oferta" },
      { id: "s3", brief: "b1", stage: "feedback", tipo: "video", due: "", concepto: "UGC" },
      { id: "s4", brief: "b1", stage: "feedback", tipo: "estatico", due: "", concepto: "Oferta" },
    ];
    expect(resumenPorBriefEtapa(BRIEFS, mixto)).toHaveLength(2);
  });

  it("recoge los conceptos del día", () => {
    const g = resumenPorBriefEtapa(BRIEFS, slots);
    expect(g[0].conceptos).toEqual(["Transformacional (Tofu)"]);
    expect(g[1].conceptos.sort()).toEqual(["B-Roll (Tofu)", "IA Animado (Tofu)"]);
  });

  it("ignora `idea` y los slots sin brief", () => {
    expect(resumenPorBriefEtapa(BRIEFS, slots).reduce((n, x) => n + x.total, 0)).toBe(5);
  });

  it("recoge a quién está asignado a mano", () => {
    const g = resumenPorBriefEtapa(BRIEFS, [{ id: "x", brief: "b1", stage: "edit", editor: "Alejandro" }]);
    expect(g[0].nombres).toEqual(["Alejandro"]);
  });

  it("no toma 'Sin asignar' como si fuera una persona", () => {
    const g = resumenPorBriefEtapa(BRIEFS, [{ id: "x", brief: "b1", stage: "edit", editor: "Sin asignar" }]);
    expect(g[0].nombres).toEqual([]);
  });

  it("no inventa grupos cuando no hay slots", () => {
    expect(resumenPorBriefEtapa(BRIEFS, [])).toEqual([]);
    expect(resumenPorBriefEtapa([], null)).toEqual([]);
  });
});

describe("tituloTarea", () => {
  it("con un solo concepto, lo dice — es lo que hay que hacer ese día", () => {
    expect(tituloTarea({ etapa: "edit", briefName: "Brief 1", conceptos: ["Transformacional (Tofu)"] }))
      .toBe("Editar videos · Transformacional (Tofu)");
  });
  it("con dos conceptos los nombra a los dos", () => {
    // "Editar videos · Brief 1" no le dice nada a quien la abre.
    expect(tituloTarea({ etapa: "edit", briefName: "Brief 1", conceptos: ["Educativo (Mofu)", "Oferta (Bofu)"] }))
      .toBe("Editar videos · Educativo (Mofu) y Oferta (Bofu)");
  });

  it("con tres o más se corta: el título tiene que caber", () => {
    expect(tituloTarea({ etapa: "edit", briefName: "Brief 1", conceptos: ["A", "B", "C", "D"] }))
      .toBe("Editar videos · A, B y 2 más");
  });

  it("los estáticos se diseñan, no se editan", () => {
    expect(tituloTarea({ etapa: "edit", tipo: "estatico", briefName: "Brief 1", conceptos: ["Oferta"] }))
      .toBe("Diseñar estáticos · Oferta");
  });
  it("To Film habla de mandar a grabar, no de grabar", () => {
    expect(tituloTarea({ etapa: "film", briefName: "Brief 1", conceptos: [] }))
      .toBe("Mandar a grabar · Brief 1");
  });
});

describe("elegirDestinatarios", () => {
  const miembros = [
    { id: "m1", name: "Alejandro", roles: ["editor"] },
    { id: "m2", name: "Johan", roles: ["editor", "content"] },
    { id: "m3", name: "Daniel", roles: ["copywriter", "project_manager"] },
    { id: "m4", name: "UGCs Externo", roles: ["content"] },
    { id: "m5", name: "Jose", roles: [], is_owner: true },
  ];

  it("manda a quien está asignado a mano, no a todos los del rol", () => {
    expect(elegirDestinatarios({ etapa: "edit", nombres: ["Alejandro"] }, miembros).map((m) => m.id)).toEqual(["m1"]);
  });

  it("To Film le cae al PM, no a los del rol content", () => {
    // El creador es una UGC de afuera: no está en el equipo.
    const r = elegirDestinatarios({ etapa: "film", nombres: ["Laura"] }, miembros);
    expect(r.map((m) => m.id)).toEqual(["m3"]);
  });

  it("sin asignación explícita cae a todos los del rol", () => {
    expect(elegirDestinatarios({ etapa: "edit", nombres: [] }, miembros).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("sin nadie con el rol cae al owner — una tarea de nadie no la hace nadie", () => {
    expect(elegirDestinatarios({ etapa: "campaign", nombres: [] }, miembros).map((m) => m.id)).toEqual(["m5"]);
  });

  it("el nombre se cruza sin importar mayúsculas ni espacios", () => {
    expect(elegirDestinatarios({ etapa: "edit", nombres: ["  alejandro "] }, miembros).map((m) => m.id)).toEqual(["m1"]);
  });

  it("sin equipo cargado no devuelve nada en vez de romper", () => {
    expect(elegirDestinatarios({ etapa: "edit", nombres: [] }, [])).toEqual([]);
    expect(elegirDestinatarios({ etapa: "edit", nombres: [] }, null)).toEqual([]);
  });
});

describe("descripción y cierre", () => {
  it("la descripción es el avance", () => {
    expect(descripcionTarea({ done: 3, total: 5 })).toBe("3 de 5 listos");
    expect(descripcionTarea({ done: 1, total: 3 })).toBe("1 de 3 listo");
  });
  it("el grupo terminado cierra la tarea", () => {
    expect(grupoCompleto({ done: 5, total: 5 })).toBe(true);
    expect(grupoCompleto({ done: 4, total: 5 })).toBe(false);
    expect(grupoCompleto({ done: 0, total: 0 })).toBe(false);
  });
});

describe("ETAPA_A_ROL", () => {
  it("cubre las etapas con trabajo y deja fuera 'idea'", () => {
    expect(Object.keys(ETAPA_A_ROL).sort()).toEqual(["campaign", "edit", "feedback", "film", "scripting"]);
    expect(ETAPA_A_ROL.idea).toBeUndefined();
  });
  it("film es del project manager", () => {
    expect(ETAPA_A_ROL.film).toBe("project_manager");
  });
});

describe("tareasSinClave", () => {
  // Los seis duplicados reales que quedaron en el tablero: mismo trabajo, sin
  // clave, y por eso irreconciliables — cada pasada del sync insertaba otro.
  const enTablero = [
    { id: "1", auto_key: "b1|film|2026-08-06", brief_id: "b1" },   // la buena
    { id: "2", auto_key: null, brief_id: "b1" },                   // "Grabar contenido · Brief 1"
    { id: "3", auto_key: null, brief_id: "b1" },                   // otra igual
    { id: "4", auto_key: null, brief_id: null },                   // del motor viejo del despliegue
  ];

  it("se lleva las del pipeline que quedaron sin clave", () => {
    expect(tareasSinClave(enTablero)).toEqual(["2", "3"]);
  });

  it("no toca las que sí tienen clave", () => {
    expect(tareasSinClave([{ id: "1", auto_key: "b1|edit|", brief_id: "b1" }])).toEqual([]);
  });

  it("deja en paz al motor viejo del despliegue", () => {
    // Sus tareas no tienen brief_id y siguen siendo suyas.
    expect(tareasSinClave([{ id: "9", auto_key: null, brief_id: null }])).toEqual([]);
  });

  it("aguanta la lista vacía", () => {
    expect(tareasSinClave([])).toEqual([]);
    expect(tareasSinClave(null)).toEqual([]);
    expect(tareasSinClave([null, undefined])).toEqual([]);
  });
});

describe("unaALaVez", () => {
  // El bug real: cambiabas tres fechas seguidas, la primera pasada sincronizaba
  // y las otras dos se descartaban en silencio. El contenido quedaba con la
  // fecha nueva y la tarea seguía mostrando la vieja.
  const diferido = () => {
    let soltar;
    const p = new Promise((r) => { soltar = r; });
    return { p, soltar };
  };

  it("no corre dos a la vez", async () => {
    const a = diferido();
    let corriendo = 0, maximo = 0;
    const f = unaALaVez(async () => {
      maximo = Math.max(maximo, ++corriendo);
      await a.p;
      corriendo--;
    });
    const p1 = f("uno");
    f("dos");
    a.soltar();
    await p1;
    expect(maximo).toBe(1);
  });

  it("la que llegó ocupada se corre después, con sus argumentos", async () => {
    const a = diferido();
    const vistos = [];
    const f = unaALaVez(async (x) => { vistos.push(x); if (vistos.length === 1) await a.p; });
    const p1 = f("primera");
    f("segunda");
    a.soltar();
    await p1;
    expect(vistos).toEqual(["primera", "segunda"]);
  });

  it("varias seguidas colapsan en una sola repetición, con la última", async () => {
    const a = diferido();
    const vistos = [];
    const f = unaALaVez(async (x) => { vistos.push(x); if (vistos.length === 1) await a.p; });
    const p1 = f("primera");
    f("descartada"); f("descartada2"); f("la última");
    a.soltar();
    await p1;
    expect(vistos).toEqual(["primera", "la última"]);
  });

  it("si la primera falla, la pendiente igual se corre", async () => {
    const vistos = [];
    const f = unaALaVez(async (x) => {
      vistos.push(x);
      if (x === "rota") { await Promise.resolve(); throw new Error("boom"); }
    });
    const p1 = f("rota");
    f("la que sigue");
    await expect(p1).rejects.toThrow("boom");
    expect(vistos).toEqual(["rota", "la que sigue"]);
  });
});

describe("tareasDeClaveVieja", () => {
  it("se lleva las de tres partes, que ya no casan con nada", () => {
    const enTablero = [
      { id: "1", auto_key: "b1|edit|video|2026-08-06", brief_id: "b1" },   // la buena
      { id: "2", auto_key: "b1|edit|2026-08-06", brief_id: "b1" },         // la de antes del tipo
      { id: "3", auto_key: "b1|edit|", brief_id: "b1" },                   // la misma, sin fecha
    ];
    expect(tareasDeClaveVieja(enTablero)).toEqual(["2", "3"]);
  });

  it("no toca la clave nueva ni siquiera sin fecha", () => {
    expect(tareasDeClaveVieja([{ id: "1", auto_key: "b1|edit|estatico|", brief_id: "b1" }])).toEqual([]);
  });

  it("deja en paz al motor viejo del despliegue", () => {
    expect(tareasDeClaveVieja([{ id: "9", auto_key: "algo|otra|cosa", brief_id: null }])).toEqual([]);
  });

  it("aguanta la lista vacía", () => {
    expect(tareasDeClaveVieja([])).toEqual([]);
    expect(tareasDeClaveVieja(null)).toEqual([]);
    expect(tareasDeClaveVieja([null, undefined])).toEqual([]);
  });
});

describe("a quién le llega, según el tipo", () => {
  const equipo = [
    { id: "e1", name: "Johan", roles: ["editor"] },
    { id: "d1", name: "Allison", roles: ["designer"] },
    { id: "o1", name: "Dueño", roles: [], is_owner: true },
  ];

  it("los videos al editor y los estáticos al diseñador", () => {
    expect(elegirDestinatarios({ etapa: "edit", tipo: "video", nombres: [] }, equipo).map((m) => m.name))
      .toEqual(["Johan"]);
    expect(elegirDestinatarios({ etapa: "edit", tipo: "estatico", nombres: [] }, equipo).map((m) => m.name))
      .toEqual(["Allison"]);
  });

  it("quien está puesto a mano en el contenido manda sobre el rol", () => {
    expect(elegirDestinatarios({ etapa: "edit", tipo: "estatico", nombres: ["Johan"] }, equipo).map((m) => m.name))
      .toEqual(["Johan"]);
  });
});

describe("descripcionTarea", () => {
  it("con un solo concepto alcanza con el avance", () => {
    expect(descripcionTarea({ done: 0, total: 5, conceptos: ["Transformacional"] })).toBe("0 de 5 listos");
  });

  it("con varios dice de qué está hecha", () => {
    // "0 de 17 listos" no dice qué son esos 17.
    expect(descripcionTarea({
      done: 0, total: 15, conceptos: ["Educativo (Mofu)", "Oferta (Bofu)"],
      porConcepto: { "Educativo (Mofu)": 5, "Oferta (Bofu)": 10 },
    })).toBe("0 de 15 listos · Educativo (Mofu) 5 · Oferta (Bofu) 10");
  });
});
