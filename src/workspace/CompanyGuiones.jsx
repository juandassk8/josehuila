import { useEffect, useMemo, useState } from "react";
import { CompanyGuionesContext } from "./guiones/context.js";
import { GuionesPage } from "./guiones/GuionesPage.jsx";
import { getBoardByCompany } from "../despliegue/db.js";
import { listSlotsForBoard } from "../despliegue/pipeline_db.js";
import { database } from "../lib/backend.js";

// Wrapper del módulo Guiones para workspace de empresa.
// Carga slots con status='idea' del despliegue y los pasa como "contentItems"
// al GuionesPage (así aparecen en el tab Ideas para guionizar).

export function CompanyGuiones({ companyId, companyName, isAdmin, currentMember, onNavigate, pipelineType = "ads" }) {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      // Tomar el board del pipelineType que el user está viendo. Antes acá
      // se omitía el arg → siempre cargaba el board "ads" sin importar si
      // el user estaba en "organic", lo que causaba que los miembros con
      // pipelineType="organic" vieran ideas/slots erróneos o vacíos.
      const b = await getBoardByCompany(companyId, pipelineType);
      if (cancelled || !b) return;
      const sl = await listSlotsForBoard(b.id);
      if (!cancelled) setSlots(sl || []);
    })();
    // Realtime: si llega un slot nuevo (o cambia estado), recargar.
    const ch = database
      .channel(`company_guiones_slots_${companyId}_${pipelineType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "despliegue_slots" }, async () => {
        const b = await getBoardByCompany(companyId, pipelineType);
        if (!b) return;
        const sl = await listSlotsForBoard(b.id);
        if (!cancelled) setSlots(sl || []);
      })
      .subscribe();
    return () => { cancelled = true; database.removeChannel(ch); };
  }, [companyId, pipelineType]);

  // Mapeo slot → content_item shape que espera GuionesPage:
  //   { id, title, status, kind, ... }
  // kind se usa para filtrar "stories"; en cliente todo es video|static,
  // así que kind = slot.format (nunca 'story').
  const contentItems = useMemo(() => {
    return slots.map((s) => ({
      id: s.id,
      title: s.title || s.concept_name || "Sin título",
      status: s.status, // 'idea' | 'scripting' | ...
      kind: s.format,    // 'video' | 'static'
      description: s.angle || s.reference_url || "",
      // stage + concept para que el guionista muestre chips coloreados.
      stage: s.stage,            // 'tofu' | 'mofu' | 'bofu'
      concept_name: s.concept_name,
      _slot: s,
    }));
  }, [slots]);

  // El context expone companyId + memberId. memberId se usa para auditoría
  // de tokens en /api/generate-script (sabés qué miembro consumió cuánto).
  const ctxValue = useMemo(
    () => ({ companyId, memberId: currentMember?.id || null }),
    [companyId, currentMember?.id]
  );

  return (
    <CompanyGuionesContext.Provider value={ctxValue}>
      <div style={{ padding: "16px 24px 72px" }}>
        <GuionesPage
          contentItems={contentItems}
          readOnly={!isAdmin}
          onOpenDespliegue={() => onNavigate?.("despliegue")}
          pipelineType={pipelineType}
        />
      </div>
    </CompanyGuionesContext.Provider>
  );
}
