import { DS } from "../../lib/design.js";
import { fmtDueDate, isOverdue, isDueToday } from "../../lib/dates.js";
import { getTagStyle } from "./TagSelect.jsx";
import { EDIT_SUBSTATUS } from "./EditSubstatusPicker.jsx";
import { destinationStatus } from "./publishDestinations.js";

const STATUS_COLORS = {
  idea: "#9b9b9b",
  scripting: "#378ADD",
  to_film: "#E24B4A",
  to_edit: "#EC4899",
  to_post: "#E9C435",
  posted: "#1DB97A",
  trial: "#A78BFA",      // violeta — fase de validación
  killed: "#6B7280",     // gris — no funcionó
  promoted: "#0EA5E9",   // celeste — escaló a publicación amplia
};

const KIND_EMOJI = { video: "🎬", story: "📱", post: "📝" };

export const CONTENT_STATUS_LABEL = {
  idea: "Idea",
  scripting: "Scripting",
  to_film: "To Film",
  to_edit: "To Edit",
  to_post: "To Post",
  posted: "Posted",
  trial: "Trial",
  killed: "Killed",
  promoted: "Promoted",
};

// Pipeline base — se muestra siempre que kindFilter sea video/all (Trial)
// o cualquier filtro (estados pre-Trial). Killed/Promoted se manejan aparte
// como estados archivados detrás de un toggle.
export const CONTENT_STATUSES = ["idea", "scripting", "to_film", "to_edit", "to_post", "posted"];

// Estado posterior a Posted, solo aplicable a videos.
export const TRIAL_STATUS = "trial";

// Estados terminales archivados — visibles solo si el user expande el toggle.
export const ARCHIVED_STATUSES = ["killed", "promoted"];

export const STORY_CATEGORIES = [
  { value: "autoridad", label: "Autoridad", color: "#E24B4A" },
  { value: "educativo", label: "Educativo", color: "#8B5CF6" },
  { value: "problema", label: "Problema", color: "#8B5CF6" },
  { value: "camino", label: "Camino", color: "#8B5CF6" },
  { value: "conexion", label: "Conexión", color: "#E9C435" },
  { value: "objeciones", label: "Objeciones", color: "#E9C435" },
  { value: "ambicion", label: "Ambición", color: "#E9C435" },
  { value: "confianza", label: "Confianza Programa", color: "#E9C435" },
  { value: "urgencia", label: "Urgencia", color: "#E24B4A" },
  { value: "oferta", label: "Oferta", color: "#E24B4A" },
  { value: "otro", label: "Otro", color: "#9b9b9b" },
];

// Column background tints (Notion-style pastel)
export const COLUMN_BG = {
  idea: "rgba(200,200,200,0.05)",
  scripting: "rgba(55,138,221,0.06)",
  to_film: "rgba(226,75,74,0.06)",
  to_edit: "rgba(236,72,153,0.06)",
  to_post: "rgba(233,196,53,0.06)",
  posted: "rgba(29,185,122,0.06)",
  trial: "rgba(167,139,250,0.06)",
  killed: "rgba(107,114,128,0.06)",
  promoted: "rgba(14,165,233,0.06)",
};

export const COLUMN_BORDER = {
  idea: "rgba(200,200,200,0.12)",
  scripting: "rgba(55,138,221,0.15)",
  to_film: "rgba(226,75,74,0.15)",
  to_edit: "rgba(236,72,153,0.15)",
  to_post: "rgba(233,196,53,0.15)",
  posted: "rgba(29,185,122,0.15)",
  trial: "rgba(167,139,250,0.15)",
  killed: "rgba(107,114,128,0.15)",
  promoted: "rgba(14,165,233,0.15)",
};

export function ContentCard({ item, members, tagOptions, onClick, onArchiveToggle, dragHandleProps, dragListeners, isDragging }) {
  const statusColor = STATUS_COLORS[item.status] || "#9b9b9b";
  const overdue = item.status !== "posted" && isOverdue(item.scheduled_date);
  const sub = item.edit_substatus && EDIT_SUBSTATUS[item.edit_substatus] ? EDIT_SUBSTATUS[item.edit_substatus] : null;
  const needsFinalLink =
    (item.status === "to_post" || item.status === "posted") &&
    !(item.link_video_final && item.link_video_final.trim());
  const archived = !!item.archived;

  return (
    <div
      onClick={(e) => { if (e.defaultPrevented) return; onClick?.(item); }}
      {...(dragHandleProps || {})}
      {...(dragListeners || {})}
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 6,
        cursor: isDragging ? "grabbing" : "pointer",
        opacity: isDragging ? 0.4 : (archived ? 0.55 : 1),
        transition: "box-shadow 0.15s, background 0.15s, opacity 0.15s",
        fontFamily: DS.font,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = DS.bgCard;
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = DS.bgCard;
          e.currentTarget.style.boxShadow = "none";
        }
      }}
    >
      {/* Botón discreto archivar/desarchivar — onPointerDown para que el
          drag-listener del padre no lo intercepte y stopPropagation para
          no abrir el detalle. */}
      {onArchiveToggle && (
        <span
          role="button"
          tabIndex={0}
          title={archived ? "Desarchivar" : "Archivar"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onArchiveToggle(item, !archived); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault(); e.stopPropagation();
              onArchiveToggle(item, !archived);
            }
          }}
          style={{
            position: "absolute", top: 4, right: 8,
            padding: "0 4px", lineHeight: 1,
            fontSize: 14, fontWeight: 700,
            color: DS.textMuted, cursor: "pointer", userSelect: "none",
          }}
        >
          {archived ? "↩" : "⋯"}
        </span>
      )}

      {/* Title with status dot */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: statusColor,
          flexShrink: 0, marginTop: 5,
        }} />
        <div style={{
          color: DS.textPrimary, fontSize: 13, fontWeight: 500, lineHeight: 1.4,
          textDecoration: item.status === "completado" || item.status === "posted" ? "line-through" : "none",
          opacity: item.status === "posted" ? 0.6 : 1,
          paddingRight: onArchiveToggle ? 18 : 0,
        }}>
          {item.title}
        </div>
      </div>

      {/* Sub-status + falta link final */}
      {(sub || needsFinalLink) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginLeft: 16 }}>
          {sub && (
            <MiniTag color={sub.color} bg={sub.color + "22"}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: sub.color, marginRight: 4, verticalAlign: "middle",
              }} />
              {sub.label}
            </MiniTag>
          )}
          {needsFinalLink && (
            <MiniTag color="#E24B4A" bg="rgba(226,75,74,0.15)">
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#E24B4A", marginRight: 4, verticalAlign: "middle",
              }} />
              Falta link final
            </MiniTag>
          )}
        </div>
      )}

      {/* Casillas de destino IG/TikTok — visibles SOLO en To Post.
          Verde si chuleado, gris si pendiente. Para los demás estados
          (Posted/Trial/Killed/Promoted) se ve simplemente el título tachado
          o el dot — el detalle de destinos vive en el modal del item. */}
      {item.status === "to_post" && item.kind === "video" && (() => {
        const dests = destinationStatus(item);
        if (!dests) return null;
        return (
          <div style={{ display: "flex", gap: 4, marginTop: 6, marginLeft: 16 }}>
            {dests.map((d) => (
              <span
                key={d.key}
                title={`${d.meta.label} ${d.meta.handle} — ${d.done ? "publicado" : "pendiente"}`}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 50,
                  background: d.done ? "rgba(29,185,122,0.18)" : "rgba(255,255,255,0.04)",
                  color: d.done ? "#1DB97A" : DS.textMuted,
                  border: `1px solid ${d.done ? "rgba(29,185,122,0.4)" : "rgba(255,255,255,0.1)"}`,
                  letterSpacing: "0.04em",
                }}
              >
                {d.done ? "✓" : "○"} {d.meta.label.replace("Autoridad", "A").replace("Conexión", "C")}
              </span>
            ))}
          </div>
        );
      })()}

      {/* Solo dejamos chips funcionales: fecha vencida y "falta link final"
          ya viven arriba en el bloque sub-status. Los tags decorativos
          (Tipo, Formato, Concepto) se quitaron — el círculo emoji que el
          user pone en el título ya distingue Autoridad vs Conexión, y el
          formato/concepto vive en el modal del item. */}
      {item.scheduled_date && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginLeft: 16 }}>
          <MiniTag
            color={overdue ? "#E24B4A" : isDueToday(item.scheduled_date) ? "#E9C435" : DS.textMuted}
            bg={overdue ? "rgba(226,75,74,0.15)" : "transparent"}
          >
            {fmtDueDate(item.scheduled_date)}
          </MiniTag>
        </div>
      )}
    </div>
  );
}

function MiniTag({ color, bg, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, color,
      background: bg || "transparent",
      padding: "1px 6px", borderRadius: 4,
    }}>
      {children}
    </span>
  );
}

// Cuando el mismo label existe en múltiples groups (tipo, tipo_story, formato),
// devuelve el option con updated_at más reciente — así un cambio de color del
// usuario se refleja sin importar en qué grupo estaba el dato original.
function pickFreshestTag(options, label) {
  if (!options || !label) return null;
  const matches = options.filter((o) => o.label === label);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.slice().sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  })[0];
}
