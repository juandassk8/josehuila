// Helper para construir headers con el JWT actual de Supabase Auth.
// El endpoint server-side lo valida y otorga bypass de rate limits a team
// Inforce admins / reviewers. Si no hay sesión (cliente entrando con PIN),
// solo devuelve Content-Type — el endpoint trata como llamada anónima y
// aplica el rate limit normal.

import { database } from "./backend.js";

export async function buildApiHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  try {
    const { data } = await database.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // sin session: deja headers básicos
  }
  return headers;
}

// Igual que buildApiHeaders pero SIN Content-Type — para requests multipart/
// FormData (ej: /api/transcribe) donde el browser tiene que fijar el boundary.
// Solo agrega Authorization si hay sesión de Supabase Auth.
export async function buildAuthHeadersOnly(extra = {}) {
  const headers = { ...extra };
  try {
    const { data } = await database.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // sin session: deja headers vacíos
  }
  return headers;
}
