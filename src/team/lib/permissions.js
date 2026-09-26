// Central de permisos por rol. Fuente única de verdad.
//
// Roles:
//   admin  → acceso total
//   member → acceso a operaciones, sin Contenido/Guiones
//   editor → editor de video: Contenido y Guiones (read-only en guiones,
//            field-lock en Contenido), espacios propios + compartidos.

// Campos de content_items que un editor puede modificar.
const EDITOR_EDITABLE_CONTENT_FIELDS = new Set([
  "video_editado_url",
  "link_video_final",
  "status",
  "edit_substatus",
  "edit_due_date",
]);

// Nombres permitidos por excepción para acceder a Contenido (además del rol).
const CONTENIDO_ALLOWED_NAMES = ["nat", "nath", "nathalia"];

export function isContenidoAllowedByName(member) {
  const lowerName = (member?.name || "").toLowerCase();
  return CONTENIDO_ALLOWED_NAMES.some((n) => lowerName.startsWith(n));
}

export function canEditContentField(member, field) {
  if (!member) return false;
  if (member.role === "admin") return true;
  // El editor de video sigue con su candado por campo: entra a Contenido pero solo
  // mueve lo suyo. Eso es a propósito y no cambia.
  if (member.role === "editor") return EDITOR_EDITABLE_CONTENT_FIELDS.has(field);
  return canAccessView(member, "contenido");
}

export function canDeleteContent(member) {
  return member?.role === "admin";
}

export function canCreateContent(member) {
  if (!member) return false;
  if (member.role === "admin") return true;
  if (member.role === "editor") return false;
  return canAccessView(member, "contenido");
}

export function canDragContentDate(member) {
  return member?.role !== "editor";
}

export function isGuionesReadOnly(member) {
  return member?.role === "editor";
}

// Lo que puede tener override por miembro desde la UI de Equipo.
// "warroom/agenda/tiempo/equipo/trash/settings/space" no se exponen porque
// son universales o no tienen sentido restringirlas.
//
// La lista incluye VISTAS (secciones del menú) y también PERMISOS puntuales
// como `clientAccess`, que no son una sección pero se controlan igual. El
// mecanismo es el mismo —una clave en `access_overrides`— así que la UI de
// Accesos los muestra sin cambios.
export const OVERRIDABLE_VIEWS = [
  { key: "warroom",   label: "War Room" },
  { key: "northstar", label: "North Star" },
  { key: "finance",   label: "Finanzas" },
  { key: "empresas",  label: "Empresas" },
  { key: "contenido", label: "Contenido" },
  { key: "guiones",   label: "Guionista" },
  { key: "tracking",  label: "Master Tracking" },
  { key: "tasks",     label: "Tareas" },
  { key: "banco",     label: "Banco creativos" },
  { key: "bandeja",   label: "Bandeja" },
  { key: "adlibrary", label: "Bibliotecas de anuncios" },
  { key: "crear-imagenes", label: "Crear imágenes" },
  { key: "feedback",  label: "Feedback" },
  { key: "planimpl",  label: "Plan de implementación" },
  { key: "clientAccess", label: "Crear accesos de cliente" },
];

// Lógica pura por rol — el "default" antes de overrides. Esta función es la
// que se llama desde la UI de Accesos para mostrar "Default del rol: ✓/✗".
export function canAccessViewByRole(member, view) {
  if (!member) return false;
  const role = member.role;

  // Vistas universales.
  const commonViews = ["warroom", "agenda", "rutina", "tiempo", "equipo", "trash", "settings"];
  if (commonViews.includes(view)) return true;

  if (view === "contenido") {
    return role === "admin" || role === "editor" || isContenidoAllowedByName(member);
  }
  if (view === "guiones") {
    return role === "admin" || role === "editor";
  }
  if (view === "empresas") return role === "admin" || role === "member";
  // Pantalla de onboarding: José, Nath y Deison califican el Estándar de cada marca.
  // Mismo alcance que Empresas, que es desde donde se entra.
  if (view === "onboarding") return role === "admin" || role === "member";
  if (view === "tracking") return role === "admin" || role === "member";
  if (view === "tasks")     return role === "admin" || role === "member";
  if (view === "space")     return role !== undefined;
  if (view === "feedback")  return role === "admin";
  // Crear el usuario y la contraseña con que un cliente entra al portal.
  // Default admin porque le da acceso a una empresa entera desde afuera, pero
  // se puede habilitar por persona: es trabajo operativo, no de dueño.
  if (view === "clientAccess") return role === "admin";
  if (view === "planimpl")  return role === "admin"; // plan de implementación propio de Inforce
  if (view === "northstar") return role === "admin";
  if (view === "finance")   return role === "admin";
  // Banco abierto a todo el equipo — Nat/Dayson necesitan acceso.
  if (view === "banco")     return role === "admin" || role === "member" || role === "editor";
  // Bandeja de referentes: mismo alcance que el Banco (staging previo).
  if (view === "bandeja")   return role === "admin" || role === "member" || role === "editor";
  if (view === "adlibrary") return role === "admin" || role === "member" || role === "editor";
  if (view === "crear-imagenes") return role === "admin" || role === "member" || role === "editor";

  return false;
}

// Función pública: chequea soft-delete + overrides por miembro y, si no hay
// override, cae al cálculo por rol. Es la única que callers externos deben usar.
export function canAccessView(member, view) {
  if (!member) return false;
  if (member.active === false) return false;
  const overrides = member.access_overrides || {};
  if (Object.prototype.hasOwnProperty.call(overrides, view)) {
    return overrides[view] === true;
  }
  return canAccessViewByRole(member, view);
}

// "default" | "allowed" | "denied" — para que la UI sepa si un toggle está
// seteado o sigue el default del rol.
export function getAccessState(member, view) {
  const overrides = member?.access_overrides || {};
  if (!Object.prototype.hasOwnProperty.call(overrides, view)) return "default";
  return overrides[view] === true ? "allowed" : "denied";
}

// Filtra tareas visibles para un miembro: el admin ve todas, el resto solo las
// suyas —asignadas o creadas por él—.
//
// Antes el `member` también veía todo, así que sumar a alguien al equipo le
// mostraba de una la agenda entera, incluida la de José. Ahora la misma regla la
// sostiene la base (política `tasks propias` en `db/roles_reales.sql`): esto es la
// cara visible, no la única defensa.
export function visibleTasksFor(tasks, member) {
  if (!member) return [];
  if (member.role === "admin") return tasks || [];
  return (tasks || []).filter((t) =>
    (t.assigneeIds || []).includes(member.id) || t.created_by === member.id
  );
}

// Banco y bandeja: hay DOS permisos distintos y confundirlos fue un bug real.
//
//   OPERAR      → traer referentes, analizarlos, aprobarlos, cargarlos al banco.
//                 Es el trabajo diario de la bandeja. Lo hace quien tiene la vista.
//   GESTIONAR   → borrar refs, mover entre empresas, editar o esconder conceptos,
//                 reorganizar las etiquetas del banco. Solo admin.
//
// El comentario que estaba acá ya decía que member y editor «pueden ver e importar
// a sus empresas», pero `canManageBank` —que es admin— era el único candado y la
// Bandeja lo usaba para TODO: importar, analizar, subir video, aprobar, cargar.
// Resultado: a Deison la Bandeja le aparecía en el menú y era una galería que no
// podía tocar. Tener la vista y no poder hacer nada adentro no es un permiso más
// estricto, es una sección rota.
//
// El límite de verdad no es este archivo: los endpoints y las políticas de la base
// ya exigen ser del equipo. Esto es la cara visible de esa regla, y por eso abrir
// lo que sigue no abre nada que no estuviera abierto.

/** El trabajo diario de la bandeja: traer, analizar, aprobar, cargar. */
export function canOperateInbox(member) {
  return canAccessView(member, "bandeja");
}

/** Trabajar el banco: seleccionar, analizar en lote, sumar variaciones. */
export function canOperateBank(member) {
  return canAccessView(member, "banco");
}

// Lo destructivo se queda en admin. Riesgo real: alguien borrando refs por error
// tumba material de campañas de otras empresas.
export function canDeleteBankConcept(member) {
  return member?.role === "admin";
}

export function canManageBank(member) {
  return member?.role === "admin";
}

// ¿Puede crear o resetear el acceso (email + contraseña) con que un cliente
// entra al portal?
//
// Vivía como un `role === "admin"` escrito a mano dentro de EmpresasPage, así
// que no había forma de dárselo a alguien sin volverlo admin de todo. El
// endpoint que hace el trabajo solo exige ser del equipo, o sea que el límite
// era únicamente visual.
export function canManageClientAccess(member) {
  return canAccessView(member, "clientAccess");
}
