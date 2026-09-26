// Cycles task status: pendiente → en_curso → completado → pendiente
export function cycleStatus(current) {
  if (current === "pendiente") return "en_curso";
  if (current === "en_curso") return "completado";
  return "pendiente";
}
