import { useCallback, useEffect, useState } from "react";
import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

// Estar en `team_members` no alcanza: hay que estar ACTIVO.
//
// Sin esto, alguien desactivado entraba a Inforce Central y veía la pantalla
// entera vacía: la interfaz lo dejaba pasar y la base —`is_team_member()`, que
// sí exige `active`— no le devolvía una sola fila. Ni tareas, ni empresas, ni
// nada. Es lo que le pasó a Johan: buscó el portal, cayó en Inforce Central y
// se encontró su nombre arriba y el resto en blanco.
//
// Devolver `null` es lo correcto: para esta pantalla no es del equipo, y de ahí
// lo mandan a su propio workspace de cliente, que es donde sí trabaja.
export const miembroActivo = (row) => (row && row.active !== false ? row : null);

// Team auth hook.
// Returns { session, user, member, loading, error, signIn, signOut, refreshMember }
// - session: database session (or null)
// - user: auth.users object
// - member: fila ACTIVA en public.team_members (null si no existe o está desactivada)
// - loading: true during the initial session check
export function useTeamAuth() {
  const [session, setSession] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMember = useCallback(async (userId, email) => {
    if (!userId) {
      setMember(null);
      return;
    }
    // Primero por id (uid). Con login de Google el uid puede ser nuevo, así que
    // caemos a buscar por email verificado (mismo criterio que is_team_admin()).
    const { data, error: err } = await database
      .from("team_members")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (err) {
      logger.error("loadMember error", err);
      setError(err.message);
      return;
    }
    if (data) {
      setMember(miembroActivo(data));
      return;
    }
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanEmail) {
      const { data: byEmail } = await database
        .from("team_members")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();
      setMember(miembroActivo(byEmail));
      return;
    }
    setMember(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: si getSession() se cuelga (Supabase lento, network),
    // forzamos loading=false a los 6s para mostrar login y no quedarnos
    // pegados en "Verificando sesión..." infinitamente. El user puede
    // intentar entrar manualmente — si su sesión existe, signIn la rehidratará.
    const watchdog = setTimeout(() => {
      if (mounted) {
        logger.warn("[useTeamAuth] getSession timed out after 6s — forcing login screen");
        setLoading(false);
      }
    }, 6000);

    database.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      clearTimeout(watchdog);
      setSession(data.session || null);
      if (data.session?.user?.id) {
        loadMember(data.session.user.id, data.session.user.email).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      if (!mounted) return;
      clearTimeout(watchdog);
      logger.error("[useTeamAuth] getSession failed:", err);
      setError(err?.message || "No se pudo verificar la sesión");
      setLoading(false);
    });

    const { data: listener } = database.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession || null);
      if (newSession?.user?.id) {
        loadMember(newSession.user.id, newSession.user.email);
      } else {
        setMember(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(watchdog);
      listener?.subscription?.unsubscribe?.();
    };
  }, [loadMember]);

  const signIn = useCallback(async (email, password) => {
    setError(null);
    const { data, error: err } = await database.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(err.message);
      return { ok: false, error: err.message };
    }
    return { ok: true, user: data.user };
  }, []);

  const signOut = useCallback(async () => {
    await database.auth.signOut();
    setSession(null);
    setMember(null);
  }, []);

  const refreshMember = useCallback(() => {
    if (session?.user?.id) loadMember(session.user.id, session.user.email);
  }, [session, loadMember]);

  return {
    session,
    user: session?.user || null,
    member,
    loading,
    error,
    signIn,
    signOut,
    refreshMember,
  };
}
