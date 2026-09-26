import { useState } from "react";
import { DS, darkBtnGhost } from "../../lib/design.js";
import { ConceptEditModal } from "./ConceptEditModal.jsx";

// Librería de Conceptos del guionista. Grid de cuadraditos con color por
// stage (TOFU verde / MOFU ambar / BOFU rojo). Click abre modal de edición
// (nombre, descripción, referentes propios/externos).

const STAGE_META = {
  tofu: { label: "TOFU", color: "#1DB97A", emoji: "🟢" },
  mofu: { label: "MOFU", color: "#F5A623", emoji: "🟡" },
  bofu: { label: "BOFU", color: "#E24B4A", emoji: "🔴" },
};

export function ConceptosLibrary({ formats, onOpenDespliegue, onConceptUpdated }) {
  const [editing, setEditing] = useState(null); // format object

  if (!formats || formats.length === 0) {
    return (
      <div style={{
        padding: "48px 24px", textAlign: "center", borderRadius: 14,
        background: DS.bgCard, border: `1px dashed ${DS.textHint}`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, marginBottom: 4 }}>
          Aún no hay conceptos de video
        </div>
        <div style={{ fontSize: 12, color: DS.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
          Agregá conceptos de video en el Despliegue Creativo y aparecerán acá automáticamente con sus referentes.
        </div>
        {onOpenDespliegue && (
          <button onClick={onOpenDespliegue} style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 12 }}>
            Ir a Despliegue →
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", marginBottom: 4 }}>
            CONCEPTOS DEL DESPLIEGUE CREATIVO
          </div>
          <div style={{ fontSize: 12, color: DS.textSecondary }}>
            {formats.length} concepto{formats.length !== 1 ? "s" : ""} de video · click para editar nombre, descripción y referentes
          </div>
        </div>
        {onOpenDespliegue && (
          <button onClick={onOpenDespliegue} style={{ ...darkBtnGhost, padding: "7px 14px", fontSize: 11 }}>
            Ver en Despliegue →
          </button>
        )}
      </div>

      {/* Grid responsivo — cards cuadraditas */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        gap: 10,
      }}>
        {formats.map((f) => (
          <ConceptCard key={f.id} format={f} onClick={() => setEditing(f)} />
        ))}
      </div>

      {editing && (
        <ConceptEditModal
          format={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            // Refresca el padre pero NO cerramos el modal — el usuario sigue
            // editando/transcribiendo. El modal se cierra con "Listo" o X.
            onConceptUpdated?.();
          }}
        />
      )}
    </div>
  );
}

function ConceptCard({ format, onClick }) {
  const stage = format._concept?.stage || "tofu";
  const meta = STAGE_META[stage] || STAGE_META.tofu;
  const examples = format.examples || [];
  const propios = examples.filter((e) => e.source_type === "produced").length;
  const externos = examples.length - propios;

  return (
    <button
      onClick={onClick}
      style={{
        background: DS.bgCard,
        border: `1px solid ${meta.color}33`,
        borderRadius: 14,
        padding: "14px 14px 12px",
        cursor: "pointer",
        fontFamily: DS.font,
        color: DS.textPrimary,
        textAlign: "left",
        display: "flex", flexDirection: "column", gap: 8,
        position: "relative", overflow: "hidden",
        minHeight: 140,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${meta.color}88`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${meta.color}33`;
      }}
    >
      {/* Stripe superior con color de stage */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: meta.color, opacity: 0.75,
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 9.5, fontWeight: 800, color: meta.color,
          letterSpacing: "0.14em",
          padding: "3px 8px", borderRadius: 50,
          background: `${meta.color}18`,
        }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 9.5, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.08em" }}>
          {examples.length} REF{examples.length !== 1 ? "S" : ""}
        </div>
      </div>

      <div style={{
        fontSize: 14, fontWeight: 700, lineHeight: 1.25,
        color: DS.textPrimary, letterSpacing: "-0.005em",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {format.name}
      </div>

      {format.description ? (
        <div style={{
          fontSize: 11.5, color: DS.textSecondary, lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden", flex: 1,
        }}>
          {format.description}
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: DS.textMuted, fontStyle: "italic",
          flex: 1,
        }}>
          Sin descripción · click para agregarla
        </div>
      )}

      {/* Badges de refs */}
      {examples.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: "auto" }}>
          {propios > 0 && (
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              padding: "2px 7px", borderRadius: 50,
              background: `${DS.green}22`, color: DS.green,
              letterSpacing: "0.06em",
            }}>
              {propios} PROPIO{propios !== 1 ? "S" : ""}
            </span>
          )}
          {externos > 0 && (
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              padding: "2px 7px", borderRadius: 50,
              background: `${DS.blue}22`, color: DS.blue,
              letterSpacing: "0.06em",
            }}>
              {externos} EXTERNO{externos !== 1 ? "S" : ""}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
