// Rate limits del Guionista por empresa (workspace cliente).
//
// Sistema de 3 ventanas rolling (no reset a medianoche, sino "últimos N
// minutos") — patrón estilo Claude. Por empresa = pool compartido entre
// todos los miembros del equipo cliente.
//
// Tabla: company_token_usage (creada en db/company_token_usage.sql).
// Cada llamada al Guionista loguea {input_tokens, output_tokens, model}.
//
// Uso típico:
//   const status = await checkLimits({ companyId });
//   if (status.blocked) {
//     // mostrar modal "vuelve a las HH:MM"
//   } else if (status.warning) {
//     // mostrar aviso amarillo
//   }
//
// Después de la llamada exitosa:
//   await logUsage({ companyId, memberId, inputTokens, outputTokens, model, context });

import { database } from "./backend.js";
import { logger } from "./logger.js";

// Costo estimado por guión (~10k tokens). Lo usamos como margen de bloqueo:
// si te quedan menos de COST_PER_SCRIPT en cualquier ventana, no podés
// generar otro guión completo — bloqueamos antes de quemar y dejarte mal.
const COST_PER_SCRIPT = 10000;

export const LIMITS = [
  {
    key: "hour",
    label: "última hora",
    windowSeconds: 60 * 60,
    capTokens: 60_000,
    warnAtTokens: 50_000, // ~1 guión antes del bloqueo
  },
  {
    key: "day",
    label: "últimas 24 horas",
    windowSeconds: 24 * 60 * 60,
    capTokens: 150_000,
    warnAtTokens: 140_000, // ~1 guión antes
  },
  {
    key: "week",
    label: "últimos 7 días",
    windowSeconds: 7 * 24 * 60 * 60,
    capTokens: 300_000,
    warnAtTokens: 290_000, // ~1 guión antes
  },
];

// Trae las filas de uso desde la ventana más larga (7d). Una sola query y
// agregamos en memoria por las 3 ventanas. Más rápido y barato que 3 queries.
async function fetchRecentUsage(companyId) {
  if (!companyId) return [];
  const since = new Date(Date.now() - LIMITS[LIMITS.length - 1].windowSeconds * 1000).toISOString();
  const { data, error } = await database
    .from("company_token_usage")
    .select("total_tokens, created_at")
    .eq("company_id", companyId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    logger.error("[tokenLimits] fetchRecentUsage failed:", error);
    return [];
  }
  return data || [];
}

// Calcula cuándo se libera tokens suficientes para un nuevo guión: encuentra
// la fila MÁS VIEJA dentro de la ventana y suma window al created_at.
// Cuando esa fila salga de la ventana, los tokens se "liberan".
function nextResetTime(rows, windowSeconds) {
  if (!rows || rows.length === 0) return null;
  const oldest = rows[0]; // ya viene ordenado asc
  const oldestTime = new Date(oldest.created_at).getTime();
  return new Date(oldestTime + windowSeconds * 1000);
}

// Detecta si el user actualmente logueado en Supabase es team Inforce con
// privilegios de bypass del rate-limit (admin global o reviewer).
// Espejo de detectTeamBypass() en api/generate-script.js — lo replicamos en
// el cliente para no mostrar la UI de "límite alcanzado" cuando el server
// igual va a generarle. Cacheado por module-load para no hacer 1 query
// extra cada checkLimits().
let _bypassCache = { value: null, at: 0 };
async function hasTeamBypass() {
  // Cache de 30s — el rol/is_reviewer no cambia tan seguido como para
  // hacer la query en cada render del Guionista.
  if (_bypassCache.at && Date.now() - _bypassCache.at < 30_000) {
    return _bypassCache.value;
  }
  try {
    const { data: sess } = await database.auth.getSession();
    const user = sess?.session?.user;
    if (!user) {
      _bypassCache = { value: false, at: Date.now() };
      return false;
    }
    // 1) Buscar por id (team_members.id = id de auth.users; no hay auth_id).
    //    Antes .eq("auth_id", ...) → 400 (columna inexistente).
    let { data: tm } = await database
      .from("team_members")
      .select("role, is_reviewer")
      .eq("id", user.id)
      .maybeSingle();
    // 2) Fallback por email — para team_members legacy que aún no tienen
    //    auth_id enlazado al user de Supabase Auth.
    if (!tm && user.email) {
      const r = await database
        .from("team_members")
        .select("role, is_reviewer")
        .ilike("email", user.email)
        .maybeSingle();
      tm = r.data;
    }
    const ok = !!tm && (tm.role === "admin" || tm.is_reviewer === true);
    _bypassCache = { value: ok, at: Date.now() };
    return ok;
  } catch {
    return false;
  }
}

// Devuelve el estado completo de las 3 ventanas + flags consolidados.
//   {
//     blocked: bool,             // alguna ventana llegó a su cap
//     warning: bool,             // alguna ventana pasó su warn threshold
//     blockedBy: 'hour'|'day'|'week'|null,   // primera ventana en bloquear
//     unlocksAt: Date|null,      // cuándo deja de estar bloqueado
//     bypass: bool,              // true si el user es team admin/reviewer
//     windows: [
//       { key, label, used, cap, warnAt, remaining, percent, isBlocking, isWarning, unlocksAt }
//     ]
//   }
export async function checkLimits({ companyId }) {
  // Bypass para team Inforce — no mostramos UI de límite si igual el server
  // va a generar. Devolvemos un shape compatible con la UI existente.
  const bypass = await hasTeamBypass();
  if (bypass) {
    return {
      blocked: false,
      warning: false,
      blockedBy: null,
      unlocksAt: null,
      bypass: true,
      windows: LIMITS.map((lim) => ({
        key: lim.key, label: lim.label,
        used: 0, cap: lim.capTokens, warnAt: lim.warnAtTokens,
        remaining: lim.capTokens, percent: 0,
        isBlocking: false, isWarning: false, unlocksAt: null,
      })),
      costPerScript: COST_PER_SCRIPT,
    };
  }

  const rows = await fetchRecentUsage(companyId);
  const now = Date.now();

  const windows = LIMITS.map((lim) => {
    const cutoff = now - lim.windowSeconds * 1000;
    const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    const used = inWindow.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const remaining = Math.max(0, lim.capTokens - used);
    const percent = Math.min(100, Math.round((used / lim.capTokens) * 100));
    const isBlocking = remaining < COST_PER_SCRIPT;
    const isWarning = used >= lim.warnAtTokens && !isBlocking;
    const unlocksAt = isBlocking ? nextResetTime(inWindow, lim.windowSeconds) : null;
    return {
      key: lim.key,
      label: lim.label,
      used,
      cap: lim.capTokens,
      warnAt: lim.warnAtTokens,
      remaining,
      percent,
      isBlocking,
      isWarning,
      unlocksAt,
    };
  });

  const blockingWindow = windows.find((w) => w.isBlocking) || null;
  const warningWindow = windows.find((w) => w.isWarning) || null;

  return {
    blocked: !!blockingWindow,
    warning: !!warningWindow,
    blockedBy: blockingWindow?.key || null,
    unlocksAt: blockingWindow?.unlocksAt || null,
    windows,
    costPerScript: COST_PER_SCRIPT,
  };
}

// Loguea una llamada al Guionista. Llamar SOLO cuando la respuesta de la
// API fue exitosa (no inflar uso por errores). `context` es opcional —
// guarda metadata útil (concept_id, idea, etc) para auditoría.
export async function logUsage({ companyId, memberId, inputTokens, outputTokens, model, context }) {
  if (!companyId) return null;
  const { data, error } = await database
    .from("company_token_usage")
    .insert({
      company_id: companyId,
      member_id: memberId || null,
      input_tokens: Math.max(0, Math.round(inputTokens || 0)),
      output_tokens: Math.max(0, Math.round(outputTokens || 0)),
      model: model || null,
      context: context || null,
    })
    .select()
    .single();
  if (error) {
    logger.error("[tokenLimits] logUsage failed:", error);
    return null;
  }
  return data;
}

// Formatea Date → "HH:MM" en hora local del browser.
export function formatTime(date) {
  if (!date) return "";
  try {
    return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

// Formatea Date → "mañana 14:32" / "hoy 14:32" / "lun 14:32" (más legible).
export function formatRelativeTime(date) {
  if (!date) return "";
  try {
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const time = formatTime(date);
    if (sameDay) return `hoy ${time}`;
    if (isTomorrow) return `mañana ${time}`;
    const dayName = date.toLocaleDateString("es-CO", { weekday: "short" });
    return `${dayName} ${time}`;
  } catch { return formatTime(date); }
}

// Formatea cantidad de tokens en string compacto. 60000 → "60k".
export function formatTokens(n) {
  const v = Math.round(n || 0);
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(v);
}
