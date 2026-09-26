import { useEffect, useState } from "react";

// Hash-based routing: convierte window.location.hash en array de segmentos.
// Ej:  #/contenido         → ["contenido"]
//      #/space/abc-123     → ["space", "abc-123"]
//      #/workspace/<id>    → ["workspace", "<id>"]
//
// El ruteo usa HASH (no pathname) porque:
//  1. No requiere config de Vercel para SPA rewrites.
//  2. Convive con el query param existente (?zona=equipo).
//  3. Refresh + copy/paste del link regresan a la misma vista.

function parseHash() {
  const hash = typeof window !== "undefined" ? (window.location.hash || "") : "";
  const clean = hash.replace(/^#\/?/, "");
  return clean.split("/").filter(Boolean);
}

export function useHashRoute() {
  const [segments, setSegments] = useState(parseHash);

  useEffect(() => {
    const handler = () => setSegments(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // navigate("/contenido") o navigate("contenido") o navigate("/space/<id>")
  const navigate = (path) => {
    const clean = String(path || "").replace(/^\/?/, "");
    const target = clean ? `#/${clean}` : "#/";
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
  };

  return { segments, navigate };
}
