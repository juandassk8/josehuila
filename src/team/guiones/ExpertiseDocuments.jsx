import { useState, useEffect, useCallback } from "react";
import { DS, darkCard, darkInput, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { database } from "../../lib/backend.js";
import { AudioUpload } from "./AudioUpload.jsx";
import { listExpertiseDocs, createExpertiseDoc, deleteExpertiseDoc } from "../data/guionesDb.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";

const CATEGORIES = [
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "business", label: "Negocio" },
  { value: "general", label: "General" },
];

export function ExpertiseDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const { data } = await listExpertiseDocs();
    setDocs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("expertise_documents_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "expertise_documents" }, () => load())
      .subscribe();
    return () => database.removeChannel(channel);
  }, [load]);

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

      {showAdd && <AddDocumentModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function AddDocumentModal({ onClose, onAdded }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [extracting, setExtracting] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setExtracting(true);

    try {
      // Call extract-knowledge API
      const res = await fetch("/api/extract-knowledge", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ content: content.trim(), category }),
      });

      let extracted = "";
      if (res.ok) {
        const data = await res.json();
        extracted = data.extracted || "";
      }

      await createExpertiseDoc({
        title: title.trim(),
        raw_content: content.trim(),
        extracted_summary: extracted,
        category,
      });

      onAdded();
      onClose();
    } catch {
      // If extraction fails, save without summary
      await createExpertiseDoc({
        title: title.trim(),
        raw_content: content.trim(),
        extracted_summary: "",
        category,
      });
      onAdded();
      onClose();
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
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Pega aqui el guion, transcripcion o texto del que quieres extraer conocimiento..."
              rows={10}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.6 }}
            />
            <AudioUpload
              label="Transcribir audio/video"
              onTranscribed={(text) => setContent((prev) => prev ? prev + "\n" + text : text)}
            />
          </div>
        </div>

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
