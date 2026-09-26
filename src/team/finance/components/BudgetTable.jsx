// BudgetTable v6 — diseño plano estilo Google Sheets.
//
// Agrupa solo por scope (no por categoría). Una fila por budget item con
// columnas: nombre · pagado · fecha · total · acciones.
//
// Para crear un item: la última row de cada scope es editable inline
// (Tab para moverte, Enter guarda). Para detalles avanzados (categoría,
// cuenta sugerida, cliente, notas) → click en ✎ abre BudgetItemModal.

import { useMemo, useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { formatCOP, formatCOPCompact, parseCOP } from "../lib/finance_math.js";
import { PayBudgetItemModal } from "../modals/PayBudgetItemModal.jsx";
import { BudgetItemModal } from "../modals/BudgetItemModal.jsx";
import { CategoryModal } from "../modals/CategoryModal.jsx";

const LEGACY_SCOPE_LABEL = {
  agency: "🏢 Agencia",
  personal: "🧍 Personal",
  family: "👨‍👩‍👧 Familia",
  content_capex: "🎥 Content CapEx",
};
const LEGACY_SCOPE_COLOR = {
  agency: "#3B82F6",
  personal: "#A855F7",
  family: "#F97316",
  content_capex: "#D4A93B",
};

function scopeMeta(scope, scopesList) {
  if (scope?.id) {
    return {
      key: scope.legacy_key || scope.id,
      label: `${scope.icon} ${scope.name}`,
      color: scope.color,
      scopeId: scope.id,
      legacyKey: scope.legacy_key,
    };
  }
  // fallback legacy
  return {
    key: scope,
    label: LEGACY_SCOPE_LABEL[scope] || scope,
    color: LEGACY_SCOPE_COLOR[scope] || "#888",
    scopeId: null,
    legacyKey: scope,
  };
}

export function BudgetTable({ finance, type = "expense", showHeader = true }) {
  const { budgetItems, scopes } = finance;
  const [editingItem, setEditingItem] = useState(null);
  const [payingItem, setPayingItem] = useState(null);
  const [creatingCategoryFor, setCreatingCategoryFor] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Lista de scopes a renderizar — del DB, con fallback legacy si no hay
  const renderScopes = useMemo(() => {
    if (scopes && scopes.length) {
      // Solo mostramos scopes que permitan el tipo correspondiente
      return scopes.filter((s) => type === "income" ? s.allow_income !== false : s.allow_expense !== false);
    }
    return Object.keys(LEGACY_SCOPE_LABEL).map((k) => ({ legacy_key: k }));
  }, [scopes, type]);

  // Para cada scope, lista de sus items
  const itemsByScope = useMemo(() => {
    const map = new Map();
    for (const s of renderScopes) {
      const meta = scopeMeta(s, scopes);
      const items = (budgetItems || []).filter((b) => {
        if (b.type !== type) return false;
        if (b.scope_id && meta.scopeId) return b.scope_id === meta.scopeId;
        return b.scope === meta.legacyKey;
      });
      items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      map.set(meta.key, { meta, items });
    }
    return map;
  }, [renderScopes, budgetItems, type, scopes]);

  // Totales globales
  const totalExpected = useMemo(() => {
    let s = 0;
    for (const { items } of itemsByScope.values()) {
      for (const it of items) s += Number(it.expected_amount || 0);
    }
    return s;
  }, [itemsByScope]);
  const totalPaid = useMemo(() => {
    let s = 0;
    for (const { items } of itemsByScope.values()) {
      for (const it of items) s += Number(it.paid_amount || 0);
    }
    return s;
  }, [itemsByScope]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = (budgetItems || []).filter((b) => selectedIds.has(b.id));

  const handleBulkMarkPaid = async () => {
    if (!window.confirm(`¿Marcar ${selectedItems.length} items como pagados (sin crear transacciones)?`)) return;
    try {
      await Promise.all(
        selectedItems.map((it) =>
          finance.updateBudgetItem(it.id, {
            paid_amount: Number(it.expected_amount || 0),
            status: "paid",
          })
        )
      );
      clearSelection();
    } catch (e) { alert("Error: " + e.message); }
  };
  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Eliminar ${selectedItems.length} items? No se puede deshacer.`)) return;
    try {
      await Promise.all(selectedItems.map((it) => finance.deleteBudgetItem(it.id)));
      clearSelection();
    } catch (e) { alert("Error: " + e.message); }
  };

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
      position: "relative",
    }}>
      {/* Bulk action bar */}
      {selectedItems.length > 0 && (
        <div style={{
          marginBottom: 12,
          padding: "8px 12px", borderRadius: 10,
          background: withAlpha(DS.blue, "18"),
          border: `1px solid ${withAlpha(DS.blue, "55")}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}>
            {selectedItems.length} seleccionado{selectedItems.length !== 1 ? "s" : ""}
          </span>
          <button onClick={handleBulkMarkPaid} style={{
            padding: "5px 12px", borderRadius: 50,
            border: `1px solid ${withAlpha(DS.green, "55")}`,
            background: withAlpha(DS.green, "12"),
            color: DS.green, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
          }}>✓ Marcar pagados</button>
          <button onClick={handleBulkDelete} style={{
            padding: "5px 12px", borderRadius: 50,
            border: `1px solid ${withAlpha(DS.red, "55")}`,
            background: "transparent",
            color: DS.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
          }}>✕ Borrar</button>
          <span style={{ flex: 1 }} />
          <button onClick={clearSelection} style={{
            padding: "5px 10px", borderRadius: 50, border: "none", background: "transparent",
            color: DS.textMuted, fontSize: 11, cursor: "pointer", fontFamily: DS.font,
          }}>Limpiar</button>
        </div>
      )}

      {showHeader && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: DS.textMuted,
            }}>
              {type === "expense" ? "Gastos" : "Ingresos"}
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
              {type === "expense" ? "Lo que tenés que pagar este mes" : "Lo que esperás cobrar este mes"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontSize: 10, color: DS.textMuted }}>Pagado</div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: DS.textSecondary,
              fontVariantNumeric: "tabular-nums",
            }}>{formatCOP(totalPaid)}</div>
            <div style={{ fontSize: 10, color: DS.textMuted, marginLeft: 8 }}>Total</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: type === "expense" ? DS.red : DS.green,
              fontVariantNumeric: "tabular-nums",
            }}>{formatCOP(totalExpected)}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from(itemsByScope.values()).map(({ meta, items }) => (
          <ScopeBlock
            key={meta.key}
            meta={meta}
            items={items}
            type={type}
            finance={finance}
            onEdit={setEditingItem}
            onPay={setPayingItem}
            onCreateCategory={() => setCreatingCategoryFor({ scope: meta })}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {/* Modal full-feature para editar item */}
      {editingItem && (
        <BudgetItemModal
          item={editingItem}
          type={type}
          finance={finance}
          onClose={() => setEditingItem(null)}
        />
      )}

      {payingItem && (
        <PayBudgetItemModal
          item={payingItem}
          finance={finance}
          onClose={() => setPayingItem(null)}
        />
      )}

      {creatingCategoryFor && (
        <CategoryModal
          category={null}
          finance={finance}
          initialScope={creatingCategoryFor.scope.legacyKey || creatingCategoryFor.scope.scopeId || creatingCategoryFor.scope.key}
          initialType={type}
          onClose={() => setCreatingCategoryFor(null)}
        />
      )}
    </div>
  );
}

// Una sección por scope: header + tabla plana + row inline de creación.
function ScopeBlock({ meta, items, type, finance, onEdit, onPay, onCreateCategory, selectedIds, onToggleSelect }) {
  const [collapsed, setCollapsed] = useState(false);
  const expected = items.reduce((s, it) => s + Number(it.expected_amount || 0), 0);
  const paid = items.reduce((s, it) => s + Number(it.paid_amount || 0), 0);
  const color = meta.color;

  // Categorías disponibles para este scope+tipo (para el quick picker de cada row).
  const scopeCategories = (finance.categories || []).filter((c) => {
    if (c.type !== type) return false;
    if (c.scope_id && meta.scopeId) return c.scope_id === meta.scopeId;
    return c.scope === meta.legacyKey;
  });

  return (
    <div>
      {/* Header del scope */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 10,
          border: `1px solid ${withAlpha(color, "33")}`,
          background: withAlpha(color, "10"),
          color: DS.textPrimary,
          cursor: "pointer", fontFamily: DS.font,
          display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        }}
      >
        <span style={{ fontSize: 11, color: DS.textMuted }}>{collapsed ? "▸" : "▼"}</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{meta.label}</span>
        <span style={{ fontSize: 10, color: DS.textMuted }}>pagado</span>
        <span style={{ fontSize: 12, color: DS.textSecondary, fontVariantNumeric: "tabular-nums" }}>{formatCOPCompact(paid)}</span>
        <span style={{ fontSize: 10, color: DS.textMuted }}>·</span>
        <span style={{ fontSize: 10, color: DS.textMuted }}>total</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {formatCOPCompact(expected)}
        </span>
      </button>

      {!collapsed && (
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          {/* Header tabla */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "22px 1.4fr 110px 95px 70px 100px 80px",
            gap: 8, padding: "4px 10px",
            fontSize: 9, fontWeight: 700, color: DS.textMuted,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <div></div>
            <div>Nombre</div>
            <div>Categoría</div>
            <div style={{ textAlign: "right" }}>Pagado</div>
            <div style={{ textAlign: "right" }}>Fecha</div>
            <div style={{ textAlign: "right" }}>Total</div>
            <div></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((item) => (
              <BudgetRow
                key={item.id}
                item={item}
                finance={finance}
                scopeCategories={scopeCategories}
                onCreateCategory={onCreateCategory}
                onPay={() => onPay(item)}
                onEdit={() => onEdit(item)}
                selected={selectedIds?.has(item.id) || false}
                onToggleSelect={onToggleSelect ? () => onToggleSelect(item.id) : null}
              />
            ))}
            <CreateInlineRow
              scopeMeta={meta}
              type={type}
              finance={finance}
              scopeCategories={scopeCategories}
              onCreateCategory={onCreateCategory}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Row de un budget item — editable inline en todas las columnas.
function BudgetRow({ item, finance, scopeCategories = [], onCreateCategory, onPay, onEdit, selected, onToggleSelect }) {
  const [editingField, setEditingField] = useState(null);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const category = item.category_id
    ? (finance.categories || []).find((c) => c.id === item.category_id)
    : null;

  const handleUpdate = async (patch) => {
    try {
      await finance.updateBudgetItem(item.id, patch);
    } catch (e) {
      alert("No se pudo actualizar: " + e.message);
    }
    setEditingField(null);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await finance.deleteBudgetItem(item.id);
    } catch (err) {
      alert("No se pudo eliminar: " + err.message);
    }
  };

  const isPaid = item.status === "paid";
  const dateValue = item.payment_type === "one_time" ? item.due_date : item.due_day;

  const handleSelectCategory = (catId) => {
    handleUpdate({ category_id: catId });
    setCatPickerOpen(false);
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "22px 1.4fr 110px 95px 70px 100px 80px",
      gap: 8, padding: "6px 10px",
      alignItems: "center",
      background: selected ? withAlpha(DS.blue, "14") : "rgba(0,0,0,0.10)",
      borderRadius: 6,
      opacity: isPaid ? 0.7 : 1,
      transition: "background 0.12s",
    }}>
      {onToggleSelect ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 14, height: 14, cursor: "pointer" }}
        />
      ) : <div />}
      <EditableCell
        value={item.name}
        editing={editingField === "name"}
        onStart={() => setEditingField("name")}
        onSave={(v) => handleUpdate({ name: v })}
        onCancel={() => setEditingField(null)}
        type="text"
        style={{ fontSize: 12, fontWeight: 500, color: DS.textPrimary }}
      />
      {/* Categoría chip + picker */}
      <div style={{ position: "relative" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setCatPickerOpen((v) => !v); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 8px", borderRadius: 50,
            border: category
              ? `1px solid ${withAlpha(category.color || "#888", "55")}`
              : `1px dashed ${DS.textHint}`,
            background: category ? withAlpha(category.color || "#888", "14") : "transparent",
            color: category ? DS.textPrimary : DS.textMuted,
            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {category ? <><span>{category.icon}</span> {category.name}</> : "+ categoría"}
        </button>
        {catPickerOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 8,
              padding: 4, minWidth: 220, zIndex: 100,
              maxHeight: 280, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <button
              onClick={() => handleSelectCategory(null)}
              style={{
                display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                border: "none", background: "transparent", color: DS.textMuted,
                fontSize: 11, cursor: "pointer", fontFamily: DS.font, borderRadius: 6,
              }}
            >— Sin categoría —</button>
            {scopeCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCategory(c.id)}
                style={{
                  display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                  border: "none", background: "transparent",
                  color: c.id === item.category_id ? c.color : DS.textPrimary,
                  fontWeight: c.id === item.category_id ? 700 : 500,
                  fontSize: 11, cursor: "pointer", fontFamily: DS.font, borderRadius: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >{c.icon} {c.name}</button>
            ))}
            {onCreateCategory && (
              <button
                onClick={() => { setCatPickerOpen(false); onCreateCategory(); }}
                style={{
                  display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                  border: "none", background: "transparent", color: DS.blue,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  borderTop: `1px solid ${withAlpha(DS.textHint, "22")}`,
                  marginTop: 4, paddingTop: 8,
                }}
              >+ Nueva categoría</button>
            )}
          </div>
        )}
      </div>
      <EditableCell
        value={Number(item.paid_amount || 0)}
        editing={editingField === "paid_amount"}
        onStart={() => setEditingField("paid_amount")}
        onSave={(v) => handleUpdate({ paid_amount: v })}
        onCancel={() => setEditingField(null)}
        type="cop"
        align="right"
        style={{ fontSize: 11, color: Number(item.paid_amount) > 0 ? DS.green : DS.textMuted }}
      />
      <EditableCell
        value={dateValue || ""}
        editing={editingField === "date"}
        onStart={() => setEditingField("date")}
        onSave={(v) => {
          if (item.payment_type === "one_time") {
            handleUpdate({ due_date: v || null });
          } else {
            const n = v ? Math.max(1, Math.min(31, Number(v))) : null;
            handleUpdate({ due_day: n });
          }
        }}
        onCancel={() => setEditingField(null)}
        type={item.payment_type === "one_time" ? "date" : "number"}
        align="right"
        placeholder="—"
        style={{ fontSize: 11, color: DS.textSecondary }}
      />
      <EditableCell
        value={Number(item.expected_amount || 0)}
        editing={editingField === "expected_amount"}
        onStart={() => setEditingField("expected_amount")}
        onSave={(v) => handleUpdate({ expected_amount: v })}
        onCancel={() => setEditingField(null)}
        type="cop"
        align="right"
        style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
        {!isPaid && (
          <button
            onClick={(e) => { e.stopPropagation(); onPay?.(); }}
            title="Marcar pagado (crea transacción)"
            style={{
              padding: "3px 8px", borderRadius: 50,
              border: `1px solid ${withAlpha(DS.green, "55")}`,
              background: withAlpha(DS.green, "12"),
              color: DS.green, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
            }}
          >✓</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
          title="Detalles (categoría, cuenta, cliente)"
          style={{
            padding: "3px 8px", borderRadius: 6, border: "none",
            background: "transparent", color: DS.textMuted,
            fontSize: 11, cursor: "pointer", fontFamily: DS.font,
          }}
        >✎</button>
        <button
          onClick={handleDelete}
          title="Eliminar"
          style={{
            padding: "3px 6px", borderRadius: 6, border: "none",
            background: "transparent", color: DS.textMuted,
            fontSize: 11, cursor: "pointer", fontFamily: DS.font,
          }}
        >✕</button>
      </div>
    </div>
  );
}

// Row inline de creación. Si el user empieza a escribir un nombre, abre
// la edición de las demás columnas. Submit con Enter o blur al final.
function CreateInlineRow({ scopeMeta: meta, type, finance, scopeCategories = [], onCreateCategory }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paid, setPaid] = useState(0);
  const [day, setDay] = useState("");
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  const reset = () => { setName(""); setCategoryId(""); setPaid(0); setDay(""); setTotal(0); };

  const submit = async () => {
    if (!name.trim() || !total || total <= 0) return;
    setSaving(true);
    try {
      const payload = {
        type,
        name: name.trim(),
        expected_amount: total,
        paid_amount: paid || 0,
        payment_type: "recurring",
        due_day: day ? Math.max(1, Math.min(31, Number(day))) : null,
        due_date: null,
        scope: meta.legacyKey || null,
        scope_id: meta.scopeId || null,
        category_id: categoryId || null,
        status: (paid || 0) >= total && total > 0 ? "paid" : (paid || 0) > 0 ? "partial" : "planned",
      };
      await finance.createBudgetItem(payload);
      reset();
    } catch (e) {
      alert("No se pudo crear: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCat = categoryId
    ? scopeCategories.find((c) => c.id === categoryId)
    : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "22px 1.4fr 110px 95px 70px 100px 80px",
      gap: 8, padding: "6px 10px",
      alignItems: "center",
      background: "transparent",
      border: `1px dashed ${withAlpha(meta.color, "33")}`,
      borderRadius: 6,
      marginTop: 4,
    }}>
      <span style={{ color: DS.textMuted, fontSize: 12, textAlign: "center" }}>+</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Nombre…"
        disabled={saving}
        style={{
          ...darkInput, padding: "4px 8px", fontSize: 12,
          fontFamily: DS.font, background: "transparent",
          border: "1px solid transparent",
        }}
      />
      {/* Categoría picker inline */}
      <div style={{ position: "relative" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setCatOpen((v) => !v); }}
          disabled={saving}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 8px", borderRadius: 50,
            border: selectedCat
              ? `1px solid ${withAlpha(selectedCat.color || "#888", "55")}`
              : `1px dashed ${DS.textHint}`,
            background: selectedCat ? withAlpha(selectedCat.color || "#888", "14") : "transparent",
            color: selectedCat ? DS.textPrimary : DS.textMuted,
            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {selectedCat ? <><span>{selectedCat.icon}</span> {selectedCat.name}</> : "+ categoría"}
        </button>
        {catOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 8,
              padding: 4, minWidth: 220, zIndex: 100,
              maxHeight: 280, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <button
              onClick={() => { setCategoryId(""); setCatOpen(false); }}
              style={{
                display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                border: "none", background: "transparent", color: DS.textMuted,
                fontSize: 11, cursor: "pointer", fontFamily: DS.font, borderRadius: 6,
              }}
            >— Sin categoría —</button>
            {scopeCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => { setCategoryId(c.id); setCatOpen(false); }}
                style={{
                  display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                  border: "none", background: "transparent", color: DS.textPrimary,
                  fontSize: 11, cursor: "pointer", fontFamily: DS.font, borderRadius: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >{c.icon} {c.name}</button>
            ))}
            {onCreateCategory && (
              <button
                onClick={() => { setCatOpen(false); onCreateCategory(); }}
                style={{
                  display: "block", width: "100%", padding: "6px 10px", textAlign: "left",
                  border: "none", background: "transparent", color: DS.blue,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  borderTop: `1px solid ${withAlpha(DS.textHint, "22")}`,
                  marginTop: 4, paddingTop: 8,
                }}
              >+ Nueva categoría</button>
            )}
          </div>
        )}
      </div>
      <input
        value={paid ? Number(paid).toLocaleString("es-CO") : ""}
        onChange={(e) => {
          const clean = e.target.value.replace(/[^\d-]/g, "");
          setPaid(Number(clean || 0));
        }}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="$0"
        disabled={saving}
        style={{
          ...darkInput, padding: "4px 8px", fontSize: 11,
          textAlign: "right", fontFamily: DS.font,
          background: "transparent", border: "1px solid transparent",
        }}
      />
      <input
        type="number"
        min={1} max={31}
        value={day}
        onChange={(e) => setDay(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="—"
        disabled={saving}
        style={{
          ...darkInput, padding: "4px 8px", fontSize: 11,
          textAlign: "right", fontFamily: DS.font,
          background: "transparent", border: "1px solid transparent",
        }}
      />
      <input
        value={total ? Number(total).toLocaleString("es-CO") : ""}
        onChange={(e) => {
          const clean = e.target.value.replace(/[^\d-]/g, "");
          setTotal(Number(clean || 0));
        }}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="$0"
        disabled={saving}
        style={{
          ...darkInput, padding: "4px 8px", fontSize: 12, fontWeight: 600,
          textAlign: "right", fontFamily: DS.font,
          background: "transparent", border: "1px solid transparent",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={submit}
          disabled={saving || !name.trim() || !total}
          style={{
            padding: "4px 12px", borderRadius: 50,
            border: `1px solid ${withAlpha(meta.color, "55")}`,
            background: name.trim() && total ? withAlpha(meta.color, "20") : "transparent",
            color: name.trim() && total ? meta.color : DS.textHint,
            fontSize: 10, fontWeight: 700,
            cursor: name.trim() && total ? "pointer" : "default",
            fontFamily: DS.font,
            opacity: saving ? 0.5 : 1,
          }}
        >Agregar</button>
      </div>
    </div>
  );
}

function EditableCell({ value, editing, onStart, onSave, onCancel, type, align = "left", placeholder = "", style = {} }) {
  const [local, setLocal] = useState(value);

  const startEditing = () => {
    setLocal(value);
    onStart();
  };

  const commit = () => {
    if (type === "cop") {
      onSave(parseCOP(local));
    } else if (type === "number") {
      onSave(local ? Number(local) : null);
    } else if (type === "date") {
      onSave(local || null);
    } else {
      onSave(String(local || "").trim());
    }
  };

  if (editing) {
    const displayValue = type === "cop"
      ? (Number(local) || 0).toLocaleString("es-CO")
      : (local ?? "");
    return (
      <input
        type={type === "number" ? "number" : type === "date" ? "date" : "text"}
        value={displayValue}
        onChange={(e) => {
          if (type === "cop") {
            const clean = e.target.value.replace(/[^\d-]/g, "");
            setLocal(Number(clean || 0));
          } else {
            setLocal(e.target.value);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        style={{
          ...darkInput, padding: "3px 6px", fontSize: 11, width: "100%",
          textAlign: align, fontFamily: DS.font,
        }}
      />
    );
  }

  let displayValue;
  if (type === "cop") {
    displayValue = Number(value) > 0 ? formatCOP(value) : (placeholder || "$0");
  } else if (type === "date") {
    displayValue = value
      ? new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
      : (placeholder || "—");
  } else {
    displayValue = value || placeholder || "—";
  }

  return (
    <button
      onClick={startEditing}
      style={{
        width: "100%", padding: "3px 6px", borderRadius: 4,
        border: "none", background: "transparent",
        color: DS.textPrimary, fontFamily: DS.font,
        textAlign: align, cursor: "pointer",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {displayValue}
    </button>
  );
}
