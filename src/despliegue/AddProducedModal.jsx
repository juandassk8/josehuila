import { useState } from "react";
import { DS } from "../lib/design.js";
import { CoverDrop } from "./CoverDrop.jsx";

// Agregar a mano un ANUNCIO CREADO (produced) a un concepto del despliegue:
// link de Drive + nombre + rendimiento (bajo/medio/alto) + guion/transcripción +
// métricas opcionales. Construye la "base de información" de qué formatos/guiones
// funcionaron (para después alimentar la IA en Scripting).

const RENDIMIENTO = [
  { key: "alto", label: "Alto", color: "var(--green)" },
  { key: "medio", label: "Medio", color: "var(--amber)" },
  { key: "bajo", label: "Bajo", color: "var(--brand)" },
];

const inp = { width: "100%", fontFamily: DS.font, fontSize: 13, color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 12px", outline: "none" };
const label = { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 5, display: "block" };

export function AddProducedModal({ concept, companyName = "", onSave, onClose }) {
  const [name, setName] = useState("");
  const [drive, setDrive] = useState("");
  const [rendimiento, setRendimiento] = useState("");
  const [transcript, setTranscript] = useState("");
  const [creador, setCreador] = useState("");
  const [angulo, setAngulo] = useState("");
  const [cover, setCover] = useState("");
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState({ gasto: "", resultados: "", cpa: "", roas: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || null,
        drive_url: drive.trim() || null,
        file_url: cover || null,
        transcript: transcript.trim() || null,
        metrics: { ...metrics, rendimiento: rendimiento || null },
        dims: {
          formato: concept?.format === "static" ? "estatico" : concept?.format === "video" ? "video" : null,
          angulo: angulo.trim() || null,
          creador: creador.trim() || null,
          producto: null,
        },
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(6,7,12,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 20px", overflowY: "auto", fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(560px, 96vw)", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Agregar anuncio creado</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{concept?.name || "Concepto"} · {companyName}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, cursor: "pointer", background: "var(--chip)", border: "1px solid var(--line)", color: DS.textSecondary, display: "grid", placeItems: "center" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div>
          <span style={label}>Link del video (Drive)</span>
          <input value={drive} placeholder="Pegar link de Drive…" onChange={(e) => setDrive(e.target.value)} style={inp} />
        </div>
        <div>
          <span style={label}>Nombre / referencia</span>
          <input value={name} placeholder="Ej: UGC testimonio — hook mal aliento" onChange={(e) => setName(e.target.value)} style={inp} />
        </div>
        <div>
          <span style={label}>Portada (opcional)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 92, flex: "none" }}>
              <CoverDrop value={cover} conceptId={concept?.id || "produced"} aspect="9 / 12" enablePaste onChange={setCover} hint="Portada" />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
              Arrastrá una imagen, hacé click, o <b>pegá una captura con Cmd/Ctrl + V</b>. Si no ponés portada, el video se muestra sin miniatura.
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <span style={label}>Creador (opcional)</span>
            <input value={creador} placeholder="Ej: María" onChange={(e) => setCreador(e.target.value)} style={inp} />
          </label>
          <label>
            <span style={label}>Ángulo (opcional)</span>
            <input value={angulo} placeholder="Ej: mal aliento" onChange={(e) => setAngulo(e.target.value)} style={inp} />
          </label>
        </div>

        <div>
          <span style={label}>Rendimiento</span>
          <div style={{ display: "flex", gap: 8 }}>
            {RENDIMIENTO.map((r) => {
              const on = rendimiento === r.key;
              return (
                <button key={r.key} type="button" onClick={() => setRendimiento(on ? "" : r.key)}
                  style={{ flex: 1, fontFamily: DS.font, fontSize: 13, fontWeight: 700, padding: "9px 0", borderRadius: 11, cursor: "pointer",
                    color: on ? "#fff" : r.color, background: on ? r.color : "transparent", border: `1.5px solid ${r.color}` }}>{r.label}</button>
              );
            })}
          </div>
        </div>

        <div>
          <span style={label}>Guion / transcripción</span>
          <textarea value={transcript} rows={5} placeholder="Pegá el guion o transcripción del anuncio…" onChange={(e) => setTranscript(e.target.value)} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
        </div>

        {/* Métricas opcionales */}
        <div>
          <button type="button" onClick={() => setShowMetrics((s) => !s)}
            style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" style={{ transform: showMetrics ? "rotate(90deg)" : "none", transition: "transform .15s" }}><path d="M9 6l6 6-6 6" /></svg>
            Métricas (opcional)
          </button>
          {showMetrics && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {[["gasto", "Gasto"], ["resultados", "Resultados"], ["cpa", "CPA"], ["roas", "ROAS"]].map(([k, l]) => (
                <label key={k}>
                  <span style={label}>{l}</span>
                  <input value={metrics[k]} placeholder="—" onChange={(e) => setMetrics((m) => ({ ...m, [k]: e.target.value }))} style={inp} />
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ fontFamily: DS.font, fontSize: 13, fontWeight: 600, color: DS.textSecondary, background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 11, padding: "9px 16px", cursor: "pointer" }}>Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || (!drive.trim() && !name.trim())}
            style={{ fontFamily: DS.font, fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--sel)", border: "none", borderRadius: 11, padding: "10px 18px", cursor: saving ? "wait" : "pointer", opacity: (!drive.trim() && !name.trim()) ? 0.5 : 1, boxShadow: "var(--sel-rim)" }}>
            {saving ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
