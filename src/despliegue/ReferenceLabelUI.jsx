import { useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import {
  LABEL_CATEGORIES, CATEGORY_BY_KEY, getLabels, labelChipList,
  distinctValues, hasActiveFilters,
} from "./labels.js";

const normVal = (t) => (t || "").trim().replace(/\s+/g, " ");

// ───────── Chips de una referencia (color por categoría) ─────────
export function LabelChips({ v, max = 8, compact = false }) {
  const chips = labelChipList(v);
  if (chips.length === 0) return null;
  const shown = chips.slice(0, max);
  const extra = chips.length - shown.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {shown.map((c, i) => (
        <span key={`${c.category}-${c.value}-${i}`} title={`${CATEGORY_BY_KEY[c.category]?.label}: ${c.value}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: compact ? 8 : 9, fontWeight: 700,
            color: c.color, background: withA(c.color, 0.14),
            border: `1px solid ${withA(c.color, 0.4)}`,
            padding: compact ? "1px 6px" : "2px 7px", borderRadius: 50,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
          {c.value}
        </span>
      ))}
      {extra > 0 && <span style={{ fontSize: compact ? 8 : 9, fontWeight: 700, color: DS.textMuted }}>+{extra}</span>}
    </div>
  );
}

// ───────── Editor de etiquetas por categoría ─────────
// value = { marca:[], nicho:[], angulo:[], formato:[] }; onChange(next).
// suggestions = { marca:[...], ... } para autocomplete.
export function LabelEditor({ value, onChange, suggestions = {} }) {
  const labels = normalizeValue(value);
  const setCat = (catKey, arr) => onChange({ ...labels, [catKey]: arr });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {LABEL_CATEGORIES.map((cat) => (
        <CategoryInput
          key={cat.key}
          cat={cat}
          values={labels[cat.key]}
          suggestions={suggestions[cat.key] || []}
          onChange={(arr) => setCat(cat.key, arr)}
        />
      ))}
    </div>
  );
}

function CategoryInput({ cat, values, suggestions, onChange }) {
  const [input, setInput] = useState("");
  const listId = `labels-sugg-${cat.key}`;
  const add = (raw) => {
    const t = normVal(raw);
    if (!t) return;
    if (!values.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...values, t]);
    setInput("");
  };
  const remove = (t) => onChange(values.filter((x) => x !== t));
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    else if (e.key === "Backspace" && !input && values.length) remove(values[values.length - 1]);
  };
  const freeSuggestions = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DS.textMuted }}>
          {cat.label}
        </span>
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
        padding: "7px 9px", borderRadius: 8, border: DS.border, background: DS.bgCard, minHeight: 40,
      }}>
        {values.map((t) => (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 50,
            fontSize: 11, fontWeight: 700, color: cat.color,
            background: withA(cat.color, 0.16), border: `1px solid ${withA(cat.color, 0.4)}`,
          }}>
            {t}
            <button onClick={() => remove(t)} style={{ border: "none", background: "transparent", color: cat.color, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(input)}
          list={listId}
          placeholder={values.length ? "Agregar…" : `Ej: ${placeholderFor(cat.key)}`}
          style={{ flex: 1, minWidth: 110, border: "none", background: "transparent", color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none" }}
        />
        <datalist id={listId}>
          {freeSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
    </div>
  );
}

// ───────── Barra COMPACTA de organizar + filtrar/resaltar + ver etiquetas ─────────
// Una sola línea liviana. El filtro (chips por categoría + modo) vive en un popover
// que se abre on-demand para no cargar la vista. groupBy default 'marca'.
export function ReferenceFilterBar({
  variations, groupBy, onGroupBy, filters, onFilters, mode, onMode, showLabels, onShowLabels,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const valuesByCat = useMemo(() => {
    const out = {};
    for (const c of LABEL_CATEGORIES) out[c.key] = distinctValues(variations, c.key);
    return out;
  }, [variations]);

  const anyValues = LABEL_CATEGORIES.some((c) => valuesByCat[c.key].length > 0);
  const active = hasActiveFilters(filters);
  const activeCount = LABEL_CATEGORIES.reduce((n, c) => n + ((filters[c.key] || []).length), 0);

  const toggleValue = (catKey, val) => {
    const cur = filters[catKey] || [];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    onFilters({ ...filters, [catKey]: next });
  };
  const clearAll = () => onFilters({});

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {/* Organizar por (compacto) */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.textMuted }}>
        <span style={{ letterSpacing: "0.02em" }}>Organizar</span>
        <select
          value={groupBy}
          onChange={(e) => onGroupBy(e.target.value)}
          disabled={!anyValues}
          style={{
            padding: "6px 10px", borderRadius: 8, border: DS.border,
            background: "rgba(0,0,0,0.25)", color: DS.textPrimary, fontSize: 12,
            fontFamily: DS.font, outline: "none", cursor: anyValues ? "pointer" : "default",
          }}
        >
          <option value="">Sin agrupar</option>
          {LABEL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>

      <span style={{ flex: 1 }} />

      {/* Toggle ver etiquetas */}
      <button
        onClick={() => onShowLabels(!showLabels)}
        title="Mostrar u ocultar las etiquetas en las tarjetas"
        style={{
          padding: "6px 12px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
          fontSize: 11, fontWeight: 700,
          border: showLabels ? `1px solid ${DS.blue}` : DS.border,
          background: showLabels ? withA(DS.blue, 0.16) : "transparent",
          color: showLabels ? DS.blue : DS.textSecondary,
        }}
      >🏷 Etiquetas</button>

      {/* Filtrar (popover) */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          disabled={!anyValues}
          style={{
            padding: "6px 12px", borderRadius: 50, cursor: anyValues ? "pointer" : "default", fontFamily: DS.font,
            fontSize: 11, fontWeight: 700,
            border: active ? `1px solid ${DS.amber}` : DS.border,
            background: active ? withA(DS.amber, 0.16) : "transparent",
            color: active ? DS.amber : (anyValues ? DS.textSecondary : DS.textMuted),
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          ▽ Filtrar{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        {filterOpen && anyValues && (
          <>
            <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{
              position: "absolute", top: 34, right: 0, zIndex: 41, width: 320, maxHeight: 420, overflowY: "auto",
              padding: 12, borderRadius: 12, background: DS.bgSide, border: `1px solid ${DS.textHint}`,
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", gap: 10,
            }}>
              {/* Modo */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.04em" }}>MODO</span>
                <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2 }}>
                  <MiniBtn active={mode === "resaltar"} onClick={() => onMode("resaltar")}>✨ Resaltar</MiniBtn>
                  <MiniBtn active={mode === "filtrar"} onClick={() => onMode("filtrar")}>▽ Filtrar</MiniBtn>
                </div>
                <span style={{ flex: 1 }} />
                {active && (
                  <button onClick={clearAll} style={{
                    padding: "4px 9px", borderRadius: 50, border: DS.border, background: "transparent",
                    color: DS.textSecondary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                  }}>Limpiar</button>
                )}
              </div>
              {/* Chips por categoría */}
              {LABEL_CATEGORIES.filter((c) => valuesByCat[c.key].length > 0).map((c) => (
                <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: c.color }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />{c.label}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {valuesByCat[c.key].map((val) => {
                      const on = (filters[c.key] || []).includes(val);
                      return (
                        <button key={val} onClick={() => toggleValue(c.key, val)}
                          style={{
                            padding: "4px 10px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
                            fontSize: 11, fontWeight: 700,
                            border: on ? `1px solid ${c.color}` : DS.border,
                            background: on ? withA(c.color, 0.2) : "transparent",
                            color: on ? c.color : DS.textSecondary,
                          }}>
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniBtn({ children, active, color, onClick }) {
  const c = color || DS.textPrimary;
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 50, border: "none",
      background: active ? (color ? withA(color, 0.2) : DS.bgSide) : "transparent",
      color: active ? c : DS.textMuted,
      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
    }}>{children}</button>
  );
}

function normalizeValue(value) {
  const out = {};
  for (const c of LABEL_CATEGORIES) {
    const v = value?.[c.key];
    out[c.key] = Array.isArray(v) ? v.filter(Boolean) : [];
  }
  return out;
}

function placeholderFor(key) {
  return {
    marca: "RYZE, Hims, Cocunat…",
    nicho: "Salud, Belleza…",
    angulo: "Bajar de peso, Acné…",
    formato: "Storytime, Antes/después…",
  }[key] || "…";
}

// rgba helper — DS colors son hex; withAlpha del proyecto asume otro formato.
function withA(hex, a) {
  const h = (hex || "#000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}
