// Helper de auth server-side compartido por los endpoints de api/.
// El cliente manda su JWT local en el header Authorization; acá lo
// validamos con el service_role (que NUNCA llega al browser) y resolvemos si el
// caller es del equipo Inforce o miembro de una empresa concreta.
//
// Patrón tomado de api/admin-create-member.js.

import { createClient } from "./database-client.js";

let _sb = null;
// Cliente service_role (bypassa RLS). Solo server-side.
export function serviceClient() {
  if (_sb) return _sb;
  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    throw new Error("Local backend env vars not configured");
  }
  _sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);
  return _sb;
}

// Error tipado con status HTTP para responder limpio desde los handlers.
export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Valida el JWT del header Authorization y devuelve el usuario de auth.users.
// Lanza AuthError(401) si falta o es inválido.
export async function getUser(req) {
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new AuthError(401, "no auth header");
  const sb = serviceClient();
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) throw new AuthError(401, "invalid token");
  return data.user;
}

// ¿El auth.uid() es miembro activo del equipo Inforce (team_members)?
export async function isTeamMember(userId) {
  const sb = serviceClient();
  const { data } = await sb
    .from("team_members")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle();
  return !!data && data.active !== false;
}

async function teamMemberWithRole(userId) {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("team_members")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.active === false ? null : data;
}

export async function isTeamManager(userId) {
  const member = await teamMemberWithRole(userId);
  return !!member && ["admin", "member"].includes(member.role);
}

export async function isTeamAdmin(userId) {
  const member = await teamMemberWithRole(userId);
  return member?.role === "admin";
}

// Exige JWT válido de un miembro del equipo. Devuelve el user. 401/403 si no.
export async function requireTeamMember(req) {
  const user = await getUser(req);
  if (!(await isTeamMember(user.id))) throw new AuthError(403, "solo equipo Inforce");
  return user;
}

export async function requireTeamManager(req) {
  const user = await getUser(req);
  if (!(await isTeamManager(user.id))) throw new AuthError(403, "solo administradores y gestores de Inforce");
  return user;
}

export async function requireTeamAdmin(req) {
  const user = await getUser(req);
  if (!(await isTeamAdmin(user.id))) throw new AuthError(403, "solo administradores de Inforce");
  return user;
}

// Exige JWT válido cuyo dueño pueda acceder a `companyId`: o es del equipo
// (acceso global) o es miembro/owner de esa empresa (client_users /
// company_team_members / companies.owner_user_id). 403 si no.
// NOTA: hoy los clientes entran por PIN sin JWT (van como anon); este chequeo
// recién aplica de verdad tras la migración de login de clientes (Fase B).
export async function requireCompanyAccess(req, companyId) {
  const user = await getUser(req);
  const sb = serviceClient();
  const member = await sb.from("team_members").select("role,active").eq("id", user.id).maybeSingle();
  if (member.data?.active !== false && ["admin", "member"].includes(member.data?.role)) return user;
  if (!companyId) throw new AuthError(403, "forbidden");
  const email = (user.email || "").toLowerCase();
  const [owner, cu, ctm] = await Promise.all([
    sb.from("companies").select("id").eq("id", companyId).eq("owner_user_id", user.id).maybeSingle(),
    sb.from("client_users").select("user_id").eq("user_id", user.id).eq("company_id", companyId).maybeSingle(),
    sb.from("company_team_members").select("id").eq("company_id", companyId)
      .or(`auth_user_id.eq.${user.id}${email ? `,email.eq.${email}` : ""}`).maybeSingle(),
  ]);
  if (owner.data || cu.data || ctm.data) return user;
  throw new AuthError(403, "forbidden");
}

// Exige JWT válido de alguien que el negocio conoce: equipo Inforce, o dueño / usuario /
// colaborador de AL MENOS una empresa. Para endpoints que no reciben companyId (IA genérica,
// transcripción): una cuenta suelta —sin empresa ni equipo— no pasa, así un registro
// cualquiera no puede gastar el saldo de las APIs de IA.
export async function requireKnownUser(req) {
  const user = await getUser(req);
  if (await isTeamMember(user.id)) return user;
  const sb = serviceClient();
  const [owner, cu, ctm] = await Promise.all([
    sb.from("companies").select("id").eq("owner_user_id", user.id).limit(1),
    sb.from("client_users").select("user_id").eq("user_id", user.id).limit(1),
    sb.from("company_team_members").select("id").eq("auth_user_id", user.id).limit(1),
  ]);
  if (owner.data?.length || cu.data?.length || ctm.data?.length) return user;
  throw new AuthError(403, "cuenta sin empresa ni equipo");
}

// ─── Worker de la cola ───────────────────────────────────────────────────────
// El worker corre sin nadie logueado: lo dispara pg_cron a las 3 de la mañana.
// No puede presentar el JWT de nadie, así que se identifica con un secreto
// compartido. `timingSafeEqual` y no `===` para no filtrar el secreto por el
// tiempo que tarda la comparación.
import { timingSafeEqual } from "node:crypto";

export function isWorkerCall(req) {
  const secret = process.env.IMPORT_WORKER_SECRET;
  const got = req.headers["x-worker-secret"];
  if (!secret || !got) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Igual que requireTeamMember, pero también deja pasar al worker.
export async function requireTeamMemberOrWorker(req) {
  if (isWorkerCall(req)) return { id: null, worker: true };
  return requireTeamMember(req);
}

// Envuelve un handler para que las AuthError se traduzcan a la respuesta HTTP.
export function sendAuthError(res, err) {
  const status = err instanceof AuthError ? err.status : 500;
  return res.status(status).json({ error: err.message || "error" });
}
