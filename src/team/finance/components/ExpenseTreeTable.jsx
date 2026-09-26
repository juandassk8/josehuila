import { useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOP, expenseByCategoryTree } from "../lib/finance_math.js";

const SCOPE_LABEL = {
  agency: "🏢 Agencia",
  personal: "🧍 Personal",
  family: "👨‍👩‍👧 Familia",
  content_capex: "🎥 Content CapEx",
};
const SCOPE_COLOR = {
  agency: "#3B82F6",
  personal: "#A855F7",
  family: "#F97316",
  content_capex: "#D4A93B",
};

// Tabla de gastos del mes agrupada por scope → categoría → subcategoría.
export function ExpenseTreeTable({ transactions, categories, from, to }) {
  const tree = expenseByCategoryTree(transactions, categories, { from, to });
  const grandTotal = tree.reduce((s, g) => s + g.total, 0);
  const [expanded, setExpanded] = useState(new Set(tree.map((g) => g.scope))); // todos abiertos por default

  const toggleScope = (scope) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  return (
    <div style={{
      padding: 18, borderRadius: 14, background: DS.bgCard, border: DS.border,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: DS.textMuted,
          }}>
            Gastos por categoría
          </div>
          <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
            Agrupado por scope → categoría → subcategoría
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: DS.textMuted }}>Total</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: DS.red, fontVariantNumeric: "tabular-nums" }}>
            {formatCOP(grandTotal)}
          </div>
        </div>
      </div>

      {tree.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
          Sin gastos en el período.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tree.map((group) => {
            const isOpen = expanded.has(group.scope);
            const color = SCOPE_COLOR[group.scope] || DS.textMuted;
            return (
              <div key={group.scope}>
                {/* Scope header */}
                <button
                  onClick={() => toggleScope(group.scope)}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 8,
                    border: "none",
                    background: withAlpha(color, "12"),
                    color: DS.textPrimary,
                    cursor: "pointer", fontFamily: DS.font,
                    display: "flex", alignItems: "center", gap: 8,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 10, color: DS.textMuted }}>{isOpen ? "▼" : "▸"}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{SCOPE_LABEL[group.scope]}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                    {formatCOP(group.total)}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ marginTop: 4, paddingLeft: 12 }}>
                    {group.rows.map((row) => (
                      <CategoryRow key={row.id} row={row} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryRow({ row }) {
  const hasChildren = row.children && row.children.length > 0;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={hasChildren ? () => setOpen((v) => !v) : undefined}
        disabled={!hasChildren}
        style={{
          width: "100%", padding: "6px 10px", borderRadius: 6,
          border: "none", background: "transparent",
          color: DS.textPrimary, fontFamily: DS.font,
          cursor: hasChildren ? "pointer" : "default",
          display: "flex", alignItems: "center", gap: 8,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { if (hasChildren) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 9, color: DS.textMuted, width: 10 }}>
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </span>
        <span style={{
          width: 22, height: 22, borderRadius: "50%",
          background: withAlpha(row.color || "#888", "22"),
          fontSize: 11,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{row.icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{row.name}</span>
        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: DS.textPrimary }}>
          {formatCOP(row.total)}
        </span>
      </button>
      {hasChildren && open && (
        <div style={{ paddingLeft: 26 }}>
          {row.children.map((child) => (
            <div key={child.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 10px",
            }}>
              <span style={{ fontSize: 9, color: DS.textMuted, width: 10 }}>·</span>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: withAlpha(child.color || "#888", "22"), fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{child.icon}</span>
              <span style={{ flex: 1, fontSize: 11, color: DS.textSecondary }}>{child.name}</span>
              <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: DS.textMuted }}>
                {formatCOP(child.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
