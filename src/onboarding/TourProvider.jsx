import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DS } from "../lib/design.js";

// react-joyride (~130 kB gzip) se carga SOLO cuando corre un tour → fuera del
// bundle inicial. STATUS/EVENTS son strings estables de la lib.
const Joyride = lazy(() => import("react-joyride"));
const STATUS = { FINISHED: "finished", SKIPPED: "skipped" };
const EVENTS = { STEP_AFTER: "step:after", TARGET_NOT_FOUND: "error:target_not_found" };
import { useTheme } from "../lib/theme.jsx";
import { TOURS, detectTourForPath } from "./tours_config.js";
import { markTourCompleted } from "./onboarding_db.js";

// Context que expone `triggerTour(key)` a cualquier componente (para el botón
// "?" de cada sección). También auto-dispara el tour de la sección actual
// si el usuario nunca lo vio (detecta por path + tours_completed).

const TourContext = createContext({ triggerTour: () => {} });

export function useTour() {
  return useContext(TourContext);
}

export function TourProvider({ identity, toursCompleted, onTourCompleted, children }) {
  const { isDark } = useTheme();
  const [activeTourKey, setActiveTourKey] = useState(null);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Anti-loop: no volver a auto-trigger la misma sección en este mount.
  const autoTriggeredRef = useRef(new Set());

  // Auto-trigger del tour si:
  //   1. Hay identity onboarding target
  //   2. El tour aplica al path actual
  //   3. No está en tours_completed
  //   4. No se auto-triggereó en este mount
  useEffect(() => {
    if (!identity?.isOnboardingTarget || !Array.isArray(toursCompleted)) return;
    const check = () => {
      const path = window.location.pathname;
      const tourKey = detectTourForPath(path);
      if (!tourKey) return;
      if (autoTriggeredRef.current.has(tourKey)) return;
      if (toursCompleted.includes(tourKey)) return;
      // Delay corto para que el DOM de la sección ya esté pintado.
      autoTriggeredRef.current.add(tourKey);
      setTimeout(() => startTour(tourKey), 800);
    };
    check();
    const onPathChange = () => check();
    window.addEventListener("popstate", onPathChange);
    window.addEventListener("pathchange", onPathChange);
    return () => {
      window.removeEventListener("popstate", onPathChange);
      window.removeEventListener("pathchange", onPathChange);
    };
  }, [identity?.isOnboardingTarget, toursCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTour = useCallback((tourKey) => {
    if (!TOURS[tourKey]) return;
    setActiveTourKey(tourKey);
    setStepIndex(0);
    setRun(true);
  }, []);

  const triggerTour = useCallback((tourKey) => {
    // Explicit trigger (botón "?") — siempre dispara aunque esté completed.
    startTour(tourKey);
  }, [startTour]);

  const handleCallback = useCallback(async (data) => {
    const { status, type, index, action } = data;
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Avanza/retrocede manualmente.
      if (action === "next") setStepIndex(index + 1);
      else if (action === "prev") setStepIndex(Math.max(0, index - 1));
    }
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRun(false);
      const finishedKey = activeTourKey;
      setActiveTourKey(null);
      setStepIndex(0);
      if (finishedKey && identity?.identityKey) {
        try {
          await markTourCompleted(identity.identityKey, finishedKey);
          onTourCompleted?.(finishedKey);
        } catch { /* fail-silent */ }
      }
    }
  }, [activeTourKey, identity?.identityKey, onTourCompleted]);

  const activeTour = activeTourKey ? TOURS[activeTourKey] : null;

  // Color de marca Inforce — verde principal del DS.
  const brand = DS.green; // #1DB97A
  const styles = {
    options: {
      zIndex: 9997,
      primaryColor: brand,
      backgroundColor: isDark ? "#14141A" : "#FFFFFF",
      arrowColor: isDark ? "#14141A" : "#FFFFFF",
      textColor: isDark ? "#EBEBEB" : "#1A1D1C",
      overlayColor: "rgba(0, 0, 0, 0.72)",
    },
    tooltip: {
      borderRadius: 16,
      padding: "20px 22px",
      fontFamily: DS.font,
      fontSize: 13.5,
      lineHeight: 1.6,
      boxShadow: "0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(29,185,122,0.18)",
      border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.05)",
      maxWidth: 380,
    },
    tooltipTitle: {
      fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em",
      marginBottom: 8,
      color: isDark ? "#FFFFFF" : "#1A1D1C",
    },
    tooltipContent: {
      padding: 0,
      color: isDark ? "rgba(235,235,235,0.85)" : "#3A3D3C",
    },
    tooltipFooter: {
      marginTop: 16,
    },
    buttonNext: {
      background: brand,
      color: "#FFFFFF",
      fontSize: 12, fontWeight: 700,
      padding: "8px 16px", borderRadius: 50,
      outline: "none",
      letterSpacing: "0.02em",
    },
    buttonBack: {
      color: isDark ? "rgba(255,255,255,0.55)" : "#5A5E5C",
      fontSize: 12, fontWeight: 600,
      marginRight: 8,
    },
    buttonSkip: {
      color: DS.textMuted, fontSize: 11, fontWeight: 600,
    },
    buttonClose: {
      display: "none",
    },
    spotlight: {
      borderRadius: 12,
      boxShadow: `0 0 0 3px ${brand}, 0 0 0 9999px rgba(0,0,0,0.72)`,
    },
  };

  return (
    <TourContext.Provider value={{ triggerTour, activeTourKey }}>
      {children}
      {activeTour && (
        <Suspense fallback={null}>
        <Joyride
          steps={activeTour.steps}
          run={run}
          stepIndex={stepIndex}
          continuous
          showSkipButton
          showProgress
          disableOverlayClose
          hideCloseButton
          disableBeacon
          spotlightPadding={8}
          scrollOffset={100}
          locale={{
            back: "← Atrás",
            close: "Cerrar",
            last: "Listo ✓",
            next: "Siguiente →",
            nextLabelWithProgress: "Siguiente ({step}/{steps})",
            skip: "Saltar tutorial",
          }}
          callback={handleCallback}
          styles={styles}
        />
        </Suspense>
      )}
    </TourContext.Provider>
  );
}

// Botón "?" que dispara manualmente el tour de la sección actual (o el que
// se le pase explícitamente por prop). Se usa como acción en el Topbar.
export function TourReplayButton({ tourKey, size = "sm", children }) {
  const { triggerTour } = useTour();
  const [autoKey, setAutoKey] = useState(null);

  useEffect(() => {
    if (tourKey) return; // explicit pasado por prop
    const resolve = () => setAutoKey(detectTourForPath(window.location.pathname));
    resolve();
    window.addEventListener("popstate", resolve);
    window.addEventListener("pathchange", resolve);
    return () => {
      window.removeEventListener("popstate", resolve);
      window.removeEventListener("pathchange", resolve);
    };
  }, [tourKey]);

  const key = tourKey || autoKey;
  if (!key) return null;

  const padding = size === "sm" ? "5px 10px" : "7px 14px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <button
      onClick={() => triggerTour(key)}
      title="Ver tutorial de esta sección"
      style={{
        padding,
        borderRadius: 50,
        border: `1px solid ${DS.textHint}`,
        background: "transparent",
        color: DS.textSecondary,
        fontSize, fontWeight: 600,
        cursor: "pointer", fontFamily: DS.font,
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      <span>?</span>
      <span>{children || "Tutorial"}</span>
    </button>
  );
}
