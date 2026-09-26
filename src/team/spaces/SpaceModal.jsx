import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, darkCard } from "../../lib/design.js";

const ICONS = ["🎓", "💼", "📱", "🏠", "⚡", "🎯", "💰", "📊", "🚀", "✨", "📝", "🎨", "🔥", "🎬", "📈", "🗂"];
const COLORS = ["#378ADD", "#1DB97A", "#F5A623", "#8B5CF6", "#E24B4A", "#EC4899", "#06B6D4", "#F97316", "#9B9A97"];

export function SpaceModal({ space, parentSpaceId, onSave, onClose }) {
  const isEdit = !!space;
  const [name, setName] = useState(space?.name || "");
  const [description, setDescription] = useState(space?.description || "");
  const [icon, setIcon] = useState(space?.icon || "🗂");
  const [color, setColor] = useState(space?.color || "#378ADD");
  const [visibility, setVisibility] = useState(space?.visibility || "shared");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      icon,
      color,
      visibility,
    };
    if (!isEdit && parentSpaceId) payload.parent_space_id = parentSpaceId;
    await onSave(payload);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", fontFamily: DS.font,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...darkCard, width: 480, maxHeight: "85vh", overflowY: "auto",
          background: DS.bgSide, border: DS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary, marginBottom: 6 }}>
          {isEdit ? "Editar espacio" : (parentSpaceId ? "Nuevo subespacio" : "Crear espacio")}
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 20 }}>
          Un espacio representa a los equipos, departamentos o grupos, cada uno con sus propias listas, flujos de trabajo y ajustes.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Icon + Name */}
          <div>
            <label style={labelStyle}>Ícono y nombre</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <IconPicker value={icon} onChange={setIcon} color={color} />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Marketing, Ingeniería, Recursos Humanos"
                style={{ ...darkInput, flex: 1 }}
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Descripción (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Color */}
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    border: color === c ? `2px solid ${DS.textPrimary}` : "2px solid transparent",
                    background: c, cursor: "pointer", padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Privacy */}
          <div>
            <label style={labelStyle}>Permiso predeterminado</label>
            <div style={{ display: "flex", gap: 8 }}>
              <PrivacyOption
                active={visibility === "shared"}
                onClick={() => setVisibility("shared")}
                icon="👥"
                label="Compartido"
                subtitle="Todo el equipo lo ve"
              />
              <PrivacyOption
                active={visibility === "private"}
                onClick={() => setVisibility("private")}
                icon="🔒"
                label="Privado"
                subtitle="Solo tú lo ves"
              />
            </div>
          </div>
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          marginTop: 24, paddingTop: 16, borderTop: DS.border,
        }}>
          <button onClick={onClose} style={darkBtnGhost}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{ ...darkBtn, opacity: !name.trim() || saving ? 0.4 : 1 }}
          >
            {saving ? "Guardando..." : (isEdit ? "Guardar" : "Crear espacio")}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange, color }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${color}22`, border: `1px solid ${color}44`,
          fontSize: 18, cursor: "pointer",
        }}
      >
        {value}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: DS.bgSide, border: DS.border, borderRadius: 10,
          padding: 6, display: "grid", gridTemplateColumns: "repeat(8, 28px)", gap: 2,
          zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}>
          {ICONS.map((i) => (
            <button
              key={i}
              onClick={() => { onChange(i); setOpen(false); }}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: value === i ? "rgba(55,138,221,0.15)" : "transparent",
                border: "none", fontSize: 15, cursor: "pointer",
              }}
            >
              {i}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrivacyOption({ active, onClick, icon, label, subtitle }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 12px", borderRadius: 10,
        border: active ? `1.5px solid ${DS.blue}` : DS.border,
        background: active ? "rgba(55,138,221,0.08)" : "transparent",
        cursor: "pointer", textAlign: "left",
        fontFamily: DS.font,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary }}>{icon} {label}</div>
      <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>{subtitle}</div>
    </button>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: DS.textMuted,
  letterSpacing: "0.12em",
  marginBottom: 8,
};
