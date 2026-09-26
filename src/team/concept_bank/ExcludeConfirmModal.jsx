import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { excludeConceptsFromBank } from "./db.js";
import { logger } from "../../lib/logger.js";

// Confirma que el user quiere ocultar los conceptos del banco. Aclara que
// NO los borra del despliegue de la empresa origen.
export function ExcludeConfirmModal({ items, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, busy]);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await excludeConceptsFromBank(items.map((i) => i.id));
      onDone?.(items.length);
    } catch (e) {
      logger.error("[ExcludeConfirm] failed", e);
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div
      onClick={busy ? undefined : onClose}
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
          width: "min(460px, 100%)",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, padding: "24px 28px",
          color: DS.textPrimary,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
          ¿Eliminar {items.length} concepto{items.length === 1 ? "" : "s"} del banco?
        </h2>
        <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, margin: "0 0 16px" }}>
          Estos conceptos van a dejar de aparecer en el banco, pero <strong>no se borran</strong> del despliegue de la empresa origen. Podés revertirlo después si te arrepentís.
        </p>

        <div style={{
          maxHeight: 180, overflowY: "auto",
          background: "rgba(0,0,0,0.25)", borderRadius: 8,
          padding: "8px 12px", marginBottom: 18,
          fontSize: 12,
        }}>
          {items.map((it) => (
            <div key={it.id} style={{
              padding: "5px 0", color: DS.textSecondary,
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              display: "flex", gap: 8,
            }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name || "Sin nombre"}
              </span>
              <span style={{ color: DS.textMuted, fontSize: 11 }}>
                {it.company_name}
              </span>
            </div>
          ))}
        </div>

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
            disabled={busy}
            style={{
              padding: "10px 22px", borderRadius: 50, border: "none",
              background: DS.red, color: "#fff",
              fontSize: 12, fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: DS.font, letterSpacing: "0.02em",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Eliminando…" : "Eliminar del banco"}
          </button>
        </div>
      </div>
    </div>
  );
}
