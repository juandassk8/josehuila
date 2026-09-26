// Finance OS — endpoint unificado AI.
//
// Action via query param o body.action:
//   - "chat"  → AI Strategic Advisor con streaming SSE
//   - "parse" → Parser de transacción por voz (response JSON directo)
//
// Unificado en un solo endpoint por límite de funciones serverless (12) del plan Hobby de Vercel.

import { createClient } from "./_lib/database-client.js";
import { requireTeamAdmin, sendAuthError } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 60,
};

const MODEL = "claude-opus-4-7";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT_ADVISOR = `Sos un asesor financiero senior, top tier, especializado en agencias creativas y consultorias de paid media. Tu cliente es Jose Manuel Huila, fundador de Inforce Consulting (Colombia).

Tenes acceso completo a sus datos financieros actuales (ver SNAPSHOT abajo). Usalos como base de TODA recomendacion.

REGLAS DE COMPORTAMIENTO:
- Responde en espanol colombiano, directo, sin rodeos. Trato de socio de negocios, no chatbot.
- Si esta gastando mal, decirle claramente. NO seas complaciente. Mejor honestidad brutal que comodidad.
- Da respuestas accionables, no genericas. En vez de "deberias ahorrar mas", deci "cancelar X suscripcion y reasignar esos $97K a reserva de emergencia".
- Cuando recomienda acciones concretas (cosas que el debe HACER), formatealas al final del mensaje con el tag [ACTION] en linea separada:
    [ACTION] Cancelar Canva (no usado hace 45 dias)
    [ACTION] Llamar a Wake Up para confirmar fecha de pago
  La app las extrae automaticamente y le ofrece agregarlas al Action Engine con un click.
- Si te pregunta "puedo gastar X en Y?": evalua runway actual, ingresos confirmados vs esperados, urgencia/ROI del gasto. Da un si/no con condiciones explicitas.
- Si te pide ayuda para conseguir dinero: planeas tactico de 24-72 horas (que publicar, a quien contactar, propuesta a enviar, script a grabar).
- Si el snapshot tiene runway < 1 mes, abri toda respuesta con la alerta antes de tocar otros temas.
- No inventes cifras. Si no tenes data sobre algo, decilo y proponé como obtenerla.
- Cuando referencias plata, usa formato $X.XM (millones COP) o $XK (miles) para que sea facil leer.

ESTRUCTURA DE TUS RESPUESTAS:
1) Diagnostico breve (1-2 frases con la lectura de la situacion).
2) Recomendacion clara (3-5 frases, lo que recomendas hacer y por que).
3) [ACTION] tags al final (cuando aplica) — uno por linea.`;

function buildParserSystemPrompt(accounts, categories) {
  return `Sos un parser de transacciones financieras en espanol colombiano. Te paso una transcripcion de audio del usuario y devolves SOLO un JSON valido (sin texto fuera del JSON).

ESTRUCTURA EXACTA (todos los campos):
{
  "type": "income" | "expense",
  "amount": number (en COP),
  "category_name": string (debe matchear una de la lista de abajo) | null,
  "scope": "agency" | "personal" | "family" | "content_capex",
  "description": string (corto, lo que dijo el user),
  "counterparty": string | null,
  "account_name": string | null,
  "status": "completed" | "pending",
  "due_date": "YYYY-MM-DD" | null,
  "confidence": number entre 0 y 1
}

REGLAS DE PARSING:
- "mil pesos" / "X mil" = X * 1000 (50 mil = 50000)
- "millon" / "X millones" = X * 1000000
- "M" o "K" si los usa textualmente: "5M" = 5000000, "500K" = 500000
- Si menciona equipo (Nath, Deison, Jul, Setter, payroll, sueldo, equipo) -> scope=agency
- Si menciona contenido, camara, luz, edicion, produccion -> scope=content_capex
- Si dice "para mi", "personal", "almuerzo", "comida" -> scope=personal
- Si menciona arriendo, familia, mama, papa, hijos -> scope=family
- Default scope si no se infiere: agency
- type=income si dice "me pagaron", "me llego", "cobre", "me confirmo el pago", "X me debe que paga manana"
- type=expense si dice "gaste", "pague", "compre", "debo pagar X"
- status="pending" si dice "manana", "la proxima semana", "me va a pagar" (sin que aún haya ocurrido)
- status="completed" por default
- description: 5-10 palabras
- counterparty: persona/cliente/proveedor mencionado
- confidence: tu nivel de seguridad (0.0-1.0)

CATEGORIAS DISPONIBLES (matchear exactamente, sino null):
${categories.map((c) => `- "${c.name}" (${c.type}, ${c.scope})`).join("\n")}

CUENTAS DISPONIBLES (matchear por nombre, sino null):
${accounts.map((a) => `- "${a.name}" (${a.type})`).join("\n")}

NO inventes campos. Si algo no esta claro, dejalo null y baja la confidence.`;
}

async function buildContextSnapshot(sb) {
  const [accRes, txRes, clRes, tcRes, subRes, debtRes, goalRes] = await Promise.all([
    sb.from("finance_accounts").select("*").eq("is_active", true),
    sb.from("finance_transactions").select("*").order("transaction_date", { ascending: false }).limit(500),
    sb.from("finance_clients").select("*"),
    sb.from("finance_team_costs").select("*").eq("status", "active"),
    sb.from("finance_subscriptions").select("*").eq("status", "active"),
    sb.from("finance_debts").select("*").neq("status", "paid"),
    sb.from("finance_goals").select("*").eq("status", "active"),
  ]);

  const accounts = accRes.data || [];
  const transactions = txRes.data || [];
  const clients = clRes.data || [];
  const teamCosts = tcRes.data || [];
  const subscriptions = subRes.data || [];
  const debts = debtRes.data || [];
  const goals = goalRes.data || [];

  const totalCash = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const monthlyTeam = teamCosts.reduce((s, t) => s + Number(t.monthly_cost || 0), 0);
  const monthlySubs = subscriptions.reduce((s, t) => s + Number(t.monthly_cost || 0), 0);
  const monthlyFixed = monthlyTeam + monthlySubs;

  const pendingIncome = transactions
    .filter((t) => t.type === "income" && (t.status === "pending" || t.status === "overdue"))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const pendingExpense = transactions
    .filter((t) => t.type === "expense" && (t.status === "pending" || t.status === "overdue"))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const runwayMonths = monthlyFixed > 0 ? (totalCash + pendingIncome) / monthlyFixed : Infinity;

  const mrr = clients.filter((c) => c.status === "active").reduce((s, c) => s + Number(c.monthly_value || 0), 0);
  const pipelineWeighted = clients.filter((c) => c.status === "prospect").reduce((s, c) => s + Number(c.monthly_value || 0) * Number(c.pipeline_probability || 0), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthExpense = transactions.filter((t) =>
    t.type === "expense" && t.status !== "cancelled" &&
    new Date(t.transaction_date) >= monthStart
  );
  const monthIncome = transactions.filter((t) =>
    t.type === "income" && t.status === "completed" &&
    new Date(t.transaction_date) >= monthStart
  );

  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const overdueReceivables = transactions.filter((t) =>
    t.type === "income" && t.status === "overdue" &&
    t.due_date && new Date(t.due_date) < sevenAgo
  );

  const upcoming = transactions
    .filter((t) => t.type === "expense" && (t.status === "pending" || t.status === "overdue") && t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5)
    .map((t) => ({ what: t.description || t.counterparty || "Pago", amount: t.amount, due_date: t.due_date, status: t.status }));

  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const staleSubs = subscriptions.filter((s) => !s.last_used_date || new Date(s.last_used_date) < thirtyAgo);

  return {
    saldo_total: totalCash,
    cuentas: accounts.map((a) => ({ nombre: a.name, tipo: a.type, saldo: a.current_balance })),
    runway_meses: isFinite(runwayMonths) ? Number(runwayMonths.toFixed(2)) : "infinito",
    gastos_fijos_mensuales: monthlyFixed,
    costo_equipo_mensual: monthlyTeam,
    subscripciones_mensuales: monthlySubs,
    mrr_activo: mrr,
    pipeline_ponderado_mensual: pipelineWeighted,
    clientes_activos: clients.filter((c) => c.status === "active").map((c) => ({ nombre: c.name, retainer_mensual: c.monthly_value, dia_cobro: c.payment_day })),
    clientes_prospectos: clients.filter((c) => c.status === "prospect").map((c) => ({ nombre: c.name, valor_potencial: c.monthly_value, probabilidad: c.pipeline_probability, stage: c.pipeline_stage })),
    ingresos_mes_actual: monthIncome.reduce((s, t) => s + Number(t.amount), 0),
    gastos_mes_actual: monthExpense.reduce((s, t) => s + Number(t.amount), 0),
    por_cobrar_total: pendingIncome,
    por_pagar_total: pendingExpense,
    cuentas_por_cobrar_vencidas_7d: overdueReceivables.map((t) => ({ cliente: t.counterparty, monto: t.amount, due_date: t.due_date })),
    proximos_pagos: upcoming,
    suscripciones_stale_30d: staleSubs.map((s) => ({ nombre: s.name, costo_mensual: s.monthly_cost, ultimo_uso: s.last_used_date })),
    suscripciones_activas_total: subscriptions.length,
    miembros_equipo: teamCosts.map((t) => ({ nombre: t.name, rol: t.role, costo_mensual: t.monthly_cost, cubierto_por_clientes: (t.covered_by_client_ids || []).length })),
    deudas_me_deben: debts.filter((d) => d.direction === "owed_to_me").map((d) => ({ contraparte: d.counterparty_name, monto: d.amount, due_date: d.due_date })),
    deudas_yo_debo: debts.filter((d) => d.direction === "i_owe").map((d) => ({ contraparte: d.counterparty_name, monto: d.amount, due_date: d.due_date })),
    metas_activas: goals.map((g) => ({ titulo: g.title, target: g.target_value, actual: g.current_value, unidad: g.unit, progreso_pct: g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0, deadline: g.deadline })),
    fecha_actual: now.toISOString().slice(0, 10),
  };
}

// ---------- CHAT (streaming) ----------
async function handleChat(req, res, sb) {
  const { messages = [], conversationId = null } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array requerido" });
  }

  let snapshot;
  try {
    snapshot = await buildContextSnapshot(sb);
  } catch (e) {
    return res.status(500).json({ error: "snapshot failed: " + e.message });
  }

  const snapshotText = `## SNAPSHOT DE TU SITUACION FINANCIERA ACTUAL\nFecha: ${snapshot.fecha_actual}\n` + JSON.stringify(snapshot, null, 2);
  const fullSystem = `${SYSTEM_PROMPT_ADVISOR}\n\n${snapshotText}`;

  const cleanMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  })).filter((m) => m.content);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: fullSystem,
        messages: cleanMessages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      res.write(`data: ${JSON.stringify({ type: "error", error: errBody })}\n\n`);
      res.end();
      return;
    }

    let fullText = "";
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullText += parsed.delta.text;
            res.write(`data: ${JSON.stringify({ type: "delta", text: parsed.delta.text })}\n\n`);
          }
        } catch {}
      }
    }

    if (conversationId && fullText) {
      const lastUserMsg = cleanMessages[cleanMessages.length - 1];
      if (lastUserMsg?.role === "user") {
        await sb.from("finance_ai_messages").insert([
          { conversation_id: conversationId, role: "user", content: lastUserMsg.content },
          { conversation_id: conversationId, role: "assistant", content: fullText, context_snapshot: snapshot },
        ]);
        await sb.from("finance_ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done", fullText })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  }
}

// ---------- PARSE (JSON directo) ----------
async function handleParse(req, res, sb) {
  const { transcription } = req.body || {};
  if (!transcription?.trim()) {
    return res.status(400).json({ error: "transcription requerida" });
  }

  const [catRes, accRes] = await Promise.all([
    sb.from("finance_categories").select("id, name, type, scope"),
    sb.from("finance_accounts").select("id, name, type").eq("is_active", true),
  ]);
  const categories = catRes.data || [];
  const accounts = accRes.data || [];

  const systemPrompt = buildParserSystemPrompt(accounts, categories);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Transcripcion del audio:\n"${transcription.trim()}"\n\nDevolveme SOLO el JSON, sin markdown ni explicacion.`,
        }],
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      return res.status(upstream.status).json({ error: errBody });
    }

    const result = await upstream.json();
    const text = result.content?.[0]?.text || "";

    let jsonText = text.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonText = fenced[1].trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: "parse failed", rawText: text });
    }

    let category_id = null;
    if (parsed.category_name) {
      const cat = categories.find((c) =>
        c.name.toLowerCase() === String(parsed.category_name).toLowerCase()
        && c.type === parsed.type
        && c.scope === parsed.scope
      );
      if (cat) category_id = cat.id;
    }
    let account_id = null;
    if (parsed.account_name) {
      const acc = accounts.find((a) =>
        a.name.toLowerCase() === String(parsed.account_name).toLowerCase()
      );
      if (acc) account_id = acc.id;
    }
    if (!account_id && accounts.length === 1) account_id = accounts[0].id;

    // Log voice attempt for audit. Wrap in try/catch — Supabase JS no expone
    // .catch directamente sobre el builder antes del await.
    try {
      await sb.from("finance_voice_logs").insert({
        transcription,
        parsed_data: { ...parsed, category_id, account_id },
        status: "parsed",
      });
    } catch {}

    return res.status(200).json({
      ok: true,
      parsed: { ...parsed, category_id, account_id },
      categories,
      accounts,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ---------- Handler raíz ----------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  // Finanzas es solo del equipo Inforce. Exigimos JWT de team member — sin esto
  // cualquiera podía leer balances/MRR/deudas y escribir logs financieros.
  try {
    await requireTeamAdmin(req);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);
  const action = req.query?.action || req.body?.action;

  if (action === "chat") return handleChat(req, res, sb);
  if (action === "parse") return handleParse(req, res, sb);
  return res.status(400).json({ error: "action requerida: 'chat' o 'parse'" });
}
