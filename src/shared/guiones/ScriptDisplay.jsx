import { useState } from "react";
import { DS } from "../../lib/design.js";

// Parse markdown script into structured sections
function parseScript(text) {
  if (!text) return null;

  const hooks = [];
  let body = "";
  let cta = "";
  let currentSection = null;
  let currentHook = null;

  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,3}\s*HOOKS?/i.test(trimmed)) {
      currentSection = "hooks";
      continue;
    }
    if (/^#{1,3}\s*BODY/i.test(trimmed)) {
      currentSection = "body";
      if (currentHook) { hooks.push(currentHook); currentHook = null; }
      continue;
    }
    if (/^#{1,3}\s*CTA/i.test(trimmed)) {
      currentSection = "cta";
      continue;
    }

    if (currentSection === "hooks") {
      const hookMatch = trimmed.match(/^\*{0,2}Hook\s*\d+:?\*{0,2}\s*(.*)/i);
      if (hookMatch) {
        if (currentHook) hooks.push(currentHook);
        currentHook = hookMatch[1].trim();
      } else if (trimmed && currentHook !== null) {
        currentHook += " " + trimmed;
      } else if (trimmed && currentHook === null) {
        currentHook = trimmed;
      }
    } else if (currentSection === "body") {
      body += (body ? "\n" : "") + line;
    } else if (currentSection === "cta") {
      cta += (cta ? "\n" : "") + line;
    }
  }

  if (currentHook) hooks.push(currentHook);

  // If we couldn't parse, return null (show raw text)
  if (hooks.length === 0 && !body.trim()) return null;

  return { hooks, body: body.trim(), cta: cta.trim() };
}

export function ScriptDisplay({ content, onEdit, loading, onUndo, canUndo }) {
  const parsed = parseScript(content);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");

  if (!content && !loading) return null;

  if (loading && !content) {
    return (
      <div style={{ padding: 20, color: DS.textMuted, fontSize: 13 }}>
        Generando guion...
      </div>
    );
  }

  // If we can't parse the structure, show raw text
  if (!parsed) {
    return (
      <div style={{
        color: DS.textPrimary, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
        padding: 16, background: DS.bgCard, borderRadius: 10, border: DS.border, minHeight: 120,
      }}>
        {content}
      </div>
    );
  }

  const startEdit = (field, value) => {
    setEditingField(field);
    setEditValue(value);
  };

  const saveEdit = () => {
    if (!editingField || !onEdit) { setEditingField(null); return; }

    // Rebuild the markdown from parsed + edited field
    const updated = { ...parsed };
    if (editingField.startsWith("hook-")) {
      const idx = parseInt(editingField.split("-")[1]);
      updated.hooks = [...parsed.hooks];
      updated.hooks[idx] = editValue;
    } else if (editingField === "body") {
      updated.body = editValue;
    } else if (editingField === "cta") {
      updated.cta = editValue;
    }

    // Rebuild markdown
    let md = "## HOOKS\n\n";
    updated.hooks.forEach((h, i) => { md += `**Hook ${i + 1}:** ${h}\n\n`; });
    md += "## BODY\n\n" + updated.body + "\n\n";
    md += "## CTA\n\n" + updated.cta;

    onEdit(md);
    setEditingField(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Undo button */}
      {onUndo && canUndo && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
          <button
            onClick={onUndo}
            style={{
              background: "transparent",
              border: `1px solid ${DS.textHint}`,
              color: DS.textSecondary,
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Deshacer ultima edicion"
          >
            ↩ Deshacer
          </button>
        </div>
      )}

      {/* HOOKS */}
      <div>
        <div style={sectionLabel}>HOOKS ({parsed.hooks.length} variaciones)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {parsed.hooks.map((hook, i) => (
            <div key={i} style={hookCard}>
              <div style={{ fontSize: 10, fontWeight: 700, color: DS.blue, marginBottom: 4 }}>
                Hook {i + 1}
              </div>
              {editingField === `hook-${i}` ? (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
                  autoFocus
                  rows={3}
                  style={editArea}
                />
              ) : (
                <div
                  onClick={() => startEdit(`hook-${i}`, hook)}
                  style={{ ...textContent, cursor: "text" }}
                  title="Click para editar"
                >
                  {hook}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div>
        <div style={sectionLabel}>BODY</div>
        <div style={bodyCard}>
          {editingField === "body" ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
              autoFocus
              rows={10}
              style={editArea}
            />
          ) : (
            <div
              onClick={() => startEdit("body", parsed.body)}
              style={{ ...textContent, cursor: "text" }}
              title="Click para editar"
            >
              {parsed.body}
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      {parsed.cta && (
        <div>
          <div style={sectionLabel}>CTA</div>
          <div style={ctaCard}>
            {editingField === "cta" ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
                autoFocus
                rows={3}
                style={editArea}
              />
            ) : (
              <div
                onClick={() => startEdit("cta", parsed.cta)}
                style={{ ...textContent, cursor: "text" }}
                title="Click para editar"
              >
                {parsed.cta}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const sectionLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  marginBottom: 8,
  color: DS.textMuted,
};

// These are functions to read DS at render time
const hookCard = {
  get background() { return DS.bgCard; },
  get border() { return DS.border; },
  borderRadius: 10,
  padding: "12px 16px",
};

const bodyCard = {
  get background() { return DS.bgCard; },
  get border() { return DS.border; },
  borderRadius: 10,
  padding: "16px",
};

const ctaCard = {
  get background() { return "rgba(55,138,221,0.05)"; },
  get border() { return `1px solid rgba(55,138,221,0.15)`; },
  borderRadius: 10,
  padding: "12px 16px",
};

const textContent = {
  get color() { return DS.textPrimary; },
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
};

const editArea = {
  width: "100%",
  get background() { return DS.bgCard; },
  get border() { return DS.border; },
  borderRadius: 6,
  get color() { return DS.textPrimary; },
  fontSize: 14,
  lineHeight: 1.7,
  get fontFamily() { return DS.font; },
  padding: "8px 10px",
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};
