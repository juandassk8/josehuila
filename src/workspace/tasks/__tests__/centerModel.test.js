import { describe, it, expect } from "vitest";
import {
  dayKey, fromKey, addDays, humanDay, monthGrid, chipRange, fechaTono,
  toTask, groupByEstado, groupByFecha, groupByPersona,
  normalizePrio, iniciales, faltaPara, diasConTareas, enAlcanceSemana,
  esDe, resumenDelDia, agruparMiembrosPorRol,
} from "../centerModel.js";

const HOY = "2026-07-29";   // miércoles

describe("dayKey", () => {
  it("usa el día LOCAL, no el UTC", () => {
    // 20:00 en Colombia (UTC-5) es el día siguiente en UTC: toISOString() daría 30.
    expect(dayKey(new Date(2026, 6, 29, 20, 0))).toBe("2026-07-29");
  });
  it("tolera basura", () => {
    expect(dayKey(null)).toBe("");
    expect(dayKey("no es fecha")).toBe("");
  });
});

describe("addDays", () => {
  it("cruza el fin de mes", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });
  it("cruza el fin de año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("humanDay", () => {
  it("nombra los días cercanos", () => {
    expect(humanDay(HOY, HOY)).toBe("Hoy");
    expect(humanDay("2026-07-30", HOY)).toBe("Mañana");
    expect(humanDay("2026-07-28", HOY)).toBe("Ayer");
  });
  it("usa el día de la semana dentro de los próximos 7", () => {
    expect(humanDay("2026-07-31", HOY)).toBe("Viernes");
  });
  it("cae a fecha corta cuando está lejos", () => {
    expect(humanDay("2026-08-20", HOY)).toBe("20 ago");
    expect(humanDay("2026-07-01", HOY)).toBe("1 jul");
  });
});

describe("monthGrid", () => {
  const julio = monthGrid(2026, 6);
  it("son 6 semanas de 7 días", () => {
    expect(julio).toHaveLength(6);
    expect(julio.every((s) => s.length === 7)).toBe(true);
  });
  it("arranca en lunes", () => {
    // 1 de julio de 2026 es miércoles → la fila empieza el lunes 29 de junio.
    expect(julio[0][0].key).toBe("2026-06-29");
    expect(julio[0][0].fuera).toBe(true);
  });
  it("marca los días del propio mes", () => {
    expect(julio[0][2]).toMatchObject({ key: "2026-07-01", num: 1, fuera: false });
  });
});

describe("chipRange", () => {
  it("esta semana va de lunes a domingo", () => {
    const semana = chipRange("semana", HOY);
    expect(semana[0]).toBe("2026-07-27");   // lunes
    expect(semana[6]).toBe("2026-08-02");   // domingo
  });
  it("el fin de semana es sábado y domingo", () => {
    expect(chipRange("finde", HOY)).toEqual(["2026-08-01", "2026-08-02"]);
  });
  it("ayer, hoy y mañana", () => {
    expect(chipRange("ayer", HOY)).toEqual(["2026-07-28"]);
    expect(chipRange("hoy", HOY)).toEqual([HOY]);
    expect(chipRange("manana", HOY)).toEqual(["2026-07-30"]);
  });
});

describe("normalizePrio", () => {
  it("lee 'urgente' viejo como alta en vez de perderlo", () => {
    expect(normalizePrio("urgente")).toBe("alta");
  });
  it("cae a media si no reconoce el valor", () => {
    expect(normalizePrio("lo que sea")).toBe("normal");
    expect(normalizePrio(null)).toBe("normal");
  });
});

describe("toTask", () => {
  const members = { m1: { name: "Nath Ruiz", color: "#8B5CF6" } };
  it("traduce una fila con asignado", () => {
    const t = toTask({
      id: "t1", title: "Guionizar 5 hooks", description: "Para Peluna",
      status: "en_curso", priority: "urgente", due_date: "2026-07-29",
      rol: "copywriter", tipo: "ritmo", assignees: [{ member_id: "m1" }],
    }, members);
    expect(t).toMatchObject({
      titulo: "Guionizar 5 hooks", estado: "en_curso", prio: "alta",
      rol: "copywriter", tipo: "ritmo", who: "m1", whoNombre: "Nath Ruiz",
    });
  });
  it("muestra el rol de LA PERSONA, no el de la tarea", () => {
    const t = toTask(
      { id: "t9", title: "x", rol: "trafficker", assignees: [{ member_id: "m1" }] },
      { m1: { name: "Nath Ruiz", roles: ["copywriter"] } },
    );
    expect(t.whoRol).toBe("Copywriter");
  });

  it("sin asignado no inventa rol", () => {
    expect(toTask({ id: "t8", title: "x", assignees: [] }, {}).whoRol).toBe("");
  });

  it("una fila vieja sin rol ni tipo queda puntual y pendiente", () => {
    const t = toTask({ id: "t2", title: "Algo", status: null, assignees: [] }, {});
    expect(t).toMatchObject({ tipo: "puntual", rol: "", estado: "pendiente", who: null });
  });
  it("conserva TODOS los asignados aunque muestre uno", () => {
    const t = toTask({ id: "t3", title: "x", assignees: [{ member_id: "a" }, { member_id: "b" }] }, {});
    expect(t.who).toBe("a");
    expect(t.asignados).toEqual(["a", "b"]);
  });
});

describe("fechaTono", () => {
  it("hoy avisa en su propio tono", () => {
    expect(fechaTono(HOY, HOY)).toEqual({ texto: "Hoy", tono: "hoy" });
  });
  it("lo vencido dice cuánto hace", () => {
    expect(fechaTono("2026-07-28", HOY)).toEqual({ texto: "Ayer", tono: "vencido" });
    expect(fechaTono("2026-07-26", HOY)).toEqual({ texto: "hace 3 días", tono: "vencido" });
  });
  it("lo que viene queda tranquilo", () => {
    expect(fechaTono("2026-07-31", HOY)).toEqual({ texto: "Viernes", tono: "futuro" });
    expect(fechaTono("2026-08-20", HOY)).toEqual({ texto: "20 ago", tono: "futuro" });
  });
  it("sin fecha no dice nada", () => {
    expect(fechaTono("", HOY)).toEqual({ texto: "", tono: "" });
    expect(fechaTono(null, HOY)).toEqual({ texto: "", tono: "" });
  });
});

describe("enAlcanceSemana", () => {
  const t = (fecha, estado = "pendiente") => ({ fecha, estado });
  it("deja pasar lo de esta semana", () => {
    expect(enAlcanceSemana(t("2026-07-27"), HOY)).toBe(true);   // lunes
    expect(enAlcanceSemana(t("2026-08-02"), HOY)).toBe(true);   // domingo
  });
  it("deja pasar lo que no tiene fecha y sigue abierto", () => {
    expect(enAlcanceSemana(t(""), HOY)).toBe(true);
  });
  it("saca lo terminado aunque no tenga fecha — también es ruido", () => {
    expect(enAlcanceSemana(t("", "completado"), HOY)).toBe(false);
  });
  it("deja pasar lo atrasado sin cerrar", () => {
    expect(enAlcanceSemana(t("2026-04-01", "en_curso"), HOY)).toBe(true);
    expect(enAlcanceSemana(t("2026-04-01", "bloqueado"), HOY)).toBe(true);
  });
  it("saca lo terminado hace meses, que era el ruido", () => {
    expect(enAlcanceSemana(t("2026-04-01", "completado"), HOY)).toBe(false);
  });
  it("saca lo que cae después de esta semana", () => {
    expect(enAlcanceSemana(t("2026-08-20"), HOY)).toBe(false);
  });
  it("una tarea completada DENTRO de esta semana sí se ve", () => {
    expect(enAlcanceSemana(t(HOY, "completado"), HOY)).toBe(true);
  });
});

describe("groupByEstado", () => {
  it("son cuatro columnas y ninguna tarea se pierde", () => {
    const tasks = [
      { id: 1, estado: "pendiente" }, { id: 2, estado: "bloqueado" },
      { id: 3, estado: "completado" }, { id: 4, estado: "pendiente" },
    ];
    const cols = groupByEstado(tasks);
    expect(cols.map((c) => c.key)).toEqual(["pendiente", "en_curso", "completado", "bloqueado"]);
    expect(cols.reduce((n, c) => n + c.tasks.length, 0)).toBe(4);
  });
});

describe("groupByFecha", () => {
  const tasks = [
    { id: 1, fecha: HOY, estado: "pendiente" },
    { id: 2, fecha: "2026-07-28", estado: "pendiente" },
    { id: 3, fecha: "2026-07-28", estado: "completado" },
    { id: 4, fecha: "", estado: "pendiente" },
  ];
  it("sin días elegidos arranca en hoy", () => {
    const cols = groupByFecha(tasks, [], HOY, 3);
    expect(cols.slice(0, 3).map((c) => c.key)).toEqual([HOY, "2026-07-30", "2026-07-31"]);
    expect(cols[0].hoy).toBe(true);
  });
  it("con días elegidos muestra exactamente esos, ordenados", () => {
    const cols = groupByFecha(tasks, ["2026-07-31", "2026-07-28"], HOY);
    expect(cols.map((c) => c.key)).toEqual(["2026-07-28", "2026-07-31", ""]);
  });
  it("cuenta lo que quedó sin cerrar en los días pasados", () => {
    const [ayer] = groupByFecha(tasks, ["2026-07-28"], HOY);
    expect(ayer.pasado).toBe(true);
    expect(ayer.sinCerrar).toBe(1);   // la completada no cuenta
  });
  it("las tareas sin fecha no desaparecen", () => {
    const cols = groupByFecha(tasks, [HOY], HOY);
    expect(cols.at(-1)).toMatchObject({ key: "", label: "Sin fecha" });
  });
});

describe("groupByPersona", () => {
  const members = [{ id: "m1", name: "Nath", roles: ["copywriter"], color: "#8B5CF6" }];
  const tasks = [
    { id: 1, who: "m1", estado: "completado" },
    { id: 2, who: "m1", estado: "bloqueado" },
    { id: 3, who: null, estado: "pendiente" },
  ];
  it("cuenta hechas y bloqueos", () => {
    const [nath] = groupByPersona(tasks, members);
    expect(nath).toMatchObject({ nombre: "Nath", rol: "Copywriter", hechas: 1, bloqueos: 1 });
  });
  it("las sin dueño van a su propia tarjeta", () => {
    const cols = groupByPersona(tasks, members);
    expect(cols.at(-1)).toMatchObject({ id: null, nombre: "Sin asignar" });
  });
  it("no inventa la tarjeta 'Sin asignar' si todo está asignado", () => {
    const cols = groupByPersona([{ id: 1, who: "m1", estado: "pendiente" }], members);
    expect(cols).toHaveLength(1);
  });
});

describe("diasConTareas", () => {
  it("ignora las que no tienen fecha", () => {
    const s = diasConTareas([{ fecha: HOY }, { fecha: "" }, { fecha: HOY }]);
    expect([...s]).toEqual([HOY]);
  });
});

describe("iniciales", () => {
  it("toma dos letras de dos palabras", () => expect(iniciales("Nath Ruiz")).toBe("NR"));
  it("no se rompe con una sola palabra", () => expect(iniciales("Jose")).toBe("JO"));
  it("devuelve ? si no hay nombre", () => expect(iniciales("")).toBe("?"));
});

describe("faltaPara", () => {
  it("cuenta las horas que faltan", () => {
    expect(faltaPara("8:00", new Date(2026, 6, 29, 5, 0))).toBe("en 3 h");
  });
  it("pasa a minutos cuando está cerca", () => {
    expect(faltaPara("8:00", new Date(2026, 6, 29, 7, 35))).toBe("en 25 min");
  });
  it("si ya pasó, es mañana", () => {
    expect(faltaPara("8:00", new Date(2026, 6, 29, 9, 0))).toBe("mañana");
  });
});

describe("fromKey", () => {
  it("devuelve null si la clave no sirve", () => {
    expect(fromKey("2026-7-9")).toBeNull();
    expect(fromKey(null)).toBeNull();
  });
});

// ── Quién ────────────────────────────────────────────────────────────
describe("esDe", () => {
  const johan = "m-johan", ana = "m-ana";

  it("sin nadie elegido no filtra", () => {
    expect(esDe({ who: johan, asignados: [johan] }, [])).toBe(true);
    expect(esDe({ who: johan, asignados: [johan] }, null)).toBe(true);
  });

  it("mira a TODOS los asignados, no solo al primero", () => {
    // El bug que arregla: la tarjeta muestra al primero, pero el Content
    // Pipeline le asigna la tarea a todos los que tienen el rol. Filtrando por
    // el primero, el segundo editor no veia su propia tarea.
    const compartida = { who: johan, asignados: [johan, ana] };
    expect(esDe(compartida, [ana])).toBe(true);
    expect(esDe(compartida, [johan])).toBe(true);
  });

  it("deja afuera lo que no es de nadie de la lista", () => {
    expect(esDe({ who: johan, asignados: [johan] }, [ana])).toBe(false);
    expect(esDe({ who: null, asignados: [] }, [ana])).toBe(false);
  });

  it("funciona con tareas viejas que solo traen `who`", () => {
    expect(esDe({ who: johan, asignados: [] }, [johan])).toBe(true);
  });
});

describe("resumenDelDia", () => {
  const yo = "m-johan";
  const tareas = [
    { asignados: [yo], fecha: HOY, estado: "pendiente" },
    { asignados: [yo], fecha: HOY, estado: "en_curso" },
    { asignados: [yo], fecha: "2026-07-27", estado: "pendiente" },   // atrasada
    { asignados: [yo], fecha: "2026-07-20", estado: "completado" },  // cerrada, no cuenta
    { asignados: [yo], fecha: "", estado: "pendiente" },             // sin fecha, abierta
    { asignados: ["m-ana"], fecha: HOY, estado: "pendiente" },       // de otra persona
  ];

  it("cuenta lo mío de hoy, lo atrasado y lo abierto", () => {
    expect(resumenDelDia(tareas, [yo], HOY)).toEqual({ hoy: 2, atrasadas: 1, abiertas: 4 });
  });

  it("sin persona cuenta todo lo abierto", () => {
    expect(resumenDelDia(tareas, [], HOY).abiertas).toBe(5);
  });

  it("aguanta la lista vacía", () => {
    expect(resumenDelDia([], [yo], HOY)).toEqual({ hoy: 0, atrasadas: 0, abiertas: 0 });
  });
});

describe("agruparMiembrosPorRol", () => {
  const equipo = [
    { id: "1", name: "Johan", roles: ["editor"] },
    { id: "2", name: "Daniel", roles: ["project_manager"] },
    { id: "3", name: "Allison", roles: ["designer"] },
    { id: "4", name: "Peluna Pets", roles: ["owner"], is_owner: true },
    { id: "5", name: "UGCs Externo", roles: ["content"], is_ugc_pool: true },
    { id: "6", name: "Steven", roles: [] },
  ];
  const grupos = agruparMiembrosPorRol(equipo, { companyName: "Peluna Pets" });
  const porClave = Object.fromEntries(grupos.map((g) => [g.key, g.miembros.map((m) => m.name)]));

  it("saca de la lista de gente lo que no es gente", () => {
    // La fila de la empresa y el pool de creadoras salian mezclados con el
    // equipo, como si fueran personas con 0 tareas.
    expect(porClave.otros).toEqual(["Peluna Pets", "UGCs Externo"]);
    expect(porClave.designer).toEqual(["Allison"]);
  });

  it("no los borra: si una tarea quedó asignada ahí, hay que encontrarla", () => {
    expect(grupos.flatMap((g) => g.miembros).length).toBe(equipo.length);
  });

  it("agrupa por rol y en el orden en que se trabaja", () => {
    expect(grupos.map((g) => g.key)).toEqual(["project_manager", "editor", "designer", "sin_rol", "otros"]);
    expect(porClave.sin_rol).toEqual(["Steven"]);
  });

  it("sin nombre de empresa no adivina cuál fila es la empresa", () => {
    const sinNombre = agruparMiembrosPorRol(equipo, {});
    const otros = sinNombre.find((g) => g.key === "otros");
    expect(otros.miembros.map((m) => m.name)).toEqual(["UGCs Externo"]);
  });

  it("quien tiene varios roles aparece una sola vez, bajo el primero", () => {
    const g = agruparMiembrosPorRol([{ id: "1", name: "Johan", roles: ["editor", "content"] }]);
    expect(g.map((x) => x.key)).toEqual(["editor"]);
  });

  it("aguanta la lista vacía", () => {
    expect(agruparMiembrosPorRol([])).toEqual([]);
    expect(agruparMiembrosPorRol(null)).toEqual([]);
  });
});
