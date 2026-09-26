// Quién ve la plata de la cuenta.
//
// El Resumen abre con cuatro números —ventas atribuidas, inversión, costo por
// compra y ROAS— y hasta ahora los mostraba sin mirar quién entró. Es la primera
// pantalla que ve cualquiera, así que un editor abría el portal y lo primero que
// leía era cuánto factura el cliente.
//
// No es una regla de seguridad: quien tiene acceso a la cuenta podría deducir
// mucho igual. Es una regla de para qué entra cada uno. El editor entra a editar;
// el trafficker necesita el ROAS porque es literalmente su trabajo.
//
// Vive acá, y no dentro de la pantalla, porque la misma pregunta va a volver en
// Reportes y en el Plan: mejor una sola respuesta que tres parecidas.

const ROLES_CON_NUMEROS = ["owner", "project_manager", "trafficker"];

// `esInforce` viene de `lib/permisos.js`: el equipo interno ve todo, entre por
// donde entre.
export function puedeVerNumerosDelNegocio({ esInforce = false, member = null } = {}) {
  if (esInforce) return true;
  if (member?.is_owner) return true;
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  return roles.some((r) => ROLES_CON_NUMEROS.includes(r));
}

// Para explicar la ausencia en vez de dejar un hueco raro donde había números.
export const MOTIVO_SIN_NUMEROS =
  "Las métricas de la cuenta las ve el equipo de estrategia y tráfico.";
