// Hook central de Finance OS. Carga todas las tablas y se suscribe a realtime.
//
// Devuelve { accounts, categories, clients, teamCosts, subscriptions,
//   transactions, debts, goals, loading, reload, ...mutators }.
//
// MVP: un solo channel con 8 subscripciones — cualquier change recarga toda
// la tabla afectada. No es óptimo pero es simple y suficiente para 1 user.

import { useCallback, useEffect, useState } from "react";
import { database } from "../../../lib/backend.js";
import * as db from "../data/financeDb.js";

const TABLES = [
  "finance_accounts",
  "finance_categories",
  "finance_clients",
  "finance_team_costs",
  "finance_subscriptions",
  "finance_transactions",
  "finance_debts",
  "finance_goals",
  "finance_actions",
  "finance_ai_conversations",
  "finance_budget_items",
  "finance_scopes",
  "finance_petty_expenses",
];

export function useFinance() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [teamCosts, setTeamCosts] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [actions, setActions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [pettyExpenses, setPettyExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, cRes, clRes, tcRes, sRes, txRes, dRes, gRes, actRes, convRes, biRes, scRes, peRes] = await Promise.all([
      db.listAccounts(),
      db.listCategories(),
      db.listClients(),
      db.listTeamCosts(),
      db.listSubscriptions(),
      db.listTransactions(),
      db.listDebts(),
      db.listGoals(),
      db.listActions(),
      db.listConversations(),
      db.listBudgetItems(),
      db.listScopes(),
      db.listPettyExpenses(),
    ]);
    setAccounts(aRes.data || []);
    setCategories(cRes.data || []);
    setClients(clRes.data || []);
    setTeamCosts(tcRes.data || []);
    setSubscriptions(sRes.data || []);
    setTransactions(txRes.data || []);
    setDebts(dRes.data || []);
    setGoals(gRes.data || []);
    setActions(actRes.data || []);
    setConversations(convRes.data || []);
    setBudgetItems(biRes.data || []);
    setScopes(scRes.data || []);
    setPettyExpenses(peRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database.channel("finance_os");
    for (const t of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        () => load()
      );
    }
    channel.subscribe();
    return () => { database.removeChannel(channel); };
  }, [load]);

  // Mutators — refrescan el state local optimisticamente, realtime hace el resto.
  const wrap = (fn, list, setList) => async (...args) => {
    const res = await fn(...args);
    if (res.error) throw res.error;
    if (res.data) setList((prev) => [res.data, ...prev]);
    return res.data;
  };
  const wrapUpdate = (fn, setList) => async (id, patch) => {
    const res = await fn(id, patch);
    if (res.error) throw res.error;
    if (res.data) setList((prev) => prev.map((x) => x.id === id ? res.data : x));
    return res.data;
  };
  const wrapDelete = (fn, setList) => async (id) => {
    const res = await fn(id);
    if (res.error) throw res.error;
    setList((prev) => prev.filter((x) => x.id !== id));
  };

  // Recarga solo la tabla de accounts. Útil tras operaciones que afectan
  // current_balance (createTransaction, updateTransaction, deleteTransaction,
  // payBudgetItem, createPettyExpense, deletePettyExpense).
  const refreshAccounts = useCallback(async () => {
    const res = await db.listAccounts();
    if (res.data) setAccounts(res.data);
  }, []);
  // Wrappers que también refrescan accounts tras el mutador.
  const wrapTx = (fn, setList) => async (...args) => {
    const res = await fn(...args);
    if (res.error) throw res.error;
    if (res.data) setList((prev) => [res.data, ...prev]);
    await refreshAccounts();
    return res.data;
  };
  const wrapUpdateTx = (fn, setList) => async (id, patch) => {
    const res = await fn(id, patch);
    if (res.error) throw res.error;
    if (res.data) setList((prev) => prev.map((x) => x.id === id ? res.data : x));
    await refreshAccounts();
    return res.data;
  };
  const wrapDeleteTx = (fn, setList) => async (id) => {
    const res = await fn(id);
    if (res.error) throw res.error;
    setList((prev) => prev.filter((x) => x.id !== id));
    await refreshAccounts();
  };

  return {
    accounts, categories, clients, teamCosts,
    subscriptions, transactions, debts, goals,
    actions, conversations, budgetItems,
    scopes, pettyExpenses,
    loading, reload: load,
    // Actions
    createAction: wrap(db.createAction, actions, setActions),
    updateAction: wrapUpdate(db.updateAction, setActions),
    deleteAction: wrapDelete(db.deleteAction, setActions),
    // Conversations
    createConversation: wrap(db.createConversation, conversations, setConversations),
    updateConversation: wrapUpdate(db.updateConversation, setConversations),
    archiveConversation: wrapDelete(db.archiveConversation, setConversations),
    // Accounts
    createAccount: wrap(db.createAccount, accounts, setAccounts),
    updateAccount: wrapUpdate(db.updateAccount, setAccounts),
    deleteAccount: wrapDelete(db.deleteAccount, setAccounts),
    // Categories
    createCategory: wrap(db.createCategory, categories, setCategories),
    updateCategory: wrapUpdate(db.updateCategory, setCategories),
    deleteCategory: wrapDelete(db.deleteCategory, setCategories),
    // Clients
    createClient: wrap(db.createClient, clients, setClients),
    updateClient: wrapUpdate(db.updateClient, setClients),
    deleteClient: wrapDelete(db.deleteClient, setClients),
    // Team costs
    createTeamCost: wrap(db.createTeamCost, teamCosts, setTeamCosts),
    updateTeamCost: wrapUpdate(db.updateTeamCost, setTeamCosts),
    deleteTeamCost: wrapDelete(db.deleteTeamCost, setTeamCosts),
    // Subscriptions
    createSubscription: wrap(db.createSubscription, subscriptions, setSubscriptions),
    updateSubscription: wrapUpdate(db.updateSubscription, setSubscriptions),
    deleteSubscription: wrapDelete(db.deleteSubscription, setSubscriptions),
    // Transactions (refrescan accounts porque afectan current_balance)
    createTransaction: wrapTx(db.createTransaction, setTransactions),
    updateTransaction: wrapUpdateTx(db.updateTransaction, setTransactions),
    deleteTransaction: wrapDeleteTx(db.deleteTransaction, setTransactions),
    // Debts
    createDebt: wrap(db.createDebt, debts, setDebts),
    updateDebt: wrapUpdate(db.updateDebt, setDebts),
    deleteDebt: wrapDelete(db.deleteDebt, setDebts),
    // Goals
    createGoal: wrap(db.createGoal, goals, setGoals),
    updateGoal: wrapUpdate(db.updateGoal, setGoals),
    deleteGoal: wrapDelete(db.deleteGoal, setGoals),
    // Budget items
    createBudgetItem: wrap(db.createBudgetItem, budgetItems, setBudgetItems),
    updateBudgetItem: wrapUpdate(db.updateBudgetItem, setBudgetItems),
    deleteBudgetItem: wrapDelete(db.deleteBudgetItem, setBudgetItems),
    payBudgetItem: async (item, opts) => {
      const res = await db.payBudgetItem(item, opts);
      if (res.error) throw res.error;
      await load();
      return res.data;
    },
    // Scopes
    createScope: wrap(db.createScope, scopes, setScopes),
    updateScope: wrapUpdate(db.updateScope, setScopes),
    archiveScope: wrapDelete(db.archiveScope, setScopes),
    // Petty expenses
    createPettyExpense: async (payload) => {
      const res = await db.createPettyExpense(payload);
      if (res.error) throw res.error;
      await load(); // refresh para tener transaction nueva
      return res.data;
    },
    deletePettyExpense: wrapDeleteTx(db.deletePettyExpense, setPettyExpenses),
    // Reset / wipe — borra todos los datos transaccionales
    wipeFinanceData: async (opts) => {
      const res = await db.wipeFinanceData(opts);
      if (res.error) throw res.error;
      await load();
      return res.data;
    },
  };
}
