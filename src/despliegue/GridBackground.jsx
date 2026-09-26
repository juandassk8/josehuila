// Grid infinito estilo Miro. Dos patterns SVG a distintas densidades:
// fine (10 px) y coarse (100 px). Ambos renderizados siempre — el navegador
// los esconde naturalmente cuando el stroke cae a sub-pixel.
//
// Debe renderizarse DENTRO del TransformComponent para que las líneas
// escalen con el contenido. Al hacer zoom in, las líneas finas crecen y
// se vuelven visibles dando la sensación de subdivisión.
export function GridBackground({ width, height, isDark = false }) {
  const bgFill = isDark ? "#06060A" : "#F5F5F0";
  const fineStroke = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.045)";
  const coarseStroke = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.11)";
  const fineId = isDark ? "grid-fine-dark" : "grid-fine-light";
  const coarseId = isDark ? "grid-coarse-dark" : "grid-coarse-light";

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        <pattern id={fineId} width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke={fineStroke} strokeWidth="0.5" />
        </pattern>
        <pattern id={coarseId} width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke={coarseStroke} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={bgFill} />
      <rect width={width} height={height} fill={`url(#${fineId})`} />
      <rect width={width} height={height} fill={`url(#${coarseId})`} />
    </svg>
  );
}
