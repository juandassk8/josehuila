// Content Pipeline — hook de datos con persistencia REAL (Supabase) y fallback a
// DEMO si aún no se corrió db/content_pipeline.sql. Expone la MISMA API que el
// store mock, así los componentes no cambian.
//
// - Carga real → persiste cada cambio (optimista + write).
// - Si las tablas no existen (error de carga) → semilla demo en memoria (no
//   persiste) para que el preview siga usable hasta correr el SQL.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { database } from "../../../lib/backend.js";
import { logger } from "../../../lib/logger.js";
import { toastError, toastSuccess } from "../../../lib/toast.js";
import { STAGES, NIVELES, isCampaignOrLater, etapaRealPara } from "../pipelineConstants.js";
import { dayKey } from "../../../workspace/tasks/centerModel.js";
import { CATALOGS, BANK, seed, makeSlot } from "./pipelineMock.js";
import { listMembers } from "../../data/db.js";
import { upsertVoiceProfile } from "../../../workspace/guiones/workspace_guiones_db.js";
import { listBriefs, listSlots, listSlotsOfBrief, insertBrief, insertSlots, updateSlotRow, deleteSlotRow, deleteSlotRows, deleteBriefRow, restoreBriefRow, purgeBriefRow, moveBriefStageRows, reserveSlotNums, listCompanyCreatives, listCompanyReferences, setReferenceCoverDb, resolveCoversForVariations, toggleDiscardedRefDb, upsertProducedFromSlot, deleteProducedForSlot, saveGeneratedScriptRow , renumerarSlots} from "./pipelineDb.js";

import { moveReferenteEverywhere } from "../../concept_bank/db.js";
import { learnFromSlotEdits } from "./scriptAI.js";
import { isUsableCover } from "../../../lib/coverUrl.js";
import { renumerar } from "../numeracion.js";

// id de una referencia (soporta snapshot objeto nuevo o id string legacy).
const refId = (r) => (typeof r === "string" ? r : r?.id);

const angleTitles = (p) => (p?.touchpoints?.angles || []).map((a) => a.title).filter(Boolean);
// El próximo número en modo demo. Mira TODOS los slots de la pantalla, no los
// del brief: en demo la numeración tiene que verse igual de correlativa que en
// producción, o el modo demo enseña una nomenclatura que no existe.
const numDemo = (slots, cuantos = 1) => Math.max(0, ...slots.map((s) => Number(s.num) || 0)) + cuantos;

// Etapas en las que el slot ya es un creativo producido (se refleja en el despliegue).
const PRODUCED_STAGES = ["campaign", "feedback"];
// Entrar a campaña reinicia la fecha: el día que lo movés es el día que se sube.
//
// La fecha de un contenido es la de la etapa en la que está. Mientras estaba en
// To Edit decía cuándo había que editarlo; al pasarlo a In Campaign esa fecha
// deja de significar nada y la fila queda diciendo "hace 2 días" sobre algo que
// hay que publicar hoy.
//
// SOLO campaña. Generalizarlo a todas las etapas era lo obvio y está mal: las
// fechas de To Edit vienen escalonadas —un día por tanda— o sea que están
// planificadas de antemano, y reiniciarlas al mover un lote borraría esa
// planificación. En campaña no hay nada que planificar: se publica cuando llega.
export function fechaAlEntrar(nuevaEtapa, etapaPrevia) {
  if (nuevaEtapa !== "campaign" || etapaPrevia === "campaign") return {};
  return { due: dayKey(new Date()) };
}

// Sincroniza el creativo producido en el despliegue: lo crea/actualiza al entrar a
// campaign/feedback y lo RETIRA al salir de esas etapas (para que no queden fantasmas).
const syncSlotProduced = (prevStage, slot) => {
  if (!slot?.concept_id) return;
  if (PRODUCED_STAGES.includes(slot.stage)) {
    upsertProducedFromSlot(slot).catch((e) => logger.warn("sync creativo producido falló (¿falta correr el SQL?)", e?.message || e));
  } else if (PRODUCED_STAGES.includes(prevStage)) {
    deleteProducedForSlot(slot.id).catch((e) => logger.warn("retirar creativo producido falló", e?.message || e));
  }
};

export function usePipeline(companyId) {
  const [briefs, setBriefs] = useState([]);
  const [slots, setSlots] = useState([]);
  // Los briefs borrados. Viven en la misma tabla con `deleted_at` puesto: acá
  // están para poder mostrarlos y devolverlos, no como copia de nada.
  const [papelera, setPapelera] = useState([]);
  const [creatives, setCreatives] = useState([]);   // creativos reales de la empresa
  const [owners, setOwners] = useState([]);          // responsables (miembros reales del equipo)
  const [products, setProducts] = useState([]);      // company_voice_profile.products (fuente única)
  const [niche, setNiche] = useState("");            // nicho de la empresa (plantilla de info)
  // Nivel 1-5 de sofisticación del mercado (Módulo 2). Define el REGISTRO del
  // guion y viaja al prompt vía company_voice_profile. `null` = sin definir.
  const [sofisticacion, setSofisticacion] = useState(null);
  const [references, setReferences] = useState([]);
  // El orden que la cuenta eligió en su Despliegue: el selector respeta lo mismo.
  const [prioridades, setPrioridades] = useState(null);
  const [refConcepts, setRefConcepts] = useState([]); // conceptos del board (destinos de "Mover")
  const [discardedRefIds, setDiscardedRefIds] = useState(() => new Set()); // "no recrear"
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsError, setRefsError] = useState(false);
  const refsLoadedRef = useRef(false);
  const [demo, setDemo] = useState(false);
  // "Ya sé qué hay en esta empresa". Sin esto, `briefs` y `slots` valen `[]`
  // tanto cuando la empresa está vacía como cuando todavía no cargó, y quien
  // mira desde afuera no puede distinguirlos.
  //
  // No es una sutileza: el sincronizador de tareas cierra como huérfana toda
  // tarea que no corresponda a ningún grupo. Corriendo con los arreglos vacíos
  // concluye que no hay trabajo en ninguna parte y manda el tablero entero a
  // completado. Es lo que le pasó a Peluna Pets: 22 tareas cerradas solas,
  // incluida una de 0 de 17.
  const [cargado, setCargado] = useState(false);
  const demoRef = useRef(false);
  // Refs al estado más reciente: evitan que ediciones back-to-back en el mismo
  // tick lean valores stale (productos) y que el sync lea un slot desactualizado.
  const slotsRef = useRef([]);
  const productsRef = useRef([]);
  const briefsRef = useRef([]);
  const papeleraRef = useRef([]);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { briefsRef.current = briefs; }, [briefs]);
  useEffect(() => { papeleraRef.current = papelera; }, [papelera]);

  // Fuente de "conceptos" para Planear creativos / referencias: creativos reales
  // de la empresa si los hay; si no, el banco de muestra.
  const conceptSource = creatives.length ? creatives : BANK;

  // Catálogos para los selects del meta row. Todo gira alrededor del PRODUCTO:
  // productos = nombres; ángulos/creadores = unión de todos los productos (el meta
  // row filtra por el producto elegido); conceptos = del despliegue; editores =
  // miembros. En demo, cae al mock.
  const catalogs = useMemo(() => {
    if (demo) return CATALOGS;
    return {
      productos: products.map((p) => p.name).filter(Boolean),
      angulos: [...new Set(products.flatMap(angleTitles))],
      conceptos: [...new Set(creatives.map((c) => c.name))],
      // Concepto → su etapa del embudo en el banco. Elegir el concepto en el
      // slot completa el nivel de conciencia solo, en vez de pedir dos veces
      // el mismo dato que el banco ya tiene.
      nivelPorConcepto: Object.fromEntries(
        creatives.filter((c) => NIVELES.some((n) => n.key === c.stage)).map((c) => [c.name, c.stage]),
      ),
      creadores: [...new Set(products.flatMap((p) => p.creators || []))],
      editores: owners,
    };
  }, [products, creatives, owners, demo]);

  // Carga inicial por empresa.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Creativos reales de la empresa (para Planear creativos). No bloquea.
      listCompanyCreatives(companyId).then((c) => { if (alive) setCreatives(c); }).catch(() => {});
      // Responsables = miembros reales del equipo (no mock). No bloquea.
      // Solo los que siguen en el equipo: el selector de responsable de un brief
      // es para repartir trabajo NUEVO, y a quien se dio de baja no se le reparte.
      listMembers().then(({ data }) => {
        if (alive) setOwners((data || []).filter((m) => m.active !== false).map((m) => m.name).filter(Boolean));
      }).catch(() => {});
      // Productos + nicho de la empresa (fuente única: company_voice_profile). No bloquea.
      database.from("company_voice_profile").select("products, niche, market_sophistication").eq("company_id", companyId).maybeSingle()
        .then(({ data }) => { if (!alive) return; setProducts(Array.isArray(data?.products) ? data.products : []); setNiche(data?.niche || ""); setSofisticacion(data?.market_sophistication ?? null); })
        .catch((e) => logger.warn("cargar productos/nicho falló", e?.message || e));
      try {
        const [b, todosLosSlots] = await Promise.all([listBriefs(companyId), listSlots(companyId)]);
        if (!alive) return;
        // `listBriefs` trae vivos y papelera juntos —una sola consulta— y acá se
        // parten. Los contenidos de un brief borrado siguen en la tabla, así que
        // hay que dejarlos afuera a mano: si no, aparecerían sueltos en Etapas,
        // que es justo lo que hacía inviable archivar en vez de borrar.
        const enPapelera = new Set(b.filter((x) => x.deleted_at).map((x) => x.id));
        setBriefs(b.filter((x) => !x.deleted_at));
        setPapelera(b.filter((x) => x.deleted_at));
        const s = todosLosSlots.filter((sl) => !enPapelera.has(sl.brief));
        setSlots(s); setDemo(false); demoRef.current = false; setCargado(true);
        // Refrescar portadas de referentes ya pegados cuyo snapshot quedó con una
        // portada fbcdn vencida → usar la permanente (subida al banco). Persiste.
        const stale = [];
        for (const sl of s) for (const r of (sl.refs || [])) if (typeof r === "object" && r?.id && !isUsableCover(r.file_url)) stale.push(r.id);
        if (stale.length) {
          resolveCoversForVariations(stale).then((coverById) => {
            if (!alive || !Object.keys(coverById).length) return;
            // Puro: computa desde la ref más reciente + persiste FUERA del updater.
            const affected = [];
            const next = slotsRef.current.map((sl) => {
              let changed = false;
              const refs = (sl.refs || []).map((r) => {
                if (typeof r === "object" && r?.id && coverById[r.id] && coverById[r.id] !== r.file_url) { changed = true; return { ...r, file_url: coverById[r.id] }; }
                return r;
              });
              if (changed) affected.push({ id: sl.id, refs });
              return changed ? { ...sl, refs } : sl;
            });
            if (affected.length) {
              setSlots(next);
              affected.forEach((a) => updateSlotRow(a.id, { refs: a.refs }).catch(() => {}));
            }
          }).catch(() => {});
        }
      } catch (e) {
        // Tablas ausentes o sin acceso → demo en memoria.
        logger.warn("[pipeline] cayendo a demo (¿falta correr content_pipeline.sql?)", e?.message || e);
        if (!alive) return;
        const d = seed(companyId);
        setBriefs(d.briefs); setSlots(d.slots); setDemo(true); demoRef.current = true; setCargado(true);
      }
    })();
    // Cambiar de empresa vuelve a dejarlo en falso: los datos que hay en memoria
    // son de la anterior, y sincronizar con ellos sería peor que no sincronizar.
    return () => { alive = false; setCargado(false); setPapelera([]); };
  }, [companyId]);

  const isDemo = () => demoRef.current;

  // Referentes reales: se cargan LAZY la primera vez que se abre el picker (evita
  // pagar el costo si el usuario nunca elige del banco). Se resetean al cambiar de empresa.
  useEffect(() => { refsLoadedRef.current = false; setReferences([]); setRefConcepts([]); setDiscardedRefIds(new Set()); setRefsError(false); }, [companyId]);
  const ensureReferences = useCallback(async () => {
    if (refsLoadedRef.current || demoRef.current) return;
    refsLoadedRef.current = true;
    setRefsLoading(true); setRefsError(false);
    try { const res = await listCompanyReferences(companyId); setReferences(res.references); setRefConcepts(res.concepts); setDiscardedRefIds(new Set(res.discarded || [])); setPrioridades(res.prioridades || null); }
    catch (e) { logger.error("cargar referentes falló", e?.message || e); refsLoadedRef.current = false; setRefsError(true); }
    finally { setRefsLoading(false); }
  }, [companyId]);

  // Referentes ya USADOS (elegidos en cualquier slot) y ya CREADOS (usados en un
  // slot que llegó a campaign/feedback). Derivados de los slots — sin datos nuevos.
  const usedRefIds = useMemo(() => {
    const s = new Set();
    for (const sl of slots) for (const r of (sl.refs || [])) if (typeof r === "object" && r?.id) s.add(r.id);
    return s;
  }, [slots]);
  const createdRefIds = useMemo(() => {
    const s = new Set();
    for (const sl of slots) if (isCampaignOrLater(sl.stage)) for (const r of (sl.refs || [])) if (typeof r === "object" && r?.id) s.add(r.id);
    return s;
  }, [slots]);

  // Aplica un patch a los snapshots pegados que tengan el referente `refIdVal`,
  // de forma PURA: devuelve los slots nuevos + la lista a persistir (sin escribir
  // dentro del updater de setState). Reusado por mover y portada.
  const patchPeggedRef = (refIdVal, patch) => {
    const affected = [];
    const nextSlots = slotsRef.current.map((s) => {
      const cur = Array.isArray(s.refs) ? s.refs : [];
      if (!cur.some((r) => typeof r === "object" && r.id === refIdVal)) return s;
      const refs = cur.map((r) => (typeof r === "object" && r.id === refIdVal ? { ...r, ...patch } : r));
      affected.push({ id: s.id, refs });
      return { ...s, refs };
    });
    return { nextSlots, affected };
  };

  // Descartar / recuperar un referente (persistente en board.config). Los escritos
  // se SERIALIZAN (cadena de promesas) para no pisarse (read-modify-write del jsonb).
  const discardChainRef = useRef(Promise.resolve());
  const toggleDiscardRef = useCallback((refIdVal) => {
    const willDiscard = !discardedRefIds.has(refIdVal);
    setDiscardedRefIds((prev) => {
      const next = new Set(prev);
      if (willDiscard) next.add(refIdVal); else next.delete(refIdVal);
      return next;
    });
    if (!demoRef.current) {
      discardChainRef.current = discardChainRef.current
        .then(() => toggleDiscardedRefDb(companyId, refIdVal, willDiscard))
        .catch((e) => { logger.error("descartar referente falló", e); toastError("No se pudo guardar"); });
    }
  }, [companyId, discardedRefIds]);

  // Mover un referente a otro concepto (board del cliente + banco general).
  const moveReference = useCallback(async (variation, targetConcept) => {
    const patch = { concept_id: targetConcept.id, concept_name: targetConcept.name, stage: targetConcept.stage, format: targetConcept.format };
    setReferences((prev) => prev.map((r) => (r.id === variation.id ? { ...r, ...patch } : r)));
    const { nextSlots, affected } = patchPeggedRef(variation.id, patch);
    setSlots(nextSlots);
    if (demoRef.current) return;
    affected.forEach((a) => updateSlotRow(a.id, { refs: a.refs }).catch((e) => logger.error("persistir movida en slot falló", e)));
    try {
      const res = await moveReferenteEverywhere({ variation, targetConcept });
      toastSuccess(res.bankMoved ? "Movido en el cliente y en el banco general" : "Referente movido");
    } catch (e) { logger.error("mover referente falló", e); toastError("No se pudo mover el referente"); }
  }, []);

  // Cuando un slot sale de Scripting con un guion que nació de la IA, comparamos
  // el borrador contra lo que quedó y destilamos reglas para la próxima vez.
  // Se corre UNA sola vez por slot (flag `learned` en ai_meta) y es fire-and-forget.
  const maybeLearn = useCallback((prev, next, patch) => {
    if (!patch?.stage) return;
    if (prev?.stage !== "scripting" || next?.stage === "scripting") return;
    if (!next?.ai_draft || next?.ai_meta?.learned) return;
    learnFromSlotEdits(next, { companyId }).then((ok) => {
      if (!ok) return;
      const meta = { ...(next.ai_meta || {}), learned: true };
      setSlots((prevSlots) => prevSlots.map((s) => (s.id === next.id ? { ...s, ai_meta: meta } : s)));
      updateSlotRow(next.id, { ai_meta: meta }).catch(() => {});
    });
  }, [companyId]);

  // ── Mutaciones (optimista + persistir si no es demo) ────────────────
  const updateSlot = useCallback((id, patch) => {
    // nextSlot desde la ref (estado más reciente) → no depender del updater de setState.
    const cur = slotsRef.current.find((s) => s.id === id);
    // Cambiar de etapa borra el "listo": un video terminado de editar no está
    // terminado de publicar. Sin esto la tarea de la etapa siguiente nacería
    // completa y nadie se enteraría de que hay trabajo.
    if (patch.stage && cur && patch.stage !== cur.stage && patch.stage_done === undefined) {
      patch = { ...patch, stage_done: false, ...fechaAlEntrar(patch.stage, cur.stage) };
    }
    const nextSlot = cur ? { ...cur, ...patch } : null;
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    // open/detail son UI-only → no tocan DB.
    const persistable = Object.keys(patch).some((k) => k !== "open" && k !== "detail");
    if (!isDemo() && persistable) {
      updateSlotRow(id, patch).catch((e) => { logger.error("updateSlot falló", e); toastError("No se pudo guardar el cambio"); });
      syncSlotProduced(cur?.stage, nextSlot);   // sincroniza/retira el creativo producido
      maybeLearn(cur, nextSlot, patch);         // guion aprobado → aprender de las ediciones
    }
  }, [maybeLearn]);

  // Inserta el guion generado y guarda el borrador tal cual salió de la IA.
  // Ese borrador es lo que después se compara contra la versión editada para
  // aprender (ver el disparo del loop en updateSlot).
  const applyGeneratedScript = useCallback((id, html, meta = {}) => {
    const ai_meta = { ...meta, generated_at: new Date().toISOString(), learned: false };
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, script: html, ai_draft: html, ai_meta } : s)));
    if (isDemo()) return;
    saveGeneratedScriptRow(id, { script: html, ai_draft: html, ai_meta })
      .then(({ aiColumnsMissing }) => {
        if (aiColumnsMissing) logger.warn("[pipeline] guion guardado sin ai_draft/ai_meta — falta correr db/slot_script_ai.sql");
      })
      .catch((e) => { logger.error("guardar guion generado falló", e); toastError("No se pudo guardar el guion"); });
  }, []);

  // Propuesta generada en segundo plano, guardada SIN tocar el guion del slot: se
  // revisa (elegir hooks, editar) y recién ahí se inserta. Vive en ai_meta.pending
  // para sobrevivir a un recargado — la columna ya existe.
  const setPendingScript = useCallback(async (id, proposal) => {
    const cur = slotsRef.current.find((s) => s.id === id);
    const ai_meta = { ...(cur?.ai_meta || {}), pending: { ...proposal, generated_at: new Date().toISOString() } };
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ai_meta } : s)));
    if (isDemo()) return;
    try {
      await updateSlotRow(id, { ai_meta });
    } catch (e) {
      // Si falla el guardado, la propuesta sigue en memoria para esta sesión.
      logger.error("guardar propuesta pendiente falló", e);
    }
  }, []);

  const clearPendingScript = useCallback((id) => {
    const cur = slotsRef.current.find((s) => s.id === id);
    if (!cur?.ai_meta?.pending) return;
    const { pending, ...rest } = cur.ai_meta;   // eslint-disable-line no-unused-vars
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ai_meta: rest } : s)));
    if (isDemo()) return;
    updateSlotRow(id, { ai_meta: rest }).catch((e) => logger.error("limpiar propuesta pendiente falló", e));
  }, []);

  const moveSlotStage = useCallback((id, stage) => updateSlot(id, { stage }), [updateSlot]);

  // Eliminar un slot (y su creativo producido en el despliegue, si lo tenía).
  const deleteSlot = useCallback((id) => {
    const cur = slotsRef.current.find((s) => s.id === id);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    if (isDemo()) return;
    deleteSlotRow(id).catch((e) => { logger.error("deleteSlot falló", e); toastError("No se pudo eliminar el slot"); });
    if (cur?.concept_id && PRODUCED_STAGES.includes(cur.stage)) deleteProducedForSlot(id).catch(() => {});
  }, []);

  // Aplicarle lo mismo a varios contenidos de una: la etapa, la UGC que graba,
  // el nivel de conciencia. Pasa por `updateSlot` uno por uno a propósito —así
  // cada slot arrastra consigo lo que su cambio implica (la fecha al entrar a
  // campaña, el "listo" que se reinicia, el creativo que se refleja o se retira
  // del despliegue) en vez de un UPDATE plano que se saltearía todo eso.
  //
  // La etapa se resuelve por slot: mandar la tanda a To Film manda los estáticos
  // a diseño, porque no hay nada que grabar en una imagen.
  //
  // `patch` puede ser una función `(slot) => patch`. Hace falta para los campos
  // cuyo valor depende de lo que ese slot ya tenía: elegir concepto arrastra el
  // nivel de conciencia del banco, pero SOLO si el slot no tenía uno puesto a
  // mano. Con un patch plano, poner el concepto en tanda le pisaría el nivel a
  // los creativos que a propósito entran por otro punto del embudo.
  const updateSlots = useCallback((ids, patch) => {
    const lista = [...new Set((ids || []).filter(Boolean))];
    for (const id of lista) {
      const cur = slotsRef.current.find((s) => s.id === id);
      if (!cur) continue;
      const p = typeof patch === "function" ? patch(cur) : patch;
      if (!p) continue;
      updateSlot(id, p.stage ? { ...p, stage: etapaRealPara(cur.tipo, p.stage) } : p);
    }
    return lista.length;
  }, [updateSlot]);

  // Borrar la selección entera. Es lo mismo que borrar uno, en tanda: limpiar
  // una planeación que quedó mal eran veinte confirmaciones de a una.
  //
  // Si la base rechaza el borrado, los slots VUELVEN a la pantalla. Media
  // selección desaparecida y guardada a medias es peor que no haber borrado: uno
  // cree que quedó hecho y el trabajo sigue ahí para el resto del equipo.
  const deleteSlots = useCallback(async (ids) => {
    const lista = [...new Set((ids || []).filter(Boolean))];
    if (!lista.length) return 0;
    const set = new Set(lista);
    const borrados = slotsRef.current.filter((s) => set.has(s.id));
    setSlots((prev) => prev.filter((s) => !set.has(s.id)));
    if (isDemo()) return borrados.length;
    try {
      await deleteSlotRows(lista);
      // Los que ya estaban al aire dejan de reflejarse como creativo producido
      // en el despliegue. Va detrás y sin bloquear: un fantasma en el despliegue
      // se limpia después, el borrado en sí ya está hecho.
      borrados
        .filter((s) => s.concept_id && PRODUCED_STAGES.includes(s.stage))
        .forEach((s) => deleteProducedForSlot(s.id).catch(() => {}));
      return borrados.length;
    } catch (e) {
      logger.error("deleteSlots falló", e);
      setSlots((prev) => [...prev, ...borrados]);
      toastError("No se pudieron eliminar. Siguen donde estaban.");
      return 0;
    }
  }, []);

  // Portada de un referente real: optimista en la lista + en los snapshots ya
  // pegados a slots (persistiendo esos slots), y guarda file_url en la variation.
  const setReferenceCover = useCallback((refIdVal, url) => {
    setReferences((prev) => prev.map((r) => (r.id === refIdVal ? { ...r, file_url: url } : r)));
    const { nextSlots, affected } = patchPeggedRef(refIdVal, { file_url: url });
    setSlots(nextSlots);
    if (demoRef.current) return;
    affected.forEach((a) => updateSlotRow(a.id, { refs: a.refs }).catch((e) => logger.error("persistir portada en slot falló", e)));
    setReferenceCoverDb(refIdVal, url).catch((e) => { logger.error("guardar portada del referente falló", e); toastError("No se pudo guardar la portada"); });
  }, []);

  const moveBriefStage = useCallback((briefId, fromStage, toStage) => {
    const affected = slotsRef.current.filter((s) => s.brief === briefId && s.stage === fromStage);
    // Arrastrar el brief mueve todos sus contenidos de una, así que la fecha se
    // reinicia igual que moviéndolos uno por uno. Es el mismo gesto.
    const extra = fechaAlEntrar(toStage, fromStage);
    // Mismo criterio que en la base: un estático que va a To Film sigue derecho
    // a diseño, porque no hay nada que grabar.
    const destino = (s) => etapaRealPara(s.tipo, toStage);
    setSlots((prev) => prev.map((s) => (s.brief === briefId && s.stage === fromStage ? { ...s, stage: destino(s), ...extra } : s)));
    if (!isDemo()) {
      moveBriefStageRows(briefId, fromStage, toStage, extra).catch((e) => { logger.error("moveBrief falló", e); toastError("No se pudo mover el brief"); });
      affected.forEach((s) => syncSlotProduced(fromStage, { ...s, stage: destino(s) }));
    }
  }, []);

  const setAllOpen = useCallback((briefId, open) => {
    setSlots((prev) => prev.map((s) => (s.brief === briefId ? { ...s, open } : s)));
  }, []);

  // Pegar un referente (snapshot) al slot. Máx 3, sin duplicar por id. Persiste refs.
  const attachRef = useCallback((slotId, snapshot) => {
    if (!snapshot?.id) return;
    let toPersist = null;
    setSlots((prev) => prev.map((s) => {
      if (s.id !== slotId) return s;
      const cur = Array.isArray(s.refs) ? s.refs : [];
      if (cur.length >= 3 || cur.some((r) => refId(r) === snapshot.id)) return s;
      const refs = [...cur, snapshot];
      toPersist = refs;
      return { ...s, refs };
    }));
    if (!isDemo() && toPersist) updateSlotRow(slotId, { refs: toPersist }).catch((e) => { logger.error("attachRef falló", e); toastError("No se pudo guardar la referencia"); });
  }, []);

  // Quitar una referencia del slot (soporta snapshot objeto o id string legacy).
  const detachRef = useCallback((slotId, id) => {
    let toPersist = null;
    setSlots((prev) => prev.map((s) => {
      if (s.id !== slotId) return s;
      const refs = (Array.isArray(s.refs) ? s.refs : []).filter((r) => refId(r) !== id);
      toPersist = refs;
      return { ...s, refs };
    }));
    if (!isDemo() && toPersist) updateSlotRow(slotId, { refs: toPersist }).catch((e) => { logger.error("detachRef falló", e); toastError("No se pudo quitar la referencia"); });
  }, []);

  const addBlankSlot = useCallback(async (briefId, tipo) => {
    if (isDemo()) {
      setSlots((prev) => [...prev, makeSlot(briefId, numDemo(prev, 1), tipo, { stage: "idea" })]);
      return;
    }
    try {
      // Del contador de la EMPRESA, no del brief: el primer slot del brief 5
      // nace con el número siguiente al último del brief 4.
      const num = await reserveSlotNums(companyId, 1);
      const [row] = await insertSlots(companyId, briefId, [makeSlot(briefId, num, tipo, { stage: "idea" })]);
      if (row) setSlots((prev) => [...prev, row]);
    } catch (e) { logger.error("addBlankSlot falló", e); toastError("No se pudo crear el slot"); }
  }, [companyId]);

  // ── Papelera ───────────────────────────────────────────────────────
  // Borrar manda el brief a la papelera: sale de la vista pero no de la base.
  // Sus contenidos tampoco se tocan, solo se dejan de mostrar.
  //
  // Si el guardado falla, el brief VUELVE a la pantalla. Antes daba igual —el
  // borrado era irreversible igual— pero ahora "desapareció de la vista" y "está
  // en la papelera" pueden separarse, y dejarlo desaparecido sin estar guardado
  // es la peor de las dos: parece borrado y no se puede recuperar de ningún lado.
  const deleteBrief = useCallback(async (briefId) => {
    const brief = briefsRef.current.find((b) => b.id === briefId);
    const suyos = slotsRef.current.filter((s) => s.brief === briefId);
    setBriefs((prev) => prev.filter((b) => b.id !== briefId));
    setSlots((prev) => prev.filter((s) => s.brief !== briefId));
    if (brief) setPapelera((prev) => [{ ...brief, deleted_at: new Date().toISOString() }, ...prev]);
    if (isDemo()) return;
    try { await deleteBriefRow(briefId); }
    catch (e) {
      logger.error("deleteBrief falló", e);
      setPapelera((prev) => prev.filter((b) => b.id !== briefId));
      if (brief) setBriefs((prev) => [brief, ...prev]);
      setSlots((prev) => [...prev, ...suyos]);
      // Si falta la columna es que no se corrió db/pipeline_papelera.sql, y el
      // mensaje genérico manda a buscar un problema que no existe.
      const faltaSql = /deleted_at/.test(e?.message || "") || e?.code === "42703";
      toastError(faltaSql
        ? "Falta correr db/pipeline_papelera.sql. El brief sigue donde estaba."
        : "No se pudo eliminar el brief. Sigue donde estaba.");
    }
  }, []);

  // Devolverlo. Los slots hay que volver a traerlos de la base porque al cargar
  // se dejaron afuera; en demo nunca se fueron del estado, así que no hace falta.
  const restoreBrief = useCallback(async (briefId) => {
    const brief = papeleraRef.current.find((b) => b.id === briefId);
    if (!brief) return 0;
    setPapelera((prev) => prev.filter((b) => b.id !== briefId));
    setBriefs((prev) => [{ ...brief, deleted_at: null }, ...prev]);
    if (isDemo()) return 0;
    try {
      await restoreBriefRow(briefId);
      const suyos = await listSlotsOfBrief(briefId);
      setSlots((prev) => [...prev.filter((s) => s.brief !== briefId), ...suyos]);
      return suyos.length;
    } catch (e) {
      logger.error("restoreBrief falló", e);
      setBriefs((prev) => prev.filter((b) => b.id !== briefId));
      setPapelera((prev) => [brief, ...prev]);
      toastError("No se pudo recuperar el brief");
      return 0;
    }
  }, []);

  // El borrado de verdad, el que no tiene vuelta. Solo desde la papelera.
  const purgeBrief = useCallback(async (briefId) => {
    const brief = papeleraRef.current.find((b) => b.id === briefId);
    setPapelera((prev) => prev.filter((b) => b.id !== briefId));
    if (isDemo()) return;
    try { await purgeBriefRow(briefId); }
    catch (e) {
      logger.error("purgeBrief falló", e);
      if (brief) setPapelera((prev) => [brief, ...prev]);
      toastError("No se pudo borrar definitivamente");
    }
  }, []);

  // Un plan —cuántos de cada concepto— a la lista de contenidos que hay que
  // crear. Lo usan CREAR un brief y AGREGARLE contenidos después: es el mismo
  // acto, y por eso el mismo código. `desde` es el número por el que va la
  // numeración, para que sumar al brief 38 empiece en el 39 y no pise nada.
  const planAContenidos = useCallback(({ plan = {}, extras = [], desde = 0 }) => {
    const source = creatives.length ? creatives : BANK;
    const byId = (id) => source.find((c) => c.id === id);
    const planned = [];
    let num = desde;
    for (const [conceptId, count] of Object.entries(plan)) {
      const c = byId(conceptId);
      // El concepto del banco YA sabe en qué punto del embudo está: se copia al
      // slot como nivel de conciencia en vez de pedírselo otra vez a quien planea.
      const nivel = NIVELES.some((n) => n.key === c?.stage) ? c.stage : "";
      for (let i = 0; i < (Number(count) || 0); i++) planned.push({ tipo: c?.tipo || "video", num: ++num, concepto: c?.name || "", concept_id: conceptId, nivel_conciencia: nivel, stage: "idea" });
    }
    for (const ex of extras) {
      for (let i = 0; i < (Number(ex.count) || 0); i++) planned.push({ tipo: ex.tipo || "video", num: ++num, concepto: (ex.name || "").trim(), stage: "idea" });
    }
    return planned;
  }, [creatives]);

  const mkSlot = useCallback(
    (briefId, p) => makeSlot(briefId, p.num, p.tipo, { concepto: p.concepto || "", concept_id: p.concept_id || null, nivel_conciencia: p.nivel_conciencia || "", stage: "idea" }),
    [],
  );

  // Sumar contenidos a un brief que ya existe, en tanda.
  //
  // Antes solo estaba "+ Slot en blanco", de a uno y sin concepto: para diez
  // contenidos eran diez clics y después había que ir eligiéndole el concepto a
  // cada uno. Es la misma pantalla de planeación que al crear el brief.
  const addSlotsAlBrief = useCallback(async (briefId, { plan = {}, extras = [] }) => {
    if (isDemo()) {
      const planned = planAContenidos({ plan, extras, desde: numDemo(slotsRef.current, 1) - 1 });
      setSlots((prev) => [...prev, ...planned.map((p) => mkSlot(briefId, p))]);
      return planned.length;
    }
    try {
      // Cuántos van a nacer, para reservar ese bloque de números de una sola vez.
      const cuantos = planAContenidos({ plan, extras }).length;
      if (!cuantos) return 0;
      // El número sale de la BASE y no de lo que tengo en memoria: si otro sumó
      // contenidos mientras yo tenía la pantalla abierta, igual no colisiona.
      const desde = (await reserveSlotNums(companyId, cuantos)) - 1;
      const planned = planAContenidos({ plan, extras, desde });
      if (!planned.length) return 0;
      const rows = await insertSlots(companyId, briefId, planned.map((p) => mkSlot(briefId, p)));
      setSlots((prev) => [...prev, ...rows]);
      return rows.length;
    } catch (e) {
      logger.error("addSlotsAlBrief falló", e);
      toastError("No se pudieron agregar los contenidos");
      return 0;
    }
  }, [companyId, planAContenidos, mkSlot]);

  const createBrief = useCallback(async ({ n, created, owner, plan = {}, extras = [] }) => {
    // plan = { conceptId: cantidad } (usa el formato REAL del concepto).
    // extras = [{ name, tipo, count }] (formatos/contenidos a mano).
    // Un brief sin nada planeado igual nace con un slot: un brief vacío no se
    // puede empezar a llenar desde ningún lado.
    const cuantos = planAContenidos({ plan, extras }).length || 1;
    const mk = mkSlot;
    const armar = (desde) => {
      const list = planAContenidos({ plan, extras, desde });
      return list.length ? list : [{ tipo: "video", num: desde + 1, stage: "idea" }];
    };

    if (isDemo()) {
      const id = `B${30 + briefs.length + 1}`;
      const brief = { id, n, created, owner, company_id: companyId };
      setBriefs((prev) => [brief, ...prev]);
      setSlots((prev) => [...prev, ...armar(numDemo(prev, 1) - 1).map((p) => mk(id, p))]);
      return;
    }
    try {
      // La numeración es de la EMPRESA. Antes cada brief empezaba en 1, así que
      // el brief 4 y el 5 tenían los dos un #001 y el nombre del anuncio dejaba
      // de identificar nada.
      const desde = (await reserveSlotNums(companyId, cuantos)) - 1;
      const brief = await insertBrief(companyId, { name: n, owner, created_label: created });
      const rows = await insertSlots(companyId, brief.id, armar(desde).map((p) => mk(brief.id, p)));
      setBriefs((prev) => [brief, ...prev]);
      setSlots((prev) => [...prev, ...rows]);
    } catch (e) { logger.error("createBrief falló", e); toastError("No se pudo crear el brief"); }
  }, [companyId, briefs.length, planAContenidos, mkSlot]);

  // ── Productos (fuente única = company_voice_profile.products) ────────
  // Persiste la lista completa (patrón de ProductInfoPanel). Optimista. Lee/escribe
  // productsRef síncrono → dos ediciones en el mismo tick se encadenan (no se pisan).
  const persistProducts = useCallback((next, nextNiche) => {
    productsRef.current = next;
    setProducts(next);
    if (nextNiche !== undefined) setNiche(nextNiche);
    upsertVoiceProfile(companyId, { products: next, ...(nextNiche !== undefined ? { niche: nextNiche } : {}) })
      .catch((e) => { logger.error("guardar productos falló", e); toastError("No se pudo guardar el producto"); });
  }, [companyId]);

  const addProduct = useCallback((name) => {
    const nm = (name || "").trim();
    if (!nm) return null;
    const p = { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: nm, touchpoints: { angles: [], objections: [], awareness: [] }, creators: [] };
    persistProducts([...productsRef.current, p]);
    return p.id;
  }, [persistProducts]);

  const updateProduct = useCallback((id, patch) => {
    persistProducts(productsRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [persistProducts]);

  const removeProduct = useCallback((id) => {
    persistProducts(productsRef.current.filter((p) => p.id !== id));
  }, [persistProducts]);

  const setCompanyNiche = useCallback((k) => { persistProducts(productsRef.current, k); }, [persistProducts]);

  // Optimista y aparte de `persistProducts`: no arrastra la lista de productos
  // en cada cambio de nivel, que es un dato mucho más chico y de otra frecuencia.
  const setSofisticacionEmpresa = useCallback((n) => {
    const valor = n == null ? null : Number(n);
    setSofisticacion(valor);
    upsertVoiceProfile(companyId, { market_sophistication: valor })
      .catch((e) => { logger.error("guardar sofisticacion falló", e); toastError("No se pudo guardar el nivel"); });
  }, [companyId]);

  /**
   * Renumera este brief y todos los que vinieron después.
   *
   * Es un acto explícito y no algo que pase solo. En cuanto Nath manda el link de un
   * brief, las UGC empiezan a nombrar archivos en Drive con el número que ven; si el
   * sistema renumerara al agregar un contenido, les cambiaría el número por debajo y
   * rompería el único cruce que hoy funciona entre la plataforma y Drive.
   *
   * «Los siguientes» se resuelve por fecha de creación: `briefs` llega del más nuevo al
   * más viejo, así que se da vuelta y se corta desde el elegido. La numeración arranca
   * en 001 en ese brief y sigue de largo por los que siguen — nunca reinicia en cada uno.
   * Ese es exactamente el pedido: reset en el Brief 5, y del 6 en adelante corrido.
   */
  const renumerarDesde = useCallback(async (briefId) => {
    const enOrden = [...briefsRef.current].reverse();
    const i = enOrden.findIndex((b) => b.id === briefId);
    if (i < 0) return { cambiados: 0 };

    const tanda = enOrden.slice(i).map((b) => ({
      id: b.id,
      slots: slots.filter((s) => s.brief === b.id),
    }));

    const { cambios } = renumerar(tanda, 0);
    if (!cambios.length) return { cambiados: 0 };

    // La pantalla se actualiza primero: son decenas de escrituras y esperarlas todas
    // con el board congelado haría parecer que se colgó.
    const porId = new Map(cambios.map((c) => [c.id, c.num]));
    setSlots((prev) => prev.map((s) => (porId.has(s.id) ? { ...s, num: porId.get(s.id) } : s)));

    if (!demoRef.current) {
      try {
        await renumerarSlots(cambios);
      } catch (e) {
        // Si la base rechaza, se vuelve atrás: un board que muestra números que no
        // están guardados es peor que uno desordenado, porque nadie lo nota.
        setSlots((prev) => prev.map((s) => {
          const c = cambios.find((x) => x.id === s.id);
          return c ? { ...s, num: c.antes } : s;
        }));
        throw e;
      }
    }
    return { cambiados: cambios.length };
  }, [slots]);

  const slotsByBrief = useMemo(() => {
    const map = {};
    for (const s of slots) (map[s.brief] ||= []).push(s);
    return map;
  }, [slots]);

  return {
    briefs, slots, slotsByBrief, demo, cargado, owners, papelera, restoreBrief, purgeBrief,
    catalogs, products, niche, bank: conceptSource, creatives, stages: STAGES,
    references, refConcepts, refsLoading, refsError, prioridades, ensureReferences, setReferenceCover, moveReference,
    usedRefIds, createdRefIds, discardedRefIds, toggleDiscardRef,
    updateSlot, moveSlotStage, moveBriefStage, createBrief, deleteBrief, addBlankSlot, addSlotsAlBrief, deleteSlot, deleteSlots, updateSlots, setAllOpen, attachRef, detachRef,
    applyGeneratedScript, setPendingScript, clearPendingScript,
    addProduct, updateProduct, removeProduct, setCompanyNiche, sofisticacion, setSofisticacionEmpresa,
    renumerarDesde,
  };
}
