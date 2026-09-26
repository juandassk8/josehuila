// Sofisticación de mercado — Módulo 2 del curso.
//
// La conciencia dice qué tanto sabe el cliente. La sofisticación dice otra cosa:
// cuántas veces ya oyó la misma promesa, o sea qué tan quemado está el mercado.
// De eso depende el REGISTRO del guion, no el contenido.
//
//   La primera vez que oís "baja de peso sin dieta" te emociona.
//   La vez cincuenta ya no le creés nada. El producto no cambió — cambió el mercado.
//
// Sin esto, el guionista escribía siempre en el mismo registro: claim directo,
// que es el nivel 1. En un mercado nivel 4 —donde vive la mayoría de LATAM— eso
// suena atrasado y se pierde en el montón.
//
// Se manda UN SOLO nivel al prompt, no los cinco. Mandarlos todos gasta tokens y
// encima invita al modelo a promediar entre registros, que es justo lo contrario
// de lo que hace falta: la sofisticación pide comprometerse con uno.

export const NIVELES = {
  1: {
    nombre: "Pionero — el claim directo",
    mercado: "Nadie hizo esta promesa antes. El mercado está virgen.",
    piensa: "¿En serio esto existe? Nunca había visto algo así.",
    hace: "Decí el beneficio claro y directo. La novedad hace el trabajo sola.",
    evita: "Explicar el mecanismo y la ciencia. Nadie duda todavía porque nadie prometió nada: complicás de más.",
    ejemplo: "\"Blanquea tus dientes en casa en 10 minutos.\"",
  },
  2: {
    nombre: "Amplificar el claim",
    mercado: "Ya hay competencia diciendo lo mismo. La promesa simple no sorprende.",
    piensa: "Eso ya lo vi… ¿y qué? ¿Qué tenés vos de diferente?",
    hace: "Subí la promesa: más resultado, en menos tiempo, con menos esfuerzo. Más específica y más grande.",
    evita: "Repetir el claim plano que usan todos. Sonás igual que la competencia.",
    ejemplo: "\"Blanquea 8 tonos en 7 días, sin sensibilidad.\" (antes era: \"en 10 minutos\")",
  },
  3: {
    nombre: "El mecanismo único",
    mercado: "Ya oyó todas las promesas exageradas y dejó de creerlas. Gritar más fuerte no sirve.",
    piensa: "Todos dicen lo mismo… ¿pero cómo funciona esto? ¿Por qué este sí y no los otros?",
    hace: "Explicá el CÓMO: el ingrediente, proceso, tecnología o método que hace que tu producto sí logre lo que promete. La promesa es el qué; el mecanismo es el por qué te lo tengo que creer.",
    evita: "Quedarte en la promesa. Sin mecanismo, en un mercado quemado, sos ruido.",
    ejemplo: "\"Gel con luz LED azul que activa el peróxido — por eso blanquea más rápido que las tiras.\"",
  },
  4: {
    nombre: "Mejorar el mecanismo",
    mercado: "Todos explican su mecanismo. La pregunta ya no es cómo funciona, sino cuál es mejor.",
    piensa: "Ok, todos tienen su ingrediente mágico… ¿cuál es el mejor? ¿Cuál no tiene la pega del otro?",
    hace: "Nombrá la falla del mecanismo ajeno y mostrá que el tuyo la resuelve. Compará.",
    evita: "Presentar tu mecanismo como si fuera nuevo. Ya lo tienen todos: te quedaste en nivel 3 y sonás atrasado.",
    ejemplo: "\"Las tiras con peróxido manchan y dan sensibilidad. Nuestro gel con hidroxiapatita blanquea sin dañar el esmalte.\"",
  },
  5: {
    nombre: "Identidad y tribu",
    mercado: "Tan quemado que ya no cree promesas NI mecanismos. Lo único que mueve es a quién quiere pertenecer.",
    piensa: "Todos dicen que son los mejores… ¿con cuál me identifico? ¿Cuál es para alguien como yo?",
    hace: "Hablá de quién es tu cliente y qué representa usar la marca. El producto es la excusa; la identidad es la venta.",
    evita: "Seguir gritando \"la mejor fórmula\". Ya nadie escucha eso.",
    ejemplo: "\"Para los que sonríen sin miedo.\" — no habla del gel, vende la confianza.",
  },
};

export const NIVEL_MIN = 1;
export const NIVEL_MAX = 5;

export function nivelValido(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= NIVEL_MIN && v <= NIVEL_MAX;
}

// El bloque que se pega al prompt. Devuelve "" si no hay nivel cargado: sin dato
// es mejor no decir nada que inventar un registro, porque escribir en el nivel
// equivocado es peor que escribir sin la regla.
export function bloqueSofisticacion(nivel) {
  if (!nivelValido(nivel)) return "";
  const n = Number(nivel);
  const d = NIVELES[n];

  // Se nombra el nivel siguiente sin desarrollarlo: la regla del curso es "un
  // paso adelante de la competencia", pero desarrollarlo entero hace que el
  // modelo escriba directo en ese nivel y se saltee al que el mercado está.
  const siguiente = n < NIVEL_MAX
    ? `\nSi podés, asomate medio paso hacia el nivel ${n + 1} (${NIVELES[n + 1].nombre}) sin abandonar el ${n}: el curso pide ir un paso adelante de la competencia, no dos.\n`
    : "";

  return `\n## SOFISTICACIÓN DEL MERCADO — NIVEL ${n} DE 5: ${d.nombre.toUpperCase()}
Esto define el REGISTRO del guion, no su contenido. El mismo producto se vende de cinco formas distintas según qué tan quemado esté el mercado.

Cómo está el mercado: ${d.mercado}
Lo que piensa quien te ve: "${d.piensa}"

QUÉ HACER: ${d.hace}
QUÉ EVITAR: ${d.evita}
Ejemplo del registro correcto: ${d.ejemplo}
${siguiente}`;
}
