import { useEffect, useMemo, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { GridBackground } from "../../despliegue/GridBackground.jsx";
import { FunnelLines } from "../../despliegue/FunnelLines.jsx";
import { useTheme } from "../../lib/theme.jsx";
import { DS } from "../../lib/design.js";

// Vista canvas del banco — replicada 1:1 del despliegue creativo de los
// clientes (`src/despliegue/DespliegueCreativo.jsx`). Mismas constantes de
// canvas, mismo zoom suave document-level, mismo embudo, mismo grid Miro.
//
// Diferencias respecto al despliegue:
//   - No hay edición (banco es read-only en este nivel)
//   - Sin drag-and-drop entre buckets
//   - Cards muestran badge de empresa origen + nicho
//   - Click en card → preview/select (no abre edit)

// ─── Constantes de canvas (idénticas al despliegue) ────────────────────────
const CANVAS_W = 20000;
const CANVAS_H_MIN = 12000;
const CENTER_X = CANVAS_W / 2;
const STAGE_WIDTHS = { tofu: 3000, mofu: 2400, bofu: 1800 };
const STAGE_GAP = 70;

const STAGES = [
  { key: "tofu", label: "Top Of The Funnel",    sub: "Atraer público nuevo", color: "#27E38F" },
  { key: "mofu", label: "Middle Of The Funnel", sub: "Considerar y confiar", color: "#FFD23F" },
  { key: "bofu", label: "Bottom Of The Funnel", sub: "Convertir y cerrar",   color: "#FF3A3A" },
];

const FORMATS = [
  { key: "static", label: "Estáticos" },
  { key: "video",  label: "Video" },
];

// Card del banco: 220px ancho × ~270 alto. Espacio dentro del bucket: 3 cols.
const CARD_W = 220;
const CARD_H = 270;
const CARD_GAP = 8;

function computeColumnHeight(itemCount) {
  if (itemCount === 0) return 0;
  const rows = Math.ceil(itemCount / 3);
  return rows * CARD_H + (rows - 1) * CARD_GAP;
}

function computeStageHeight(staticCount, videoCount) {
  const hS = computeColumnHeight(staticCount);
  const hV = computeColumnHeight(videoCount);
  const columnsH = Math.max(hS, hV, 180);
  return 160 /* stage header */ + 50 /* pill row */ + columnsH + 30 /* padding */;
}

function buildLayout(items) {
  const byBucket = {
    tofu: { static: [], video: [] },
    mofu: { static: [], video: [] },
    bofu: { static: [], video: [] },
  };
  for (const it of items) {
    if (!byBucket[it.stage]) continue;
    if (it.format === "static") byBucket[it.stage].static.push(it);
    else if (it.format === "video") byBucket[it.stage].video.push(it);
  }

  const tofuH = computeStageHeight(byBucket.tofu.static.length, byBucket.tofu.video.length);
  const mofuH = computeStageHeight(byBucket.mofu.static.length, byBucket.mofu.video.length);
  const bofuH = computeStageHeight(byBucket.bofu.static.length, byBucket.bofu.video.length);

  const totalH = tofuH + STAGE_GAP + mofuH + STAGE_GAP + bofuH;
  const canvasHeight = Math.max(CANVAS_H_MIN, totalH + 4000);
  const contentTop = canvasHeight / 2 - totalH / 2;
  const tofuY = contentTop;
  const mofuY = tofuY + tofuH + STAGE_GAP;
  const bofuY = mofuY + mofuH + STAGE_GAP;

  return {
    byBucket,
    canvasHeight,
    stages: [
      { key: "tofu", y: tofuY, height: tofuH, width: STAGE_WIDTHS.tofu },
      { key: "mofu", y: mofuY, height: mofuH, width: STAGE_WIDTHS.mofu },
      { key: "bofu", y: bofuY, height: bofuH, width: STAGE_WIDTHS.bofu },
    ],
  };
}

export function ConceptBankBoardView({
  items,
  selectionMode,
  selectedIds,
  onCardClick,
  onCardImport,
}) {
  const { isDark } = useTheme();
  const transformRef = useRef(null);

  const { byBucket, canvasHeight: CANVAS_H, stages: STAGE_LAYOUT } = useMemo(
    () => buildLayout(items),
    [items]
  );

  // ─── Wheel handler document-level (idéntico al despliegue) ────────────────
  // Pinch trackpad → zoom suave anclado al cursor. Two-finger swipe → pan.
  // Bloqueamos el zoom nativo del browser con preventDefault.
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.target?.closest?.("[data-modal]")) return;
      // Solo capturamos cuando el wheel ocurre sobre el canvas del banco.
      if (!e.target?.closest?.("[data-bank-canvas]")) return;
      if (!transformRef.current) return;
      e.preventDefault();
      const state = transformRef.current.state || transformRef.current.instance?.transformState;
      if (!state) return;
      const { positionX, positionY, scale } = state;

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.01);
        const newScale = Math.min(12, Math.max(0.03, scale * zoomFactor));
        if (newScale === scale) return;
        const cursorX = e.clientX;
        const cursorY = e.clientY;
        const worldX = (cursorX - positionX) / scale;
        const worldY = (cursorY - positionY) / scale;
        const newPosX = cursorX - worldX * newScale;
        const newPosY = cursorY - worldY * newScale;
        transformRef.current.setTransform(newPosX, newPosY, newScale, 0);
      } else {
        transformRef.current.setTransform(
          positionX - e.deltaX,
          positionY - e.deltaY,
          scale,
          0
        );
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      data-bank-canvas
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 240px)",
        minHeight: 600,
        overflow: "hidden",
        borderRadius: 14,
        border: DS.border,
        background: isDark ? "#06060A" : "#F5F5F0",
        touchAction: "none",
      }}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={0.4}
        minScale={0.03}
        maxScale={12}
        centerOnInit
        limitToBounds={false}
        wheel={{ disabled: true }}
        pinch={{ disabled: true }}
        doubleClick={{ disabled: true }}
        panning={{
          excluded: ["input", "button", "textarea", "select", "a"],
        }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: CANVAS_W, height: CANVAS_H }}
            >
              <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
                <GridBackground width={CANVAS_W} height={CANVAS_H} isDark={isDark} />

                <FunnelLines
                  canvasWidth={CANVAS_W}
                  canvasHeight={CANVAS_H}
                  stages={STAGE_LAYOUT.map((s) => ({
                    top: s.y,
                    bottom: s.y + s.height,
                    width: s.width,
                    centerX: CENTER_X,
                  }))}
                />

                {/* Título del tablero */}
                <div style={{
                  position: "absolute",
                  top: STAGE_LAYOUT[0].y - 220,
                  left: 0,
                  width: CANVAS_W,
                  textAlign: "center",
                }}>
                  <div style={{
                    fontSize: 120, fontWeight: 900, letterSpacing: "-0.01em",
                    color: isDark ? "#EBEBEB" : "#1A1D1C",
                    fontFamily: DS.font,
                    lineHeight: 1.1,
                  }}>
                    BANCO DE CREATIVOS
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 400, marginTop: 18,
                    color: isDark ? "rgba(255,255,255,0.45)" : "#5A5E5C",
                    letterSpacing: "0.04em",
                  }}>
                    Conceptos cross-empresa · TOFU / MOFU / BOFU
                  </div>
                </div>

                {STAGES.map((stage, idx) => {
                  const layout = STAGE_LAYOUT[idx];
                  return (
                    <StageRow
                      key={stage.key}
                      stage={stage}
                      layout={layout}
                      isDark={isDark}
                      itemsByFormat={byBucket[stage.key]}
                      selectionMode={selectionMode}
                      selectedIds={selectedIds}
                      onCardClick={onCardClick}
                      onCardImport={onCardImport}
                    />
                  );
                })}
              </div>
            </TransformComponent>

            <ZoomControls
              isDark={isDark}
              onZoomIn={() => zoomIn()}
              onZoomOut={() => zoomOut()}
              onReset={() => resetTransform()}
            />
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function StageRow({ stage, layout, isDark, itemsByFormat, selectionMode, selectedIds, onCardClick, onCardImport }) {
  const leftX = (CANVAS_W - layout.width) / 2;

  return (
    <div style={{
      position: "absolute",
      top: layout.y,
      left: leftX,
      width: layout.width,
    }}>
      {/* Stage header con glow neón */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div style={{
          fontSize: 64, fontWeight: 900, letterSpacing: "-0.01em",
          color: stage.color,
          textShadow: `0 0 28px ${stage.color}66, 0 0 12px ${stage.color}55`,
          fontFamily: DS.font,
          lineHeight: 1.1,
        }}>
          {stage.label}
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{
          fontSize: 12, fontWeight: 400,
          color: isDark ? "rgba(255,255,255,0.55)" : "#5A5E5C",
          fontFamily: DS.font,
        }}>
          {stage.sub}
        </div>
      </div>

      {/* Dos columnas: Estáticos | Video */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: 80,
        alignItems: "start",
        justifyContent: "center",
      }}>
        {FORMATS.map((format) => (
          <FormatBlock
            key={format.key}
            stage={stage}
            format={format}
            isDark={isDark}
            items={itemsByFormat[format.key] || []}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onCardClick={onCardClick}
            onCardImport={onCardImport}
          />
        ))}
      </div>
    </div>
  );
}

function FormatBlock({ stage, format, isDark, items, selectionMode, selectedIds, onCardClick, onCardImport }) {
  return (
    <div>
      {/* Pill del formato — mismo estilo que el despliegue */}
      <div style={{
        display: "flex", justifyContent: "center", marginBottom: 12,
      }}>
        <div style={{
          background: isDark ? "#EBEBEB" : "#1A1D1C",
          color: isDark ? "#06060A" : "#fff",
          padding: "8px 22px",
          borderRadius: 4,
          fontSize: 12, fontWeight: 700,
          fontFamily: DS.font,
          letterSpacing: "0.06em",
        }}>
          {format.label}
        </div>
      </div>

      {/* Cards: flex-wrap centrado, max 3 cols (3*220 + 2*8 = 676). */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignContent: "flex-start",
        gap: CARD_GAP,
        minHeight: 60,
        padding: 4,
        maxWidth: 684,
        margin: "0 auto",
      }}>
        {items.length === 0 ? (
          <div style={{
            width: 660, padding: "30px 0",
            textAlign: "center",
            color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)",
            fontSize: 13, fontStyle: "italic",
            fontFamily: DS.font,
          }}>
            sin conceptos en este bucket
          </div>
        ) : (
          items.map((it) => (
            <BankCanvasCard
              key={it.id}
              item={it}
              stageColor={stage.color}
              isDark={isDark}
              selectionMode={selectionMode}
              selected={selectedIds?.has(it.id)}
              onClick={() => onCardClick?.(it)}
              onImport={!selectionMode && onCardImport ? () => onCardImport(it) : null}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Card específica para el canvas — más rica que el grid: thumb grande +
// nombre + empresa + nicho + count de refs. Hover muestra "Importar".
function BankCanvasCard({ item, stageColor, isDark, selectionMode, selected, onClick, onImport }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: CARD_W, height: CARD_H,
        position: "relative",
        background: isDark ? "rgba(20,20,28,0.92)" : "#FFFFFF",
        border: selected
          ? `2px solid ${DS.green}`
          : isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        cursor: "pointer",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "border-color 0.15s, transform 0.1s",
        boxShadow: isDark ? "0 4px 14px rgba(0,0,0,0.4)" : "0 4px 14px rgba(0,0,0,0.06)",
        fontFamily: DS.font,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = `${stageColor}80`;
        const importBtn = e.currentTarget.querySelector("[data-import-btn]");
        if (importBtn) importBtn.style.opacity = 1;
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.08)";
        }
        const importBtn = e.currentTarget.querySelector("[data-import-btn]");
        if (importBtn) importBtn.style.opacity = 0;
      }}
    >
      {/* Thumb */}
      <div style={{
        width: "100%",
        height: 150,
        background: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.06)",
        position: "relative",
        flexShrink: 0,
      }}>
        {item.thumb_url ? (
          <img
            src={item.thumb_url}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
            fontSize: 11,
          }}>
            sin referencias
          </div>
        )}

        {/* Counter de refs */}
        {item.variations_count > 0 && (
          <div style={{
            position: "absolute", top: 7, right: 7,
            padding: "2px 8px", borderRadius: 50,
            background: "rgba(0,0,0,0.7)", color: "#fff",
            fontSize: 10, fontWeight: 700,
          }}>
            {item.variations_count} ref{item.variations_count === 1 ? "" : "s"}
          </div>
        )}

        {/* Pipeline pill */}
        <div style={{
          position: "absolute", top: 7, left: 7,
          padding: "2px 7px", borderRadius: 50,
          background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.85)",
          fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
        }}>
          {item.pipeline_type === "ads" ? "Ads" : "Orgánico"}
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 4,
        minHeight: 0,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: isDark ? "#FFFFFF" : "#1A1D1C",
          lineHeight: 1.25,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {item.name || "Sin nombre"}
        </div>

        <div style={{ flex: 1 }} />

        {/* Empresa + nicho */}
        <div style={{
          paddingTop: 6,
          borderTop: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: isDark ? "rgba(255,255,255,0.5)" : "#5A5E5C",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.company_name}
          </div>
          {item.niche && (
            <div style={{
              fontSize: 9, fontWeight: 600, marginTop: 2,
              color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.4)",
              letterSpacing: "0.06em", textTransform: "uppercase",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {item.niche}
            </div>
          )}
        </div>
      </div>

      {/* Botón Importar (hover) */}
      {!selectionMode && onImport && (
        <button
          data-import-btn
          onClick={(e) => { e.stopPropagation(); onImport(); }}
          style={{
            position: "absolute", top: 8, right: 8,
            padding: "5px 12px", borderRadius: 50,
            border: "none", background: DS.green, color: "#fff",
            fontSize: 10, fontWeight: 700,
            cursor: "pointer", fontFamily: DS.font,
            opacity: 0, transition: "opacity 0.15s",
            zIndex: 2,
          }}
        >
          Importar
        </button>
      )}

      {/* Checkbox de selección */}
      {selectionMode && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          width: 24, height: 24, borderRadius: "50%",
          border: selected ? `2px solid ${DS.green}` : "2px solid rgba(255,255,255,0.4)",
          background: selected ? DS.green : "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 13, fontWeight: 800,
          pointerEvents: "none",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        }}>
          {selected ? "✓" : ""}
        </div>
      )}
    </div>
  );
}

function ZoomControls({ isDark, onZoomIn, onZoomOut, onReset }) {
  return (
    <div style={{
      position: "absolute", bottom: 14, right: 14,
      display: "flex", flexDirection: "column", gap: 6, zIndex: 10,
    }}>
      <button onClick={onZoomIn} title="Acercar" style={zoomBtn(isDark)}>+</button>
      <button onClick={onReset} title="Centrar" style={{ ...zoomBtn(isDark), fontSize: 14 }}>⊙</button>
      <button onClick={onZoomOut} title="Alejar" style={zoomBtn(isDark)}>−</button>
    </div>
  );
}

function zoomBtn(isDark) {
  return {
    width: 36, height: 36,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
    background: isDark ? "rgba(14,14,20,0.96)" : "#FFFFFF",
    color: isDark ? "#EBEBEB" : "#1A1D1C",
    borderRadius: 8,
    cursor: "pointer", fontSize: 18, fontWeight: 400,
    fontFamily: DS.font,
    boxShadow: isDark ? "0 2px 6px rgba(0,0,0,0.4)" : "0 2px 6px rgba(0,0,0,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}
