import { useEffect, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { getOrCreateBoard } from "../../despliegue/db.js";
import { LABEL_CATEGORIES, hasActiveFilters, variationMatches, normLabel } from "../../despliegue/labels.js";
import { listBoardsByCompany, importConceptToBoard, fetchLabelVocabulary, listBankVariations } from "./db.js";
import { logger } from "../../lib/logger.js";

const PIPELINE_OPTIONS = [
  { key: "ads", label: "Anuncios" },
  { key: "organic", label: "Orgánico" },
];

// Solo filtramos por marca/nicho/ángulo al importar (formato ya es la columna).
const IMPORT_CATS = LABEL_CATEGORIES.filter((c) => c.key !== "formato");

// Modal: elegí empresa destino + pipeline_type, importa. Podés FILTRAR por
// etiqueta (marca/nicho/ángulo) para mandar solo las referencias relevantes.
// Si la empresa no tiene board del tipo elegido, lo crea on-demand.
// Soporta un solo concepto (`item`) o varios (`items`, modo lote).
export function ImportToCompanyModal({ item, items, onClose, onImported, initialLabelFilter = null }) {
  const sourceItems = items && items.length ? items : (item ? [item] : []);
  const isBulk = sourceItems.length > 1;
  const primary = sourceItems[0] || {};

  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const [targetCompanyId, setTargetCompanyId] = useState(null);
  const [pipelineType, setPipelineType] = useState(primary.pipeline_type || "ads");
  const [search, setSearch] = useState("");

  // Filtro de etiquetas para importar solo lo relevante. Se pre-llena con el
  // filtro activo del banco (initialLabelFilter).
  const [labelFilter, setLabelFilter] = useState(() => {
    const f = {};
    for (const c of IMPORT_CATS) f[c.key] = Array.isArray(initialLabelFilter?.[c.key]) ? [...initialLabelFilter[c.key]] : [];
    return f;
  });
  const [vocab, setVocab] = useState(null);
  const filterOn = hasActiveFilters(labelFilter);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  // Variations de los conceptos origen → para el PREVIEW de cuántas entran.
  const [srcVars, setSrcVars] = useState(null);

  useEffect(() => { fetchLabelVocabulary().then(setVocab).catch(() => setVocab({})); }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = new Set(sourceItems.map((s) => s.id));
    listBankVariations(pipelineType).then((all) => {
      if (cancelled) return;
      setSrcVars((all || []).filter((v) => ids.has(v.concept_id)));
    }).catch(() => { if (!cancelled) setSrcVars([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineType, sourceItems.length]);

  // Preview: cuántas referencias matchean el filtro actual (insensible a mayúsculas).
  const totalCount = srcVars?.length ?? null;
  const matchCount = srcVars == null ? null : (filterOn ? srcVars.filter((v) => variationMatches(v, labelFilter)).length : srcVars.length);

  // Vocabulario de chips DEDUPLICADO por clave normalizada (Calzado/calzado = 1 chip),
  // mostrando la escritura más frecuente.
  const dedupVocab = (cat) => {
    const counts = new Map();   // norm → { display, n }
    for (const v of srcVars || []) {
      for (const val of (v.bank_labels?.[cat] || [])) {
        const k = normLabel(val); if (!k) continue;
        const cur = counts.get(k) || { display: val, n: 0 };
        cur.n++; if ((val || "").length && !cur.display) cur.display = val;
        counts.set(k, cur);
      }
    }
    // Si no hay srcVars aún, caemos al vocabulario global.
    if (!srcVars) return (vocab?.[cat] || []);
    return [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.display);
  };

  const toggleTag = (cat, val) => setLabelFilter((prev) => {
    const cur = prev[cat] || [];
    return { ...prev, [cat]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] };
  });

  useEffect(() => {
    let cancelled = false;
    listBoardsByCompany().then((data) => {
      if (cancelled) return;
      // En modo single excluimos la empresa origen (no tiene sentido importar a
      // sí misma). En lote mostramos todas (los conceptos pueden ser de varias).
      const filtered = isBulk ? data : data.filter((c) => c.company_id !== primary.company_id);
      setCompanies(filtered);
      setLoadingCompanies(false);
    });
    return () => { cancelled = true; };
  }, [primary.company_id, isBulk]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !importing) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, importing]);

  const filteredCompanies = companies.filter((c) => {
    if (!search) return true;
    return c.company_name.toLowerCase().includes(search.toLowerCase());
  });

  const handleImport = async () => {
    if (!targetCompanyId) return;
    setImporting(true);
    setError(null);
    try {
      // Garantiza que exista un board del pipeline elegido para la empresa.
      const board = await getOrCreateBoard(targetCompanyId, pipelineType);
      // Importamos cada concepto seleccionado al mismo board destino, aplicando
      // el filtro de etiquetas (si hay).
      const applyFilter = filterOn ? labelFilter : null;
      let conceptsImported = 0;
      let variationsCopied = 0;
      let refreshed = 0;
      let skipped = 0;
      for (const src of sourceItems) {
        const res = await importConceptToBoard({
          sourceConceptId: src.id,
          targetBoardId: board.id,
          labelFilter: applyFilter,
        });
        // Las que YA estaban en el despliegue no se duplican: se actualizan (refresh).
        refreshed += res.refreshed || 0;
        if (res.skipped) { skipped += 1; continue; }
        conceptsImported += 1;
        variationsCopied += res.variationsCopied || 0;
      }
      // NOTA: el import NUNCA borra nada por su cuenta. La limpieza de duplicados
      // es una acción aparte, explícita y revisable (para no perder referencias).
      const target = companies.find((c) => c.company_id === targetCompanyId);
      const activeVals = applyFilter ? IMPORT_CATS.flatMap((c) => applyFilter[c.key] || []) : [];
      setDone({
        company_name: target?.company_name || "la empresa",
        company_slug: target?.company_slug,
        pipeline_type: pipelineType,
        conceptsImported,
        variationsCopied,
        refreshed,
        skipped,
        duplicatesSkipped: refreshed,
        tags: activeVals,
      });
      onImported?.({ conceptsImported, variationsCopied });
    } catch (e) {
      logger.error("[ImportToCompany] failed", e);
      setError(e?.message || String(e));
    } finally {
      setImporting(false);
    }
  };

  if (done) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 8px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{done.conceptsImported === 0 ? "⚠️" : "✓"}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: DS.textPrimary }}>
            {done.conceptsImported === 0
              ? "No se importó nada"
              : done.conceptsImported > 1 ? `${done.conceptsImported} conceptos importados` : "Concepto importado"}
          </h2>
          {done.conceptsImported > 0 && (
            <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, margin: "0 0 20px" }}>
              {done.conceptsImported > 1
                ? <>Los <strong>{done.conceptsImported} conceptos</strong></>
                : <><strong>{primary.name}</strong></>}
              {" "}quedaron en el despliegue {done.pipeline_type === "ads" ? "de anuncios" : "orgánico"} de <strong>{done.company_name}</strong>
              {" "}con <strong>{done.variationsCopied}</strong> referencia{done.variationsCopied === 1 ? "" : "s"} nueva{done.variationsCopied === 1 ? "" : "s"}
              {done.refreshed > 0 ? <> (+ <strong>{done.refreshed}</strong> que ya estaban, actualizadas)</> : null}.
              {done.tags?.length ? <> Solo los de <strong>{[...new Set(done.tags.map((t) => t.toLowerCase()))].length < done.tags.length ? [...new Map(done.tags.map((t) => [t.toLowerCase(), t])).values()].join(", ") : done.tags.join(", ")}</strong>.</> : null}
            </p>
          )}
          {done.conceptsImported === 0 && done.refreshed > 0 && (
            <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, margin: "0 0 20px" }}>
              No se agregó nada nuevo: las referencias que coincidían <strong>ya estaban</strong> en el despliegue de <strong>{done.company_name}</strong> ({done.refreshed} actualizada{done.refreshed === 1 ? "" : "s"}).
            </p>
          )}
          {done.skipped > 0 && (
            <p style={{ fontSize: 12, color: DS.textMuted, margin: "-8px 0 20px" }}>
              {done.skipped} concepto(s) se omitieron por no tener ninguna referencia con ese filtro.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button onClick={onClose} style={btnGhost()}>Cerrar</button>
            {done.company_slug && (
              <a
                href={`/cliente/${done.company_slug}`}
                target="_blank" rel="noreferrer"
                style={{ ...btnPrimary(), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Ir al despliegue ↗
              </a>
            )}
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={importing ? null : onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: DS.textMuted, marginBottom: 6,
        }}>
          Importar al despliegue
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: DS.textPrimary }}>
          {isBulk ? `${sourceItems.length} conceptos seleccionados` : primary.name}
        </h2>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginTop: 4 }}>
          {isBulk
            ? "Se copiarán todos al despliegue de la empresa que elijas"
            : `De ${primary.company_name}${primary.niche ? ` · ${primary.niche}` : ""}`}
        </div>
      </div>

      {/* Pipeline */}
      <Field label="¿A qué despliegue?">
        <div style={{ display: "flex", gap: 6 }}>
          {PIPELINE_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPipelineType(p.key)}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 50,
                border: pipelineType === p.key ? `1px solid ${DS.green}` : DS.border,
                background: pipelineType === p.key ? `${DS.green}22` : "transparent",
                color: pipelineType === p.key ? DS.green : DS.textSecondary,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      {/* Filtro por etiqueta: manda solo las referencias que coincidan */}
      <Field label={`Filtrar referencias por etiqueta${filterOn ? "" : " (opcional)"}`}>
        <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 8 }}>
          {filterOn
            ? "Se importan SOLO las referencias con estas etiquetas — así no le mandas a la empresa cosas que no usa."
            : "Sin filtro se importa todo. Elegí marca / nicho / ángulo para mandar solo lo relevante."}
        </div>
        {vocab === null ? (
          <div style={{ fontSize: 12, color: DS.textMuted }}>Cargando etiquetas…</div>
        ) : IMPORT_CATS.every((c) => !(vocab[c.key] || []).length) ? (
          <div style={{ fontSize: 12, color: DS.textMuted }}>Todavía no hay etiquetas en el banco.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {IMPORT_CATS.filter((c) => dedupVocab(c.key).length).map((c) => (
              <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />{c.label}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 96, overflowY: "auto" }}>
                  {dedupVocab(c.key).map((val) => {
                    const on = (labelFilter[c.key] || []).includes(val);
                    return (
                      <button key={val} onClick={() => toggleTag(c.key, val)} style={{
                        padding: "4px 10px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
                        fontSize: 11, fontWeight: 700,
                        border: on ? `1px solid ${c.color}` : DS.border,
                        background: on ? withAlpha(c.color, "22") : "transparent",
                        color: on ? c.color : DS.textSecondary,
                      }}>{val}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Field>

      {/* Empresa */}
      <Field label="Empresa destino">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empresa…"
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: DS.border, background: "rgba(0,0,0,0.3)",
            color: DS.textPrimary, fontSize: 13, fontFamily: DS.font,
            outline: "none", marginBottom: 8, boxSizing: "border-box",
          }}
        />
        <div style={{
          maxHeight: 240, overflowY: "auto",
          border: DS.border, borderRadius: 10,
          background: "rgba(0,0,0,0.2)",
        }}>
          {loadingCompanies && (
            <div style={{ padding: 16, color: DS.textMuted, fontSize: 12 }}>Cargando empresas…</div>
          )}
          {!loadingCompanies && filteredCompanies.length === 0 && (
            <div style={{ padding: 16, color: DS.textMuted, fontSize: 12 }}>
              No hay empresas que coincidan.
            </div>
          )}
          {filteredCompanies.map((c) => {
            const hasBoard = pipelineType === "ads" ? !!c.ads_board_id : !!c.organic_board_id;
            const selected = targetCompanyId === c.company_id;
            return (
              <button
                key={c.company_id}
                onClick={() => setTargetCompanyId(c.company_id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: selected ? `${DS.green}18` : "transparent",
                  border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer", fontFamily: DS.font, textAlign: "left",
                  color: selected ? DS.green : DS.textPrimary, fontSize: 13,
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `1.5px solid ${selected ? DS.green : DS.textHint}`,
                  background: selected ? DS.green : "transparent",
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1 }}>{c.company_name}</span>
                {!hasBoard && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                    padding: "2px 7px", borderRadius: 50,
                    background: "rgba(245,166,35,0.15)", color: DS.amber,
                  }}>
                    SE CREARÁ BOARD
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Field>

      {error && (
        <div style={{
          padding: 10, borderRadius: 8, marginBottom: 12,
          background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)",
          color: DS.red, fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Preview: cuántas referencias van a entrar con el filtro actual */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 14px",
        borderRadius: 10, background: matchCount === 0 ? withAlpha(DS.amber, "14") : withAlpha(DS.green, "12"),
        border: `1px solid ${matchCount === 0 ? withAlpha(DS.amber, "44") : withAlpha(DS.green, "33")}`,
      }}>
        <span style={{ fontSize: 16 }}>{matchCount === 0 ? "⚠️" : "▶"}</span>
        <span style={{ fontSize: 12.5, color: matchCount === 0 ? DS.amber : DS.textPrimary, fontWeight: 600 }}>
          {matchCount == null
            ? "Contando referencias…"
            : filterOn
              ? (matchCount === 0
                  ? `Ninguna de las ${totalCount} referencias coincide con ese filtro — ampliá o quitá etiquetas.`
                  : `Se importarán ${matchCount} de ${totalCount} referencias (las que ya estén no se duplican).`)
              : `Se importarán todas: ${totalCount} referencia${totalCount === 1 ? "" : "s"}.`}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button onClick={onClose} disabled={importing} style={btnGhost()}>Cancelar</button>
        <button
          onClick={handleImport}
          disabled={!targetCompanyId || importing || matchCount === 0}
          style={{
            ...btnPrimary(),
            opacity: !targetCompanyId || importing || matchCount === 0 ? 0.5 : 1,
            cursor: !targetCompanyId || importing || matchCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          {importing ? "Importando…" : "Importar"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }) {
  return (
    <div
      onClick={onClose || undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, padding: "24px 28px",
          color: DS.textPrimary,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: DS.textPrimary,
        marginBottom: 8, letterSpacing: "0.02em",
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function btnPrimary() {
  return {
    padding: "10px 22px", borderRadius: 50, border: "none",
    background: DS.green, color: "#fff",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
    fontFamily: DS.font, letterSpacing: "0.02em",
  };
}

function btnGhost() {
  return {
    padding: "10px 22px", borderRadius: 50,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent", color: DS.textSecondary,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    fontFamily: DS.font,
  };
}
