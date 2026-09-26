// Modal full-feature para crear o editar un budget item.
// Reemplaza el CreateItemRow simple (solo nombre/total/día).

import { useMemo, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";

export function BudgetItemModal({
  item,             // null para crear, item existente para editar
  type = "expense", // "expense" | "income"
  initialScope,     // legacy_key del scope precargado (ej "agency")
  initialCategoryId,
  finance,
  onClose,
}) {
  const isEdit = !!item;
  const { scopes, categories, accounts, clients } = finance;

  const [name, setName] = useState(item?.name || "");
  const [expectedAmount, setExpectedAmount] = useState(item?.expected_amount || 0);
  const [paidAmount, setPaidAmount] = useState(item?.paid_amount || 0);
  const [dueDay, setDueDay] = useState(item?.due_day || "");
  const [dueDate, setDueDate] = useState(item?.due_date || "");
  const [paymentType, setPaymentType] = useState(item?.payment_type || (item?.due_date ? "one_time" : "recurring"));
  const [scopeId, setScopeId] = useState(() => {
    if (item?.scope_id) return item.scope_id;
    if (item?.scope) {
      const found = scopes.find((s) => s.legacy_key === item.scope);
      if (found) return found.id;
    }
    if (initialScope) {
      const found = scopes.find((s) => s.legacy_key === initialScope);
      if (found) return found.id;
    }
    return scopes[0]?.id || "";
  });
  const [categoryId, setCategoryId] = useState(item?.category_id || initialCategoryId || "");
  const [accountId, setAccountId] = useState(item?.account_id || "");
  const [clientId, setClientId] = useState(item?.client_id || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Scopes filtrados por tipo
  const eligibleScopes = useMemo(() => {
    return (scopes || []).filter((s) => type === "income" ? s.allow_income : s.allow_expense);
  }, [scopes, type]);

  // Scope seleccionado
  const scope = scopes.find((s) => s.id === scopeId);

  // Categorías filtradas por scope (matching scope_id o legacy_key + scope text)
  const availableCategories = useMemo(() => {
    return (categories || [])
      .filter((c) => c.type === type)
      .filter((c) => {
        if (c.scope_id) return c.scope_id === scopeId;
        return scope?.legacy_key && c.scope === scope.legacy_key;
      });
  }, [categories, scopeId, scope, type]);

  // Categorías root + subcategorías indentadas (orden de árbol)
  const categoryOptions = useMemo(() => {
    const roots = availableCategories.filter((c) => !c.parent_category_id);
    const childrenByParent = new Map();
    for (const c of availableCategories) {
      if (c.parent_category_id) {
        if (!childrenByParent.has(c.parent_category_id)) childrenByParent.set(c.parent_category_id, []);
        childrenByParent.get(c.parent_category_id).push(c);
      }
    }
    const out = [];
    for (const r of roots) {
      out.push({ ...r, _depth: 0 });
      const kids = childrenByParent.get(r.id) || [];
      for (const k of kids) out.push({ ...k, _depth: 1 });
    }
    return out;
  }, [availableCategories]);

  // Si cambia scope y la categoría seleccionada ya no aplica, resetear
  useMemo(() => {
    if (categoryId && !availableCategories.find((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [availableCategories, categoryId]);

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido"); return; }
    if (!expectedAmount || expectedAmount <= 0) { setError("Total esperado debe ser > 0"); return; }
    if (!scopeId) { setError("Elegí una sección"); return; }
    setSaving(true); setError("");
    const payload = {
      type, name: name.trim(),
      expected_amount: expectedAmount,
      paid_amount: paidAmount,
      payment_type: paymentType,
      due_day: paymentType === "recurring" && dueDay ? Math.max(1, Math.min(31, Number(dueDay))) : null,
      due_date: paymentType === "one_time" && dueDate ? dueDate : null,
      scope_id: scopeId,
      scope: scope?.legacy_key || null,
      category_id: categoryId || null,
      account_id: accountId || null,
      client_id: clientId || null,
      notes: notes.trim() || null,
      status: paidAmount >= expectedAmount && expectedAmount > 0
        ? "paid"
        : paidAmount > 0 ? "partial" : "planned",
    };
    try {
      if (isEdit) await finance.updateBudgetItem(item.id, payload);
      else await finance.createBudgetItem(payload);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!window.confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await finance.deleteBudgetItem(item.id);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "60px 20px", zIndex: 9999, fontFamily: DS.font,
    }}>
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18,
        padding: 24, width: "100%", maxWidth: 540, color: DS.textPrimary,
        maxHeight: "calc(100vh - 120px)", overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {isEdit ? "Editar item" : "Nuevo item"} {type === "income" ? "de ingreso" : "de gasto"}
        </div>
        <div style={{ fontSize: 11, color: DS.textSecondary, marginBottom: 16 }}>
          {scope ? `Sección: ${scope.icon} ${scope.name}` : "Elegí sección"}
        </div>

        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Nath, Supa Base, Vital Bio…" style={darkInput} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={type === "income" ? "Total esperado" : "Total a pagar"}>
            <AmountInput value={expectedAmount} onChange={setExpectedAmount} />
          </Field>
          <Field label={type === "income" ? "Ya recibido" : "Ya pagado"}>
            <AmountInput value={paidAmount} onChange={setPaidAmount} />
          </Field>
        </div>

        <Field label="Tipo de pago">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "recurring", label: "🔁 Recurrente (mensual)" },
              { v: "one_time",  label: "1️⃣ Único" },
            ].map((o) => {
              const active = paymentType === o.v;
              return (
                <button key={o.v} onClick={() => setPaymentType(o.v)} style={{
                  flex: 1, padding: "7px 12px", borderRadius: 50,
                  border: `1px solid ${active ? DS.blue : DS.textHint}`,
                  background: active ? `${DS.blue}22` : "transparent",
                  color: active ? DS.blue : DS.textSecondary,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}>{o.label}</button>
              );
            })}
          </div>
        </Field>

        {paymentType === "recurring" ? (
          <Field label="Día del mes en que se cobra/paga (1-31)">
            <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="Ej: 30" style={{ ...darkInput, width: 100 }} />
          </Field>
        ) : (
          <Field label="Fecha exacta">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={darkInput} />
          </Field>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Sección">
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
              {eligibleScopes.map((s) => (
                <option key={s.id} value={s.id} style={{ background: DS.bgSide }}>{s.icon} {s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoría (opcional)">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
              <option value="" style={{ background: DS.bgSide }}>— Sin categoría —</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id} style={{ background: DS.bgSide }}>
                  {c._depth > 0 ? "▸ " : ""}{c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Cuenta sugerida (opcional)">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
            <option value="" style={{ background: DS.bgSide }}>— Sin cuenta predeterminada —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} style={{ background: DS.bgSide }}>{a.icon} {a.name}</option>
            ))}
          </select>
        </Field>

        {type === "income" && clients.length > 0 && (
          <Field label="Cliente vinculado (opcional)">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...darkInput, fontSize: 13 }}>
              <option value="" style={{ background: DS.bgSide }}>— Sin cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} style={{ background: DS.bgSide }}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Notas (opcional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...darkInput, resize: "vertical", fontFamily: DS.font }} />
        </Field>

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.4)",
            color: DS.red, fontSize: 12, marginBottom: 14,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
          {isEdit ? (
            <button onClick={handleDelete} disabled={saving} style={{ ...darkBtnGhost, color: DS.red, borderColor: "rgba(226,75,74,0.4)" }}>
              Eliminar
            </button>
          ) : <div />}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={darkBtnGhost}>Cancelar</button>
            <button onClick={submit} disabled={saving || !name.trim() || !expectedAmount} style={{ ...darkBtn, opacity: saving || !name.trim() || !expectedAmount ? 0.5 : 1 }}>
              {saving ? "Guardando..." : (isEdit ? "Guardar" : "Crear item")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.12em", marginBottom: 5, textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}
