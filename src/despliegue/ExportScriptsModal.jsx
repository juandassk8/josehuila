// Modal para exportar guiones a PDF.
// - Muestra slots de "To Film" con checkbox.
// - Cada slot expandible con editor de Hooks/Body/CTA — los cambios solo
//   afectan al PDF (NO se persisten en la DB).

import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useCompanyUgcs } from "./hooks/useCompanyUgcs.js";
import { buildAdName } from "./ad_name.js";
import { generateScriptsPdf, parseScript } from "./export_pdf.js";

// Recompone un script_body sintético con los valores editados, en el formato
// que parseScript reconoce.
function composeScriptBody({ hooks, body, cta }) {
  const lines = [];
  if (hooks && hooks.length) {
    lines.push("HOOKS");
    hooks.forEach((h, i) => {
      const clean = String(h || "").trim();
      if (clean) lines.push(`Hook ${i + 1}: ${clean}`);
    });
    lines.push("");
  }
  if ((body || "").trim()) {
    lines.push("BODY");
    lines.push(body.trim());
    lines.push("");
  }
  if ((cta || "").trim()) {
    lines.push("CTA");
    lines.push(cta.trim());
  }
  return lines.join("\n");
}

export function ExportScriptsModal({ companyId, companyName, slots, concepts, onClose }) {
  const { isDark } = useTheme();
  const T = DS;
  const { ugcs } = useCompanyUgcs(companyId, null);

  const [selected, setSelected] = useState(() => new Set(slots.map((s) => s.id)));
  const [expanded, setExpanded] = useState(new Set());
  const [edits, setEdits] = useState({}); // slotId → { hooks: [], body: "", cta: "" }
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [responsable, setResponsable] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      // Pre-cargar el editor con los valores parseados si no había edits.
      if (!edits[id]) {
        const slot = slots.find((s) => s.id === id);
        const parsed = parseScript(slot?.script_body);
        setEdits((e) => ({ ...e, [id]: parsed }));
      }
    }
    return next;
  });

  const updateEdit = (id, patch) => setEdits((prev) => ({
    ...prev,
    [id]: { ...(prev[id] || { hooks: [], body: "", cta: "" }), ...patch },
  }));

  const selectAll = () => setSelected(new Set(slots.map((s) => s.id)));
  const selectNone = () => setSelected(new Set());

  const slotsHydrated = useMemo(() => slots.map((s) => ({
    ...s,
    _ugc: ugcs.find((u) => u.id === s.ugc_id) || null,
    _concept: concepts.find((c) => c.id === s.concept_id) || null,
  })), [slots, ugcs, concepts]);

  const handleExport = async () => {
    const chosen = slotsHydrated
      .filter((s) => selected.has(s.id))
      .map((s) => {
        // Si el user editó este slot, sobreescribimos el script_body con los edits.
        if (edits[s.id]) {
          return { ...s, script_body: composeScriptBody(edits[s.id]) };
        }
        return s;
      });
    if (chosen.length === 0) return;
    setErr("");
    setExporting(true);
    try {
      const defaultBatch = chosen[0]?.creative_number
        ? String(chosen[0].creative_number)
        : "1";
      await generateScriptsPdf(chosen, {
        companyName,
        batchNumber: (batchNumber || defaultBatch).trim(),
        responsable: responsable.trim(),
        notes: notes.trim(),
      });
      onClose?.();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  };

  const bg = isDark ? "#0E0E14" : "#FFFFFF";
  const border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10010,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 820, maxHeight: "90vh",
          background: bg, border, borderRadius: 14,
          color: T.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "16px 20px", borderBottom: border,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📄 Exportar guiones a PDF</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {slots.length} slot{slots.length === 1 ? "" : "s"} en "To Film" · {selected.size} seleccionado{selected.size === 1 ? "" : "s"} · click en "Editar" para ajustar antes de descargar
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: T.textMuted,
              cursor: "pointer", fontSize: 18, padding: "0 4px",
            }}
          >×</button>
        </div>

        {slots.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            No hay slots en la columna "To Film" para exportar.
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 20px", borderBottom: border,
              display: "grid",
              gridTemplateColumns: "120px 1fr 1fr",
              gap: 10, fontSize: 11,
            }}>
              <div>
                <div style={labelStyle(T)}>Número entrega</div>
                <input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="001"
                  style={miniInput(T, isDark)}
                />
              </div>
              <div>
                <div style={labelStyle(T)}>Responsable</div>
                <input
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Nombre"
                  style={miniInput(T, isDark)}
                />
              </div>
              <div>
                <div style={labelStyle(T)}>Nota (opcional)</div>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Lote, referencia interna…"
                  style={miniInput(T, isDark)}
                />
              </div>
            </div>

            <div style={{
              padding: "10px 20px", display: "flex", gap: 6,
              borderBottom: border,
            }}>
              <button onClick={selectAll} style={toolBtn(T)}>Seleccionar todos</button>
              <button onClick={selectNone} style={toolBtn(T)}>Ninguno</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {slotsHydrated.map((s) => {
                const ad = (s.ad_name || "").trim() || buildAdName(s, s._ugc, s._concept);
                const checked = selected.has(s.id);
                const isExpanded = expanded.has(s.id);
                const edit = edits[s.id];
                const wasEdited = !!edit;
                return (
                  <div key={s.id} style={{
                    borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                  }}>
                    <div
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "12px 20px", cursor: "default",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(s.id)}
                        style={{ marginTop: 3, cursor: "pointer" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.textPrimary, lineHeight: 1.3 }}>
                          {s.title || "Sin título"}
                        </div>
                        {ad && (
                          <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                            {ad}
                          </div>
                        )}
                        <div style={{
                          display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4,
                          fontSize: 10, color: T.textSecondary,
                        }}>
                          {s.script_body ? (
                            <Chip color="#1D9E75">✓ Con guion</Chip>
                          ) : (
                            <Chip color={T.red}>sin guion</Chip>
                          )}
                          {s.loom_review_url && <Chip>🎥 Loom</Chip>}
                          {s.reference_url && <Chip>🔗 Ref</Chip>}
                          {wasEdited && <Chip color="#D4A93B">✎ Editado</Chip>}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleExpand(s.id)}
                        style={{
                          background: "transparent", border: `1px solid ${T.textHint}`,
                          color: T.textSecondary, padding: "4px 12px", borderRadius: 50,
                          fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                          flexShrink: 0,
                        }}
                      >
                        {isExpanded ? "Cerrar" : "✏️ Editar"}
                      </button>
                    </div>

                    {isExpanded && edit && (
                      <ScriptEditor
                        value={edit}
                        onChange={(patch) => updateEdit(s.id, patch)}
                        T={T}
                        isDark={isDark}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {err && (
          <div style={{
            padding: "10px 20px",
            background: "rgba(226,75,74,0.12)", color: T.red,
            fontSize: 12, borderTop: border,
          }}>
            ⚠️ {err}
          </div>
        )}

        <div style={{
          padding: "12px 20px", borderTop: border,
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button onClick={onClose} style={ghostBtn(T)}>Cancelar</button>
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            style={{
              padding: "8px 18px", borderRadius: 50, border: "none",
              background: isDark ? "#EBEBEB" : "#1A1D1C",
              color: isDark ? "#1A1D1C" : "#FFFFFF",
              fontSize: 12, fontWeight: 700,
              cursor: exporting || selected.size === 0 ? "not-allowed" : "pointer",
              opacity: exporting || selected.size === 0 ? 0.5 : 1,
              fontFamily: T.font,
            }}
          >
            {exporting ? "Generando PDF…" : `📥 Descargar (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptEditor({ value, onChange, T, isDark }) {
  const hooks = value.hooks || [];
  const updateHook = (idx, text) => {
    const next = [...hooks];
    next[idx] = text;
    onChange({ hooks: next });
  };
  const addHook = () => onChange({ hooks: [...hooks, ""] });
  const removeHook = (idx) => onChange({ hooks: hooks.filter((_, i) => i !== idx) });

  return (
    <div style={{
      padding: "10px 20px 18px 50px",
      background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div>
        <div style={{ ...labelStyle(T), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Hooks ({hooks.length})</span>
          <button
            onClick={addHook}
            style={{
              background: "transparent", border: `1px dashed ${T.textHint}`,
              color: T.textSecondary, padding: "3px 10px", borderRadius: 50,
              fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
            }}
          >+ Agregar hook</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hooks.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#1D9E75",
                paddingTop: 8, minWidth: 22, textAlign: "right",
              }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <textarea
                value={h}
                onChange={(e) => updateHook(i, e.target.value)}
                rows={2}
                placeholder={`Hook ${i + 1}…`}
                style={{ ...editorInput(T, isDark), flex: 1, resize: "vertical", minHeight: 36 }}
              />
              <button
                onClick={() => removeHook(i)}
                title="Quitar hook"
                style={{
                  background: "transparent", border: "none", color: T.red,
                  cursor: "pointer", fontSize: 14, padding: "6px 4px",
                }}
              >🗑</button>
            </div>
          ))}
          {hooks.length === 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic", padding: "4px 0" }}>
              Sin hooks. Click "+ Agregar hook" para escribir uno.
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={labelStyle(T)}>Body</div>
        <textarea
          value={value.body || ""}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={6}
          placeholder="Cuerpo del guion…"
          style={{ ...editorInput(T, isDark), resize: "vertical", minHeight: 100, lineHeight: 1.5 }}
        />
      </div>

      <div>
        <div style={labelStyle(T)}>CTA</div>
        <textarea
          value={value.cta || ""}
          onChange={(e) => onChange({ cta: e.target.value })}
          rows={2}
          placeholder="Call to action…"
          style={{ ...editorInput(T, isDark), resize: "vertical", minHeight: 50, lineHeight: 1.5 }}
        />
      </div>

      <div style={{ fontSize: 10.5, color: T.textMuted, fontStyle: "italic" }}>
        Estos cambios solo afectan al PDF que vas a descargar — el guion en el slot no se modifica.
      </div>
    </div>
  );
}

function Chip({ children, color }) {
  return (
    <span style={{
      padding: "1px 7px", borderRadius: 50,
      background: color ? `${color}22` : "rgba(127,127,127,0.14)",
      color: color || "currentColor",
      fontSize: 10, fontWeight: 600,
    }}>{children}</span>
  );
}

function labelStyle(T) {
  return {
    fontSize: 9.5, fontWeight: 700, color: T.textMuted,
    letterSpacing: "0.1em", textTransform: "uppercase",
    marginBottom: 6,
  };
}
function miniInput(T, isDark) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "6px 10px", borderRadius: 8,
    border: `1px solid ${T.textHint}`,
    background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
    color: T.textPrimary, fontSize: 12, fontFamily: T.font,
    outline: "none",
  };
}
function editorInput(T, isDark) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${T.textHint}`,
    background: isDark ? "rgba(255,255,255,0.02)" : "#FFFFFF",
    color: T.textPrimary, fontSize: 12.5, fontFamily: T.font,
    outline: "none",
  };
}
function toolBtn(T) {
  return {
    padding: "6px 12px", borderRadius: 50, cursor: "pointer",
    background: "transparent", color: T.textSecondary,
    border: `1px solid ${T.textHint}`,
    fontSize: 11, fontWeight: 600, fontFamily: T.font,
  };
}
function ghostBtn(T) {
  return {
    padding: "8px 14px", borderRadius: 50, cursor: "pointer",
    background: "transparent", color: T.textSecondary,
    border: `1px solid ${T.textHint}`,
    fontSize: 12, fontWeight: 600, fontFamily: T.font,
  };
}
