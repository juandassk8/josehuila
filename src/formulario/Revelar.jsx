// Copiado tal cual de inforce-auditoria/src/components/Revelar.tsx (branding de
// inforceconsulting.com, ver BRANDING.md de ese repo). Solo se le quitaron los tipos de
// TypeScript: el portal es JS. Si cambia allá, se vuelve a copiar; no se edita acá.

import { useEffect, useRef, useState } from 'react';

/**
 * Aparece cuando entra en pantalla. Una sola vez: nada de elementos que
 * parpadean cada vez que subes y bajas.
 *
 * Quien tenga el sistema en "movimiento reducido" ve el contenido de una;
 * de eso se encarga el CSS.
 */
/** `retraso`: milisegundos, para escalonar hermanos. */
export function Revelar({ children, retraso = 0, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true);
          observador.disconnect();
        }
      },
      // El margen de arriba es enorme a propósito: todo lo que ya quedó por encima de
      // la pantalla cuenta como visto. Sin eso, un deslizón rápido en el celular se
      // salta la sección entera y queda un hueco en blanco que nunca se llena.
      { rootMargin: '100000px 0px -12% 0px' },
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`revelar ${visible ? 'revelar-visible' : ''} ${className}`}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </div>
  );
}
