import { useEffect, useMemo, useState, useCallback } from "react";
import { useOnboardingIdentity } from "./useOnboardingIdentity.js";
import { getProgress } from "./onboarding_db.js";
import { WelcomeModal } from "./WelcomeModal.jsx";
import { VideoOnboarding } from "./VideoOnboarding.jsx";
import { onOpenTutorials } from "./sidebar_highlight.js";
import { TourProvider, useTour } from "./TourProvider.jsx";
import { detectTourForPath } from "./tours_config.js";
import { DS } from "../lib/design.js";

// Orquesta el sistema de onboarding completo:
//   1. Resuelve la identity del usuario
//   2. Carga su progress (welcome_modal_completed + tours_completed)
//   3. Muestra el WelcomeModal si nunca lo vio
//   4. Provee el TourContext para que cualquier sección dispare/detecte tours
//
// Se monta UNA VEZ a nivel root en main.jsx, alrededor del Router.

export function OnboardingHost({ children }) {
  const identity = useOnboardingIdentity();
  const [progress, setProgress] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showVideoOnboarding, setShowVideoOnboarding] = useState(false);
  // Modo manual: cualquiera (incluso admin) puede abrir los tutoriales con el
  // botón "Ver tutoriales". No afecta el estado de DB de la identity.
  const [manualReplay, setManualReplay] = useState(false);

  useEffect(() => {
    return onOpenTutorials(() => setManualReplay(true));
  }, []);

  // Cargar progress cuando cambia la identity
  useEffect(() => {
    if (!identity?.identityKey) { setProgress(null); return; }
    let cancelled = false;
    (async () => {
      const p = await getProgress(
        identity.identityKey,
        identity.displayName,
        identity.displayEmail,
      );
      if (cancelled) return;
      setProgress(p);
      // Sólo a clientes/owners — admin global y team Inforce no.
      if (!identity.isOnboardingTarget || !p) return;
      // Prioridad: video tutorial primero (es el flow nuevo). Si no
      // ha sido completado ni saltado, lo mostramos.
      const videoSeen = p.video_tutorial_completed_at || p.video_tutorial_skipped_at;
      if (!videoSeen) {
        setShowVideoOnboarding(true);
        return;
      }
      // Fallback: si por alguna razón el welcome viejo nunca se vio
      // y el video tutorial sí — no lo molestamos. El welcome viejo
      // queda obsoleto.
      if (!p.welcome_modal_completed && !p.video_tutorial_completed_at && !p.video_tutorial_skipped_at) {
        setShowWelcome(true);
      }
    })();
    return () => { cancelled = true; };
  }, [identity?.identityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTourCompleted = useCallback((tourKey) => {
    setProgress((p) => {
      if (!p) return p;
      const tours = Array.isArray(p.tours_completed) ? p.tours_completed : [];
      if (tours.includes(tourKey)) return p;
      return { ...p, tours_completed: [...tours, tourKey] };
    });
  }, []);

  const goToTeam = () => {
    // Workspace cliente con company → /cliente/:slug/equipo (no existe)
    // Mejor: navegar al portal de la empresa, sección equipo.
    // Por ahora, redirigimos a la home del workspace (donde queda el botón
    // de equipo). El onboarding del flow real se completa ahí.
    if (identity?.companyName && identity.isOwner) {
      const slug = (identity.companyName || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      window.location.assign(`/cliente/${slug}`);
    }
    // Si no podemos resolver, simplemente cerramos.
  };

  // Estabilizar la referencia — `[]` literal era nuevo cada render, lo que
  // disparaba el useEffect del TourProvider en cada render del host.
  const toursCompleted = useMemo(
    () => progress?.tours_completed || [],
    [progress?.tours_completed]
  );

  return (
    <TourProvider
      identity={identity}
      toursCompleted={toursCompleted}
      onTourCompleted={handleTourCompleted}
    >
      {children}
      {showVideoOnboarding && !manualReplay && (
        <VideoOnboarding
          identity={identity}
          initialStep={-1}
          persistProgress={true}
          onClose={() => {
            setShowVideoOnboarding(false);
            setProgress((p) => p ? { ...p, video_tutorial_completed_at: p.video_tutorial_completed_at || new Date().toISOString() } : p);
          }}
        />
      )}
      {manualReplay && (
        <VideoOnboarding
          identity={identity}
          initialStep={-1}
          persistProgress={false}
          onClose={() => setManualReplay(false)}
        />
      )}
      {showWelcome && !showVideoOnboarding && !manualReplay && (
        <WelcomeModal
          identity={identity}
          onClose={() => setShowWelcome(false)}
          onGoToTeam={goToTeam}
        />
      )}
      {/* FloatingTourButton removido — el único entrypoint a tutoriales ahora
          es el botón "🎬 Ver tutoriales" en el sidebar. */}
    </TourProvider>
  );
}

// Botón flotante que aparece arriba a la derecha cuando la sección actual
// tiene un tour disponible. Se posiciona evitando colisión con el botón
// Feedback (abajo derecha). Usa useTour del context.
function FloatingTourButton() {
  const { triggerTour } = useTour();
  const [tourKey, setTourKey] = useState(null);

  useEffect(() => {
    const resolve = () => setTourKey(detectTourForPath(window.location.pathname));
    resolve();
    window.addEventListener("popstate", resolve);
    window.addEventListener("pathchange", resolve);
    // También chequea cada 2s — fallback por si la SPA cambia path sin
    // disparar popstate (algunos routers internos lo hacen).
    const t = setInterval(resolve, 2000);
    return () => {
      window.removeEventListener("popstate", resolve);
      window.removeEventListener("pathchange", resolve);
      clearInterval(t);
    };
  }, []);

  if (!tourKey) return null;

  return (
    <button
      onClick={() => triggerTour(tourKey)}
      title="Ver tutorial de esta sección"
      style={{
        position: "fixed",
        bottom: 22,
        right: 138, // a la izquierda del botón Feedback
        zIndex: 9997,
        padding: "10px 16px",
        borderRadius: 50,
        border: "1px solid rgba(29,185,122,0.40)",
        background: "rgba(29,185,122,0.10)",
        color: "#1DB97A",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: DS.font,
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 14px rgba(29,185,122,0.22)",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        letterSpacing: "0.02em",
        transition: "transform 120ms ease, background 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(29,185,122,0.18)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(29,185,122,0.10)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: "50%",
        background: "#1DB97A", color: "#FFFFFF",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800,
      }}>?</span>
      <span>Tutorial</span>
    </button>
  );
}
