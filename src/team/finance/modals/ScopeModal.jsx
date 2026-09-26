// Modal para crear/editar una sección (scope).

import { useState } from "react";
import { DS, darkInput } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox, ModalActions } from "./AccountModal.jsx";

const COLORS = ["#3B82F6", "#A855F7", "#F97316", "#D4A93B", "#1D9E75", "#06B6D4", "#EC4899", "#EF4444", "#10B981", "#8B5CF6"];

export function ScopeModal({ scope, finance, onClose }) {
  const isEdit = !!scope;
  const [name, setName] = useState(scope?.name || "");
  const [icon, setIcon] = useState(scope?.icon || "📁");
  const [color, setColor] = useState(scope?.color || COLORS[0]);
  const [allowIncome, setAllowIncome] = useState(scope?.allow_income ?? true);
  const [allowExpense, setAllowExpense] = useState(scope?.allow_expense ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    if (!allowIncome && !allowExpense) { setError("Debe permitir al menos un tipo (ingreso o gasto)."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), icon: icon.trim() || "📁", color,
      allow_income: allowIncome, allow_expense: allowExpense,
    };
    try {
      if (isEdit) await finance.updateScope(scope.id, payload);
      else await finance.createScope(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const handleArchive = async () => {
    if (!window.confirm("¿Archivar esta sección? Los items existentes no se borran pero la sección desaparece de la UI.")) return;
    await finance.archiveScope(scope.id);
    onClose?.();
  };

  return (
    <ModalShell title={isEdit ? "Editar sección" : "Nueva sección"} onClose={onClose}>
      <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Lifestyle, Inversiones, Salud" style={darkInput} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12 }}>
        <Field label="Ícono"><input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📁" style={{ ...darkInput, fontSize: 22, width: 80 }} /></Field>
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
      </div>
      <Field label="Tipos de movimiento que admite">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={allowExpense} onChange={(e) => setAllowExpense(e.target.checked)} />
            💸 Permite gastos
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={allowIncome} onChange={(e) => setAllowIncome(e.target.checked)} />
            💵 Permite ingresos
          </label>
        </div>
      </Field>
      {scope?.legacy_key && (
        <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
          🔒 Esta sección es de las default originales. Podés renombrarla / cambiar color / íconos pero no archivarla (rompería los datos legacy).
        </div>
      )}

      {error && <ErrBox>{error}</ErrBox>}
      <ModalActions
        isEdit={isEdit}
        saving={saving}
        onSubmit={submit}
        onClose={onClose}
        onDelete={isEdit && !scope.legacy_key ? handleArchive : null}
      />
    </ModalShell>
  );
}
