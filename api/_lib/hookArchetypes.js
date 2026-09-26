// Arquetipos de hook — la taxonomía que hace que los 5 hooks salgan REALMENTE
// distintos entre sí.
//
// Pedirle a un LLM "que sean diferentes" no funciona: devuelve 5 variaciones de
// la misma idea con sinónimos. La diversidad hay que forzarla por construcción —
// cada hook tiene que entrar por una PUERTA distinta al mismo problema. Este
// archivo es esa lista de puertas.
//
// Se comparte entre el endpoint (que la inyecta en el prompt y valida la salida)
// y el panel de revisión (que muestra la etiqueta de cada hook).
//
// Se puede ampliar libremente: agregar un arquetipo acá lo habilita en todo el
// sistema sin tocar nada más.

export const HOOK_ARCHETYPES = [
  {
    key: "callout",
    label: "Callout de audiencia",
    guide: "Nombra a quién le habla para que se sienta señalado. 'Si tu perro …', 'Mamás de …'.",
  },
  {
    key: "dolor",
    label: "Dolor visceral",
    guide: "Arranca en la escena concreta e incómoda del problema. Se ve y se siente, no se explica.",
  },
  {
    key: "creencia",
    label: "Negación de creencia",
    guide: "Rompe algo que la audiencia da por cierto. 'No es X, es Y', 'Dejá de …'.",
  },
  {
    key: "resultado",
    label: "Resultado / antes-después",
    guide: "Abre por el final feliz y deja la pregunta de cómo se llegó ahí.",
  },
  {
    key: "pregunta",
    label: "Pregunta incómoda",
    guide: "Una pregunta que obliga a auto-diagnosticarse. No retórica: tiene que picar.",
  },
  {
    key: "dato",
    label: "Dato duro",
    guide: "Una cifra o hecho verificable que descoloca. SOLO si el dato está en la info del producto.",
  },
  {
    key: "demo",
    label: "Demo visual",
    guide: "Describe algo que se ve en pantalla y no se puede dejar de mirar. 'Mirá lo que pasa cuando …'.",
  },
  {
    key: "confesion",
    label: "Confesión / historia",
    guide: "Primera persona, admite algo. 'Durante meses hice …', 'Me daba vergüenza …'.",
  },
  {
    key: "comparacion",
    label: "Comparación",
    guide: "Enfrenta dos opciones, dos estados o dos épocas. 'Esto vs esto'.",
  },
  {
    key: "error",
    label: "Error común",
    guide: "Señala lo que casi todos hacen mal, sin culpar al espectador.",
  },
];

export const ARCHETYPE_KEYS = HOOK_ARCHETYPES.map((a) => a.key);

export const archetypeLabel = (key) =>
  HOOK_ARCHETYPES.find((a) => a.key === key)?.label || key || "—";

// Bloque para el prompt. `preferredFirst` (el arquetipo del referente) se marca
// como recomendado para que uno de los 5 conserve lo que ya funcionó.
export function archetypesForPrompt(preferredFirst = null) {
  const lines = HOOK_ARCHETYPES.map((a) => {
    const mark = a.key === preferredFirst ? "  ← el del referente, usalo en uno de los 5" : "";
    return `- \`${a.key}\` — ${a.label}: ${a.guide}${mark}`;
  });
  return lines.join("\n");
}
