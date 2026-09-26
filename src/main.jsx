import { StrictMode, lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import InforceReports, { ErrorBoundary } from './App.jsx'
import { ThemeProvider } from './lib/theme.jsx'
import { database } from './lib/backend.js'
import { matchZone, isReservedTopSegment, replacePath } from './lib/router.jsx'
import { legacyHashToPath } from './lib/urls.js'
import { FeedbackWidget } from './feedback/FeedbackWidget.jsx'
import { useFeedbackReporter } from './feedback/useFeedbackReporter.js'
import { OnboardingHost } from './onboarding/OnboardingHost.jsx'
import { CensorProvider } from './lib/censor.jsx'
import { ImportQueueWidget } from "./imports/ImportQueueWidget.jsx";
import { NotificationsBell } from './notifications/NotificationsBell.jsx'

const TeamApp = lazy(() => import('./team/TeamApp.jsx'))
const CreativeConnect = lazy(() => import('./team/creative_images/CreativeConnect.jsx'))
const FormularioPage = lazy(() => import('./formulario/FormularioPage.jsx'))

const teamFallback = (
  <div
    style={{
      background: '#06060A',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.35)',
      fontFamily: "'Inter','DM Sans',sans-serif",
      fontSize: 13,
      letterSpacing: '0.08em',
    }}
  >
    Cargando War Room…
  </div>
)

// Compat redirects: normaliza URLs viejas a pathname canónico ANTES de montar.
// Se ejecuta una sola vez en module load; modifica `window.history` sin recargar.
//
// Casos:
//   ?zona=equipo                → /equipo
//   ?cliente=slug               → /cliente/slug (preservando subpath si existe)
//   #/empresas, #/warroom       → /equipo/empresas, /equipo/warroom
//   /nombre-empresa (legacy)    → /cliente/nombre-empresa
//
// La mayoría de visitas en producción vienen con ?cliente= o sin query — esos
// son los caminos que más importa no romper.
function applyCompatRedirects() {
  if (typeof window === "undefined") return;

  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);

  // ?zona=equipo → /equipo
  if (params.get("zona") === "equipo") {
    params.delete("zona");
    const qs = params.toString();
    replacePath(`/equipo${qs ? `?${qs}` : ""}`);
    return;
  }

  // ?cliente=slug → /cliente/slug (si path no está ya bajo /cliente)
  const clienteSlug = params.get("cliente");
  if (clienteSlug && !pathname.startsWith("/cliente/")) {
    params.delete("cliente");
    const qs = params.toString();
    // Si el usuario vino con /slug viejo + ?cliente=slug, el path pierde y se
    // reemplaza con /cliente/slug.
    let targetPath = `/cliente/${clienteSlug}`;
    // Si tenía un subpath tipo /slug/reporte/123, mover a /cliente/slug/reporte/123.
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && !isReservedTopSegment(parts[0])) {
      targetPath = `/cliente/${clienteSlug}/${parts.slice(1).join("/")}`;
    }
    replacePath(`${targetPath}${qs ? `?${qs}` : ""}`);
    return;
  }

  // Hash legacy del equipo: #/empresas, #/warroom/..., #/space/<id>, etc.
  // Solo redirigir cuando el pathname es root o desconocido. Si ya estamos
  // bajo /cliente, /admin o /equipo, el hash es vestigial (p.ej. un link
  // viejo compartido de War Room) — lo limpiamos sin cambiar de zona.
  if (hash && hash.startsWith("#/")) {
    const topSegment = pathname.split("/").filter(Boolean)[0];
    const isUnderKnownZone = topSegment === "cliente" || topSegment === "admin" || topSegment === "equipo";
    if (isUnderKnownZone) {
      // Solo limpiar el hash, mantener pathname.
      replacePath(pathname + (search || ""));
      return;
    }
    const target = legacyHashToPath(hash);
    if (target) {
      replacePath(target);
      return;
    }
  }

  // Legacy /:slug (single segment no reservado) → /cliente/:slug
  // Tratamiento conservador: solo redirige si exactamente UN segmento y no es
  // reservado. Deja pasar /admin, /equipo, /cliente, /api.
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 1 && !isReservedTopSegment(parts[0])) {
    replacePath(`/cliente/${parts.join("/")}`);
    return;
  }
}

function Router() {
  const [zone, setZone] = useState(() => {
    if (typeof window === "undefined") return "loading";
    return matchZone(window.location.pathname).zone;
  });
  const [sessionResolved, setSessionResolved] = useState(false);

  // Re-evaluar zona cuando cambia el pathname (navegación interna o redirect).
  useEffect(() => {
    const recompute = () => setZone(matchZone(window.location.pathname).zone);
    window.addEventListener("popstate", recompute);
    window.addEventListener("pathchange", recompute);
    return () => {
      window.removeEventListener("popstate", recompute);
      window.removeEventListener("pathchange", recompute);
    };
  }, []);

  // Root / sin sesión → App.jsx admin PIN (comportamiento legacy).
  // Root / con sesión → replace a /equipo.
  useEffect(() => {
    if (zone !== "root") { setSessionResolved(true); return; }
    let mounted = true;
    database.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data?.session) {
        replacePath("/equipo");
      } else {
        setSessionResolved(true);
      }
    });
    return () => { mounted = false };
  }, [zone]);

  // Formulario de onboarding: público, sin sesión y sin nada del portal.
  if (zone === "inicio") {
    return (
      <Suspense fallback={null}>
        <FormularioPage path={matchZone(window.location.pathname).rest} />
      </Suspense>
    );
  }

  if (zone === "creative-connect") return <Suspense fallback={null}><CreativeConnect /></Suspense>;
  if (zone === "team") {
    return (
      <Suspense fallback={teamFallback}>
        <TeamApp />
      </Suspense>
    );
  }

  // Mientras el root resuelve sesión, no renderices App.jsx aún (evita flash).
  if (zone === "root" && !sessionResolved) return teamFallback;

  // Zonas client / admin / root (sin sesión) / legacy (no redirigido) → App.jsx
  // Nota: ThemeProvider ya está en el wrapper raíz (createRoot) para que
  // FeedbackWidget también lo consuma desde fuera del Router.
  return <InforceReports />;
}

// FeedbackWidget global — auto-resuelve al usuario logueado y muestra el
// botón flotante en cualquier zona (workspace cliente, admin, team Inforce).
// Se renderiza FUERA del Router para que sobreviva a todos los re-renders y
// no dependa de qué view está activo.
// `/brief/<token>` — página pública, sin sesión y sin cromo del portal.
function isPublicBriefPath() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  // `/inicio/<token>` es igual: lo abre un cliente que todavía no tiene cuenta.
  return path.startsWith("/brief/") || path.startsWith("/inicio/") || path === "/creative-connect";
}

function GlobalFeedback() {
  const reporter = useFeedbackReporter();
  return <FeedbackWidget reporter={reporter} />;
}

// Ejecutar redirects ANTES del primer render para evitar mount doble.
// La mudanza de dominio va PRIMERA: si esta visita se va a otro host, no tiene
// sentido reescribirle la ruta antes de mandarla.
applyCompatRedirects();

// Y si esta visita LLEGA de la mudanza, primero se le devuelve la sesión y
// recién después se pinta. Al revés, la app resolvería "no hay nadie logueado"
// y mostraría el login un segundo antes de que la sesión aterrice — que para
// quien venía trabajando se ve exactamente igual que haber sido expulsado.
//
// Para todas las demás visitas —o sea casi todas— esto ya viene resuelto y no
// agrega ni un milisegundo.
arrancar();

function arrancar() {
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <CensorProvider>
          <OnboardingHost>
            <Router />
          </OnboardingHost>
          {/* La hoja de rodaje pública la abre gente de afuera: nada del portal
              (campanita, feedback) tiene por qué aparecerle encima. */}
          {!isPublicBriefPath() && <><NotificationsBell /><GlobalFeedback /><ImportQueueWidget /></>}
        </CensorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
  )
}
