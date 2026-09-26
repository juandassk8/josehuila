import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { mergeConceptsInBank } from "./db.js";
import { logger } from "../../lib/logger.js";

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const FORMAT_LABEL = { static: "Estático", video: "Video" };

// Merge: elegís cuál de los seleccionados es el "concepto que se queda"
// (target). Las variations de los demás se mueven al target y los demás se
// ocultan del banco.
//
// Restricción: todos los seleccionados deben ser de la misma empresa para
// no contaminar el despliegue de la empresa target con refs de otras.
export function MergeConceptsModal({ items, onClose, onDone }) {
  const [targetId, setTargetId] = useState(items[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Misma empresa en todos? Si no, vamos a flow cross-company (agrupar).
  const sameCompany = useMemo(() => {
    if (items.length < 2) return false;
    const companyIds = new Set(items.map((i) => i.company_id));
    return companyIds.size === 1;
  }, [items]);

  // Misma stage+format — sigue siendo requerido también para cross-company
  // porque mezclar TOFU con MOFU o estáticos con videos no tiene sentido.
  const sameStageFormat = useMemo(() => {
    if (items.length < 2) return false;
    const buckets = new Set(items.map((i) => `${i.stage}/${i.format}`));
    return buckets.size === 1;
  }, [items]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, busy]);

  const totalRefs = items.reduce((sum, it) => sum + (it.variations_count || 0), 0);
  const target = items.find((it) => it.id === targetId);
  const sources = items.filter((it) => it.id !== targetId);
  const isCrossCompany = !sameCompany;
  const distinctCompanies = useMemo(
    () => [...new Set(items.map((i) => i.company_name).filter(Boolean))],
    [items]
  );

  // Same-company: necesitamos targetId (alguien absorbe). Cross-company: no.
  const canMerge = sameStageFormat && items.length >= 2 && (isCrossCompany || !!targetId);

  // Para cross-company, auto-elegimos el canonical = el de más refs (tie → más reciente).
  // Es el que va a quedar visible en el banco; los otros se ocultan pero se vinculan.
  const autoCanonical = useMemo(() => {
    if (!isCrossCompany || items.length === 0) return null;
    return [...items].sort((a, b) => {
      const dr = (b.variations_count || 0) - (a.variations_count || 0);
      if (dr !== 0) return dr;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    })[0];
  }, [isCrossCompany, items]);

  const handleConfirm = async () => {
    if (!canMerge) return;
    setBusy(true);
    setError(null);
    try {
      const effectiveTarget = isCrossCompany ? autoCanonical.id : targetId;
      const otherIds = items.map((i) => i.id).filter((id) => id !== effectiveTarget);
      const res = await mergeConceptsInBank({
        targetConceptId: effectiveTarget,
        sourceConceptIds: otherIds,
      });
      onDone?.(res);
    } catch (e) {
      logger.error("[MergeConcepts] failed", e);
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <Shell onClose={busy ? null : onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: DS.textMuted, marginBottom: 6,
        }}>
          Combinar conceptos
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {items.length} conceptos · {totalRefs} ref{totalRefs === 1 ? "" : "s"} en total
        </h2>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginTop: 6, lineHeight: 1.5 }}>
          {isCrossCompany ? (
            <>
              Los conceptos se <strong>vinculan como grupo</strong>. En el banco
              queda visible una sola card con todas las refs combinadas.
              Cada empresa mantiene sus refs originales en su despliegue.
              Al importar la card, se traen las refs de todos los miembros.
            </>
          ) : (
            <>
              Las referencias de los conceptos se mueven al "concepto que se queda".
              Los demás se ocultan del banco (no se borran del despliegue origen).
            </>
          )}
        </div>
      </div>

      {isCrossCompany && sameStageFormat && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 14,
          background: "rgba(59,139,212,0.10)", border: "1px solid rgba(59,139,212,0.30)",
          color: DS.textSecondary, fontSize: 12, lineHeight: 1.55,
        }}>
          🔗 <strong>Modo grupo cross-empresa</strong>: {distinctCompanies.length} empresas detectadas
          ({distinctCompanies.join(", ")}). Cada empresa va a ver primero sus propias
          referencias y después las del resto del grupo en su despliegue.
        </div>
      )}

      {!sameStageFormat && (
        <Warning>
          ⚠️ Los conceptos no son del mismo stage/formato. Combinar mezclaría TOFU con MOFU o estáticos con videos. Seleccioná conceptos del mismo bucket.
        </Warning>
      )}

      {/* Cross-company: lista de quiénes se vinculan, sin picker. */}
      {canMerge && isCrossCompany && (
        <div style={{
          border: DS.border, borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          marginBottom: 14, padding: "10px 14px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: DS.textPrimary, marginBottom: 8 }}>
            Conceptos que se vinculan:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#7BB6E6",
                  padding: "2px 8px", borderRadius: 50,
                  background: "rgba(59,139,212,0.16)",
                  border: "1px solid rgba(59,139,212,0.40)",
                }}>
                  🏢 {it.company_name || "—"}
                </span>
                <span style={{ fontSize: 12, color: DS.textPrimary, fontWeight: 600 }}>
                  {it.name || "Sin nombre"}
                </span>
                <span style={{ fontSize: 10, color: DS.textMuted, marginLeft: "auto" }}>
                  {it.variations_count} ref{it.variations_count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
          {autoCanonical && (
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)",
              fontSize: 11, color: DS.textSecondary, lineHeight: 1.55,
            }}>
              ✓ En el banco va a quedar visible: <strong>{autoCanonical.name}</strong> ({autoCanonical.company_name}) con todas las refs del grupo combinadas.<br />
              ✓ Los otros {items.length - 1} se ocultan del banco pero siguen en sus despliegues.<br />
              ✓ Al importar la card a otra empresa, se traen TODAS las refs deduped por imagen.
            </div>
          )}
        </div>
      )}

      {canMerge && !isCrossCompany && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 600, color: DS.textPrimary,
            marginBottom: 10, letterSpacing: "0.02em",
          }}>
            ¿Cuál concepto se queda?
          </div>
          <div style={{
            border: DS.border, borderRadius: 10,
            background: "rgba(0,0,0,0.25)",
            maxHeight: 320, overflowY: "auto",
            marginBottom: 12,
          }}>
            {items.map((it) => {
              const selected = targetId === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => setTargetId(it.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    background: selected ? `${DS.green}15` : "transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer", fontFamily: DS.font, textAlign: "left",
                    color: DS.textPrimary, fontSize: 13,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `1.5px solid ${selected ? DS.green : DS.textHint}`,
                    background: selected ? DS.green : "transparent",
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.name || "Sin nombre"}
                      </div>
                      {it.company_name && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: "#7BB6E6",
                          padding: "2px 8px", borderRadius: 50,
                          background: "rgba(59,139,212,0.16)",
                          border: "1px solid rgba(59,139,212,0.40)",
                          letterSpacing: "0.04em",
                        }}>
                          🏢 {it.company_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
                      {STAGE_LABEL[it.stage]} · {FORMAT_LABEL[it.format]} · {it.variations_count} ref{it.variations_count === 1 ? "" : "s"}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 14,
            background: "rgba(29,185,122,0.08)", border: "1px solid rgba(29,185,122,0.25)",
            color: DS.textSecondary, fontSize: 11, lineHeight: 1.55,
          }}>
            {/* Para cross-company nunca llegamos aquí (el picker está oculto). */}
            {!isCrossCompany && (
              <>
                Resultado: <strong>{target?.name}</strong> queda con sus {target?.variations_count} ref{target?.variations_count === 1 ? "" : "s"} más {sources.reduce((s, x) => s + (x.variations_count || 0), 0)} ref{sources.reduce((s, x) => s + (x.variations_count || 0), 0) === 1 ? "" : "s"} de los otros {sources.length} conceptos. Los otros se ocultan del banco.
              </>
            )}
          </div>
        </>
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
        <button onClick={onClose} disabled={busy} style={btnGhost()}>
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!canMerge || busy}
          style={{
            ...btnPrimary(),
            opacity: !canMerge || busy ? 0.5 : 1,
            cursor: !canMerge || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? (isCrossCompany ? "Vinculando…" : "Combinando…") : (isCrossCompany ? "Vincular grupo" : "Combinar")}
        </button>
      </div>
    </Shell>
  );
}

function Warning({ children }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8, marginBottom: 14,
      background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)",
      color: DS.amber, fontSize: 12, lineHeight: 1.55,
    }}>
      {children}
    </div>
  );
}

function Shell({ children, onClose }) {
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
          width: "min(540px, 100%)", maxHeight: "90vh", overflowY: "auto",
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

function btnPrimary() {
  return {
    padding: "10px 22px", borderRadius: 50, border: "none",
    background: DS.green, color: "#fff",
    fontSize: 12, fontWeight: 700,
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
