import { useRef, useState, useEffect, useCallback } from "react";
import { DS, darkCard, darkInput, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { database } from "../../lib/backend.js";
import { AudioUpload } from "./AudioUpload.jsx";
import { listExpertiseDocs, createExpertiseDoc, deleteExpertiseDoc } from "./workspace_guiones_db.js";
import { useCompanyId } from "./context.js";
import { extractFileText } from "./extractFileText.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";

const CATEGORIES = [
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "business", label: "Negocio" },
  { value: "general", label: "General" },
];

export function ExpertiseDocuments() {
  const companyId = useCompanyId();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    const { data } = await listExpertiseDocs(companyId);
    setDocs(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const channel = database
      .channel(`company_expertise_documents_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_expertise_documents" }, () => load())
      .subscribe();
    return () => database.removeChannel(channel);
  }, [companyId, load]);

  const handleDelete = async (id) => {
    await deleteExpertiseDoc(id);
    load();
  };

  if (loading) {
    return <div style={{ color: DS.textMuted, fontSize: 12, padding: "20px 0" }}>Cargando documentos...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", marginBottom: 4 }}>
            BASE DE EXPERTISE
          </div>
          <div style={{ fontSize: 12, color: DS.textSecondary }}>
            Sube guiones o textos y el sistema extrae tu conocimiento automaticamente
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...darkBtn, padding: "8px 18px", fontSize: 12 }}>
          + Agregar documento
        </button>
      </div>

      {docs.length === 0 && (
        <div style={{ ...darkCard, textAlign: "center", padding: "32px 20px", borderStyle: "dashed" }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>📚</div>
          <div style={{ color: DS.textSecondary, fontSize: 13, marginBottom: 12 }}>
            No hay documentos aun. Sube guiones o textos para que el sistema aprenda tu expertise.
          </div>
          <button onClick={() => setShowAdd(true)} style={{ ...darkBtnGhost, fontSize: 12 }}>
            + Agregar documento
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map((doc) => (
          <div key={doc.id} style={darkCard}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, marginBottom: 4 }}>{doc.title}</div>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                  background: "rgba(55,138,221,0.1)", color: DS.blue,
                }}>
                  {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                </span>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                style={{ background: "transparent", border: "none", color: DS.red, fontSize: 11, cursor: "pointer", opacity: 0.6 }}
              >
                Quitar
              </button>
            </div>
            {doc.extracted_summary && (
              <div style={{
                fontSize: 12, color: DS.textSecondary, lineHeight: 1.6,
                padding: "10px 12px", borderRadius: 8,
                background: DS.bgCard, border: DS.border,
                maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap",
              }}>
                {doc.extracted_summary}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && <AddDocumentModal companyId={companyId} onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function AddDocumentModal({ companyId, onClose, onAdded }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [extracting, setExtracting] = useState(false);
  const [fileErr, setFileErr] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setFileErr("");
    setFileLoading(true);
    setFileName(file.name);
    try {
      const text = await extractFileText(file);
      setContent((prev) => prev ? prev + "\n\n" + text : text);
      if (!title.trim()) {
        const base = file.name.replace(/\.[^.]+$/, "");
        setTitle(base);
      }
    } catch (e) {
      setFileErr(e?.message || String(e));
      setFileName("");
    } finally {
      setFileLoading(false);
    }
  };

  const [saveErr, setSaveErr] = useState("");
  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaveErr("");
    setExtracting(true);

    // Paso 1: extraer conocimiento con Claude (best effort — si falla, guardamos sin summary).
    let extracted = "";
    try {
      const res = await fetch("/api/extract-knowledge", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ content: content.trim(), category, isCompanyWorkspace: true }),
      });
      if (res.ok) {
        const data = await res.json();
        extracted = data.extracted || "";
      } else {
        logger.warn("[expertise] extract-knowledge falló:", res.status, await res.text().catch(() => ""));
      }
    } catch (e) {
      logger.warn("[expertise] extract-knowledge error:", e);
    }

    // Paso 2: guardar en DB. Este sí tiene que funcionar o mostrar error.
    try {
      const { data, error } = await createExpertiseDoc(companyId, {
        title: title.trim(),
        raw_content: content.trim(),
        extracted_summary: extracted,
        category,
      });
      if (error) throw error;
      if (!data) throw new Error("Supabase no devolvió la row insertada.");
      onAdded();
      onClose();
    } catch (e) {
      const detail = e?.message || e?.hint || e?.details || String(e);
      logger.error("[expertise] save failed:", e);
      setSaveErr(`No se pudo guardar: ${detail}`);
      setExtracting(false);
      return;
    }
    setExtracting(false);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", fontFamily: DS.font,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...darkCard, width: 580, maxHeight: "80vh", overflowY: "auto",
          background: DS.bgSide, border: DS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary, marginBottom: 20 }}>
          Agregar documento de expertise
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Titulo</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Ej: "Estrategia de campanas Q1 2026"'
              style={darkInput}
            />
          </div>

          <div>
            <label style={labelStyle}>Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...darkInput, cursor: "pointer", appearance: "auto" }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Contenido (guion, transcripcion, texto)</label>
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer?.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Pegá aquí el texto, o arrastrá un archivo (PDF, DOCX, XLSX, CSV, TXT, MD) para que lo lea por vos."
                rows={10}
                style={{ ...darkInput, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fileLoading}
                style={{
                  ...darkBtnGhost, padding: "6px 14px", fontSize: 11,
                  opacity: fileLoading ? 0.5 : 1,
                  cursor: fileLoading ? "wait" : "pointer",
                }}
              >
                {fileLoading ? "Leyendo archivo…" : "📎 Subir archivo (PDF, DOCX, XLSX…)"}
              </button>
              <AudioUpload
                label="🎙 Transcribir audio/video"
                onTranscribed={(text) => setContent((prev) => prev ? prev + "\n" + text : text)}
              />
              {fileName && !fileLoading && (
                <span style={{ fontSize: 11, color: DS.textMuted }}>✓ {fileName}</span>
              )}
            </div>
            {fileErr && (
              <div style={{
                marginTop: 8, padding: "8px 10px", borderRadius: 8,
                background: `${DS.red}14`, border: `1px solid ${DS.red}55`,
                color: DS.red, fontSize: 11, lineHeight: 1.5,
              }}>
                ⚠️ {fileErr}
              </div>
            )}
          </div>
        </div>

        {saveErr && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 10,
            background: `${DS.red}14`, border: `1px solid ${DS.red}55`,
            color: DS.red, fontSize: 12, lineHeight: 1.5,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <div style={{ flex: 1, wordBreak: "break-word" }}>{saveErr}</div>
          </div>
        )}

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          marginTop: 20, paddingTop: 16, borderTop: DS.border,
        }}>
          <button onClick={onClose} style={darkBtnGhost}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim() || extracting}
            style={{ ...darkBtn, opacity: !title.trim() || !content.trim() || extracting ? 0.4 : 1 }}
          >
            {extracting ? "Extrayendo conocimiento..." : "Guardar y extraer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: DS.textMuted, letterSpacing: "0.12em", marginBottom: 6,
};
