// Mapa de qué secciones del workspace puede ver cada rol.
// El dueño (is_owner) y project_manager ven todo, igual que el admin.
// Los demás roles tienen vistas acotadas a lo que realmente usan en su día.

// Sin "ajustes": estaba en la lista y en el `guarded` de App.jsx, pero ninguna
// vista la renderiza. Una clave que no lleva a ningún lado hace creer que hay un
// permiso que dar o quitar cuando no hay nada del otro lado.
export const NAV_KEYS = ["home", "reportes", "plan", "pipeline", "despliegue", "adlibrary", "crear-imagenes", "control", "tareas", "equipo", "papelera"];

const ROLE_ACCESS = {
  // Dueño: todo.
  owner:           NAV_KEYS,
  // PM: todo (necesita coordinar).
  project_manager: NAV_KEYS,
  // Copywriter: ideas + guiones + tareas + equipo (+ plan para tener la estrategia).
  copywriter:      ["home", "plan", "pipeline", "tareas", "equipo"],
  // Content (UGCs): pipeline para ver qué grabar + tareas + equipo (+ plan).
  content:         ["home", "plan", "pipeline", "tareas", "equipo"],
  // Editor: pipeline (videos a editar) + control para ver su asignación + tareas + equipo.
  editor:          ["home", "pipeline", "control", "tareas", "equipo"],
  // Diseñador: pipeline (estáticos) + control para ver su asignación + tareas + equipo.
  designer:        ["home", "pipeline", "control", "tareas", "equipo"],
  // Trafficker: reportes de performance + despliegue + control (estado anuncio) + tareas.
  // Y pipeline: sus tareas automáticas son "Publicar y optimizar" y "Recoger
  // feedback", que son etapas del pipeline — sin acceso, la tarea le llega y no
  // tiene dónde abrirla.
  trafficker:      ["home", "reportes", "plan", "pipeline", "despliegue", "control", "tareas", "equipo"],
};

// Recibe un miembro (con roles: string[] + is_owner). Devuelve los NAV_KEYS
// permitidos (unión de lo que cada rol puede ver).
export function allowedNavForMember(member) {
  if (!member) return NAV_KEYS;
  if (member.is_owner) return NAV_KEYS;
  // Team members (Inforce Central) tienen `role` singular ('admin'|'member'|'editor').
  // Son equipo INTERNO — acceso total al workspace admin de cualquier cliente.
  // `company_team_members` usa `roles` (array) + is_owner; los clientes externos
  // son los que caen en la lógica de ROLE_ACCESS.
  if (typeof member.role === "string" && !Array.isArray(member.roles)) {
    return NAV_KEYS;
  }
  const roles = member.roles || [];
  // `home` y `pipeline` siempre visibles. El pipeline es donde vive el contenido
  // de la cuenta: los siete roles ya lo tenían, así que el único a quien se lo
  // negaba era la ficha SIN roles —típicamente la del propio cliente—, que
  // entraba y se encontraba un "Coming Soon" de una función que sí existe.
  const allowed = new Set(["home", "pipeline", "adlibrary", "crear-imagenes"]);
  for (const r of roles) {
    const list = ROLE_ACCESS[r] || [];
    list.forEach((k) => allowed.add(k));
  }
  // Sin ningún rol, al menos Resumen + Tareas + Equipo (y el pipeline de arriba).
  if (roles.length === 0) {
    ["tareas", "equipo"].forEach((k) => allowed.add(k));
  }
  return NAV_KEYS.filter((k) => allowed.has(k));
}

export function memberCanAccess(member, sectionKey) {
  return allowedNavForMember(member).includes(sectionKey);
}
