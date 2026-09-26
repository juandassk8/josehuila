import { database } from "../lib/backend.js";

export async function listTeamMembers(companyId) {
  const { data, error } = await database
    .from("company_team_members")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTeamMember(payload) {
  const { data, error } = await database
    .from("company_team_members")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTeamMember(id, patch) {
  const { data, error } = await database
    .from("company_team_members")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// El id de acceso que esa persona YA tiene en otra empresa, buscado por correo.
//
// La misma persona atiende varias cuentas con una sola credencial: "Dar acceso"
// vincula de una todas las fichas con ese correo
// (`api/admin-create-client-user.js`). Pero una ficha creada DESPUÉS —o a la que
// recién ahora le ponés el correo— nacía sin vincular, y la única salida era
// "Rehacer contraseña", que le cambia la clave a la persona en todas partes.
//
// Devuelve null si no hay ninguna: es lo normal para alguien nuevo.
export async function authUserIdPorCorreo(email) {
  const correo = String(email || "").trim().toLowerCase();
  if (!correo) return null;
  const { data, error } = await database
    .from("company_team_members")
    .select("auth_user_id")
    .ilike("email", correo)
    .not("auth_user_id", "is", null)
    .limit(1);
  if (error) return null;   // sin permiso de leer otras empresas, se sigue sin vincular
  return data?.[0]?.auth_user_id || null;
}

export async function deleteTeamMember(id) {
  const { error } = await database
    .from("company_team_members")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
