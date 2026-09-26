import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";

// Modal de revisión de DUPLICADOS. Recibe grupos ya detectados (cada grupo = varias
// copias del mismo creativo). Por defecto conserva la "mejor" de cada grupo y marca
// el resto para borrar — pero VOS elegís cuál conservar y cuáles borrar antes de
// confirmar. Genérico: sirve para bandeja y banco.
//
// Props:
//   title, subtitle
//   groups  — [{ keepId, removeIds, items: [{ id, thumb, title, sub, tag }] }]
//   busy    — deshabilita mientras borra
//   onDelete(ids) — async, borra los ids elegidos
//   onClose
export function DuplicatesModal({ title = "Duplicados", subtitle = "", groups = [], busy = false, onDelete, onClose }) {
  // Cuál conservar por grupo (índice → id). Editable.
  const [keepByGroup, setKeepByGroup] = useState(() => { const m = {}; groups.forEach((g, i) => { m[i] = g.keepId; }); return m; });
  // Ids que el usuario decidió MANTENER (no borrar) aunque no sean el "conservar".
  const [excluded, setExcluded] = useState(() => new Set());

  const setKeep = (gi, id) => {
    setKeepByGroup((m) => ({ ...m, [gi]: id }));
    setExcluded((s) => { const n = new Set(s); n.delete(id); return n; });   // el nuevo elegido nunca se borra
  };
  const toggleExclude = (id) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Ids a borrar = todo lo que no es el "conservar" de su grupo y no está excluido.
  const deleteIds = useMemo(() => {
    const out = [];
    groups.forEach((g, gi) => { for (const it of g.items) if (it.id !== keepByGroup[gi] && !excluded.has(it.id)) out.push(it.id); });
    return out;
  }, [groups, keepByGroup, excluded]);

  const totalCopies = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const markAll = () => setExcluded(new Set());
  const markNone = () => {
    const s = new Set();
    groups.forEach((g, gi) => { for (const it of g.items) if (it.id !== keepByGroup[gi]) s.add(it.id); });
    setExcluded(s);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10003, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(780px, 97vw)", maxHeight: "92vh", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, color: DS.textPrimary, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>🔁 {title}</h3>
            <button onClick={onClose} disabled={busy} style={{ width: 30, height: 30, borderRadius: 8, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 5 }}>
            {groups.length === 0
              ? "No se encontraron duplicados. 👌"
              : <>{groups.length} grupo(s) · {totalCopies} copias · elegí en cada grupo <b style={{ color: DS.green }}>cuál conservar</b> (verde) y borrá el resto. {subtitle}</>}
          </div>
          {groups.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={markAll} disabled={busy} style={ghost}>Borrar todos los duplicados</button>
              <button onClick={markNone} disabled={busy} style={ghost}>No borrar ninguno</button>
            </div>
          )}
        </div>

        {/* Grupos */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ marginBottom: 14, border: `1px solid ${withAlpha(DS.textHint, "66")}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DS.textMuted, background: withAlpha(DS.textHint, "22") }}>
                Grupo {gi + 1} · {g.items.length} copias
              </div>
              {g.items.map((it) => {
                const isKeep = it.id === keepByGroup[gi];
                const willDelete = !isKeep && !excluded.has(it.id);
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: willDelete ? withAlpha(DS.red, "10") : (isKeep ? withAlpha(DS.green, "0c") : "transparent"), borderTop: `1px solid ${withAlpha(DS.textHint, "33")}` }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: DS.bgCard, border: DS.border, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {it.thumb ? <img src={it.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 16, opacity: 0.4 }}>🎬</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                      {it.sub && <div style={{ fontSize: 11, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</div>}
                    </div>
                    {it.tag && <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{it.tag}</span>}
                    {isKeep ? (
                      <span style={{ fontSize: 10, fontWeight: 800, color: DS.green, background: withAlpha(DS.green, "1e"), border: `1px solid ${withAlpha(DS.green, "55")}`, borderRadius: 50, padding: "4px 12px", whiteSpace: "nowrap" }}>✓ conservar</span>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button onClick={() => setKeep(gi, it.id)} disabled={busy} title="Conservar ESTA (y borrar la otra)" style={{ ...miniGhost, borderColor: withAlpha(DS.green, "88"), color: DS.green }}>conservar esta</button>
                        <button onClick={() => toggleExclude(it.id)} disabled={busy} style={{ ...miniGhost, minWidth: 78, borderColor: willDelete ? withAlpha(DS.red, "88") : DS.border, color: willDelete ? DS.red : DS.textMuted }}>
                          {willDelete ? "🗑 borrar" : "mantener"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={ghost}>Cerrar</button>
          <button onClick={() => onDelete?.(deleteIds)} disabled={busy || deleteIds.length === 0}
            style={{ padding: "9px 20px", borderRadius: 50, border: "none", background: DS.red, color: "#fff", fontSize: 12, fontWeight: 800, cursor: busy || deleteIds.length === 0 ? "default" : "pointer", fontFamily: DS.font, opacity: busy || deleteIds.length === 0 ? 0.5 : 1 }}>
            {busy ? "Borrando…" : `🗑 Eliminar ${deleteIds.length} duplicado(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghost = {
  padding: "7px 14px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const miniGhost = {
  padding: "5px 11px", borderRadius: 50, border: DS.border, background: "transparent",
  fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap",
};
