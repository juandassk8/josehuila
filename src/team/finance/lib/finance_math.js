// Helpers puros del Finance OS. Sin React, sin Supabase.

// Format COP: $4.900.000 (sin decimales, separador miles).
export function formatCOP(amount, { signed = false } = {}) {
  const n = Number(amount || 0);
  const abs = Math.abs(Math.round(n));
  const sign = signed ? (n < 0 ? "-" : (n > 0 ? "+" : "")) : (n < 0 ? "-" : "");
  return `${sign}$${abs.toLocaleString("es-CO")}`;
}

// Compact COP: $4.9M / $373K / $5.2K / $50.
export function formatCOPCompact(amount) {
  const n = Math.abs(Math.round(Number(amount || 0)));
  const sign = Number(amount) < 0 ? "-" : "";
  if (n >= 1_000_000_000) return `${sign}$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${sign}$${(n / 1_000).toFixed(0)}K`;
  return `${sign}$${n}`;
}

// Parse de un input "$1.234.567" / "1234567" → 1234567.
export function parseCOP(text) {
  if (text == null) return 0;
  const cleaned = String(text).replace(/[^\d-]/g, "");
  return Number(cleaned) || 0;
}

// Versión dense para celdas estrechas: usa formatCOPCompact, pero $0 → "—"
// (más limpio que ver "$0" gris repetido en filas con valor pago vacío).
export function formatCOPDense(amount) {
  const n = Number(amount || 0);
  if (n === 0) return "—";
  return formatCOPCompact(n);
}

// Formato corto de fecha: "15 may" en vez de "15 de may". Acepta YYYY-MM-DD o Date.
export function formatDateShort(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.includes("T") ? d : d + "T12:00:00") : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(/\./g, "");
}

// Cantidad pagada de una transaction, con fallback si paid_amount no está en
// el row (pre-migration o DB legacy): infiere de status.
export function paidOf(t) {
  if (!t) return 0;
  if (t.paid_amount != null) return Number(t.paid_amount || 0);
  return t.status === "completed" ? Number(t.amount || 0) : 0;
}

// Cuánto FALTA por recibir/pagar de una transaction. Nunca negativo.
export function remainingOf(t) {
  if (!t) return 0;
  return Math.max(0, Number(t.amount || 0) - paidOf(t));
}

// Saldo total: suma de current_balance de cuentas activas.
export function calcTotalCash(accounts) {
  return (accounts || [])
    .filter((a) => a.is_active !== false && a.type !== "credit_card")
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
}

// Suma de deudas de todas las tarjetas de crédito (current_balance positivo = debes).
export function calcCreditDebt(accounts) {
  return (accounts || [])
    .filter((a) => a.is_active !== false && a.type === "credit_card")
    .reduce((sum, a) => sum + Math.max(Number(a.current_balance || 0), 0), 0);
}

// Gastos fijos mensuales: equipo activo + suscripciones activas.
// Por ahora no incluye transacciones recurrentes manuales (Fase 2 las auto-genera).
export function calcMonthlyFixed({ teamCosts, subscriptions, budgetItems = [] }) {
  const team = (teamCosts || [])
    .filter((t) => t.status === "active")
    .reduce((s, t) => s + Number(t.monthly_cost || 0), 0);
  const subs = (subscriptions || [])
    .filter((s) => s.status === "active")
    .reduce((s, sub) => s + Number(sub.monthly_cost || 0), 0);
  // Budget items recurrentes de tipo gasto = gastos fijos mensuales
  const recurring = (budgetItems || [])
    .filter((b) => b.type === "expense" && b.payment_type === "recurring" && b.status !== "cancelled")
    .reduce((s, b) => s + Number(b.expected_amount || 0), 0);
  return team + subs + recurring;
}

// Runway: meses que puedes operar con el cash actual a tu ritmo fijo.
// Si gastos fijos = 0, runway = Infinity.
export function calcRunway({ accounts, teamCosts, subscriptions, transactions, debts, budgetItems = [] }) {
  const totalCash = calcTotalCash(accounts);
  const receivables = totalPendingIncome(transactions, debts, budgetItems);
  const monthlyFixed = calcMonthlyFixed({ teamCosts, subscriptions, budgetItems });
  const months = monthlyFixed > 0 ? (totalCash + receivables) / monthlyFixed : Infinity;
  return { totalCash, receivables, monthlyFixed, months };
}

// Situación actual: 3 escenarios sobre tu cash.
//   ahora: lo que tenés hoy en cuentas
//   siPagoTodo: ahora - todo lo pendiente por pagar (transactions + debts + budgetItems)
//   siMePaganTodo: siPagoTodo + todo lo pendiente por cobrar (transactions + debts + budgetItems)
export function calcSituation({ accounts, transactions, debts, budgetItems = [] }) {
  const ahora = calcTotalCash(accounts);
  const porPagar = totalPendingExpense(transactions, debts, budgetItems);
  const porCobrar = totalPendingIncome(transactions, debts, budgetItems);
  const siPagoTodo = ahora - porPagar;
  const siMePaganTodo = siPagoTodo + porCobrar;
  return { ahora, porPagar, porCobrar, siPagoTodo, siMePaganTodo };
}

// Árbol de gastos por categoría dentro de un rango.
// Retorna: [{ scope, categories: [{ id, name, icon, color, total, children: [...] }] }]
// Children son las categorías con parent_category_id === this.id.
export function expenseByCategoryTree(transactions, categories, { from, to } = {}) {
  const fromMs = from ? from.getTime() : -Infinity;
  const toMs = to ? to.getTime() : Infinity;

  // Sumar por category_id
  const totals = new Map();
  for (const t of transactions || []) {
    if (t.type !== "expense") continue;
    if (t.status === "cancelled") continue;
    const ms = new Date(t.transaction_date).getTime();
    if (ms < fromMs || ms > toMs) continue;
    const key = t.category_id || `_none-${t.scope}`;
    totals.set(key, (totals.get(key) || 0) + Number(t.amount || 0));
  }

  // Build map of categories by id for hierarchy
  const catById = new Map((categories || []).map((c) => [c.id, c]));

  // Group scope → root categories → children
  const SCOPES = ["agency", "personal", "family", "content_capex"];
  const result = [];
  for (const scope of SCOPES) {
    const scopeCats = (categories || []).filter((c) => c.scope === scope && c.type === "expense" && !c.parent_category_id);
    const rows = scopeCats.map((parent) => {
      const children = (categories || [])
        .filter((c) => c.parent_category_id === parent.id)
        .map((child) => ({
          id: child.id,
          name: child.name,
          icon: child.icon,
          color: child.color,
          total: totals.get(child.id) || 0,
        }));
      const ownTotal = totals.get(parent.id) || 0;
      const childrenTotal = children.reduce((s, c) => s + c.total, 0);
      return {
        id: parent.id,
        name: parent.name,
        icon: parent.icon,
        color: parent.color,
        total: ownTotal + childrenTotal,
        ownTotal,
        children,
      };
    });
    // Incluir transacciones sin categoría como un row "Sin categoría"
    const noneKey = `_none-${scope}`;
    const noneTotal = totals.get(noneKey) || 0;
    if (noneTotal > 0) {
      rows.push({
        id: noneKey,
        name: "Sin categoría",
        icon: "•",
        color: "#888",
        total: noneTotal,
        ownTotal: noneTotal,
        children: [],
      });
    }
    const filteredRows = rows.filter((r) => r.total > 0);
    if (filteredRows.length > 0) {
      // Sort: mayor a menor
      filteredRows.sort((a, b) => b.total - a.total);
      // Sort children dentro de cada row
      for (const r of filteredRows) {
        r.children.sort((a, b) => b.total - a.total);
      }
      result.push({ scope, total: filteredRows.reduce((s, r) => s + r.total, 0), rows: filteredRows });
    }
  }
  // Sort scopes: mayor a menor
  result.sort((a, b) => b.total - a.total);
  return result;
}

// Filas para tabla de ingresos del dashboard.
// Combina:
//   - clientes activos con monthly_value > 0 → fila recurrente (esperado)
//   - transacciones income pending/overdue → fila one-off (lo que tiene fecha)
//   - debts owed_to_me → fila one-off
// Para clientes recurrentes, calcular cuánto ya recibió este mes y cuánto falta.
export function incomeRows(transactions, clients, debts = []) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const rows = [];

  // 1) Clientes activos con retainer recurrente
  for (const c of clients || []) {
    if (c.status !== "active") continue;
    if (!Number(c.monthly_value)) continue;
    const expected = Number(c.monthly_value);
    // Lo recibido este mes de este cliente
    const received = (transactions || [])
      .filter((t) =>
        t.type === "income" &&
        t.status === "completed" &&
        t.client_id === c.id &&
        new Date(t.transaction_date) >= monthStart &&
        new Date(t.transaction_date) <= monthEnd
      )
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const dueDay = c.payment_day || null;
    let dueDate = null;
    if (dueDay) {
      const d = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, 28));
      // Si ya pasó el día este mes, mostrar próximo mes
      if (d < now && received >= expected) {
        dueDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, 28));
      } else {
        dueDate = d;
      }
    }
    rows.push({
      id: `client-${c.id}`,
      name: c.name,
      expected,
      received,
      remaining: Math.max(expected - received, 0),
      dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      type: "recurring",
      _source: "client",
      _client: c,
    });
  }

  // 2) Transacciones income pending/overdue independientes (no son de clientes recurrentes)
  for (const t of transactions || []) {
    if (t.type !== "income") continue;
    if (t.status !== "pending" && t.status !== "overdue") continue;
    rows.push({
      id: `tx-${t.id}`,
      name: t.description || t.counterparty || "Ingreso pendiente",
      expected: Number(t.amount || 0),
      received: 0,
      remaining: Number(t.amount || 0),
      dueDate: t.due_date,
      type: "one_time",
      _source: "transaction",
      _tx: t,
    });
  }

  // 3) Debts owed_to_me
  for (const d of debts || []) {
    if (d.direction !== "owed_to_me") continue;
    if (d.status === "paid" || d.status === "cancelled") continue;
    rows.push({
      id: `debt-${d.id}`,
      name: d.counterparty_name,
      expected: Number(d.amount || 0),
      received: 0,
      remaining: Number(d.amount || 0),
      dueDate: d.due_date,
      type: "one_time",
      _source: "debt",
      _debt: d,
    });
  }

  // Sort: por fecha de cobro ASC (sin fecha al final)
  rows.sort((a, b) => {
    const da = a.dueDate || "9999-12-31";
    const db = b.dueDate || "9999-12-31";
    return da.localeCompare(db);
  });

  return rows;
}

// MRR actual: suma de monthly_value de clientes con status='active'.
export function calcMRR(clients) {
  return (clients || [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + Number(c.monthly_value || 0), 0);
}

// Pipeline ponderado: monthly_value * probability de prospectos en pipeline.
export function calcPipelineWeighted(clients) {
  return (clients || [])
    .filter((c) => c.status === "prospect")
    .reduce((s, c) => s + Number(c.monthly_value || 0) * Number(c.pipeline_probability || 0), 0);
}

// Cuentas por cobrar: transacciones income pending/overdue + deudas owed_to_me.
// debts es opcional (backward compat) — si se pasa, suma las deudas no pagadas.
export function pendingReceivables(transactions, debts = []) {
  const txItems = (transactions || []).filter(
    (t) => t.type === "income" && (t.status === "pending" || t.status === "overdue")
  );
  const debtItems = (debts || [])
    .filter((d) => d.direction === "owed_to_me" && d.status !== "paid" && d.status !== "cancelled")
    .map((d) => ({
      id: `debt-${d.id}`,
      type: "income",
      amount: d.amount,
      counterparty: d.counterparty_name,
      description: d.notes || `Deuda a cobrar de ${d.counterparty_name}`,
      due_date: d.due_date,
      status: d.status === "partial" ? "pending" : "pending",
      _source: "debt",
    }));
  return [...txItems, ...debtItems];
}

export function totalPendingIncome(transactions, debts = [], budgetItems = []) {
  const baseTotal = pendingReceivables(transactions, debts).reduce((s, t) => s + Number(t.amount || 0), 0);
  const biTotal = (budgetItems || [])
    .filter((b) => b.type === "income" && b.status !== "paid" && b.status !== "cancelled")
    .reduce((s, b) => s + Math.max(Number(b.expected_amount || 0) - Number(b.paid_amount || 0), 0), 0);
  return baseTotal + biTotal;
}

// Cuentas por pagar: transacciones expense pending/overdue + deudas i_owe.
export function pendingPayables(transactions, debts = []) {
  const txItems = (transactions || []).filter(
    (t) => t.type === "expense" && (t.status === "pending" || t.status === "overdue")
  );
  const debtItems = (debts || [])
    .filter((d) => d.direction === "i_owe" && d.status !== "paid" && d.status !== "cancelled")
    .map((d) => ({
      id: `debt-${d.id}`,
      type: "expense",
      amount: d.amount,
      counterparty: d.counterparty_name,
      description: d.notes || `Deuda a pagar a ${d.counterparty_name}`,
      due_date: d.due_date,
      status: d.status === "partial" ? "pending" : "pending",
      _source: "debt",
    }));
  return [...txItems, ...debtItems];
}

export function totalPendingExpense(transactions, debts = [], budgetItems = []) {
  const baseTotal = pendingPayables(transactions, debts).reduce((s, t) => s + Number(t.amount || 0), 0);
  const biTotal = (budgetItems || [])
    .filter((b) => b.type === "expense" && b.status !== "paid" && b.status !== "cancelled")
    .reduce((s, b) => s + Math.max(Number(b.expected_amount || 0) - Number(b.paid_amount || 0), 0), 0);
  return baseTotal + biTotal;
}

// Filtra transacciones por scope. scope = 'all' devuelve todas.
export function filterByScope(transactions, scope) {
  if (!scope || scope === "all") return transactions || [];
  return (transactions || []).filter((t) => t.scope === scope);
}

// Resuelve meta (name, icon, color) de un scope item. Prefiere scope_id si existe,
// sino busca por legacy_key matcheando con el text scope.
export function getScopeMeta(item, scopes) {
  if (!scopes?.length) return null;
  if (item?.scope_id) {
    return scopes.find((s) => s.id === item.scope_id) || null;
  }
  if (item?.scope) {
    return scopes.find((s) => s.legacy_key === item.scope) || null;
  }
  return null;
}

// Devuelve el scope row matching un text legacy_key (ej 'agency').
export function findScopeByLegacy(scopes, legacyKey) {
  return (scopes || []).find((s) => s.legacy_key === legacyKey) || null;
}

// Top N categorías de gasto en un rango (default: mes en curso).
// fromDate/toDate son Date inclusivos.
export function topExpenseCategories(transactions, categories, { from, to, n = 5 } = {}) {
  const fromMs = from ? from.getTime() : -Infinity;
  const toMs = to ? to.getTime() : Infinity;
  const totals = new Map();
  for (const t of transactions || []) {
    if (t.type !== "expense") continue;
    if (t.status === "cancelled") continue;
    const ms = new Date(t.transaction_date).getTime();
    if (ms < fromMs || ms > toMs) continue;
    const key = t.category_id || "_none";
    totals.set(key, (totals.get(key) || 0) + Number(t.amount || 0));
  }
  const arr = Array.from(totals.entries()).map(([catId, amount]) => {
    const cat = (categories || []).find((c) => c.id === catId);
    return {
      categoryId: catId,
      name: cat?.name || "Sin categoría",
      color: cat?.color || "#888",
      icon: cat?.icon || "•",
      amount,
    };
  });
  arr.sort((a, b) => b.amount - a.amount);
  return arr.slice(0, n);
}

// Próximos pagos pendientes ordenados por due_date ASC.
// Incluye transacciones expense pending + deudas i_owe no pagadas.
export function upcomingPayables(transactions, debts = [], { n = 5, withinDays = 30 } = {}) {
  const max = new Date();
  max.setDate(max.getDate() + withinDays);
  const items = pendingPayables(transactions, debts);
  return items
    .filter((t) => t.due_date && new Date(t.due_date) <= max)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, n);
}

// Cash flow histórico + proyectado: bucket por día.
// Devuelve [{ dateKey: 'YYYY-MM-DD', income, expense, net, cumulative }].
export function cashFlowSeries(transactions, { pastDays = 90, futureDays = 30, startBalance = 0 } = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today); from.setDate(from.getDate() - pastDays);
  const to = new Date(today); to.setDate(to.getDate() + futureDays);

  // Inicializar buckets vacíos por día.
  const buckets = new Map();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { dateKey: key, income: 0, expense: 0, net: 0 });
  }

  for (const t of transactions || []) {
    if (t.status === "cancelled") continue;
    // Para completed: usa transaction_date / paid_date.
    // Para pending: usa due_date (proyección).
    let dateStr;
    if (t.status === "pending" || t.status === "overdue") {
      dateStr = t.due_date || t.transaction_date;
    } else {
      dateStr = t.paid_date || t.transaction_date;
    }
    if (!dateStr) continue;
    const key = String(dateStr).slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    const amount = Number(t.amount || 0);
    if (t.type === "income") b.income += amount;
    else b.expense += amount;
  }

  // Cumulative neto desde startBalance.
  let cum = Number(startBalance) || 0;
  const result = [];
  for (const b of buckets.values()) {
    b.net = b.income - b.expense;
    cum += b.net;
    result.push({ ...b, cumulative: cum });
  }
  return result;
}

// Rango de fecha por preset de período. Default = mes en curso + 7 días siguiente.
// Returns { from, to } como Date objects, inclusive en from y exclusive en to.
export function getPeriodRange(periodKey, customRange = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  if (periodKey === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    // Último día del mes en curso (inclusive)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { from, to };
  }
  if (periodKey === "next_30") {
    const to = new Date(today); to.setDate(to.getDate() + 31);
    return { from: today, to };
  }
  if (periodKey === "rolling_120") {
    const from = new Date(today); from.setDate(from.getDate() - 90);
    const to = new Date(today); to.setDate(to.getDate() + 31);
    return { from, to };
  }
  if (periodKey === "custom" && customRange) {
    return {
      from: new Date(customRange.from),
      to: new Date(customRange.to),
    };
  }
  // fallback
  return getPeriodRange("this_month");
}

// Color de dot por estado/proximidad. Para marcadores en el cashflow chart.
export function paymentDotColor(payment, today = new Date()) {
  if (!payment) return "#888888";
  if (payment.status === "completed" || payment.status === "paid") return "#1D9E75";
  if (!payment.due_date) return "#888888";
  const due = new Date(payment.due_date);
  due.setHours(0, 0, 0, 0);
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const daysToGo = Math.round((due - t) / 86400000);
  if (daysToGo < 0) return "#E54B4B";    // vencido
  if (daysToGo === 0) return "#E54B4B";  // hoy
  if (daysToGo <= 4) return "#F97316";   // 1-4 días — naranja intenso
  if (daysToGo <= 14) return "#F59E0B";  // 5-14 días — naranja
  return "#888888";                       // futuro lejano — gris
}

// Combina budget items pendientes + transactions pendientes en una lista
// uniforme de pagos para el período. Cada item tiene:
//   { id, due_date, amount, type, status, name, category_id, _source }
export function collectPaymentsInRange({ budgetItems = [], transactions = [], from, to }) {
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;
  const out = [];

  // Helper: resolver fecha efectiva del item
  const itemDueDate = (it) => {
    if (it.due_date) return it.due_date;
    if (it.due_day) {
      // Construir fecha en el mes actual con ese día
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth(), Math.min(it.due_day, 28));
      return d.toISOString().slice(0, 10);
    }
    return null;
  };

  for (const it of budgetItems) {
    if (it.status === "cancelled") continue;
    const dueStr = itemDueDate(it);
    if (!dueStr) continue;
    const ms = new Date(dueStr).getTime();
    if (ms < fromMs || ms >= toMs) continue;
    out.push({
      id: `bi-${it.id}`,
      due_date: dueStr,
      amount: Number(it.expected_amount || 0),
      paid_amount: Number(it.paid_amount || 0),
      type: it.type,
      status: it.status === "paid" ? "completed" : "pending",
      name: it.name,
      category_id: it.category_id,
      _source: "budget",
      _raw: it,
    });
  }

  for (const tx of transactions) {
    if (tx.status === "cancelled") continue;
    // Solo pending o overdue (los completados pueden ir como referencia visual)
    if (tx.status !== "pending" && tx.status !== "overdue" && tx.status !== "completed") continue;
    const dueStr = tx.due_date || tx.transaction_date;
    if (!dueStr) continue;
    const ms = new Date(dueStr).getTime();
    if (ms < fromMs || ms >= toMs) continue;
    // Si tiene budget_item_id, ya está representado por el budget item; saltarlo
    if (tx.budget_item_id) continue;
    out.push({
      id: `tx-${tx.id}`,
      due_date: dueStr,
      amount: Number(tx.amount || 0),
      paid_amount: tx.status === "completed" ? Number(tx.amount || 0) : 0,
      type: tx.type,
      status: tx.status,
      name: tx.description || tx.counterparty || "Pago",
      category_id: tx.category_id,
      _source: "transaction",
      _raw: tx,
    });
  }

  // Sort by due_date asc
  out.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  return out;
}

// Sumario de budget items agrupados por scope → categoría → items.
// Útil para tabla del dashboard y vista Budget.
// scopes: opcional. Si se pasa, agrupa por scopes dinámicos (incluyendo
// scopes custom creados por el user). Si no, usa los 4 legacy hardcoded.
export function budgetSummaryByCategory(budgetItems, categories, type = "expense", scopes = null) {
  const LEGACY = ["agency", "personal", "family", "content_capex"];
  // Lista de "buckets" a iterar. Cada bucket tiene un identificador key,
  // y predicates para matchear items que le pertenecen.
  const buckets = (scopes && scopes.length)
    ? scopes.map((s) => ({
        key: s.legacy_key || s.id,
        scopeId: s.id,
        legacyKey: s.legacy_key,
      }))
    : LEGACY.map((k) => ({ key: k, scopeId: null, legacyKey: k }));

  const out = [];
  for (const bucket of buckets) {
    const itemsInScope = (budgetItems || []).filter((b) => {
      if (b.type !== type) return false;
      // Match prioritario: si tanto el item como el bucket tienen scope_id,
      // comparar uuids. Si no, fallback a comparar el legacy text.
      if (b.scope_id && bucket.scopeId) return b.scope_id === bucket.scopeId;
      if (bucket.legacyKey) return b.scope === bucket.legacyKey;
      return false;
    });
    if (itemsInScope.length === 0) continue;

    // Group by category_id (null = sin categoría)
    const byCat = new Map();
    for (const it of itemsInScope) {
      const key = it.category_id || "_none";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(it);
    }

    const rows = [];
    for (const [catId, items] of byCat.entries()) {
      const cat = (categories || []).find((c) => c.id === catId);
      const expected = items.reduce((s, x) => s + Number(x.expected_amount || 0), 0);
      const paid = items.reduce((s, x) => s + Number(x.paid_amount || 0), 0);
      rows.push({
        categoryId: catId,
        name: cat?.name || "Sin categoría",
        icon: cat?.icon || "•",
        color: cat?.color || "#888",
        items: items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
        expected, paid,
      });
    }
    rows.sort((a, b) => b.expected - a.expected);

    const scopeExpected = rows.reduce((s, r) => s + r.expected, 0);
    const scopePaid = rows.reduce((s, r) => s + r.paid, 0);
    out.push({
      scope: bucket.key,
      expected: scopeExpected,
      paid: scopePaid,
      rows,
    });
  }
  out.sort((a, b) => b.expected - a.expected);
  return out;
}

// Format relativo de fecha "hoy / mañana / dentro de 3 días / hace 2 días".
export function formatRelativeDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "mañana";
  if (diffDays === -1) return "ayer";
  if (diffDays > 1 && diffDays <= 7) return `en ${diffDays}d`;
  if (diffDays < -1 && diffDays >= -7) return `hace ${Math.abs(diffDays)}d`;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}
