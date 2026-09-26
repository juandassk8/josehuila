// Thin wrappers Supabase para el módulo Finance OS.
// Todas las operaciones retornan { data, error } shape.

import { database } from "../../../lib/backend.js";

// ---- Balance delta helpers ----
// Aplica un delta firmado al current_balance de una cuenta.
// signedAmount: positivo = entra, negativo = sale (semántica de cuenta normal).
//
// PERO: si la cuenta es type='credit_card', el `current_balance` representa
// la DEUDA acumulada (positivo = lo que debés). Entonces un gasto debe
// sumar deuda, no restar saldo. Para mantener `signedAmount` con la misma
// semántica externa (negativo = sale), aquí invertimos el signo para tarjetas.
async function applyBalanceDelta(accountId, signedAmount) {
  if (!accountId) return;
  const amt = Number(signedAmount);
  if (!amt) return;
  const { data: acc } = await database
    .from("finance_accounts")
    .select("current_balance, type")
    .eq("id", accountId)
    .single();
  if (!acc) return;
  const effective = acc.type === "credit_card" ? -amt : amt;
  const newBalance = Number(acc.current_balance || 0) + effective;
  await database
    .from("finance_accounts")
    .update({ current_balance: newBalance })
    .eq("id", accountId);
}

// Para una transaction, calcula el delta firmado que aplicó al balance.
// Solo cuenta si status==="completed".
function txSignedDelta(tx) {
  if (!tx || tx.status !== "completed") return 0;
  const sign = tx.type === "income" ? 1 : -1;
  return sign * Number(tx.amount || 0);
}

// ---- Accounts ----
export async function listAccounts() {
  return database
    .from("finance_accounts")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
export async function createAccount(payload) {
  return database.from("finance_accounts").insert(payload).select().single();
}
export async function updateAccount(id, patch) {
  return database.from("finance_accounts").update(patch).eq("id", id).select().single();
}
export async function deleteAccount(id) {
  return database.from("finance_accounts").update({ is_active: false }).eq("id", id);
}

// ---- Categories ----
export async function listCategories() {
  return database
    .from("finance_categories")
    .select("*")
    .order("scope", { ascending: true })
    .order("type", { ascending: true })
    .order("sort_order", { ascending: true });
}
export async function createCategory(payload) {
  return database.from("finance_categories").insert(payload).select().single();
}
export async function updateCategory(id, patch) {
  return database.from("finance_categories").update(patch).eq("id", id).select().single();
}
export async function deleteCategory(id) {
  return database.from("finance_categories").delete().eq("id", id);
}

// ---- Clients ----
export async function listClients() {
  return database
    .from("finance_clients")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });
}
export async function createClient(payload) {
  return database.from("finance_clients").insert(payload).select().single();
}
export async function updateClient(id, patch) {
  return database.from("finance_clients").update(patch).eq("id", id).select().single();
}
export async function deleteClient(id) {
  return database.from("finance_clients").delete().eq("id", id);
}

// ---- Team costs ----
export async function listTeamCosts() {
  return database
    .from("finance_team_costs")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });
}
export async function createTeamCost(payload) {
  return database.from("finance_team_costs").insert(payload).select().single();
}
export async function updateTeamCost(id, patch) {
  return database.from("finance_team_costs").update(patch).eq("id", id).select().single();
}
export async function deleteTeamCost(id) {
  return database.from("finance_team_costs").delete().eq("id", id);
}

// ---- Subscriptions ----
export async function listSubscriptions() {
  return database
    .from("finance_subscriptions")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });
}
export async function createSubscription(payload) {
  return database.from("finance_subscriptions").insert(payload).select().single();
}
export async function updateSubscription(id, patch) {
  return database.from("finance_subscriptions").update(patch).eq("id", id).select().single();
}
export async function deleteSubscription(id) {
  return database.from("finance_subscriptions").delete().eq("id", id);
}

// ---- Transactions ----
// MVP: cap a las 500 más recientes (perf). Filtros adicionales se aplican en cliente.
export async function listTransactions({ limit = 500 } = {}) {
  return database
    .from("finance_transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
}
export async function createTransaction(payload) {
  const res = await database.from("finance_transactions").insert(payload).select().single();
  if (!res.error && res.data) {
    await applyBalanceDelta(res.data.account_id, txSignedDelta(res.data));
  }
  return res;
}
export async function updateTransaction(id, patch) {
  const { data: oldTx } = await database
    .from("finance_transactions").select("*").eq("id", id).single();
  const res = await database
    .from("finance_transactions").update(patch).eq("id", id).select().single();
  if (!res.error && res.data) {
    if (oldTx) await applyBalanceDelta(oldTx.account_id, -txSignedDelta(oldTx));
    await applyBalanceDelta(res.data.account_id, txSignedDelta(res.data));
  }
  return res;
}
export async function deleteTransaction(id) {
  const { data: tx } = await database
    .from("finance_transactions").select("*").eq("id", id).single();
  const res = await database.from("finance_transactions").delete().eq("id", id);
  if (!res.error && tx) {
    await applyBalanceDelta(tx.account_id, -txSignedDelta(tx));
  }
  return res;
}

// ---- Debts ----
export async function listDebts() {
  return database
    .from("finance_debts")
    .select("*")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });
}
export async function createDebt(payload) {
  return database.from("finance_debts").insert(payload).select().single();
}
export async function updateDebt(id, patch) {
  return database.from("finance_debts").update(patch).eq("id", id).select().single();
}
export async function deleteDebt(id) {
  return database.from("finance_debts").delete().eq("id", id);
}

// ---- AI Conversations ----
export async function listConversations() {
  return database
    .from("finance_ai_conversations")
    .select("*")
    .eq("archived", false)
    .order("updated_at", { ascending: false });
}
export async function createConversation(payload) {
  return database.from("finance_ai_conversations").insert(payload).select().single();
}
export async function updateConversation(id, patch) {
  return database.from("finance_ai_conversations").update(patch).eq("id", id).select().single();
}
export async function archiveConversation(id) {
  return database.from("finance_ai_conversations").update({ archived: true }).eq("id", id);
}

// ---- AI Messages ----
export async function listMessages(conversationId) {
  return database
    .from("finance_ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
}

// Trae el último mensaje del assistant (de cualquier conversación). Útil
// para mostrar la última recomendación en el banner del dashboard.
export async function getLatestAdvisorMessage() {
  return database
    .from("finance_ai_messages")
    .select("id, conversation_id, content, created_at")
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

// ---- Scopes ----
export async function listScopes() {
  return database
    .from("finance_scopes")
    .select("*")
    .eq("archived", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
export async function createScope(payload) {
  return database.from("finance_scopes").insert(payload).select().single();
}
export async function updateScope(id, patch) {
  return database.from("finance_scopes").update(patch).eq("id", id).select().single();
}
export async function archiveScope(id) {
  return database.from("finance_scopes").update({ archived: true }).eq("id", id);
}

// ---- Petty Expenses (gastos hormiga) ----
export async function listPettyExpenses() {
  return database
    .from("finance_petty_expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
}

// Crear gasto hormiga: además crea una transaction expense completed que
// resta del saldo de la cuenta seleccionada.
export async function createPettyExpense(payload) {
  if (!payload?.name?.trim() || !payload.amount) {
    return { error: new Error("nombre y monto requeridos") };
  }
  // 1) Crear petty expense
  const { data: petty, error: pErr } = await database
    .from("finance_petty_expenses")
    .insert(payload)
    .select()
    .single();
  if (pErr) return { error: pErr };

  // 2) Si tiene account_id, crear transaction completed + descontar del saldo
  if (payload.account_id) {
    await database.from("finance_transactions").insert({
      type: "expense",
      amount: payload.amount,
      scope: "personal", // legacy default; el scope real va en scope_id
      scope_id: payload.scope_id || null,
      category_id: payload.category_id || null,
      account_id: payload.account_id,
      description: payload.name,
      transaction_date: payload.expense_date,
      paid_date: payload.expense_date,
      status: "completed",
      payment_type: "one_time",
      notes: `[hormiga] ${payload.payment_method} · ${payload.notes || ""}`.trim(),
    });
    await applyBalanceDelta(payload.account_id, -Number(payload.amount));
  }
  return { data: petty };
}
export async function deletePettyExpense(id) {
  // Recupera el petty antes de borrar, para reverter balance + tx asociada.
  const { data: petty } = await database
    .from("finance_petty_expenses").select("*").eq("id", id).single();
  const res = await database.from("finance_petty_expenses").delete().eq("id", id);
  if (!res.error && petty && petty.account_id) {
    // Buscar transaction huérfana (matching heurístico) y borrarla — esto también revierte el balance.
    const { data: txMatch } = await database
      .from("finance_transactions")
      .select("*")
      .eq("account_id", petty.account_id)
      .eq("amount", petty.amount)
      .eq("type", "expense")
      .eq("status", "completed")
      .eq("transaction_date", petty.expense_date)
      .like("notes", "[hormiga]%")
      .limit(1)
      .maybeSingle();
    if (txMatch) {
      await deleteTransaction(txMatch.id);
    } else {
      await applyBalanceDelta(petty.account_id, Number(petty.amount));
    }
  }
  return res;
}

// ---- Budget Items ----
export async function listBudgetItems() {
  return database
    .from("finance_budget_items")
    .select("*")
    .order("scope", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
export async function createBudgetItem(payload) {
  return database.from("finance_budget_items").insert(payload).select().single();
}
export async function updateBudgetItem(id, patch) {
  return database.from("finance_budget_items").update(patch).eq("id", id).select().single();
}
export async function deleteBudgetItem(id) {
  return database.from("finance_budget_items").delete().eq("id", id);
}

// Marca un budget item como pagado (parcial o total).
// 1) Crea una transaction completed con budget_item_id.
// 2) Actualiza paid_amount + status del budget item.
export async function payBudgetItem(item, { amount, accountId, paymentDate, notes }) {
  if (!item?.id) return { error: new Error("item requerido") };
  if (!amount || amount <= 0) return { error: new Error("monto debe ser > 0") };
  if (!accountId) return { error: new Error("cuenta requerida") };

  const txDate = paymentDate || new Date().toISOString().slice(0, 10);

  // 1) Crear transaction
  const { data: tx, error: txErr } = await database
    .from("finance_transactions")
    .insert({
      type: item.type,
      amount,
      scope: item.scope,
      category_id: item.category_id || null,
      account_id: accountId,
      description: notes || item.name,
      counterparty: item.name,
      transaction_date: txDate,
      paid_date: txDate,
      status: "completed",
      client_id: item.client_id || null,
      payment_type: item.payment_type,
      budget_item_id: item.id,
    })
    .select()
    .single();
  if (txErr) return { error: txErr };

  // 1b) Aplicar delta al balance de la cuenta
  await applyBalanceDelta(accountId, item.type === "income" ? Number(amount) : -Number(amount));

  // 2) Actualizar paid_amount + status del item
  const newPaid = Number(item.paid_amount || 0) + Number(amount);
  const expected = Number(item.expected_amount || 0);
  let nextStatus = "partial";
  if (newPaid >= expected) nextStatus = "paid";
  else if (newPaid <= 0) nextStatus = "planned";

  const { error: updErr } = await database
    .from("finance_budget_items")
    .update({ paid_amount: newPaid, status: nextStatus })
    .eq("id", item.id);
  if (updErr) return { error: updErr };

  return { data: { transaction: tx, paidAmount: newPaid, status: nextStatus } };
}

// ---- Actions ----
export async function listActions() {
  return database
    .from("finance_actions")
    .select("*")
    .neq("status", "dismissed")
    .order("status", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
}
export async function createAction(payload) {
  return database.from("finance_actions").insert(payload).select().single();
}
export async function updateAction(id, patch) {
  return database.from("finance_actions").update(patch).eq("id", id).select().single();
}
export async function deleteAction(id) {
  return database.from("finance_actions").delete().eq("id", id);
}

// ---- Reset / Wipe ----
// Borra todos los datos transaccionales del usuario para empezar desde cero.
// NO toca: cuentas, categorías, scopes, clientes, suscripciones, sueldos, deudas.
// SÍ borra: transactions, budget_items, petty_expenses, AI conversations+messages, actions, voice_logs.
// Opcionalmente resetea current_balance de todas las cuentas a 0.
export async function wipeFinanceData({ resetAccountBalances = false } = {}) {
  // Para Supabase: necesitamos un filter que matchee todas las rows.
  // Usar `.not("id", "is", null)` — matchea todo lo que tiene un id (todas las rows).
  const all = (table) => database.from(table).delete().not("id", "is", null);

  const errs = [];
  for (const t of [
    "finance_transactions",
    "finance_budget_items",
    "finance_petty_expenses",
    "finance_ai_messages",
    "finance_ai_conversations",
    "finance_actions",
    "finance_voice_logs",
  ]) {
    const { error } = await all(t);
    if (error) errs.push(`${t}: ${error.message}`);
  }
  if (resetAccountBalances) {
    const { error } = await database
      .from("finance_accounts")
      .update({ current_balance: 0 })
      .not("id", "is", null);
    if (error) errs.push(`accounts reset: ${error.message}`);
  }
  if (errs.length) return { error: new Error(errs.join(" · ")) };
  return { data: { ok: true } };
}

// ---- Goals ----
export async function listGoals() {
  return database
    .from("finance_goals")
    .select("*")
    .order("status", { ascending: true })
    .order("deadline", { ascending: true, nullsFirst: false });
}
export async function createGoal(payload) {
  return database.from("finance_goals").insert(payload).select().single();
}
export async function updateGoal(id, patch) {
  return database.from("finance_goals").update(patch).eq("id", id).select().single();
}
export async function deleteGoal(id) {
  return database.from("finance_goals").delete().eq("id", id);
}
