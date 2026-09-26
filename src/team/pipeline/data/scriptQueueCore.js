// Motor de la cola de guiones — JavaScript puro, sin React.
//
// Separado del hook a propósito: la mecánica (orden, concurrencia, aislamiento de
// errores, cancelación) es lo que puede romperse en silencio, y así se puede
// testear con el entorno `node` que ya usa el repo, sin sumar jsdom ni testing
// library. El hook queda como una cáscara que suscribe React a este store.
//
// Diseño heredado de src/team/concept_bank/useRefAnalysisQueue.js: la cola vive en
// un array mutable y encolar mientras se está drenando NO reinicia el drenado —
// el `while` re-lee la cola en cada vuelta. Lo que se le suma acá: identidad por
// trabajo, cancelación, concurrencia > 1 y un `dispose()` para cortar limpio.

let seq = 0;
const nextId = () => `j${++seq}`;

// `run(job, onProgress)` hace el trabajo real y resuelve con el resultado.
export function createScriptQueue({ concurrency = 2, run }) {
  const pending = [];            // FIFO de trabajos por hacer
  const cancelled = new Set();
  let jobs = [];                 // lista observable (incluye terminados)
  let draining = 0;
  let disposed = false;
  const listeners = new Set();

  const emit = () => { for (const fn of listeners) fn(jobs); };

  const patch = (id, p) => {
    jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
    emit();
  };

  async function runOne(job) {
    if (cancelled.has(job.id)) { patch(job.id, { status: "cancelled", step: "" }); return; }
    patch(job.id, { status: "running", step: "Preparando…", error: null });
    try {
      const result = await run(job, (step) => { if (!disposed) patch(job.id, { step }); });
      // Se comprueba DESPUÉS de correr: el usuario pudo cancelar mientras tanto.
      if (cancelled.has(job.id)) { patch(job.id, { status: "cancelled", step: "" }); return; }
      patch(job.id, { status: "done", step: "", result });
    } catch (e) {
      // Un trabajo que falla nunca frena a los demás: se marca y la cola sigue.
      patch(job.id, { status: "error", step: "", error: e?.message || "Falló la generación" });
    }
  }

  async function drain() {
    if (draining >= concurrency) return;
    draining++;
    try {
      while (!disposed && pending.length) await runOne(pending.shift());
    } finally {
      draining--;
    }
  }

  const spawn = () => { for (let i = 0; i < concurrency; i++) drain(); };

  return {
    // `items` = [{ slot, anchorRefId, angulo, label }]
    enqueue(items) {
      const list = (items || []).filter((x) => x?.slot?.id);
      if (!list.length) return 0;
      const created = list.map((x) => ({
        id: nextId(),
        slotId: x.slot.id,
        slotNum: x.slot.num,
        label: x.label || x.slot.producto || "Slot",
        status: "queued", step: "", error: null, result: null,
        slot: x.slot, anchorRefId: x.anchorRefId || null, angulo: x.angulo || "",
      }));
      jobs = [...jobs, ...created];
      pending.push(...created);
      emit();
      spawn();
      return created.length;
    },

    cancel(id) {
      cancelled.add(id);
      const i = pending.findIndex((j) => j.id === id);
      if (i >= 0) pending.splice(i, 1);
      const job = jobs.find((j) => j.id === id);
      if (job && job.status === "queued") patch(id, { status: "cancelled", step: "" });
    },

    retry(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return;
      cancelled.delete(id);
      pending.push(job);
      patch(id, { status: "queued", step: "", error: null });
      spawn();
    },

    clearFinished() {
      jobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
      emit();
    },

    getJobs: () => jobs,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Corta el drenado. Los trabajos en vuelo terminan su promesa pero ya no
    // emiten: es lo que evita escribir sobre un componente desmontado.
    dispose() { disposed = true; listeners.clear(); },
  };
}

export const countByStatus = (jobs) => ({
  pending: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
  ready: jobs.filter((j) => j.status === "done").length,
});
