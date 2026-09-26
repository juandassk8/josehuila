// Copiado tal cual de inforce-auditoria/src/components/Constelacion.tsx (branding de
// inforceconsulting.com, ver BRANDING.md de ese repo). Solo se le quitaron los tipos de
// TypeScript: el portal es JS. Si cambia allá, se vuelve a copiar; no se edita acá.

// El campo de puntos que se mueve mientras el análisis corre.
//
// La espera dejó de ser invisible: desde que el link se pide al final, casi todo el
// mundo va a ver esta pantalla entre uno y tres minutos. Una ruedita girando durante
// tres minutos se lee como «se colgó»; algo que responde al mouse se lee como «está
// pasando algo».
//
// Es canvas puro, sin librería: unas ciento veinte líneas y ~2KB. Meter una librería de
// partículas para esto serían 40KB en la página donde la persona ya está esperando.
//
// Dos cosas que lo hacen barato de verdad:
//   · se detiene cuando la pestaña no está a la vista
//   · con «movimiento reducido» dibuja el campo quieto, una sola vez
//
// Las líneas sí se buscan comparando todos contra todos. Con el tope en 140 puntos son
// unos 9.700 pares por cuadro, que a 60fps no se nota; particionar en celdas costaría
// más código del que ahorra. Si el tope sube mucho, eso cambia.

import { useEffect, useRef } from 'react';

// Dos intensidades. «plena» es la de la espera, donde el campo ES el contenido y
// entretener es su trabajo. «sutil» es la de las páginas donde hay algo que leer o
// que responder: ahí el mismo efecto a la misma fuerza compite con el texto y
// termina cansando. Menos puntos, más apagados y con menos alcance.
const AJUSTES = {
  plena: { densidad: 9_000, tope: 140, linea: 128, raton: 210, alfa: 1 },
  sutil: { densidad: 24_000, tope: 55, linea: 150, raton: 190, alfa: 0.5 },
};

export function Constelacion({ className = '', intensidad = 'plena' }) {
  const lienzo = useRef(null);

  useEffect(() => {
    const cfg = AJUSTES[intensidad];
    const cv = lienzo.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulso = { desde: -9999, hasta: 0 };
    let puntos = [];
    let ancho = 0, alto = 0, cuadro = 0;
    const raton = { x: -9999, y: -9999 };

    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const caja = cv.getBoundingClientRect();
      ancho = caja.width; alto = caja.height;
      cv.width = Math.round(ancho * dpr);
      cv.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const n = Math.min(cfg.tope, Math.round((ancho * alto) / cfg.densidad));
      puntos = Array.from({ length: n }, () => ({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.7,
      }));
    };

    const pintar = (ahoraMs = 0) => {
      ctx.clearRect(0, 0, ancho, alto);

      // Las líneas primero, para que los puntos queden encima y se vean sólidos.
      for (let i = 0; i < puntos.length; i++) {
        for (let j = i + 1; j < puntos.length; j++) {
          const dx = puntos[i].x - puntos[j].x;
          const dy = puntos[i].y - puntos[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 > cfg.linea * cfg.linea) continue;
          const cerca = 1 - Math.sqrt(d2) / cfg.linea;
          ctx.strokeStyle = `rgba(110, 150, 250, ${cerca * 0.55 * cfg.alfa})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(puntos[i].x, puntos[i].y);
          ctx.lineTo(puntos[j].x, puntos[j].y);
          ctx.stroke();
        }
      }

      // Las líneas que salen del cursor. Son LO que hace que se sienta interactivo:
      // sin ellas la persona mueve el mouse, no pasa nada evidente, y deja de mover.
      for (const p of puntos) {
        const d = Math.hypot(p.x - raton.x, p.y - raton.y);
        if (d > cfg.raton) continue;
        const cerca = 1 - d / cfg.raton;
        ctx.strokeStyle = `rgba(150, 180, 255, ${cerca * 0.5 * (0.55 + cfg.alfa * 0.45)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(raton.x, raton.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      for (const p of puntos) {
        const dm = Math.hypot(p.x - raton.x, p.y - raton.y);
        const brillo = dm < cfg.raton ? 1 - dm / cfg.raton : 0;
        // El toque en celular deja una onda: sin ella, tocar la pantalla no hace
        // nada visible y el efecto se pierde justo donde no hay cursor.
        const onda = pulso.hasta > 0 ? Math.max(0, 1 - (ahoraMs - pulso.desde) / 620) : 0;
        const empuje = onda * Math.max(0, 1 - Math.abs(dm - (1 - onda) * 320) / 130);
        ctx.fillStyle = `rgba(${185 + brillo * 70}, ${205 + brillo * 50}, 255, ${(0.6 + brillo * 0.4 + empuje * 0.4) * cfg.alfa})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + brillo * 2.2 + empuje * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const paso = (ahoraMs) => {
      for (const p of puntos) {
        p.x += p.vx; p.y += p.vy;
        // Rebota en los bordes en vez de reaparecer del otro lado: reaparecer se ve
        // como un parpadeo y delata que son puntos sueltos y no un campo.
        if (p.x < 0 || p.x > ancho) p.vx *= -1;
        if (p.y < 0 || p.y > alto) p.vy *= -1;

        // El cursor los empuja suave. Empujar y no atraer: atraer los amontona en un
        // grumo del que ya no salen.
        const dx = p.x - raton.x, dy = p.y - raton.y;
        const d = Math.hypot(dx, dy);
        if (d < cfg.raton && d > 0.01) {
          const f = (1 - d / cfg.raton) * 0.9;
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
      }
      pintar(ahoraMs);
      cuadro = requestAnimationFrame(paso);
    };

    const mover = (e) => {
      const caja = cv.getBoundingClientRect();
      raton.x = e.clientX - caja.left;
      raton.y = e.clientY - caja.top;
    };
    const salir = () => { raton.x = -9999; raton.y = -9999; };
    // En celular no hay cursor: el dedo mueve el campo mientras toca y deja una
    // onda al soltar, que es lo que hace que se note que responde.
    const tocar = (e) => {
      mover(e);
      pulso.desde = performance.now();
      pulso.hasta = 1;
    };

    const arrancar = () => { if (!cuadro) cuadro = requestAnimationFrame(paso); };
    const parar = () => { cancelAnimationFrame(cuadro); cuadro = 0; };
    // Sin esto sigue pintando sesenta veces por segundo en una pestaña que nadie mira.
    const visibilidad = () => (document.hidden ? parar() : arrancar());

    medir();
    if (quieto) { pintar(); return () => {}; }

    arrancar();
    window.addEventListener('resize', medir);
    window.addEventListener('pointermove', mover, { passive: true });
    window.addEventListener('pointerdown', tocar, { passive: true });
    window.addEventListener('pointerleave', salir);
    document.addEventListener('visibilitychange', visibilidad);

    return () => {
      parar();
      window.removeEventListener('resize', medir);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerdown', tocar);
      window.removeEventListener('pointerleave', salir);
      document.removeEventListener('visibilitychange', visibilidad);
    };
  }, [intensidad]);

  return <canvas ref={lienzo} className={className} aria-hidden />;
}
