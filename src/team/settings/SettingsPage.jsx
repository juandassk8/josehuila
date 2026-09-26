import { useState } from "react";
import { DS, DEFAULT_MEMBER_COLORS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { updateMember } from "../data/db.js";

export function SettingsPage({ currentMember, onRefresh, onSignOut }) {
  const [color, setColor] = useState(currentMember?.color || DS.blue);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await updateMember(currentMember.id, { color });
    setSaving(false);
    onRefresh?.();
  };

  return (
    <div>
      <Topbar title="Ajustes" subtitle="Tu perfil y preferencias" accent={color} />

      <div
        style={{
          background: DS.bgCard,
          border: DS.border,
          borderRadius: 16,
          padding: 24,
          marginBottom: 18,
          fontFamily: DS.font,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: DS.textMuted,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 12,
            fontWeight: 700,
          }}
        >
          Color neón
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>
          Elige el color que representa tu presencia en el War Room y tu sidebar. Se guarda en tu perfil.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          {DEFAULT_MEMBER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: c,
                border: color === c ? `3px solid ${DS.textPrimary}` : "3px solid transparent",
                cursor: "pointer",
                padding: 0,
                boxShadow: color === c ? `0 0 0 4px ${c}55, 0 0 20px ${c}44` : "none",
                transition: "box-shadow 0.2s",
              }}
            />
          ))}
        </div>
        <button
          onClick={save}
          disabled={saving || color === currentMember?.color}
          style={{
            padding: "10px 22px",
            borderRadius: 50,
            border: "none",
            background: saving ? DS.textSecondary : DS.textPrimary,
            color: DS.bg,
            fontSize: 13,
            fontWeight: 700,
            cursor: saving || color === currentMember?.color ? "default" : "pointer",
            opacity: color === currentMember?.color ? 0.5 : 1,
          }}
        >
          {saving ? "Guardando…" : "Guardar color"}
        </button>
      </div>

      <div
        style={{
          background: DS.bgCard,
          border: DS.border,
          borderRadius: 16,
          padding: 24,
          fontFamily: DS.font,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: DS.textMuted,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 12,
            fontWeight: 700,
          }}
        >
          Cuenta
        </div>
        <div style={{ fontSize: 13, color: DS.textPrimary, marginBottom: 4 }}>{currentMember?.name}</div>
        <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 18 }}>{currentMember?.email}</div>
        <button
          onClick={onSignOut}
          style={{
            padding: "10px 22px",
            borderRadius: 50,
            border: "1px solid rgba(226,75,74,0.3)",
            background: "transparent",
            color: DS.red,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
