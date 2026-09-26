// Backend de esta instalación. Nunca cae a servicios o datos de otra instancia.

import { createClient } from "./localClient.js";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/backend';
// Identificador público de compatibilidad para sbFetch; no otorga permisos.
export const BACKEND_ANON_KEY = 'public';
export const database = createClient(BACKEND_URL);

// Marca de error reconocible para distinguir "sesión vencida" de un fallo real de
// permisos. La UI la usa para mostrar "volvé a entrar" en vez del críptico error RLS.
export const SESSION_EXPIRED = "SESION_EXPIRADA";

// Garantiza que HAYA un access token válido antes de una ESCRITURA. Si el token
// venció —típico cuando la MISMA cuenta se usa en dos equipos y la rotación de
// refresh token invalida esta sesión— intenta refrescar; si no puede, lanza
// SESSION_EXPIRED para que la petición NO salga como anónima y choque contra RLS
// con un mensaje confuso. Barato: getSession() lee de localStorage; solo refresca
// si falta el token o está por vencer (<60s).
export async function ensureFreshSession() {
  const { data } = await database.auth.getSession();
  let session = data?.session || null;
  const expiringSoon =
    session?.expires_at && session.expires_at * 1000 - Date.now() < 60_000;
  if (!session || expiringSoon) {
    const { data: refreshed, error } = await database.auth.refreshSession();
    session = refreshed?.session || null;
    if (error || !session) throw new Error(SESSION_EXPIRED);
  }
  return session;
}

// Leer la sesión SIN quedarse colgado.
//
// `database.auth.getSession()` serializa entre pestañas con `navigator.locks`.
// Si otra pestaña se quedó con el candado —una que el navegador suspendió, o una
// que murió a mitad de un refresh de token— esta promesa NO RESUELVE NUNCA. No
// falla: se queda esperando. Y como el arranque del portal la espera para saber
// quién sos, la pantalla se queda girando para siempre.
//
// Es el mismo "Lock inforce-local-auth was not released within 5000ms" que ya
// había atascado la sincronización de tareas, y lo que le pasó a Brahian: tenía
// otra pestaña de Inforce abierta y el portal nunca terminó de arrancar.
//
// Si el candado no suelta a tiempo, se lee la sesión de donde vive igual —el
// localStorage del propio cliente— y se sigue. Peor caso: el token está vencido,
// la primera consulta devuelve 401 y se pide login. Cualquiera de las dos cosas
// es mejor que un spinner eterno.
export async function getSessionSinBloquear(ms = 4000) {
  const porStorage = () => {
    try {
      const raw = localStorage.getItem("inforce-local-auth");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // database-js guarda `{ access_token, refresh_token, user, ... }` o lo
      // envuelve en `currentSession` según la versión.
      const s = parsed?.currentSession || parsed;
      return s?.access_token && s?.user ? s : null;
    } catch { return null; }
  };

  let temporizador;
  const conLimite = new Promise((resolve) => {
    temporizador = setTimeout(() => resolve({ data: { session: porStorage() }, agotado: true }), ms);
  });

  try {
    const res = await Promise.race([
      database.auth.getSession().then((r) => ({ ...r, agotado: false })),
      conLimite,
    ]);
    if (res?.agotado) console.warn("[auth] getSession no respondió en " + ms + "ms — sesión leída del storage");
    return res;
  } catch {
    return { data: { session: porStorage() } };
  } finally {
    clearTimeout(temporizador);
  }
}
