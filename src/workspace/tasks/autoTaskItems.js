import { database } from "../../lib/backend.js";

// Los contenidos que hay detrás de una tarea automática del Content Pipeline.
//
// La tarea guarda `auto_key` = `brief|etapa|tipo|fecha`, así que desde ahí se
// llega a los slots exactos sin duplicar la lista en ningún lado: la fuente
// sigue siendo el pipeline, y la tarea es una vista suya.
//
// El agrupado por concepto es el que pidió José: él arma las tandas así
// ("transformacionales, 6 de 10"), y un editor que abre su tarea a la mañana
// necesita ver eso, no 37 números seguidos.

// 'b1|edit|video|2026-08-06' → { briefId, etapa, tipo, fecha }
//
// El `tipo` entró en la clave cuando diseñar estáticos dejó de ser editar
// videos. Las tareas viejas quedaron con la clave de tres partes y se cierran
// solas en la primera pasada del sync, pero mientras tanto se abren: sin este
// caso, la tercera parte se leía como fecha y la consulta pedía `due = 'video'`
// —un texto donde va una fecha—, que es lo que rompía la lista.
export function parseAutoKey(key) {
  const partes = String(key || "").split("|");
  if (partes.length < 3) return null;
  const [briefId, etapa] = partes;
  if (partes.length >= 4) return { briefId, etapa, tipo: partes[2] || "", fecha: partes[3] || "" };
  return { briefId, etapa, tipo: "", fecha: partes[2] || "" };
}

// Agrupa por concepto conservando el orden de aparición: los contenidos ya
// vienen ordenados por número, así que el primer concepto que aparece es el
// primero de la tanda.
export function agruparPorConcepto(slots) {
  const grupos = [];
  const porNombre = new Map();
  for (const s of slots || []) {
    const nombre = s.concepto || "Sin concepto";
    if (!porNombre.has(nombre)) {
      const g = { concepto: nombre, items: [] };
      porNombre.set(nombre, g);
      grupos.push(g);
    }
    porNombre.get(nombre).items.push(s);
  }
  return grupos.map((g) => ({
    ...g,
    done: g.items.filter((s) => s.stage_done).length,
    total: g.items.length,
  }));
}

// Lo que se ve como título de cada línea: "#001 · Mal aliento — Transformacional".
export function etiquetaItem(s) {
  const num = `#${String(s.num ?? 0).padStart(3, "0")}`;
  const resto = [s.producto, s.angulo, s.descripcion].map((x) => (x || "").trim()).filter(Boolean).join(" · ");
  return resto ? `${num}  ${resto}` : num;
}

export async function listAutoTaskSlots(autoKey) {
  const k = parseAutoKey(autoKey);
  if (!k) return [];
  let q = database
    .from("pipeline_slots")
    .select("id, num, producto, angulo, concepto, descripcion, stage_done, due")
    .eq("brief_id", k.briefId)
    .eq("stage", k.etapa)
    .order("num", { ascending: true });
  // La fecha vacía es un grupo real —"los que todavía no tienen día"—, no la
  // ausencia de filtro.
  q = k.fecha ? q.eq("due", k.fecha) : q.is("due", null);
  // Mismo criterio que arma la tarea (`pipelineTasks.js`): todo lo que no diga
  // "estatico" es un video, incluidos los slots viejos sin tipo. Sin este
  // filtro, "Diseñar estáticos" listaría también los videos del mismo día.
  if (k.tipo === "estatico") q = q.eq("tipo", "estatico");
  else if (k.tipo) q = q.or("tipo.is.null,tipo.neq.estatico");
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function setSlotDone(slotId, done) {
  const { error } = await database
    .from("pipeline_slots")
    .update({ stage_done: !!done })
    .eq("id", slotId);
  if (error) throw error;
}

// Deja el contador de la tarea al día en el mismo gesto. Sin esto la barra
// esperaría a la próxima pasada del sync y el check se sentiría muerto.
export async function refrescarAvance(taskId, done, total) {
  const cerrada = total > 0 && done >= total;
  await database.from("company_tasks").update({
    auto_done: done,
    auto_total: total,
    description: total ? `${done} de ${total} ${done === 1 ? "listo" : "listos"}` : "",
    ...(cerrada
      ? { status: "completado", completed_at: new Date().toISOString() }
      : { status: "pendiente", completed_at: null }),
    updated_at: new Date().toISOString(),
  }).eq("id", taskId);
}
