// Vista de transacciones: tabla con filtros + botón crear.

import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { TransactionModal } from "../modals/TransactionModal.jsx";
import { formatCOP, formatRelativeDate } from "../lib/finance_math.js";

const SCOPE_LABEL = {
  agency: "Agencia", personal: "Personal", family: "Familia", content_capex: "Content",
};
const STATUS_LABEL = {
  completed: "Pagada", pending: "Pendiente", overdue: "Vencida", cancelled: "Cancelada",
};
const STATUS_COLOR = {
  completed: "#1D9E75", pending: "#F59E0B", overdue: "#E54B4B", cancelled: "#888888",
};

export function TransactionsView({ finance }) {
  const { transactions, accounts, categories } = finance;
  const [filterType, setFilterType] = useState("all");
  const [filterScope, setFilterScope] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | transaction
  const [openModal, setOpenModal] = useState(false);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterScope !== "all" && t.scope !== filterScope) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterAccount !== "all" && t.account_id !== filterAccount) return false;
      if (q) {
        const hay = `${t.description || ""} ${t.counterparty || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterScope, filterStatus, filterAccount, search]);

  const handleOpenNew = () => {
    setEditing(null);
    setOpenModal(true);
  };
  const handleOpenEdit = (t) => {
    setEditing(t);
    setOpenModal(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filtros */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        padding: 12, borderRadius: 12, background: DS.bgCard, border: DS.border,
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar descripción, contraparte..."
          style={{ ...darkInput, flex: "1 1 240px", minWidth: 200 }}
        />
        <Select value={filterType} onChange={setFilterType} options={[
          { value: "all", label: "Todo" },
          { value: "income", label: "Ingresos" },
          { value: "expense", label: "Gastos" },
        ]} />
        <Select value={filterScope} onChange={setFilterScope} options={[
          { value: "all", label: "Todos scopes" },
          { value: "agency", label: "Agencia" },
          { value: "personal", label: "Personal" },
          { value: "family", label: "Familia" },
          { value: "content_capex", label: "Content" },
        ]} />
        <Select value={filterStatus} onChange={setFilterStatus} options={[
          { value: "all", label: "Todos estados" },
          { value: "completed", label: "Pagadas" },
          { value: "pending", label: "Pendientes" },
          { value: "overdue", label: "Vencidas" },
          { value: "cancelled", label: "Canceladas" },
        ]} />
        <Select value={filterAccount} onChange={setFilterAccount} options={[
          { value: "all", label: "Todas cuentas" },
          ...accounts.map((a) => ({ value: a.id, label: a.name })),
        ]} />
        <button
          onClick={handleOpenNew}
          disabled={accounts.length === 0}
          style={{
            padding: "8px 16px", borderRadius: 50, border: "none",
            background: accounts.length === 0 ? DS.textHint : DS.green,
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: accounts.length === 0 ? "not-allowed" : "pointer",
            fontFamily: DS.font,
          }}
          title={accounts.length === 0 ? "Creá una cuenta primero" : ""}
        >+ Nueva</button>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          {transactions.length === 0
            ? "Sin transacciones. Click en + Nueva para registrar la primera."
            : "Ninguna transacción matchea los filtros activos."}
        </div>
      ) : (
        <div style={{
          background: DS.bgCard, border: DS.border, borderRadius: 12, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "100px 50px 1fr 130px 110px 100px 110px 36px",
            padding: "10px 14px", gap: 10,
            borderBottom: `1px solid ${withAlpha(DS.textHint, "33")}`,
            fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            <div>Fecha</div>
            <div></div>
            <div>Descripción</div>
            <div>Categoría</div>
            <div>Cuenta</div>
            <div>Scope</div>
            <div style={{ textAlign: "right" }}>Monto</div>
            <div></div>
          </div>
          {/* Rows */}
          {filtered.map((t) => {
            const acc = accountById.get(t.account_id);
            const cat = t.category_id ? categoryById.get(t.category_id) : null;
            return (
              <button
                key={t.id}
                onClick={() => handleOpenEdit(t)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 50px 1fr 130px 110px 100px 110px 36px",
                  padding: "12px 14px", gap: 10,
                  width: "100%", textAlign: "left", background: "transparent", border: "none",
                  borderBottom: `1px solid ${withAlpha(DS.textHint, "18")}`,
                  cursor: "pointer", fontFamily: DS.font, color: DS.textPrimary,
                  alignItems: "center",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ fontSize: 11, color: DS.textSecondary }}>
                  {new Date(t.transaction_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                </div>
                <div style={{ fontSize: 14 }}>{t.type === "income" ? "💵" : "💸"}</div>
                <div style={{ fontSize: 12, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t.description || t.counterparty || "(sin descripción)"}
                  </div>
                  {t.counterparty && t.description && (
                    <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 1 }}>
                      {t.counterparty}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11 }}>
                  {cat ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 50,
                      background: withAlpha(cat.color, "22"), color: cat.color,
                      fontWeight: 600,
                    }}>
                      <span>{cat.icon}</span> {cat.name}
                    </span>
                  ) : <span style={{ color: DS.textMuted }}>—</span>}
                </div>
                <div style={{ fontSize: 11, color: DS.textSecondary }}>{acc?.name || "—"}</div>
                <div style={{ fontSize: 11, color: DS.textMuted }}>{SCOPE_LABEL[t.scope] || t.scope}</div>
                <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: t.type === "income" ? DS.green : DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                  {t.type === "income" ? "+" : "-"}{formatCOP(t.amount)}
                  <div style={{ fontSize: 9, fontWeight: 600, color: STATUS_COLOR[t.status], marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {STATUS_LABEL[t.status]}
                    {t.status === "pending" && t.due_date && ` · ${formatRelativeDate(t.due_date)}`}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: DS.textMuted }}>›</div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: DS.textMuted, padding: "8px 4px" }}>
        Mostrando {filtered.length} de {transactions.length} · cap: 500 más recientes
      </div>

      {openModal && (
        <TransactionModal
          transaction={editing}
          finance={finance}
          onClose={() => setOpenModal(false)}
          onSaved={() => setOpenModal(false)}
        />
      )}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...darkInput, fontSize: 12, padding: "7px 10px",
        width: "auto", minWidth: 140,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: DS.bgSide }}>{o.label}</option>
      ))}
    </select>
  );
}
