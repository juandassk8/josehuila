import { useEffect, useRef, useState } from "react";

// PlanEmbed — muestra el documento del cliente (plan.josehuila.com/<slug>/)
// dentro del portal. Puente postMessage (contrato de integracion-portal.md):
//   documento → portal: inforce-ready {sections,height}, inforce-height {height},
//               inforce-scrolled {section,top}, inforce-nav {to:'plan'}
//   portal → documento: inforce-theme {theme}, inforce-goto {section}, inforce-height
//
// El alto lo controla el portal con lo que reporta inforce-height (scrolling="no",
// nada de scroll dentro de scroll). En el riel se acota con un contenedor con
// max-height; el tema va por querystring en la carga inicial + inforce-theme en
// caliente (sin recargar el iframe).
export default function PlanEmbed({ src, section, isDark, onNavPlan, onReady, maxHeight = 620 }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [height, setHeight] = useState(900);
  const [ready, setReady] = useState(false);

  // Tema INICIAL capturado una vez (querystring); los cambios van por postMessage.
  // IMPORTANTE: el `src` NO lleva `#seccion`. Antes lo llevaba y (a) al cargar el
  // navegador saltaba al ancla y (b) al cambiar de sección cambiaba el src → el
  // iframe se recargaba → la página brincaba. La navegación va SOLO por postMessage.
  const initialTheme = useRef(isDark ? "dark" : "light");
  const url = src
    ? `${src}${src.includes("?") ? "&" : "?"}theme=${initialTheme.current}`
    : "";

  const post = (msg) => { try { ref.current?.contentWindow?.postMessage(msg, "*"); } catch { /* noop */ } };

  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== ref.current?.contentWindow) return; // solo este iframe
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "inforce-ready") {
        setReady(true);
        if (d.height) setHeight(d.height);
        if (Array.isArray(d.sections)) onReady?.(d.sections);
        // NO auto-navegamos al cargar → el documento abre desde arriba, sin brinco.
      }
      if (d.type === "inforce-height" && d.height) setHeight(d.height);
      if (d.type === "inforce-nav" && d.to === "plan") onNavPlan?.();
      // El documento reporta a qué altura quedó la sección tras un goto → scrolleamos
      // SOLO la cajita del embed (no la página) para navegar sin mover el resto.
      if (d.type === "inforce-scrolled" && typeof d.top === "number") {
        try { wrapRef.current?.scrollTo({ top: d.top, behavior: "smooth" }); } catch { /* noop */ }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNavPlan, onReady]);

  // Tema en caliente, sin recargar el iframe.
  useEffect(() => {
    if (ready) post({ type: "inforce-theme", theme: isDark ? "dark" : "light" });
  }, [isDark, ready]);

  // Cambiar de sección sin recargar.
  useEffect(() => {
    if (ready && section) post({ type: "inforce-goto", section });
  }, [section, ready]);

  return (
    <div ref={wrapRef} style={{
      borderTop: "1px solid var(--line)",
      maxHeight,
      overflowY: "auto",
      background: "var(--surface-solid)",
    }}>
      <iframe
        ref={ref}
        src={url}
        title="Plan de implementación"
        loading="lazy"
        scrolling="no"
        style={{ width: "100%", height, border: "none", display: "block", background: "var(--surface-solid)" }}
        allow="fullscreen"
      />
    </div>
  );
}
