// Bandeja de la cola de guiones — abajo a la derecha, plegable.
//
// Es lo que hace que la generación en segundo plano se sienta segura: se ve qué
// hay corriendo, en qué paso va cada uno, cuáles quedaron listos para revisar y
// cuáles fallaron. Sin esto los guiones "aparecerían" sin explicación.
//
// Los toasts no sirven para este rol: duran 4 segundos fijos y no se actualizan.

import { useState } from "react";
import { DS } from "../../lib/design.js";
import { formatNum } from "./pipelineConstants.js";

const STATUS = {
  queued:    { label: "En cola",       color: "var(--ink-4)" },
  running:   { label: "Generando",     color: "var(--sel)" },
  done:      { label: "Listo",         color: "var(--green)" },
  error:     { label: "Falló",         color: "var(--brand)" },
  cancelled: { label: "Cancelado",     color: "var(--ink-4)" },
};

const mini = (extra = {}) => ({
  fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, borderRadius: 8,
  padding: "4px 9px", cursor: "pointer", border: "1px solid var(--line)",
  background: "transparent", color: "var(--ink-2)", ...extra,
});

export function ScriptQueueTray({ jobs, pending, ready, onReview, onRetry, onCancel, onClear }) {
  const [open, setOpen] = useState(true);
  if (!jobs.length) return null;

  const title = pending > 0
    ? `Generando guiones · ${pending} pendiente${pending === 1 ? "" : "s"}`
    : `${ready} guion${ready === 1 ? "" : "es"} listo${ready === 1 ? "" : "s"} para revisar`;

  return (
    <div style={{ position: "fixed", right: 22, bottom: 22, zIndex: 9998, width: "min(340px, calc(100vw - 44px))", fontFamily: DS.font }}>
      <div className="glass" style={{ borderRadius: 16, background: "var(--surface-solid)", border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <button type="button" onClick={() => setOpen((o) => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
          {pending > 0 && (
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--sel)", flex: "none" }} />
          )}
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={2.2} strokeLinecap="round"
            style={{ flex: "none", transform: open ? "none" : "rotate(180deg)", transition: "transform .15s" }}><path d="M6 15l6-6 6 6" /></svg>
        </button>

        {open && (
          <div style={{ borderTop: "1px solid var(--line)", maxHeight: "46vh", overflowY: "auto" }}>
            {jobs.map((j) => {
              const st = STATUS[j.status] || STATUS.queued;
              return (
                <div key={j.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 13px", borderBottom: "1px solid var(--line)" }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2, flex: "none" }}>{formatNum(j.slotNum)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.label}</div>
                    <div style={{ marginTop: 2, fontSize: 10.5, color: st.color, lineHeight: 1.4 }}>
                      {j.status === "running" && j.step ? j.step : st.label}
                      {j.status === "error" && j.error ? ` — ${j.error}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flex: "none" }}>
                    {j.status === "done" && (
                      <button type="button" onClick={() => onReview(j)} style={mini({ color: "var(--sel)", borderColor: "rgba(88,166,255,0.3)", background: "var(--sel-soft)" })}>Revisar</button>
                    )}
                    {j.status === "error" && (
                      <button type="button" onClick={() => onRetry(j.id)} style={mini()}>Reintentar</button>
                    )}
                    {j.status === "queued" && (
                      <button type="button" onClick={() => onCancel(j.id)} style={mini({ border: "none", color: "var(--ink-4)" })}>Quitar</button>
                    )}
                  </div>
                </div>
              );
            })}
            {jobs.some((j) => j.status !== "queued" && j.status !== "running") && (
              <button type="button" onClick={onClear}
                style={{ width: "100%", padding: "9px 13px", background: "transparent", border: "none", cursor: "pointer", fontFamily: DS.font, fontSize: 11.5, color: "var(--ink-4)" }}>
                Limpiar terminados
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
