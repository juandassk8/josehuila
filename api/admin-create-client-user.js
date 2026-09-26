// Crear el acceso real (Supabase Auth) de un CLIENTE (owner de una empresa).
//
// Parte de la migración del login de clientes: hoy entran con PIN comparado en
// JS (sin sesión). Este endpoint —usado por un admin del equipo desde la UI de
// Empresas— le crea al cliente un usuario de Supabase Auth (email+password) y
// lo linkea a su empresa (companies.owner_user_id + company_team_members owner).
// A partir de ahí el cliente entra con email+contraseña y sus requests llevan
// JWT (habilita la RLS por-empresa de la Fase C).
//
// Gate: solo un team_member (equipo Inforce) puede llamarlo. El service_role
// NUNCA llega al browser.

import { randomBytes } from "node:crypto";
import { serviceClient, requireTeamAdmin, sendAuthError, getUser, isTeamAdmin } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 60,
};

function genPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(14);
  let out = "";
  for (let i = 0; i < buf.length; i++) out += chars[buf[i] % chars.length];
  return out;
}

// ¿Este usuario es el DUEÑO de esta empresa? Dos caminos, porque una empresa se
// puede haber creado por signup (queda `owner_user_id`) o a mano desde el panel
// (queda la ficha con `is_owner`). Y la ficha puede estar vinculada por
// `auth_user_id` o solo por correo, que es como entra alguien la primera vez.
async function esDuenoDe(sb, user, companyId) {
  const email = String(user.email || "").trim().toLowerCase();
  const [empresa, ficha] = await Promise.all([
    sb.from("companies").select("id").eq("id", companyId).eq("owner_user_id", user.id).maybeSingle(),
    sb.from("company_team_members").select("id").eq("company_id", companyId).eq("is_owner", true)
      .or(`auth_user_id.eq.${user.id}${email ? `,email.eq.${email}` : ""}`).maybeSingle(),
  ]);
  return !!(empresa.data || ficha.data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Dar acceso a UNA persona dejó de ser exclusivo del equipo: el dueño de una
  // empresa mete a su propia gente. Esa rama se autoriza sola más abajo, cuando
  // ya sabe de qué empresa es la ficha. Todo lo demás —crear el usuario de un
  // cliente, la migración en lote— sigue siendo solo nuestro.
  const accion = req.body?.action;
  const esAltaDePersona = accion === "grant-member" || accion === "reset-member";
  if (!esAltaDePersona) {
    try {
      await requireTeamAdmin(req);
    } catch (err) {
      return sendAuthError(res, err);
    }
  }

  // Dar (o rehacer) el acceso de UNA persona, desde su propia ficha de Equipo.
  //
  // Hasta ahora la única vía era el batch de más abajo, que migra a TODOS los
  // colaboradores de TODAS las empresas de un saque y muestra las claves una sola
  // vez. Para sumar a una persona eso es desproporcionado: José está parado en la
  // ficha de Johan y lo que quiere es darle acceso a Johan.
  //
  // Devuelve la contraseña UNA vez. No se guarda en ningún lado —no hay dónde
  // leerla después— así que si se pierde, se usa `reset-member`.
  if (req.body?.action === "grant-member" || req.body?.action === "reset-member") {
    const esReset = req.body.action === "reset-member";
    const memberId = String(req.body?.memberId || "").trim();
    if (!memberId) return res.status(400).json({ error: "Falta memberId" });

    const sb = serviceClient();
    const { data: member, error: mErr } = await sb
      .from("company_team_members")
      .select("id, name, email, auth_user_id, company_id")
      .eq("id", memberId)
      .maybeSingle();
    if (mErr) return res.status(500).json({ error: mErr.message });
    if (!member) return res.status(404).json({ error: "No existe esa persona" });

    const email = String(member.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Esta persona no tiene correo. Agregáselo primero." });
    }

    // ── Quién está pidiendo esto ────────────────────────────────────────────
    //
    // Se resuelve DESPUÉS de leer la ficha porque la ficha es la que dice a qué
    // empresa pertenece, y de eso depende el permiso.
    let quien;
    try {
      quien = await getUser(req);
    } catch (err) {
      return sendAuthError(res, err);
    }
    const esAdministrador = await isTeamAdmin(quien.id);
    if (!esAdministrador && !(await esDuenoDe(sb, quien, member.company_id))) {
      return res.status(403).json({ error: "Solo el dueño de la empresa puede dar acceso." });
    }

    // Una contraseña pertenece a una identidad global, que puede tener acceso a
    // más de una empresa. Un dueño puede crear el primer acceso de una ficha suya,
    // pero solo un administrador de Inforce puede restablecer una cuenta existente.
    if (esReset && !esAdministrador) {
      return res.status(403).json({ error: "Solicita a un administrador de Inforce que restablezca esta contraseña." });
    }

    // Una cuenta de Inforce no se toca desde el portal de un cliente. Sin esto,
    // al dueño le alcanzaba con escribir el correo de alguien del equipo en una
    // ficha suya y apretar el botón para cambiarle la contraseña. Y aplica igual
    // al "Rehacer contraseña": la ficha de Nath en Peluna Pets lleva SU cuenta.
    if (!esAdministrador) {
      const [{ data: internoPorCorreo }, { data: internoPorId }] = await Promise.all([
        sb.from("team_members").select("id").ilike("email", email).maybeSingle(),
        member.auth_user_id
          ? sb.from("team_members").select("id").eq("id", member.auth_user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (internoPorCorreo || internoPorId) {
        return res.status(403).json({ error: "Ese correo es de una cuenta de Inforce. No se administra desde acá." });
      }
      if (member.auth_user_id) {
        return res.status(409).json({ error: "Esta persona ya tiene una cuenta. Solicita el restablecimiento a un administrador de Inforce." });
      }
    }

    const password = genPassword();

    // El usuario puede existir ya por otro lado: la misma persona en otra empresa,
    // o alguien del equipo interno. En ese caso no se crea otro —el correo es
    // único en Auth— se le cambia la clave y se linkea.
    let userId = member.auth_user_id || null;
    if (!userId) {
      const { data: creado, error: cErr } = await sb.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (cErr) {
        // Que falle la creación significa que el correo YA tiene cuenta.
        //
        // Del lado nuestro eso es lo esperable —la misma persona atiende varias
        // empresas— y se le cambia la clave para reunificar. Del lado del
        // cliente es lo contrario: sería apropiarse de la cuenta de cualquiera
        // con solo saber su correo, así que se corta acá.
        if (!esAdministrador) {
          return res.status(409).json({
            error: "Ese correo ya tiene una cuenta en la plataforma. Usá otro, o pedinos que la vinculemos.",
          });
        }
        // Ya existía: buscarlo por correo y actualizarlo.
        const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        const ya = (lista?.users || []).find((u) => String(u.email || "").toLowerCase() === email);
        if (!ya) return res.status(500).json({ error: cErr.message });
        userId = ya.id;
        const { error: uErr } = await sb.auth.admin.updateUserById(userId, { password });
        if (uErr) return res.status(500).json({ error: uErr.message });
      } else {
        userId = creado.user.id;
      }
    } else {
      if (!esReset) {
        return res.status(409).json({ error: "Esta persona ya tiene acceso. Usá 'Rehacer contraseña'." });
      }
      const { error: uErr } = await sb.auth.admin.updateUserById(userId, { password });
      if (uErr) return res.status(500).json({ error: uErr.message });
    }

    // Se linkean TODAS sus fichas con ese correo: la misma persona puede atender
    // varias empresas y entra una sola vez. Eso es lo que hace que Deison entre a
    // tres cuentas con una sola clave.
    //
    // Pero es una escritura que sale de la empresa, así que del lado del cliente
    // se acota a la suya: un dueño no le cambia el vínculo a una ficha de otra
    // empresa aunque el correo coincida.
    let linkQuery = sb.from("company_team_members").update({ auth_user_id: userId }).ilike("email", email);
    if (!esAdministrador) linkQuery = linkQuery.eq("company_id", member.company_id);
    const { error: lErr } = await linkQuery;
    if (lErr) return res.status(500).json({ error: lErr.message });

    return res.status(200).json({ ok: true, email, password, name: member.name });
  }

  // Acción especial: migrar en lote a todos los COLABORADORES de empresas activas
  // que aún no tienen login real (company_team_members.auth_user_id null + email).
  if (req.body?.action === "migrate-collaborators") {
    const sb = serviceClient();
    const { data: allComps } = await sb.from("companies").select("id, name, archived");
    const active = (allComps || []).filter((c) => !c.archived);
    const activeIds = new Set(active.map((c) => c.id));
    const cmap = Object.fromEntries(active.map((c) => [c.id, c.name]));
    const { data: members } = await sb
      .from("company_team_members")
      .select("id, company_id, email, auth_user_id");
    const pending = (members || []).filter(
      (m) => activeIds.has(m.company_id) && m.email && !m.auth_user_id
    );
    const byEmail = new Map();
    for (const m of pending) {
      const e = String(m.email).trim().toLowerCase();
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(m);
    }
    const results = [];
    for (const [emailNorm, rows] of byEmail) {
      const companies = [...new Set(rows.map((r) => cmap[r.company_id]).filter(Boolean))];
      const pw = genPassword();
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: emailNorm, password: pw, email_confirm: true,
      });
      if (createErr) {
        // Probablemente ya tiene cuenta (admin u otra). La RLS por email igual le
        // da acceso si esa cuenta existe. Lo marcamos para revisión manual.
        results.push({ email: emailNorm, companies, status: "skipped", note: createErr.message });
        continue;
      }
      await Promise.all(rows.map((r) =>
        sb.from("company_team_members").update({ auth_user_id: created.user.id }).eq("id", r.id)
      ));
      results.push({ email: emailNorm, password: pw, companies, status: "created" });
    }
    return res.status(200).json({ ok: true, action: "migrate-collaborators", results });
  }

  // 2) Payload. `email`/`password` = crear; `newEmail`/`newPassword` = gestionar
  //    (cambiar email / resetear contraseña de una empresa ya migrada).
  const { companyId, email, password, newEmail, newPassword } = req.body || {};
  if (!companyId) return res.status(400).json({ error: "companyId es requerido" });
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const sb = serviceClient();

  const { data: company, error: cErr } = await sb
    .from("companies")
    .select("id, name, slug, email, owner_user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (cErr) return res.status(500).json({ error: cErr.message });
  if (!company) return res.status(404).json({ error: "empresa no encontrada" });

  // ── MODO GESTIÓN: empresa ya migrada → cambiar email / resetear password ──
  if (company.owner_user_id) {
    const mEmail = newEmail ? String(newEmail).trim().toLowerCase() : null;
    if (!mEmail && !newPassword) {
      return res.status(400).json({ error: "pasá newEmail y/o newPassword" });
    }
    if (mEmail && !EMAIL_RE.test(mEmail)) return res.status(400).json({ error: "email inválido" });
    if (newPassword && String(newPassword).length < 8) {
      return res.status(400).json({ error: "la contraseña debe tener al menos 8 caracteres" });
    }
    const patch = {};
    if (mEmail) { patch.email = mEmail; patch.email_confirm = true; }
    if (newPassword) patch.password = newPassword;
    const { error: updErr } = await sb.auth.admin.updateUserById(company.owner_user_id, patch);
    if (updErr) return res.status(400).json({ error: updErr.message });
    if (mEmail) {
      await sb.from("companies").update({ email: mEmail }).eq("id", companyId).catch(() => {});
      await sb.from("company_team_members").update({ email: mEmail })
        .eq("company_id", companyId).eq("auth_user_id", company.owner_user_id).catch(() => {});
    }
    return res.status(200).json({ ok: true, mode: "reset", companyId, slug: company.slug, email: mEmail || undefined });
  }

  // ── MODO CREAR: empresa sin acceso ──
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "companyId, email y password son obligatorios" });
  }
  const emailNorm = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(emailNorm)) return res.status(400).json({ error: "email inválido" });
  if (String(password).length < 8) {
    return res.status(400).json({ error: "la contraseña debe tener al menos 8 caracteres" });
  }

  // 4) Crear el usuario de Auth (email confirmado — el admin comparte credenciales).
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
  });
  if (createErr) {
    return res.status(400).json({ error: createErr.message });
  }
  const newUserId = created.user.id;

  // 5) Linkear a la empresa. Si algo falla → rollback (borrar auth user; la FK
  //    owner_user_id→auth.users es ON DELETE SET NULL, así que se limpia sola).
  const prevEmail = company.email || null;
  try {
    const { data: updRows, error: updErr } = await sb
      .from("companies")
      .update({ owner_user_id: newUserId, email: emailNorm })
      .eq("id", companyId)
      .select("id");
    if (updErr) throw updErr;
    if (!updRows || updRows.length === 0) {
      throw new Error("companyId no coincide con ninguna empresa");
    }

    // company_team_members NO tiene índice único (company_id,auth_user_id), así
    // que no usamos upsert: chequeamos y hacemos insert o update a mano.
    const ctmPayload = {
      company_id: companyId,
      auth_user_id: newUserId,
      email: emailNorm,
      name: company.name || "Owner",
      is_owner: true,
      roles: ["owner"],
    };
    const { data: existing } = await sb
      .from("company_team_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("auth_user_id", newUserId)
      .limit(1);
    if (existing && existing.length > 0) {
      const { error: uErr } = await sb.from("company_team_members").update(ctmPayload).eq("id", existing[0].id);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await sb.from("company_team_members").insert(ctmPayload);
      if (iErr) throw iErr;
    }
  } catch (err) {
    await sb.auth.admin.deleteUser(newUserId).catch(() => {});
    // Revertir el email por si la FK ya limpió owner_user_id pero dejó el email.
    await sb.from("companies").update({ owner_user_id: null, email: prevEmail }).eq("id", companyId).catch(() => {});
    return res.status(400).json({ error: err.message || "no se pudo linkear la empresa" });
  }

  res.status(200).json({ ok: true, userId: newUserId, companyId, email: emailNorm, slug: company.slug });
}
