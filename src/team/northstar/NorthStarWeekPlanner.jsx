import { useState } from "react";
import { DS } from "../../lib/design.js";
import { upsertWeek, currentIsoWeek, isoWeekRange } from "./db.js";

const DAY_KEYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
];

const STATUS_OPTS = [
  { key: "", label: "—", color: DS.textMuted },
  { key: "done", label: "✓ Hecho", color: DS.green },
  { key: "partial", label: "○ Parcial", color: DS.amber },
  { key: "blocked", label: "✗ Bloqueado", color: DS.red },
];

// Planificador semanal completo: 3 focos con sub-items + goals,
// lista de action items por foco, bitácora diaria Lun-Vie, retro.
export function NorthStarWeekPlanner({ year, weekIso, month, data, onChangeWeek, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const isCurrentWeek = weekIso === currentIsoWeek();
  const range = isoWeekRange(year, weekIso);

  const persist = async (patch) => {
    setSaving(true);
    const next = await upsertWeek({
      year, week_iso: weekIso, month: month || null,
      ...data, ...patch,
    });
    if (next) onUpdate(next);
    setSaving(false);
  };

  if (!data) {
    return (
      <div style={{ padding: 16, borderRadius: 14, background: DS.bgCard, border: DS.border, color: DS.textMuted, fontSize: 12 }}>
        No hay semana cargada.
      </div>
    );
  }

  const focos = data.focos || [];

  const updateFoco = (focoIdx, patch) => {
    const next = focos.map((f, i) => i === focoIdx ? { ...f, ...patch } : f);
    persist({ focos: next });
  };

  const toggleFocoItem = (focoIdx, itemIdx) => {
    const items = (focos[focoIdx].items || []).map((it, i) =>
      i === itemIdx ? { ...it, done: !it.done } : it
    );
    updateFoco(focoIdx, { items });
  };

  const addFocoItem = (focoIdx, text) => {
    if (!text.trim()) return;
    const items = [...(focos[focoIdx].items || []), { text: text.trim(), done: false }];
    updateFoco(focoIdx, { items });
  };

  const deleteFocoItem = (focoIdx, itemIdx) => {
    const items = (focos[focoIdx].items || []).filter((_, i) => i !== itemIdx);
    updateFoco(focoIdx, { items });
  };

  const updateGoal = (focoIdx, goalIdx, field, value) => {
    const goals = (focos[focoIdx].goals || []).map((g, i) =>
      i === goalIdx ? { ...g, [field]: value } : g
    );
    updateFoco(focoIdx, { goals });
  };

  const updatePulse = (dayKey, field, value) => {
    const pulse = { ...(data.daily_pulse || {}), [dayKey]: { ...(data.daily_pulse?.[dayKey] || {}), [field]: value } };
    persist({ daily_pulse: pulse });
  };

  const updateRetro = (field, value) => {
    persist({ retro: { ...(data.retro || {}), [field]: value } });
  };

  return (
    <div style={{ borderRadius: 14, background: DS.bgCard, border: DS.border, padding: "16px 18px" }}>
      {/* Header con navegación de semana */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
            🚀 PLANIFICADOR SEMANAL
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: DS.textPrimary, marginTop: 2 }}>
            Semana {weekIso}
            {isCurrentWeek && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 50, background: DS.green, color: "#06060A", marginLeft: 8, letterSpacing: "0.05em" }}>ACTUAL</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, marginLeft: 10 }}>
              {range.from.getDate()}–{range.to.getDate()} de {monthShort(range.from)}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onChangeWeek(weekIso - 1)} style={navBtn}>← Sem {weekIso - 1}</button>
          {!isCurrentWeek && <button onClick={() => onChangeWeek(currentIsoWeek())} style={{ ...navBtn, background: DS.purple, color: "#fff", border: "none" }}>Hoy</button>}
          <button onClick={() => onChangeWeek(weekIso + 1)} style={navBtn}>Sem {weekIso + 1} →</button>
        </div>
      </div>

      {/* Title editable */}
      <input
        defaultValue={data.title || ""}
        onBlur={(e) => persist({ title: e.target.value })}
        placeholder="Título o lema de la semana…"
        style={{ ...inputStyle, marginBottom: 16, fontSize: 13, fontWeight: 600 }}
      />

      {/* 3 Focos */}
      <SectionTitle>🎯 Las 3 Rocas</SectionTitle>
      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {focos.map((foco, focoIdx) => (
          <FocoBlock
            key={foco.key || focoIdx}
            foco={foco}
            onUpdateField={(field, value) => updateFoco(focoIdx, { [field]: value })}
            onToggleItem={(i) => toggleFocoItem(focoIdx, i)}
            onAddItem={(t) => addFocoItem(focoIdx, t)}
            onDeleteItem={(i) => deleteFocoItem(focoIdx, i)}
            onUpdateGoal={(gi, f, v) => updateGoal(focoIdx, gi, f, v)}
          />
        ))}
      </div>

      {/* Bitácora diaria */}
      <SectionTitle>📅 Bitácora Diaria (The Pulse)</SectionTitle>
      <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
        {DAY_KEYS.map((day) => {
          const entry = data.daily_pulse?.[day.key] || {};
          const statusMeta = STATUS_OPTS.find((s) => s.key === (entry.status || "")) || STATUS_OPTS[0];
          return (
            <div key={day.key} style={{
              display: "grid", gridTemplateColumns: "100px 1fr 130px", gap: 8,
              padding: "8px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.02)", border: DS.border,
              alignItems: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: DS.textPrimary }}>{day.label}</div>
              <input
                defaultValue={entry.priority || ""}
                onBlur={(e) => updatePulse(day.key, "priority", e.target.value)}
                placeholder="Prioridad del día…"
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }}
              />
              <select
                value={entry.status || ""}
                onChange={(e) => updatePulse(day.key, "status", e.target.value)}
                style={{
                  padding: "5px 10px", borderRadius: 6,
                  border: DS.border, background: "rgba(255,255,255,0.02)",
                  color: statusMeta.color, fontSize: 11, fontWeight: 600,
                  fontFamily: DS.font, outline: "none", cursor: "pointer",
                }}
              >
                {STATUS_OPTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {/* Retrospectiva */}
      <SectionTitle>🔄 Retrospectiva (Fin de Semana)</SectionTitle>
      <div style={{ display: "grid", gap: 8 }}>
        <RetroBlock
          label="¿Qué funcionó mejor esta semana?"
          color={DS.green}
          value={data.retro?.what_worked || ""}
          onSave={(v) => updateRetro("what_worked", v)}
        />
        <RetroBlock
          label="¿Qué me detuvo / cuello de botella?"
          color={DS.red}
          value={data.retro?.blocker || ""}
          onSave={(v) => updateRetro("blocker", v)}
        />
        <RetroBlock
          label="Ajuste para la próxima semana"
          color={DS.blue}
          value={data.retro?.adjustment || ""}
          onSave={(v) => updateRetro("adjustment", v)}
        />
      </div>

      {saving && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 10 }}>Guardando…</div>}
    </div>
  );
}

function FocoBlock({ foco, onUpdateField, onToggleItem, onAddItem, onDeleteItem, onUpdateGoal }) {
  const [newItem, setNewItem] = useState("");
  const accent = foco.key === "marca" ? DS.purple
               : foco.key === "agencia" ? DS.blue
               : DS.green;

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${accent}33`,
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <input
          defaultValue={foco.label || ""}
          onBlur={(e) => onUpdateField("label", e.target.value)}
          style={{ ...inputStyle, fontSize: 13, fontWeight: 700, color: accent, padding: "4px 6px", border: "none", background: "transparent" }}
        />
      </div>
      <textarea
        defaultValue={foco.description || ""}
        onBlur={(e) => onUpdateField("description", e.target.value)}
        placeholder="Descripción del foco…"
        rows={2}
        style={{ ...inputStyle, marginBottom: 10, fontSize: 12, lineHeight: 1.4 }}
      />

      {/* Sub-items checkables */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {(foco.items || []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <input
              type="checkbox"
              checked={!!item.done}
              onChange={() => onToggleItem(i)}
              style={{ cursor: "pointer" }}
            />
            <span style={{
              flex: 1, fontSize: 12,
              color: item.done ? DS.textMuted : DS.textPrimary,
              textDecoration: item.done ? "line-through" : "none",
            }}>
              {item.text}
            </span>
            <button
              onClick={() => onDeleteItem(i)}
              title="Eliminar"
              style={{ background: "transparent", border: "none", color: DS.textMuted, cursor: "pointer", fontSize: 12, padding: "0 4px" }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAddItem(newItem);
                setNewItem("");
              }
            }}
            placeholder="+ Agregar acción…"
            style={{ ...inputStyle, flex: 1, fontSize: 11 }}
          />
        </div>
      </div>

      {/* Goals */}
      {(foco.goals || []).length > 0 && (
        <div style={{ display: "grid", gap: 6, paddingTop: 8, borderTop: DS.border }}>
          {(foco.goals || []).map((goal, gi) => {
            const pct = goal.target > 0 ? Math.min(100, Math.round((goal.actual / goal.target) * 100)) : 0;
            return (
              <div key={gi} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 60px", gap: 6, alignItems: "center" }}>
                <input
                  defaultValue={goal.label || ""}
                  onBlur={(e) => onUpdateGoal(gi, "label", e.target.value)}
                  style={{ ...inputStyle, fontSize: 11, padding: "4px 8px" }}
                />
                <input
                  type="number"
                  defaultValue={goal.actual || 0}
                  onBlur={(e) => onUpdateGoal(gi, "actual", Number(e.target.value) || 0)}
                  style={{ ...inputStyle, fontSize: 11, padding: "4px 8px", textAlign: "right" }}
                />
                <input
                  type="number"
                  defaultValue={goal.target || 0}
                  onBlur={(e) => onUpdateGoal(gi, "target", Number(e.target.value) || 0)}
                  style={{ ...inputStyle, fontSize: 11, padding: "4px 8px", textAlign: "right" }}
                />
                <div style={{ fontSize: 11, fontWeight: 700, color: pct >= 80 ? DS.green : pct >= 40 ? DS.amber : DS.red, textAlign: "right" }}>
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RetroBlock({ label, color, value, onSave }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </div>
      <textarea
        defaultValue={value}
        onBlur={(e) => onSave(e.target.value)}
        rows={2}
        style={{ ...inputStyle, fontSize: 12, lineHeight: 1.4, resize: "vertical" }}
      />
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: DS.textMuted,
      letterSpacing: "0.14em", marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function monthShort(date) {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][date.getMonth()];
}

const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: DS.border, background: "rgba(255,255,255,0.02)",
  color: DS.textPrimary, fontSize: 12,
  fontFamily: DS.font, outline: "none", boxSizing: "border-box",
};

const navBtn = {
  padding: "5px 11px", borderRadius: 50,
  border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 11, fontWeight: 600,
  cursor: "pointer", fontFamily: DS.font,
};
