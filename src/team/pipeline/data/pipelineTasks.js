// El Content Pipeline le pasa el trabajo al Centro de Tareas.
//
// Mover 21 contenidos a Scripting no le avisaba a nadie: el copywriter tenía que
// ir a mirar el tablero del pipeline por su cuenta. Ahora cada etapa con trabajo
// pendiente genera UNA tarea por brief —no 21— con su barra de avance, asignada
// a quien de verdad la tiene que hacer.
//
// Una tarea por (brief, etapa) y no por empresa: los briefs son tandas, y una
// tanda tiene principio y fin. Agrupando por empresa la barra nunca llegaría a
// 100% porque siempre entra un brief nuevo.
//
// La mitad de arriba es pura y se testea. La de abajo habla con Supabase y reusa
// el motor que ya existía para el despliegue (`workspace/data/stageTasks.js`):
// resolver destinatarios por rol, reconciliar asignados sin duplicar y notificar
// solo a los nuevos.

import { database } from "../../../lib/backend.js";
import { logger } from "../../../lib/logger.js";
import { createNotification, memberRecipientKey } from "../../../notifications/notifications_db.js";
import { ETAPA_A_ROL, ETAPA_TITULO, trabajoDe, elTipoCambiaElTrabajo } from "../pipelineConstants.js";

// Qué rol se ocupa de cada etapa y cómo se llama su tarea. Viven en
// `pipelineConstants.js` —un archivo sin dependencias— para que la pantalla de
// Equipo los pueda leer sin arrastrarse este módulo con Supabase adentro.
export { ETAPA_A_ROL, ETAPA_TITULO };

// Tareas de pipeline que quedaron sin `auto_key`: las de antes de que existiera
// la clave. No se pueden reconciliar nunca —el upsert casa por `auto_key` y en
// Postgres dos NULL no colisionan, así que cada pasada inserta otra en vez de
// actualizar—, y por eso se acumulan solas.
//
// Pide `brief_id` para no llevarse por delante las del motor viejo del
// despliegue, que nunca lo setea y sigue siendo dueño de las suyas.
export function tareasSinClave(existentes) {
  return (existentes || []).filter((t) => t && !t.auto_key && t.brief_id).map((t) => t.id);
}

// Tareas de la clave de tres partes —`brief|etapa|fecha`—, de antes de separar
// videos de estáticos. Tampoco se reconcilian: la clave nueva lleva el tipo en
// el medio, así que nunca casan y el trabajo que describen ya lo cubre la tarea
// nueva.
//
// Van a la papelera y no a "completado": cerrarlas las dejaba en la columna
// Hecho diciendo "0 de 17 listos", que es la definición de una tarea que miente
// —nadie las hizo, quedaron obsoletas—. Es lo mismo que ensuciaba el Resumen.
export function tareasDeClaveVieja(existentes) {
  return (existentes || [])
    .filter((t) => t?.auto_key && t.brief_id && String(t.auto_key).split("|").length === 3)
    .map((t) => t.id);
}


// El campo del slot que dice QUIÉN lo hace, cuando está asignado a mano. Sirve
// para que la tarea de edición le caiga al editor que José eligió y no a todos.
const ETAPA_A_CAMPO_PERSONA = {
  film: "creador",
  edit: "editor",
};

export const ETAPAS_CON_TAREA = Object.keys(ETAPA_A_ROL);

// ── Qué cuenta como terminado ────────────────────────────────────────
// Un check explícito, y nada más.
//
// La primera versión lo deducía de campos que ya existían: la carpeta del
// creativo llena valía por "editado". Pero esa carpeta se prepara ANTES de que
// nadie edite, así que la tarea decía 20 de 37 con cero videos hechos. Un campo
// que se llena por otra razón no mide trabajo.
export function hechoEnEtapa(slot) {
  return !!slot.stage_done;
}

// Los grupos vivos: uno por (brief, etapa, FECHA DE ENTREGA).
//
// Por fecha y no solo por etapa porque el editor entra a la mañana a ver qué
// tiene que sacar HOY. Una sola tarea de "37 videos" no contesta esa pregunta;
// "5 transformacionales para hoy" sí. Los que no tienen fecha van juntos en su
// propio grupo, para que no desaparezcan.
//
// Devuelve [{ key, briefId, briefName, etapa, fecha, done, total, slotIds,
// conceptos, nombres }].
export function resumenPorBriefEtapa(briefs, slots) {
  const nombreDeBrief = Object.fromEntries((briefs || []).map((b) => [b.id, b.n || b.name || "Brief"]));
  const grupos = new Map();

  for (const s of slots || []) {
    if (!s.brief || !ETAPAS_CON_TAREA.includes(s.stage)) continue;
    const fecha = s.due || "";
    // El TIPO entra en la clave SOLO donde cambia el trabajo: editar un video y
    // diseñar un estático son de gente distinta y sin esto llegaban juntos como
    // "Editar videos". Publicar, en cambio, es lo mismo para los dos, y
    // separarlo le dejaba al trafficker dos tareas iguales el mismo día.
    const tipo = elTipoCambiaElTrabajo(s.stage)
      ? (s.tipo === "estatico" ? "estatico" : "video")
      : "";
    const key = `${s.brief}|${s.stage}|${tipo}|${fecha}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        briefId: s.brief,
        briefName: nombreDeBrief[s.brief] || "Brief",
        etapa: s.stage,
        tipo,
        fecha,
        done: 0,
        total: 0,
        slotIds: [],
        conceptos: new Set(),
        porConcepto: {},
        nombres: new Set(),
      });
    }
    const g = grupos.get(key);
    g.total += 1;
    if (hechoEnEtapa(s)) g.done += 1;
    g.slotIds.push(s.id);
    if (s.concepto) {
      g.conceptos.add(s.concepto);
      g.porConcepto[s.concepto] = (g.porConcepto[s.concepto] || 0) + 1;
    }
    const campo = ETAPA_A_CAMPO_PERSONA[s.stage];
    const quien = campo ? (s[campo] || "").trim() : "";
    if (quien && !/^sin (asignar|creador|editor)$/i.test(quien)) g.nombres.add(quien);
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, conceptos: [...g.conceptos], nombres: [...g.nombres] }))
    .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || a.etapa.localeCompare(b.etapa));
}

// Título de la tarea: qué hay que hacer y de qué.
//
// Antes, con más de un concepto mezclado, caía al nombre del brief — así una
// tanda de Educativo y Oferta se llamaba "Editar videos · Brief 1", que no le
// dice nada a quien la abre. Ahora los nombra. Con tres o más se cortan: el
// título tiene que caber en una tarjeta.
export const tituloTarea = (g) => {
  const { titulo } = trabajoDe(g.etapa, g.tipo);
  const cs = g.conceptos || [];
  const detalle = cs.length === 0 ? g.briefName
    : cs.length === 1 ? cs[0]
      : cs.length === 2 ? `${cs[0]} y ${cs[1]}`
        : `${cs[0]}, ${cs[1]} y ${cs.length - 2} más`;
  return `${titulo} · ${detalle}`;
};

// Lo que se lee al abrirla: cuánto va y de qué está hecho.
//
// "0 de 17 listos" no dice qué son esos 17. El desglose por concepto sí, y es lo
// que permite calcular cuánto trabajo es sin abrir el checklist.
export const descripcionTarea = (g) => {
  if (!g.total) return "";
  const base = `${g.done} de ${g.total} ${g.done === 1 ? "listo" : "listos"}`;
  const cs = g.conceptos || [];
  if (cs.length < 2) return base;
  const desglose = cs.map((c) => `${c} ${g.porConcepto?.[c] || 0}`).join(" · ");
  return `${base} · ${desglose}`;
};

// ¿El grupo ya terminó? Con todo hecho la tarea se cierra sola.
export const grupoCompleto = (g) => g.total > 0 && g.done >= g.total;

// ── A quién se le asigna ─────────────────────────────────────────────
// Cascada: los que están asignados a mano en los slots → los que tienen el rol →
// el owner. Nunca se deja una tarea sin dueño, porque una tarea de nadie no la
// hace nadie.
export function elegirDestinatarios(grupo, miembros) {
  const porNombre = (n) => (miembros || []).find(
    (m) => (m.name || "").trim().toLowerCase() === n.trim().toLowerCase(),
  );
  const explicitos = grupo.nombres.map(porNombre).filter(Boolean);
  if (explicitos.length) return explicitos;

  // El rol depende del TIPO, no solo de la etapa: los estáticos son del
  // diseñador aunque compartan la etapa "edit" con los videos.
  const { rol } = trabajoDe(grupo.etapa, grupo.tipo);
  const delRol = (miembros || []).filter((m) => Array.isArray(m.roles) && m.roles.includes(rol));
  if (delRol.length) return delRol;

  return (miembros || []).filter((m) => m.is_owner);
}

// ── Efectos ──────────────────────────────────────────────────────────
//
// TODO en lotes, a propósito. La primera versión hacía una tanda de consultas
// por grupo —update, leer asignados, insertar, notificar— y con siete grupos eran
// unas cuarenta consultas en fila. Cada una pide el lock de auth de Supabase, así
// que el navegador se atascaba con "Lock inforce-local-auth was not released
// within 5000ms" y la pasada se cortaba a la mitad: se creaban tres tareas de
// siete. Ahora son cinco consultas, pase lo que pase.

// Dos pasadas a la vez se pisan: la segunda no ve lo que insertó la primera y
// pelean por el mismo `auto_key`. Con una alcanza.
//
// Pero DESCARTAR la segunda perdía trabajo, y eso es lo que hacía la versión
// anterior. Una pasada tarda varios segundos —lee equipo, empresa y tareas, hace
// el upsert, rehace asignados, manda avisos—, así que cambiar tres fechas
// seguidas sincronizaba la primera y tiraba las otras dos: el contenido quedaba
// con la fecha nueva y la tarea seguía mostrando la vieja. Era el "hice
// modificaciones de agenda y no se vieron reflejadas".
//
// Ahora la que llega tarde no se pierde: se anota, y al terminar la que estaba
// corriendo se vuelve a correr UNA vez con los datos más nuevos. Varias seguidas
// colapsan en una sola repetición —lo que importa es el último estado, no cada
// paso intermedio.
export function unaALaVez(fn) {
  let corriendo = false;
  let pendiente = null;   // argumentos de la última llamada que llegó ocupada
  const correr = async (...args) => {
    if (corriendo) { pendiente = args; return; }
    corriendo = true;
    try {
      await fn(...args);
    } finally {
      corriendo = false;
      // Los argumentos se limpian ANTES de volver a llamar, para que la
      // repetición pueda anotar la suya sin pisarse.
      if (pendiente) {
        const otros = pendiente;
        pendiente = null;
        await correr(...otros);
      }
    }
  };
  return correr;
}

export const syncPipelineTasks = unaALaVez(async (companyId, briefs, slots) => {
  if (!companyId) return;
  try {
    const grupos = resumenPorBriefEtapa(briefs, slots);

    // (1-3) Todo lo que hace falta saber, de una.
    const [{ data: miembros }, { data: empresa }, { data: existentes }] = await Promise.all([
      database.from("company_team_members").select("id, name, roles, is_owner").eq("company_id", companyId),
      database.from("companies").select("name, slug").eq("id", companyId).maybeSingle(),
      database.from("company_tasks")
        .select("id, auto_key, status, brief_id")
        .eq("company_id", companyId).eq("auto_generated", true).is("deleted_at", null),
    ]);

    const porKey = new Map();
    for (const t of existentes || []) if (t.auto_key) porKey.set(t.auto_key, t);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // El link cae en el BRIEF y la ETAPA de la tarea, no en el módulo pelado:
    // "Editar videos · Brief 1" tiene que llevar a ese brief, no a la vista de
    // embudo con todo junto. Lo leen tanto la página del pipeline como los links
    // que salen del portal (notificaciones, correo).
    const linkPipeline = (g) => (empresa?.slug
      ? `${origin}/cliente/${empresa.slug}/pipeline?brief=${encodeURIComponent(g.briefId)}&etapa=${encodeURIComponent(g.etapa)}`
      : "");
    const ahora = new Date().toISOString();

    const filas = [];
    const destinatarios = new Map();   // auto_key → [memberId]
    const esNueva = new Set();

    for (const g of grupos) {
      const targets = elegirDestinatarios(g, miembros);
      if (!targets.length) continue;
      const completo = grupoCompleto(g);
      const ya = porKey.get(g.key);
      if (!ya && completo) continue;   // no se crea una tarea para algo terminado
      if (!ya) esNueva.add(g.key);

      destinatarios.set(g.key, targets.map((t) => t.id));
      filas.push({
        // SIN `id`, ni siquiera para las que ya existen.
        //
        // Mandarlo parecía inofensivo y rompía el upsert entero: PostgREST
        // normaliza el lote a la unión de las claves de todas las filas, así que
        // en cuanto UNA traía `id`, a las nuevas les metía `id: null` explícito
        // —que pisa el default `gen_random_uuid()`— y Postgres rechazaba la
        // tanda completa con "null value in column id". Como el upsert corta la
        // pasada, tampoco se rehacían asignados ni se cerraban huérfanas.
        //
        // Por eso las tareas nuevas dejaban de aparecer apenas la empresa tenía
        // una tarea vieja: el primer lote de una empresa era uniforme y entraba;
        // los siguientes venían mezclados y fallaban todos.
        //
        // No hace falta: el conflicto se resuelve por `auto_key`, que es único.
        company_id: companyId,
        brief_id: g.briefId,
        stage_kind: g.etapa,
        auto_key: g.key,
        slot_id: g.slotIds[0] || null,
        auto_generated: true,
        title: tituloTarea(g),
        description: descripcionTarea(g),
        auto_done: g.done,
        auto_total: g.total,
        // Sin fecha se queda sin fecha: meterla en el día de hoy sería inventar
        // una entrega que nadie pactó.
        due_date: g.fecha || null,
        link_url: linkPipeline(g),
        priority: "normal",
        created_by_label: "Content Pipeline",
        updated_at: ahora,
        // Si el grupo volvió a tener pendientes, la tarea se reabre: el trabajo
        // existe otra vez y una tarea cerrada no se lo recuerda a nadie.
        status: completo ? "completado" : "pendiente",
        completed_at: completo ? ahora : null,
      });
    }

    // (4) Un solo upsert para crear y actualizar. `auto_key` es único, así que
    // no hay forma de terminar con dos tareas describiendo el mismo trabajo.
    let guardadas = [];
    if (filas.length) {
      const { data, error } = await database
        .from("company_tasks").upsert(filas, { onConflict: "auto_key" }).select("id, auto_key");
      if (error) { logger.error("[syncPipelineTasks] upsert", error); return; }
      guardadas = data || [];
    }
    const idPorKey = new Map(guardadas.map((t) => [t.auto_key, t.id]));
    const vivas = new Set(guardadas.map((t) => t.id));

    // (5) Asignados: se rehacen solo los de las tareas cuyo equipo cambió.
    const ids = [...idPorKey.values()];
    if (ids.length) {
      const { data: actuales } = await database
        .from("company_task_assignees").select("task_id, member_id").in("task_id", ids);
      const porTarea = new Map(ids.map((id) => [id, new Set()]));
      for (const a of actuales || []) porTarea.get(a.task_id)?.add(a.member_id);

      const rehacer = [], nuevasFilas = [];
      for (const [key, quiero] of destinatarios) {
        const id = idPorKey.get(key);
        if (!id) continue;
        const hay = porTarea.get(id) || new Set();
        const igual = quiero.length === hay.size && quiero.every((m) => hay.has(m));
        if (igual) continue;
        rehacer.push(id);
        for (const m of quiero) nuevasFilas.push({ task_id: id, member_id: m });
      }
      if (rehacer.length) {
        await database.from("company_task_assignees").delete().in("task_id", rehacer);
        if (nuevasFilas.length) await database.from("company_task_assignees").insert(nuevasFilas);
      }
    }

    // Lo que quedó abierto y ya no corresponde a ningún grupo: el brief se borró,
    // o los slots cambiaron de etapa o de fecha.
    const huerfanas = (existentes || [])
      .filter((t) => !vivas.has(t.id) && t.status !== "completado")
      .map((t) => t.id);
    if (huerfanas.length) {
      await database.from("company_tasks")
        .update({ status: "completado", completed_at: ahora, updated_at: ahora })
        .in("id", huerfanas);
    }

    // Tareas de pipeline anteriores a `auto_key`: a la papelera.
    //
    // No se pueden reconciliar nunca. El upsert casa por `auto_key`, y en Postgres
    // dos NULL no colisionan, así que cada pasada INSERTA otra en vez de
    // actualizar la que ya estaba: así aparecieron cuatro "Grabar contenido ·
    // Brief 1" y dos "Editar videos" para el mismo trabajo, con títulos de una
    // versión vieja. Cerrarlas no alcanza —quedan a la vista en Hecho—, y como el
    // trabajo que describen ya lo cubre la tarea con clave, lo honesto es sacarlas.
    //
    // La condición pide `brief_id`: eso las marca como hijas de ESTE motor. Las
    // del motor viejo del despliegue no lo tienen y no se tocan.
    // Junto con las de la clave de tres partes, que quedaron obsoletas al
    // separar videos de estáticos.
    const legado = [...new Set([...tareasSinClave(existentes), ...tareasDeClaveVieja(existentes)])];
    if (legado.length) {
      // Borrado suave: quedan en la Papelera por si hiciera falta mirarlas.
      await database.from("company_tasks")
        .update({ deleted_at: ahora, updated_at: ahora })
        .in("id", legado);
      logger.info(`[syncPipelineTasks] ${legado.length} tareas de una clave vieja a la papelera`);
    }

    // Las notificaciones van al final y en paralelo: si una falla, no puede
    // dejar el tablero a medio armar.
    const avisos = [];
    for (const key of esNueva) {
      const g = grupos.find((x) => x.key === key);
      for (const memberId of destinatarios.get(key) || []) {
        avisos.push(createNotification({
          recipientKey: memberRecipientKey(memberId),
          kind: "task_assigned",
          title: tituloTarea(g),
          body: `${descripcionTarea(g)} · ${empresa?.name || ""}`.trim(),
          linkUrl: empresa?.slug ? `${origin}/cliente/${empresa.slug}/tareas` : "",
          companyId,
          companyName: empresa?.name || "",
          metadata: { briefId: g.briefId, etapa: g.etapa, fecha: g.fecha },
        }));
      }
    }
    if (avisos.length) await Promise.allSettled(avisos);
  } catch (e) {
    logger.error("[syncPipelineTasks] falló", e);
  }
});
