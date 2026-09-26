import { useState } from "react";
import { DS, darkCard, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { createFormat, updateFormat, deleteFormat } from "./workspace_guiones_db.js";
import { useCompanyId } from "./context.js";
import { FormatModal } from "./FormatModal.jsx";

export function FormatLibrary({ formats, onUpdate }) {
  const companyId = useCompanyId();
  const [showModal, setShowModal] = useState(false);
  const [editingFormat, setEditingFormat] = useState(null);

  const handleCreate = async (payload) => {
    await createFormat(companyId, payload);
    onUpdate();
    setShowModal(false);
  };

  const handleEdit = async (payload) => {
    if (!editingFormat) return;
    await updateFormat(editingFormat.id, payload);
    onUpdate();
    setEditingFormat(null);
  };

  const handleDelete = async (id) => {
    await deleteFormat(id);
    onUpdate();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
          BIBLIOTECA DE FORMATOS ({formats.length})
        </div>
        <button onClick={() => setShowModal(true)} style={{ ...darkBtn, padding: "8px 18px", fontSize: 12 }}>
          + Nuevo formato
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {formats.map((f) => (
          <div key={f.id} style={darkCard}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary }}>{f.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setEditingFormat(f)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: DS.textSecondary,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(f.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: DS.red,
                    fontSize: 11,
                    cursor: "pointer",
                    opacity: 0.6,
                  }}
                >
                  x
                </button>
              </div>
            </div>

            {f.description && (
              <div
                style={{
                  fontSize: 12,
                  color: DS.textSecondary,
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                {f.description}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  color: DS.blue,
                  background: "rgba(55,138,221,0.1)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {f.examples?.length || 0} ejemplos
              </span>
              {f.structure && (
                <span
                  style={{
                    fontSize: 10,
                    color: DS.green,
                    background: "rgba(29,185,122,0.1)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  Estructura definida
                </span>
              )}
            </div>
          </div>
        ))}

        {formats.length === 0 && (
          <div
            style={{
              ...darkCard,
              textAlign: "center",
              padding: "40px 20px",
              borderStyle: "dashed",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 10 }}>📝</div>
            <div style={{ color: DS.textSecondary, fontSize: 13, marginBottom: 14 }}>
              No hay formatos aun. Crea tu primer formato y pega transcripciones de ejemplo.
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{ ...darkBtnGhost, fontSize: 12 }}
            >
              + Crear formato
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <FormatModal onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {editingFormat && (
        <FormatModal
          format={editingFormat}
          onSave={handleEdit}
          onClose={() => setEditingFormat(null)}
        />
      )}
    </div>
  );
}
