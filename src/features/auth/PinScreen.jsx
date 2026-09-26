// ── PIN SCREEN ────────────────────────────────────────────────────────────────
// Extraído de App.jsx (refactor God-component). Pantalla de login (admin/cliente).
// Recibe todo por props; sin estado global.
import { useState, useRef, useEffect } from "react";
import { DS, darkInput, darkBtn } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";

export default function PinScreen({ mode, companyName, onSuccess, onEmailSuccess, error, setError }) {
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const isClient = mode === "client";
  const { isDark } = useTheme();
  // PIN retirado (Fase C, 2026-07-14): tanto admin como cliente entran SOLO con
  // email + contraseña. El PIN en texto plano era la brecha; ya no se usa.
  const allowPinSwitch = false;
  const [loginMethod, setLoginMethod] = useState("email");
  const pinRef = useRef();
  const emailRef = useRef();

  useEffect(() => {
    if (loginMethod === "pin") pinRef.current?.focus();
    else emailRef.current?.focus();
  }, [loginMethod]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    const ok = await onSuccess(pin.trim());
    if (!ok) {
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setEmailLoading(true);
    setError("");
    try {
      const ok = await onEmailSuccess({ email: email.trim(), password });
      if (!ok) {
        setShake(true);
        setPassword("");
        setTimeout(() => setShake(false), 500);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: DS.font, padding: 24, position: "relative", overflow: "hidden",
    }}>
      {/* Ambient blobs — tokenizados, sutiles en ambos temas */}
      <div style={{ position: "fixed", inset: 0, background: "var(--ambient)", pointerEvents: "none", opacity: isDark ? 0.9 : 0.7 }} />
      <div style={{ position: "fixed", top: "16%", right: "12%", width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${isDark ? "rgba(95,222,240,0.10)" : "rgba(38,100,204,0.08)"} 0%, transparent 70%)`, filter: "blur(70px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "14%", left: "8%", width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, ${isDark ? "rgba(124,98,236,0.08)" : "rgba(110,84,208,0.06)"} 0%, transparent 70%)`, filter: "blur(70px)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 388, position: "relative" }}>
        {/* Marca — logo neón + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, marginBottom: 14,
            background: "rgba(88,166,255,0.14)", display: "grid", placeItems: "center",
            boxShadow: "0 0 0 1px rgba(95,222,240,0.30), 0 0 26px rgba(88,166,255,0.32)",
          }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 8px rgba(95,222,240,0.8))" }}>
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="var(--neon)" />
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)" }}>Inforce</span>
            <span style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink-3)" }}>Portal</span>
          </div>
        </div>

        {/* Card */}
        <div style={{
          position: "relative",
          background: "var(--surface-solid)", borderRadius: 20,
          border: "1px solid var(--line)",
          padding: "32px 28px",
          boxShadow: "var(--shadow-lg)",
          backdropFilter: isDark ? "blur(24px) saturate(1.25)" : "none",
          WebkitBackdropFilter: isDark ? "blur(24px) saturate(1.25)" : "none",
        }}>
          <div style={{ position: "absolute", top: 0, left: "12%", right: "12%", height: 1, background: "linear-gradient(90deg, transparent, var(--line-2), transparent)", borderRadius: 1 }} />

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.02em" }}>
              {isClient ? `Hola, ${companyName}` : "Bienvenido"}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
              {loginMethod === "email"
                ? "Inicia sesión con tu correo para acceder a tu portal."
                : "Ingresa el pin que elegiste para entrar a tu portal."}
            </div>
          </div>

          {loginMethod === "email" ? (
            <form onSubmit={handleEmailSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "var(--ink-2)", display: "block", marginBottom: 6, fontWeight: 500, letterSpacing: "0.04em" }}>
                  Correo
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  onFocus={(e) => { e.target.style.border = "1px solid var(--sel)"; e.target.style.boxShadow = "0 0 0 3px var(--sel-soft)"; }}
                  onBlur={(e) => { e.target.style.border = "1px solid var(--line)"; e.target.style.boxShadow = "none"; }}
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 12,
                    border: "1px solid var(--line)", background: "var(--surface-2)",
                    color: "var(--ink)", fontSize: 14, fontFamily: DS.font,
                    boxSizing: "border-box", outline: "none", transition: "border .15s, box-shadow .15s",
                  }}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: "var(--ink-2)", display: "block", marginBottom: 6, fontWeight: 500, letterSpacing: "0.04em" }}>
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onFocus={(e) => { if (!error) { e.target.style.border = "1px solid var(--sel)"; e.target.style.boxShadow = "0 0 0 3px var(--sel-soft)"; } }}
                  onBlur={(e) => { if (!error) { e.target.style.border = "1px solid var(--line)"; e.target.style.boxShadow = "none"; } }}
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 12,
                    background: "var(--surface-2)", color: "var(--ink)", fontSize: 14,
                    fontFamily: DS.font, boxSizing: "border-box", outline: "none",
                    transition: "border .15s, box-shadow .15s",
                    animation: shake ? "shakePIN 0.4s ease" : "none",
                    border: error ? "1px solid var(--brand)" : "1px solid var(--line)",
                  }}
                />
                {error && (
                  <div style={{ fontSize: 12, color: "var(--brand)", marginTop: 8, textAlign: "center" }}>
                    {error}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={emailLoading}
                style={{
                  width: "100%", padding: "13px", fontSize: 14, borderRadius: 12,
                  border: "1px solid rgba(111,184,255,0.28)",
                  background: "linear-gradient(180deg, #1f2942, #141b2e)",
                  color: "#EFF4FC", fontWeight: 700, fontFamily: DS.font,
                  letterSpacing: "0.01em", cursor: emailLoading ? "default" : "pointer",
                  opacity: emailLoading ? 0.6 : 1,
                  boxShadow: "0 8px 22px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
                  transition: "opacity .15s",
                }}
              >
                {emailLoading ? "Entrando…" : "Iniciar sesión →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePinSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: DS.textSecondary, display: "block", marginBottom: 6, fontWeight: 500, letterSpacing: "0.04em" }}>
                  PIN de acceso
                </label>
                <input
                  ref={pinRef}
                  type="password"
                  value={pin}
                  onChange={e => { setPin(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    ...darkInput,
                    fontSize: 16, letterSpacing: "0.15em", textAlign: "center",
                    animation: shake ? "shakePIN 0.4s ease" : "none",
                    border: error ? `1px solid ${DS.red}88` : DS.border,
                  }}
                />
                {error && (
                  <div style={{ fontSize: 12, color: DS.red, marginTop: 6, textAlign: "center" }}>
                    {error}
                  </div>
                )}
              </div>
              <button type="submit" style={{ ...darkBtn, width: "100%", padding: "12px", fontSize: 14, borderRadius: 12 }}>
                Ingresar →
              </button>
              {/* La página ya existía; nadie la había enlazado desde acá, así que
                  alguien que olvidaba su clave no tenía salida. */}
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <a href="/forgot-password" style={{ fontSize: 12, color: DS.textSecondary, textDecoration: "none" }}>
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
            </form>
          )}

          {/* Switch entre métodos — solo cliente. Admin ya no tiene PIN. */}
          {allowPinSwitch && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <button
                type="button"
                onClick={() => { setLoginMethod(loginMethod === "email" ? "pin" : "email"); setError(""); }}
                style={{
                  background: "transparent", border: "none",
                  color: DS.textMuted, fontSize: 11, cursor: "pointer",
                  textDecoration: "underline", fontFamily: DS.font,
                }}
              >
                {loginMethod === "email" ? "Usar PIN en su lugar" : "Usar correo en su lugar"}
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--ink-4)" }}>
          {isClient ? "¿Problemas? Contacta a tu asesor de Inforce." : "Inforce Consulting · Solo acceso autorizado"}
        </div>
      </div>

      <style>{`
        @keyframes shakePIN {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
