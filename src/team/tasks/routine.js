// Capacidad de trabajo del día según los bloques de "Mi rutina" (routine_blocks).
// Cuentan los bloques de categoría deep (trabajo pesado) y light (liviano).
const WORK = { deep: "profundo", light: "liviano" };

export function dayCapacity(blocks, date = new Date()) {
  const day = (date.getDay() + 6) % 7;
  const now = date.getHours() * 60 + date.getMinutes();
  const out = {
    total: { profundo: 0, liviano: 0 },
    elapsed: { profundo: 0, liviano: 0 },
    remaining: { profundo: 0, liviano: 0 },
  };
  (blocks || []).forEach((b) => {
    const type = WORK[b.category];
    if (!type || b.day !== day) return;
    const len = b.end_min - b.start_min;
    const done = Math.min(len, Math.max(0, now - b.start_min));
    out.total[type] += len;
    out.elapsed[type] += done;
    out.remaining[type] += len - done;
  });
  return out;
}
