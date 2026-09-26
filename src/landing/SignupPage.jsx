import { AuthLayout } from "./AuthLayout.jsx";

// Registro CERRADO: las cuentas las crea el equipo Inforce desde el panel interno
// (Equipo / Empresas). Esta página solo lo explica y manda al login.
// El auto-registro abierto permitía que cualquiera creara una cuenta y gastara
// el saldo de las APIs de IA (auditoría 2026-09-19).
export function SignupPage({ onGoLogin }) {
  return (
    <AuthLayout
      leftEyebrow="INFORCE"
      leftTitle="Acceso por invitación"
      leftBody="El portal es privado. Tu cuenta la crea el equipo de Inforce Consulting."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>El registro está cerrado</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.8, margin: 0 }}>
          Si ya eres cliente o parte del equipo, pídele tu acceso a tu contacto en Inforce: te llega un
          correo con tu usuario y contraseña. Si ya tienes cuenta, inicia sesión.
        </p>
        <button
          type="button" onClick={onGoLogin}
          style={{
            padding: "12px 18px", borderRadius: 12, border: "none", background: "#fff", color: "#06060A",
            fontSize: 14, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start",
          }}
        >
          Ir a iniciar sesión
        </button>
      </div>
    </AuthLayout>
  );
}
