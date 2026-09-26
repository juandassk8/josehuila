import { useEffect, useMemo, useRef, useState } from "react";
import { DS, darkBtn, darkBtnGhost, darkInput } from "../../lib/design.js";
import {
  FILTER_FIELDS,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  DATE_VALUES,
  OPERATOR_LABEL,
  operatorsFor,
  newRule,
  fieldLabel,
  operatorLabel,
} from "./taskFilters.js";

// Solo el botón toggle. Úsalo en la toolbar junto a "Nueva tarea".
export function FilterToggleButton({ state, open, onToggle }) {
  const rules = state?.rules || [];
  const hasRules = rules.length > 0;
  return (
    <button
      onClick={onToggle}
      title="Filtros"
      style={{
        padding: "7px 14px",
        borderRadius: 50,
        border: hasRules ? `1px solid ${DS.purple}` : `1px solid ${DS.textHint}`,
        background: hasRules ? `${DS.purple}18` : DS.bgCard,
        color: hasRules ? DS.purple : DS.textSecondary,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: DS.font,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <FilterIcon color={hasRules ? DS.purple : DS.textSecondary} />
      <span>{hasRules ? `Filtro (${rules.length})` : "Filtro"}</span>
    </button>
  );
}

// Solo el panel expandido. Úsalo fuera de la toolbar.
export function FilterPanel({
  state,
  addRule,
  updateRule,
  removeRule,
  clearAll,
  saved,
  saveAs,
  deleteSaved,
  applySaved,
  members = [],
  spaces = [],
  open,
}) {
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const savedRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (savedRef.current && !savedRef.current.contains(e.target)) setSavedOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!open) return null;

  const rules = state?.rules || [];
  const hasRules = rules.length > 0;

  return (
    <div style={{ width: "100%", marginBottom: 14 }}>
      <div
        style={{
          background: DS.bgCard,
          border: DS.border,
          borderRadius: 12,
          padding: 16,
          fontFamily: DS.font,
        }}
      >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Filtros</span>
          <span style={{ fontSize: 10, color: DS.textMuted }}>ⓘ</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div ref={savedRef} style={{ position: "relative" }}>
            <button
              onClick={() => setSavedOpen((v) => !v)}
              style={{ ...darkBtnGhost, padding: "5px 12px", fontSize: 11 }}
            >
              Filtros guardados ▾
            </button>
            {savedOpen && (
              <div style={{
                position: "absolute", right: 0, top: "100%", marginTop: 4,
                background: DS.bg, border: DS.border, borderRadius: 10,
                minWidth: 260, boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
                padding: 8, zIndex: 30,
              }}>
                {(saved || []).length === 0 ? (
                  <div style={{ padding: 12, color: DS.textMuted, fontSize: 12 }}>
                    Aún no hay filtros guardados. Guarda los filtros que usas seguido para aplicarlos rápido.
                  </div>
                ) : (
                  saved.map((s) => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 8px", borderRadius: 6,
                    }}>
                      <button
                        onClick={() => { applySaved(s.id); setSavedOpen(false); }}
                        style={{
                          flex: 1, background: "transparent", border: "none",
                          color: DS.textPrimary, fontSize: 12, textAlign: "left",
                          cursor: "pointer", padding: "4px 6px",
                        }}
                      >
                        {s.name}
                      </button>
                      <button
                        onClick={() => deleteSaved(s.id)}
                        title="Eliminar"
                        style={{
                          background: "transparent", border: "none",
                          color: DS.textMuted, fontSize: 12, cursor: "pointer",
                        }}
                      >✕</button>
                    </div>
                  ))
                )}
                <div style={{ borderTop: DS.border, marginTop: 6, paddingTop: 8 }}>
                  <button
                    onClick={() => { setSavedOpen(false); setSaveModal(true); }}
                    style={{ ...darkBtn, padding: "7px 12px", fontSize: 11, width: "100%" }}
                  >
                    Guardar filtro actual
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reglas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rules.map((rule, idx) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            isFirst={idx === 0}
            totalRules={rules.length}
            members={members}
            spaces={spaces}
            onChange={(patch) => updateRule(rule.id, patch)}
            onRemove={() => removeRule(rule.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 14, paddingTop: 12, borderTop: DS.border, gap: 8,
      }}>
        <button
          onClick={() => addRule(newRule("status"))}
          style={{ ...darkBtnGhost, padding: "6px 14px", fontSize: 11 }}
        >
          + Agregar filtro
        </button>
        {hasRules && (
          <button
            onClick={clearAll}
            style={{
              background: "transparent", border: `1px solid ${DS.red}55`,
              color: DS.red, padding: "5px 12px", borderRadius: 50,
              fontSize: 11, fontFamily: DS.font, fontWeight: 600, cursor: "pointer",
            }}
          >
            Borrar todo
          </button>
        )}
      </div>

      {saveModal && (
        <SaveModal
          onCancel={() => setSaveModal(false)}
          onSave={(name, personal) => { saveAs(name, personal); setSaveModal(false); }}
        />
      )}
      </div>
    </div>
  );
}

// ============================================================
// Rule row
// ============================================================

function RuleRow({ rule, isFirst, totalRules, members, spaces, onChange, onRemove }) {
  const field = FILTER_FIELDS.find((f) => f.key === rule.field);
  const ops = operatorsFor(rule.field);
  const showValue = !["is_set", "is_not_set"].includes(rule.operator);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ width: 70, display: "flex", justifyContent: "flex-end" }}>
        {isFirst ? (
          <span style={{
            fontSize: 11, color: DS.textMuted, fontWeight: 600,
          }}>{totalRules > 1 ? "Dónde" : ""}</span>
        ) : (
          <ConnectorDropdown
            value={rule.connector || "and"}
            onChange={(c) => onChange({ connector: c })}
          />
        )}
      </div>
      <FieldDropdown value={rule.field} onChange={(newField) => {
        const newOps = operatorsFor(newField);
        onChange({ field: newField, operator: newOps[0], value: [] });
      }} />
      <OperatorDropdown value={rule.operator} options={ops} onChange={(op) => onChange({ operator: op, value: ["is_set", "is_not_set"].includes(op) ? null : rule.value })} />
      {showValue && (
        <ValueDropdown field={rule.field} value={rule.value} onChange={(v) => onChange({ value: v })} members={members} spaces={spaces} />
      )}
      <button
        onClick={onRemove}
        title="Quitar"
        style={{
          background: "transparent", border: `1px solid ${DS.textHint}`,
          color: DS.textMuted, width: 28, height: 28, borderRadius: 6,
          cursor: "pointer", fontSize: 12,
        }}
      >🗑</button>
    </div>
  );
}

// ============================================================
// Connector dropdown (Y / O entre reglas)
// ============================================================

function ConnectorDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const label = value === "or" ? "O" : "Y";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...getButtonBase(),
          padding: "4px 8px", minWidth: 44,
          fontWeight: 700,
          color: value === "or" ? DS.amber : DS.textSecondary,
          borderColor: value === "or" ? `${DS.amber}66` : DS.textHint,
        }}
      >
        <span>{label}</span>
        <span style={{ color: DS.textMuted, fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{ ...getDropdownPanel(), minWidth: 80 }}>
          {[
            { k: "and", label: "Y", sub: "ambas se cumplen" },
            { k: "or", label: "O", sub: "cualquiera se cumple" },
          ].map((opt) => (
            <button
              key={opt.k}
              onClick={() => { onChange(opt.k); setOpen(false); }}
              style={{
                ...getDropdownItem(),
                flexDirection: "column", alignItems: "flex-start",
                color: opt.k === value ? DS.textPrimary : DS.textSecondary,
                fontWeight: opt.k === value ? 700 : 500,
              }}
            >
              <span>{opt.label}</span>
              <span style={{ fontSize: 10, color: DS.textMuted, fontWeight: 500 }}>
                {opt.sub}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Field dropdown
// ============================================================

function FieldDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = FILTER_FIELDS.find((f) => f.key === value);
  const filtered = FILTER_FIELDS.filter((f) =>
    f.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 150 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={getButtonBase()}
      >
        <span>{current ? `${current.icon} ${current.label}` : "Selecciona..."}</span>
        <span style={{ color: DS.textMuted }}>▾</span>
      </button>
      {open && (
        <div style={getDropdownPanel()}>
          <div style={{ padding: "6px 8px" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              style={{ ...darkInput, padding: "6px 10px", fontSize: 12 }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "4px 0" }}>
            {filtered.map((f) => (
              <button
                key={f.key}
                onClick={() => { onChange(f.key); setOpen(false); setSearch(""); }}
                style={{
                  ...getDropdownItem(),
                  color: f.key === value ? DS.textPrimary : DS.textSecondary,
                  fontWeight: f.key === value ? 600 : 500,
                }}
              >
                <span style={{ width: 18 }}>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Operator dropdown
// ============================================================

function OperatorDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", minWidth: 110 }}>
      <button onClick={() => setOpen((v) => !v)} style={getButtonBase()}>
        <span>{OPERATOR_LABEL[value] || value}</span>
        <span style={{ color: DS.textMuted }}>▾</span>
      </button>
      {open && (
        <div style={{ ...getDropdownPanel(), minWidth: 160 }}>
          {options.map((op) => (
            <button
              key={op}
              onClick={() => { onChange(op); setOpen(false); }}
              style={{
                ...getDropdownItem(),
                color: op === value ? DS.textPrimary : DS.textSecondary,
                fontWeight: op === value ? 600 : 500,
              }}
            >
              <span style={{ flex: 1 }}>{OPERATOR_LABEL[op]}</span>
              {op === value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Value dropdown (per field type)
// ============================================================

function ValueDropdown({ field, value, onChange, members, spaces }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { options, multi } = useMemo(() => {
    const f = FILTER_FIELDS.find((x) => x.key === field);
    const multi = !!f?.multi;
    let options = [];
    if (field === "status") options = STATUS_OPTIONS;
    else if (field === "priority") options = PRIORITY_OPTIONS;
    else if (field === "assignee" || field === "creator")
      options = (members || []).map((m) => ({ value: m.id, label: m.name, color: m.color }));
    else if (field === "space")
      options = (spaces || []).map((s) => ({ value: s.id, label: `${s.icon || "📁"} ${s.name}` }));
    else if (["due_date", "completed_at", "created_at"].includes(field))
      options = DATE_VALUES;
    return { options, multi };
  }, [field, members, spaces]);

  const values = Array.isArray(value) ? value : (value != null ? [value] : []);
  const filtered = options.filter((o) =>
    (o.label || "").toLowerCase().includes(search.toLowerCase())
  );

  const label = values.length === 0
    ? "Selecciona una opción"
    : values.length === 1
      ? (options.find((o) => o.value === values[0])?.label || values[0])
      : `${values.length} seleccionados`;

  const toggle = (optValue) => {
    if (multi) {
      const has = values.includes(optValue);
      onChange(has ? values.filter((v) => v !== optValue) : [...values, optValue]);
    } else {
      onChange(optValue);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 200, flex: 1 }}>
      <button onClick={() => setOpen((v) => !v)} style={getButtonBase()}>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={{ color: DS.textMuted }}>▾</span>
      </button>
      {open && (
        <div style={{ ...getDropdownPanel(), minWidth: 240 }}>
          {options.length > 8 && (
            <div style={{ padding: "6px 8px" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                style={{ ...darkInput, padding: "6px 10px", fontSize: 12 }}
              />
            </div>
          )}
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
            {filtered.length === 0 && (
              <div style={{ padding: 10, color: DS.textMuted, fontSize: 12 }}>
                Sin opciones.
              </div>
            )}
            {filtered.map((o) => {
              const active = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  style={{
                    ...getDropdownItem(),
                    color: active ? DS.textPrimary : DS.textSecondary,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {multi && (
                    <span style={{
                      width: 14, height: 14, borderRadius: 4,
                      border: `1px solid ${active ? DS.blue : DS.textHint}`,
                      background: active ? DS.blue : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 10,
                    }}>{active ? "✓" : ""}</span>
                  )}
                  {o.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color }} />}
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {!multi && active && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Save modal
// ============================================================

function SaveModal({ onCancel, onSave }) {
  const [name, setName] = useState("");
  const [personal, setPersonal] = useState(true);
  const canSave = name.trim().length > 0;
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: DS.bg, border: DS.border, borderRadius: 14,
        padding: 22, fontFamily: DS.font, width: "100%", maxWidth: 460,
        boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, color: DS.textPrimary, fontWeight: 700 }}>Guardar filtro</div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: DS.textMuted, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ponle nombre al filtro"
          style={{ ...darkInput, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: DS.border, borderRadius: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 600 }}>🔒 Filtro personal</div>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
              Se guarda solo en tu navegador.
            </div>
          </div>
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 12 }}>Cancelar</button>
          <button
            onClick={() => canSave && onSave(name.trim(), personal)}
            disabled={!canSave}
            style={{ ...darkBtn, padding: "8px 20px", fontSize: 12, opacity: canSave ? 1 : 0.5 }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Styles / icons
// ============================================================

// Estilos compute-at-render-time para respetar light/dark.
function getButtonBase() {
  return {
    padding: "7px 12px",
    borderRadius: 8,
    border: DS.border,
    background: DS.bg,
    color: DS.textPrimary,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: DS.font,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };
}

function getDropdownPanel() {
  return {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    background: DS.bg,
    border: DS.border,
    borderRadius: 10,
    minWidth: 220,
    boxShadow: DS.bg === "#FFFFFF"
      ? "rgba(15,15,15,0.05) 0px 0px 0px 1px, rgba(15,15,15,0.1) 0px 3px 6px, rgba(15,15,15,0.2) 0px 9px 24px"
      : "0 8px 28px rgba(0,0,0,0.35)",
    zIndex: 30,
  };
}

function getDropdownItem() {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: DS.font,
    textAlign: "left",
  };
}

function FilterIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12M4 8h8M6 13h4" stroke={color || "currentColor"} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
