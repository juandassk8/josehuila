import { useCompanyId } from "../context.js";
import { useCompanyConcepts } from "./useCompanyConcepts.js";

// Wrapper con misma firma que src/team/hooks/useFormats.js.
// En el workspace los "formatos" del guionista SON los conceptos del despliegue
// creativo (fuente única). Este hook los transforma al shape esperado por
// GuionesPage/FormatSelect.
export function useFormats() {
  const companyId = useCompanyId();
  return useCompanyConcepts(companyId);
}
