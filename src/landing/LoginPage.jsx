import { useState } from "react";
import { AuthLayout, AUTH_STYLES } from "./AuthLayout.jsx";
import { signInWithEmail } from "./auth_db.js";

export function LoginPage({ onLoginSuccess, onGoSignup, onGoForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Pon tu email y contraseña."); return; }
    setBusy(true);
    const { user, error: err } = await signInWithEmail({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) { setError(err.message || "Credenciales incorrectas."); return; }
    onLoginSuccess?.(user);
  };

  return (
    <AuthLayout
      leftEyebrow="Iniciar sesión"
      leftTitle="Bienvenido de vuelta."
      leftBody="Volvé a tu workspace. Tus reportes, despliegues, tareas y todo el contexto del equipo donde lo dejaste."
      leftFootnote="© Inforce · Datos privados por workspace"
    >
      <form onSubmit={submit}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
          Iniciá sesión
        </h2>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 22 }}>
          Con tu email y contraseña
        </div>

        {error && <div style={AUTH_STYLES.errorBox}>{error}</div>}

        <div style={{ marginBottom: 14 }}>
          <label style={AUTH_STYLES.inputLabel}>Email</label>
          <input
            type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="vos@empresa.com"
            style={AUTH_STYLES.input}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={AUTH_STYLES.inputLabel}>Contraseña</label>
          <input
            type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            style={AUTH_STYLES.input}
          />
        </div>
        <div style={{ marginBottom: 22, textAlign: "right" }}>
          <button onClick={(e) => { e.preventDefault(); onGoForgot?.(); }} style={AUTH_STYLES.ghostLink}>
            Olvidé mi contraseña
          </button>
        </div>

        <button
          type="submit" disabled={busy}
          style={{ ...AUTH_STYLES.primaryBtn, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Entrando…" : "Iniciar sesión"}
        </button>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>
          ¿No tenés cuenta? <button onClick={(e) => { e.preventDefault(); onGoSignup?.(); }} style={AUTH_STYLES.ghostLink}>Empezar prueba gratis</button>
        </div>
      </form>
    </AuthLayout>
  );
}
