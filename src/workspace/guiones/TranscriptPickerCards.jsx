import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";

// Picker visual de transcripciones guardadas como ejemplos en formatos.
// Cards en grid 2 columnas. Filtros:
//   - "Este formato" — solo del formato actualmente elegido (default si hay).
//   - "Todos" — todas las transcripciones de todos los formatos.
//   - Por formato específico (dropdown).
//
// Cada card: chip de formato (color), title, primeras líneas del transcript,
// chip "Propia" o "Externa". Click → invoca onPick(transcriptText).

export function TranscriptPickerCards({ formats, currentFormatId, onPick, onClose }) {
  // Filtro por formato. "current" = solo del formato actual.
  // "all" = todos. Otherwise = format id específico.
  const [filter, setFilter] = useState(currentFormatId ? "current" : "all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  // Cierre con Escape + click outside.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  // Aplanamos: todas las transcripciones con metadata del formato dueño.
  const allItems = useMemo(() => {
    const out = [];
    for (const fmt of formats || []) {
      const examples = Array.isArray(fmt.examples) ? fmt.examples : [];
      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        if (!ex?.transcript) continue;
        out.push({
          formatId: fmt.id,
          formatName: fmt.name,
          formatColor: fmt.color || "#3DD9FF",
          title: ex.title || `Ejemplo ${i + 1}`,
          transcript: ex.transcript,
          isOwn: !!ex.is_own,
        });
      }
    }
    return out;
  }, [formats]);

  // Items según filtro.
  const items = useMemo(() => {
    if (filter === "all") return allItems;
    if (filter === "current") return allItems.filter((it) => it.formatId === currentFormatId);
    return allItems.filter((it) => it.formatId === filter);
  }, [allItems, filter, currentFormatId]);

  const currentFormat = formats?.find((f) => f.id === currentFormatId);
  const formatsWithExamples = useMemo(
    () => (formats || []).filter((f) => Array.isArray(f.examples) && f.examples.length > 0),
    [formats]
  );

  const filterLabel = filter === "current"
    ? `Este formato${currentFormat ? ` · ${currentFormat.name}` : ""}`
    : filter === "all"
      ? "Todos los formatos"
      : `Solo: ${formats?.find((f) => f.id === filter)?.name || "—"}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: DS.font,
      }}
    >
      <div
        ref={wrapRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 100%)",
          maxHeight: "85vh",
          background: DS.bgSide,
          border: `1px solid ${DS.textHint}`,
          borderRadius: 16,
          padding: "20px 24px",
          color: DS.textPrimary,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header con filtro */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Elegir transcripción
            </div>
            <div style={{ fontSize: 11.5, color: DS.textMuted, marginTop: 2 }}>
              {items.length} transcripción{items.length !== 1 ? "es" : ""} disponible{items.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* Filter dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setFilterMenuOpen((v) => !v)}
              style={{
                padding: "7px 14px", borderRadius: 50,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${DS.textHint}`,
                color: DS.textPrimary, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: DS.font,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              🔎 {filterLabel} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {filterMenuOpen && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6,
                background: DS.bgSide,
                border: `1px solid ${DS.textHint}`,
                borderRadius: 10, padding: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                zIndex: 10, minWidth: 220, maxHeight: 320, overflowY: "auto",
              }}>
                {currentFormatId && (
                  <FilterItem
                    active={filter === "current"}
                    onClick={() => { setFilter("current"); setFilterMenuOpen(false); }}
                  >Este formato {currentFormat ? `· ${currentFormat.name}` : ""}</FilterItem>
                )}
                <FilterItem
                  active={filter === "all"}
                  onClick={() => { setFilter("all"); setFilterMenuOpen(false); }}
                >Todos los formatos</FilterItem>
                <div style={{
                  padding: "6px 12px", fontSize: 9, fontWeight: 700,
                  color: DS.textMuted, letterSpacing: "0.14em", borderTop: `1px solid ${DS.border}`,
                  marginTop: 4,
                }}>POR FORMATO</div>
                {formatsWithExamples.map((f) => (
                  <FilterItem
                    key={f.id}
                    active={filter === f.id}
                    onClick={() => { setFilter(f.id); setFilterMenuOpen(false); }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: f.color || "#3DD9FF", display: "inline-block",
                      marginRight: 8, verticalAlign: "middle",
                    }} />
                    {f.name} <span style={{ color: DS.textMuted, fontSize: 10, marginLeft: 6 }}>({f.examples.length})</span>
                  </FilterItem>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "7px 14px", borderRadius: 50,
              background: "transparent", border: `1px solid ${DS.textHint}`,
              color: DS.textSecondary, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: DS.font,
            }}
          >Cancelar</button>
        </div>

        {/* Cards grid */}
        <div style={{ overflowY: "auto", paddingRight: 4, flex: 1 }}>
          {items.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px", color: DS.textMuted, fontSize: 13,
            }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>📝</div>
              {filter === "current"
                ? "No hay transcripciones guardadas en este formato. Probá ver todos los formatos."
                : "No hay transcripciones guardadas todavía."}
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 10,
            }}>
              {items.map((it, i) => (
                <button
                  key={`${it.formatId}-${i}`}
                  type="button"
                  onClick={() => onPick(it.transcript)}
                  style={{
                    textAlign: "left", cursor: "pointer", fontFamily: DS.font,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid rgba(255,255,255,0.08)`,
                    borderRadius: 10, padding: "12px 14px",
                    color: DS.textPrimary,
                    display: "flex", flexDirection: "column", gap: 8,
                    transition: "border-color 120ms, background 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${it.formatColor}88`;
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 50,
                      background: `${it.formatColor}20`,
                      border: `1px solid ${it.formatColor}55`,
                      color: it.formatColor,
                      letterSpacing: "0.04em",
                    }}>{it.formatName}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      padding: "2px 7px", borderRadius: 50,
                      background: it.isOwn ? "rgba(29,185,122,0.16)" : "rgba(255,255,255,0.05)",
                      border: it.isOwn
                        ? "1px solid rgba(29,185,122,0.45)"
                        : "1px solid rgba(255,255,255,0.10)",
                      color: it.isOwn ? "#1DB97A" : DS.textMuted,
                      letterSpacing: "0.06em",
                    }}>{it.isOwn ? "PROPIA" : "EXTERNA"}</span>
                  </div>
                  <div style={{
                    fontSize: 12.5, fontWeight: 700, color: DS.textPrimary,
                    lineHeight: 1.3,
                  }}>{it.title}</div>
                  <div style={{
                    fontSize: 11, color: DS.textSecondary, lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>{it.transcript}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterItem({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "8px 12px", borderRadius: 6,
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        border: "none", color: DS.textPrimary,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: DS.font, display: "block",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}
