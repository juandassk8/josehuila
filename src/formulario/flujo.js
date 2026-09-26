// El guion del formulario de onboarding — docs/formulario-onboarding.md.
//
// Acá vive TODO lo que no es pintar: qué dice cada pantalla, qué campo guarda, a
// qué punto del Estándar alimenta, cuándo aparece y a cuál se vuelve. Puro, sin
// React: lo usan las pantallas y lo usa `api/onboarding-form.js`.
//
// ⚠️ El copy es el del spec, tal cual. No se reescribe ni se "mejora" acá.
//
// En los textos: **negrilla** (las rutas de menú dentro de la instrucción gris) y
// *cursiva* los pinta la pantalla. Los que dependen de lo que el cliente ya
// respondió son funciones de `ctx`:
//   ctx = { nombre, marca, r (respuestas por campo), c (calculados), hoy }

import { pesos, decimal, miles, mesMasTres } from "./formato.js";

export const BLOQUES = [
  { n: 1, titulo: "Tu marca" },
  { n: 2, titulo: "Tus productos" },
  { n: 3, titulo: "Tus números" },
  { n: 4, titulo: "Tu web" },
  { n: 5, titulo: "Tus clientes" },
  { n: 6, titulo: "Tu equipo" },
];

const marca = (ctx) => ctx.marca || "tu marca";
const es = (campo, valor) => (r) => r[campo] === valor;
const porCategoria = (r) => typeof r.num_productos === "number" && r.num_productos > 20;
const hayContraentrega = (r) => Number(r.reparto_pago?.contraentrega) > 0;
const metaMenorSinConfirmar = (r) =>
  typeof r.facturacion_objetivo_3m === "number" && typeof r.facturacion_mes_pasado === "number" &&
  r.facturacion_objetivo_3m < r.facturacion_mes_pasado &&
  r.meta_menor_confirmada !== r.facturacion_objetivo_3m;

export const PANTALLAS = [
  // ── Bloque 1 · Tu marca ───────────────────────────────────────────────────
  {
    id: "1.0", bloque: 1, tipo: "bienvenida",
    // Feedback de José (2026-09-21): «Hola,» adelante, 15 minutos y no 20, y nada de
    // un bloque de texto: tres bloquecitos.
    titulo: "Hola, bienvenido a Inforce 🦾", azul: "Inforce",
    texto: "Llegamos a tus llamadas con tu caso ya estudiado.",
    puntos: [
      { icono: "reloj", titulo: "15 minutos", texto: "Es lo que te toma llenarlo." },
      { icono: "mapa", titulo: "Te decimos dónde está cada dato", texto: "En cada pregunta." },
      { icono: "pausa", titulo: "Para y sigue cuando quieras", texto: "Se guarda solo." },
    ],
    boton: "Arrancar",
  },
  {
    id: "1.1", bloque: 1, tipo: "pregunta", control: "texto",
    campo: "contacto_nombre", puntos: ["perfil"],
    titulo: "Primero lo primero: ¿cómo te llamas?",
  },
  {
    id: "1.2", bloque: 1, tipo: "pregunta", control: "texto",
    campo: "marca_nombre", puntos: ["perfil"],
    titulo: (ctx) => `Un gusto, ${ctx.nombre}. ¿Cómo se llama tu marca?`,
  },
  {
    // La bisagra de todo el formulario. No es un punto del Estándar: es un
    // interruptor global (pesos de las dimensiones, el 1.9, los cuatro puntos
    // aspiracionales). Nada de eso se construye acá; el dato queda limpio en su
    // propio campo para que el resto del sistema lo lea de ahí.
    id: "1.3", bloque: 1, tipo: "pregunta", control: "tarjetas",
    campo: "tipo_marca", puntos: [],
    // Sin instrucción: la explicación no se entendía. El ejemplo va DENTRO de cada
    // tarjeta, que es donde se decide.
    titulo: (ctx) => `¿Qué tipo de marca es ${marca(ctx)}?`,
    opciones: [
      { valor: "marca_propia", texto: "Marca propia que resuelve un problema", ejemplo: "Suplementos, cuidado de la piel, productos para mascotas" },
      { valor: "aspiracional", texto: "Marca aspiracional", ejemplo: "Ropa, accesorios, joyería, calzado" },
      { valor: "dropshipping", texto: "Dropshipping", ejemplo: "Vendes productos de un proveedor, sin marca propia" },
    ],
  },
  {
    // Rama 1 de 4: un dropshipper no sigue llenando esto.
    id: "salida", bloque: 1, tipo: "salida", si: es("tipo_marca", "dropshipping"),
    texto: (ctx) => `Gracias, ${ctx.nombre}. El dropshipping lo medimos con otro estándar — este formulario está hecho para marcas y las preguntas que siguen no aplicarían a tu operación. Te escribimos en las próximas horas con el tuyo. No tienes que llenar nada más aquí.`,
  },
  {
    // La web es la EVIDENCIA de esos puntos, no una calificación: José entra
    // como entraría un comprador que viene de un anuncio.
    id: "1.4", bloque: 1, tipo: "pregunta", control: "url",
    campo: "web_url", puntos: ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8"],
    titulo: (ctx) => `¿Cuál es la página de ${marca(ctx)}?`,
    instruccion: "Pégala completa, con https. Si tienes varias, la que reciben los anuncios.",
  },
  {
    id: "1.5", bloque: 1, tipo: "pregunta", control: "instagram",
    campo: "instagram", puntos: ["7.1"],
    titulo: "¿Y el Instagram?",
    instruccion: "El arroba, o el link del perfil si no te lo sabes. Si manejan varias cuentas, la principal.",
  },
  {
    id: "1.6", bloque: 1, tipo: "pregunta", control: "socios",
    campo: "socios", puntos: ["perfil", "9.1"],
    titulo: (ctx) => `¿Quiénes son los dueños de ${marca(ctx)}?`,
    agregar: "Agregar otro socio",
    // Cambió (decisiones.md): el correo ya no es el usuario del portal, es contacto.
    instruccion: "Inclúyete tú. Los datos son para contactarlos: el acceso al portal de cada uno lo creamos nosotros al final.",
  },

  // ── Bloque 2 · Tus productos ──────────────────────────────────────────────
  {
    // Cambio de sección: título grande, bajada corta, un gráfico y el botón.
    id: "2.r", bloque: 2, tipo: "respiro", icono: "caja",
    titulo: "Ahora hablemos de lo que vendes.", azul: "lo que vendes.",
    texto: "Tus productos y lo que te deja cada uno. Con eso sabemos qué vale la pena pautar.",
  },
  {
    id: "2.1", bloque: 2, tipo: "pregunta", control: "si_no",
    campo: "maneja_categorias", puntos: ["1.0"],
    titulo: "¿Manejas categorías de producto distintas?",
    instruccion: "Una categoría es un grupo de productos que resuelve algo distinto.",
    // El ejemplo va DIBUJADO, lado a lado: una marca que sí y una que no.
    ejemplo: {
      si: { titulo: "Sí maneja", marca: "Marca de mascotas", grupos: [{ nombre: "Cuidado", items: ["Shampoo", "Acondicionador"] }, { nombre: "Accesorios", items: ["Collares", "Juguetes"] }], pie: "2 categorías" },
      no: { titulo: "No maneja", marca: "Marca de shampoo", grupos: [{ nombre: "Cuidado", items: ["Shampoo 250 ml", "Shampoo 500 ml", "Shampoo 1 L"] }], pie: "El mismo producto en tres tamaños es una sola" },
    },
  },
  {
    id: "2.2", bloque: 2, tipo: "pregunta", control: "numero", si: es("maneja_categorias", "si"),
    campo: "num_categorias", puntos: ["1.0"],
    titulo: "¿Cuántas categorías?",
    instruccion: "Con el ejemplo de arriba serían 2: cuidado y accesorios. Cuenta grupos, no productos.",
  },
  {
    id: "2.3", bloque: 2, tipo: "pregunta", control: "numero",
    campo: "num_productos", puntos: ["1.0"],
    titulo: "¿Cuántos productos vendes en total?",
    instruccion: "Cuenta referencias, no unidades. Si el shampoo viene en tres tamaños, son tres referencias.",
  },
  {
    // Rama 2 de 4: con más de 20 productos, la 2.4 y la 2.5 se saltan. Uno
    // mínimo, hasta tres: hay marcas muy buenas que viven de un solo producto.
    id: "2.4", bloque: 2, tipo: "pregunta", control: "productos", si: (r) => !porCategoria(r),
    campo: "productos_principales", puntos: ["1.0", "2.0"],
    titulo: "Tus tres productos principales",
    agregar: "Agregar otro producto", maximo: 3,
    instruccion: "Los que más facturan hoy, no los que más te gustan. Pon el precio total que paga el cliente: con IVA y con envío.",
  },
  {
    // Más de 20 productos: se llena por categoría (nombre + ticket promedio). El
    // margen por producto/categoría se dejó de pedir: ver la 3.8.
    id: "2.6", bloque: 2, tipo: "pregunta", control: "categorias", si: porCategoria,
    campo: "categorias_detalle", puntos: ["1.0"],
    titulo: "Como tienes más de 20 productos, llénalo por categoría",
    instruccion: "Ticket promedio de la categoría = lo que facturó esa categoría el mes pasado dividido entre el número de pedidos de esa categoría.",
  },

  // ── Bloque 3 · Tus números ────────────────────────────────────────────────
  {
    id: "3.r", bloque: 3, tipo: "respiro", icono: "grafica",
    titulo: "Ahora, tus números.", azul: "tus números.",
    texto: "Es la parte que más sirve. En cada pregunta te decimos dónde encontrar el dato, y al final te mostramos cuánto puedes pagar por una venta.",
  },
  {
    id: "3.1", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "facturacion_mes_pasado", puntos: ["2.0"],
    titulo: (ctx) => `¿Cuánto facturó ${marca(ctx)} el mes pasado?`,
    instruccion: "En Shopify: **Analytics → Reportes → Ventas totales**, con el rango en el mes pasado completo. Si vendes contraentrega, usa el reporte de pedidos **entregados**, no de pedidos creados.",
  },
  {
    id: "3.2", bloque: 3, tipo: "pregunta", control: "pesos",
    // Se pide el TOTAL: el cliente busca un número en el reporte y lo pega; nadie
    // se pone a dividir. El promedio (`facturacion_promedio_3m`) lo calcula el portal.
    campo: "facturacion_3m_total", puntos: ["2.0"],
    titulo: "¿Y cuánto facturaste en los últimos tres meses, en total?",
    instruccion: "El mismo reporte con el rango en 90 días. Pon el total: el promedio lo sacamos nosotros, para saber si el mes pasado fue normal o fue un pico.",
  },
  {
    // De acá sale también el nivel (BASE / ESCALA / ÉLITE), que es calculado.
    id: "3.3", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "facturacion_objetivo_3m", puntos: ["2.0", "1.11"],
    titulo: "¿Cuánto quieres estar facturando dentro de tres meses?",
    instruccion: (ctx) => `No es el sueño de fin de año: es lo que quieres facturar en el mes de ${mesMasTres(ctx.hoy)}. Pónlo serio, porque contra este número se mide todo lo demás.`,
  },
  {
    // Pantalla intermedia, no error rojo. Guarda QUÉ meta confirmó: si después
    // la cambia por otra que también es menor, se le vuelve a preguntar.
    id: "3.3s", bloque: 3, tipo: "confirmacion", si: metaMenorSinConfirmar,
    campo: "meta_menor_confirmada", puntos: [],
    titulo: (ctx) => `Pusiste una meta más baja de lo que facturaste el mes pasado (${pesos(ctx.r.facturacion_mes_pasado)}).`,
    instruccion: "A veces pasa — por ejemplo si el mes pasado fue un pico por una fecha especial. Solo queremos estar seguros de contra qué número vamos a medir todo.",
    confirmar: "Sí, es a propósito", corregir: "No, la corrijo", vuelveA: "3.3",
    valorAlConfirmar: (r) => r.facturacion_objetivo_3m,
  },
  {
    id: "3.4", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "ticket_promedio", puntos: ["2.0"],
    titulo: "¿Cuál es tu ticket promedio?",
    instruccion: "Lo que gasta en promedio alguien que te compra. En Shopify: **Analytics → Valor promedio de pedido**. Si no lo tienes: la facturación del mes pasado dividida entre el número de pedidos de ese mes.",
  },
  {
    id: "3.5", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "gasto_pauta_mes", puntos: ["2.0", "5.0"],
    // Todo el bloque va sobre EL MES PASADO (José, 2026-09-21): la facturación ya se
    // pidió así, y mezclar «mes pasado» con «últimos 30 días» confunde y descuadra.
    titulo: "¿Cuánto invertiste en pauta el mes pasado?",
    instruccion: "Administrador de anuncios de Meta → rango **\"Mes pasado\"** → columna **\"Importe gastado\"**. Suma TikTok y Google si también pautas ahí, y todas tus cuentas publicitarias.",
  },
  {
    // Obligatorio y sin "no lo sé": quien no lo tenga lo saca con el botón. El
    // dato crudo (compras) queda guardado igual, que sirve después.
    id: "3.6", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "cpa_mes", puntos: ["2.1", "2.2"],
    titulo: "¿Cuánto te cuesta conseguir una venta?",
    instruccion: "Administrador de anuncios → rango **\"Mes pasado\"** → columna **\"Costo por resultado\"**, con el resultado en Compras. Si no te aparece, dale a Calcúlalo por mí.",
    calculalo: {
      boton: "Calcúlalo por mí",
      campo: "compras_mes", control: "numero", puntos: ["2.1", "2.2"],
      titulo: "¿Cuántas compras te trajeron los anuncios el mes pasado?",
      instruccion: "Administrador de anuncios → rango **\"Mes pasado\"** → columna **\"Compras\"**. Si vendes contraentrega, cuenta los entregados. Con eso y lo que invertiste, sacamos tu CPA.",
      resultado: (v) => `Tu CPA es ${pesos(v)}. Eso es lo que te cuesta conseguir una venta.`,
    },
  },
  // La 3.7 (¿cuál es tu ROAS?, con su «Calcúlalo por mí») se quitó: José, 2026-09-21,
  // «no importa esta pregunta». El portal guarda el ROAS general del negocio
  // (facturación ÷ pauta) como calculado, que para el diagnóstico alcanza.
  {
    // UNA pregunta, como el cliente la piensa: cuánto le queda de cada venta ya
    // pagando todo, pauta incluida. Reemplaza al margen por producto (2.5), a la
    // confirmación del margen (2.7) y a las dos del IVA (3.8 y 3.8b). El IVA va
    // adentro, como un selector. De aquí y del CPA sale el CPA máximo.
    id: "3.8", bloque: 3, tipo: "pregunta", control: "rentabilidad",
    campo: "rentabilidad_neta", puntos: ["2.1"],
    titulo: "De cada venta, ¿cuánto te queda a ti ya pagando todo?",
    instruccion: "Tu rentabilidad neta por pedido, en promedio: después de producto, envío, devoluciones, pauta y todo lo demás.",
    opcionesIva: [
      { valor: "descontado", texto: "Ya tiene descontado el IVA" },
      { valor: "sin_descontar", texto: "Todavía no le he descontado el IVA" },
      { valor: "no_aplica", texto: "No soy responsable de IVA" },
    ],
  },
  {
    id: "3.9", bloque: 3, tipo: "pregunta", control: "reparto",
    campo: "reparto_pago", puntos: ["2.0"],
    titulo: "De cada 100 pedidos, ¿cuántos son contraentrega y cuántos pagados por adelantado?",
    instruccion: "Contraentrega = el cliente paga cuando recibe. Anticipado = pagó en la web con tarjeta, PSE o Nequi. Si no estás seguro, míralo en tu transportadora o en tu pasarela.",
  },
  {
    // Rama: solo si hay contraentrega. Es dato para el diagnóstico; ya NO entra al
    // CPA máximo (la rentabilidad que dio el cliente ya trae las devoluciones).
    id: "3.10", bloque: 3, tipo: "pregunta", control: "porcentaje", si: hayContraentrega,
    campo: "tasa_entrega", puntos: ["2.0"],
    titulo: "De cada 100 pedidos que despachas contraentrega, ¿cuántos se entregan de verdad?",
    instruccion: "Te lo da tu transportadora: pedidos entregados sobre pedidos despachados, del mes pasado. Es el número que más cambia tu margen real y casi nadie lo tiene presente.",
  },
  {
    // Era «¿qué parte de tu margen quieres que te quede?» (20/30/40/otro). José la
    // quitó: nadie piensa así. Lo que una marca sí tiene claro es a qué CPA quiere
    // llegar. Cuánto margen le queda con ese CPA lo deriva el portal, y no se le
    // menciona al cliente.
    id: "3.11", bloque: 3, tipo: "pregunta", control: "pesos",
    campo: "cpa_objetivo", puntos: ["2.1"],
    titulo: "¿Cuál es tu CPA objetivo?",
    instruccion: "Lo que quieres llegar a pagar por cada venta. Si no tienes uno definido, pon el que te gustaría alcanzar.",
  },
  {
    // La grande. Tres números sin explicarlos todavía. La inversión va a CPA de
    // HOY: es el número honesto y es el que pega. Ninguna de las dos utilidades
    // proyectadas se muestra acá.
    id: "3.f", bloque: 3, tipo: "recompensa",
    titulo: (ctx) => `Estos son tus números, ${ctx.nombre}.`,
    bloques: (ctx) => [
      { titulo: `Tu CPA máximo es ${pesos(ctx.c.cpa_maximo)}`, texto: "Es lo máximo que puedes pagar por una venta sin perder plata.", deDonde: deDondeSaleElCpaMaximo(ctx),
        // «Para no cagarla» (José): cada número dice con qué datos se armó y deja
        // corregirlos ahí mismo. Al corregir, vuelve derecho a esta pantalla.
        corregir: [
          { dato: "Lo que te queda por venta", valor: pesos(ctx.c.rentabilidad_por_venta), ir: "3.8" },
          { dato: "Lo que pagas hoy por venta", valor: pesos(ctx.r.cpa_mes), ir: "3.6" },
        ] },
      { titulo: `Tu ROAS de equilibrio es ${decimal(ctx.c.roas_equilibrio)}`, texto: "Por debajo de ahí, cada venta te cuesta en vez de dejarte.",
        corregir: [{ dato: "Tu ticket promedio", valor: pesos(ctx.r.ticket_promedio), ir: "3.4" }] },
      {
        titulo: `Para facturar ${pesos(ctx.r.facturacion_objetivo_3m)} necesitas ${miles(ctx.c.ventas_necesarias)} ventas al mes`,
        texto: `Con tu CPA de hoy eso son ${pesos(ctx.c.inversion_necesaria_actual)} en pauta.`,
        corregir: [{ dato: "Tu meta a tres meses", valor: pesos(ctx.r.facturacion_objetivo_3m), ir: "3.3" }],
      },
    ],
    // Con 15% de aire o más no va ninguna línea: no se le inventa un problema al
    // que no lo tiene.
    linea: (ctx) => {
      const aire = ctx.c.salud_margen?.aire;
      if (aire === null || aire === undefined) return null;
      if (aire < 0) return `Ojo: hoy estás pagando ${pesos(ctx.r.cpa_mes)} por venta y tu techo es ${pesos(ctx.c.cpa_maximo)}. De eso hablamos en la llamada.`;
      if (Math.round(aire * 1e4) / 1e4 < 0.15) return `Estás a ${pesos(ctx.c.cpa_maximo - ctx.r.cpa_mes)} de tu techo. De eso hablamos en la llamada.`;
      return null;
    },
    boton: "Seguir",
  },

  // ── Bloque 4 · Tu web ─────────────────────────────────────────────────────
  { id: "4.r", bloque: 4, tipo: "respiro", icono: "web", titulo: "Ahora tu web.", azul: "tu web.", texto: "Son dos preguntas y las dos salen del mismo par de reportes." },
  {
    id: "4.1", bloque: 4, tipo: "pregunta", control: "porcentaje", decimales: 1,
    campo: "tasa_conversion", puntos: ["6.1", "2.2"], noLoSe: true,
    titulo: "De cada 100 personas que entran a tu web, ¿cuántas compran?",
    instruccion: "En Shopify: **Analytics → Tasa de conversión de la tienda**, con el rango en el mes pasado. Si no lo tienes: pedidos del mes dividido entre sesiones del mes, por 100. Normal en Colombia es entre 1% y 2,5%.",
  },
  {
    id: "4.2", bloque: 4, tipo: "pregunta", control: "porcentaje",
    campo: "porcentaje_carga", puntos: ["6.2", "2.2"], noLoSe: true,
    titulo: "¿Cuál es el porcentaje de carga de tu página?",
    // La fórmula va dibujada, no en un párrafo.
    formula: { arriba: "Visitas a la página de destino", abajo: "Clics en el enlace", por: "× 100" },
    instruccion: "De cada 100 clics en tus anuncios, cuántos alcanzan a ver tu web. Las dos columnas están en Administrador de anuncios → **personaliza columnas**. Menos de 80% es gente que pagaste y nunca vio nada.",
  },
  {
    // Condicional: forzar una recompensa donde no hay nada que devolver se siente
    // falso. Si `texto` sale null la pantalla no existe y pasa directo.
    id: "4.f", bloque: 4, tipo: "recompensa",
    si: (r) => textoRecompensaWeb(r) !== null,
    texto: (ctx) => textoRecompensaWeb(ctx.r),
    boton: "Seguir",
  },

  // ── Bloque 5 · Tus clientes ───────────────────────────────────────────────
  { id: "5.r", bloque: 5, tipo: "respiro", icono: "clientes", titulo: "Ahora tus clientes.", azul: "tus clientes.", texto: "Dos preguntas sobre la gente que ya te compró." },
  {
    id: "5.1", bloque: 5, tipo: "pregunta", control: "recompra",
    campo: "recompra", puntos: ["8.2", "2.2"], noLoSe: true,
    titulo: "¿Qué porcentaje de tus clientes te vuelve a comprar, y cada cuánto?",
    instruccion: "En Shopify: **Analytics → Clientes → Clientes que regresan**, en los últimos 12 meses. El \"cada cuánto\" es a ojo. Si lo tuyo se compra una sola vez en la vida, márcalo: no es un problema, es información.",
  },
  {
    id: "5.2", bloque: 5, tipo: "pregunta", control: "si_no",
    campo: "base_datos_clientes", puntos: ["8.3"],
    titulo: "¿Tienes la base de datos de tus clientes en un solo lugar y la puedes exportar?",
    instruccion: "Sí = puedes sacar hoy un archivo con nombre, teléfono, correo y qué compró cada uno. Si está repartida entre Shopify, un Excel y los chats de WhatsApp, la respuesta es No.",
  },

  // ── Bloque 6 · Tu equipo ──────────────────────────────────────────────────
  { id: "6.r", bloque: 6, tipo: "respiro", icono: "equipo", titulo: "Y lo último: tu equipo.", azul: "tu equipo.", texto: (ctx) => `Quién está detrás de ${marca(ctx)}.` },
  {
    id: "6.1", bloque: 6, tipo: "pregunta", control: "equipo",
    campo: "equipo", puntos: ["9.1", "9.2", "9.4"],
    titulo: (ctx) => `¿Quién trabaja en ${marca(ctx)} y qué hace cada uno?`,
    agregar: "Agregar persona",
    instruccion: "Todos: de planta, freelance y agencias, contigo y tus socios. Marca lo que hace cada uno de verdad en el día a día; una persona puede tener varios roles.",
    // La lista de roles la propuso Claude Code; pendiente de que José la ajuste.
    roles: ["Dueño / gerencia", "Pauta (trafficker)", "Estrategia creativa", "Guiones / copy", "Grabación / UGC", "Edición de video", "Diseño", "Redes / community", "Servicio al cliente / WhatsApp", "Logística / despachos", "Web / tienda", "Finanzas"],
  },

  // ── El cierre · Su acceso al portal ───────────────────────────────────────
  // `cierre` lo pinta según lo que diga el servidor: C.1 → C.2 si la marca no
  // tiene cuenta; C.ya si ya la tiene (no se toca su contraseña ni se crean
  // usuarios de nuevo).
  {
    id: "C.1", bloque: null, tipo: "cierre", variante: "crear",
    titulo: (ctx) => `Listo, ${ctx.nombre}. Con esto ya podemos estudiar ${marca(ctx)} antes de hablar contigo. Solo falta una cosa: tu acceso.`,
    // El acceso lo crea el portal (decisiones.md): usuario <marca>.<nombre>@inforce.team
    // y contraseña generada. El cliente solo copia y entra.
    etiquetaCorreo: "Tu usuario", etiquetaClave: "Tu contraseña",
    ayuda: "Te los creamos para que no tengas que inventarte nada. Guárdalos ahora — son con los que vas a entrar de aquí en adelante.",
    boton: "Copiar y crear mi acceso",
  },
  {
    id: "C.2", bloque: null, tipo: "cierre", variante: "lista",
    titulo: "Tu cuenta está lista.",
    texto: "Aquí va a vivir todo tu proceso con Inforce: tu diagnóstico, tu plan y tus llamadas.",
    siguiente: "Ya puedes escribirnos por el grupo para agendar tu primera llamada.",
    boton: "Entrar al portal",
  },
  {
    id: "C.ya", bloque: null, tipo: "cierre", variante: "ya_tiene",
    titulo: (ctx) => `Listo, ${ctx.nombre}. Ya tienes cuenta, entra con tu correo de siempre.`,
    siguiente: "Ya puedes escribirnos por el grupo para agendar tu primera llamada.",
    boton: "Entrar al portal",
  },
];

// «No sé de dónde sacaste ese número»: la cuenta, en una línea, debajo del CPA máximo.
function deDondeSaleElCpaMaximo({ r, c }) {
  if (c.cpa_maximo == null) return null;
  return `${pesos(c.rentabilidad_por_venta)} que te quedan por venta + ${pesos(r.cpa_mes)} que pagas hoy por conseguirla = ${pesos(c.cpa_maximo)}`;
}

// Recompensa del bloque 4. Solo los casos que tienen texto escrito; cualquier
// otro (marcó "no lo sé" en las dos, o falta justo el dato que el texto
// necesita) no lleva pantalla.
export function textoRecompensaWeb(r) {
  const carga = typeof r.porcentaje_carga === "number" ? r.porcentaje_carga : null;
  const conv = typeof r.tasa_conversion === "number" ? r.tasa_conversion : null;
  if (carga !== null && carga < 80) {
    return `De cada 100 personas que le dan clic a tus anuncios, ${decimal(100 - carga, 0)} nunca alcanzan a ver tu página. Eso es plata que pagas por gente que no vio nada.`;
  }
  if (carga !== null && conv !== null) {
    return `Tu web convierte al ${decimal(conv)}% y ${decimal(carga, 0)}% de tus clics alcanzan a cargarla.`;
  }
  return null;
}

// ── El motor ────────────────────────────────────────────────────────────────

const POR_ID = Object.fromEntries(PANTALLAS.map((p) => [p.id, p]));
export const pantalla = (id) => POR_ID[id] || null;

const tieneValor = (v) => v !== undefined && v !== null && v !== "";

// Qué campos escribe cada pantalla, con su etiqueta del Estándar. Es lo que el
// servidor usa para guardar: nunca confía en un `campo` que mande el navegador.
export const CAMPOS = (() => {
  const out = {};
  for (const p of PANTALLAS) {
    if (p.campo) out[p.campo] = { pantalla: p.id.replace(/s$/, ""), puntos: p.puntos || [], noLoSe: !!p.noLoSe };
    if (p.calculalo) out[p.calculalo.campo] = { pantalla: p.id, puntos: p.calculalo.puntos || [], noLoSe: false };
  }
  return out;
})();

// "No lo sé" cuenta como respondida: es una respuesta.
export function estaRespondida(p, r = {}, noLoSe = {}) {
  if (!p.campo) return true;
  if (p.noLoSe && noLoSe[p.campo]) return true;
  return tieneValor(r[p.campo]);
}

// Las pantallas que existen PARA ESTE cliente, en orden, con las cuatro ramas ya
// resueltas. Un dropshipper llega hasta la salida y ahí se acaba.
export function pantallasActivas(r = {}) {
  const activas = [];
  for (const p of PANTALLAS) {
    if (p.tipo === "cierre") continue;
    if (p.si && !p.si(r)) continue;
    activas.push(p);
    if (p.tipo === "salida") return activas;
  }
  return activas;
}

// Los campos que cuentan hoy. Si el cliente pasó de 15 a 25 productos, lo que
// había puesto en la 2.4 y la 2.5 NO se borra: queda guardado pero por fuera del
// flujo y de los cálculos. Si vuelve a 15, ahí está.
export function respuestasVigentes(r = {}) {
  const vivos = new Set();
  for (const p of pantallasActivas(r)) {
    if (p.campo) vivos.add(p.campo);
    if (p.calculalo) vivos.add(p.calculalo.campo);
  }
  return Object.fromEntries(Object.entries(r).filter(([campo]) => vivos.has(campo)));
}

// Dónde retomar: la primera pantalla activa que pide algo y no lo tiene. No hay
// índice guardado — se calcula de las respuestas, así que aguanta que cambie una
// rama. Devuelve el id; "cierre" cuando ya respondió todo.
export function siguientePantalla(r = {}, noLoSe = {}) {
  const activas = pantallasActivas(r);
  const nadaRespondido = !activas.some((p) => p.campo && tieneValor(r[p.campo]));
  if (nadaRespondido) return "1.0";
  for (const p of activas) {
    if (p.tipo === "salida") return p.id;
    if ((p.tipo === "pregunta" || p.tipo === "confirmacion") && !estaRespondida(p, r, noLoSe)) return p.id;
  }
  return "cierre";
}

// La que sigue a `id` cuando el cliente va avanzando (acá sí entran respiros y
// recompensas, que al retomar se saltan).
export function despuesDe(id, r = {}) {
  const activas = pantallasActivas(r);
  const i = activas.findIndex((p) => p.id === id);
  if (i === -1) return siguientePantalla(r);
  const sig = activas[i + 1];
  return sig ? sig.id : "cierre";
}

export function antesDe(id, r = {}) {
  const activas = pantallasActivas(r);
  const i = activas.findIndex((p) => p.id === id);
  return i > 0 ? activas[i - 1].id : null;
}

export function estaCompleto(r = {}, noLoSe = {}) {
  return r.tipo_marca !== "dropshipping" && siguientePantalla(r, noLoSe) === "cierre";
}

// Para la barra: en qué bloque va, y cuánto lleva de ESE bloque y del total.
export function progreso(id, r = {}, noLoSe = {}) {
  const p = pantalla(id);
  const preguntas = pantallasActivas(r).filter((x) => x.tipo === "pregunta");
  const hechas = preguntas.filter((x) => estaRespondida(x, r, noLoSe)).length;
  return {
    bloque: p?.bloque ?? BLOQUES.length + 1,
    bloques: BLOQUES.length,
    respondidas: hechas,
    total: preguntas.length,
    fraccion: preguntas.length ? hechas / preguntas.length : 0,
  };
}

// A qué pantalla lleva cada bloque de la barra: se puede devolver a cualquiera
// que ya haya pasado, nunca saltar hacia adelante.
export function bloquesNavegables(r = {}, noLoSe = {}) {
  const hasta = siguientePantalla(r, noLoSe);
  const activas = pantallasActivas(r);
  const tope = hasta === "cierre" ? activas.length : activas.findIndex((p) => p.id === hasta);
  return BLOQUES.map((b) => {
    const i = activas.findIndex((p) => p.bloque === b.n && p.tipo === "pregunta");
    return { ...b, destino: i !== -1 && i <= tope ? activas[i].id : null };
  });
}

// Resuelve un texto que puede ser string o función de ctx.
export const texto = (t, ctx) => (typeof t === "function" ? t(ctx) : t ?? null);
