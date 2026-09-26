// Content Pipeline — constantes de dominio (etapas, colores, nombre de anuncio,
// cálculo de avance). Fuente única para todo el módulo.
//
// NOTA de reconciliación con `content_items` (para la fase de persistencia):
// las etapas de este módulo son las del handoff — idea/scripting/film/edit/
// campaign/feedback. El sistema viejo usa idea/scripting/to_film/to_edit/
// to_post/posted. El mapeo al migrar: film→to_film, edit→to_edit,
// campaign→to_post/posted, feedback→(nuevo). No renombrar sin migración.

// Orden fijo del embudo. El índice se usa para el % de avance (idea=0 … feedback=5).
export const STAGES = ["idea", "scripting", "film", "edit", "campaign", "feedback"];

// Meta por etapa: color de acento + tinte de fondo + etiqueta visible.
// Los tintes --t-* NO están definidos como CSS vars, así que van con el rgba
// literal del README (mismo patrón que el TINT del resto del codebase).
export const STAGE_META = {
  idea:     { label: "Idea",        color: "var(--ink-3)", tint: "var(--chip)" },
  scripting:{ label: "Scripting",   color: "var(--sel)",   tint: "rgba(74,144,226,.14)" },
  film:     { label: "To Film",     color: "var(--brand)", tint: "var(--brand-soft)" },
  edit:     { label: "To Edit",     color: "var(--pink)",  tint: "rgba(236,111,168,.14)" },
  campaign: { label: "In Campaign", color: "var(--amber)", tint: "rgba(240,169,59,.15)" },
  feedback: { label: "Feedback",    color: "var(--green)", tint: "rgba(52,192,138,.13)" },
};

// ── Qué trabajo genera cada etapa ────────────────────────────────────
// Viven acá, y no junto al motor que las usa (`data/pipelineTasks.js`), para que
// la pantalla de Equipo pueda decir qué tareas le van a llegar a cada rol sin
// arrastrarse el sincronizador entero con Supabase adentro.
//
// `idea` no genera tarea: todavía no hay nada que hacer, es una intención.
export const ETAPA_A_ROL = {
  scripting: "copywriter",
  // Grabar lo hace una UGC de afuera. Lo que existe como trabajo DEL EQUIPO es
  // mandarle el brief, y eso lo coordina el PM. Con `content` la tarea le caía a
  // cualquiera con ese rol — incluido un editor que lo tenía de más.
  film: "project_manager",
  edit: "editor",
  campaign: "trafficker",
  feedback: "trafficker",
};

// Editar un video y diseñar un estático son trabajos distintos, de gente
// distinta, y hasta ahora eran la misma tarea: la etapa `edit` no miraba el
// campo `tipo` del contenido, así que "diez estáticos y cinco videos" llegaba
// como una sola tarea llamada "Editar videos" al editor.
export const TRABAJO_POR_TIPO = {
  edit: {
    video:    { titulo: "Editar videos",     rol: "editor" },
    estatico: { titulo: "Diseñar estáticos", rol: "designer" },
  },
};

// Qué se hace y quién lo hace, para una etapa y un tipo de contenido.
export function trabajoDe(etapa, tipo) {
  const porTipo = TRABAJO_POR_TIPO[etapa]?.[tipo];
  if (porTipo) return porTipo;
  return { titulo: ETAPA_TITULO[etapa] || etapa, rol: ETAPA_A_ROL[etapa] || null };
}

// ¿En esta etapa el tipo cambia el trabajo? Solo donde hay dos oficios distintos.
//
// Editar un video y diseñar un estático son de gente distinta, así que se
// separan. Publicar un anuncio es publicar un anuncio: al trafficker le da lo
// mismo si adentro va un video o una imagen, y separarlo le dejaba DOS tareas
// idénticas el mismo día —"Publicar y optimizar" dos veces— por una diferencia
// que a él no le cambia nada.
export function elTipoCambiaElTrabajo(etapa) {
  return !!TRABAJO_POR_TIPO[etapa];
}

// Marcar un creativo como publicado.
//
// Vive acá y no en cada pantalla porque se hace desde DOS lugares —la fila del
// brief y la vista In Campaign— y estaban desincronizados: la vista principal
// del trafficker escribía solo `publicado`, así que él marcaba sus anuncios y su
// tarea seguía en cero. Publicar ES terminar el trabajo de esa etapa.
export function marcarPublicado(publicado) {
  return { publicado: !!publicado, stage_done: !!publicado };
}

export const ETAPA_TITULO = {
  scripting: "Escribir guiones",
  film: "Mandar a grabar",
  edit: "Editar videos",
  campaign: "Publicar y optimizar",
  feedback: "Recoger feedback",
};

// Qué tareas automáticas le caen a un rol. Es la consecuencia de marcarle un rol
// a alguien en Equipo, y hasta ahora era invisible: a Johan le llegaban tareas de
// grabación porque tenía `content` de más, y no había dónde verlo.
export function tareasDelRol(rol) {
  return Object.entries(ETAPA_A_ROL)
    .filter(([, r]) => r === rol)
    .map(([etapa]) => ETAPA_TITULO[etapa])
    .filter(Boolean);
}

export const stageIndex = (stage) => Math.max(0, STAGES.indexOf(stage));
export const stageLabel = (stage) => STAGE_META[stage]?.label || stage;

// Tintes translúcidos (los --t-* no existen como CSS vars). Valores del README.
export const TINT = {
  neon: "rgba(95,222,240,.13)",  green: "rgba(52,192,138,.13)", amber: "rgba(240,169,59,.15)",
  blue: "rgba(74,144,226,.14)",  purple: "rgba(155,123,240,.15)", pink: "rgba(236,111,168,.14)",
};

// Opciones de formato del meta row, por tipo. El estático las tenía desde
// siempre; el video no tenía ninguna, así que la cabecera decía cosas distintas
// según el tipo del slot y no se podía comparar un brief consigo mismo.
export const FORMATOS_ESTATICO = ["Estático 4:5", "Estático 1:1", "Carrusel"];
export const FORMATOS_VIDEO = ["Vertical 9:16", "Cuadrado 1:1", "Horizontal 16:9"];
export const formatosDe = (tipo) => (tipo === "estatico" ? FORMATOS_ESTATICO : FORMATOS_VIDEO);

// ── Etapas por tipo de contenido ─────────────────────────────────────
// Un estático no se graba: no pasa por To Film. Mostrarle esa etapa era ofrecer
// un casillero que nadie iba a poder terminar —y del que después alguien tenía
// que rescatarlo a mano— además de generarle al PM una tarea de "mandar a
// grabar" por una imagen.
//
// `actual` entra igual aunque no corresponda: hay estáticos que YA quedaron en
// To Film de antes, y esconderles su propia etapa dejaría el select en blanco
// sin decir dónde están.
export function stagesFor(tipo, actual = null) {
  const base = tipo === "estatico" ? STAGES.filter((s) => s !== "film") : STAGES;
  if (actual && !base.includes(actual)) return STAGES.filter((s) => base.includes(s) || s === actual);
  return base;
}

// Adónde va REALMENTE un slot que se manda a una etapa. Arrastrar el brief
// entero a To Film manda todo junto, y los estáticos de esa tanda no tienen nada
// que grabar: siguen derecho a diseño.
export function etapaRealPara(tipo, etapa) {
  if (tipo === "estatico" && etapa === "film") return "edit";
  return etapa;
}

// El número del creativo, formateado. Tres dígitos como mínimo, pero no se
// corta al pasar de 999: #1000 es un número válido, no un error de formato.
export const formatNum = (num) => `#${String(num ?? "").padStart(3, "0")}`;

// ¿La etapa ya está en campaña o después? (para mostrar toggle publicado, etc.)
export const isCampaignOrLater = (stage) => stageIndex(stage) >= stageIndex("campaign");

// Etapas de embudo del banco (para "Planear creativos" y filtros de concepto).
export const FUNNEL_STAGES = [
  { key: "tofu", label: "TOFU", color: "var(--neon)",   desc: "Captar atención en frío" },
  { key: "mofu", label: "MOFU", color: "var(--purple)", desc: "Construir confianza" },
  { key: "bofu", label: "BOFU", color: "var(--amber)",  desc: "Cerrar la compra" },
];

// ── Nivel de conciencia (TOFU / MOFU / BOFU) ─────────────────────────
// Es la etapa del embudo del creativo, y hasta ahora vivía escrita a mano
// adentro del concepto ("UGC MOFU"). Como campo propio se puede filtrar, contar
// y componer la etiqueta al vuelo: si mañana el concepto cambia, la etiqueta se
// actualiza sola porque la cadena compuesta nunca se guarda.
//
// Es la MISMA escala que el embudo del banco (FUNNEL_STAGES), y por eso se
// deriva de ahí: cuando el concepto sale del banco, su etapa es el nivel.
export const NIVELES = FUNNEL_STAGES;
export const NIVEL_LABEL = Object.fromEntries(FUNNEL_STAGES.map((f) => [f.key, f.label]));

// Semáforo: verde arriba del embudo, ámbar en el medio, rojo abajo. Es la
// lectura de un vistazo —cuánto hay de cada cosa en una lista de treinta— y por
// eso no reusa la paleta del banco (neón/violeta/ámbar), que ordena por familia
// de concepto y no por temperatura. Acá el color tiene que decir "frío / tibio /
// caliente" sin que nadie lea la etiqueta.
export const NIVEL_COLOR = { tofu: "var(--green)", mofu: "var(--amber)", bofu: "var(--brand)" };
export const NIVEL_TINT = { tofu: "rgba(52,192,138,.14)", mofu: "rgba(240,169,59,.16)", bofu: "rgba(226,75,74,.13)" };
export const NIVEL_BORDE = { tofu: "rgba(52,192,138,.34)", mofu: "rgba(240,169,59,.38)", bofu: "rgba(226,75,74,.32)" };
export const nivelLabel = (n) => NIVEL_LABEL[n] || "";

// La etiqueta compuesta concepto + nivel, para donde haga falta en una sola
// cadena. Se compone acá y en ningún lado más, para que no haya dos versiones
// del nombre dando vueltas.
export function conceptoEtiqueta(slot = {}) {
  return [(slot.concepto || "").trim(), nivelLabel(slot.nivel_conciencia)].filter(Boolean).join(" ");
}

// % de avance = promedio(indiceEtapa / 5) * 100 sobre los slots en alcance.
export function calcProgress(slots = []) {
  if (!slots.length) return 0;
  const total = slots.reduce((acc, s) => acc + stageIndex(s.stage) / (STAGES.length - 1), 0);
  return Math.round((total / slots.length) * 100);
}

// Las partes del nombre, en orden. El nivel de conciencia va ÚLTIMO y no pegado
// al concepto: leyendo la lista de anuncios en Facebook, lo que cambia entre
// creativos hermanos es el final del nombre, y ahí es donde el ojo lo encuentra
// sin tener que leer los cinco campos de adelante.
//
// `conNivel: false` para donde el nivel se dibuja aparte como etiqueta de color
// —en la fila del slot— y repetirlo en el texto sería decirlo dos veces.
function nameParts(slot, { conNivel = true } = {}) {
  return [
    slot.producto,
    slot.angulo,
    slot.concepto,
    slot.creador && slot.creador !== "Sin creador" ? slot.creador : null,
    slot.desc,
    conNivel ? nivelLabel(slot.nivel_conciencia) : null,
  ].map((p) => (p || "").toString().trim()).filter(Boolean);
}

// Nombre del anuncio autogenerado:
//   Creativo #001 - Producto - Ángulo - Concepto - Creador - Descripción - NIVEL
// Se omiten campos vacíos y el creador si es "Sin creador".
export function buildAdName(slot = {}) {
  const parts = nameParts(slot);
  return `Creativo ${formatNum(slot.num ?? 1)}${parts.length ? " - " + parts.join(" - ") : ""}`;
}

// Nombre completo del creativo (fila colapsada del slot): igual que el anuncio
// pero SIN el prefijo "Creativo #". Vacío → cadena vacía (la UI muestra gris).
export function buildCreativeName(slot = {}, opts) {
  return nameParts(slot, opts).join(" - ");
}
