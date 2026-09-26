// Inforce Finance OS — entry point.
//
// 3 tabs primarias visibles (Dashboard / Presupuesto / AI Advisor) + dropdown
// "Más" para las 9 secundarias. data-finance-active flag para esconder widgets
// flotantes del portal (campanita, Feedback button) que tapan los FABs.

import { useEffect, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { useFinance } from "./hooks/useFinance.js";
import { Dashboard } from "./views/Dashboard.jsx";
import { Cuaderno } from "./views/Cuaderno.jsx";
import { GastosView } from "./views/Gastos.jsx";
import { TransactionsView } from "./views/Transactions.jsx";
import { ClientsView } from "./views/Clients.jsx";
import { SubscriptionsView } from "./views/Subscriptions.jsx";
import { TeamCostsView } from "./views/TeamCosts.jsx";
import { DebtsView } from "./views/Debts.jsx";
import { GoalsView } from "./views/Goals.jsx";
import { AccountsView } from "./views/Accounts.jsx";
import { CategoriesView } from "./views/Categories.jsx";
import { AIAdvisorChat } from "./views/AIAdvisorChat.jsx";
import { ActionsView } from "./views/Actions.jsx";
import { BudgetView } from "./views/Budget.jsx";
import { DropdownMenu } from "./components/DropdownMenu.jsx";

const PRIMARY_TABS = [
  { key: "cuaderno",  label: "Cuaderno",    icon: "📒" },
  { key: "accounts",  label: "Cuentas",     icon: "🏦" },
];

const SECONDARY_TABS = [
  { key: "dashboard",     label: "Dashboard KPIs",          icon: "📊" },
  { key: "gastos",        label: "Gastos (lista plana)",    icon: "💸" },
  { key: "budget",        label: "Presupuesto",             icon: "📋" },
  { key: "advisor",       label: "AI Advisor",              icon: "🤖" },
  { key: "actions",       label: "Acciones",                icon: "⚡" },
  { key: "transactions",  label: "Transacciones (todas)",   icon: "📋" },
  { key: "clients",       label: "Clientes",                icon: "🤝" },
  { key: "subscriptions", label: "Suscripciones",           icon: "🔧" },
  { key: "team",          label: "Equipo",                  icon: "👥" },
  { key: "debts",         label: "Deudas",                  icon: "💳" },
  { key: "goals",         label: "Metas",                   icon: "🎯" },
  { key: "categories",    label: "Categorías y secciones",  icon: "🏷️" },
];

export function FinancePage({ currentMember }) {
  const [tab, setTab] = useState("cuaderno");
  const finance = useFinance();

  // Flag global para que CSS targeted esconda los widgets de feedback
  // que tapan los FABs.
  useEffect(() => {
    document.body.setAttribute("data-finance-active", "true");
    return () => document.body.removeAttribute("data-finance-active");
  }, []);

  const activeSecondary = SECONDARY_TABS.find((t) => t.key === tab);

  if (finance.loading) {
    return (
      <div style={{ padding: "60px 32px", color: DS.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>
        CARGANDO TUS FINANZAS…
      </div>
    );
  }

  return (
    <div style={{ padding: "26px 32px 80px", fontFamily: DS.font, color: DS.textPrimary }}>
      {/* CSS para esconder widgets de feedback que tapan los FABs */}
      <style>{`
        body[data-finance-active="true"] [aria-label*="Feedback" i],
        body[data-finance-active="true"] iframe[src*="feedback" i],
        body[data-finance-active="true"] [data-vercel-feedback-button],
        body[data-finance-active="true"] [class*="feedback-launcher" i],
        body[data-finance-active="true"] button[title*="Feedback" i],
        body[data-finance-active="true"] [class*="anthropic-feedback" i],
        body[data-finance-active="true"] [data-feedback-launcher],
        body[data-finance-active="true"] [aria-label*="notification" i] {
          display: none !important;
        }
      `}</style>

      {/* Header */}
      <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
        💰 Finanzas
      </h1>

      {/* Sub nav: 3 primarias + dropdown Más */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 22,
      }}>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: DS.bgCard, border: DS.border, borderRadius: 50,
        }}>
          {PRIMARY_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "7px 14px", borderRadius: 50, border: "none",
                  background: active ? DS.bgSide : "transparent",
                  color: active ? DS.textPrimary : DS.textSecondary,
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: DS.font,
                  letterSpacing: "0.01em", whiteSpace: "nowrap",
                }}
              >
                <span style={{ marginRight: 6 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        <DropdownMenu
          items={SECONDARY_TABS}
          onSelect={setTab}
          activeKey={activeSecondary?.key}
          trigger={({ open, onClick }) => (
            <button
              onClick={onClick}
              style={{
                padding: "8px 14px", borderRadius: 50,
                border: `1px solid ${activeSecondary ? withAlpha(DS.green, "55") : DS.textHint}`,
                background: activeSecondary ? withAlpha(DS.green, "12") : "transparent",
                color: activeSecondary ? DS.textPrimary : DS.textSecondary,
                fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: DS.font,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span>⋯</span>
              <span>{activeSecondary ? `Más › ${activeSecondary.label}` : "Más"}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
            </button>
          )}
        />
      </div>

      {/* Render view */}
      {tab === "cuaderno"      && <Cuaderno finance={finance} />}
      {tab === "dashboard"     && <Dashboard finance={finance} onNavigate={setTab} />}
      {tab === "gastos"        && <GastosView finance={finance} />}
      {tab === "accounts"      && <AccountsView finance={finance} />}
      {tab === "budget"        && <BudgetView finance={finance} />}
      {tab === "advisor"       && <AIAdvisorChat finance={finance} />}
      {tab === "actions"       && <ActionsView finance={finance} />}
      {tab === "transactions"  && <TransactionsView finance={finance} />}
      {tab === "clients"       && <ClientsView finance={finance} />}
      {tab === "subscriptions" && <SubscriptionsView finance={finance} />}
      {tab === "team"          && <TeamCostsView finance={finance} />}
      {tab === "debts"         && <DebtsView finance={finance} />}
      {tab === "goals"         && <GoalsView finance={finance} />}
      {tab === "categories"    && <CategoriesView finance={finance} />}
    </div>
  );
}
