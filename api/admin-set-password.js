// Cambiarle la contraseña a alguien del equipo, desde la plataforma.
//
// ─── Por qué acá y no por correo ─────────────────────────────────────────────
//
// El flujo normal de Supabase manda un link al correo. No sirve: el proyecto no
// tiene SMTP propio, así que ese correo no llega. Cuando a alguien se le olvidaba
// la contraseña había que entrar al panel de Supabase a cambiársela a mano.
//
// Este endpoint hace eso mismo desde la pantalla de Equipo, con las mismas guardas
// que ya usa admin-create-member: el service_role NUNCA sale al navegador; el
// cliente sólo manda su JWT y el servidor decide si esa persona puede.
//
// ─── Las dos guardas ─────────────────────────────────────────────────────────
//
//   1. Quien llama tiene que ser admin ACTIVO. Un admin desactivado sigue teniendo
//      un JWT válido hasta que vence, y sin el chequeo de `active` podría seguir
//      repartiendo contraseñas después de que lo sacaron.
//
//   2. El destino tiene que ser una fila de `team_members`. El service_role puede
//      cambiarle la contraseña a CUALQUIER usuario del proyecto; sin este filtro,
//      un id cualquiera en el body alcanzaría para tocar cuentas que no son del
//      equipo.

import { createClient } from "./_lib/database-client.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 30,
};

const LARGO_MINIMO = 8;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const callerJWT = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!callerJWT) return res.status(401).json({ error: "no auth header" });

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  // 1) Quién llama.
  const { data: callerAuth, error: aerr } = await sb.auth.getUser(callerJWT);
  if (aerr || !callerAuth?.user) return res.status(401).json({ error: "invalid token" });

  const { data: caller, error: cerr } = await sb
    .from("team_members")
    .select("role, active")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (cerr) return res.status(500).json({ error: cerr.message });
  if (!caller || caller.role !== "admin" || caller.active === false) {
    return res.status(403).json({ error: "solo un admin puede cambiar contraseñas" });
  }

  // 2) Qué se pide.
  const { memberId, password } = req.body || {};
  if (!memberId || !password) {
    return res.status(400).json({ error: "memberId y password son obligatorios" });
  }
  if (String(password).length < LARGO_MINIMO) {
    return res.status(400).json({ error: `la contraseña debe tener al menos ${LARGO_MINIMO} caracteres` });
  }

  // 3) A quién. Tiene que ser del equipo — ver la guarda 2 arriba.
  const { data: destino, error: derr } = await sb
    .from("team_members")
    .select("id, name, email")
    .eq("id", memberId)
    .maybeSingle();
  if (derr) return res.status(500).json({ error: derr.message });
  if (!destino) return res.status(404).json({ error: "ese integrante no existe" });

  // 4) Escribirla. `email_confirm` de paso: si la cuenta quedó sin confirmar, la
  // contraseña nueva no le serviría para entrar y el síntoma sería idéntico a que
  // el cambio no hubiera funcionado.
  const { error: uerr } = await sb.auth.admin.updateUserById(memberId, {
    password,
    email_confirm: true,
  });
  if (uerr) return res.status(400).json({ error: uerr.message });

  res.status(200).json({ ok: true, email: destino.email, name: destino.name });
}
