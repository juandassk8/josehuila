// Configuración central de tours por sección. Cada tour tiene:
//   - key: identificador (se guarda en tours_completed jsonb)
//   - label: nombre humano (mostrado en botón "?" / settings)
//   - urlMatchers: paths donde el tour es relevante (auto-trigger detection)
//   - steps: array de pasos {target, content, title?, placement?}
//
// Selectores `target` apuntan a `data-tour="..."` attributes en los componentes.
// IMPORTANTE: si el target no existe en el DOM cuando se dispara el tour,
// react-joyride salta ese paso silenciosamente. Por eso es seguro tener tours
// más detallados que la UI actual.

export const TOURS = {
  warroom: {
    key: "warroom",
    label: "War Room",
    // El war room es la HOME — path sin subruta. /equipo, /admin/slug, /cliente/slug.
    urlMatchers: ["^/equipo/warroom$", "^/equipo$", "^/admin/[^/]+/?$", "^/cliente/[^/]+/?$"],
    steps: [
      {
        // Paso 1 = bienvenida centrada (no apunta a un elemento específico).
        // Joyride usa "body" + placement: "center" para mostrar el tooltip
        // en el medio sin flecha.
        target: "body",
        placement: "center",
        title: "👋 Bienvenido al War Room",
        content: "Acá siempre arrancás el día — ves cómo va la empresa, tu equipo, tus creativos y tus tareas, todo en un vistazo. Te muestro las partes principales en 5 pasos rápidos.",
        disableBeacon: true,
      },
      {
        target: '[data-tour="panel-general"]',
        title: "Métricas globales",
        content: "Métricas de los últimos 7 días, hoy, o el rango que filtres. Se actualiza con cada reporte que generes.",
        placement: "bottom",
      },
      {
        target: '[data-tour="equipo-activo"]',
        title: "Tu equipo en vivo",
        content: "Ves quién está conectado y en qué tarea está.",
        placement: "bottom",
      },
      {
        target: '[data-tour="panel-operaciones"]',
        title: "Producción semanal",
        content: "Tus creativos en cada estado: idea, guionizado, listo para grabar, editado. Te dice si vas cumpliendo el objetivo de la semana.",
        placement: "top",
      },
      {
        target: '[data-tour="tareas-summary"]',
        title: "Resumen de tareas",
        content: "El pulso rápido del equipo. Mismo data que en la sección Tareas.",
        placement: "top",
      },
      {
        target: '[data-tour="actividad"]',
        title: "Actividad reciente",
        content: "Qué subió quién, qué aprobaron, qué cambió.",
        placement: "left",
      },
    ],
  },

  equipo: {
    key: "equipo",
    label: "Equipo (cliente)",
    // Solo el equipo del workspace cliente — el equipo Inforce tiene su propio tour.
    urlMatchers: ["^/admin/[^/]+/equipo", "^/cliente/[^/]+/equipo"],
    steps: [
      {
        target: '[data-tour="btn-agregar-rol"]',
        title: "Agregá personas",
        content: "Cada persona del equipo entra acá. Cada una tiene un rol (Copy, Traffic, Editor, Diseñador, UGC, Project, Dueño).",
        placement: "bottom",
      },
      {
        target: '[data-tour="form-rol"]',
        title: "Ficha del miembro",
        content: "Nombre, rol, correo, contraseña y cumpleaños. El cumpleaños importa — el equipo recibe notificación esa semana.",
        placement: "right",
      },
      {
        target: '[data-tour="colores-rol"]',
        title: "Color por rol",
        content: "Cada rol tiene color. Cuando veas una tarea o creativo asignado, de un vistazo sabés de quién es.",
        placement: "top",
      },
      {
        target: '[data-tour="permisos"]',
        title: "Permisos por rol",
        content: "El rol define qué herramientas puede usar la persona. Solo el Copy usa el Guionista IA; solo el Trafficker sube reportes.",
        placement: "bottom",
      },
    ],
  },

  tareas: {
    key: "tareas",
    label: "Tareas",
    // Solo en workspace cliente — el team Inforce tiene team-agenda.
    urlMatchers: ["^/admin/[^/]+/tareas", "^/cliente/[^/]+/tareas"],
    steps: [
      {
        target: '[data-tour="espacios-trabajo"]',
        title: "Espacios de trabajo",
        content: "Creás espacios: Anuncios, Logística, Marca, lo que sea. Es tu ClickUp interno.",
        placement: "right",
      },
      {
        target: '[data-tour="btn-nueva-tarea"]',
        title: "Asignación a personas",
        content: "Cada tarea se asigna a una persona del equipo. Las elegís del dropdown.",
        placement: "bottom",
      },
      {
        target: '[data-tour="papelera"]',
        title: "Papelera",
        content: "¿Borraste una tarea por error? Acá se guarda por si la necesitás recuperar.",
        placement: "right",
      },
    ],
  },

  despliegue: {
    key: "despliegue",
    label: "Despliegue Creativo",
    urlMatchers: ["/despliegue", "/admin/[^/]+/despliegue", "/cliente/[^/]+/despliegue"],
    steps: [
      {
        target: '[data-tour="tabs-tofu-mofu-bofu"]',
        title: "Niveles de conciencia",
        content: "TOFU: atrae público frío. MOFU: da información y construye conexión. BOFU: cierra la venta.",
        placement: "bottom",
      },
      {
        target: '[data-tour="tabs-estaticos-videos"]',
        title: "Estáticos vs Videos",
        content: "Cada nivel se separa en estáticos y videos. La biblioteca crece con vos.",
        placement: "bottom",
      },
      {
        target: '[data-tour="btn-agregar-concepto"]',
        title: "Agregá conceptos",
        content: "Cada concepto es un formato: 'Disculpa', 'Directo', 'Testimonial', 'Versus'… nombre + descripción + al menos 3 referentes.",
        placement: "bottom",
      },
      {
        target: '[data-tour="referencias"]',
        title: "Tus referentes",
        content: "Pegá screenshots de la biblioteca de anuncios o Foreplay. Entre más referentes tengas, mejor guioniza la IA.",
        placement: "top",
      },
      {
        target: '[data-tour="concepto-status"]',
        title: "Calificación de conceptos",
        content: "Cuando testeás un creativo, lo calificás como Winner / Promesa / Sangra / Fracaso. La plataforma aprende qué conceptos funcionan.",
        placement: "top",
      },
    ],
  },

  pipeline: {
    key: "pipeline",
    label: "Content Pipeline",
    urlMatchers: ["/admin/[^/]+/pipeline", "/cliente/[^/]+/pipeline"],
    steps: [
      {
        target: '[data-tour="planear-semana"]',
        title: "Planeá tu semana",
        content: "La plataforma lee tu inversión semanal, CPA y ticket promedio, y te dice cuántos conceptos testear en TOFU/MOFU/BOFU.",
        placement: "bottom",
      },
      {
        target: '[data-tour="distribucion-slider"]',
        title: "Distribución por nivel",
        content: "Ajustás el % por nivel. Marca nueva → TOFU alto. Si ya vendés mucho, podés subir MOFU/BOFU.",
        placement: "right",
      },
      {
        target: '[data-tour="generar-slots"]',
        title: "Generar slots",
        content: "Te crea los slots vacíos del contenido a producir esta semana. Cada uno ya viene con su concepto asignado.",
        placement: "bottom",
      },
      {
        target: '[data-tour="pipeline-columnas"]',
        title: "Flujo del slot",
        content: "Idea → Guionizado → En grabación → Editado → Publicado. Cada persona ve solo lo que le toca.",
        placement: "top",
      },
      {
        target: '[data-tour="btn-revisar"]',
        title: "Revisión batch",
        content: "Cuando un creativo está en revisión, el PM lo aprueba o pide cambios con un Loom.",
        placement: "bottom",
      },
      {
        target: '[data-tour="filtros-video-static"]',
        title: "Filtros",
        content: "Filtrá por videos o estáticos. El flujo es diferente para cada uno.",
        placement: "bottom",
      },
    ],
  },

  guionista: {
    key: "guionista",
    label: "Guionista IA (cliente)",
    // Solo el guionista del workspace cliente — el de team Inforce es team-guiones.
    urlMatchers: ["/admin/[^/]+/pipeline.*guiones", "/cliente/[^/]+/pipeline.*guiones"],
    steps: [
      {
        target: '[data-tour="info-producto"]',
        title: "Info del producto",
        content: "Subí PDF, escribí manual o pegá la URL del sitio. La IA la lee y genera guiones con tus precios, beneficios y cliente ideal.",
        placement: "bottom",
      },
      {
        target: '[data-tour="selector-producto"]',
        title: "Selector de producto",
        content: "Si manejás varios productos en la misma marca, acá elegís para cuál es el guion.",
        placement: "bottom",
      },
      {
        target: '[data-tour="concepto-script"]',
        title: "Conceptos disponibles",
        content: "Los conceptos de Despliegue Creativo aparecen acá. La IA copia la estructura del concepto elegido.",
        placement: "bottom",
      },
      {
        target: '[data-tour="notas-guion"]',
        title: "Contexto del guion",
        content: "A quién va dirigido, qué ángulo tomar, qué dolor tocar. Entre más específico, mejor sale.",
        placement: "top",
      },
      {
        target: '[data-tour="referencia-propia-vs-tercero"]',
        title: "Referencia propia vs tercero",
        content: "Si la referencia es tuya, la IA aprende tu forma de hablar. Si es de tercero, solo saca la estructura.",
        placement: "top",
      },
      {
        target: '[data-tour="tokens"]',
        title: "Límite de tokens",
        content: "Tenés un límite mensual. Si querés sin límite, conectá tu propia API de Anthropic en Integraciones.",
        placement: "top",
      },
      {
        target: '[data-tour="exportar-guiones"]',
        title: "Exportar a PDF",
        content: "Cuando tenés varios guiones listos, los exportás en un PDF con UGC asignada, hooks y body.",
        placement: "bottom",
      },
    ],
  },

  reportes: {
    key: "reportes",
    label: "Reportes",
    urlMatchers: ["/reporte/", "/reportes/", "/nuevo-reporte"],
    steps: [
      {
        target: '[data-tour="nuevo-reporte"]',
        title: "Tipos de reporte",
        content: "Mensuales, semanales o puntuales (por horas). Según para qué los necesités.",
        placement: "bottom",
      },
      {
        target: '[data-tour="import-csv"]',
        title: "Import de CSV",
        content: "Exportá el CSV de Meta y subilo acá. Si conectás tu cuenta por API, esto se automatiza.",
        placement: "right",
      },
      {
        target: '[data-tour="metricas-objetivo"]',
        title: "Métricas vs objetivos",
        content: "Compara contra los objetivos que pusiste en Configuración. Verde = bien, amarillo = regular, rojo = mal.",
        placement: "top",
      },
      {
        target: '[data-tour="analisis-ia"]',
        title: "Análisis IA",
        content: "Qué está pasando, qué anuncio sangra, qué acción tomar.",
        placement: "left",
      },
      {
        target: '[data-tour="simulacion"]',
        title: "Simulaciones",
        content: "¿Qué pasa si subís tu conversión 20%? Útil para proyectar y poner presión sana al equipo.",
        placement: "top",
      },
      {
        target: '[data-tour="notas-copy"]',
        title: "Notas para copy",
        content: "Notas automáticas: qué ángulos están funcionando. Se manda al chat del equipo.",
        placement: "top",
      },
    ],
  },

  escalamiento: {
    key: "escalamiento",
    label: "Calculadora de Escalamiento",
    urlMatchers: ["/scaling", "/escalamiento", "/despliegue.*scaling"],
    steps: [
      {
        target: '[data-tour="input-objetivo"]',
        title: "Tu objetivo",
        content: "Cuánto querés vender y en cuánto tiempo. 'Quiero facturar 200M en 3 semanas.'",
        placement: "bottom",
      },
      {
        target: '[data-tour="output-winners"]',
        title: "Cuántos winners necesitás",
        content: "Te dice cuántos anuncios testear por semana, con qué win rate, para sacar los winners necesarios.",
        placement: "right",
      },
      {
        target: '[data-tour="proyeccion-roas"]',
        title: "Proyección de ROAS",
        content: "Cuánto te va a caer el ROAS al testear más, y cuánto recuperás con los winners.",
        placement: "left",
      },
      {
        target: '[data-tour="plan-semanal"]',
        title: "Plan semana a semana",
        content: "Cuántos creativos nuevos, cuánto presupuesto de testeo, cuánto para escalar ganadores.",
        placement: "top",
      },
    ],
  },

  // ─── Tours del team Inforce (zona /equipo) ──────────────────────────
  // Versiones simplificadas — 1 paso centrado por sección. Jose y Nat
  // navegan por estas vistas y necesitan saber qué hace cada una.

  "team-empresas": {
    key: "team-empresas",
    label: "Empresas",
    urlMatchers: ["/equipo/empresas"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "🏢 Tus clientes",
        content: "Acá ves la lista de todas las empresas que manejás. Click en una para entrar a su workspace, ver reportes, conceptos, tareas, lo que sea. Las métricas de cada una aparecen al costado.",
        disableBeacon: true,
      },
    ],
  },

  "team-contenido": {
    key: "team-contenido",
    label: "Contenido (interno)",
    urlMatchers: ["/equipo/contenido"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "🎬 Contenido interno de Inforce",
        content: "Esta es la producción de contenido propio de Inforce (no de tus clientes). Mismo flujo: ideas → guionizado → grabación → edición → publicado. Acá organizás los videos de tu marca personal y de la agencia.",
        disableBeacon: true,
      },
    ],
  },

  "team-guiones": {
    key: "team-guiones",
    label: "Guionista (interno)",
    urlMatchers: ["/equipo/guiones"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "✍️ Guionista IA — interno",
        content: "El mismo guionista que tienen tus clientes, pero para tus videos personales. La IA aprendió tu voz de los videos propios que cargaste. Generás guiones, los ajustás, los exportás.",
        disableBeacon: true,
      },
    ],
  },

  "team-tracking": {
    key: "team-tracking",
    label: "Master Tracking",
    urlMatchers: ["/equipo/tracking"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "📡 Master Tracking",
        content: "Vista semanal de TODOS tus clientes en una sola tabla — qué hito está cumpliendo cada uno, qué falta, dónde hay riesgo. Útil para tu reunión semanal de operaciones.",
        disableBeacon: true,
      },
    ],
  },

  "team-equipo": {
    key: "team-equipo",
    label: "Equipo Inforce",
    urlMatchers: ["/equipo/equipo"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "👥 Tu equipo Inforce",
        content: "Tu equipo interno (Nat, editores, copies). Distinto del equipo de cada cliente. Click en un miembro para ver su workspace personal — su scorecard, sus tareas, sus manuales.",
        disableBeacon: true,
      },
    ],
  },

  "team-agenda": {
    key: "team-agenda",
    label: "Mi agenda",
    urlMatchers: ["/equipo/agenda"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "🗓️ Tu agenda del día",
        content: "Solo TUS tareas asignadas, ordenadas por urgencia y fecha. Vista lista o kanban. Si filtrás por 'Hoy' ves exactamente qué tenés que cerrar antes de irte.",
        disableBeacon: true,
      },
    ],
  },

  "team-feedback": {
    key: "team-feedback",
    label: "Feedback",
    urlMatchers: ["/equipo/feedback"],
    steps: [
      {
        target: "body",
        placement: "center",
        title: "💬 Inbox de feedback",
        content: "Todos los reportes que envían tus clientes desde el botón Feedback flotante caen acá. Bug, sugerencia, lo que sea. Click en uno para ver detalle + capturas. Marcá status para no perderle el rastro.",
        disableBeacon: true,
      },
    ],
  },
};

// Detecta qué tour aplica para el path actual.
// Devuelve la key del tour o null si ninguno matchea.
export function detectTourForPath(pathname) {
  if (!pathname) return null;
  for (const [key, tour] of Object.entries(TOURS)) {
    for (const matcher of tour.urlMatchers) {
      // Soporta matchers regex-like (con .*)
      const re = new RegExp(matcher);
      if (re.test(pathname)) return key;
    }
  }
  return null;
}
