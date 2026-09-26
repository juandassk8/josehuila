// Embudo continuo: diagonales que convergen hacia abajo, sin escalones
// laterales. Cada stage marca un "punto" donde el ancho cambia; entre stages
// la línea se dibuja con una curva suave (Bezier) que evita los saltos.
//
// Forma: trapezoide piramidal, más ancho arriba (TOFU) y más angosto abajo
// (BOFU). Los stage widths siguen definiendo dónde se estrecha, pero la
// transición es diagonal continua, no un escalón vertical-horizontal.
//
// Estilo: hairline champagne con blur suave — elegante y visible.
//
// Input: stages = [{ top, bottom, width, centerX }, ...] en world coords.
export function FunnelLines({ stages, canvasWidth, canvasHeight }) {
  if (!stages || stages.length === 0) return null;

  const first = stages[0];
  const last = stages[stages.length - 1];

  // Prolongación arriba/abajo — conecta a los bordes del canvas con el ancho
  // del primer/último stage respectivamente.
  const topY = Math.max(0, first.top - 200);
  const bottomY = Math.min(canvasHeight, last.bottom + 200);

  // Puntos de anclaje por stage: (xTop, top) y (xBottom, bottom) en cada lado.
  // Entre el bottom de un stage y el top del siguiente dibujamos una curva
  // Bezier vertical — transición suave de ancho.
  const buildPath = (side) => {
    const sign = side === "left" ? -1 : 1;
    const parts = [];

    // Entrada desde arriba (extension vertical con el ancho del primer stage).
    parts.push(`M ${first.centerX + sign * first.width / 2} ${topY}`);
    parts.push(`L ${first.centerX + sign * first.width / 2} ${first.top}`);

    // Recorremos los stages. Para cada stage: baja recto por el lado hasta su
    // bottom. Luego curva Bezier al top del siguiente stage.
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const xTop = s.centerX + sign * s.width / 2;
      const xBot = s.centerX + sign * s.width / 2;
      // Llegada al top del stage (ya estamos ahí para i=0; para los demás
      // llegamos desde la curva del stage anterior).
      parts.push(`L ${xTop} ${s.top}`);
      // Borde vertical por todo el stage.
      parts.push(`L ${xBot} ${s.bottom}`);

      const next = stages[i + 1];
      if (next) {
        const nxTop = next.centerX + sign * next.width / 2;
        // Curva Bezier cúbica: tangentes verticales en ambos extremos para
        // que la transición sea suave (no quiebre).
        const midY = (s.bottom + next.top) / 2;
        const c1x = xBot;
        const c1y = midY;
        const c2x = nxTop;
        const c2y = midY;
        parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nxTop} ${next.top}`);
      }
    }

    // Salida hacia abajo (extension vertical con el ancho del último stage).
    parts.push(`L ${last.centerX + sign * last.width / 2} ${bottomY}`);

    return parts.join(" ");
  };

  const leftPath = buildPath("left");
  const rightPath = buildPath("right");

  const champagne = "#E8E4D9";

  return (
    <svg
      width={canvasWidth}
      height={canvasHeight}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Gradiente vertical — más intenso en el centro, se desvanece arriba/abajo. */}
        <linearGradient id="funnel-grad-main" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={champagne} stopOpacity="0" />
          <stop offset="10%"  stopColor={champagne} stopOpacity="0.6" />
          <stop offset="50%"  stopColor={champagne} stopOpacity="0.95" />
          <stop offset="90%"  stopColor={champagne} stopOpacity="0.6" />
          <stop offset="100%" stopColor={champagne} stopOpacity="0" />
        </linearGradient>

        {/* Halo un poco más tenue para dar profundidad. */}
        <linearGradient id="funnel-grad-halo" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={champagne} stopOpacity="0" />
          <stop offset="20%"  stopColor={champagne} stopOpacity="0.3" />
          <stop offset="50%"  stopColor={champagne} stopOpacity="0.5" />
          <stop offset="80%"  stopColor={champagne} stopOpacity="0.3" />
          <stop offset="100%" stopColor={champagne} stopOpacity="0" />
        </linearGradient>

        {/* Halo blur amplio — da la sensación de luz. */}
        <filter id="funnel-halo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>

        {/* Blur fino para suavizar la hairline sin esconderla. */}
        <filter id="funnel-main" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Halo: capa ancha y borrosa detrás. */}
      <g filter="url(#funnel-halo)" opacity="0.75">
        <path
          d={leftPath}
          fill="none"
          stroke="url(#funnel-grad-halo)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={rightPath}
          fill="none"
          stroke="url(#funnel-grad-halo)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>

      {/* Hairline principal: nítida, el "filo" del embudo. */}
      <g filter="url(#funnel-main)">
        <path
          d={leftPath}
          fill="none"
          stroke="url(#funnel-grad-main)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={rightPath}
          fill="none"
          stroke="url(#funnel-grad-main)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
