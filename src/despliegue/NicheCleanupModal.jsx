import { useMemo, useState } from "react";
import { DS, withAlpha } from "../lib/design.js";
import { normLabel } from "./labels.js";
import { deleteVariationsBulk } from "../team/concept_bank/db.js";

// Limpia el despliegue de una empresa por NICHO: elegís los nichos a CONSERVAR
// (ej. Calzado/Ropa) y remueve del despliegue las referencias de OTROS nichos
// (el "flood" que metió un sync sin filtrar). Borra SOLO la copia del cliente,
// nunca el banco. Siempre con preview + confirmación. Las refs sin ningún nicho
// NO se tocan (no se sabe a qué mercado son → se conservan por seguridad).
//
// Props: variations (las del board), onClose, onDone(removedCount)
export function NicheCleanupModal({ variations = [], onClose, onDone }) {
  const [remove, setRemove] = useState(() => new Set());   // nichos a REMOVER (los que elegís)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Nichos presentes en el despliegue (nicho + subnicho), con conteo.
  const niches = useMemo(() => {
    const m = new Map(); // norm → { label, count }
    for (const v of variations) {
      const vals = [...(v.bank_labels?.nicho || []), ...(v.bank_labels?.subnicho || [])];
      const seen = new Set();
      for (const raw of vals) {
        const k = normLabel(raw); if (!k || seen.has(k)) continue; seen.add(k);
        const cur = m.get(k) || { label: raw, count: 0 };
        cur.count++; if (!cur.label) cur.label = raw;
        m.set(k, cur);
      }
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, label: v.label, count: v.count })).sort((a, b) => b.count - a.count);
  }, [variations]);

  const nicheKeys = (v) => {
    const s = new Set();
    for (const raw of [...(v.bank_labels?.nicho || []), ...(v.bank_labels?.subnicho || [])]) { const k = normLabel(raw); if (k) s.add(k); }
    return s;
  };

  // A remover: refs cuyos nichos están TODOS dentro de los elegidos-a-remover.
  // (Si una ref es calzado+salud y solo elegiste "salud", NO se borra — tiene otro
  // nicho no elegido. Así nunca borrás de más por accidente.)
  const toRemove = useMemo(() => {
    if (!remove.size) return [];
    return variations.filter((v) => { const ks = nicheKeys(v); return ks.size > 0 && [...ks].every((k) => remove.has(k)); });
  }, [variations, remove]);

  const toggle = (k) => setRemove((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const confirm = async () => {
    if (!toRemove.length) return;
    if (!window.confirm(`¿Remover ${toRemove.length} referencia(s) de otros nichos del despliegue? (Solo se quitan de esta empresa; el banco no se toca.)`)) return;
    setBusy(true); setError(null);
    try {
      await deleteVariationsBulk(toRemove.map((v) => v.id));
      onDone?.(toRemove.length);
    } catch (e) { setError(e?.message || String(e)); setBusy(false); }
  };

  const noNiche = variations.filter((v) => nicheKeys(v).size === 0).length;

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 97vw)", maxHeight: "90vh", overflowY: "auto", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, padding: "22px 26px", color: DS.textPrimary }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>🧽 Limpiar por nicho</h2>
        <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 16 }}>
          Elegí los nichos que querés <b style={{ color: DS.red }}>REMOVER</b> de este despliegue. Solo se quitan las referencias de esos nichos (de esta empresa; el banco no se toca).
        </div>

        {niches.length === 0 ? (
          <div style={{ fontSize: 13, color: DS.textMuted, padding: 20, textAlign: "center" }}>No hay referencias con nicho para filtrar.</div>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 8 }}>Remover estos nichos (clic para marcar):</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {niches.map((n) => {
                const on = remove.has(n.key);
                return (
                  <button key={n.key} onClick={() => toggle(n.key)} style={{
                    padding: "6px 12px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 12, fontWeight: 700,
                    border: on ? `1.5px solid ${DS.red}` : DS.border,
                    background: on ? withAlpha(DS.red, "22") : "transparent",
                    color: on ? DS.red : DS.textSecondary,
                  }}>{on ? "🗑 " : ""}{n.label} · {n.count}</button>
                );
              })}
            </div>

            <div style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 16, background: toRemove.length ? withAlpha(DS.red, "12") : withAlpha(DS.textHint, "18"), border: `1px solid ${toRemove.length ? withAlpha(DS.red, "44") : DS.border}` }}>
              {!remove.size ? (
                <span style={{ fontSize: 12.5, color: DS.textMuted }}>Marcá los nichos que querés remover.</span>
              ) : (
                <span style={{ fontSize: 12.5, color: toRemove.length ? DS.red : DS.textSecondary, fontWeight: 600 }}>
                  {toRemove.length ? `Se van a REMOVER ${toRemove.length} referencia(s).` : "Nada para remover con esa selección."}
                  {noNiche > 0 ? <span style={{ color: DS.textMuted, fontWeight: 400 }}> · {noNiche} sin nicho no se tocan.</span> : null}
                </span>
              )}
            </div>

            {error && <div style={{ color: DS.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "9px 18px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font }}>Cancelar</button>
          <button onClick={confirm} disabled={busy || !toRemove.length} style={{ padding: "9px 20px", borderRadius: 50, border: "none", background: DS.red, color: "#fff", fontSize: 12, fontWeight: 800, cursor: busy || !toRemove.length ? "default" : "pointer", fontFamily: DS.font, opacity: busy || !toRemove.length ? 0.5 : 1 }}>
            {busy ? "Removiendo…" : `🗑 Remover ${toRemove.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
