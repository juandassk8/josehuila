import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { ScopeModal } from "../modals/ScopeModal.jsx";
import { CategoryModal } from "../modals/CategoryModal.jsx";

const SCOPE_LABEL = {
  agency: "🏢 Agencia",
  personal: "🧍 Personal",
  family: "👨‍👩‍👧 Familia",
  content_capex: "🎥 Content CapEx",
};
const SCOPES = ["agency", "personal", "family", "content_capex"];
const TYPES = ["expense", "income"];

export function CategoriesView({ finance }) {
  const { categories, scopes } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);
  const [editingScope, setEditingScope] = useState(null);
  const [openNewScope, setOpenNewScope] = useState(false);

  const grouped = useMemo(() => {
    const out = {};
    for (const s of SCOPES) {
      out[s] = { expense: [], income: [] };
    }
    // Solo agregamos root categories (sin parent). Las children se renderizan
    // indentadas debajo de su padre.
    for (const c of categories) {
      if (c.parent_category_id) continue;
      if (out[c.scope] && out[c.scope][c.type]) out[c.scope][c.type].push(c);
    }
    return out;
  }, [categories]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const c of categories) {
      if (!c.parent_category_id) continue;
      if (!map.has(c.parent_category_id)) map.set(c.parent_category_id, []);
      map.get(c.parent_category_id).push(c);
    }
    return map;
  }, [categories]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Secciones (scopes) */}
      <div style={{
        padding: 14, borderRadius: 12, background: DS.bgCard, border: DS.border,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              SECCIONES
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
              Las macro-categorías (Agencia, Personal, etc). Click para editar nombre, color, íconos.
            </div>
          </div>
          <button onClick={() => setOpenNewScope(true)} style={{
            padding: "7px 14px", borderRadius: 50, border: "none",
            background: DS.blue, color: "#fff", fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: DS.font,
          }}>+ Nueva sección</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {scopes.map((sc) => (
            <button key={sc.id} onClick={() => setEditingScope(sc)} style={{
              padding: "8px 14px", borderRadius: 50,
              border: `1px solid ${withAlpha(sc.color, "55")}`,
              background: withAlpha(sc.color, "12"),
              color: DS.textPrimary, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: DS.font,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span>{sc.icon}</span> {sc.name}
              <span style={{ fontSize: 9, color: DS.textMuted, marginLeft: 4 }}>
                {sc.allow_income && sc.allow_expense ? "💸💵" : sc.allow_expense ? "💸" : sc.allow_income ? "💵" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: DS.textMuted }}>
          {categories.length} categorías
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva categoría</button>
      </div>

      {SCOPES.map((scope) => {
        const expenses = grouped[scope].expense;
        const incomes = grouped[scope].income;
        if (expenses.length === 0 && incomes.length === 0) return null;
        const scopeRow = (scopes || []).find((s) => s.legacy_key === scope);
        const scopeTitle = scopeRow ? `${scopeRow.icon} ${scopeRow.name}` : SCOPE_LABEL[scope];
        return (
          <div key={scope} style={{ padding: 16, borderRadius: 12, background: DS.bgCard, border: DS.border }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.1em",
              textTransform: "uppercase", marginBottom: 12,
            }}>{scopeTitle}</div>

            {incomes.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: DS.green, marginBottom: 6 }}>INGRESOS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {incomes.map((c) => (
                    <CategoryWithChildren
                      key={c.id}
                      category={c}
                      children={childrenByParent.get(c.id) || []}
                      onClick={setEditing}
                    />
                  ))}
                </div>
              </>
            )}

            {expenses.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: DS.red, marginBottom: 6 }}>GASTOS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {expenses.map((c) => (
                    <CategoryWithChildren
                      key={c.id}
                      category={c}
                      children={childrenByParent.get(c.id) || []}
                      onClick={setEditing}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {openNew && <CategoryModal category={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <CategoryModal category={editing} finance={finance} onClose={() => setEditing(null)} />}
      {openNewScope && <ScopeModal scope={null} finance={finance} onClose={() => setOpenNewScope(false)} />}
      {editingScope && <ScopeModal scope={editingScope} finance={finance} onClose={() => setEditingScope(null)} />}
    </div>
  );
}

function CategoryChip({ category, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 50,
      border: `1px solid ${withAlpha(category.color, "55")}`,
      background: withAlpha(category.color, "18"),
      color: DS.textPrimary, fontSize: 12, fontWeight: 600,
      cursor: "pointer", fontFamily: DS.font,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span>{category.icon}</span> {category.name}
    </button>
  );
}

// Categoría padre + sus children indentadas debajo.
function CategoryWithChildren({ category, children, onClick }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      padding: 6, borderRadius: 10,
      background: children.length > 0 ? withAlpha(category.color, "08") : "transparent",
    }}>
      <CategoryChip category={category} onClick={() => onClick(category)} />
      {children.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 10 }}>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => onClick(child)}
              style={{
                padding: "3px 10px", borderRadius: 50,
                border: `1px dashed ${withAlpha(child.color, "55")}`,
                background: "transparent",
                color: DS.textSecondary, fontSize: 10, fontWeight: 500,
                cursor: "pointer", fontFamily: DS.font,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ opacity: 0.6 }}>▸</span>
              <span>{child.icon}</span> {child.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

