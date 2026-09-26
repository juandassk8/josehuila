import { useState } from "react";
import { DS, darkInput, darkBtnGhost, ROLE_LABEL, DEFAULT_MEMBER_COLORS } from "../../lib/design.js";
import { updateMember } from "../data/db.js";
import {
  OVERRIDABLE_VIEWS,
  canAccessViewByRole,
  getAccessState,
} from "../lib/permissions.js";
import { CambiarClave } from "./CambiarClave.jsx";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function ProfileModal({ member, currentMember, onClose, onSaved }) {
  const canEditRole = currentMember?.role === "admin" || currentMember?.id === member.id;
  const canEdit = currentMember?.role === "admin" || currentMember?.id === member.id;

  const [name, setName] = useState(member.name || "");
  const [role, setRole] = useState(member.role || "member");
  const [color, setColor] = useState(member.color || DS.blue);
  const [day, setDay] = useState(member.birthday_day || "");
  const [month, setMonth] = useState(member.birthday_month || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [bio, setBio] = useState(member.bio || "");
  const [isReviewer, setIsReviewer] = useState(!!member.is_reviewer);
  const [accessOverrides, setAccessOverrides] = useState(member.access_overrides || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [togglingActive, setTogglingActive] = useState(false);

  // Solo admin puede marcar reviewers (el propio miembro no).
  const canEditReviewer = currentMember?.role === "admin";
  // Solo admin puede tocar accesos y activar/desactivar (y no a sí mismo).
  const canEditAccess = currentMember?.role === "admin" && currentMember?.id !== member.id;
  const memberActive = member.active !== false;

  const submit = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    const { error: err } = await updateMember(member.id, {
      name: name.trim(),
      role: canEditRole ? role : member.role,
      color,
      birthday_day: day ? Number(day) : null,
      birthday_month: month ? Number(month) : null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      ...(canEditReviewer ? { is_reviewer: isReviewer } : {}),
      ...(canEditAccess ? { access_overrides: accessOverrides } : {}),
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved?.();
    onClose?.();
  };

  const setAccess = (viewKey, nextState) => {
    setAccessOverrides((prev) => {
      const copy = { ...prev };
      if (nextState === "default") delete copy[viewKey];
      else copy[viewKey] = nextState === "allowed";
      return copy;
    });
  };

  const toggleActive = async () => {
    if (!canEditAccess) return;
    const next = !memberActive;
    const verb = next ? "reactivar" : "desactivar";
    if (!window.confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} a ${member.name}?\n${next ? "Podrá volver a acceder." : "No podrá acceder a Inforce Central hasta que lo reactives."}`)) return;
    setTogglingActive(true);
    setError("");
    const { error: err } = await updateMember(member.id, { active: next });
    setTogglingActive(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved?.();
    onClose?.();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px",
        zIndex: 9999,
        fontFamily: DS.font,
      }}
    >
      <div
        style={{
          background: DS.bgSide,
          border: DS.border,
          borderRadius: 18,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          color: DS.textPrimary,
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: color,
              color: DS.textPrimary,
              fontSize: 22,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 3px ${DS.bg}, 0 0 0 5px ${color}44`,
            }}
          >
            {name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: DS.blue, letterSpacing: "0.18em", fontWeight: 700 }}>
              PERFIL
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: DS.textPrimary }}>{member.name}</div>
            <div style={{ fontSize: 11, color: DS.textMuted }}>{member.email}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: DS.border,
              color: DS.textMuted,
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>

        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            style={darkInput}
          />
        </Field>

        <Field label="Rol">
          {canEditRole ? (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...darkInput, fontSize: 13 }}
            >
              <option value="admin" style={{ background: DS.bgSide }}>Admin</option>
              <option value="member" style={{ background: DS.bgSide }}>Miembro</option>
              <option value="editor" style={{ background: DS.bgSide }}>Editor</option>
            </select>
          ) : (
            <div style={{ ...darkInput, color: DS.textSecondary }}>{ROLE_LABEL[role]}</div>
          )}
        </Field>

        <Field label="Color de acento">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEFAULT_MEMBER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => canEdit && setColor(c)}
                disabled={!canEdit}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? `2px solid ${DS.textPrimary}` : "2px solid transparent",
                  cursor: canEdit ? "pointer" : "default",
                  padding: 0,
                  boxShadow: color === c ? `0 0 0 3px ${c}55` : "none",
                }}
              />
            ))}
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Día de cumpleaños">
            <input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              disabled={!canEdit}
              placeholder="Día"
              style={darkInput}
            />
          </Field>
          <Field label="Mes">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={!canEdit}
              style={{ ...darkInput, fontSize: 13 }}
            >
              <option value="" style={{ background: DS.bgSide }}>—</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} style={{ background: DS.bgSide }}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Teléfono">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canEdit}
            placeholder="+57 …"
            style={darkInput}
          />
        </Field>

        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder="Qué haces en Inforce, en qué estás enfocado…"
            style={{ ...darkInput, resize: "vertical", fontFamily: DS.font, lineHeight: 1.5 }}
          />
        </Field>

        {canEditReviewer && (
          <div style={{
            marginTop: 8, marginBottom: 16,
            padding: "12px 14px", borderRadius: 12,
            background: DS.bgCard, border: DS.border,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={isReviewer}
                onChange={(e) => setIsReviewer(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary }}>
                  👀 Recibe tareas de revisión automáticas
                </div>
                <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2, lineHeight: 1.5 }}>
                  Cada vez que un slot del pipeline de una empresa pida revisión
                  (scripting, rodaje, edición, idea), se crea una tarea automática
                  asignada a este miembro.
                </div>
              </div>
            </label>
          </div>
        )}

        {canEditAccess && (
          <div style={{
            marginTop: 8, marginBottom: 16,
            padding: "14px 16px", borderRadius: 12,
            background: DS.bgCard, border: DS.border,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: DS.textMuted,
              letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
            }}>
              Accesos personalizados
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>
              Por defecto cada rol tiene sus accesos. Acá podés permitir o denegar vistas específicas para <strong>{member.name}</strong> sin tocar el rol.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {OVERRIDABLE_VIEWS.map((v) => {
                const state = getAccessState({ ...member, access_overrides: accessOverrides }, v.key);
                const defaultAllowed = canAccessViewByRole({ ...member, role }, v.key);
                return (
                  <AccessRow
                    key={v.key}
                    label={v.label}
                    state={state}
                    defaultAllowed={defaultAllowed}
                    onChange={(next) => setAccess(v.key, next)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Un admin puede cambiarle la contraseña a cualquiera, incluido él mismo —
            por eso no usa `canEditAccess`, que excluye el propio perfil. */}
        {currentMember?.role === "admin" && <CambiarClave member={member} />}

        {canEditAccess && (
          <div style={{
            marginTop: 8, marginBottom: 16,
            padding: "12px 14px", borderRadius: 12,
            background: memberActive ? "rgba(226,75,74,0.06)" : "rgba(29,185,122,0.08)",
            border: `1px solid ${memberActive ? "rgba(226,75,74,0.3)" : "rgba(29,185,122,0.4)"}`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: memberActive ? DS.red : DS.green }}>
                {memberActive ? "🚫 Desactivar integrante" : "✓ Reactivar integrante"}
              </div>
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2, lineHeight: 1.5 }}>
                {memberActive
                  ? "Bloquea el acceso a Inforce Central. Sus tareas y sesiones se preservan."
                  : "Restaura el acceso. Vuelve a aparecer en listas con sus permisos previos."}
              </div>
            </div>
            <button
              onClick={toggleActive}
              disabled={togglingActive}
              style={{
                ...darkBtnGhost,
                padding: "8px 16px",
                fontSize: 11,
                color: memberActive ? DS.red : DS.green,
                borderColor: memberActive ? "rgba(226,75,74,0.4)" : "rgba(29,185,122,0.5)",
              }}
            >
              {togglingActive ? "…" : memberActive ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(226,75,74,0.1)",
              border: "1px solid rgba(226,75,74,0.3)",
              borderRadius: 10,
              color: DS.red,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 22px",
              borderRadius: 50,
              background: "transparent",
              border: DS.border,
              color: DS.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          {canEdit && (
            <button
              onClick={submit}
              disabled={saving}
              style={{
                padding: "10px 26px",
                borderRadius: 50,
                border: "none",
                background: DS.textPrimary,
                color: DS.bg,
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: DS.textSecondary,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Row de un acceso con 3 estados: default (gris) / allowed (verde) / denied (rojo).
// Muestra al lado cuál es el default del rol como hint.
function AccessRow({ label, state, defaultAllowed, onChange }) {
  const OPTIONS = [
    { key: "default", label: "Default", color: DS.textMuted },
    { key: "allowed", label: "Permitir", color: DS.green },
    { key: "denied",  label: "Denegar", color: DS.red },
  ];
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 8,
      background: "rgba(0,0,0,0.15)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary }}>{label}</div>
        <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 1 }}>
          Default del rol: {defaultAllowed ? "✓ Permitido" : "✗ Denegado"}
        </div>
      </div>
      <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 50, background: "rgba(0,0,0,0.3)" }}>
        {OPTIONS.map((o) => {
          const active = state === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 50,
                border: "none",
                background: active ? o.color : "transparent",
                color: active ? "#fff" : DS.textSecondary,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: DS.font,
                letterSpacing: "0.02em",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
