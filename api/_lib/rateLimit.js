// Rate limits de IA por empresa — pool compartido entre todos los endpoints.
//
// Vivía duplicado dentro de api/generate-script.js, que ya pedía a gritos que se
// extrajera ("Si tocás los límites acá, ACTUALIZÁ TAMBIÉN src/lib/tokenLimits.js").
// Ahora hay un solo lugar server-side; `src/lib/tokenLimits.js` sigue siendo el
// espejo para el browser (la API no puede importar el cliente browser de Supabase).
//
// ⚠️ Si cambiás los límites acá, actualizá TAMBIÉN src/lib/tokenLimits.js.

export const TOKEN_LIMITS = [
  { key: "hour", label: "última hora",      windowSeconds: 60 * 60,          capTokens: 60_000 },
  { key: "day",  label: "últimas 24 horas", windowSeconds: 24 * 60 * 60,     capTokens: 150_000 },
  { key: "week", label: "últimos 7 días",   windowSeconds: 7 * 24 * 60 * 60, capTokens: 300_000 },
];

// ~10k tokens por generación. Bloqueamos cuando el remanente no alcanza para una
// más, en vez de esperar a llegar a 0: así el usuario no hace clic, quema tokens
// y termina peor que antes.
export const COST_PER_SCRIPT = 10_000;

// ¿Quien invoca es team Inforce con privilegios de bypass? Validamos el JWT de
// `Authorization: Bearer <token>` contra Supabase Auth y buscamos al user en
// `team_members`. Si tiene role='admin' o is_reviewer=true, bypass.
// Sin JWT, o si la validación falla, NO hay bypass.
//
// Dos bugs que arrastraba esta función desde que vivía dentro de
// api/generate-script.js, y que la hacían devolver `false` SIEMPRE:
//
//   1. Validaba el JWT con un cliente anon construido desde BACKEND_ANON_KEY.
//      Esa var no está seteada en todos los entornos (en local no existe), así
//      que createClient/getUser fallaba y caía al catch. Ahora se usa el cliente
//      service_role que ya recibimos — es lo que hace api/_lib/auth.js:getUser,
//      valida JWTs igual de bien y no depende de otra env var.
//   2. Buscaba `team_members.auth_id`, columna que NO EXISTE en el esquema. El
//      vínculo canónico es `team_members.id === auth.uid()` (así lo resuelven
//      _lib/auth.js:isTeamMember y src/lib/tokenLimits.js). La query erraba y el
//      fallback por email tapaba el problema solo cuando los emails coincidían.
//
// Efecto del arreglo: el equipo deja de comerse el rate limit de sus clientes.
export async function detectTeamBypass(req, sb) {
  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    const jwt = authHeader.slice(7).trim();
    if (!jwt) return false;

    const { data: userRes, error } = await sb.auth.getUser(jwt);
    if (error || !userRes?.user) return false;
    const user = userRes.user;

    // 1) Link canónico: team_members.id es el auth.uid().
    let { data: tm } = await sb
      .from("team_members")
      .select("id, role, is_reviewer, active")
      .eq("id", user.id)
      .maybeSingle();
    // 2) Fallback por email — para filas legacy creadas antes de Supabase Auth.
    if (!tm && user.email) {
      const r = await sb
        .from("team_members")
        .select("id, role, is_reviewer, active")
        .ilike("email", user.email)
        .maybeSingle();
      tm = r.data;
    }
    if (!tm || tm.active === false) return false;
    return tm.role === "admin" || tm.is_reviewer === true;
  } catch (e) {
    console.warn("[detectTeamBypass] failed:", e?.message);
    return false;
  }
}

// Estado de las 3 ventanas rolling con UNA sola query (traemos desde la ventana
// más larga y agregamos en memoria). Fail-open: si la tabla no existe o la query
// falla, dejamos pasar — es preferible a romper la generación.
export async function checkCompanyTokenLimits(sb, companyId) {
  if (!companyId) return { blocked: false, windows: [] };
  const longestWindow = TOKEN_LIMITS[TOKEN_LIMITS.length - 1].windowSeconds;
  const since = new Date(Date.now() - longestWindow * 1000).toISOString();
  const { data, error } = await sb
    .from("company_token_usage")
    .select("total_tokens, created_at")
    .eq("company_id", companyId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[rateLimit] checkCompanyTokenLimits failed:", error);
    return { blocked: false, windows: [] };
  }
  const rows = data || [];
  const now = Date.now();
  const windows = TOKEN_LIMITS.map((lim) => {
    const cutoff = now - lim.windowSeconds * 1000;
    const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    const used = inWindow.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const remaining = Math.max(0, lim.capTokens - used);
    const isBlocking = remaining < COST_PER_SCRIPT;
    let unlocksAt = null;
    // Se libera cuando la generación MÁS VIEJA sale de la ventana.
    if (isBlocking && inWindow.length > 0) {
      const oldest = new Date(inWindow[0].created_at).getTime();
      unlocksAt = new Date(oldest + lim.windowSeconds * 1000).toISOString();
    }
    return { key: lim.key, label: lim.label, used, cap: lim.capTokens, remaining, isBlocking, unlocksAt };
  });
  const blocking = windows.find((w) => w.isBlocking) || null;
  return {
    blocked: !!blocking,
    blockedBy: blocking?.key || null,
    blockedLabel: blocking?.label || null,
    unlocksAt: blocking?.unlocksAt || null,
    windows,
  };
}

// Respuesta 429 estándar. Devuelve `true` si respondió (bloqueado), `false` si
// hay vía libre — para que el caller haga `if (await enforce(...)) return;`.
export async function enforceCompanyTokenLimits(res, sb, companyId) {
  const rl = await checkCompanyTokenLimits(sb, companyId);
  if (!rl.blocked) return false;
  res.status(429).json({
    error: "rate_limited",
    message: `Límite de tokens alcanzado en la ${rl.blockedLabel}. Volvés a generar a partir de ${rl.unlocksAt}.`,
    unlocksAt: rl.unlocksAt,
    blockedBy: rl.blockedBy,
    windows: rl.windows,
  });
  return true;
}

// Registra el consumo real post-llamada. Los cache reads cuestan menos pero los
// sumamos al input igual: son finitos y el tracking conservador es el que no te
// deja pasarte sin darte cuenta.
//
// CRÍTICO para los callers: hacer `await` de esto ANTES de `res.end()`. Vercel
// mata la function al cerrar la respuesta, y sin el await el insert se pierde en
// silencio (eso rompía el rate limiting entero).
export async function logUsage(sb, { companyId, memberId, inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0, model, context = {} }) {
  if (!companyId) return;
  if (inputTokens <= 0 && outputTokens <= 0) return;
  try {
    const { error } = await sb.from("company_token_usage").insert({
      company_id: companyId,
      member_id: memberId || null,
      input_tokens: inputTokens + cacheCreationTokens + cacheReadTokens,
      output_tokens: outputTokens,
      model: model || null,
      context,
    });
    if (error) console.error("[rateLimit] logUsage failed:", error);
  } catch (e) {
    console.error("[rateLimit] logUsage threw:", e?.message || e);
  }
}
