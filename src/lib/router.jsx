import { useCallback, useEffect, useState } from "react";

// Mini-router pathname-based. Reemplaza useHashRoute para toda la zona equipo
// y expone helpers de zoneado para el Router raíz en src/main.jsx.
//
// Por qué no react-router: el repo no lo tiene y no vale la pena sumar 40KB
// cuando solo necesitamos 3 cosas — leer segments, escribir history, y decidir
// zona por primer segmento.

// Zonas reservadas: NO se redirigen como `/<slug>` legacy a `/cliente/<slug>`.
// Las primeras 4 son las zonas históricas. Las demás son rutas públicas del
// SaaS landing — agregadas aquí para que `/signup`, `/login`, etc. NO se
// confundan con un slug de cliente y NO entren en el legacy redirect loop.
const RESERVED_ZONES = new Set([
  "cliente", "admin", "equipo", "api",
  "signup", "login", "forgot-password", "onboarding", "app", "debug",
  "brief", "inicio", "creative-connect", "nueva",
]);

// Las public-landing routes no son una "zona" sino páginas standalone. Pero
// las marcamos como reservadas para que `applyCompatRedirects` no las
// reescriba a `/cliente/<slug>`.
// `brief` es la única de dos segmentos (`/brief/<token>`): la hoja de rodaje que
// abre una creadora UGC sin cuenta. `matchZone` ya devuelve el resto del path,
// así que el token viaja en `segments[0]`.
const PUBLIC_LANDING_PATHS = new Set([
  "signup", "login", "forgot-password", "onboarding", "app", "debug", "brief",
]);

export function matchZone(pathname) {
  const parts = (pathname || "/").split("/").filter(Boolean);
  if (parts.length === 0) return { zone: "root", rest: "", segments: [] };
  const first = parts[0].toLowerCase();
  if (first === "nueva") return { zone: "nueva", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  if (first === "creative-connect") return { zone: "creative-connect", rest: "", segments: [] };
  if (first === "cliente") return { zone: "client", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  if (first === "admin") return { zone: "admin", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  if (first === "equipo") return { zone: "team", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  if (first === "api") return { zone: "api", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  // `/inicio/<token>` — el formulario de onboarding que llena un cliente nuevo, sin
  // cuenta. Zona propia: la pinta el Router raíz sin pasar por App.jsx, así quien
  // lo abre desde el celular no descarga el portal entero para responder un quiz.
  if (first === "inicio") return { zone: "inicio", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  if (PUBLIC_LANDING_PATHS.has(first)) return { zone: "public", rest: parts.slice(1).join("/"), segments: parts.slice(1) };
  // Single-segment no reservado → candidato a legacy slug cliente. El Router
  // raíz decide si redirigir con base en la DB o dejar pasar.
  return { zone: "legacy", rest: parts.join("/"), segments: parts };
}

export function isReservedTopSegment(segment) {
  return RESERVED_ZONES.has(String(segment || "").toLowerCase());
}

function parsePath(prefix) {
  if (typeof window === "undefined") return [];
  const path = window.location.pathname || "/";
  const normalizedPrefix = prefix ? prefix.replace(/\/$/, "") : "";
  if (normalizedPrefix && !path.startsWith(normalizedPrefix)) return [];
  const rest = normalizedPrefix ? path.slice(normalizedPrefix.length) : path;
  return rest.split("/").filter(Boolean);
}

// usePathRoute({ prefix: "/equipo" }) → { segments: ["empresas","<id>"], navigate, replace }
//
// - segments: array después del prefijo. Ej:
//     /equipo/empresas/abc     → ["empresas", "abc"]
//     /equipo                  → []
// - navigate(sub, { replace }): empuja el estado de historia con `${prefix}${sub}`.
// - replace(sub): como navigate pero con history.replaceState.
export function usePathRoute({ prefix = "" } = {}) {
  const [segments, setSegments] = useState(() => parsePath(prefix));

  useEffect(() => {
    const handler = () => setSegments(parsePath(prefix));
    window.addEventListener("popstate", handler);
    // Algunos navegadores no emiten popstate para pushState manual, así que
    // exponemos también un evento custom 'pathchange' que nuestro navigate
    // dispara. Esto mantiene múltiples consumers sincronizados.
    window.addEventListener("pathchange", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("pathchange", handler);
    };
  }, [prefix]);

  const buildTarget = useCallback((sub) => {
    const clean = String(sub || "").replace(/^\/?/, "");
    const normalizedPrefix = prefix ? prefix.replace(/\/$/, "") : "";
    if (!clean) return normalizedPrefix || "/";
    return `${normalizedPrefix}/${clean}`;
  }, [prefix]);

  const navigate = useCallback((sub, opts = {}) => {
    const target = buildTarget(sub);
    if (window.location.pathname === target) return;
    if (opts.replace) {
      window.history.replaceState(null, "", target);
    } else {
      window.history.pushState(null, "", target);
    }
    window.dispatchEvent(new Event("pathchange"));
  }, [buildTarget]);

  const replace = useCallback((sub) => navigate(sub, { replace: true }), [navigate]);

  return { segments, navigate, replace };
}

// Helper sin hook — útil para redirects tempranos en el Router raíz.
export function replacePath(path) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path && !window.location.search && !window.location.hash) return;
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new Event("pathchange"));
}
