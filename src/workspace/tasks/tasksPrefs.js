// Preferencias del Centro de Tareas — que el tablero abra donde uno lo dejó.
//
// Antes los filtros eran `useState` sueltos: se borraban al recargar y al
// cambiar de vista. Uno dejaba "Hoy" en Por estado, pasaba por Por fecha, volvía
// y otra vez "Esta semana". Armarse la vista a mano, cada vez.
//
// Se guarda por (empresa, persona). La persona va en la llave porque dos
// personas en el mismo computador no tienen por qué heredar la vista del otro
// —y el default es "mis tareas", que del otro no le sirve a nadie.
//
// Dos reglas, que salieron de cómo se usa de verdad:
//
//   · QUIÉN vale en las tres vistas. Uno filtra "lo mío" una vez, no tres.
//   · CUÁNDO se guarda POR VISTA. Dejar "Hoy" en Por estado no tiene por qué
//     cambiar lo que ves en Por persona; son dos preguntas distintas.
//
// "Por fecha" no guarda días a propósito: ahí los días SON las columnas, así que
// abre siempre en la semana y su control pasa a decir cuánto se ve hacia
// adelante. Antes ese chip se vaciaba y no hacía nada — el mismo botón
// significaba una cosa en dos vistas y ninguna en la tercera.

export const VISTAS = ["estado", "fecha", "persona"];
export const VISTA_SIN_DIAS = "fecha";

// Cuánto se ve hacia adelante en "Por fecha".
export const RANGOS = [
  { span: 7, label: "Esta semana" },
  { span: 14, label: "Dos semanas" },
  { span: 30, label: "Este mes" },
];

const POR_DEFECTO = { vista: "estado", quien: null, dias: {}, span: 7 };

export const prefsKey = (companyId, memberId) =>
  `tareas_prefs_${companyId || "sin-empresa"}_${memberId || "anon"}`;

// El almacenamiento se inyecta para poder testear sin navegador, y porque en
// Safari privado `localStorage` existe pero tirar al escribir.
const almacen = (storage) => {
  if (storage) return storage;
  try { return window.localStorage; } catch { return null; }
};

export function leerPrefs(companyId, memberId, storage) {
  const s = almacen(storage);
  if (!s) return { ...POR_DEFECTO };
  let crudo = null;
  try { crudo = s.getItem(prefsKey(companyId, memberId)); } catch { return { ...POR_DEFECTO }; }
  if (!crudo) return { ...POR_DEFECTO };
  let p;
  try { p = JSON.parse(crudo); } catch { return { ...POR_DEFECTO }; }
  if (!p || typeof p !== "object") return { ...POR_DEFECTO };

  const dias = {};
  for (const v of VISTAS) {
    if (v === VISTA_SIN_DIAS) continue;
    if (Array.isArray(p.dias?.[v])) dias[v] = p.dias[v].filter((d) => typeof d === "string");
  }
  return {
    vista: VISTAS.includes(p.vista) ? p.vista : POR_DEFECTO.vista,
    // `null` es "nunca eligió" y `[]` es "eligió ver todo". Son cosas distintas:
    // de la primera se sale al default de mis tareas, de la segunda no.
    quien: Array.isArray(p.quien) ? p.quien.filter(Boolean) : null,
    dias,
    span: RANGOS.some((r) => r.span === p.span) ? p.span : POR_DEFECTO.span,
  };
}

export function guardarPrefs(companyId, memberId, prefs, storage) {
  const s = almacen(storage);
  if (!s) return;
  const dias = {};
  for (const v of VISTAS) {
    if (v === VISTA_SIN_DIAS) continue;
    if (prefs?.dias?.[v]?.length) dias[v] = prefs.dias[v];
  }
  try {
    s.setItem(prefsKey(companyId, memberId), JSON.stringify({
      vista: prefs?.vista, quien: prefs?.quien ?? null, dias, span: prefs?.span,
    }));
  } catch { /* sin espacio o en privado: la vista igual funciona, solo no se recuerda */ }
}

// Qué personas se muestran al abrir. La primera vez arranca en lo tuyo — es toda
// la diferencia entre abrir Tareas y tener que armártelo.
//
// Devuelve `null` para "todavía no se sabe": el equipo se carga en otra consulta
// y hasta que llegue no hay cómo saber si uno es parte de él. Sin esa espera, un
// arranque rápido guardaría "Todos" como si lo hubieras elegido vos, y ya nunca
// volvería a abrir en lo tuyo.
export function resolverQuien(prefs, memberId, members) {
  if (Array.isArray(prefs?.quien)) return prefs.quien;   // ya eligió alguna vez
  if (!members?.length) return null;
  return memberId && members.some((m) => m.id === memberId) ? [memberId] : [];
}
