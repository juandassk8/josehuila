import { useEffect, useMemo, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { ConceptBankCard } from "./ConceptBankCard.jsx";
import { listBankConcepts, importConceptToBoard } from "./db.js";
import { logger } from "../../lib/logger.js";

const STAGES = [
  // Hex puros — ver nota en ConceptBankPage.jsx sobre el bug del rgba en chips.
  { key: "all",  label: "Todos",  color: "#6B7280" },
  { key: "tofu", label: "TOFU",   color: DS.blue },
  { key: "mofu", label: "MOFU",   color: DS.amber },
  { key: "bofu", label: "BOFU",   color: DS.green },
];

const FORMATS = [
  { key: "all",    label: "Todos" },
  { key: "static", label: "Estático" },
  { key: "video",  label: "Video" },
];

// Modal-versión del banco lanzado desde el DespliegueCreativo de UNA empresa.
// El target está fijo (board destino), el user multi-selecciona y el botón
// "Importar (N)" copia todo. Excluye conceptos que ya estén en este board
// (mismo nombre+stage+format) para no duplicar.
//
// Props:
//   - targetBoardId: board destino (obligatorio)
//   - targetCompanyId: para excluir self (opcional)
//   - onClose: cerrar sin acción
//   - onDone: callback con count importado, dispara reload del padre
export function ConceptBankBrowserModal({ targetBoardId, targetCompanyId, onClose, onDone }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);

  const [stageFilter, setStageFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    listBankConcepts()
      .then((data) => {
        // Excluir conceptos de la propia empresa (no tiene sentido importar
        // a uno mismo).
        const filtered = targetCompanyId
          ? data.filter((it) => it.company_id !== targetCompanyId)
          : data;
        setItems(filtered);
        setLoading(false);
      })
      .catch((e) => { setError(e?.message || String(e)); setLoading(false); });
  }, [targetCompanyId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !importing) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, importing]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (stageFilter !== "all" && it.stage !== stageFilter) return false;
      if (formatFilter !== "all" && it.format !== formatFilter) return false;
      if (term) {
        const hay = `${it.name || ""} ${it.company_name || ""} ${it.niche || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, stageFilter, formatFilter, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      // Secuencial — los inserts dependen del board destino y son rápidos.
      // Si después se vuelve un cuello de botella, lo paralelizo.
      let count = 0;
      for (const id of selected) {
        await importConceptToBoard({
          sourceConceptId: id,
          targetBoardId,
        });
        count++;
      }
      onDone?.(count);
    } catch (e) {
      logger.error("[BankBrowser] import failed", e);
      setError(e?.message || String(e));
      setImporting(false);
    }
  };

  return (
    <div
      onClick={importing ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1080px, 100%)", height: "min(740px, 90vh)",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, color: DS.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
              color: DS.purple, marginBottom: 4, fontWeight: 800,
            }}>
              Banco de creativos
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
              Importar al despliegue
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              padding: "6px 12px", borderRadius: 8,
              border: DS.border, background: "transparent",
              color: DS.textSecondary, cursor: importing ? "not-allowed" : "pointer",
              fontSize: 14, opacity: importing ? 0.5 : 1,
            }}
          >×</button>
        </div>

        {/* Filtros */}
        <div style={{
          padding: "14px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        }}>
          {STAGES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={stageFilter === s.key}
              color={s.color}
              onClick={() => setStageFilter(s.key)}
            />
          ))}
          <span style={{ width: 1, height: 22, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
          {FORMATS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              active={formatFilter === f.key}
              onClick={() => setFormatFilter(f.key)}
            />
          ))}
          <span style={{ flex: 1 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{
              padding: "7px 12px", borderRadius: 50,
              border: DS.border, background: "rgba(0,0,0,0.3)",
              color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
              outline: "none", minWidth: 200,
            }}
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && (
            <div style={{ padding: 60, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
              Cargando banco…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
              {items.length === 0
                ? "No hay otros conceptos para importar todavía."
                : "Ningún concepto matchea los filtros."}
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}>
              {filtered.map((it) => (
                <ConceptBankCard
                  key={it.id}
                  item={it}
                  selected={selected.has(it.id)}
                  onClick={() => toggle(it.id)}
                  compact
                />
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: "10px 24px", color: DS.red, fontSize: 12,
            background: "rgba(226,75,74,0.1)",
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "14px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1, fontSize: 12, color: DS.textMuted }}>
            {selected.size > 0
              ? `${selected.size} concepto${selected.size === 1 ? "" : "s"} seleccionado${selected.size === 1 ? "" : "s"}`
              : "Hacé click en una card para seleccionarla"}
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              padding: "10px 20px", borderRadius: 50,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent", color: DS.textSecondary,
              fontSize: 12, fontWeight: 600,
              cursor: importing ? "not-allowed" : "pointer",
              fontFamily: DS.font,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={selected.size === 0 || importing}
            style={{
              padding: "10px 24px", borderRadius: 50, border: "none",
              background: DS.green, color: "#fff",
              fontSize: 12, fontWeight: 700,
              cursor: selected.size === 0 || importing ? "not-allowed" : "pointer",
              fontFamily: DS.font, letterSpacing: "0.02em",
              opacity: selected.size === 0 || importing ? 0.5 : 1,
            }}
          >
            {importing ? "Importando…" : `Importar${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, color, onClick }) {
  const safeColor = color || DS.textPrimary;
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 50,
        border: active ? `1px solid ${safeColor}` : DS.border,
        background: active ? withAlpha(safeColor, "22") : "transparent",
        color: active ? safeColor : DS.textSecondary,
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        cursor: "pointer", fontFamily: DS.font,
      }}
    >
      {label}
    </button>
  );
}
