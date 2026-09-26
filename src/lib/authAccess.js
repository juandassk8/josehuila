// ── AUTH / ACCESS RESOLVERS ──────────────────────────────────────────────────
// Extraído de App.jsx (refactor God-component). Estas funciones resuelven el
// acceso de una sesión Supabase a las empresas. Dependen del cliente database.
import { database } from "./backend.js";
import { logger } from "./logger.js";

// ── resolveUserAccess ────────────────────────────────────────────────────
// Determina qué tipo de acceso tiene una sesión Supabase: admin (Inforce
// interno), client (cliente con N empresas accesibles), o none.
//
// Acceso de cliente se resuelve desde TRES tablas (cualquiera cuenta):
//   1. companies.owner_user_id = user.id         (saas_signup)
//   2. client_users.user_id = user.id            (client_auth_schema)
//   3. company_team_members.email = user.email   (legacy/admin-added members)
//
// Devuelve { role: "admin"|"client"|"none", companies: [{ id, name, slug }] }.
export async function resolveUserAccess(session) {
  if (!session?.user) return { role: "none", companies: [] };
  const userId = session.user.id;
  const email = String(session.user.email || "").trim().toLowerCase();

  // ¿Admin? Estar en `team_members` NO alcanza: hay que ser admin y estar activo.
  //
  // Antes bastaba con existir en la tabla, así que un `editor` del equipo —Johan—
  // era tratado como administrador de TODOS los clientes. Mientras nadie del
  // equipo tenía su contraseña no se notaba; al repartir credenciales deja de ser
  // teórico. La misma corrección está en `is_team_admin()` del lado de la base:
  // las dos tienen que decir lo mismo o la interfaz y los datos se contradicen.
  //
  // Quien es del equipo pero no admin entra a las empresas por donde entra
  // cualquier colaborador: su fila en `company_team_members`, que se resuelve más
  // abajo. Por eso alguien del equipo que atiende una cuenta necesita su ficha
  // en esa empresa.
  let tm = null;
  {
    const { data } = await database
      .from("team_members")
      .select("id, role, active")
      .eq("id", userId)
      .maybeSingle();
    tm = data;
    if (!tm && email) {
      const { data: byEmail } = await database
        .from("team_members")
        .select("id, role, active")
        .eq("email", email)
        .maybeSingle();
      tm = byEmail;
    }
  }
  // Operan la cartera de clientes el admin y el `member`: entran a cualquier
  // empresa, al banco y a la bandeja, que es el trabajo. El `editor` no —edita
  // los videos de una cuenta puntual y entra por su ficha de colaborador—, y
  // quien está desactivado tampoco.
  //
  // Ver la agenda de otro es harina de otro costal: eso pide admin de verdad y
  // lo resuelve `es_admin_real()` en la base.
  const OPERAN = ["admin", "member"];
  if (tm && OPERAN.includes(tm.role) && tm.active !== false) return { role: "admin", companies: [] };

  // Acceso cliente: reunir company_ids desde las 3 fuentes.
  const companyIds = new Set();

  const { data: owned } = await database
    .from("companies")
    .select("id")
    .eq("owner_user_id", userId);
  (owned || []).forEach((c) => companyIds.add(c.id));

  // Dueño por email verificado (login con Google → uid nuevo pero mismo email).
  if (email) {
    const { data: ownedByEmail } = await database
      .from("companies")
      .select("id")
      .eq("email", email);
    (ownedByEmail || []).forEach((c) => companyIds.add(c.id));
  }

  const { data: clientUsers } = await database
    .from("client_users")
    .select("company_id")
    .eq("user_id", userId);
  (clientUsers || []).forEach((c) => companyIds.add(c.company_id));

  if (email) {
    const { data: memberships } = await database
      .from("company_team_members")
      .select("company_id")
      .eq("email", email);
    (memberships || []).forEach((m) => companyIds.add(m.company_id));
  }

  if (companyIds.size === 0) return { role: "none", companies: [] };

  // Resolver detalles de cada empresa (nombre/slug/archived).
  const { data: companies } = await database
    .from("companies")
    .select("id, name, slug, archived")
    .in("id", Array.from(companyIds));

  const active = (companies || []).filter((c) => !c.archived);
  // Tener empresas pero todas archivadas NO es lo mismo que no tener ninguna, y
  // hasta ahora las dos terminaban en la misma pantalla de "No encontramos tu
  // empresa". Medido el 2026-08-18: siete cuentas reales de cliente están así
  // —Wake Up, Natucer, Healthy Breed, Biohackers, Alexis Rivas y dos más—, y a
  // todas el portal les ofrecía un botón "Llevame a mi portal" que las devolvía
  // exactamente a la misma pantalla.
  return {
    role: "client",
    companies: active,
    soloArchivadas: active.length === 0 && (companies || []).length > 0,
  };
}

// Slugificador consistente (usado para redirects a /cliente/<slug>).
export function slugifyCompany(c) {
  // Si la empresa YA tiene slug, ese es su slug. Punto.
  //
  // Antes se lo volvía a slugificar y eso lo cambiaba: "brahian---drop" salía
  // "brahian-drop" y "artillería-fox" salía "artilleria-fox". El portal
  // redirigía a una URL que no existía en la base, la empresa no se encontraba
  // y el cliente quedaba para siempre en "Preparando tu tablero…". Le pasó a
  // Brahian; Alexis y Artillería Fox tenían el mismo problema esperando.
  //
  // El slug es un identificador, no un texto para normalizar.
  const guardado = String(c?.slug || "").trim();
  if (guardado) return guardado.toLowerCase();

  // Sin slug guardado sí hay que derivarlo del nombre.
  return String(c?.name || "").trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Empresas accesibles para poblar el switcher de tenant. Cruza las MISMAS
// fuentes que resolveUserAccess para que ambos resolvers sean consistentes:
//   - companies.email            (dueño por email)
//   - company_team_members.email (colaborador por email)
//   - companies.owner_user_id    (dueño por uid)          → requiere session
//   - client_users.user_id       (cliente vinculado)      → requiere session
// Antes solo miraba las 2 fuentes de email, así que un dueño vinculado por
// owner_user_id o un client_user no veía todas sus empresas en el switcher.
// `session` es opcional (retrocompat): sin él, solo aplican las fuentes email.
// Devuelve [{ id, name, slug }] sin archivadas.
export async function loadAccessibleCompaniesByEmail(email, session = null) {
  const norm = String(email || "").trim().toLowerCase();
  const userId = session?.user?.id || null;
  if (!norm && !userId) return [];
  const ids = new Set();

  if (norm) {
    const { data: ownedRows } = await database
      .from("companies")
      .select("id")
      .ilike("email", norm);
    (ownedRows || []).forEach((c) => ids.add(c.id));

    const { data: memberRows } = await database
      .from("company_team_members")
      .select("company_id")
      .eq("email", norm);
    (memberRows || []).forEach((m) => ids.add(m.company_id));
  }

  // Fuentes por uid (paridad con resolveUserAccess) — solo si hay session.
  if (userId) {
    const { data: ownedByUid } = await database
      .from("companies")
      .select("id")
      .eq("owner_user_id", userId);
    (ownedByUid || []).forEach((c) => ids.add(c.id));

    const { data: clientUsers } = await database
      .from("client_users")
      .select("company_id")
      .eq("user_id", userId);
    (clientUsers || []).forEach((c) => ids.add(c.company_id));
  }

  if (ids.size === 0) return [];

  const { data: companies } = await database
    .from("companies")
    .select("id, name, slug, archived")
    .in("id", Array.from(ids));
  return (companies || []).filter((c) => !c.archived);
}

// ── resolveClientMember ──────────────────────────────────────────────────
// Puebla `currentMember` cuando un cliente entra al workspace. SIN esto, un
// dueño auto-registrado entraba con currentMember=null → canManageWorkspace
// y isFullAccess daban false → no podía agregar productos, crear conceptos,
// usar el guionista, ni ver el simulador de escala / banco / cadencia. (El
// flujo viejo sólo seteaba member para colaboradores con memberId; al dueño
// se lo dejaba en null a propósito, lo que rompía todos sus permisos.)
//
//   company     : { id, email?, name? }
//   sessionUser : user de Supabase (puede faltar en login por PIN)
//   assumeOwner : true cuando YA sabemos que es el dueño (login por email/PIN
//                 de la empresa, o restore sin memberId). En ese caso, si no
//                 hay fila, la sintetizamos como owner. Si es false, sólo
//                 otorgamos owner cuando la fila (o companies.owner_user_id)
//                 lo confirma — un colaborador conserva sus roles reales.
export async function resolveClientMember(company, sessionUser = null, { assumeOwner = false } = {}) {
  const companyId = company?.id;
  if (!companyId) return assumeOwner ? { is_owner: true, roles: ["owner"] } : null;

  const email = String(sessionUser?.email || "").trim().toLowerCase();
  const companyEmail = String(company?.email || "").trim().toLowerCase();

  let list = [];
  try {
    const { data } = await database
      .from("company_team_members")
      .select("*")
      .eq("company_id", companyId);
    list = data || [];
  } catch (e) {
    logger.warn("[resolveClientMember] no se pudo leer team members:", e?.message);
  }

  // 1. Fila de ESTE usuario (auth_user_id del signup, o por email).
  let me = sessionUser?.id ? list.find((m) => m.auth_user_id === sessionUser.id) : null;
  if (!me && email) {
    me = list.find((m) => m.email && String(m.email).trim().toLowerCase() === email);
  }
  // 2. Si asumimos owner y no matcheó por usuario (login por PIN no trae
  //    sessionUser), tomar la fila is_owner / la que matchea el email de empresa.
  if (!me && assumeOwner) {
    me = list.find((m) => m.is_owner)
      || (companyEmail && list.find((m) => m.email && String(m.email).trim().toLowerCase() === companyEmail))
      || null;
  }

  if (me) {
    // Fila del dueño: garantizamos is_owner + roles para que isFullAccess()
    // pase aunque la fila esté incompleta (roles vacíos por un insert viejo).
    if (me.is_owner || assumeOwner) {
      return {
        ...me,
        is_owner: true,
        roles: (Array.isArray(me.roles) && me.roles.length) ? me.roles : ["owner"],
      };
    }
    return me; // colaborador: usar sus roles reales, sin sobre-otorgar.
  }

  // 3. Sin fila pero sabemos que es el dueño → owner sintético (cubre el caso
  //    donde el insert del team_member del signup falló: el portal igual anda).
  if (assumeOwner) {
    return {
      is_owner: true,
      roles: ["owner"],
      company_id: companyId,
      name: company?.name || (email ? email.split("@")[0] : "Owner"),
      email: companyEmail || email || null,
    };
  }

  // 4. ¿Es dueño por companies.owner_user_id aunque no tenga fila de member?
  if (sessionUser?.id) {
    try {
      const { data: co } = await database
        .from("companies")
        .select("owner_user_id, name, email")
        .eq("id", companyId)
        .maybeSingle();
      if (co?.owner_user_id && co.owner_user_id === sessionUser.id) {
        return {
          is_owner: true,
          roles: ["owner"],
          company_id: companyId,
          name: co.name || (email ? email.split("@")[0] : "Owner"),
          email: co.email || email || null,
        };
      }
    } catch { /* noop */ }
  }

  return null; // ni member conocido ni dueño confirmado.
}
