import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCenter } from "@dnd-kit/core";
import { DS } from "../../lib/design.js";
import { toastSuccess } from "../../lib/toast.js";
import { STAGES, STAGE_META, stageLabel } from "./pipelineConstants.js";
import { BriefCard } from "./BriefCard.jsx";

const idOf = (briefId, stage) => `${briefId}::${stage}`;
const parseId = (id) => { const [briefId, stage] = String(id).split("::"); return { briefId, stage }; };

function DraggableBriefCard({ brief, stage, countHere, briefSlots, onOpen }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: idOf(brief.id, stage) });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;
  return <BriefCard brief={brief} countHere={countHere} briefSlots={briefSlots} onOpen={onOpen} dnd={{ setNodeRef, attributes, listeners, isDragging, style }} />;
}

function StageColumn({ stage, children, count, footer, empty }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 18, padding: 12, minHeight: 140, alignSelf: "start",
        display: "flex", flexDirection: "column", gap: 10,
        background: isOver ? "var(--sel-soft)" : "var(--surface-2)",
        border: `1px solid ${isOver ? "transparent" : "var(--line)"}`,
        boxShadow: isOver ? "var(--sel-rim)" : "none",
        transition: "box-shadow .15s ease, background .15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 3px" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.02em", color: meta.color, flex: 1 }}>{meta.label}</span>
        <span className="mono" style={{ fontSize: 11, color: DS.textMuted, padding: "2px 8px", borderRadius: 999, background: "var(--chip)" }}>{count}</span>
      </div>
      {empty ? (
        <div style={{ fontSize: 11.5, color: "var(--ink-4)", padding: "12px 4px", textAlign: "center", borderRadius: 12, border: "1px dashed var(--line)" }}>Soltá un brief acá</div>
      ) : children}
      {footer}
    </div>
  );
}

// Vista Etapas (README §3): tablero horizontal con columnas por etapa; las cards
// que se arrastran son briefs. Al soltar en otra etapa se mueven todos los slots
// de ese brief que estaban en la etapa origen.
export function StageBoard({ briefs, slotsByBrief, tipoFilter = "todo", nivelFilter = null, onOpenBrief, onNewBrief, onMoveBrief }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const typeOk = (s) => (tipoFilter === "todo" || s.tipo === tipoFilter)
    && (!nivelFilter || (nivelFilter === "__sin" ? !s.nivel_conciencia : s.nivel_conciencia === nivelFilter));

  // Por etapa: lista de briefs con ≥1 slot ahí (+ count), respetando el filtro de
  // tipo. Idea suma briefs sin slots.
  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, []]));
    for (const brief of briefs) {
      const bs = (slotsByBrief[brief.id] || []).filter(typeOk);
      const counts = {};
      for (const s of bs) counts[s.stage] = (counts[s.stage] || 0) + 1;
      const present = Object.keys(counts);
      const anySlots = (slotsByBrief[brief.id] || []).length > 0;
      if (!anySlots) map.idea.push({ brief, count: 0 });               // brief sin slots
      else for (const st of present) map[st].push({ brief, count: counts[st] });
    }
    return map;
  }, [briefs, slotsByBrief, tipoFilter, nivelFilter]);

  const active = activeId ? parseId(activeId) : null;
  const activeBrief = active ? briefs.find((b) => b.id === active.briefId) : null;
  const countInStage = (briefId, stage) => (slotsByBrief[briefId] || []).filter((s) => s.stage === stage).length;

  function onDragEnd(e) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const { briefId, stage: fromStage } = parseId(a.id);
    const toStage = over.id;
    if (!STAGES.includes(toStage) || toStage === fromStage) return;
    // Un brief vacío (sin slots en la etapa origen) no mueve nada → no confirmar.
    if (countInStage(briefId, fromStage) === 0) return;
    onMoveBrief(briefId, fromStage, toStage);
    const b = briefs.find((x) => x.id === briefId);
    toastSuccess(`${b?.n || "Brief"} → ${stageLabel(toStage)}`);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(248px, 1fr)", gap: 12, padding: "18px 30px 30px", overflowX: "auto" }}>
        {STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            count={byStage[stage].length}
            empty={byStage[stage].length === 0 && stage !== "idea"}
            footer={stage === "idea" ? (
              <button
                type="button"
                onClick={onNewBrief}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px 12px", borderRadius: 12, cursor: "pointer", fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)" }}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Nuevo brief
              </button>
            ) : null}
          >
            {byStage[stage].map(({ brief, count }) => (
              <DraggableBriefCard
                key={idOf(brief.id, stage)}
                brief={brief}
                stage={stage}
                countHere={count}
                briefSlots={slotsByBrief[brief.id] || []}
                onOpen={() => onOpenBrief(brief.id, stage)}
              />
            ))}
          </StageColumn>
        ))}
      </div>

      <DragOverlay>
        {activeBrief ? <div style={{ width: 224 }}><BriefCard brief={activeBrief} countHere={countInStage(activeBrief.id, active.stage)} briefSlots={slotsByBrief[activeBrief.id] || []} /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
