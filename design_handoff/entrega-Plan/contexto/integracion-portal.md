# Integrar el plan HTML dentro del portal

El documento ya trae el puente listo. Del lado del portal solo hay que montar el iframe y escuchar tres mensajes.

---

## Cómo se reparte el trabajo

| | Portal | Documento HTML |
|---|---|---|
| Fases y accionables con checkbox | ✅ fuente de verdad | ❌ solo mapa de lectura |
| Progreso, responsable, fechas | ✅ | ❌ |
| Las tres llamadas y su contexto | ❌ | ✅ fuente de verdad |
| Estrategia de venta | ❌ | ✅ |

El HTML detecta solo si está embebido o suelto:

- **Embebido** (dentro del portal) → el botón "Abrir mi plan en el portal" deja de ser un link externo y avisa al portal para que navegue a su propia vista de plan.
- **Suelto** (el link que le mandas al cliente por WhatsApp) → el botón abre el portal en una pestaña nueva.

---

## Mensajes

### El documento le manda al portal

| Mensaje | Cuándo | Payload |
|---|---|---|
| `inforce-ready` | al cargar | `{ sections: [{id, title}], height }` |
| `inforce-height` | al cargar, al abrir un nodo, al redimensionar | `{ height }` |
| `inforce-scrolled` | después de un `inforce-goto` | `{ section, top }` |
| `inforce-nav` | al hacer clic en el botón del plan | `{ to: 'plan' }` |

### El portal le manda al documento

| Mensaje | Para qué | Payload |
|---|---|---|
| `inforce-theme` | cambiar claro/oscuro | `{ theme: 'dark' \| 'light' }` |
| `inforce-goto` | saltar a una sección sin recargar | `{ section: 'llamada-2' }` |
| `inforce-height` | pedir que vuelva a reportar el alto | — |

Secciones disponibles: `bienvenida`, `recorrido`, `llamada-1`, `llamada-2`, `llamada-3`, `estrategia`, `accionPlan`.
(En Nubora hay además `implementacion`.)

---

## Componente para el portal

```jsx
import { useEffect, useRef, useState } from "react";

/**
 * PlanEmbed — muestra el documento del cliente dentro del portal.
 *
 * src        URL del HTML, ej. "https://plan.josehuila.com/nubora/"
 * section    sección inicial, ej. "llamada-2"
 * isDark     tema actual del portal
 * onNavPlan  se dispara cuando el cliente toca "Abrir mi plan"
 */
export default function PlanEmbed({ src, section, isDark, onNavPlan }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(900);
  const [ready, setReady] = useState(false);

  // El tema va por querystring en la carga inicial y por postMessage después.
  const url = `${src}${src.includes("?") ? "&" : "?"}theme=${isDark ? "dark" : "light"}${
    section ? `#${section}` : ""
  }`;

  const post = (msg) => ref.current?.contentWindow?.postMessage(msg, "*");

  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== ref.current?.contentWindow) return; // solo este iframe
      const d = e.data;
      if (!d || typeof d !== "object") return;

      if (d.type === "inforce-ready") {
        setReady(true);
        if (d.height) setHeight(d.height);
        if (section) post({ type: "inforce-goto", section });
      }
      if (d.type === "inforce-height" && d.height) setHeight(d.height);
      if (d.type === "inforce-nav" && d.to === "plan") onNavPlan?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [section, onNavPlan]);

  // Tema en caliente, sin recargar el iframe.
  useEffect(() => {
    if (ready) post({ type: "inforce-theme", theme: isDark ? "dark" : "light" });
  }, [isDark, ready]);

  // Cambiar de sección sin recargar.
  useEffect(() => {
    if (ready && section) post({ type: "inforce-goto", section });
  }, [section, ready]);

  return (
    <iframe
      ref={ref}
      src={url}
      title="Plan de implementación"
      loading="lazy"
      scrolling="no"
      style={{
        width: "100%",
        height,
        border: "1px solid var(--line)",
        borderRadius: 18,
        background: "var(--surface-solid)",
        display: "block",
      }}
    />
  );
}
```

### Uso

```jsx
<PlanEmbed
  src="https://plan.josehuila.com/nubora/"
  section="llamada-2"
  isDark={theme === "dark"}
  onNavPlan={() => navigate("/plan")}
/>
```

---

## Enlazar cada accionable con su contexto

En la vista de plan del portal, cada accionable puede llevar un enlace *"ver el contexto"* que apunte a la llamada donde se habló de eso:

```jsx
<a href={`/documento?section=${paso.seccion}`}>ver el contexto</a>
```

Guardando en cada accionable un campo `seccion` con el valor `llamada-1`, `llamada-2`, `llamada-3` o `estrategia`. El documento cae directo ahí, sin animación de scroll.

---

## Notas

- El iframe va con `scrolling="no"` porque el alto se ajusta solo. Así no queda scroll dentro de scroll.
- El `postMessage` va con `origin: "*"` porque el documento se sirve desde otro dominio (`plan.josehuila.com`). Si querés cerrarlo, cambiá el `"*"` por ese dominio exacto en las dos puntas.
- El filtro `e.source !== ref.current?.contentWindow` evita que otro iframe de la página te mande mensajes.
- Si el documento se abre suelto, todo el puente se desactiva solo y no manda nada.

---

*Inforce Consulting*
