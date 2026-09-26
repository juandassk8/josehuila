// Quién puede gestionar el workspace de una empresa.
//
// Vivía disperso en App.jsx y de ahí salió el bug: entrar por
// `/admin/<empresa>` daba permisos y entrar por `/cliente/<empresa>` no, siendo
// la misma persona. La diferencia era la URL, no quién sos.
//
// `authMode` describe POR DÓNDE entraste, no QUIÉN sos. Para lo segundo está
// `esAdminPreview`, que se prende solo después de que `resolveUserAccess`
// encuentre una fila en `team_members` — la misma condición que usa
// `is_team_admin()` en la base para dejarte borrar. Que la interfaz mirara una
// cosa y la base otra es lo que dejaba a José con el cartel "Solo lectura"
// encima de datos que sí podía borrar.

// ¿Es alguien del equipo de Inforce? Da igual por qué puerta haya entrado.
export function esDeInforce({ authMode, esAdminPreview } = {}) {
  return authMode === "admin" || !!esAdminPreview;
}

// ¿Puede gestionar ESTA empresa? Inforce siempre; del lado del cliente, quien
// la posee y quien la coordina.
//
// No cubre las funciones de plataforma —crear empresas, ver todas, credenciales—:
// esas se quedan detrás del admin real.
export function puedeGestionarWorkspace({ authMode, esAdminPreview, member } = {}) {
  if (esDeInforce({ authMode, esAdminPreview })) return true;
  if (member?.is_owner) return true;
  return Array.isArray(member?.roles) && member.roles.includes("project_manager");
}

// ¿Puede crearle la credencial a otra persona? Es más angosto que gestionar el
// workspace: el PM arma el equipo, le pone roles y lo ordena, pero repartir
// logins queda en el dueño.
//
// Una credencial no es un permiso más dentro de la cuenta: es una llave que sale
// de la cuenta. Quien la reparte responde por quién entró, y eso es del dueño del
// negocio. El mismo criterio que aplica el endpoint —si acá se abriera y allá no,
// volveríamos al botón que se muestra y falla.
export function puedeRepartirCredenciales({ authMode, esAdminPreview, member } = {}) {
  if (esDeInforce({ authMode, esAdminPreview })) return true;
  return !!member?.is_owner;
}
