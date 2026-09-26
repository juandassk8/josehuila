import { useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";

// Modal de "Ángulos de venta" por empresa. El admin los escribe en Markdown; el
// cliente los ve renderizados bonito (solo lectura). Se guardan en la config del
// board (board.config.sales_angles_md), que el cliente ya puede leer.
export function SalesAnglesModal({ angles = "", canEdit = false, companyName = "", onSave, onClose }) {
  const { isDark } = useTheme();
  const T = DS;
  const [editing, setEditing] = useState(canEdit && !angles.trim());
  const [draft, setDraft] = useState(angles || "");
  const [saving, setSaving] = useState(false);

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  const doSave = async () => {
    setSaving(true);
    try { await onSave?.(draft); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} data-modal style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: T.font, overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: modalBg, border: divider, borderRadius: 16, width: "100%", maxWidth: 680,
        maxHeight: "88vh", display: "flex", flexDirection: "column", color: T.textPrimary,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.6)" : "0 24px 70px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 26px 14px", borderBottom: divider, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C9761F", fontWeight: 800, marginBottom: 4 }}>
              {companyName || "Empresa"}
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>🎯 Ángulos de venta</h2>
          </div>
          {canEdit && !editing && (
            <button onClick={() => { setDraft(angles || ""); setEditing(true); }} style={btn(false, T)}>✏️ Editar</button>
          )}
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: divider, background: "transparent", color: T.textSecondary, cursor: "pointer", fontSize: 17 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 26px 24px" }}>
          {editing ? (
            <>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
                Escribe en <b>Markdown</b>. Ej: <code># Título</code>, <code>## Subtítulo</code>, <code>- viñeta</code>, <code>**negrita**</code>.
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={"## Ángulo 1: Ahorro de tiempo\nExplica cómo el producto le devuelve horas al día.\n\n## Ángulo 2: Estatus\n- Punto de dolor\n- Beneficio\n- Prueba social"}
                style={{
                  width: "100%", minHeight: 300, padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                  background: isDark ? "rgba(255,255,255,0.04)" : "#FFF", color: T.textPrimary,
                  fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.6,
                  outline: "none", resize: "vertical", boxSizing: "border-box",
                }}
              />
              {draft.trim() && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, fontWeight: 700, marginBottom: 8 }}>Vista previa</div>
                  <div style={{ padding: "14px 16px", borderRadius: 10, border: divider, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
                    <Markdown text={draft} isDark={isDark} />
                  </div>
                </div>
              )}
            </>
          ) : angles.trim() ? (
            <Markdown text={angles} isDark={isDark} />
          ) : (
            <div style={{ padding: "40px 10px", textAlign: "center", color: T.textMuted, fontSize: 14 }}>
              {canEdit ? "Todavía no cargaste los ángulos de venta. Dale a “Editar” para agregarlos." : "Aún no hay ángulos de venta cargados."}
            </div>
          )}
        </div>

        {/* Footer (solo en edición) */}
        {editing && (
          <div style={{ padding: "12px 26px", borderTop: divider, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { if (angles.trim()) setEditing(false); else onClose?.(); }} disabled={saving} style={btn(false, T)}>Cancelar</button>
            <button onClick={doSave} disabled={saving} style={btn(true, T)}>{saving ? "Guardando…" : "Guardar ángulos"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function btn(primary, T) {
  return primary
    ? { padding: "9px 20px", borderRadius: 50, border: "none", background: "#C9761F", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: T.font }
    : { padding: "8px 15px", borderRadius: 50, border: `1px solid ${T.textHint}`, background: "transparent", color: T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font };
}

// Render de Markdown mínimo (headings, viñetas, numeradas, negrita/itálica, links,
// párrafos). Suficiente para ángulos de venta; sin dependencias.
function Markdown({ text, isDark }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  const flush = () => { if (list) { blocks.push(list); list = null; } };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); return; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: "h", level: h[1].length, text: h[2] }); return; }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) { if (!list || list.type !== "ul") { flush(); list = { type: "ul", items: [] }; } list.items.push(ul[1]); return; }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) { if (!list || list.type !== "ol") { flush(); list = { type: "ol", items: [] }; } list.items.push(ol[1]); return; }
    flush();
    blocks.push({ type: "p", text: line });
  });
  flush();

  const c = {
    text: isDark ? "#EBEBEB" : "#1A1D1C",
    muted: isDark ? "rgba(255,255,255,0.75)" : "#3A3E3C",
    accent: "#C9761F",
  };

  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: c.muted }}>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          const sizes = { 1: 22, 2: 17, 3: 14.5, 4: 13 };
          return <div key={i} style={{ fontSize: sizes[b.level] || 14, fontWeight: 800, color: b.level <= 2 ? c.accent : c.text, margin: i ? "16px 0 6px" : "0 0 6px", letterSpacing: "-0.01em" }}>{inline(b.text, c)}</div>;
        }
        if (b.type === "ul" || b.type === "ol") {
          const Tag = b.type === "ul" ? "ul" : "ol";
          return <Tag key={i} style={{ margin: "6px 0 10px", paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{inline(it, c)}</li>)}</Tag>;
        }
        return <p key={i} style={{ margin: "0 0 10px" }}>{inline(b.text, c)}</p>;
      })}
    </div>
  );
}

// Negrita/itálica/links inline → array de nodos React.
function inline(text, c) {
  const nodes = [];
  let rest = String(text);
  let key = 0;
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/;
  let m;
  while ((m = rest.match(re))) {
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    if (m[2] != null) nodes.push(<strong key={key++} style={{ color: c.text, fontWeight: 800 }}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] != null) nodes.push(<a key={key++} href={m[5]} target="_blank" rel="noreferrer" style={{ color: c.accent, textDecoration: "underline" }}>{m[4]}</a>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) nodes.push(rest);
  return nodes;
}
