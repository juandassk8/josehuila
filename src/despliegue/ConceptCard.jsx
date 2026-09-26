import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTheme } from "../lib/theme.jsx";
import { useCanvasFilter } from "./CanvasFilterContext.js";
import { variationVisible, anyCanvasFilterActive, getLabels } from "./labels.js";

// Acepta dos flags granulares:
//   canEditMeta       → habilita drag-handle y "click para editar concepto".
//   canEditVariations → si el caller pasa onAddExample, ya está gateado fuera.
// Backwards-compat: si solo viene `isAdmin`, lo usamos para ambos (admin global).
export function ConceptCard({ concept, examples, viewMode = "reference", isAdmin, canEditMeta, canEditVariations, onEditConcept, onOpenConcept, onOpenExample, onAddExample, selectionMode = false, conceptSelected = false, selectedRefIds = null, onToggleConcept, onToggleRef }) {
  const editMeta = canEditMeta ?? isAdmin;
  const editVars = canEditVariations ?? isAdmin;
  // En modo selección deshabilitamos el drag para que clickear seleccione en vez
  // de arrastrar.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: concept.id,
    disabled: !editMeta || selectionMode,
  });

  const style = isDragging
    ? { opacity: 0.3, transition }
    : { transform: CSS.Transform.toString(transform), transition };

  return (
    <ConceptCardPresentational
      ref={setNodeRef}
      concept={concept}
      examples={examples}
      viewMode={viewMode}
      canEditMeta={editMeta}
      canEditVariations={editVars}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
      onEditConcept={onEditConcept}
      onOpenConcept={onOpenConcept}
      onOpenExample={onOpenExample}
      onAddExample={onAddExample}
      selectionMode={selectionMode}
      conceptSelected={conceptSelected}
      selectedRefIds={selectedRefIds}
      onToggleConcept={onToggleConcept}
      onToggleRef={onToggleRef}
      style={style}
    />
  );
}

export function ConceptCardPresentational({
  concept,
  examples = [],
  viewMode = "reference",
  isAdmin = true,
  canEditMeta,
  canEditVariations,
  dragAttributes,
  dragListeners,
  isDragging = false,
  onEditConcept,
  onOpenConcept,
  onOpenExample,
  onAddExample,
  selectionMode = false,
  conceptSelected = false,
  selectedRefIds = null,
  onToggleConcept,
  onToggleRef,
  style,
  ref,
}) {
  // Fallback a isAdmin para callsites legacy (DragOverlay).
  const editMeta = canEditMeta ?? isAdmin;
  const editVars = canEditVariations ?? isAdmin;
  const { isDark } = useTheme();

  // Filtramos por modo: "reference" (inspiración) vs "produced" (creados por
  // la empresa via pipeline). Defaults a reference si el source_type es null
  // (entries viejas antes de la migración).
  const referenceExamples = examples.filter(
    (e) => (e.source_type || "reference") === "reference"
  );
  const producedExamples = examples.filter(
    (e) => e.source_type === "produced"
  );
  const allShownExamples = viewMode === "produced" ? producedExamples : referenceExamples;

  // Filtro/resaltado del canvas (etiquetas + links). En modo "filtrar" ocultamos
  // los que no coinciden; en "resaltar" los atenuamos. Sin filtros activos, todo
  // se ve normal.
  const { filters, linkFilter, mode, showLabels } = useCanvasFilter();
  const filterActive = anyCanvasFilterActive(filters, linkFilter);
  const shownExamples = (filterActive && mode === "filtrar")
    ? allShownExamples.filter((e) => variationVisible(e, filters, linkFilter))
    : allShownExamples;

  const sectionLabel = viewMode === "produced" ? "ANUNCIOS CREADOS" : "REFERENTES";
  const countOther = viewMode === "produced" ? referenceExamples.length : producedExamples.length;
  const labelOther = viewMode === "produced" ? "referentes" : "creados";

  const cardBg = isDark ? "#14141A" : "#FDFDFB";
  const cardBorder = isDark ? "1.5px solid rgba(255,255,255,0.1)" : "1.5px solid #D4D4CE";
  const titleColor = isDark ? "#FFFFFF" : "#000";
  const titleBorder = isDark ? "1.5px solid rgba(255,255,255,0.2)" : "1.5px solid #1A1D1C";
  const textPrimary = isDark ? "#EBEBEB" : "#1A1D1C";
  const textSecondary = isDark ? "rgba(255,255,255,0.55)" : "#5A5E5C";
  const textMuted = isDark ? "rgba(255,255,255,0.35)" : "#A0A29E";
  const handleColor = isDark ? "rgba(255,255,255,0.3)" : "#B8BBB5";
  const handleHoverColor = isDark ? "rgba(255,255,255,0.7)" : "#5A5E5C";
  const handleHoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const selectConceptColor = "#E24B4A"; // rojo destructivo (DS.red) para selección de borrado

  return (
    <div
      ref={ref}
      onClick={selectionMode ? () => onToggleConcept?.(concept.id) : undefined}
      style={{
        width: 220,
        background: cardBg,
        border: conceptSelected ? `1.5px solid ${selectConceptColor}` : cardBorder,
        borderRadius: 10,
        padding: 12,
        fontFamily: "'Inter','DM Sans',sans-serif",
        color: textPrimary,
        boxShadow: conceptSelected
          ? `0 0 0 3px ${selectConceptColor}33`
          : (isDragging
            ? "0 8px 20px rgba(0,0,0,0.35)"
            : (isDark ? "0 1px 4px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.04)")),
        position: "relative",
        cursor: selectionMode ? "pointer" : undefined,
        ...style,
      }}
    >
      {/* Checkbox de selección (modo selección, solo admin). Al clickear la card
          o el checkbox se togglea el concepto para borrado permanente. */}
      {selectionMode && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggleConcept?.(concept.id); }}
          title={conceptSelected ? "Quitar de la selección" : "Seleccionar concepto para eliminar"}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${conceptSelected ? selectConceptColor : (isDark ? "rgba(255,255,255,0.4)" : "#B8BBB5")}`,
            background: conceptSelected ? selectConceptColor : (isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.9)"),
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            cursor: "pointer",
            zIndex: 6,
            lineHeight: 1,
          }}
        >
          {conceptSelected ? "✓" : ""}
        </div>
      )}

      {editMeta && !selectionMode && (
        <div
          {...(dragAttributes || {})}
          data-drag-handle
          title="Arrastrar para mover"
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            padding: "6px 8px",
            fontSize: 14,
            color: handleColor,
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
            borderRadius: 4,
            lineHeight: 1,
            fontFamily: "monospace",
            touchAction: "none",
            zIndex: 5,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragListeners?.onPointerDown?.(e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => { e.currentTarget.style.color = handleHoverColor; e.currentTarget.style.background = handleHoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = handleColor; e.currentTarget.style.background = "transparent"; }}
        >
          ⋮⋮
        </div>
      )}

      <div
        onClick={selectionMode ? undefined : () => (onOpenConcept ? onOpenConcept(concept) : (editMeta && onEditConcept?.(concept)))}
        style={{ cursor: selectionMode ? "pointer" : ((onOpenConcept || editMeta) ? "pointer" : "default") }}
        title="Ver el formato (descripción, cómo se hace, referencias)"
      >
        <div style={{
          fontSize: 14,
          fontWeight: 800,
          color: titleColor,
          borderBottom: titleBorder,
          paddingBottom: 3,
          marginBottom: 6,
          paddingLeft: editMeta ? 16 : 0,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {concept.name}
        </div>
      </div>

      {concept.description ? (
        <div style={{
          fontSize: 10,
          color: textSecondary,
          lineHeight: 1.4,
          marginBottom: 10,
          minHeight: 24,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "normal",
        }}>
          {concept.description}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: textMuted, marginBottom: 10, fontStyle: "italic" }}>
          Sin descripción
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 5,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: textPrimary, letterSpacing: "0.08em" }}>
          {sectionLabel}
        </span>
        {countOther > 0 && (
          <span style={{ fontSize: 8, fontWeight: 600, color: textSecondary, letterSpacing: "0.04em" }}>
            ·{" "}{countOther} {labelOther}
          </span>
        )}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
      }}>
        {shownExamples.map((ex) => {
          const dim = filterActive && mode === "resaltar" && !variationVisible(ex, filters, linkFilter);
          // Solo las referencias LOCALES de este board son seleccionables/borrables.
          // Las externas (de otras empresas o del banco, con concept_id remapeado)
          // tienen origin_concept_id distinto al concept_id y NO se pueden borrar
          // desde acá — así jamás tocamos el banco ni otro cliente.
          const isLocalRef = !ex.origin_concept_id || ex.origin_concept_id === ex.concept_id;
          const refSelectable = selectionMode && isLocalRef;
          const refSelected = refSelectable && !!selectedRefIds?.has?.(ex.id);
          return (
            <ExampleThumb
              key={ex.id}
              example={ex}
              onClick={
                refSelectable
                  ? (e) => { e?.stopPropagation?.(); onToggleRef?.(ex.id); }
                  : (selectionMode ? (e) => e?.stopPropagation?.() : () => onOpenExample?.(ex))
              }
              isDark={isDark}
              mode={viewMode}
              dim={dim}
              showLabels={showLabels}
              selected={refSelected}
            />
          );
        })}
        {onAddExample && viewMode === "reference" && !selectionMode && (
          <button
            onClick={() => onAddExample(concept)}
            title="Agregar referencia"
            style={{
              aspectRatio: "3 / 4",
              border: `1.5px dashed ${isDark ? "rgba(255,255,255,0.2)" : "#C4C6C2"}`,
              background: "transparent",
              color: isDark ? "rgba(255,255,255,0.45)" : "#8A8E8B",
              fontSize: 16,
              fontWeight: 300,
              cursor: "pointer",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = isDark ? "#3FCF9B" : "#1D9E75";
              e.currentTarget.style.background = isDark ? "rgba(63,207,155,0.08)" : "rgba(29,158,117,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.2)" : "#C4C6C2";
              e.currentTarget.style.background = "transparent";
            }}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

export function ExampleThumb({ example, onClick, isDark, mode = "reference", dim = false, showLabels = false, selected = false }) {
  const hasImage = !!example.file_url;
  const accentColor = mode === "produced" ? "#3FCF9B" : "#8A8E8B";
  const marca = showLabels ? (getLabels(example).marca?.[0] || "") : "";
  const selColor = "#E24B4A"; // rojo destructivo (DS.red)
  return (
    <button
      onClick={onClick}
      title={example.name || (mode === "produced" ? "Anuncio producido" : "Referencia")}
      style={{
        aspectRatio: "3 / 4",
        border: selected
          ? `2px solid ${selColor}`
          : `1px solid ${mode === "produced" ? `${accentColor}66` : (isDark ? "rgba(255,255,255,0.12)" : "#D4D4CE")}`,
        background: hasImage ? (isDark ? "#0e0f12" : "#ececea") : (isDark ? "rgba(255,255,255,0.04)" : "#F5F5F0"),
        borderRadius: 4,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        position: "relative",
        opacity: dim ? 0.22 : 1,
        boxShadow: selected ? `0 0 0 2px ${selColor}55` : "none",
        transition: "opacity 0.15s",
      }}
    >
      {hasImage ? (
        <>
          {/* Fondo: la MISMA imagen, desenfocada y cubriendo el tile → rellena el
              letterbox sin bordes negros feos (las portadas blancas ya no muestran
              barras negras). Encima va la imagen completa (contain). */}
          <img
            src={example.file_url}
            alt=""
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(16px)", transform: "scale(1.2)", opacity: isDark ? 0.5 : 0.6 }}
          />
          <img
            src={example.file_url}
            alt={example.name || ""}
            style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", display: "block", zIndex: 1 }}
          />
        </>
      ) : (
        <div style={{
          fontSize: 8,
          color: mode === "produced" ? accentColor : (isDark ? "rgba(255,255,255,0.35)" : "#8A8E8B"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontWeight: 700,
          textAlign: "center",
          padding: 2,
          lineHeight: 1.2,
        }}>
          {mode === "produced"
            ? (example.name ? truncate(example.name, 18) : "ANUNCIO")
            : "AD"}
        </div>
      )}
      {selected && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", top: 2, right: 2,
            width: 15, height: 15, borderRadius: 4,
            background: selColor, color: "#fff",
            fontSize: 10, fontWeight: 900, lineHeight: "15px",
            textAlign: "center", zIndex: 2,
          }}
        >
          ✓
        </span>
      )}
      {marca && (
        <span
          title={`Marca: ${marca}`}
          style={{
            position: "absolute", left: 2, right: 2, bottom: 2,
            fontSize: 7, fontWeight: 800, letterSpacing: "0.02em",
            color: "#fff", background: "rgba(124,58,237,0.85)",
            borderRadius: 3, padding: "1px 3px", lineHeight: 1.25,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {truncate(marca, 16)}
        </span>
      )}
    </button>
  );
}

function truncate(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
