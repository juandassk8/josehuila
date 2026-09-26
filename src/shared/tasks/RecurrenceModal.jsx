import { useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { RECURRENCE_PATTERNS } from "../../lib/recurrence.js";

// Modal centrado con backdrop, estilo ClickUp.
export function RecurrenceModal({ value, onSave, onClose }) {
  const hasInitial = !!value?.pattern;
  const [pattern, setPattern] = useState(value?.pattern || "semanal");
  const [interval, setIntervalVal] = useState(value?.interval || 1);
  const [days, setDays] = useState(() => (Array.isArray(value?.days) && value.days.length === 7 ? value.days : [1, 1, 1, 1, 1, 0, 0]));
  const [active, setActive] = useState(value?.active !== false);
  const [nextStatus, setNextStatus] = useState(value?.nextStatus || "pendiente");
  const [updateToStatus, setUpdateToStatus] = useState(!!value?.nextStatus);
  // "Cambio en estado" es el trigger de avance (por ahora solo 'completado').
  const [trigger] = useState("completado");

  const save = () => {
    onSave({
      pattern,
      interval,
      days: pattern === "dias_semana" ? days : null,
      active,
      nextStatus: updateToStatus ? nextStatus : null,
    });
  };

  const clear = () => {
    onSave({ pattern: null, interval: 1, active: false, nextStatus: null });
  };

  const panelStyle = {
    background: DS.bg,
    border: DS.border,
    borderRadius: 14,
    padding: 22,
    fontFamily: DS.font,
    color: DS.textPrimary,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Configuración
            </div>
            <div style={{ fontSize: 16, color: DS.textPrimary, fontWeight: 700 }}>
              🔄 Tarea recurrente
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: DS.textMuted, cursor: "pointer", fontSize: 16 }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Frecuencia">
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              style={{ ...darkInput, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}
            >
              {RECURRENCE_PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>

          {pattern === "dias_semana" && (
            <Field label="Qué días">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
                  <button
                    key={d} type="button"
                    onClick={() => setDays((prev) => prev.map((x, j) => (j === i ? (x ? 0 : 1) : x)))}
                    style={{
                      width: 38, height: 38, borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontWeight: 800, fontSize: 13,
                      border: `1px solid ${days[i] ? DS.blue : DS.textHint}`, background: days[i] ? DS.blue : "transparent",
                      color: days[i] ? "#fff" : DS.textMuted,
                    }}
                  >{d}</button>
                ))}
              </div>
            </Field>
          )}

          {pattern !== "dias_semana" && <Field label="Cada">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setIntervalVal(parseInt(e.target.value) || 1)}
                style={{ ...darkInput, width: 80, padding: "9px 12px", fontSize: 13 }}
              />
              <span style={{ fontSize: 13, color: DS.textSecondary }}>
                {pattern === "diariamente" ? "día(s)" :
                 pattern === "semanal" ? "semana(s)" :
                 pattern === "mensual" ? "mes(es)" :
                 pattern === "anual" ? "año(s)" : "día(s) después"}
              </span>
            </div>
          </Field>}

          <Field label="Disparador">
            <div style={{
              padding: "9px 12px", border: DS.border, borderRadius: 10,
              background: DS.bgCard, color: DS.textSecondary, fontSize: 13,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>✓</span>
              <span>Cuando la marco como <strong style={{ color: DS.textPrimary }}>completada</strong></span>
            </div>
          </Field>

          <CheckboxRow
            checked={active}
            onChange={setActive}
            label="Repetir indefinidamente"
            sub="Si se desactiva, la recurrencia para después de la próxima."
          />

          <CheckboxRow
            checked={updateToStatus}
            onChange={setUpdateToStatus}
            label="Actualizar estado al crear la siguiente"
            sub="Por defecto la nueva tarea nace en Pendiente."
          />
          {updateToStatus && (
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              style={{ ...darkInput, padding: "9px 12px", fontSize: 13, cursor: "pointer", marginTop: -6 }}
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
            </select>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", gap: 8,
          marginTop: 22, paddingTop: 16, borderTop: DS.border,
        }}>
          {hasInitial ? (
            <button
              onClick={clear}
              style={{
                ...darkBtnGhost,
                padding: "8px 16px", fontSize: 12,
                color: DS.red, borderColor: `${DS.red}55`,
              }}
            >
              Quitar recurrencia
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 12 }}>Cancelar</button>
            <button onClick={save} style={{ ...darkBtn, padding: "8px 20px", fontSize: 12 }}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CheckboxRow({ checked, onChange, label, sub }) {
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
      padding: "8px 10px", borderRadius: 8,
      border: DS.border, background: DS.bgCard,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 600 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </label>
  );
}
