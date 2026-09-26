// Scorecard de Ganadores — modal read-only que analiza los creativos PRODUCIDOS
// para responder "¿qué está funcionando?" con métricas reales de performance
// (ROAS, CPA, gasto, resultados) y las dimensiones que Jose maneja: formato,
// etapa, ángulo, creador y producto. Cada creativo produced trae:
//   metrics { gasto, resultados, cpa, roas, rendimiento }  +  dims { formato, angulo, creador, producto }
// y su concepto (stage/format/labels) como respaldo. Sin dependencias nuevas.

import { useMemo, useState } from "react";
import { DS } from "../lib/design.js";

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const REND = {
  alto: { label: "Alto", color: DS.green },
  medio: { label: "Medio", color: DS.amber },
  bajo: { label: "Bajo", color: "#F6667F" },
};

const num = (s) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const money = (n) => n ? Math.round(n).toLocaleString("es-CO") : "—";
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);

// Ángulos de un concepto (respaldo cuando el creativo no trae dims.angulo).
function conceptAngles(concept) {
  const raw = concept?.bank_labels?.angulo ?? concept?.suggested_labels?.angulo ?? concept?.labels?.angulo;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.map((x) => String(x).trim()).filter(Boolean);
}

// Resumen de performance de un grupo de creativos.
function aggregate(arr) {
  const gasto = sum(arr.map((x) => x.gasto));
  const resultados = sum(arr.map((x) => x.resultados));
  const roasW = arr.filter((x) => x.roas > 0 && x.gasto > 0);
  const roas = roasW.length
    ? sum(roasW.map((x) => x.roas * x.gasto)) / sum(roasW.map((x) => x.gasto))   // ponderado por gasto
    : avg(arr.map((x) => x.roas).filter((x) => x > 0));
  const cpa = gasto > 0 && resultados > 0 ? gasto / resultados : avg(arr.map((x) => x.cpa).filter((x) => x > 0));
  const mix = { alto: 0, medio: 0, bajo: 0 };
  for (const x of arr) if (x.rend && mix[x.rend] != null) mix[x.rend]++;
  const rated = mix.alto + mix.medio + mix.bajo;
  const winRate = rated ? mix.alto / rated : 0;
  return { n: arr.length, gasto, resultados, roas, cpa, mix, rated, winRate };
}

// Ordena grupos: primero por ROAS, luego por tasa de ganadores, luego por volumen.
function rankGroups(map) {
  return [...map.entries()]
    .map(([key, arr]) => ({ key, ...aggregate(arr) }))
    .sort((a, b) => b.roas - a.roas || b.winRate - a.winRate || b.n - a.n);
}

function MixBar({ mix }) {
  const total = mix.alto + mix.medio + mix.bajo;
  if (!total) return <span style={{ fontSize: 11, color: "var(--ink-4)" }}>—</span>;
  const seg = (k) => (mix[k] / total) * 100;
  return (
    <div style={{ display: "flex", height: 7, borderRadius: 999, overflow: "hidden", minWidth: 66, background: "var(--surface-2)" }} title={`Alto ${mix.alto} · Medio ${mix.medio} · Bajo ${mix.bajo}`}>
      {mix.alto > 0 && <div style={{ width: `${seg("alto")}%`, background: REND.alto.color }} />}
      {mix.medio > 0 && <div style={{ width: `${seg("medio")}%`, background: REND.medio.color }} />}
      {mix.bajo > 0 && <div style={{ width: `${seg("bajo")}%`, background: REND.bajo.color }} />}
    </div>
  );
}

function DimTable({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-3)" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Encabezado de columnas */}
        <div style={{ display: "grid", gridTemplateColumns: "16px 1.4fr 34px 0.9fr 0.7fr 66px", gap: 9, padding: "0 10px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-4)" }}>
          <span /><span /><span style={{ textAlign: "right" }}>n</span><span style={{ textAlign: "right" }}>ROAS</span><span style={{ textAlign: "right" }}>CPA</span><span>Mix</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "16px 1.4fr 34px 0.9fr 0.7fr 66px", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 11, background: i === 0 ? "var(--sel-soft)" : "var(--surface-2)", border: `1px solid ${i === 0 ? "rgba(88,166,255,0.28)" : "var(--line)"}` }}>
            <span style={{ fontSize: 12 }}>{i === 0 && (r.roas > 0 || r.winRate > 0) ? "🏆" : ""}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)", textAlign: "right" }}>{r.n}</span>
            <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: r.roas >= 2 ? DS.green : r.roas > 0 ? "var(--ink)" : "var(--ink-4)", textAlign: "right" }}>{r.roas > 0 ? r.roas.toFixed(1) + "x" : "—"}</span>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "right" }}>{r.cpa > 0 ? money(r.cpa) : "—"}</span>
            <MixBar mix={r.mix} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div style={{ flex: "1 1 90px", minWidth: 90, padding: "10px 12px", borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: accent || "var(--ink)", letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TopAd({ item, onOpenConcept }) {
  const [open, setOpen] = useState(false);
  const { v, concept, roas, cpa, gasto } = item;
  const r = v.metrics?.rendimiento;
  const rd = r && REND[r];
  return (
    <div style={{ borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name || concept.name || "Anuncio"}</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[concept.name, item.creador && `por ${item.creador}`, item.angulo].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        {rd && <span style={{ fontSize: 10.5, fontWeight: 700, color: rd.color, padding: "3px 9px", borderRadius: 999, background: rd.color + "1f", whiteSpace: "nowrap" }}>{rd.label}</span>}
        {roas > 0 && <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: roas >= 2 ? DS.green : "var(--ink)", whiteSpace: "nowrap" }}>{roas.toFixed(1)}x</span>}
        {cpa > 0 && <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>CPA {money(cpa)}</span>}
        {v.transcript && <button type="button" onClick={() => setOpen((o) => !o)} style={{ border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: DS.font, whiteSpace: "nowrap" }}>{open ? "Ocultar" : "Guion"}</button>}
        {v.drive_url && <a href={v.drive_url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "var(--sel)", textDecoration: "none", whiteSpace: "nowrap" }}>Drive ↗</a>}
        {onOpenConcept && concept.id && <button type="button" onClick={() => onOpenConcept(concept)} style={{ border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: DS.font }}>Ver</button>}
      </div>
      {open && v.transcript && (
        <div style={{ padding: "0 12px 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", borderTop: "1px solid var(--line)", paddingTop: 10 }}>{v.transcript}</div>
      )}
    </div>
  );
}

export function WinnersScorecard({ variations = [], concepts = [], onClose, onOpenConcept }) {
  const conceptById = useMemo(() => { const m = {}; for (const c of concepts) m[c.id] = c; return m; }, [concepts]);

  const items = useMemo(() => {
    const produced = variations.filter((v) => v.source_type === "produced");
    return produced.map((v) => {
      const c = conceptById[v.concept_id] || {};
      const d = v.dims || {};
      const gasto = num(v.metrics?.gasto), resultados = num(v.metrics?.resultados);
      const roas = num(v.metrics?.roas), cpa = num(v.metrics?.cpa);
      const rend = v.metrics?.rendimiento && REND[v.metrics.rendimiento] ? v.metrics.rendimiento : null;
      const fmtRaw = d.formato || c.format;
      const formato = fmtRaw === "static" || fmtRaw === "estatico" ? "Estático" : fmtRaw === "video" ? "Video" : null;
      const angulo = (d.angulo && String(d.angulo).trim()) || conceptAngles(c)[0] || null;
      return {
        v, concept: c, gasto, resultados, roas, cpa, rend,
        formato, etapa: STAGE_LABEL[c.stage] || null,
        angulo: angulo ? cap(angulo) : null,
        creador: (d.creador && String(d.creador).trim()) || null,
        producto: (d.producto && String(d.producto).trim()) || null,
        hasSignal: !!(gasto || resultados || roas || cpa || rend),
      };
    });
  }, [variations, conceptById]);

  const signal = useMemo(() => items.filter((x) => x.hasSignal), [items]);

  const group = (keyFn) => {
    const m = new Map();
    for (const it of signal) {
      const keys = keyFn(it);
      for (const k of (Array.isArray(keys) ? keys : [keys])) {
        if (!k) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it);
      }
    }
    return rankGroups(m);
  };
  const byFormat = useMemo(() => group((x) => x.formato), [signal]);
  const byStage = useMemo(() => group((x) => x.etapa), [signal]);
  const byAngle = useMemo(() => group((x) => x.angulo), [signal]);
  const byCreator = useMemo(() => group((x) => x.creador), [signal]);
  const byProduct = useMemo(() => group((x) => x.producto), [signal]);

  const top = useMemo(() => [...signal]
    .sort((a, b) => b.roas - a.roas || (b.rend === "alto" ? 1 : 0) - (a.rend === "alto" ? 1 : 0) || b.gasto - a.gasto)
    .slice(0, 8), [signal]);

  // KPIs globales (blended).
  const kpi = useMemo(() => {
    const gasto = sum(signal.map((x) => x.gasto));
    const resultados = sum(signal.map((x) => x.resultados));
    const roasW = signal.filter((x) => x.roas > 0 && x.gasto > 0);
    const roas = roasW.length ? sum(roasW.map((x) => x.roas * x.gasto)) / sum(roasW.map((x) => x.gasto)) : avg(signal.map((x) => x.roas).filter((x) => x > 0));
    const cpa = gasto > 0 && resultados > 0 ? gasto / resultados : avg(signal.map((x) => x.cpa).filter((x) => x > 0));
    const rated = signal.filter((x) => x.rend).length;
    const altos = signal.filter((x) => x.rend === "alto").length;
    return { gasto, resultados, roas, cpa, winRate: rated ? altos / rated : 0 };
  }, [signal]);

  const noData = signal.length === 0;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(6,7,12,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 20px", overflowY: "auto", fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(820px, 96vw)", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 22, boxShadow: "var(--shadow-lg)", color: "var(--ink)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "22px 26px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: 9 }}>🏆 Ganadores</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 5 }}>Qué está funcionando: rendimiento real de tus creativos producidos por formato, etapa, ángulo, creador y producto.</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-3)", width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        {noData ? (
          <div style={{ padding: "44px 30px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Todavía no hay datos de rendimiento</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto", lineHeight: 1.55 }}>
              {items.length === 0
                ? "Cuando un contenido llega a Campaign/Feedback en el pipeline —o agregás un anuncio a mano acá en Creados— aparece su rendimiento."
                : `Tenés ${items.length} anuncio${items.length === 1 ? "" : "s"} producido${items.length === 1 ? "" : "s"}, pero ninguno con rendimiento cargado. Marcá bajo/medio/alto o cargá métricas (ROAS, CPA, gasto) en cada anuncio para ver el ranking.`}
            </div>
          </div>
        ) : (
          <div style={{ padding: "18px 26px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
            {/* KPIs blended */}
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <Kpi label="Producidos" value={String(items.length)} />
              <Kpi label="Con datos" value={String(signal.length)} />
              <Kpi label="Gasto total" value={money(kpi.gasto)} />
              <Kpi label="Resultados" value={money(kpi.resultados)} />
              <Kpi label="ROAS blend." value={kpi.roas > 0 ? kpi.roas.toFixed(1) + "x" : "—"} accent={kpi.roas >= 2 ? DS.green : null} />
              <Kpi label="CPA blend." value={kpi.cpa > 0 ? money(kpi.cpa) : "—"} />
              <Kpi label="Tasa ganador" value={kpi.winRate ? Math.round(kpi.winRate * 100) + "%" : "—"} accent={kpi.winRate >= 0.5 ? DS.green : null} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
              <DimTable title="Por formato" rows={byFormat} />
              <DimTable title="Por etapa" rows={byStage} />
              <DimTable title="Por ángulo" rows={byAngle} />
              <DimTable title="Por creador" rows={byCreator} />
            </div>
            {byProduct.length > 1 && <DimTable title="Por producto" rows={byProduct} />}

            {/* Nota si faltan dimensiones por etiquetar */}
            {(!byAngle.length || !byCreator.length) && (
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px" }}>
                💡 {[!byAngle.length && "ángulo", !byCreator.length && "creador"].filter(Boolean).join(" y ")} sin datos — se llenan solos desde el pipeline, o cargalos al agregar un anuncio a mano.
              </div>
            )}

            {/* Top anuncios + guiones */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-3)" }}>Top anuncios · guiones ganadores</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {top.map((it) => <TopAd key={it.v.id} item={it} onOpenConcept={onOpenConcept} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
