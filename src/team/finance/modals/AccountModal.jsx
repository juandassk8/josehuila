import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../../lib/design.js";
import { AmountInput } from "../components/AmountInput.jsx";

const TYPES = [
  { value: "bank",           label: "Banco",          icon: "🏦" },
  { value: "cash",           label: "Efectivo",       icon: "💵" },
  { value: "digital_wallet", label: "Billetera digital", icon: "📱" },
  { value: "credit_card",    label: "Tarjeta crédito", icon: "💳" },
  { value: "crypto",         label: "Cripto",         icon: "₿" },
];

const COLORS = ["#1D9E75", "#3B82F6", "#8B5CF6", "#F59E0B", "#E54B4B", "#EC4899", "#06B6D4", "#D4A93B"];

export function AccountModal({ account, finance, onClose }) {
  const isEdit = !!account;
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || "bank");
  const [balance, setBalance] = useState(account?.current_balance || 0);
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit || 0);
  const [color, setColor] = useState(account?.color || COLORS[0]);
  const [icon, setIcon] = useState(account?.icon || "🏦");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Nombre requerido."); return; }
    setSaving(true); setError("");
    const payload = {
      name: name.trim(), type, current_balance: balance,
      credit_limit: type === "credit_card" ? creditLimit : null,
      color, icon,
    };
    try {
      if (isEdit) await finance.updateAccount(account.id, payload);
      else await finance.createAccount(payload);
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title={isEdit ? "Editar cuenta" : "Nueva cuenta"}>
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Bancolombia" style={darkInput} />
      </Field>
      <Field label="Tipo">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TYPES.map((t) => {
            const active = type === t.value;
            return (
              <button
                key={t.value}
                onClick={() => { setType(t.value); setIcon(t.icon); }}
                style={{
                  padding: "7px 12px", borderRadius: 50,
                  border: `1px solid ${active ? color : DS.textHint}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : DS.textSecondary,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}
              >{t.icon} {t.label}</button>
            );
          })}
        </div>
      </Field>
      <Field label={isEdit ? "Saldo actual" : "Saldo inicial"}>
        <AmountInput value={balance} onChange={setBalance} />
      </Field>
      {type === "credit_card" && (
        <Field label="Cupo de la tarjeta">
          <AmountInput value={creditLimit} onChange={setCreditLimit} />
        </Field>
      )}
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
        onDelete={isEdit ? async () => {
          if (!window.confirm("¿Eliminar esta cuenta? (Las transacciones que la usen NO se borran.)")) return;
          await finance.deleteAccount(account.id);
          onClose?.();
        } : null}
      />
    </ModalShell>
  );
}

function ModalShell({ children, title, onClose }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px",
      zIndex: 9999, fontFamily: DS.font,
    }}>
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 18, padding: 24,
        width: "100%", maxWidth: 480, color: DS.textPrimary,
        maxHeight: "calc(100vh - 120px)", overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.12em", marginBottom: 6, textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}

function ErrBox({ children }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, background: "rgba(226,75,74,0.12)",
      border: "1px solid rgba(226,75,74,0.4)", color: DS.red, fontSize: 12, marginBottom: 14,
    }}>{children}</div>
  );
}

function ModalActions({ isEdit, saving, onSubmit, onClose, onDelete }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
      {onDelete ? (
        <button onClick={onDelete} style={{ ...darkBtnGhost, color: DS.red, borderColor: "rgba(226,75,74,0.4)" }}>
          Eliminar
        </button>
      ) : <div />}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} disabled={saving} style={darkBtnGhost}>Cancelar</button>
        <button onClick={onSubmit} disabled={saving} style={{ ...darkBtn, opacity: saving ? 0.5 : 1 }}>
          {saving ? "Guardando..." : (isEdit ? "Guardar" : "Crear")}
        </button>
      </div>
    </div>
  );
}

export { ModalShell, Field, ErrBox, ModalActions };
