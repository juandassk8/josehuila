// Util tiny para sincronizar el VideoOnboarding con el sidebar de CompanyWorkspace.
// El componente del tutorial llama a setTutorialHighlight("home"|"reportes"|...|null)
// y el sidebar escucha vía addEventListener.

const EVENT = "inforce:tutorial-highlight";
const OPEN_EVENT = "inforce:open-tutorials";

export function setTutorialHighlight(sectionKey) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: sectionKey || null }));
}

export function onTutorialHighlight(handler) {
  if (typeof window === "undefined") return () => {};
  const cb = (e) => handler(e.detail || null);
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// Abre el VideoOnboarding on-demand (botón "Ver tutoriales" en el sidebar).
// El overlay aparece sin afectar el estado de DB de la identity actual.
export function openTutorials() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function onOpenTutorials(handler) {
  if (typeof window === "undefined") return () => {};
  const cb = () => handler();
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}
