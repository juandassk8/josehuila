import { useState } from "react";
import { DS } from "../lib/design.js";
import { VariationBadge } from "./VariationBadge.jsx";

// Fila de un concepto: nombre + meta + badges de variaciones de la semana.
export function ConceptRow({ concept, variations, weekFrom, weekTo, isAdmin, onOpenVariation, onAddVariation, onEditConcept }) {
  const [hover, setHover] = useState(false);

  const weekVariations = variations.filter((v) => {
    if (!v.produced_at) return false;
    const d = new Date(v.produced_at);
    return d >= weekFrom && d <= weekTo;
  });
  const pendingInWeek = Math.max(0, concept.weekly_target - weekVariations.length);
  const totalInWeek = weekVariations.length;

  // Generar slots: variaciones producidas + placeholders hasta el target.
  const slots = [
    ...weekVariations.map((v) => ({ type: "variation", variation: v })),
    ...Array.from({ length: pendingInWeek }, (_, i) => ({
      type: "pending",
      label: `A${weekVariations.length + i + 1}`,
    })),
  ];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: DS.border,
        background: DS.bgCard,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {concept.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: DS.textMuted, fontFamily: "monospace" }}>
            {totalInWeek} / {concept.weekly_target} sem
          </span>
          {isAdmin && hover && (
            <button
              onClick={() => onEditConcept?.(concept)}
              title="Editar concepto"
              style={{
                padding: "2px 6px",
                fontSize: 10,
                border: DS.border,
                background: "transparent",
                color: DS.textMuted,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: DS.font,
              }}
            >
              ⚙
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {slots.map((slot, i) =>
          slot.type === "variation" ? (
            <VariationBadge
              key={slot.variation.id}
              label={slot.variation.label}
              state={slot.variation.state}
              onClick={() => onOpenVariation(slot.variation)}
            />
          ) : (
            <VariationBadge
              key={`pending-${i}`}
              label={slot.label}
              state="pending"
              onClick={() => onAddVariation(concept, slot.label)}
            />
          )
        )}
        {/* Botón + para agregar variación extra */}
        <button
          onClick={() => onAddVariation(concept, `A${slots.length + 1}`)}
          title="Agregar variación extra"
          style={{
            width: 34, height: 34,
            borderRadius: 8,
            border: DS.borderDash,
            background: "transparent",
            color: DS.textHint,
            fontSize: 16,
            fontWeight: 300,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DS.font,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
