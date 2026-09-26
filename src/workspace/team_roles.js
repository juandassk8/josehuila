// Los 6 roles esenciales de cualquier equipo de producción de contenido y
// anuncios. Una persona puede cumplir varios roles simultáneamente.

export const ROLES = [
  {
    key: "copywriter",
    label: "Copywriter",
    icon: "✍️",
    color: "#3B8BD4",
    tagline: "Ideas, guiones, viralidad",
    description: "Piensa el contenido antes de producirlo. Entiende atención, viralidad y conexión con la audiencia. Traduce productos en mensajes que conectan y generan respuesta.",
    skills: [
      "Entiende redes sociales y qué funciona en cada plataforma",
      "Pensamiento viral — sabe qué ideas pueden viralizar",
      "Escribe hooks, guiones, estructuras y ángulos de contenido",
    ],
    priority: 1,
    importance: "El rol más importante del equipo",
    liveName: "copywriter.live",
    manuals: [
      { label: "WoW · Curso de Copywriting para anuncios", type: "course", url: "https://www.wayofwinning.com/copywriting" },
      { label: "Manual de plataforma · Documento de conceptos", type: "platform", url: null },
      { label: "Librería de hooks y ángulos ganadores", type: "resource", url: null },
    ],
  },
  {
    key: "project_manager",
    label: "Project Manager",
    icon: "📋",
    color: "#8B5CF6",
    tagline: "Orden, sistema, ejecución",
    description: "No crea contenido, pero hace que todo el equipo funcione sin romperse. Organiza carpetas, entregas y documentos. Sigue procesos y monitorea el progreso.",
    skills: [
      "Organiza el caos (carpetas, entregas, documentos)",
      "Flujos de trabajo — sigue procesos establecidos",
      "Gestión de tareas — asigna, pone fechas y monitorea",
    ],
    priority: 2,
    importance: "El segundo rol más importante",
    liveName: "pm.live",
    manuals: [
      { label: "WoW · Curso de Project Management para equipos creativos", type: "course", url: "https://www.wayofwinning.com/project-management" },
      { label: "Manual de plataforma · Pipeline y War Room", type: "platform", url: null },
      { label: "Plantillas de flujos semanales", type: "resource", url: null },
    ],
  },
  {
    key: "content",
    label: "Content",
    icon: "🎥",
    color: "#E24B4A",
    tagline: "Grabación, volumen, material real",
    description: "El encargado de grabar el contenido en video. No piensa la estrategia ni los guiones — materializa las ideas en video real y usable. Puede ser UGC externo, persona interna o el mismo dueño grabando clips.",
    skills: [
      "Graba siguiendo lineamientos y estructuras",
      "Interpreta naturalmente — creíble, auténtico",
      "Genera volumen — muchos clips y variaciones",
      "Formatos simples, repetibles y naturales",
    ],
    priority: 3,
    importance: "Sin grabación, no hay anuncios — no hay escala",
    canBeUgcPool: true,
    liveName: "content.live",
    manuals: [
      { label: "WoW · Curso de UGC y grabación de contenido", type: "course", url: "https://www.wayofwinning.com/ugc" },
      { label: "Manual de plataforma · Cómo entregar material", type: "platform", url: null },
      { label: "Checklist de grabación (iluminación, audio, formato)", type: "resource", url: null },
    ],
  },
  {
    key: "editor",
    label: "Editor de Video",
    icon: "✂️",
    color: "#C94C9E",
    tagline: "Videos, ritmo, piezas consumibles",
    description: "Convierte grabaciones en piezas listas para consumo. Entiende qué hace que un video se vea real, atractivo y perfecto para anuncios.",
    skills: [
      "Buen gusto visual — profesional vs amateur",
      "Retención y ritmo — timing para mantener atención",
      "Sensibilidad estética — limpio, natural, coherente",
      "Edición minimalista — sin sobreproducir",
    ],
    priority: 4,
    liveName: "editor.live",
    manuals: [
      { label: "WoW · Curso de edición para anuncios que convierten", type: "course", url: "https://www.wayofwinning.com/editing" },
      { label: "Manual de plataforma · Entregas y versiones", type: "platform", url: null },
      { label: "Librería de transiciones, fonts y SFX", type: "resource", url: null },
    ],
  },
  {
    key: "designer",
    label: "Diseñador",
    icon: "🎨",
    color: "#1DB97A",
    tagline: "Estáticos que venden",
    description: "Crea anuncios visuales enfocados en convertir, no solo verse bonitos. Combina estética con funcionalidad comercial.",
    skills: [
      "Diseño orientado a conversión",
      "Estética de marca consistente",
      "Nociones básicas de tráfico",
      "Sabe qué funciona en anuncios",
    ],
    priority: 5,
    liveName: "designer.live",
    manuals: [
      { label: "WoW · Curso de diseño de estáticos para ads", type: "course", url: "https://www.wayofwinning.com/design" },
      { label: "Manual de plataforma · Specs y entregables", type: "platform", url: null },
      { label: "Sistema de marca y templates", type: "resource", url: null },
    ],
  },
  {
    key: "trafficker",
    label: "Trafficker",
    icon: "📊",
    color: "#06B6D4",
    tagline: "Tráfico, pauta, performance",
    description: "El media buyer — corre las campañas de Meta Ads. Define estructura de campaña, presupuestos, audiencias. Pausa lo que no funciona, escala lo que sí. Lee data y decide cuándo matar o duplicar creativos.",
    skills: [
      "Estructura de campañas (CBO/ABO, audiencias, creatives)",
      "Interpretación de métricas — ROAS, CPA, CTR, frecuencia",
      "Optimización día a día — presupuesto, pausas, escalas",
      "Comunica aprendizajes al copywriter/diseñador para iterar",
    ],
    priority: 6,
    liveName: "trafficker.live",
    manuals: [
      { label: "WoW · Curso de Media Buying para Meta Ads", type: "course", url: "https://www.wayofwinning.com/media-buying" },
      { label: "Manual de plataforma · Reportes e insights", type: "platform", url: null },
      { label: "Plantilla de reporting semanal", type: "resource", url: null },
    ],
  },
  {
    key: "owner",
    label: "Dueño",
    icon: "👑",
    color: "#F5A623",
    tagline: "Visión, decisiones, estrategia",
    description: "Define visión, toma decisiones clave y da apoyo estratégico al equipo. Puede grabar contenido, aportar ideas o cualquier rol en etapas tempranas.",
    skills: [
      "Visión del negocio y producto",
      "Decisiones estratégicas",
      "Apoyo al equipo — desbloquea obstáculos",
    ],
    priority: 7,
    liveName: "owner.live",
    manuals: [
      { label: "WoW · Curso para fundadores y líderes creativos", type: "course", url: "https://www.wayofwinning.com/founders" },
      { label: "Manual de plataforma · Visión general del War Room", type: "platform", url: null },
      { label: "Playbook de decisiones estratégicas", type: "resource", url: null },
    ],
  },
];

export const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r]));

// Colores para avatares asignados rotativamente a miembros nuevos.
export const AVATAR_COLORS = [
  "#E24B4A", "#3B8BD4", "#1DB97A", "#F5A623",
  "#8B5CF6", "#C94C9E", "#06B6D4", "#F97316",
];
