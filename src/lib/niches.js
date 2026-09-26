// Niches centralizados — usados por:
//   1. OnboardingWizard (signup) para que el cliente elija al crear cuenta.
//   2. ProductInfoPanel (Guionista) para configurar el voice profile y las
//      preguntas específicas por producto.
//
// Cada empresa guarda su nicho en `company_voice_profile.niche` como key.
// Las preguntas resueltas por key alimentan el generador de guiones.

export const NICHES_LIST = [
  {
    key: "moda_accesorios",
    label: "Moda y accesorios",
    emoji: "👗", color: "#C94C9E",
    productPlaceholder: "Ej: Vestido midi verde olivo",
  },
  {
    key: "belleza_cuidado",
    label: "Belleza y cuidado personal",
    emoji: "💄", color: "#EC4899",
    productPlaceholder: "Ej: Sérum facial vitamina C",
  },
  {
    key: "salud_bienestar",
    label: "Salud y bienestar",
    emoji: "🌿", color: "#1DB97A",
    productPlaceholder: "Ej: Colágeno premium 300g",
  },
  {
    key: "fitness_deporte",
    label: "Fitness y deporte",
    emoji: "🏋️", color: "#E24B4A",
    productPlaceholder: "Ej: Mancuernas ajustables 20kg",
  },
  {
    key: "hogar_decoracion",
    label: "Hogar y decoración",
    emoji: "🏠", color: "#F5A623",
    productPlaceholder: "Ej: Lámpara de mesa industrial",
  },
  {
    key: "tecnologia_gadgets",
    label: "Tecnología y gadgets",
    emoji: "📱", color: "#3B82F6",
    productPlaceholder: "Ej: Audífonos inalámbricos premium",
  },
  {
    key: "mascotas",
    label: "Mascotas",
    emoji: "🐶", color: "#8B5CF6",
    productPlaceholder: "Ej: Alimento natural para perros",
  },
  {
    key: "bebes_maternidad",
    label: "Bebés y maternidad",
    emoji: "🍼", color: "#06B6D4",
    productPlaceholder: "Ej: Cochecito de paseo plegable",
  },
  {
    key: "alimentacion_bebidas",
    label: "Alimentación y bebidas",
    emoji: "🥗", color: "#10B981",
    productPlaceholder: "Ej: Granola sin azúcar añadido",
  },
  {
    key: "educacion_digital",
    label: "Educación y productos digitales",
    emoji: "🎓", color: "#6366F1",
    productPlaceholder: "Ej: Curso de marketing digital",
  },
  {
    key: "calzado",
    label: "Calzado y zapatillas",
    emoji: "👟", color: "#0EA5E9",
    productPlaceholder: "Ej: Zapatilla running transpirable",
  },
  {
    key: "agro_campo",
    label: "Agro y campo",
    emoji: "🌾", color: "#65A30D",
    productPlaceholder: "Ej: Fertilizante orgánico · herramienta de campo",
  },
  {
    key: "otro",
    label: "Otro / General (dropshipping)",
    emoji: "📦", color: "#6F84A6",
    productPlaceholder: "Ej: cualquier producto",
  },
];

// Set de preguntas que el Guionista hace sobre cada producto, adaptadas
// al vertical. La AI generará guiones más afilados con esta info.
//
// Estructura: { key, label, placeholder, multiline? }
export const QUESTIONS_BY_KEY = {
  moda_accesorios: [
    { key: "what",     label: "¿Qué prenda o accesorio es?",   placeholder: "Vestido, jean, anillo, bolso, gafas…" },
    { key: "material", label: "Material / tela",                placeholder: "Algodón, lino, cuero, oro 18k…" },
    { key: "sizes",    label: "Tallas / medidas disponibles",   placeholder: "XS, S, M, L, XL · o medidas en cm" },
    { key: "colors",   label: "Colores disponibles",            placeholder: "Negro, blanco, beige, verde olivo…" },
    { key: "style",    label: "Estilo",                         placeholder: "Casual, formal, deportivo, streetwear…" },
    { key: "avatar",   label: "¿Para quién es?",                placeholder: "Avatar del cliente ideal" },
    { key: "diff",     label: "¿Qué lo diferencia?",            placeholder: "Corte, calidad, durabilidad, hecho a mano…", multiline: true },
    { key: "price",    label: "Precio",                         placeholder: "Ej: $150.000 COP" },
  ],

  belleza_cuidado: [
    { key: "what",         label: "¿Qué producto es?",            placeholder: "Sérum, crema, shampoo, máscara…" },
    { key: "promise",      label: "¿Qué promete?",                placeholder: "El beneficio principal (manchas, hidratación, antiage…)" },
    { key: "ingredients",  label: "Ingredientes activos",         placeholder: "Vitamina C, retinol, ácido hialurónico…", multiline: true },
    { key: "skinType",     label: "Tipo de piel / cabello",       placeholder: "Grasa, mixta, seca, sensible · liso, rizado…" },
    { key: "usage",        label: "Cómo se usa",                  placeholder: "AM/PM, frecuencia, paso a paso" },
    { key: "timing",       label: "¿En cuánto se ven resultados?", placeholder: "Ej: primeros cambios a las 2 semanas" },
    { key: "diff",         label: "¿Qué lo diferencia?",          placeholder: "Vs competencia (concentración, fórmula, cruelty-free…)", multiline: true },
    { key: "price",        label: "Precio",                       placeholder: "Ej: $120.000 COP" },
  ],

  salud_bienestar: [
    { key: "what",         label: "¿Qué es el producto?",          placeholder: "Suplemento, vitamina, infusión, dispositivo…" },
    { key: "promise",      label: "¿Qué promete?",                 placeholder: "El beneficio principal" },
    { key: "avatar",       label: "¿Para quién es?",               placeholder: "Avatar (edad, situación, dolor)" },
    { key: "ingredients",  label: "Ingredientes / activos",        placeholder: "Qué contiene y en qué cantidades", multiline: true },
    { key: "usage",        label: "Cómo se usa",                   placeholder: "Dosis, cuándo tomarlo, con qué" },
    { key: "timing",       label: "¿En cuánto tiempo resultados?", placeholder: "Ej: primeros cambios a las 2 semanas" },
    { key: "diff",         label: "¿Qué lo diferencia?",           placeholder: "Vs la competencia / otras opciones", multiline: true },
    { key: "price",        label: "Precio",                        placeholder: "Ej: $120.000 COP" },
  ],

  fitness_deporte: [
    { key: "what",     label: "¿Qué producto/equipo es?",     placeholder: "Mancuernas, suplemento pre-entreno, ropa, máquina…" },
    { key: "avatar",   label: "¿Para quién es? (nivel)",      placeholder: "Principiante / intermedio / avanzado · objetivo" },
    { key: "usage",    label: "Cómo se usa",                  placeholder: "Frecuencia, rutina sugerida, espacio necesario" },
    { key: "benefit",  label: "Beneficio principal",          placeholder: "Aumentar fuerza / quemar grasa / movilidad…", multiline: true },
    { key: "specs",    label: "Especificaciones",             placeholder: "Peso, dimensiones, materiales", multiline: true },
    { key: "diff",     label: "¿Qué lo diferencia?",          placeholder: "Calidad, ergonomía, garantía…", multiline: true },
    { key: "price",    label: "Precio",                       placeholder: "Ej: $250.000 COP" },
  ],

  hogar_decoracion: [
    { key: "what",       label: "¿Qué es el producto?",          placeholder: "Lámpara, mueble, decoración, textil…" },
    { key: "material",   label: "Material / acabado",            placeholder: "Madera, metal, mimbre, lino…" },
    { key: "dimensions", label: "Dimensiones",                   placeholder: "Largo × ancho × alto (cm o m)" },
    { key: "style",      label: "Estilo decorativo",             placeholder: "Industrial, nórdico, boho, minimalista…" },
    { key: "avatar",     label: "¿Para quién/qué espacio?",      placeholder: "Sala, cocina, exterior · perfil del cliente" },
    { key: "diff",       label: "¿Qué lo diferencia?",           placeholder: "Diseño, hecho a mano, sostenible…", multiline: true },
    { key: "price",      label: "Precio",                        placeholder: "Ej: $180.000 COP" },
  ],

  tecnologia_gadgets: [
    { key: "what",      label: "¿Qué dispositivo/gadget?",       placeholder: "Audífonos, smartwatch, drone, accesorio…" },
    { key: "specs",     label: "Especificaciones técnicas",      placeholder: "Procesador, batería, conectividad…", multiline: true },
    { key: "compat",    label: "Compatibilidad",                 placeholder: "iOS, Android, Windows, Mac, etc." },
    { key: "benefit",   label: "Beneficio principal",            placeholder: "Lo que el usuario REALMENTE gana", multiline: true },
    { key: "avatar",    label: "¿Para quién es?",                placeholder: "Avatar del cliente ideal" },
    { key: "warranty",  label: "Garantía / soporte",             placeholder: "Ej: 1 año + soporte técnico" },
    { key: "diff",      label: "¿Qué lo diferencia?",            placeholder: "Vs Apple, Samsung, etc.", multiline: true },
    { key: "price",     label: "Precio",                         placeholder: "Ej: $450.000 COP" },
  ],

  mascotas: [
    { key: "what",         label: "¿Qué producto es?",              placeholder: "Alimento, juguete, accesorio, salud…" },
    { key: "petType",      label: "Tipo de mascota",                placeholder: "Perro, gato, ave, conejo…" },
    { key: "petAge",       label: "Edad / tamaño",                  placeholder: "Cachorro, adulto, senior · pequeño/grande" },
    { key: "benefit",      label: "Beneficio principal",            placeholder: "Lo que ofrece a la mascota / dueño", multiline: true },
    { key: "ingredients",  label: "Composición / ingredientes",     placeholder: "Si aplica (alimentos, snacks, medicación)", multiline: true },
    { key: "usage",        label: "Cómo se usa",                    placeholder: "Frecuencia, cantidad, instrucciones" },
    { key: "diff",         label: "¿Qué lo diferencia?",            placeholder: "Vs otras opciones del mercado", multiline: true },
    { key: "price",        label: "Precio",                         placeholder: "Ej: $80.000 COP" },
  ],

  bebes_maternidad: [
    { key: "what",      label: "¿Qué producto es?",            placeholder: "Cochecito, biberón, ropa, juguete educativo…" },
    { key: "ageRange",  label: "Edad recomendada",             placeholder: "Ej: 0-6m · 6-12m · 1-3 años…" },
    { key: "safety",    label: "Certificaciones / seguridad",  placeholder: "BPA-free, ASTM, normativa local…", multiline: true },
    { key: "material",  label: "Material",                     placeholder: "Algodón orgánico, silicona grado médico…" },
    { key: "benefit",   label: "Beneficio principal",          placeholder: "Lo que ofrece al bebé/mamá", multiline: true },
    { key: "usage",     label: "Cómo se usa",                  placeholder: "Instrucciones de uso/montaje" },
    { key: "diff",      label: "¿Qué lo diferencia?",          placeholder: "Vs competencia", multiline: true },
    { key: "price",     label: "Precio",                       placeholder: "Ej: $350.000 COP" },
  ],

  alimentacion_bebidas: [
    { key: "what",         label: "¿Qué producto es?",          placeholder: "Snack, bebida, suplemento alimenticio, comida lista…" },
    { key: "ingredients",  label: "Ingredientes",               placeholder: "Lista breve de los principales", multiline: true },
    { key: "nutritional",  label: "Información nutricional",    placeholder: "Calorías, proteína, azúcares por porción", multiline: true },
    { key: "avatar",       label: "¿Para quién es?",            placeholder: "Avatar / lifestyle (fit, vegano, kids…)" },
    { key: "usage",        label: "Cómo se consume",            placeholder: "Listo para comer, mezclar, etc." },
    { key: "claims",       label: "Claims / sellos",            placeholder: "Sin azúcar añadido, vegano, orgánico, sin gluten…" },
    { key: "diff",         label: "¿Qué lo diferencia?",        placeholder: "Vs alternativas del mercado", multiline: true },
    { key: "price",        label: "Precio",                     placeholder: "Ej: $35.000 COP" },
  ],

  educacion_digital: [
    { key: "what",          label: "¿Qué tipo de producto digital/curso?", placeholder: "Curso, mentoría, ebook, comunidad, templates…" },
    { key: "promise",       label: "¿Qué entrega / qué promete?",          placeholder: "Resultado concreto que el alumno consigue", multiline: true },
    { key: "avatar",        label: "¿Para quién es?",                       placeholder: "Avatar (nivel, ocupación, dolor)", multiline: true },
    { key: "duration",      label: "Duración / formato",                    placeholder: "Ej: 8 semanas · self-paced · grupos en vivo" },
    { key: "certification", label: "Certificación / entregable",            placeholder: "Diploma, plantillas, soporte…" },
    { key: "modules",       label: "Módulos / contenido",                   placeholder: "Resumen de los temas principales", multiline: true },
    { key: "instructors",   label: "Instructores / respaldo",               placeholder: "Quiénes dictan, credenciales" },
    { key: "diff",          label: "¿Qué lo diferencia?",                   placeholder: "Vs otros cursos/mentorías", multiline: true },
    { key: "price",         label: "Inversión",                             placeholder: "Ej: $1.200.000 COP · 3 cuotas" },
  ],

  calzado: [
    { key: "what",     label: "¿Qué tipo de calzado?",        placeholder: "Zapatilla, bota, tacón, sandalia, mocasín…" },
    { key: "material", label: "Material / construcción",       placeholder: "Cuero, malla transpirable, sintético, gamuza…" },
    { key: "sizes",    label: "Tallas disponibles",            placeholder: "Ej: 35–43 · numeración US/EU" },
    { key: "colors",   label: "Colores disponibles",           placeholder: "Negro, blanco, beige…" },
    { key: "useCase",  label: "¿Para qué se usa?",             placeholder: "Running, casual, formal, outdoor, trabajo…" },
    { key: "comfort",  label: "Confort / tecnología",          placeholder: "Amortiguación, plantilla ortopédica, impermeable…", multiline: true },
    { key: "avatar",   label: "¿Para quién es?",               placeholder: "Avatar del cliente ideal" },
    { key: "diff",     label: "¿Qué lo diferencia?",           placeholder: "Comodidad, durabilidad, diseño, precio…", multiline: true },
    { key: "price",    label: "Precio",                        placeholder: "Ej: $220.000 COP" },
  ],
  agro_campo: [
    { key: "what",     label: "¿Qué producto es?",             placeholder: "Herramienta, insumo, semilla, maquinaria, equipo…" },
    { key: "useFor",   label: "¿Para qué cultivo/animal/tarea?", placeholder: "Café, ganado, riego, fumigación…", multiline: true },
    { key: "specs",    label: "Especificaciones",              placeholder: "Material, capacidad, potencia, rendimiento…", multiline: true },
    { key: "benefit",  label: "Beneficio principal",           placeholder: "Rendimiento, ahorro de tiempo, durabilidad…", multiline: true },
    { key: "avatar",   label: "¿Para quién es?",               placeholder: "Agricultor, ganadero, finca, vivero…" },
    { key: "diff",     label: "¿Qué lo diferencia?",           placeholder: "Vs otras opciones del mercado", multiline: true },
    { key: "price",    label: "Precio",                        placeholder: "Ej: $180.000 COP" },
  ],

  // ──────────────────────────────────────────────────────────────────────
  // Legacy — empresas existentes con estas keys siguen funcionando.
  // No aparecen en el selector pero sus questions resuelven igual.
  // ──────────────────────────────────────────────────────────────────────
  suplementos: [
    { key: "what",         label: "¿Qué es el producto?",       placeholder: "Ej: Colágeno hidrolizado en polvo" },
    { key: "promise",      label: "¿Qué promete?",              placeholder: "El beneficio principal que resuelve" },
    { key: "avatar",       label: "¿Para quién es?",            placeholder: "Avatar del cliente ideal (edad, situación, dolor)" },
    { key: "ingredients",  label: "Ingredientes / activos",     placeholder: "Qué contiene y en qué cantidades", multiline: true },
    { key: "usage",        label: "Cómo se usa",                placeholder: "Dosis, cuándo tomarlo, con qué" },
    { key: "timing",       label: "¿En cuánto tiempo resultados?", placeholder: "Ej: primeros cambios a las 2 semanas" },
    { key: "diff",         label: "¿Qué lo diferencia?",        placeholder: "Vs la competencia / otras opciones", multiline: true },
    { key: "price",        label: "Precio",                     placeholder: "Ej: $120.000 COP" },
  ],
  joyeria: [
    { key: "what",        label: "¿Qué pieza es?",              placeholder: "Anillo, collar, aretes, pulsera…" },
    { key: "material",    label: "Material",                    placeholder: "Oro, plata, acero, baño de oro…" },
    { key: "meaning",     label: "Significado / ocasión",       placeholder: "Aniversario, autoregalo, milestone…", multiline: true },
    { key: "avatar",      label: "¿Para quién es?",             placeholder: "Avatar del cliente ideal" },
    { key: "customizable", label: "¿Se puede personalizar?",    placeholder: "Ej: grabado, tallas, color" },
    { key: "diff",        label: "¿Qué lo diferencia?",         placeholder: "Diseño único, handmade, hipoalergénico…", multiline: true },
    { key: "price",       label: "Precio",                      placeholder: "Ej: $280.000 COP" },
  ],
  moda: [
    { key: "what",       label: "¿Qué prenda/categoría?",       placeholder: "Vestido, jean, abrigo, set deportivo…" },
    { key: "material",   label: "Material / tela",              placeholder: "Algodón, lino, sintético…" },
    { key: "sizes",      label: "Tallas disponibles",           placeholder: "XS, S, M, L, XL" },
    { key: "colors",     label: "Colores",                      placeholder: "Negro, blanco, beige…" },
    { key: "style",      label: "Estilo",                       placeholder: "Casual, formal, deportivo, streetwear…" },
    { key: "avatar",     label: "¿Para quién es?",              placeholder: "Avatar del cliente ideal" },
    { key: "diff",       label: "¿Qué lo diferencia?",          placeholder: "Corte, diseño, durabilidad…", multiline: true },
    { key: "price",      label: "Precio",                       placeholder: "Ej: $150.000 COP" },
  ],
  servicios: [
    { key: "what",          label: "¿Qué tipo de servicio?",       placeholder: "Diplomado, curso, asesoría, certificación, membresía…" },
    { key: "promise",       label: "¿Qué entrega / qué promete?",  placeholder: "Ej: certificación + network + conocimiento aplicable", multiline: true },
    { key: "avatar",        label: "¿Para quién es?",              placeholder: "Ej: abogados que buscan especializarse en derecho tributario", multiline: true },
    { key: "duration",      label: "Duración / formato",           placeholder: "Ej: 120 horas · online asincrónico · 3 meses" },
    { key: "certification", label: "Certificación / entregable",   placeholder: "¿Qué recibe al terminar? Diploma, título, credenciales…" },
    { key: "modules",       label: "Módulos / pensum",             placeholder: "Breve resumen de los temas principales", multiline: true },
    { key: "instructors",   label: "Instructores / respaldo",      placeholder: "Quiénes dictan, con qué credenciales" },
    { key: "diff",          label: "¿Qué lo diferencia?",          placeholder: "Vs otras academias u opciones del mercado", multiline: true },
    { key: "price",         label: "Inversión",                    placeholder: "Ej: $2.500.000 COP · 3 cuotas de 800k" },
  ],
  otro: [
    { key: "what",    label: "¿Qué es el producto?",  placeholder: "Nombre + descripción corta" },
    { key: "promise", label: "¿Qué promete?",          placeholder: "El beneficio principal" },
    { key: "avatar",  label: "¿Para quién es?",        placeholder: "Avatar del cliente ideal" },
    { key: "diff",    label: "¿Qué lo diferencia?",    placeholder: "Vs la competencia", multiline: true },
    { key: "price",   label: "Precio",                 placeholder: "Ej: $100.000 COP" },
    { key: "notes",   label: "Notas libres",           placeholder: "Cualquier contexto adicional relevante", multiline: true },
  ],
};

// Resuelve las preguntas para un nicho dado. Si el nicho no se conoce,
// devuelve las preguntas genéricas de "otro".
export function questionsForNiche(nicheKey) {
  return QUESTIONS_BY_KEY[nicheKey] || QUESTIONS_BY_KEY.otro;
}

// Devuelve metadata visual del nicho (label, emoji, color). Si es un legacy
// que no está en NICHES_LIST, devuelve null y el caller debe fallback.
export function nicheMeta(nicheKey) {
  return NICHES_LIST.find((n) => n.key === nicheKey) || null;
}
