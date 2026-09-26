import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// Helpers de signup/login/reset para el flujo SaaS público.
// Se basa en database.auth (email + password). Cada nuevo signup crea
// una empresa nueva con el user como owner.

function slugifyName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Genera un slug único agregando sufijo numérico si choca.
// El slug es la URL del portal del cliente: dos empresas con el mismo slug
// hacen que `/cliente/<slug>` sea ambiguo y el cliente entre a cualquiera de
// las dos. Le pasó a Lipenza: se creó una segunda con el mismo nombre, el
// cliente quedó en la nueva y el equipo armó el embudo en la vieja.
//
// El signup siempre pasó por acá. La creación desde el panel no, y por eso
// también la usa ahora.
export async function uniqueCompanySlug(baseName) {
  const base = slugifyName(baseName) || "empresa";
  let slug = base;
  let i = 1;
  while (true) {
    const { data } = await database
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    i += 1;
    slug = `${base}-${i}`;
    if (i > 200) return `${base}-${Date.now()}`;
  }
}

// Genera un id único para la fila companies. Históricamente el id ha sido
// un timestamp string. Mantenemos esa convención.
function newCompanyId() {
  return `${Date.now()}`;
}

// Registro CERRADO (auditoría 2026-09-19): las cuentas las crea el equipo desde el panel
// interno (api/admin-create-member, api/admin-create-client-user). Se conserva la firma
// para no romper imports viejos, pero nunca llama a database.auth.signUp.
export async function signUpWithEmail() {
  return { user: null, session: null, error: new Error("El registro está cerrado. Pídele tu acceso al equipo Inforce.") };
}

export async function signInWithEmail({ email, password }) {
  const { data, error } = await database.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error };
  return { user: data.user, session: data.session, error: null };
}

export async function signOut() {
  return database.auth.signOut();
}

export async function requestPasswordReset(email) {
  const { error } = await database.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login?reset=1`,
  });
  if (error) return { error };
  // Notificamos a admin (Jose) en background — fail-silent.
  try {
    await fetch("/api/notify-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch { /* no bloqueamos el flujo si falla la notificación */ }
  return { error: null };
}

export async function getCurrentSession() {
  const { data } = await database.auth.getSession();
  return data?.session || null;
}

export async function getCurrentUser() {
  const { data } = await database.auth.getUser();
  return data?.user || null;
}

// Resuelve la empresa del user logueado. Si tiene owner_user_id matcheante,
// retorna esa company. Sino retorna null (caso: user nuevo sin onboarding).
export async function findOwnedCompany(userId) {
  if (!userId) return null;
  const { data } = await database
    .from("companies")
    .select("id, name, slug")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0] || null;
}

// Crea la empresa nueva + el team_member owner + voice_profile + objectives.
// Llamado al final del wizard. Usa el user actual como owner.
// objectives = { roasMin, roasTarget, costPerPurchaseMax, ... } —
// el mismo shape que admin usa al crear un cliente. Se guarda en
// companies.objectives (jsonb) que el resto de la app ya consume.
export async function createOwnedCompany({ user, companyName, niche, objectives }) {
  if (!user?.id) throw new Error("user.id es requerido");
  if (!companyName?.trim()) throw new Error("companyName es requerido");

  const slug = await uniqueCompanySlug(companyName);
  const id = newCompanyId();
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const objectivesPayload = (objectives && Object.keys(objectives).length > 0)
    ? objectives : null;

  // 1. Insertar company
  const { data: company, error: cErr } = await database
    .from("companies")
    .insert({
      id,
      name: companyName.trim(),
      slug,
      owner_user_id: user.id,
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      created_via: "self_signup",
      objectives: objectivesPayload,
    })
    .select()
    .single();
  if (cErr) throw cErr;

  // 2. Insertar team_member owner
  // Importante: roles: ["owner"] no puede perderse en el fallback. Sin él,
  // checks como canCreateConceptCanvas/canUseGuionista/canManagePipeline
  // miran solo member.roles y el owner externo queda bloqueado para crear
  // conceptos o gestionar pipeline — incluso teniendo is_owner=true.
  const memberPayload = {
    company_id: company.id,
    name: user.email?.split("@")[0] || "Owner",
    email: user.email || null,
    is_owner: true,
    auth_user_id: user.id,
    roles: ["owner"],
  };
  const { data: member, error: mErr } = await database
    .from("company_team_members")
    .insert(memberPayload)
    .select()
    .single();
  if (mErr) {
    // No es bloqueante — algunos campos pueden no existir según el estado del
    // schema. Reintentamos con upsert idempotente manteniendo SIEMPRE roles.
    // onConflict en (company_id, auth_user_id) — requiere unique index. Si el
    // index aún no existe la query igual intenta el insert.
    const { error: m2Err } = await database
      .from("company_team_members")
      .upsert(
        {
          company_id: company.id,
          name: memberPayload.name,
          email: memberPayload.email,
          is_owner: true,
          auth_user_id: user.id,
          roles: ["owner"],
        },
        { onConflict: "company_id,auth_user_id" }
      );
    if (m2Err) logger.error("[createOwnedCompany] member insert failed:", m2Err);
  }

  // 3. Voice profile con nicho (best-effort, no bloquea)
  if (niche?.trim()) {
    try {
      await database.from("company_voice_profile").insert({
        company_id: company.id,
        niche: niche.trim(),
      });
    } catch (e) {
      logger.error("[createOwnedCompany] voice profile insert failed:", e);
    }
  }

  return { company, member };
}
