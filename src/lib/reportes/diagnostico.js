// La cadena de diagnóstico — clase 9.5 del curso.
//
// El CPA alto solo avisa que ALGO falla. La cadena, leída en orden, señala el
// eslabón exacto, y así se arregla la pieza correcta en vez de tirar el creativo
// —o de culpar al anuncio cuando el problema era la web.
//
//   aparece → engancha → retiene → da clic → carga la web → inicia pago → compra
//
// El orden NO es decorativo: se recorre de arriba abajo y se para en el primer
// eslabón roto. Si el hook está mal, medir el checkout no dice nada — la gente ni
// llegó. Por eso `diagnosticarCadena` devuelve el PRIMER roto, no la lista de
// todos los que dan bajo.
//
// Hay TRES formas de no poder juzgar un eslabón, y se distinguen a propósito:
// `sin_datos` (falta la métrica), `sin_umbral` (el dato está pero el curso nunca
// fijó el número) y `ok`. Meterlos todos en la misma bolsa haría que un umbral
// que Jose debe decidir parezca un problema técnico.
//
// ── Sobre los umbrales ───────────────────────────────────────────────
//
// Los del curso están marcados como ORIENTATIVOS, y el propio curso dice que la
// referencia que manda es el histórico de cada cuenta: un CTR de 1% puede ser
// malo en una cuenta y excelente en otra. Acá van como valores por defecto,
// sobreescribibles por cuenta. No son ley y el código no los trata como tal.
//
// ── Sobre lo que no se puede medir ───────────────────────────────────
//
// Un eslabón sin datos devuelve `sin_datos` y NO se saltea en silencio: si se
// salteara, la cadena diría "el anuncio está bien, el problema es el negocio"
// cuando en realidad nadie miró la web. Un diagnóstico incompleto que se anuncia
// es útil; uno que se hace pasar por completo, no.
//
// Hoy los únicos que faltan de verdad son hook y hold: son métricas
// PERSONALIZADAS de Meta y hay que crearlas una vez. El resto del tramo de la web
// —carga de página, pagos iniciados, conversión de checkout— sale de columnas que
// la exportación ya trae, y se calculan como razones entre ellas.

export const UMBRALES_CURSO = {
  hookRate: 0.30,          // bien ≳ 30%
  hookRateFlojo: 0.20,     // flojo por debajo de ~20%
  holdRate: 0.15,          // bien ≳ 15%
  ctr: 0.015,              // bien ≳ 1,5%
  ctrFlojo: 0.008,         // flojo por debajo de ~0,8%
  cargaPagina: 0.80,       // bien ≳ 80%
  cargaPaginaFlojo: 0.70,  // por debajo de ~70% → web lenta
  conversionCheckout: 0.40,// bien ≳ 40%
  conversionWebMin: 0.01,  // ~1% – 3% saludable en ecommerce
};

const hay = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

// Los seis eslabones, en el orden en que se leen. `mide` saca el valor de las
// métricas; `roto` decide; `accion` es lo que hay que arreglar — la acción
// concreta, no el principio.
function eslabones(u) {
  return [
    {
      key: "hook", tramo: "anuncio", titulo: "El arranque",
      mide: (m) => m.hookRate,
      roto: (v) => v < u.hookRateFlojo,
      accion: "Cambiá el hook — los 3 primeros segundos. No todo el video.",
      porque: "Frenan el scroll pocos: el problema está al empezar.",
    },
    {
      key: "hold", tramo: "anuncio", titulo: "El cuerpo",
      mide: (m) => m.holdRate,
      roto: (v) => v < u.holdRate,
      accion: "Reescribí el cuerpo o cambiá el ritmo.",
      porque: "Enganchó y después aburre: el guion pierde a la gente a la mitad.",
    },
    {
      key: "clic", tramo: "anuncio", titulo: "La promesa",
      mide: (m) => m.ctr,
      roto: (v) => v < u.ctrFlojo,
      accion: "Reescribí la promesa o la oferta del anuncio.",
      porque: "Ven el video pero no clican: falta deseo o un motivo claro para ir a la web.",
    },
    {
      key: "carga", tramo: "web", titulo: "La velocidad",
      mide: (m) => m.cargaPagina,
      roto: (v) => v < u.cargaPaginaFlojo,
      accion: "Arreglá la velocidad de la web.",
      porque: "Clican pero no alcanzan a ver la página: está lenta o pesada.",
    },
    {
      key: "intencion", tramo: "web", titulo: "La oferta",
      mide: (m) => m.pagosIniciados,
      // El curso describe este eslabón pero NUNCA le fijó un número, y es uno de
      // los que Jose quedó debiendo. Se muestra el valor y no se juzga: inventar
      // el umbral acá haría que el sistema mande a rehacer ofertas sanas con un
      // criterio que no es el suyo. `sinUmbral` lo dice en la cara en vez de
      // esconderlo como "sin datos", que sería mentir sobre por qué.
      sinUmbral: true,
      roto: () => false,
      accion: "Revisá producto, precio y página.",
      porque: "Entran pero no se antojan.",
    },
    {
      key: "checkout", tramo: "web", titulo: "El último paso",
      mide: (m) => m.conversionCheckout,
      roto: (v) => v < u.conversionCheckout,
      accion: "Revisá envío, métodos de pago y confianza.",
      porque: "Inician el pago y se van. Acá se cae mucha plata.",
    },
  ];
}

// Recorre la cadena y devuelve el estado de cada eslabón más el primero roto.
//
// `metricas` usa fracciones (0.30 = 30%), no porcentajes: mezclarlos es el error
// clásico y acá se decide una sola vez.
export function diagnosticarCadena(metricas = {}, { umbrales = {} } = {}) {
  const u = { ...UMBRALES_CURSO, ...umbrales };
  const m = metricas || {};

  const pasos = eslabones(u).map((e) => {
    const valor = e.mide(m);
    if (!hay(valor)) return { ...e, valor: null, estado: "sin_datos" };
    if (e.sinUmbral) return { ...e, valor: Number(valor), estado: "sin_umbral" };
    return { ...e, valor: Number(valor), estado: e.roto(Number(valor), m) ? "roto" : "ok" };
  });

  const primerRoto = pasos.find((p) => p.estado === "roto") || null;
  const sinDatos = pasos.filter((p) => p.estado === "sin_datos");

  // Solo se puede afirmar "toda la cadena va bien" si TODOS los eslabones se
  // pudieron medir. Con agujeros, lo honesto es decir que no se sabe.
  // "Completa" = todo lo que se PUEDE evaluar se evaluó. Un eslabón sin umbral
  // no bloquea la conclusión —el dato está, lo que falta es la decisión de Jose—
  // pero sí se reporta aparte para que se vea qué quedó sin juzgar.
  const cadenaCompleta = sinDatos.length === 0;
  const todoOk = cadenaCompleta && !primerRoto;

  return {
    pasos,
    primerRoto,
    sinDatos: sinDatos.map((p) => p.key),
    sinUmbral: pasos.filter((p) => p.estado === "sin_umbral").map((p) => p.key),
    cadenaCompleta,
    // Cuando toda la cadena da bien y el retorno igual no cuadra, el problema no
    // es una pieza: son márgenes, ticket o costos. Eso es decisión de negocio.
    conclusion: todoOk ? "negocio" : primerRoto ? primerRoto.tramo : "incompleta",
  };
}

// ── Frecuencia: la doble señal (clase 9.6) ───────────────────────────
//
// Frecuencia = impresiones ÷ alcance.
//
// El curso dice que no hay número mágico, y por eso acá NO hay umbral: la fatiga
// se lee como TENDENCIA, no como nivel. Una frecuencia de 7 estable en BOFU es
// normal y hasta deseable —le insistís a quien ya te conoce—; una que sube
// mientras el CPM también sube es fatiga, en cualquier etapa.
//
// Leerlo así disuelve la contradicción del curso, que con un umbral fijo marcaría
// como fatigado todo BOFU sano. Y de paso no hace falta que nadie invente un
// número que el curso nunca fijó.
export function frecuencia({ impresiones, alcance }) {
  const i = Number(impresiones) || 0;
  const a = Number(alcance) || 0;
  return a > 0 ? i / a : 0;
}

export function senalDeFatiga(actual = {}, previo = null) {
  const f = frecuencia(actual);
  if (!previo) return { frecuencia: f, fatiga: false, motivo: "sin período anterior para comparar" };

  const fPrev = frecuencia(previo);
  const subeFrec = f > fPrev;
  const subeCpm = hay(actual.cpm) && hay(previo.cpm) && Number(actual.cpm) > Number(previo.cpm);

  // Las DOS juntas. La frecuencia sola sube por muchas razones —presupuesto,
  // público más chico— y sin el CPM no distingue "estoy insistiendo" de "este
  // público ya me vio de más y a Meta le cuesta colocarme".
  if (subeFrec && subeCpm) {
    return {
      frecuencia: f, fatiga: true,
      motivo: "la frecuencia y el CPM suben juntos: ese público ya vio de más este creativo",
      accion: "Refrescá: meté creativos o ángulos nuevos, o abrí público. No mates al ganador.",
    };
  }
  return { frecuencia: f, fatiga: false, motivo: subeFrec ? "sube la frecuencia pero el CPM no" : "la frecuencia no sube" };
}

// ── Los 3 niveles de fatiga (clase 10.2) ─────────────────────────────
//
// Anidados: creativo ⊂ concepto ⊂ audiencia. Cambiar un video cuando lo fatigado
// es el público entero es tirar plata, así que primero se diagnostica el nivel.
//
// Se resuelve de AFUERA hacia adentro. Si el público entero está quemado, da
// igual qué creativo mires: todos van a dar mal, y concluir "se fatigó este
// video" sería quedarse con el síntoma más chico de un problema grande.
export const NIVELES_FATIGA = {
  1: { nombre: "Creativo", accion: "Sacale variaciones —nuevos hooks, otra edición— o cambialo por otro del mismo concepto." },
  2: { nombre: "Concepto", accion: "No insistas con este concepto: traé uno distinto." },
  3: { nombre: "Audiencia", accion: "Abrí público nuevo con ángulos nuevos." },
};

export function nivelDeFatiga({ cpmSubeEnLaCuenta = false, conceptoEntero = false } = {}) {
  if (cpmSubeEnLaCuenta) return { nivel: 3, ...NIVELES_FATIGA[3] };
  if (conceptoEntero) return { nivel: 2, ...NIVELES_FATIGA[2] };
  return { nivel: 1, ...NIVELES_FATIGA[1] };
}

// ── El orden entre 9.5 y 10.2 ────────────────────────────────────────
//
// El mismo disparador —"el CPA sube"— activa dos rutas que pueden ordenar cosas
// opuestas: la cadena dice "puede ser la web, no tires el creativo"; la fatiga
// dice "rotá el creativo o abrí público". El curso no dice cuál correr primero.
//
// Acá va la cadena PRIMERO, siempre. Es gratis y puede revelar que el problema
// estaba en el checkout, donde rotar creativos no arregla nada y cuesta
// producción. Los tres remedios de la fatiga se pagan; el diagnóstico no.
// Solo cuando la cadena da bien entera se trata como fatiga.
export function queHacer({ metricas, umbrales, actual, previo, fatigaCtx } = {}) {
  const cadena = diagnosticarCadena(metricas, { umbrales });
  if (cadena.primerRoto) {
    return { via: "cadena", cadena, accion: cadena.primerRoto.accion, donde: cadena.primerRoto.titulo };
  }
  if (!cadena.cadenaCompleta) {
    return {
      via: "incompleta", cadena,
      accion: "Faltan datos para descartar la web. Antes de rotar creativos, sumá esas columnas a la exportación de Meta.",
      donde: null,
    };
  }
  const señal = senalDeFatiga(actual || {}, previo);
  if (señal.fatiga) {
    const nivel = nivelDeFatiga(fatigaCtx || {});
    return { via: "fatiga", cadena, señal, nivel, accion: nivel.accion, donde: `Fatiga de ${nivel.nombre.toLowerCase()}` };
  }
  return { via: "negocio", cadena, accion: "La cadena está sana. Si el retorno no cuadra, mirá márgenes, ticket y costos.", donde: null };
}
