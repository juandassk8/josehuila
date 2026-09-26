// Crear un integrante nuevo de Inforce Central (team_members).
//
// Flow:
//   1) Caller manda JWT en Authorization. Lo validamos contra Supabase Auth
//      y chequeamos que sea team_member con role='admin' y active=true.
//   2) Creamos auth user con email/password (email_confirm=true).
//   3) Insertamos row en team_members con name/role/color.
//
// El service_role key NUNCA llega al cliente — el cliente sólo manda JWT del
// caller para que el server verifique permisos.

import { createClient } from "./_lib/database-client.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 30,
};

const ALLOWED_ROLES = new Set(["admin", "member", "editor"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const callerJWT = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerJWT) return res.status(401).json({ error: "no auth header" });

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  // 1) Validar que el caller existe y es admin activo.
  const { data: callerAuth, error: aerr } = await sb.auth.getUser(callerJWT);
  if (aerr || !callerAuth?.user) {
    return res.status(401).json({ error: "invalid token" });
  }
  const { data: callerMember, error: cerr } = await sb
    .from("team_members")
    .select("role, active")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (cerr) return res.status(500).json({ error: cerr.message });
  if (!callerMember || callerMember.role !== "admin" || callerMember.active === false) {
    return res.status(403).json({ error: "solo admin puede crear miembros" });
  }

  // 2) Validar payload.
  const { name, email, password, role, color } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || !role) {
    return res.status(400).json({ error: "name, email, password y role son obligatorios" });
  }
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: `rol invalido: ${role}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password debe tener al menos 8 caracteres" });
  }

  // 3) Crear auth user.
  const { data: newAuth, error: createErr } = await sb.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (createErr) {
    return res.status(400).json({ error: createErr.message });
  }

  // 4) Insertar team_members row. Si falla, rollback del auth user.
  const { error: insertErr } = await sb.from("team_members").insert({
    id: newAuth.user.id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role,
    color: color || "#378ADD",
  });
  if (insertErr) {
    await sb.auth.admin.deleteUser(newAuth.user.id).catch(() => {});
    return res.status(400).json({ error: insertErr.message });
  }

  res.status(200).json({ ok: true, id: newAuth.user.id });
}
