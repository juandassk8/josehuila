import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { PORTAL_HOST } from "../../lib/urls.js";

// Modal admin: crear el acceso real (email+contraseña) de un cliente.
// Llama a /api/admin-create-client-user (gate team-admin server-side). Al crear,
// muestra las credenciales para que el admin se las pase al cliente.
export function ClientAccessModal({ company, onClose, onDone }) {
  const already = !!company?.owner_user_id;
  const [email, setEmail] = useState(() => {
    const e = company?.email || "";
    // No prellenamos emails internos/falsos.
    return /@inforce\.(cliente|team)$/i.test(e) ? "" : e;
  });
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const downOnBackdrop = useRef(false);

  // Gestión de una empresa YA migrada: cambiar email / resetear contraseña.
  const [manageEmail, setManageEmail] = useState(company?.email || "");
  const [managePassword, setManagePassword] = useState("");

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const makePassword = () => {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    const arr = new Uint32Array(14);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    return out;
  };
  const genPassword = () => setPassword(makePassword());

  // Resetear/cambiar acceso de una empresa ya migrada.
  const manage = async ({ withNewPassword }) => {
    const body = { companyId: company.id };
    if (manageEmail.trim() && manageEmail.trim().toLowerCase() !== (company.email || "").toLowerCase()) {
      body.newEmail = manageEmail.trim();
    }
    if (withNewPassword) body.newPassword = managePassword || makePassword();
    if (!body.newEmail && !body.newPassword) {
      setError("Cambiá el email o generá una contraseña nueva.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-create-client-user", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDone({
        email: body.newEmail || company.email,
        password: body.newPassword || "(sin cambios)",
      });
      onDone?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      setError("Poné un email válido y una contraseña de 8+ caracteres.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-create-client-user", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ companyId: company.id, email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDone({ email: email.trim(), password });
      onDone?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const copyCreds = () => {
    const txt = `Acceso a tu portal (${company.name}):\nEmail: ${done.email}\nContraseña: ${done.password}\nEntrá en: ${PORTAL_HOST}/cliente/${company.slug || ""}`;
    navigator.clipboard?.writeText(txt).catch(() => {});
  };

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget && !saving) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div onMouseDown={(e) => e.stopPropagation()} style={{
        width: "min(480px, 100%)", background: DS.bgSide, border: `1px solid ${DS.textHint}`,
        borderRadius: 16, padding: "24px 26px", color: DS.textPrimary,
        boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6 }}>
          Acceso de cliente · {company?.name}
        </div>

        {done ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>✅ {already ? "Acceso actualizado" : "Acceso creado"}</h2>
            <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, margin: "0 0 14px" }}>
              Pasale estas credenciales al cliente. <strong>Guardalas ahora</strong> — la contraseña no se vuelve a mostrar.
            </p>
            <div style={{ padding: 12, borderRadius: 10, border: DS.border, background: DS.bgCard, fontSize: 13, lineHeight: 1.7 }}>
              <div><span style={{ color: DS.textMuted }}>Email:</span> <strong>{done.email}</strong></div>
              <div><span style={{ color: DS.textMuted }}>Contraseña:</span> <strong style={{ fontFamily: "monospace" }}>{done.password}</strong></div>
              <div style={{ color: DS.textMuted, fontSize: 11, marginTop: 4 }}>{PORTAL_HOST}/cliente/{company.slug || ""}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={copyCreds} style={ghostBtn}>Copiar</button>
              <button onClick={onClose} style={primaryBtn}>Listo</button>
            </div>
          </>
        ) : already ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Gestionar acceso</h2>
            <p style={{ fontSize: 12, color: DS.textMuted, margin: "0 0 16px" }}>
              Esta empresa ya tiene login real. Podés cambiar su email o resetear la contraseña.
            </p>
            <Field label="Email del cliente">
              <input value={manageEmail} onChange={(e) => setManageEmail(e.target.value)} type="email" style={inputStyle} />
            </Field>
            <Field label="Nueva contraseña (opcional)">
              <div style={{ display: "flex", gap: 8 }}>
                <input value={managePassword} onChange={(e) => setManagePassword(e.target.value)}
                  placeholder="dejá vacío para no cambiarla" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setManagePassword(makePassword())} style={ghostBtn}>Generar</button>
              </div>
            </Field>
            {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={onClose} disabled={saving} style={ghostBtn}>Cerrar</button>
              <button onClick={() => manage({ withNewPassword: !!managePassword })} disabled={saving}
                style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Crear acceso</h2>
            <p style={{ fontSize: 12, color: DS.textMuted, margin: "0 0 16px" }}>
              Le crea al cliente un login real de email + contraseña. Reemplaza el PIN.
            </p>
            <Field label="Email del cliente">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                placeholder="cliente@sudominio.com" style={inputStyle} />
            </Field>
            <Field label="Contraseña">
              <div style={{ display: "flex", gap: 8 }}>
                <input value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="mínimo 8 caracteres" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={genPassword} style={ghostBtn} title="Generar contraseña">Generar</button>
              </div>
            </Field>
            {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={onClose} disabled={saving} style={ghostBtn}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Creando…" : "Crear acceso"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border,
  background: DS.bgCard, color: DS.textPrimary, fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
const primaryBtn = {
  padding: "9px 20px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};
