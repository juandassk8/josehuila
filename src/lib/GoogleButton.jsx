import { useState } from "react";
import { signInWithGoogle } from "./googleAuth.js";
import { useTheme } from "./theme.jsx";

// Botón "Continuar con Google" reutilizable. redirectTo = a dónde volver tras el
// login (ej. `${window.location.origin}/equipo`).
//
// `dark` venía fijo en `true` y ninguno de los dos sitios que lo usan se lo pasaba,
// así que en tema claro el botón quedaba con letra blanca sobre fondo blanco: se leía
// la G de colores y nada más. Ahora sale del tema de verdad, y el parámetro queda solo
// por si alguna vez hay que forzarlo.
export function GoogleButton({ redirectTo, label = "Continuar con Google", dark }) {
  const { isDark } = useTheme();
  const oscuro = dark ?? isDark;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onClick = async () => {
    setLoading(true);
    setError("");
    const { error: err } = await signInWithGoogle(redirectTo);
    if (err) {
      setError(err.message || "No se pudo abrir Google.");
      setLoading(false);
    }
    // En éxito, el navegador redirige a Google — no reseteamos loading.
  };

  // OAuth externo se configura aparte; el acceso local no depende de Google.
  if (import.meta.env.VITE_GOOGLE_AUTH_ENABLED !== 'true') return null;
  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "11px 18px",
          borderRadius: 50,
          border: oscuro ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.18)",
          background: oscuro ? "rgba(255,255,255,0.04)" : "#fff",
          color: oscuro ? "#fff" : "#1f2328",
          cursor: loading ? "wait" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = oscuro ? "rgba(255,255,255,0.09)" : "#f6f7f8"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = oscuro ? "rgba(255,255,255,0.04)" : "#fff"; }}
      >
        <GoogleG />
        {loading ? "Abriendo Google…" : label}
      </button>
      {error && <div style={{ fontSize: 11, color: "#E24B4A", textAlign: "center", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
