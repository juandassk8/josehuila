import { createContext, useContext } from "react";

// Contexto liviano para pasar el estado de filtro/etiquetas del canvas de
// despliegue hasta las tarjetas (ConceptCard → ExampleThumb) sin drillear
// props por StageRow → FormatBlock. Valor por defecto = sin filtros, sin
// etiquetas visibles (así el DragOverlay y cualquier render fuera del provider
// se comporta como antes).
export const CanvasFilterContext = createContext({
  filters: {},        // { marca:[], nicho:[], angulo:[], formato:[] }
  linkFilter: "all",  // ver LINK_FILTERS en labels.js
  mode: "resaltar",   // "resaltar" (atenúa) | "filtrar" (oculta)
  showLabels: false,  // pinta la marca sobre cada miniatura
});

export function useCanvasFilter() {
  return useContext(CanvasFilterContext);
}
