import { useEffect, useState } from "react";

// ¿La pantalla es de celular?
//
// Vivía adentro de App.jsx sin exportar, así que las 52 pantallas del portal del
// cliente —que es el que se abre desde el teléfono— no tenían forma de saberlo.
// Acá lo puede usar cualquiera.
//
// Escucha `resize` y no `matchMedia` para no cambiar el comportamiento que ya
// tenían las vistas del admin: es el mismo código, movido.
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default useIsMobile;
