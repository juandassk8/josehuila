import { database } from "./backend.js";

// Inicia el login con Google (OAuth vía Supabase). `redirectTo` debe ser un path
// que preserve el `?code=` de vuelta: usar `${origin}/equipo`, `${origin}/cliente/<slug>`,
// `${origin}/app` o `${origin}/` — NO un path de un solo segmento no reservado.
export async function signInWithGoogle(redirectTo) {
  return database.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo || window.location.origin,
      // Muestra el selector de cuenta (útil si tienen varias cuentas de Google).
      queryParams: { prompt: "select_account" },
    },
  });
}
