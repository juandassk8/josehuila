import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import {
  updateConcept,
  createVariation,
  updateVariation,
  deleteVariation,
} from "../../despliegue/db.js";
import { AudioUpload } from "./AudioUpload.jsx";

// Modal de edición de concepto del despliegue. Campos:
//   1. Nombre
//   2. Descripción (qué es / cuándo usarlo)
//   3. Cómo se ejecuta (estructura paso a paso)
//
// Referentes (max 5): cada uno con Propio/Externo + nombre + transcripción.
// Botones: Transcribir audio (auto-llena la transcripción usando /api/transcribe)
// y Descargar referencia (abre Cobalt Tools).

const MAX_REFS = 5;

const STAGE_META = {
  tofu: { label: "TOFU", color: "#1DB97A" },
  mofu: { label: "MOFU", color: "#F5A623" },
  bofu: { label: "BOFU", color: "#E24B4A" },
};

export function ConceptEditModal({ format, onClose, onSaved }) {
  const concept = format._concept || {};
  const stage = concept.stage || "tofu";
  const meta = STAGE_META[stage] || STAGE_META.tofu;

  const [name, setName] = useState(concept.name || "");
  const [description, setDescription] = useState(concept.description || "");
  const [execution, setExecution] = useState(concept.execution || "");
  const [variations, setVariations] = useState(format._variations || []);
  const [adding, setAdding] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const saveBasics = async () => {
    setErr("");
    const { error } = await updateConcept(concept.id, {
      name: name.trim() || concept.name,
      description: description.trim() || null,
      execution: execution.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };

  const canAddMore = variations.length < MAX_REFS;

  const startAdd = () => {
    if (!canAddMore) return;
    setAdding({ label: "", transcript: "", source_type: "reference" });
  };

  const confirmAdd = async () => {
    if (!adding) return;
    if (!adding.label.trim() && !adding.transcript.trim()) {
      setAdding(null); return;
    }
    setErr("");
    const { data, error } = await createVariation({
      concept_id: concept.id,
      label: adding.label.trim() || "Referente",
      source_type: adding.source_type,
      transcript: adding.transcript.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    if (data) setVariations((prev) => [...prev, data]);
    setAdding(null);
    onSaved?.();
  };

  const removeVariation = async (id) => {
    if (!confirm("¿Eliminar este referente?")) return;
    setVariations((prev) => prev.filter((v) => v.id !== id));
    await deleteVariation(id);
    onSaved?.();
  };

  const updateLocalVariation = (id, patch) => {
    setVariations((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
  };

  const saveVariationPatch = async (id, patch) => {
    const row = await updateVariation(id, patch);
    onSaved?.();
    return row;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 16, width: "100%", maxWidth: 680,
          color: DS.textPrimary, padding: "22px 26px 22px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          position: "relative", overflow: "hidden",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 4,
          background: meta.color, opacity: 0.8,
        }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 6, flexShrink: 0 }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 10, fontWeight: 800, color: meta.color,
              letterSpacing: "0.16em",
              padding: "3px 10px", borderRadius: 50,
              background: `${meta.color}18`,
              marginBottom: 8,
            }}>
              {meta.label} · concepto
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Editar concepto
            </h3>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 18, padding: "0 4px",
          }}>×</button>
        </div>

        {err && (
          <div style={{
            marginTop: 10, flexShrink: 0,
            padding: "10px 12px",
            borderRadius: 10,
            background: `${DS.red}14`,
            border: `1px solid ${DS.red}55`,
            color: DS.red,
            fontSize: 12,
            lineHeight: 1.5,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <div style={{ flex: 1, wordBreak: "break-word" }}>{err}</div>
            <button
              onClick={() => setErr("")}
              style={{
                background: "transparent", border: "none", color: DS.red,
                cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
              }}
            >×</button>
          </div>
        )}

        <div style={{ overflowY: "auto", paddingRight: 4, marginTop: 8, flex: 1 }}>
          <FieldLabel>Nombre del concepto</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Testimonio de madre soltera"
            style={inputStyle()}
            onBlur={saveBasics}
          />

          <FieldLabel style={{ marginTop: 14 }}>Descripción del concepto</FieldLabel>
          <div style={{ fontSize: 10.5, color: DS.textMuted, marginBottom: 6, marginTop: -2 }}>
            ¿Qué es? ¿Cuándo usarlo?
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explica qué es el concepto y en qué momento tiene sentido usarlo."
            rows={3}
            style={{ ...inputStyle(), resize: "vertical", minHeight: 70, lineHeight: 1.5 }}
            onBlur={saveBasics}
          />

          <FieldLabel style={{ marginTop: 14 }}>Cómo se ejecuta (estructura paso a paso)</FieldLabel>
          <div style={{ fontSize: 10.5, color: DS.textMuted, marginBottom: 6, marginTop: -2 }}>
            La estructura que el guionista va a seguir. Ej: 1) Hook visual, 2) Problema, 3) Producto, 4) CTA…
          </div>
          <textarea
            value={execution}
            onChange={(e) => setExecution(e.target.value)}
            placeholder="1) Hook…&#10;2) Desarrollo…&#10;3) Cierre / CTA…"
            rows={5}
            style={{ ...inputStyle(), resize: "vertical", minHeight: 110, lineHeight: 1.55, fontFamily: "monospace" }}
            onBlur={saveBasics}
          />

          {/* Referentes */}
          <div style={{
            marginTop: 18, paddingTop: 14,
            borderTop: DS.border,
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
          }}>
            <FieldLabel style={{ marginTop: 0 }}>
              Referentes ({variations.length}/{MAX_REFS})
            </FieldLabel>
            <button
              onClick={startAdd}
              disabled={!canAddMore}
              title={canAddMore ? "Agregar un referente" : `Máximo ${MAX_REFS} referentes`}
              style={{
                padding: "5px 12px", borderRadius: 50,
                border: `1px dashed ${canAddMore ? meta.color + "88" : DS.textHint}`,
                background: canAddMore ? `${meta.color}15` : "transparent",
                color: canAddMore ? meta.color : DS.textMuted,
                cursor: canAddMore ? "pointer" : "not-allowed",
                fontSize: 11, fontWeight: 700, fontFamily: DS.font,
                letterSpacing: "0.04em",
              }}
            >
              + Agregar referente
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {variations.map((v) => (
              <VariationCard
                key={v.id}
                v={v}
                onRemove={() => removeVariation(v.id)}
                onLocal={(patch) => updateLocalVariation(v.id, patch)}
                onSave={(patch) => saveVariationPatch(v.id, patch)}
                onError={setErr}
              />
            ))}
            {variations.length === 0 && !adding && (
              <div style={{
                padding: "14px", textAlign: "center", fontSize: 11.5,
                color: DS.textMuted, borderRadius: 10,
                border: `1px dashed ${DS.textHint}`,
              }}>
                Aún no hay referentes. Agregá videos propios o externos con su transcripción.
              </div>
            )}
            {adding && (
              <NewVariationForm
                adding={adding}
                setAdding={setAdding}
                meta={meta}
                onCancel={() => setAdding(null)}
                onConfirm={confirmAdd}
              />
            )}
          </div>

        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, paddingTop: 12, borderTop: DS.border, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", borderRadius: 50, border: "none",
              background: DS.textPrimary, color: DS.bg,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
            }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

function VariationCard({ v, onRemove, onLocal, onSave, onError }) {
  const isOwn = v.source_type === "produced";
  const color = isOwn ? DS.green : DS.blue;
  const [droppedFile, setDroppedFile] = useState(null);
  const [copied, setCopied] = useState(false);

  const [toggling, setToggling] = useState(false);
  const toggleSource = async () => {
    if (toggling) return;
    const previous = v.source_type === "produced" ? "produced" : "reference";
    const next = previous === "produced" ? "reference" : "produced";
    setToggling(true);
    onError?.("");
    onLocal({ source_type: next });
    try {
      const saved = await onSave({ source_type: next });
      if (saved && saved.source_type && saved.source_type !== next) {
        onLocal({ source_type: saved.source_type });
        onError?.(`El server devolvió "${saved.source_type}" en vez de "${next}".`);
      }
    } catch (err) {
      const detail = err?.message || err?.hint || String(err);
      onLocal({ source_type: previous });
      onError?.(`No pude cambiar a ${next === "produced" ? "Propio" : "Externo"}: ${detail}`);
    } finally {
      setToggling(false);
    }
  };

  // Link del referente: priorizamos meta_ads_library_url (así fue cargado desde
  // el despliegue), fallback a drive_url o file_url. Copiamos al portapapeles
  // y abrimos Cobalt; el usuario pega y descarga de una.
  const sourceUrl = v.meta_ads_library_url || v.drive_url || v.file_url || "";
  const openCobalt = async () => {
    if (sourceUrl) {
      try {
        await navigator.clipboard.writeText(sourceUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        // Fallback silencioso: igual abrimos Cobalt.
      }
    }
    window.open("https://cobalt.tools/", "_blank");
  };

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: DS.bgCard, border: `1px solid ${color}33`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={toggleSource}
          title="Cambiar entre Propio y Externo"
          style={{
            fontSize: 9.5, fontWeight: 800, color,
            padding: "4px 9px", borderRadius: 50,
            border: `1px solid ${color}55`,
            background: `${color}18`,
            letterSpacing: "0.08em",
            cursor: "pointer", fontFamily: DS.font,
          }}
        >
          {isOwn ? "🏠 PROPIO" : "🌐 EXTERNO"}
        </button>
        <input
          value={v.label || ""}
          onChange={(e) => onLocal({ label: e.target.value })}
          onBlur={(e) => onSave({ label: e.target.value })}
          placeholder="Nombre del referente"
          style={{
            flex: 1, minWidth: 160,
            padding: "6px 10px", borderRadius: 8,
            border: `1px solid ${DS.textHint}`, background: "transparent",
            color: DS.textPrimary, fontSize: 12.5, fontFamily: DS.font, outline: "none",
          }}
        />
        <button
          onClick={onRemove}
          style={{
            background: "transparent", border: `1px solid ${DS.textHint}`,
            borderRadius: 8, color: DS.red,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            padding: "4px 10px", fontFamily: DS.font,
          }}
        >
          Quitar
        </button>
      </div>

      {/* Zona de transcripción con drop de audio */}
      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer?.files?.[0];
          if (f) setDroppedFile(f);
        }}
        style={{ position: "relative" }}
      >
        <textarea
          value={v.transcript || ""}
          onChange={(e) => onLocal({ transcript: e.target.value })}
          onBlur={(e) => onSave({ transcript: e.target.value })}
          placeholder="Transcripción del referente (pegala aquí o usá el botón de transcribir)…"
          rows={4}
          style={{
            width: "100%", padding: "10px 12px",
            borderRadius: 10, border: `1px solid ${DS.textHint}`,
            background: "transparent", color: DS.textPrimary,
            fontSize: 12, fontFamily: DS.font,
            outline: "none", resize: "vertical", minHeight: 80, lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Botones: Transcribir + Descargar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <AudioUpload
          label="🎙 Transcribir referencia"
          droppedFile={droppedFile}
          onDropConsumed={() => setDroppedFile(null)}
          onTranscribed={(text) => {
            const nextTranscript = v.transcript ? (v.transcript + "\n" + text) : text;
            onLocal({ transcript: nextTranscript });
            onSave({ transcript: nextTranscript });
          }}
        />
        <button
          onClick={openCobalt}
          disabled={!sourceUrl}
          title={
            sourceUrl
              ? `Copia el link al portapapeles y abre Cobalt${copied ? " — ya copiado" : ""}`
              : "Sin link disponible — agrega el referente en el Despliegue con su Meta Ads Library URL"
          }
          style={{
            padding: "5px 12px", borderRadius: 50,
            border: `1px solid ${copied ? DS.green + "88" : DS.textHint}`,
            background: copied ? `${DS.green}18` : "transparent",
            color: copied ? DS.green : (sourceUrl ? DS.textSecondary : DS.textMuted),
            fontSize: 11, fontWeight: 600, fontFamily: DS.font,
            cursor: sourceUrl ? "pointer" : "not-allowed",
            opacity: sourceUrl ? 1 : 0.55,
            display: "inline-flex", alignItems: "center", gap: 4,
            transition: "background 0.15s, color 0.15s, border 0.15s",
          }}
        >
          {copied ? "✓ Link copiado — abriendo Cobalt" : "📥 Descargar referencia"}
        </button>
      </div>
    </div>
  );
}

function NewVariationForm({ adding, setAdding, meta, onCancel, onConfirm }) {
  const [droppedFile, setDroppedFile] = useState(null);
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: DS.bgCard, border: `1px solid ${meta.color}55`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <SourceToggle
          active={adding.source_type === "reference"}
          color={DS.blue}
          onClick={() => setAdding({ ...adding, source_type: "reference" })}
        >
          🌐 Externo
        </SourceToggle>
        <SourceToggle
          active={adding.source_type === "produced"}
          color={DS.green}
          onClick={() => setAdding({ ...adding, source_type: "produced" })}
        >
          🏠 Propio
        </SourceToggle>
      </div>
      <input
        value={adding.label}
        onChange={(e) => setAdding({ ...adding, label: e.target.value })}
        placeholder="Nombre (ej: Viral madre Tik Tok)"
        style={inputStyle()}
        autoFocus
      />
      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer?.files?.[0];
          if (f) setDroppedFile(f);
        }}
      >
        <textarea
          value={adding.transcript}
          onChange={(e) => setAdding({ ...adding, transcript: e.target.value })}
          placeholder="Transcripción del referente (pegala o usá transcribir)…"
          rows={4}
          style={{ ...inputStyle(), resize: "vertical", minHeight: 90, lineHeight: 1.5 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <AudioUpload
          label="🎙 Transcribir referencia"
          droppedFile={droppedFile}
          onDropConsumed={() => setDroppedFile(null)}
          onTranscribed={(text) => {
            setAdding({
              ...adding,
              transcript: adding.transcript ? adding.transcript + "\n" + text : text,
            });
          }}
        />
        <button
          onClick={() => window.open("https://cobalt.tools/", "_blank")}
          title="Abre Cobalt Tools para descargar el video"
          style={{
            padding: "5px 12px", borderRadius: 50,
            border: `1px solid ${DS.textHint}`,
            background: "transparent",
            color: DS.textSecondary,
            fontSize: 11, fontWeight: 600, fontFamily: DS.font,
            cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          📥 Descargar referencia
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          background: "transparent", color: DS.textSecondary,
          border: `1px solid ${DS.textHint}`,
          fontSize: 11, fontWeight: 600, fontFamily: DS.font,
        }}>Cancelar</button>
        <button
          onClick={onConfirm}
          disabled={!adding.label.trim() && !adding.transcript.trim()}
          style={{
            padding: "7px 14px", borderRadius: 8, border: "none",
            background: meta.color, color: "#fff",
            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
            opacity: (!adding.label.trim() && !adding.transcript.trim()) ? 0.5 : 1,
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function SourceToggle({ children, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 50, cursor: "pointer",
        background: active ? `${color}18` : "transparent",
        color: active ? color : DS.textMuted,
        border: `1px solid ${active ? color + "55" : DS.textHint}`,
        fontSize: 11, fontWeight: 700, fontFamily: DS.font,
      }}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, color: DS.textMuted, fontWeight: 700,
      letterSpacing: "0.14em", textTransform: "uppercase",
      marginTop: 16, marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    width: "100%", padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${DS.textHint}`,
    background: "transparent",
    color: DS.textPrimary,
    fontSize: 13, fontFamily: DS.font,
    outline: "none", boxSizing: "border-box",
  };
}
