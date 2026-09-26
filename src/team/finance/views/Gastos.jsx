// Vista Gastos — tabla inline editable estilo Sheet.
//
// Reemplaza el flujo "Transactions con filtros + modal" para el caso más
// frecuente: agregar/editar gastos rápido. Cada celda se edita en sitio
// (click → input → Enter/blur guarda). Una quick-add row arriba para tirar
// gastos al vuelo. Para income o casos más raros, queda "Transacciones"
// en el dropdown Más.

import { useEffect, useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { formatCOP, parseCOP } from "../lib/finance_math.js";
import {
  EditableText, EditableAmount, EditableDate, EditableSelect, todayISO,
} from "../components/EditableCells.jsx";

const SCOPE_LABEL = {
  agency: "Agencia", personal: "Personal", family: "Familia", content_capex: "Content",
};
const STATUS_TOGGLE = {
  completed: { label: "Pagada", color: DS.green, next: "pending" },
  pending:   { label: "Pend.",  color: DS.amber, next: "completed" },
  overdue:   { label: "Vencida", color: DS.red,   next: "completed" },
  cancelled: { label: "Cancel.", color: DS.textMuted, next: "pending" },
};

const COL_TEMPLATE = "100px 1fr 130px 130px 110px 130px 32px";

export function GastosView({ finance }) {
  const { transactions, accounts, categories, createTransaction, updateTransaction, deleteTransaction } = finance;
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [showCompleted, setShowCompleted] = useState(true);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter((t) => t.type === "expense")
      .filter((t) => (scope === "all" ? true : t.scope === scope))
      .filter((t) => (showCompleted ? true : t.status !== "completed"))
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.description || ""} ${t.counterparty || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [transactions, search, scope, showCompleted]);

  const totalShown = useMemo(
    () => rows.reduce((s, t) => s + Number(t.amount || 0), 0),
    [rows]
  );

  const handleUpdate = async (id, patch) => {
    try { await updateTransaction(id, patch); }
    catch (e) { alert("No se pudo guardar: " + (e?.message || e)); }
  };
  const handleDelete = async (id) => {
    if (!confirm("¿Borrar este gasto?")) return;
    try { await deleteTransaction(id); }
    catch (e) { alert("No se pudo borrar: " + (e?.message || e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: 12, borderRadius: 12, background: DS.bgCard, border: DS.border,
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar gasto…"
          style={{ ...darkInput, flex: "1 1 240px", minWidth: 200 }}
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={{ ...darkInput, fontSize: 12, padding: "7px 10px", width: "auto", minWidth: 140 }}
        >
          <option value="all">Todos scopes</option>
          {Object.entries(SCOPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.textSecondary, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Mostrar pagadas
        </label>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: DS.textMuted }}>
          {rows.length} gasto{rows.length !== 1 ? "s" : ""} · <span style={{ color: DS.textPrimary, fontWeight: 600 }}>{formatCOP(totalShown)}</span>
        </div>
      </div>

      {/* Tabla */}
      <div style={{
        background: DS.bgCard, border: DS.border, borderRadius: 12, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: COL_TEMPLATE,
          padding: "10px 14px", gap: 10,
          borderBottom: `1px solid ${withAlpha(DS.textHint, "44")}`,
          fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          <div>Fecha</div>
          <div>Descripción</div>
          <div>Categoría</div>
          <div>Cuenta</div>
          <div>Scope</div>
          <div style={{ textAlign: "right" }}>Monto</div>
          <div></div>
        </div>

        {/* Quick-add row */}
        <QuickAddRow
          accounts={accounts}
          categories={expenseCategories}
          createTransaction={createTransaction}
          defaultScope={scope === "all" ? "agency" : scope}
        />

        {/* Rows */}
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
            {transactions.filter((t) => t.type === "expense").length === 0
              ? "Sin gastos todavía. Agregá uno arriba ↑"
              : "Ningún gasto matchea los filtros."}
          </div>
        ) : (
          rows.map((t) => (
            <ExpenseRow
              key={t.id}
              tx={t}
              accounts={accounts}
              categories={expenseCategories}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div style={{ fontSize: 11, color: DS.textMuted, padding: "4px 4px" }}>
        Tip: click en cualquier celda para editar. Enter guarda · Esc cancela.
      </div>
    </div>
  );
}

/* ───────────────── Row ───────────────── */
function ExpenseRow({ tx, accounts, categories, onUpdate, onDelete }) {
  const st = STATUS_TOGGLE[tx.status] || STATUS_TOGGLE.completed;
  const acc = accounts.find((a) => a.id === tx.account_id);
  const cat = categories.find((c) => c.id === tx.category_id);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_TEMPLATE,
      padding: "6px 10px", gap: 10,
      borderBottom: `1px solid ${withAlpha(DS.textHint, "18")}`,
      alignItems: "center",
      opacity: tx.status === "cancelled" ? 0.5 : 1,
    }}>
      <EditableDate value={tx.transaction_date} onSave={(v) => onUpdate(tx.id, { transaction_date: v })} />
      <EditableText
        value={tx.description}
        onSave={(v) => onUpdate(tx.id, { description: v })}
        placeholder="(sin descripción)"
      />
      <EditableSelect
        value={tx.category_id || ""}
        onSave={(v) => onUpdate(tx.id, { category_id: v || null })}
        options={[
          { value: "", label: "—" },
          ...categories.map((c) => ({ value: c.id, label: `${c.icon || ""} ${c.name}`.trim(), color: c.color })),
        ]}
        renderDisplay={() => cat ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 50,
            background: withAlpha(cat.color, "22"), color: cat.color,
            fontWeight: 600, fontSize: 11,
          }}>
            <span>{cat.icon}</span> {cat.name}
          </span>
        ) : <span style={{ color: DS.textMuted, fontSize: 11 }}>—</span>}
      />
      <EditableSelect
        value={tx.account_id || ""}
        onSave={(v) => onUpdate(tx.id, { account_id: v })}
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        renderDisplay={() => (
          <span style={{ fontSize: 11, color: DS.textSecondary }}>{acc?.name || "—"}</span>
        )}
      />
      <EditableSelect
        value={tx.scope || "agency"}
        onSave={(v) => onUpdate(tx.id, { scope: v })}
        options={Object.entries(SCOPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
        renderDisplay={() => (
          <span style={{ fontSize: 11, color: DS.textMuted }}>{SCOPE_LABEL[tx.scope] || tx.scope}</span>
        )}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(tx.id, { status: st.next }); }}
          title={`Estado: ${st.label}. Click para cambiar.`}
          style={{
            background: withAlpha(st.color, "22"),
            color: st.color,
            border: "none",
            padding: "2px 7px",
            borderRadius: 50,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            cursor: "pointer",
            fontFamily: DS.font,
          }}
        >{st.label.toUpperCase()}</button>
        <EditableAmount
          value={tx.amount}
          onSave={(v) => onUpdate(tx.id, { amount: v })}
        />
      </div>
      <button
        onClick={() => onDelete(tx.id)}
        title="Borrar"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 14, color: DS.textHint, padding: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = DS.red; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = DS.textHint; }}
      >✕</button>
    </div>
  );
}

/* ───────────────── Quick add ───────────────── */
function QuickAddRow({ accounts, categories, createTransaction, defaultScope }) {
  const [draft, setDraft] = useState(() => ({
    transaction_date: todayISO(),
    description: "",
    amount: "",
    account_id: accounts[0]?.id || "",
    category_id: "",
    scope: defaultScope || "agency",
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft.account_id && accounts[0]?.id) {
      setDraft((d) => ({ ...d, account_id: accounts[0].id }));
    }
  }, [accounts, draft.account_id]);

  const reset = () => setDraft({
    transaction_date: todayISO(),
    description: "",
    amount: "",
    account_id: accounts[0]?.id || "",
    category_id: "",
    scope: defaultScope || "agency",
  });

  const submit = async () => {
    const amt = parseCOP(draft.amount);
    if (!amt || amt <= 0) return;
    if (!draft.account_id) { alert("Elegí una cuenta primero."); return; }
    setSaving(true);
    try {
      await createTransaction({
        type: "expense",
        status: "completed",
        amount: amt,
        description: draft.description || null,
        transaction_date: draft.transaction_date,
        account_id: draft.account_id,
        category_id: draft.category_id || null,
        scope: draft.scope,
      });
      reset();
    } catch (e) {
      alert("No se pudo crear: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !saving) { e.preventDefault(); submit(); }
  };

  const inputStyle = {
    ...darkInput,
    fontSize: 12,
    padding: "6px 8px",
    background: withAlpha(DS.green, "0a"),
    borderColor: withAlpha(DS.green, "44"),
  };

  if (accounts.length === 0) return null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_TEMPLATE,
      padding: "8px 10px", gap: 10,
      background: withAlpha(DS.green, "08"),
      borderBottom: `1px solid ${withAlpha(DS.green, "33")}`,
      alignItems: "center",
    }}
      onKeyDown={onKeyDown}
    >
      <input
        type="date"
        value={draft.transaction_date}
        onChange={(e) => setDraft({ ...draft, transaction_date: e.target.value })}
        style={inputStyle}
      />
      <input
        placeholder="+ Nuevo gasto (descripción)…"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        style={inputStyle}
      />
      <select
        value={draft.category_id}
        onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
        style={inputStyle}
      >
        <option value="">— Categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
        ))}
      </select>
      <select
        value={draft.account_id}
        onChange={(e) => setDraft({ ...draft, account_id: e.target.value })}
        style={inputStyle}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select
        value={draft.scope}
        onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
        style={inputStyle}
      >
        {Object.entries(SCOPE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <input
        placeholder="$0"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        style={{ ...inputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      />
      <button
        onClick={submit}
        disabled={saving || !parseCOP(draft.amount)}
        title="Enter para guardar"
        style={{
          background: parseCOP(draft.amount) ? DS.green : DS.textHint,
          color: "#fff",
          border: "none", borderRadius: 6,
          width: 28, height: 28,
          cursor: parseCOP(draft.amount) ? "pointer" : "not-allowed",
          fontSize: 14, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >{saving ? "…" : "+"}</button>
    </div>
  );
}

// EditableCells y todayISO viven en ../components/EditableCells.jsx (extraídos
// para reuso por Cuaderno y otras vistas sheet-like).
