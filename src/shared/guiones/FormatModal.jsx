import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, darkCard } from "../../lib/design.js";
import { AudioUpload } from "./AudioUpload.jsx";

export function FormatModal({ format, onSave, onClose }) {
  const isEdit = !!format;
  const [name, setName] = useState(format?.name || "");
  const [description, setDescription] = useState(format?.description || "");
  const [structure, setStructure] = useState(format?.structure || "");
  const [examples, setExamples] = useState(format?.examples || []);
  const [newTitle, setNewTitle] = useState("");
  const [newTranscript, setNewTranscript] = useState("");
  const [newIsOwn, setNewIsOwn] = useState(true);
  const [color, setColor] = useState(format?.color || "#378ADD");
  const [saving, setSaving] = useState(false);

  const COLOR_OPTIONS = ["#378ADD", "#1DB97A", "#F5A623", "#8B5CF6", "#E24B4A", "#EC4899", "#06B6D4", "#F97316", "#9B9A97"];

  const addExample = () => {
    if (!newTranscript.trim()) return;
    setExamples([
      ...examples,
      { title: newTitle.trim() || `Ejemplo ${examples.length + 1}`, transcript: newTranscript.trim(), is_own: newIsOwn },
    ]);
    setNewTitle("");
    setNewTranscript("");
    setNewIsOwn(true);
  };

  const toggleOwn = (i) => {
    setExamples(examples.map((ex, idx) => idx === i ? { ...ex, is_own: !ex.is_own } : ex));
  };

  const removeExample = (i) => {
    setExamples(examples.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      description: description.trim(),
      structure: structure.trim(),
      examples,
      color,
    });
    setSaving(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        fontFamily: DS.font,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...darkCard,
          width: 640,
          maxHeight: "85vh",
          overflowY: "auto",
          background: DS.bgSide,
          border: DS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: DS.textPrimary,
            marginBottom: 20,
          }}
        >
          {isEdit ? "Editar formato" : "Nuevo formato"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Nombre del formato</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Ej: "Autoridad con referencia", "Storytelling marca"'
                style={{ ...darkInput, flex: 1 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: 6 }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: "50%", border: color === c ? `2px solid ${DS.textPrimary}` : "2px solid transparent",
                    background: c, cursor: "pointer", padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Descripcion (cuando usar este formato)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe cuando aplica este formato..."
              rows={2}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Estructura (paso a paso)</label>
            <textarea
              value={structure}
              onChange={(e) => setStructure(e.target.value)}
              placeholder={"1. Hook - ...\n2. Desarrollo - ...\n3. Cierre - ..."}
              rows={4}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Examples list */}
          <div>
            <label style={labelStyle}>
              Transcripciones ejemplo ({examples.length})
            </label>
            {examples.map((ex, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: DS.bgCard,
                  border: ex.is_own ? "1px solid rgba(55,138,221,0.2)" : DS.border,
                  marginBottom: 8,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: DS.blue, flex: 1 }}>
                    {ex.title}
                  </div>
                  <button
                    onClick={() => toggleOwn(i)}
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: ex.is_own ? "rgba(55,138,221,0.15)" : DS.bgCard,
                      color: ex.is_own ? DS.blue : DS.textMuted,
                    }}
                  >
                    {ex.is_own ? "PROPIA" : "TERCERO"}
                  </button>
                  <button
                    onClick={() => removeExample(i)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: DS.red,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Quitar
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: DS.textSecondary,
                    lineHeight: 1.5,
                    maxHeight: 80,
                    overflow: "hidden",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ex.transcript}
                </div>
              </div>
            ))}

            {/* Add example form */}
            <div
              style={{
                padding: "12px",
                borderRadius: 8,
                border: DS.borderDash,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titulo del ejemplo (opcional)"
                style={{ ...darkInput, fontSize: 12, padding: "8px 10px" }}
              />
              <textarea
                value={newTranscript}
                onChange={(e) => setNewTranscript(e.target.value)}
                placeholder="Pega aqui la transcripcion del video ejemplo..."
                rows={5}
                style={{
                  ...darkInput,
                  fontSize: 12,
                  padding: "8px 10px",
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <AudioUpload
                  label="Transcribir audio"
                  onTranscribed={(text) => setNewTranscript((prev) => prev ? prev + "\n" + text : text)}
                />
                <button
                  onClick={() => window.open("https://cobalt.tools/", "_blank")}
                  style={{
                    ...darkBtnGhost,
                    padding: "6px 14px",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  title="Abre Cobalt Tools para descargar video"
                >
                  📥 Descargar referencia
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setNewIsOwn(!newIsOwn)}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: newIsOwn ? "rgba(55,138,221,0.15)" : DS.bgCard,
                    color: newIsOwn ? DS.blue : DS.textMuted,
                  }}
                >
                  {newIsOwn ? "Referencia PROPIA" : "Referencia de TERCERO"}
                </button>
                <button
                  onClick={addExample}
                  disabled={!newTranscript.trim()}
                  style={{
                    ...darkBtnGhost,
                    padding: "6px 14px",
                    fontSize: 11,
                    opacity: !newTranscript.trim() ? 0.4 : 1,
                  }}
                >
                  + Agregar ejemplo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
            paddingTop: 16,
            borderTop: DS.border,
          }}
        >
          <button onClick={onClose} style={darkBtnGhost}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{
              ...darkBtn,
              opacity: !name.trim() || saving ? 0.4 : 1,
            }}
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear formato"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: DS.textMuted,
  letterSpacing: "0.12em",
  marginBottom: 6,
};
