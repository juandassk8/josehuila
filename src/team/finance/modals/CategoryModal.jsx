// CategoryModal — modal compartido para crear/editar categorías.
// Antes vivía dentro de views/Categories.jsx; lo extraemos para reusar
// desde BudgetTable y otros componentes del dashboard.

import { useState } from "react";
import { DS, darkInput, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "./AccountModal.jsx";

const TYPES = ["expense", "income"];
const COLORS = [
  "#1D9E75", "#3B82F6", "#8B5CF6", "#F59E0B", "#E54B4B",
  "#EC4899", "#06B6D4", "#D4A93B", "#A855F7", "#F97316",
  "#10B981", "#EF4444",
];

export function CategoryModal({
  category,         // null para crear, instancia para editar
  finance,
  onClose,
  initialScope,     // legacy_key precargado al crear (ej "agency")
  initialType,      // "income" | "expense" precargado al crear
}) {
  const isEdit = !!category;
  const scopesList = finance.scopes || [];

  const [name, setName] = useState(category?.name || "");
  const [type, setType] = useState(category?.type || initialType || "expense");
  const [scope, setScope] = useState(
    category?.scope || initialScope ||
    scopesList[0]?.legacy_key || scopesList[0]?.id || "agency"
  );
  const [color, setColor] = useState(category?.color || COLORS[0]);
  const [icon, setIcon] = useState(category?.icon || "•");
  const [parentId, setParentId] = useState(category?.parent_category_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Posibles padres: del mismo scope+type, sin padre, no la actual.
  const availableParents = (finance.categories || []).filter((c) =>
    c.type === type && c.scope === scope && !c.parent_category_id && c.id !== category?.id
  );

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), type, scope,
      color, icon: icon.trim() || "•",
      parent_category_id: parentId || null,
    };
    try {
      if (isEdit) await finance.updateCategory(category.id, payload);
      else await finance.createCategory(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar esta categoría? (Las transacciones que la usan quedan sin categoría.)")) return;
    try {
      await finance.deleteCategory(category.id);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
  };

  return (
    <ModalShell title={isEdit ? "Editar categoría" : "Nueva categoría"} onClose={onClose}>
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={darkInput} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo">
          <div style={{ display: "flex", gap: 6 }}>
            {TYPES.map((t) => {
              const active = type === t;
              return (
                <button key={t} onClick={() => setType(t)} style={{
                  flex: 1, padding: "7px 10px", borderRadius: 50,
                  border: `1px solid ${active ? color : DS.textHint}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : DS.textSecondary,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  textTransform: "capitalize",
                }}>{t === "income" ? "Ingreso" : "Gasto"}</button>
              );
            })}
          </div>
        </Field>
        <Field label="Sección">
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
            {scopesList.length > 0 ? (
              scopesList.map((s) => (
                <option key={s.id} value={s.legacy_key || s.id} style={{ background: DS.bgSide }}>
                  {s.icon} {s.name}
                </option>
              ))
            ) : (
              <>
                <option value="agency" style={{ background: DS.bgSide }}>🏢 Agencia</option>
                <option value="personal" style={{ background: DS.bgSide }}>🧍 Personal</option>
                <option value="family" style={{ background: DS.bgSide }}>👨‍👩‍👧 Familia</option>
                <option value="content_capex" style={{ background: DS.bgSide }}>🎥 Content CapEx</option>
              </>
            )}
          </select>
        </Field>
      </div>
      <Field label="Categoría padre (opcional)">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ ...darkInput, fontSize: 12 }}>
          <option value="" style={{ background: DS.bgSide }}>— Sin padre (es categoría raíz) —</option>
          {availableParents.map((p) => (
            <option key={p.id} value={p.id} style={{ background: DS.bgSide }}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ícono (emoji)">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📦" style={{ ...darkInput, fontSize: 18, width: 80 }} />
      </Field>
      <Field label="Color">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} style={{
              width: 28, height: 28, borderRadius: "50%", background: c,
              border: color === c ? `3px solid ${DS.textPrimary}` : "2px solid transparent",
              cursor: "pointer",
            }} />
          ))}
        </div>
      </Field>

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit}
        saving={saving}
        onSubmit={submit}
        onClose={onClose}
        onDelete={isEdit && !category.is_default ? handleDelete : null}
      />
    </ModalShell>
  );
}

// Helper para colorear el chip del categoría sin importar withAlpha en cada caller.
export function categoryChipStyle(color) {
  return {
    border: `1px solid ${withAlpha(color, "55")}`,
    background: withAlpha(color, "18"),
  };
}
