// Cola de generación de guiones en segundo plano — cáscara React.
//
// Toda la mecánica (orden, concurrencia, errores, cancelación) vive en
// scriptQueueCore.js, que es JS puro y está testeado. Acá solo se suscribe React
// al store y se cablea el trabajo real: generar el guion y guardarlo como
// propuesta pendiente en su slot.

import { useEffect, useMemo, useState } from "react";
import { logger } from "../../../lib/logger.js";
import { generateSlotScript } from "./scriptAI.js";
import { createScriptQueue, countByStatus } from "./scriptQueueCore.js";

export function useScriptQueue({ companyId, memberId, onReady }) {
  const [jobs, setJobs] = useState([]);

  // El store se crea una vez por empresa. `onReady` se lee por referencia dentro
  // del run para no recrear la cola cada render.
  const readyRef = useMemo(() => ({ current: onReady }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  readyRef.current = onReady;

  const queue = useMemo(() => createScriptQueue({
    concurrency: 2,
    run: async (job, onProgress) => {
      const out = await generateSlotScript(job.slot, {
        companyId, memberId,
        angulo: job.angulo,
        anchorRefId: job.anchorRefId,
        onProgress,
      });
      // Se guarda apenas termina: si el usuario recarga, la propuesta sobrevive.
      await readyRef.current?.(job.slotId, {
        hooks: out.hooks, body: out.body, cta: out.cta, notes: out.notes_for_creator || "", promise: out.promise || "",
        words: out.words, targetWords: out.targetWords, winnersUsed: out.winnersUsed || 0,
        warning: out.warning || null, skipped: out.skipped || [], references: out.references || [],
        anchorRefId: job.anchorRefId || null, angulo: job.angulo || "", model: out.model,
      });
      return true;
    },
  }), [companyId, memberId, readyRef]);

  // La limpieza SOLO se desuscribe. NO llama a `dispose()`.
  //
  // React en StrictMode monta el efecto, lo limpia y lo vuelve a montar. Como la
  // cola vive en un useMemo (mismas deps → misma instancia), un `dispose()` en la
  // limpieza la dejaba marcada como muerta para siempre: los trabajos se encolaban
  // y se veían en la bandeja, pero el drenado nunca arrancaba. Quedaban "En cola"
  // eternamente.
  //
  // Desuscribirse ya cubre lo que `dispose` protegía: sin listeners, el store deja
  // de notificar y no hay setState sobre un componente desmontado. Y el trabajo que
  // estuviera en vuelo termina y guarda su propuesta, que es lo que uno quiere.
  useEffect(() => {
    setJobs(queue.getJobs());
    return queue.subscribe(setJobs);
  }, [queue]);

  const { pending, ready } = countByStatus(jobs);

  return {
    jobs, pending, ready,
    enqueue: (items) => {
      const n = queue.enqueue(items);
      if (!n) logger.warn("[scriptQueue] nada para encolar");
      return n;
    },
    cancel: queue.cancel,
    retry: queue.retry,
    clearFinished: queue.clearFinished,
  };
}
