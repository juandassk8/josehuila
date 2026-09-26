import { useState } from "react";
import { AuthLayout, AUTH_STYLES } from "./AuthLayout.jsx";
import { requestPasswordReset } from "./auth_db.js";

export function ForgotPasswordPage({ onGoLogin }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Pon tu email."); return; }
    setBusy(true);
    const { error: err } = await requestPasswordReset(email.trim().toLowerCase());
    setBusy(false);
    if (err) { setError(err.message || "No se pudo enviar el email."); return; }
    setSent(true);
  };

  return (
    <AuthLayout
      leftEyebrow="Recuperar acceso"
      leftTitle="Reseteá tu contraseña."
      leftBody="Te mandamos un email con un link seguro para que crees una contraseña nueva. El link expira en 1 hora."
      leftFootnote="© Inforce"
    >
      {!sent ? (
        <form onSubmit={submit}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
            Olvidaste tu contraseña
          </h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 22 }}>
            Te mandamos un link para resetearla
          </div>

          {error && <div style={AUTH_STYLES.errorBox}>{error}</div>}

          <div style={{ marginBottom: 22 }}>
            <label style={AUTH_STYLES.inputLabel}>Email</label>
            <input
              type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@empresa.com"
              style={AUTH_STYLES.input}
            />
          </div>

          <button
            type="submit" disabled={busy}
            style={{ ...AUTH_STYLES.primaryBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Enviando…" : "Mandar link de reseteo"}
          </button>

          <div style={{ marginTop: 18, textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>
            <button onClick={(e) => { e.preventDefault(); onGoLogin?.(); }} style={AUTH_STYLES.ghostLink}>
              ← Volver al login
            </button>
          </div>
        </form>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📧</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 12px" }}>
            Revisá tu email
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.7)", marginBottom: 22 }}>
            Si <strong>{email}</strong> está registrado, te mandamos un link para resetear tu contraseña.
            El link expira en 1 hora.
          </p>
          <button onClick={onGoLogin} style={AUTH_STYLES.primaryBtn}>
            Volver al login
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
