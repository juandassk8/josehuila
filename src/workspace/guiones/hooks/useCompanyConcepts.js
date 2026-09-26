import { useCallback, useEffect, useMemo, useState } from "react";
import { database } from "../../../lib/backend.js";
import { getBoardByCompany, listConcepts, listVariationsForBoard } from "../../../despliegue/db.js";

// Carga los conceptos del despliegue creativo de la empresa como si fueran
// "formatos" del guionista. Concept + sus variations (referentes) adjuntas.
// Filtra format='video' porque los estáticos no se guionizan.
//
// Retorna shape compatible con team's useFormats:
//   { formats: [{ id, name, description, structure, examples, variations }], loading, reload }

export function useCompanyConcepts(companyId) {
  const [board, setBoard] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const b = await getBoardByCompany(companyId);
      setBoard(b);
      if (!b) { setConcepts([]); setVariations([]); return; }
      const [cs, vs] = await Promise.all([
        listConcepts(b.id),
        listVariationsForBoard(b.id),
      ]);
      setConcepts(cs || []);
      setVariations(vs || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`company_guiones_concepts_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "despliegue_concepts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "despliegue_variations" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load]);

  // Agrupar variations por concept_id.
  const byConcept = useMemo(() => {
    const m = new Map();
    for (const v of variations) {
      if (!m.has(v.concept_id)) m.set(v.concept_id, []);
      m.get(v.concept_id).push(v);
    }
    return m;
  }, [variations]);

  // Map concept → format-shape (sólo videos, no archivados).
  const formats = useMemo(() => {
    return concepts
      .filter((c) => c.format === "video" && !c.archived)
      .map((c) => {
        const vs = byConcept.get(c.id) || [];
        return {
          id: c.id,
          name: c.name,
          description: c.description || "",
          // Examples: lista de referentes con sus links y source_type.
          examples: vs.map((v) => ({
            id: v.id,
            name: v.label || v.name || "Referente",
            url: v.file_url || v.drive_url || v.meta_ads_library_url || null,
            source_type: v.source_type, // 'reference' | 'produced'
            transcript: v.transcript || "",
          })),
          // Structure/execution paso a paso del concepto.
          structure: c.execution || "",
          // Raw concept + variations para componentes que quieran más detalle.
          _concept: c,
          _variations: vs,
        };
      });
  }, [concepts, byConcept]);

  return { formats, concepts, variations, board, loading, reload: load };
}
