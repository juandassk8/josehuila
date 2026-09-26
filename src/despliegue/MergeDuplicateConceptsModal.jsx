import { useEffect, useState } from "react";
import { DS, withAlpha } from "../lib/design.js";
import { findDuplicateConcepts, mergeDuplicateConcepts } from "../team/concept_bank/db.js";

// Limpia conceptos DUPLICADOS de un despliegue: cuando el mismo formato + etapa quedó 2 veces
// (ej. "Comparativo" viejo + "Comparativo (Bofu)" organizado), conserva el más completo.
// Dos modos:
//   • BORRAR (default): archiva el viejo con sus refs → desaparece del despliegue. Reversible.
//   • FUSIONAR: mueve las refs del viejo al que queda antes de archivarlo (no pierde refs).
// Reviewable: ves cada grupo y podés destildar los que no quieras.
//
// Props: boardId, onClose, onDone(result)
export function MergeDuplicateConceptsModal({ boardId, onClose, onDone }) {
  const [groups, setGroups] = useState(null);   // null = cargando
  const [skip, setSkip] = useState(() => new Set());   // keeperIds de grupos a NO tocar
  const [mode, setMode] = useState("delete");    // "delete" | "merge"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    findDuplicateConcepts(boardId).then(setGroups).catch((e) => { setError(e?.message || String(e)); setGroups([]); });
  }, [boardId]);

  const keyOf = (g) => g.keeperId;
  const toggle = (g) => setSkip((s) => { const n = new Set(s); const k = keyOf(g); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selected = (groups || []).filter((g) => !skip.has(keyOf(g)));
  const isDelete = mode === "delete";

  const confirm = async () => {
    if (!selected.length) return;
    const nConc = selected.reduce((a, g) => a + g.losers.length, 0);
    const nRefs = selected.reduce((a, g) => a + g.losers.reduce((b, l) => b + l.refs, 0), 0);
    const msg = isDelete
      ? `¿Borrar ${nConc} concepto(s) viejo(s) duplicado(s)? Se archivan con sus ~${nRefs} referencia(s) (salen del despliegue, reversible). Queda solo el concepto organizado.`
      : `¿Fusionar ${nConc} concepto(s)? Se mueven ~${nRefs} referencia(s) al concepto que queda y los viejos se archivan. No se pierde ninguna referencia.`;
    if (!window.confirm(msg)) return;
    setBusy(true); setError(null);
    try {
      const r = await mergeDuplicateConcepts(selected, boardId, { moveRefs: !isDelete });
      onDone?.({ ...r, mode });
    } catch (e) { setError(e?.message || String(e)); setBusy(false); }
  };

  const accent = isDelete ? DS.red : DS.green;

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 97vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, color: DS.textPrimary, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 12px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>🧩 Conceptos duplicados</h2>
          <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 12 }}>
            Formatos que quedaron 2 veces (el viejo sin sufijo + el que organizaste). Se conserva el <b>más completo</b>.
          </div>
          {/* Selector de modo */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setMode("delete")} style={modeBtn(isDelete, DS.red)}>
              🗑 Borrar los viejos
            </button>
            <button onClick={() => setMode("merge")} style={modeBtn(!isDelete, DS.green)}>
              🔀 Fusionar (mover refs)
            </button>
          </div>
          <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 6 }}>
            {isDelete
              ? "Borra el concepto viejo con sus referencias (sale del despliegue, reversible). Queda solo el organizado."
              : "Mueve las referencias del viejo al organizado antes de archivarlo. No se pierde ninguna referencia."}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 12px" }}>
          {groups === null ? (
            <div style={{ padding: 30, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>Buscando duplicados…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>No hay conceptos duplicados. 👌</div>
          ) : groups.map((g, i) => {
            const on = !skip.has(keyOf(g));
            return (
              <div key={i} onClick={() => toggle(g)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, marginBottom: 6, cursor: "pointer", background: on ? withAlpha(accent, "0e") : "transparent", border: `1px solid ${on ? withAlpha(accent, "44") : DS.border}` }}>
                <input type="checkbox" checked={on} readOnly style={{ marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{g.stage}</span>{" "}
                    Conservar <span style={{ color: DS.green }}>“{g.keeperName}”</span> <span style={{ color: DS.textMuted, fontWeight: 500 }}>({g.keeperRefs} refs)</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: DS.textMuted, marginTop: 2 }}>
                    {isDelete ? "Borrar" : "Fusionar y archivar"}: {g.losers.map((l) => `“${l.name}” (${l.refs} refs)`).join(", ")}
                  </div>
                </div>
              </div>
            );
          })}
          {error && <div style={{ color: DS.red, fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: DS.textMuted }}>{groups?.length ? `${selected.length}/${groups.length} seleccionados` : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={busy} style={{ padding: "9px 18px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font }}>Cerrar</button>
            <button onClick={confirm} disabled={busy || !selected.length} style={{ padding: "9px 20px", borderRadius: 50, border: "none", background: accent, color: "#fff", fontSize: 12, fontWeight: 800, cursor: busy || !selected.length ? "default" : "pointer", fontFamily: DS.font, opacity: busy || !selected.length ? 0.5 : 1 }}>
              {busy ? (isDelete ? "Borrando…" : "Fusionando…") : `${isDelete ? "🗑 Borrar" : "🔀 Fusionar"} ${selected.length || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function modeBtn(active, color) {
  return {
    flex: 1, padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontSize: 12, fontWeight: 800,
    border: active ? `1.5px solid ${color}` : DS.border,
    background: active ? withAlpha(color, "1e") : "transparent",
    color: active ? color : DS.textSecondary,
  };
}
