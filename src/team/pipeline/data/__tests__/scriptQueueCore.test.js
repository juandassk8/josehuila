// La mecánica de la cola: orden, concurrencia, aislamiento de errores y cancelación.
// Es lógica que falla en silencio, así que se testea aparte de React.
import { describe, it, expect } from "vitest";
import { createScriptQueue, countByStatus } from "../scriptQueueCore.js";

const slot = (id, num = 1) => ({ id, num, producto: "P" });
const settle = () => new Promise((r) => setTimeout(r, 60));

function tracker({ failOn = [], delay = 10 } = {}) {
  const state = { calls: [], now: 0, max: 0, progress: [] };
  const run = async (job, onProgress) => {
    state.calls.push(job.slotId);
    state.now++; state.max = Math.max(state.max, state.now);
    onProgress("Transcribiendo…");
    await new Promise((r) => setTimeout(r, delay));
    state.now--;
    if (failOn.includes(job.slotId)) throw new Error("explotó");
    return `ok:${job.slotId}`;
  };
  return { state, run };
}

describe("createScriptQueue", () => {
  it("procesa todos los trabajos y guarda el resultado de cada uno", async () => {
    const { state, run } = tracker();
    const q = createScriptQueue({ concurrency: 2, run });
    q.enqueue([{ slot: slot("a") }, { slot: slot("b") }, { slot: slot("c") }]);
    await settle();
    expect(state.calls.sort()).toEqual(["a", "b", "c"]);
    expect(countByStatus(q.getJobs()).ready).toBe(3);
    expect(q.getJobs().map((j) => j.result).sort()).toEqual(["ok:a", "ok:b", "ok:c"]);
  });

  it("respeta el límite de concurrencia", async () => {
    const { state, run } = tracker();
    const q = createScriptQueue({ concurrency: 2, run });
    q.enqueue([1, 2, 3, 4, 5].map((n) => ({ slot: slot(`s${n}`) })));
    await settle();
    expect(state.max).toBe(2);
    expect(countByStatus(q.getJobs()).ready).toBe(5);
  });

  it("con concurrencia 1 procesa en orden FIFO", async () => {
    const { state, run } = tracker();
    const q = createScriptQueue({ concurrency: 1, run });
    q.enqueue([{ slot: slot("p1") }, { slot: slot("p2") }, { slot: slot("p3") }]);
    await settle();
    expect(state.calls).toEqual(["p1", "p2", "p3"]);
    expect(state.max).toBe(1);
  });

  it("un trabajo que falla no arrastra a los demás", async () => {
    const { state, run } = tracker({ failOn: ["boom"] });
    const q = createScriptQueue({ concurrency: 2, run });
    q.enqueue([{ slot: slot("ok1") }, { slot: slot("boom") }, { slot: slot("ok2") }]);
    await settle();
    const jobs = q.getJobs();
    expect(countByStatus(jobs).ready).toBe(2);
    const bad = jobs.find((j) => j.slotId === "boom");
    expect(bad.status).toBe("error");
    expect(bad.error).toContain("explotó");
    expect(state.calls).toHaveLength(3);
  });

  it("encolar mientras drena se suma sin reiniciar el drenado", async () => {
    const { state, run } = tracker({ delay: 20 });
    const q = createScriptQueue({ concurrency: 2, run });
    q.enqueue([{ slot: slot("x1") }, { slot: slot("x2") }]);
    await new Promise((r) => setTimeout(r, 5));
    q.enqueue([{ slot: slot("x3") }]);
    await settle();
    expect(state.calls).toHaveLength(3);
    expect(state.max).toBe(2);           // no se dispararon drains de más
    expect(countByStatus(q.getJobs()).ready).toBe(3);
  });

  it("cancelar un pendiente lo saca sin ejecutarlo", async () => {
    const { state, run } = tracker({ delay: 20 });
    const q = createScriptQueue({ concurrency: 1, run });
    q.enqueue([1, 2, 3].map((n) => ({ slot: slot(`q${n}`) })));
    const ids = q.getJobs().map((j) => j.id);
    q.cancel(ids[2]);
    await settle();
    expect(state.calls).not.toContain("q3");
    expect(q.getJobs().find((j) => j.id === ids[2]).status).toBe("cancelled");
  });

  it("reintentar vuelve a encolar el fallado", async () => {
    let failNext = true;
    const q = createScriptQueue({
      concurrency: 1,
      run: async () => { if (failNext) { failNext = false; throw new Error("una vez"); } return "ok"; },
    });
    q.enqueue([{ slot: slot("r1") }]);
    await settle();
    expect(q.getJobs()[0].status).toBe("error");
    q.retry(q.getJobs()[0].id);
    await settle();
    expect(q.getJobs()[0].status).toBe("done");
    expect(q.getJobs()[0].error).toBeNull();
  });

  it("clearFinished conserva solo lo que sigue vivo", async () => {
    const { run } = tracker({ delay: 40 });
    const q = createScriptQueue({ concurrency: 1, run });
    q.enqueue([{ slot: slot("c1") }, { slot: slot("c2") }]);
    await new Promise((r) => setTimeout(r, 60));   // c1 listo, c2 corriendo
    q.clearFinished();
    expect(q.getJobs().every((j) => j.status !== "done")).toBe(true);
    await settle();
  });

  it("dispose corta el drenado y deja de notificar", async () => {
    const { state, run } = tracker({ delay: 20 });
    const q = createScriptQueue({ concurrency: 1, run });
    let notified = 0;
    q.subscribe(() => { notified++; });
    q.enqueue([{ slot: slot("d1") }, { slot: slot("d2") }, { slot: slot("d3") }]);
    await new Promise((r) => setTimeout(r, 5));
    q.dispose();
    const after = notified;
    await settle();
    expect(state.calls.length).toBeLessThan(3);   // no siguió con la cola
    expect(notified).toBe(after);                 // no notificó tras dispose
  });

  it("suscribirse y desuscribirse NO mata la cola (regresión StrictMode)", async () => {
    // React monta el efecto, lo limpia y lo remonta. Si la limpieza matara la cola,
    // los trabajos quedarían "En cola" para siempre — que es justo lo que pasó.
    const { state, run } = tracker();
    const q = createScriptQueue({ concurrency: 2, run });
    const off1 = q.subscribe(() => {});
    off1();                                  // limpieza del primer montaje
    let seen = 0;
    q.subscribe(() => { seen++; });          // segundo montaje
    q.enqueue([{ slot: slot("s1") }, { slot: slot("s2") }]);
    await settle();
    expect(state.calls).toHaveLength(2);
    expect(countByStatus(q.getJobs()).ready).toBe(2);
    expect(seen).toBeGreaterThan(0);         // el segundo suscriptor sí recibe
  });

  it("dispose explícito sí detiene la cola", async () => {
    const { state, run } = tracker({ delay: 20 });
    const q = createScriptQueue({ concurrency: 1, run });
    q.enqueue([{ slot: slot("z1") }, { slot: slot("z2") }, { slot: slot("z3") }]);
    await new Promise((r) => setTimeout(r, 5));
    q.dispose();
    await settle();
    expect(state.calls.length).toBeLessThan(3);
  });

  it("ignora entradas sin slot válido", () => {
    const q = createScriptQueue({ concurrency: 1, run: async () => "ok" });
    expect(q.enqueue([])).toBe(0);
    expect(q.enqueue([{ slot: null }, {}, null])).toBe(0);
    expect(q.getJobs()).toHaveLength(0);
  });
});
