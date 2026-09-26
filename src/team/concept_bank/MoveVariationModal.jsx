import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { listBankConcepts, moveVariationToConcept, moveVariationsToConcept } from "./db.js";
import { logger } from "../../lib/logger.js";

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const STAGE_COLOR = { tofu: DS.blue, mofu: DS.amber, bofu: DS.green };
const STAGE_ORDER = ["tofu", "mofu", "bofu"];
const FORMAT_LABEL = { static: "Estático", video: "Video" };
const PIPELINE_LABEL = { ads: "🎬 Creativos", organic: "🌱 Contenido" };
const PIPELINE_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "ads", label: "🎬 Creativos" },
  { key: "organic", label: "🌱 Contenido" },
];
const FORMAT_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "video", label: "🎬 Video" },
  { key: "static", label: "🖼 Estático" },
];

// Modal: elegí concept destino para mover una o varias referencias.
// Por default filtra al mismo company_id del origen para no contaminar el
// despliegue de otra empresa. Toggle "ver todas" desbloquea cross-empresa
// (con warning).
export function MoveVariationModal({
  variation,         // { id, label, name, file_url, ... } — modo single
  variationIds,      // [id, id, …] — modo lote (tiene prioridad sobre variation)
  sourceConceptItem, // el item del banco que la contiene (para inferir empresa origen)
  onClose,
  onDone,
}) {
  const bulkIds = variationIds && variationIds.length ? variationIds : (variation ? [variation.id] : []);
  const isBulk = bulkIds.length > 1;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Por defecto mostramos TODOS los conceptos (no solo la empresa origen) para
  // poder mover a cualquier formato, incluidos los del "Banco de referencias".
  const [companyFilter, setCompanyFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  // Filtro de TIPO — arranca en el mismo tipo del concepto de origen (si estás en
  // un concepto de video, muestra videos), con toggle para cambiar a Estático. Así
  // podés mover un estático que quedó mal clasificado en un concepto de video.
  const [formatFilter, setFormatFilter] = useState(
    sourceConceptItem?.format === "static" || sourceConceptItem?.format === "video" ? sourceConceptItem.format : "all"
  );
  const [targetId, setTargetId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listBankConcepts()
      .then((data) => {
        // Excluimos el concept origen de las opciones (no podés mover una
        // variation al mismo concept donde ya está).
        const filtered = data.filter((it) => it.id !== sourceConceptItem.id);
        setItems(filtered);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || String(e));
        setLoading(false);
      });
  }, [sourceConceptItem.id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, busy]);

  const companyOptions = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (it.company_id && !map.has(it.company_id)) {
        map.set(it.company_id, { id: it.company_id, name: it.company_name });
      }
    }
    return [{ id: "all", name: "Todas las empresas" }, ...Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))];
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (companyFilter !== "all") {
      list = list.filter((it) => it.company_id === companyFilter);
    }
    if (pipelineFilter !== "all") {
      list = list.filter((it) => (it.pipeline_type || "ads") === pipelineFilter);
    }
    if (formatFilter !== "all") {
      list = list.filter((it) => it.format === formatFilter);
    }
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((it) => {
        const hay = `${it.name || ""} ${it.company_name || ""} ${STAGE_LABEL[it.stage]} ${FORMAT_LABEL[it.format]}`.toLowerCase();
        return hay.includes(term);
      });
    }
    return list;
  }, [items, companyFilter, pipelineFilter, formatFilter, search]);

  // Agrupamos por stage (TOFU / MOFU / BOFU) para poder ver "todos los de cada
  // etapa" de un vistazo. Orden fijo tofu → mofu → bofu.
  const groupedByStage = useMemo(() => {
    const groups = { tofu: [], mofu: [], bofu: [] };
    for (const it of filteredItems) {
      (groups[it.stage] || (groups[it.stage] = [])).push(it);
    }
    return groups;
  }, [filteredItems]);

  const target = items.find((it) => it.id === targetId);
  // "bank_refs" es el bucket neutro, no una empresa real → no cuenta como cross.
  const isCrossCompany = target
    && target.company_id !== sourceConceptItem.company_id
    && target.company_id !== "bank_refs";

  const handleConfirm = async () => {
    if (!targetId) return;
    setBusy(true);
    setError(null);
    try {
      if (isBulk) {
        await moveVariationsToConcept({ variationIds: bulkIds, targetConceptId: targetId });
      } else {
        await moveVariationToConcept({ variationId: bulkIds[0], targetConceptId: targetId });
      }
      onDone?.();
    } catch (e) {
      logger.error("[MoveVariation] failed", e);
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, padding: "24px 28px",
          color: DS.textPrimary,
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
            color: DS.textMuted, marginBottom: 6,
          }}>
            {isBulk ? `Mover ${bulkIds.length} referencias` : "Mover referencia"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {isBulk
              ? `${bulkIds.length} seleccionadas`
              : `${variation?.label || ""}${variation?.name ? ` · ${variation.name}` : ""}`}
          </h2>
          <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>
            De: {sourceConceptItem.name} ({sourceConceptItem.company_name})
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar concepto destino…"
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              border: DS.border, background: "rgba(0,0,0,0.3)",
              color: DS.textPrimary, fontSize: 13, fontFamily: DS.font,
              outline: "none",
            }}
          />
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            style={{
              padding: "9px 10px", borderRadius: 8, border: DS.border,
              background: "rgba(0,0,0,0.3)", color: DS.textPrimary,
              fontSize: 12, fontFamily: DS.font, outline: "none", cursor: "pointer",
              maxWidth: 200,
            }}
          >
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Filtros: TIPO (video/estático) + banco (pipeline) */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {/* TIPO — arranca en el del origen; cambiá a Estático para mover un estático mal clasificado */}
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2 }}>
            {FORMAT_FILTERS.map((f) => {
              const active = formatFilter === f.key;
              return (
                <button key={f.key} onClick={() => { setFormatFilter(f.key); setTargetId(null); }}
                  title={f.key === "static" ? "Mostrar conceptos ESTÁTICOS (para mover un estático mal clasificado)" : f.key === "video" ? "Mostrar conceptos de VIDEO" : "Mostrar todos los tipos"}
                  style={{
                    padding: "6px 12px", borderRadius: 50, border: "none",
                    background: active ? DS.bgSide : "transparent",
                    color: active ? DS.textPrimary : DS.textMuted,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  }}>
                  {f.label}
                </button>
              );
            })}
          </div>
          {/* Banco (pipeline) — para mover entre Creativos y Contenido */}
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2 }}>
            {PIPELINE_FILTERS.map((p) => {
              const active = pipelineFilter === p.key;
              return (
                <button key={p.key} onClick={() => setPipelineFilter(p.key)}
                  style={{
                    padding: "6px 14px", borderRadius: 50, border: "none",
                    background: active ? DS.bgSide : "transparent",
                    color: active ? DS.textPrimary : DS.textMuted,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{
          border: DS.border, borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          maxHeight: 440, overflowY: "auto",
          marginBottom: 12,
        }}>
          {loading && <div style={{ padding: 16, color: DS.textMuted, fontSize: 12 }}>Cargando…</div>}
          {!loading && filteredItems.length === 0 && (
            <div style={{ padding: 16, color: DS.textMuted, fontSize: 12 }}>
              Ningún concepto matchea los filtros. Probá cambiando empresa o banco.
            </div>
          )}
          {!loading && STAGE_ORDER.map((stg) => {
            const group = groupedByStage[stg] || [];
            if (group.length === 0) return null;
            const color = STAGE_COLOR[stg];
            return (
              <div key={stg}>
                {/* Header de etapa (sticky) */}
                <div style={{
                  position: "sticky", top: 0, zIndex: 1,
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px",
                  background: "rgba(20,20,28,0.96)", backdropFilter: "blur(6px)",
                  borderBottom: `1px solid ${color}40`,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                    color: "#fff", background: color, padding: "3px 8px", borderRadius: 50,
                  }}>{STAGE_LABEL[stg]}</span>
                  <span style={{ fontSize: 10, color: DS.textMuted }}>{group.length}</span>
                </div>
                {group.map((it) => {
                  const selected = targetId === it.id;
                  const cross = it.company_id !== sourceConceptItem.company_id && it.company_id !== "bank_refs";
                  return (
                    <button
                      key={it.id}
                      onClick={() => setTargetId(it.id)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px",
                        background: selected ? `${DS.green}18` : "transparent",
                        border: "none", borderLeft: `3px solid ${selected ? DS.green : "transparent"}`,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        cursor: "pointer", fontFamily: DS.font, textAlign: "left",
                        color: DS.textPrimary, fontSize: 13,
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: `1.5px solid ${selected ? DS.green : DS.textHint}`,
                        background: selected ? DS.green : "transparent",
                        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 10, fontWeight: 800,
                      }}>{selected ? "✓" : ""}</span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.08em",
                        color, border: `1px solid ${color}66`, background: `${color}1A`,
                        padding: "2px 6px", borderRadius: 50, flexShrink: 0,
                      }}>{STAGE_LABEL[stg]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.name || "Sin nombre"}
                        </div>
                        <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
                          {PIPELINE_LABEL[it.pipeline_type || "ads"]} · {FORMAT_LABEL[it.format]} · {it.company_name}
                          {cross && " ⚠️"}
                        </div>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {isCrossCompany && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)",
            color: DS.amber, fontSize: 11, lineHeight: 1.55,
          }}>
            ⚠️ Cross-empresa: la referencia va a aparecer en el despliegue de <strong>{target.company_name}</strong>. Confirmá que es lo que querés.
          </div>
        )}

        {error && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)",
            color: DS.red, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "10px 22px", borderRadius: 50,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent", color: DS.textSecondary,
              fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
              fontFamily: DS.font,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!targetId || busy}
            style={{
              padding: "10px 22px", borderRadius: 50, border: "none",
              background: DS.green, color: "#fff",
              fontSize: 12, fontWeight: 700,
              cursor: !targetId || busy ? "not-allowed" : "pointer",
              fontFamily: DS.font, letterSpacing: "0.02em",
              opacity: !targetId || busy ? 0.5 : 1,
            }}
          >
            {busy ? "Moviendo…" : "Mover acá"}
          </button>
        </div>
      </div>
    </div>
  );
}
