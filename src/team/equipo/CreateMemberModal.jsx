// Modal de creación de un integrante de Inforce Central.
//
// Sólo accesible si currentMember.role === 'admin'. Llama al endpoint
// server-side /api/admin-create-member que crea auth user + team_member.
//
// UX: incluye botón "generar contraseña segura" y "copiar credenciales"
// para que Jose le pase email+pass al nuevo miembro directamente.

import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, DEFAULT_MEMBER_COLORS } from "../../lib/design.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { generarClave } from "./clave.js";

const ROLES = [
  { value: "admin",  label: "Admin",  desc: "Acceso total" },
  { value: "member", label: "Member", desc: "Operaciones — empresas, tareas, tracking" },
  { value: "editor", label: "Editor", desc: "Contenido, guiones (read-only)" },
];

// El generador vive en clave.js y lo comparte con "Cambiar contraseña" del perfil.
// Tenerlo dos veces significaba que endurecerlo en un lado dejaba el otro flojo.
const generatePassword = generarClave;

export function CreateMemberModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [color, setColor] = useState(DEFAULT_MEMBER_COLORS?.[0] || "#378ADD");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const pass = generatePassword();
    setPassword(pass);
    setShowPass(true);
  };

  const handleCopyCreds = async () => {
    if (!email || !password) return;
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nContraseña: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — algunos browsers necesitan https
    }
  };

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password || !role) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const headers = await buildApiHeaders();
      const res = await fetch("/api/admin-create-member", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          color,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onCreated?.(data);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
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
      <div style={{
        background: DS.bgSide,
        border: DS.border,
        borderRadius: 18,
        padding: 28,
        width: "100%",
        maxWidth: 520,
        color: DS.textPrimary,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Agregar integrante</div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 22 }}>
          Creá un usuario nuevo. Le vas a pasar email + contraseña para que pueda entrar.
        </div>

        {/* Nombre */}
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Camila"
            style={darkInput}
          />
        </Field>

        {/* Email */}
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="camila@inforce.com"
            style={darkInput}
          />
        </Field>

        {/* Password */}
        <Field label="Contraseña inicial">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mín 8 caracteres"
              style={{ ...darkInput, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              style={{ ...darkBtnGhost, padding: "8px 12px" }}
              title={showPass ? "Ocultar" : "Mostrar"}
            >
              {showPass ? "🙈" : "👁"}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              style={{ ...darkBtnGhost, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}
              title="Generar contraseña segura"
            >
              ✨ Generar
            </button>
          </div>
        </Field>

        {/* Rol */}
        <Field label="Rol">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ROLES.map((r) => (
              <label
                key={r.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${role === r.value ? color : DS.textHint}`,
                  background: role === r.value ? `${color}14` : "transparent",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: DS.textMuted }}>{r.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 6 }}>
            Después de crear, podés afinar los permisos por miembro desde su perfil.
          </div>
        </Field>

        {/* Color */}
        <Field label="Color del avatar">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(DEFAULT_MEMBER_COLORS || ["#378ADD", "#8B5CF6", "#1DB97A", "#F5A623", "#E24B4A", "#EC4899", "#06B6D4"]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? `3px solid ${DS.textPrimary}` : "2px solid transparent",
                  cursor: "pointer",
                  outline: "none",
                }}
                title={c}
              />
            ))}
          </div>
        </Field>

        {/* Copiar credenciales (sólo si email + pass) */}
        {email && password && (
          <button
            type="button"
            onClick={handleCopyCreds}
            style={{
              ...darkBtnGhost,
              padding: "8px 14px",
              fontSize: 11,
              marginBottom: 14,
              width: "100%",
            }}
          >
            {copied ? "✓ Copiado al portapapeles" : "📋 Copiar email + contraseña"}
          </button>
        )}

        {error && (
          <div style={{
            padding: 10,
            borderRadius: 8,
            background: "rgba(226,75,74,0.12)",
            border: "1px solid rgba(226,75,74,0.4)",
            color: DS.red,
            fontSize: 12,
            marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} style={darkBtnGhost}>Cancelar</button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !email.trim() || !password || password.length < 8}
            style={{ ...darkBtn, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Creando..." : "Crear integrante"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block",
        fontSize: 10,
        fontWeight: 700,
        color: DS.textMuted,
        letterSpacing: "0.12em",
        marginBottom: 6,
        textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}
