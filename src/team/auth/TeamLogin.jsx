import { useState } from "react";
import { DS, darkInput } from "../../lib/design.js";
import { GoogleButton } from "../../lib/GoogleButton.jsx";

export function TeamLogin({ onSignIn, error: externalError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const error = localError || externalError;

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError("Completa email y contraseña.");
      return;
    }
    setLoading(true);
    setLocalError("");
    const res = await onSignIn(email, password);
    setLoading(false);
    if (!res?.ok) {
      setLocalError(res?.error || "No se pudo iniciar sesión.");
    }
  };

  return (
    <div
      style={{
        background: DS.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: DS.font,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "30%",
          width: 400,
          height: 400,
          background: "radial-gradient(circle, rgba(55,138,221,0.1) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          right: "25%",
          width: 360,
          height: 360,
          background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <form
        onSubmit={submit}
        style={{
          position: "relative",
          width: 380,
          background: DS.bgCard,
          borderRadius: 20,
          border: DS.border,
          padding: "36px 32px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: DS.blue,
            letterSpacing: "0.22em",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          INFORCE CENTRAL
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: DS.textPrimary,
            letterSpacing: "-0.02em",
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          War Room
        </div>
        <div
          style={{
            fontSize: 12,
            color: DS.textSecondary,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          Zona de equipo
        </div>

        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            color: DS.textSecondary,
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setLocalError("");
          }}
          placeholder="tucorreo@inforce.com"
          style={{ ...darkInput, marginBottom: 14 }}
        />

        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            color: DS.textSecondary,
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          Contraseña
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setLocalError("");
          }}
          placeholder="••••••••"
          style={{
            ...darkInput,
            marginBottom: error ? 8 : 18,
            borderColor: error ? "rgba(226,75,74,0.5)" : undefined,
          }}
        />

        {error && (
          <div
            style={{
              fontSize: 12,
              color: DS.red,
              textAlign: "center",
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 22px",
            borderRadius: 50,
            border: "none",
            background: loading ? DS.textSecondary : DS.textPrimary,
            color: DS.bg,
            cursor: loading ? "wait" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            fontFamily: DS.font,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Entrando…" : "Entrar al War Room"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
          <span style={{ fontSize: 11, color: DS.textMuted }}>o</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
        </div>

        <GoogleButton redirectTo={`${window.location.origin}/equipo`} />

        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: DS.border,
            fontSize: 11,
            color: DS.textMuted,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Tu sesión queda guardada — no tendrás que volver a entrar.
          <br />
          <a
            href="/"
            style={{ color: DS.textSecondary, textDecoration: "none", marginTop: 6, display: "inline-block" }}
          >
            ← Ir al portal de clientes
          </a>
        </div>
      </form>
    </div>
  );
}
