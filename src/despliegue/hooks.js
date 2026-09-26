import { useCallback, useEffect, useState } from "react";
import {
  getBoardByCompany,
  getOrCreateBoard,
  listConcepts,
  listVariationsForBoard,
} from "./db.js";

// Carga el board + conceptos + variaciones de una empresa. Auto-crea el
// board si el caller pide `canCreate` (p.ej. admin) y no existe.
// pipelineType = 'ads' | 'organic' (default 'ads' para retrocompat).
export function useDespliegue({ companyId, canCreate = false, pipelineType = "ads" }) {
  const [board, setBoard] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // `silent=true` evita el setLoading(true) — usado por refetch en mutaciones.
  const reload = useCallback(async (opts = {}) => {
    if (!companyId) return;
    const silent = opts.silent === true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      let b = await getBoardByCompany(companyId, pipelineType);
      if (!b && canCreate) {
        b = await getOrCreateBoard(companyId, pipelineType);
      }
      if (!b) {
        setBoard(null);
        setConcepts([]);
        setVariations([]);
        setLoading(false);
        return;
      }
      setBoard(b);
      const [cs, vs] = await Promise.all([
        listConcepts(b.id),
        listVariationsForBoard(b.id),
      ]);
      setConcepts(cs);
      setVariations(vs);
      if (!silent) setLoading(false);
    } catch (e) {
      setError(e?.message || String(e));
      if (!silent) setLoading(false);
    }
  }, [companyId, canCreate, pipelineType]);

  useEffect(() => { reload(); }, [reload]);

  // Actualizaciones optimistas (sin refetch) para evitar flashes.
  const patchBoardConfig = useCallback((patch) => {
    setBoard((b) => b ? { ...b, config: { ...(b.config || {}), ...patch } } : b);
  }, []);
  const patchConcepts = useCallback((updater) => {
    setConcepts((cs) => (typeof updater === "function" ? updater(cs) : updater));
  }, []);
  const patchVariations = useCallback((updater) => {
    setVariations((vs) => (typeof updater === "function" ? updater(vs) : updater));
  }, []);
  const reloadSilent = useCallback(() => reload({ silent: true }), [reload]);

  return { board, concepts, variations, loading, error, reload, reloadSilent, patchBoardConfig, patchConcepts, patchVariations };
}
