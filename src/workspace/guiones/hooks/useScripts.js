import { useCompanyId } from "../context.js";
import { useCompanyScripts } from "./useCompanyScripts.js";

// Wrapper con la misma firma que src/team/hooks/useScripts.js.
// pipelineType opcional filtra los scripts por tipo (ads/organic).
export function useScripts(pipelineType = null) {
  const companyId = useCompanyId();
  return useCompanyScripts(companyId, pipelineType);
}
