// Traducir los errores de Postgres a algo que un cliente pueda leer.
//
// Al agregar un miembro, el modal mostraba `e.message` tal cual. Un dueño de
// empresa que intentaba cargar dos veces a la misma persona recibía esto:
//
//   duplicate key value violates unique constraint "company_team_members_email_uniq"
//
// Verificado contra la base con la sesión de un dueño real. No es un cuelgue ni
// un permiso: la fila se rechaza por el índice único (company_id, lower(email)),
// que está bien puesto —dos fichas con el mismo correo en la misma empresa se
// pelearían por la misma credencial—. Lo que faltaba era decirlo en castellano y
// que el mensaje incluya la salida.
//
// El repertorio es corto a propósito: solo los errores que un cliente puede
// provocar desde el formulario. Lo que no está acá cae al mensaje del motor, que
// para un caso raro es mejor que un "algo salió mal" que no ayuda a nadie.

const POR_CODIGO = {
  // Índice único (company_id, lower(email)).
  23505: "Ya hay alguien en este equipo con ese correo. Si es la misma persona, editá su ficha en vez de crear otra.",
  // CHECK de birthday_day (1-31) y birthday_month (1-12).
  23514: "Revisá el día y el mes de cumpleaños: el día va de 1 a 31 y el mes de 1 a 12.",
  // RLS.
  42501: "Tu cuenta no tiene permiso para tocar el equipo de esta empresa.",
  // FK rota.
  23503: "Algo que estás vinculando ya no existe. Recargá la página y probá de nuevo.",
};

export function mensajeErrorMiembro(e) {
  if (!e) return "No se pudo guardar.";

  const codigo = String(e.code || "");
  if (POR_CODIGO[codigo]) return POR_CODIGO[codigo];

  const texto = String(e.message || e || "");

  // Supabase no siempre trae `code` —según por dónde venga el error—, así que el
  // texto es el segundo intento y no el primero.
  if (/duplicate key|already exists/i.test(texto)) return POR_CODIGO[23505];
  if (/row-level security|violates row-level/i.test(texto)) return POR_CODIGO[42501];
  if (/birthday|check constraint/i.test(texto)) return POR_CODIGO[23514];
  if (/Failed to fetch|NetworkError|network/i.test(texto)) {
    return "Se cortó la conexión. Fijate que tengas internet y probá de nuevo.";
  }

  return texto || "No se pudo guardar.";
}

// Deja el día y el mes dentro de lo que la base acepta, mientras se escribe.
// El `min`/`max` del input de número no frena a quien teclea 45: solo limita las
// flechitas. Sin esto, el CHECK de Postgres rebota el guardado entero por un
// número de más.
export function limitarNumero(valor, min, max) {
  const s = String(valor ?? "").replace(/[^\d]/g, "");
  if (!s) return "";
  const n = Math.min(max, Math.max(min, parseInt(s, 10)));
  return String(n);
}
