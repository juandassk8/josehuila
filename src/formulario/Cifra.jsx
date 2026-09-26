// Copiado tal cual de inforce-auditoria/src/components/informe/Cifra.tsx (branding de
// inforceconsulting.com, ver BRANDING.md de ese repo). Solo se le quitaron los tipos de
// TypeScript: el portal es JS. Si cambia allá, se vuelve a copiar; no se edita acá.

// Una cifra que sube desde cero cuando entra en pantalla.
//
// No es un adorno: en un informe la primera pregunta que se hace la persona es «¿de
// dónde salió ese número?». Verlo contar dice, sin escribirlo, que se contó algo. Y
// obliga a mirarlo un segundo más, que en la práctica es lo único que separa una cifra
// leída de una cifra saltada.
//
// Quien tenga el sistema en movimiento reducido la ve puesta y ya.

import { useEffect, useRef, useState } from 'react';

const DURACION = 1100;

/** Rápido al principio y suave al final: se lee la magnitud antes de que termine. */
const suavizar = (t) => 1 - Math.pow(1 - t, 3);

export function Cifra({ hasta, decimales = 0, className = '', sufijo = '', style }) {
  const ref = useRef(null);
  const [valor, setValor] = useState(0);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    // Movimiento reducido = duración cero. Sale por el mismo camino en vez de un
    // setState suelto en el cuerpo del efecto, que además dispararía un render de más.
    const duracion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURACION;

    let cuadro = 0;
    const observador = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        observador.disconnect();
        if (!duracion) { setValor(hasta); return; }
        const arranque = performance.now();
        const paso = (ahora) => {
          // El `Math.max(0, …)` no sobra.
          //
          // `requestAnimationFrame` entrega el instante en que ARRANCÓ el cuadro, y ese
          // instante puede ser anterior al `performance.now()` que tomamos al detectar
          // que la cifra entró en pantalla. Cuando pasa, `t` sale negativo, y como la
          // curva es `1-(1-t)³`, un `t` de -0,01 da -0,03: la cifra se dibuja en
          // NEGATIVO. Se vio en celular, en la portada: «-3 anuncios al aire», que es
          // exactamente lo primero que lee la persona.
          const t = Math.min(1, Math.max(0, (ahora - arranque) / duracion));
          setValor(hasta * suavizar(t));
          if (t < 1) cuadro = requestAnimationFrame(paso);
        };
        cuadro = requestAnimationFrame(paso);
      },
      { rootMargin: '0px 0px -18% 0px' }
    );

    observador.observe(nodo);
    return () => { observador.disconnect(); cancelAnimationFrame(cuadro); };
  }, [hasta]);

  return (
    <span ref={ref} className={className} style={style}>
      {valor.toLocaleString('es-CO', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })}
      {sufijo}
    </span>
  );
}
