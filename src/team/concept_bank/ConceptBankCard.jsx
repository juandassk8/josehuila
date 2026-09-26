import { useState } from "react";
import { DS } from "../../lib/design.js";

const STAGE_COLOR = {
  tofu: DS.blue,
  mofu: DS.amber,
  bofu: DS.green,
};

const STAGE_LABEL = {
  tofu: "TOFU",
  mofu: "MOFU",
  bofu: "BOFU",
};

const FORMAT_LABEL = {
  static: "Estático",
  video: "Video",
};

const PIPELINE_LABEL = {
  ads: "Ads",
  organic: "Orgánico",
};

// Card compacta para la grid del banco. Click → abre preview/import.
// En modo selección muestra checkbox visible y desactiva el botón importar.
export function ConceptBankCard({ item, selected, onClick, onImportClick, compact = false, selectionMode = false, canManage = false, onHide, onDeleteForever }) {
  const stageColor = STAGE_COLOR[item.stage] || DS.textMuted;
  const [menuOpen, setMenuOpen] = useState(false);
  const showManage = canManage && !selectionMode;
  const tags = item.bank_tags || [];

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        background: DS.bgCard,
        border: selected ? `2px solid ${DS.green}` : DS.border,
        borderRadius: 14,
        padding: compact ? 10 : 12,
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.1s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: compact ? 180 : 220,
        overflow: "hidden",
        fontFamily: DS.font,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = selected ? DS.green : "rgba(255,255,255,0.07)";
      }}
    >
      {/* Thumb */}
      <div style={{
        width: "100%",
        aspectRatio: "1.6",
        borderRadius: 10,
        overflow: "hidden",
        background: "rgba(0,0,0,0.4)",
        position: "relative",
        flexShrink: 0,
      }}>
        {item.thumb_url ? (
          <img
            src={item.thumb_url}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: DS.textMuted, fontSize: 11,
          }}>
            sin referencias
          </div>
        )}

        {/* Stage badge superpuesto */}
        <div style={{
          position: "absolute", top: 7, left: 7,
          padding: "3px 8px", borderRadius: 50,
          background: stageColor,
          color: "#fff", fontSize: 9, fontWeight: 800,
          letterSpacing: "0.08em",
        }}>
          {STAGE_LABEL[item.stage] || item.stage}
        </div>

        {/* Counter de variations — si está en grupo cross-empresa, muestra el total del grupo */}
        {(item.variations_count > 0 || item.group_variations_count > 0) && (
          <div style={{
            position: "absolute", top: 7, right: 7,
            padding: "3px 8px", borderRadius: 50,
            background: item.group_company_count > 1 ? "rgba(59,139,212,0.85)" : "rgba(0,0,0,0.65)",
            color: "#fff", fontSize: 10, fontWeight: 700,
          }}>
            {item.group_company_count > 1
              ? `${item.group_variations_count} refs · ${item.group_company_count} emp.`
              : `${item.variations_count} ref${item.variations_count === 1 ? "" : "s"}`}
          </div>
        )}

        {/* Pipeline type */}
        <div style={{
          position: "absolute", bottom: 7, left: 7,
          padding: "2px 7px", borderRadius: 50,
          background: "rgba(0,0,0,0.65)",
          color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: 600,
          letterSpacing: "0.04em",
        }}>
          {PIPELINE_LABEL[item.pipeline_type] || item.pipeline_type}
        </div>
      </div>

      {/* Nombre + meta */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: DS.textPrimary,
          lineHeight: 1.25,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {item.name || "Sin nombre"}
        </div>
        <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.04em" }}>
          {FORMAT_LABEL[item.format] || item.format}
        </div>
      </div>

      {/* Badge de grupo cross-empresa (solo si está vinculado) */}
      {item.group_company_count > 1 && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 50, alignSelf: "flex-start",
          background: "rgba(59,139,212,0.16)",
          border: "1px solid rgba(59,139,212,0.40)",
          color: "#7BB6E6",
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em",
        }}>
          🔗 Vinculado · {item.group_company_count} empresas
        </div>
      )}

      {/* Footer: empresa + nicho */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 2,
        paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{
          fontSize: 11, color: DS.textSecondary, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.company_name}
        </div>
        {item.niche && (
          <div style={{
            fontSize: 9, color: DS.textMuted, letterSpacing: "0.06em",
            textTransform: "uppercase",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.niche}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
            {tags.slice(0, 3).map((t) => (
              <span key={t} style={{
                fontSize: 8.5, fontWeight: 700, color: "#7BB6E6",
                padding: "2px 7px", borderRadius: 50,
                background: "rgba(59,139,212,0.16)",
                border: "1px solid rgba(59,139,212,0.35)",
                maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t}</span>
            ))}
            {tags.length > 3 && (
              <span style={{ fontSize: 8.5, fontWeight: 700, color: DS.textMuted }}>
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {!selectionMode && onImportClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onImportClick(); }}
          style={{
            position: "absolute", top: 8, right: showManage ? 42 : 8,
            padding: "4px 10px", borderRadius: 50,
            border: "none",
            background: DS.green,
            color: "#fff", fontSize: 10, fontWeight: 700,
            cursor: "pointer", fontFamily: DS.font,
            opacity: 0,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; }}
        >
          Importar
        </button>
      )}

      {/* Menú de gestión (Admin): ocultar / eliminar definitivo */}
      {showManage && (
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            title="Opciones"
            style={{
              width: 26, height: 26, borderRadius: 8, border: "none",
              background: "rgba(0,0,0,0.6)", color: "#fff",
              fontSize: 15, fontWeight: 800, lineHeight: 1,
              cursor: "pointer", fontFamily: DS.font,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >⋮</button>
          {menuOpen && (
            <>
              <div
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: 30, right: 0, zIndex: 41,
                  width: 210, padding: 6, borderRadius: 10,
                  background: DS.bgSide, border: `1px solid ${DS.textHint}`,
                  boxShadow: "0 12px 34px rgba(0,0,0,0.55)",
                  display: "flex", flexDirection: "column", gap: 2,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onHide?.(item); }}
                  style={menuItemStyle}
                >
                  Ocultar del banco
                  <span style={menuHintStyle}>Reversible · no borra el despliegue</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDeleteForever?.(item); }}
                  style={{ ...menuItemStyle, color: DS.red }}
                >
                  Eliminar definitivamente
                  <span style={menuHintStyle}>Borra concepto + refs. Sin vuelta atrás.</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {selectionMode && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          width: 22, height: 22, borderRadius: "50%",
          border: selected ? `2px solid ${DS.green}` : "2px solid rgba(255,255,255,0.3)",
          background: selected ? DS.green : "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 12, fontWeight: 800,
          pointerEvents: "none",
        }}>
          {selected ? "✓" : ""}
        </div>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start",
  padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent",
  color: DS.textPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: DS.font, textAlign: "left", width: "100%",
};
const menuHintStyle = {
  fontSize: 9.5, fontWeight: 500, color: DS.textMuted, letterSpacing: "0.01em",
};
