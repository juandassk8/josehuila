// Matriz central de permisos por rol — workspace cliente.
//
// Cada colaborador del cliente entra con su perfil (currentMember) que
// trae `roles: string[]`, `is_owner: bool`. Si Jose entra como admin global
// (PIN admin), `member.is_admin_global = true` y bypasea todo.
//
// La matriz de roles SE DEBE MANTENER alineada con la documentación del plan:
//   - copywriter: edita guiones/ideas/conceptos en SlotModal + UGC + ángulo.
//   - content    (UGC): solo carpeta crudo + cambiar review_status.
//   - editor     : carpeta crudo + carpeta editado + review_status.
//   - designer   : carpeta editado (estáticos) + review_status.
//   - trafficker : calificación 4-cuadrantes (in_campaign).
//   - PM         : todo menos calificar.
//   - owner      : todo.

const FIELD_BY_ROLE = {
  copywriter: [
    "title",
    "concept_id", "concept_name",
    "product_id",
    "ugc_id", "angle", "touchpoints",
    "reference_url", "loom_review_url",
    "script_body",
    "editor_id",
    "review_status",
  ],
  content:    ["raw_content_url", "review_status"],
  editor:     ["raw_content_url", "edited_content_url", "review_status"],
  designer:   ["edited_content_url", "review_status"],
  trafficker: ["performance_quadrant"],
};

// Roles que pueden mover slots por el kanban según [from, to].
// Estáticos solo pasan por idea → to_design → in_campaign → feedback.
// Videos pasan por idea → scripting → to_film → to_edit → in_campaign → feedback.
const TRANSITIONS = {
  copywriter: [["idea", "scripting"], ["scripting", "to_film"]],
  content:    [["to_film", "to_edit"]],
  editor:     [["to_film", "to_edit"], ["to_edit", "in_campaign"]],
  designer:   [["idea", "to_design"], ["to_design", "in_campaign"]],
  trafficker: [["in_campaign", "feedback"]],
};

function isFullAccess(member) {
  if (!member) return false;
  if (member.is_admin_global) return true;
  if (member.is_owner) return true;
  return false;
}

function rolesOf(member) {
  if (!member) return [];
  return Array.isArray(member.roles) ? member.roles : [];
}

// Reviewer del Inforce team (Natt) — flag explícita en team_members.
// Cuando entra al workspace cliente vía task auto-generada de revisión,
// permitirle aprobar / pedir cambios sobre review_status.
function isReviewer(member) {
  return !!member?.is_reviewer;
}

// Campos que un reviewer puede tocar para aprobar/pedir cambios.
const REVIEWER_FIELDS = new Set([
  "review_status",
  "review_notes",
  "review_feedback",
  "loom_review_url",
]);

// ¿El miembro puede editar este field del SlotModal?
// Si el slot está en in_campaign/feedback, los UGCs/editor/etc. ya no editan
// nada salvo lo que aplica (review_status no aplica en in_campaign anyway).
export function canEditSlotField(member, slot, field) {
  if (isFullAccess(member)) return true;
  if (isReviewer(member) && REVIEWER_FIELDS.has(field)) return true;
  const roles = rolesOf(member);
  if (roles.includes("project_manager")) {
    // PM todo menos calificación 4-cuadrantes (eso es del trafficker).
    return field !== "performance_quadrant";
  }
  for (const r of roles) {
    if (FIELD_BY_ROLE[r]?.includes(field)) return true;
  }
  return false;
}

// ¿Puede mover el slot de `from` → `to` en el kanban?
// `format` se usa para esconder transiciones inválidas (estáticos no van a
// scripting/to_film/to_edit; videos no van a to_design).
export function canMoveSlot(member, from, to, format) {
  if (isFullAccess(member)) return true;
  if (rolesOf(member).includes("project_manager")) return true;
  // Coherencia de formato — bloqueo duro independientemente de rol.
  if (format === "static" && ["scripting", "to_film", "to_edit"].includes(to)) return false;
  if (format === "video" && to === "to_design") return false;
  return rolesOf(member).some((r) =>
    (TRANSITIONS[r] || []).some(([a, b]) => a === from && b === to)
  );
}

// ¿Puede crear un concepto nuevo en el canvas Despliegue Creativo?
// Permiten: copywriter, trafficker, PM, owner, admin.
export function canCreateConceptCanvas(member) {
  if (isFullAccess(member)) return true;
  const roles = rolesOf(member);
  if (roles.includes("project_manager")) return true;
  return roles.includes("copywriter") || roles.includes("trafficker");
}

// ¿Puede agregar variations / referencias a un concepto?
// Mismo set que crear concepto.
export function canEditConceptVariations(member) {
  return canCreateConceptCanvas(member);
}

// ¿Puede usar el Guionista (escribir/aprobar guiones, gestionar conceptos
// en el ConceptosLibrary)? Solo copywriter, PM, owner, admin.
// El resto entra en readOnly y solo ve Ideas + Generar.
export function canUseGuionista(member) {
  if (isFullAccess(member)) return true;
  const roles = rolesOf(member);
  if (roles.includes("project_manager")) return true;
  return roles.includes("copywriter");
}

// ¿Puede calificar un creativo en in_campaign con los 4 cuadrantes?
// Solo trafficker, PM, owner, admin.
export function canRateInCampaign(member) {
  if (isFullAccess(member)) return true;
  const roles = rolesOf(member);
  if (roles.includes("project_manager")) return true;
  return roles.includes("trafficker");
}

// ¿Puede gestionar el pipeline en general — crear slots, planear semana,
// exportar guiones a PDF? Owner / PM / copywriter / admin.
// Estos son los que conducen la producción de contenido.
export function canManagePipeline(member) {
  if (isFullAccess(member)) return true;
  const roles = rolesOf(member);
  if (roles.includes("project_manager")) return true;
  return roles.includes("copywriter");
}

// ¿Puede crear / editar / eliminar reportes de performance?
// Solo owner + trafficker (+ admin global). El trafficker es quien analiza
// la data de Meta/Shopify, así que tiene sentido que arme los reportes.
// Otros roles solo lectura.
export function canManageReports(member) {
  if (isFullAccess(member)) return true;
  return rolesOf(member).includes("trafficker");
}

// ¿Puede hacer operaciones destructivas / batch (review batch con Loom,
// seleccionar múltiples, eliminar masivo)? Solo owner / PM / admin.
// Más restrictivo que canManagePipeline porque son acciones de gestión
// que afectan trabajo de otros.
export function canBulkEdit(member) {
  if (isFullAccess(member)) return true;
  return rolesOf(member).includes("project_manager");
}

// ── Content Pipeline: qué campos del contenido puede tocar cada rol ──
//
// La matriz de arriba usa los nombres del módulo viejo (`angle`, `concept_id`).
// El Content Pipeline tiene los suyos, y hasta ahora no consultaba a nadie:
// cualquiera con acceso podía cambiarle el ángulo o el concepto a un contenido.
//
// La línea es entre DEFINIR el creativo y EJECUTARLO. Qué producto, qué ángulo,
// qué concepto y quién lo graba es la estrategia, y la arma quien conduce. Un
// editor ejecuta: marca listo, sube el archivo, deja una nota. Que pueda
// cambiar el ángulo no lo ayuda y sí puede desarmar una tanda.
const CAMPOS_DE_DEFINICION = new Set([
  "producto", "product_id", "angulo", "concepto", "creador", "formato", "script",
]);

export function puedeEditarCampoDelPipeline(member, campo) {
  if (!CAMPOS_DE_DEFINICION.has(campo)) return true;
  if (isFullAccess(member)) return true;
  const roles = rolesOf(member);
  return roles.includes("project_manager") || roles.includes("copywriter");
}
