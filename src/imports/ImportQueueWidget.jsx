// Progreso de la cola de importación, visible desde cualquier sección.
//
// Va montado en main.jsx, FUERA del router, junto a NotificationsBell y
// GlobalFeedback — que ya están ahí precisamente para sobrevivir a los
// re-renders. Ese es el punto: antes había que quedarse en la Bandeja mirando.
//
// No pinta nada cuando no hay trabajos. El 99% del tiempo es invisible.

import { useState } from "react";
import { DS, withAlpha } from "../lib/design.js";
import { useImportJobs } from "../team/hooks/useImportJobs.js";
import {
  cancelImportJob, retryImportJob, esActivo, textoDeEstado, minutosRestantes,
} from "../team/inbox/importJobsDb.js";

const COLOR = {
  queued: DS.textMuted,
  scraping: DS.blue,
  importing: DS.blue,
  classifying: DS.blue,
  done: DS.green,
  failed: DS.red,
  canceled: DS.textMuted,
};

export function ImportQueueWidget() {
  const { jobs, reload } = useImportJobs();
  const [abierto, setAbierto] = useState(false);
  const [ocultos, setOcultos] = useState(() => new Set());

  const visibles = jobs.filter((j) => !ocultos.has(j.id));
  if (visibles.length === 0) return null;

  const activos = visibles.filter(esActivo);
  const enCurso = activos.find((j) => j.status !== "queued") || activos[0];
  const enCola = activos.filter((j) => j.status === "queued").length;

  const pct = enCurso && enCurso.total_ads > 0
    ? Math.round((enCurso.done_ads / enCurso.total_ads) * 100)
    : null;

  const descartar = (id) => setOcultos((s) => new Set(s).add(id));

  const accion = async (fn, id) => {
    try { await fn(id); await reload(); } catch { /* el estado real llega por realtime */ }
  };

  return (
    <div style={{
      position: "fixed", bottom: 22, right: 232, zIndex: 9996, fontFamily: DS.font,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
    }}>
      {abierto && (
        <div style={{
          width: "min(420px, calc(100vw - 44px))", maxHeight: "60vh", overflowY: "auto",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,.28)",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${DS.textHint}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: DS.textSecondary }}>
              IMPORTANDO
            </span>
            <button onClick={() => setAbierto(false)} style={{
              background: "none", border: "none", color: DS.textMuted, cursor: "pointer",
              fontSize: 16, lineHeight: 1, padding: 0,
            }}>×</button>
          </div>

          {visibles.map((j, i) => {
            const posicion = j.status === "queued"
              ? visibles.filter((x) => x.status === "queued" && x.seq < j.seq).length + 1
              : 0;
            const eta = minutosRestantes(j);
            return (
              <div key={j.id} style={{
                padding: "12px 16px",
                borderBottom: i < visibles.length - 1 ? `1px solid ${DS.textHint}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: DS.textPrimary }}>
                    {j.brand_resolved || j.brand || j.raw_input}
                  </span>
                  <span style={{ fontSize: 12, color: COLOR[j.status] || DS.textMuted, whiteSpace: "nowrap" }}>
                    {textoDeEstado(j, posicion)}
                  </span>
                </div>

                {j.phase_detail && j.status !== "queued" && (
                  <div style={{ fontSize: 11.5, color: DS.textMuted, marginTop: 3 }}>{j.phase_detail}</div>
                )}

                {j.status === "classifying" && j.total_ads > 0 && (
                  <div style={{ height: 3, background: DS.textHint, borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${Math.round((j.done_ads / j.total_ads) * 100)}%`,
                      background: DS.blue, borderRadius: 3, transition: "width .4s ease",
                    }} />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  {eta && <span style={{ fontSize: 11.5, color: DS.textMuted }}>~{eta} min</span>}
                  {j.needs_file_ads > 0 && (
                    <span style={{ fontSize: 11.5, color: DS.amber || DS.textMuted }}>
                      {j.needs_file_ads} sin video
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {esActivo(j) && (
                    <button onClick={() => accion(cancelImportJob, j.id)} style={enlace}>Cancelar</button>
                  )}
                  {j.status === "failed" && (
                    <button onClick={() => accion(retryImportJob, j.id)} style={enlace}>Reintentar</button>
                  )}
                  {!esActivo(j) && (
                    <button onClick={() => descartar(j.id)} style={enlace}>Ocultar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        title="Cola de importación"
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "9px 14px", borderRadius: 50, cursor: "pointer",
          border: `1px solid ${DS.textHint}`, background: DS.bgSide, color: DS.textPrimary,
          fontFamily: DS.font, fontSize: 12.5, fontWeight: 700,
          boxShadow: "0 6px 20px rgba(0,0,0,.18)",
        }}
      >
        {activos.length > 0 && (
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: DS.blue,
            boxShadow: `0 0 0 3px ${withAlpha(DS.blue, "33")}`, flex: "none",
          }} />
        )}
        {enCurso
          ? <>{enCurso.brand_resolved || enCurso.brand || enCurso.raw_input}{pct !== null ? ` ${pct}%` : ""}</>
          : "Importaciones"}
        {enCola > 0 && <span style={{ color: DS.textMuted }}>· {enCola} en cola</span>}
      </button>
    </div>
  );
}

const enlace = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontSize: 11.5, fontWeight: 700, color: DS.textSecondary, fontFamily: DS.font,
};
