import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { ScorecardCell } from "./ScorecardCell.jsx";
import { DAY_LABELS_SHORT, isoDate, weekDaysMonToSat } from "../../lib/weeks.js";
import {
  buildEntryLookup,
  dayHito,
  weeklyHitoPct,
  kpiRowPct,
} from "./scorecardStatus.js";
import { logger } from "../../lib/logger.js";

// Tabla principal del scorecard.
// Props:
//   kpis: [{id, category, label, sort_order}]
//   entries: [{kpi_id, date, value}]  (ya filtrados a la semana)
//   weekStart: Date del lunes
//   canEdit: bool (puede escribir valores — siempre true para member dueño o admin)
//   canEditKpis: bool (puede editar labels y agregar/archivar filas — solo admin)
//   onSetValue({kpi_id, date, value}) → promise
//   onUpdateKpi(id, {label}) → promise
//   onArchiveKpi(id) → promise
//   onAddKpi({category, label, sort_order}) → promise
export function ScorecardTable({
  kpis,
  entries,
  weekStart,
  canEdit,
  canEditKpis,
  onSetValue,
  onUpdateKpi,
  onArchiveKpi,
  onAddKpi,
}) {
  const days = weekDaysMonToSat(weekStart);
  const lookup = useMemo(() => buildEntryLookup(entries), [entries]);

  // Optimistic overlay: { [kpi_id]: { [dateISO]: value } }
  const [overlay, setOverlay] = useState({});

  const getValue = (kpiId, dateStr) => {
    if (overlay[kpiId] && dateStr in overlay[kpiId]) return overlay[kpiId][dateStr];
    return lookup[kpiId]?.[dateStr] ?? null;
  };

  const handleChange = async (kpi, date, next) => {
    const dateStr = isoDate(date);
    // optimistic
    setOverlay((prev) => ({
      ...prev,
      [kpi.id]: { ...(prev[kpi.id] || {}), [dateStr]: next },
    }));
    try {
      await onSetValue({ kpi_id: kpi.id, member_id: kpi.member_id, date: dateStr, value: next });
      // Dejamos el overlay — realtime actualiza `entries` (el lookup), y el overlay
      // ya refleja lo mismo. Evita el flash a null entre el save y el reload.
    } catch (err) {
      logger.error("set value failed", err);
      // revert
      setOverlay((prev) => {
        const copy = { ...prev };
        if (copy[kpi.id]) {
          const inner = { ...copy[kpi.id] };
          delete inner[dateStr];
          if (Object.keys(inner).length === 0) delete copy[kpi.id];
          else copy[kpi.id] = inner;
        }
        return copy;
      });
    }
  };

  // rows for weekly HITO calc
  const dayValues = days.map((d) =>
    kpis.map((k) => getValue(k.id, isoDate(d)))
  );
  const weekPct = weeklyHitoPct(dayValues);

  return (
    <div
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontFamily: DS.font,
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <Th style={{ width: 96 }}>CATEGORÍA</Th>
            <Th style={{ textAlign: "left" }}>KPI / ACCIÓN INNEGOCIABLE</Th>
            {DAY_LABELS_SHORT.map((d, i) => (
              <Th key={d} style={{ width: 60 }}>
                <div>{d}</div>
                <div style={{ fontSize: 9, color: DS.textMuted, marginTop: 2 }}>
                  {days[i].getDate()}
                </div>
              </Th>
            ))}
            <Th style={{ width: 90 }}>% SEMANAL</Th>
            {canEditKpis && <Th style={{ width: 30 }} />}
          </tr>
        </thead>
        <tbody>
          {kpis.map((kpi) => {
            const rowVals = days.map((d) => getValue(kpi.id, isoDate(d)));
            const rowPct = kpiRowPct(rowVals);
            return (
              <tr key={kpi.id}>
                <Td>
                  <CategoryTag category={kpi.category} />
                </Td>
                <Td style={{ textAlign: "left" }}>
                  <KpiLabel
                    kpi={kpi}
                    editable={canEditKpis}
                    onUpdate={onUpdateKpi}
                  />
                </Td>
                {days.map((d) => {
                  const dateStr = isoDate(d);
                  return (
                    <Td key={dateStr} style={{ padding: "6px 4px" }}>
                      <ScorecardCell
                        value={getValue(kpi.id, dateStr)}
                        onChange={(next) => handleChange(kpi, d, next)}
                        disabled={!canEdit}
                      />
                    </Td>
                  );
                })}
                <Td>
                  <PctPill pct={rowPct} />
                </Td>
                {canEditKpis && (
                  <Td style={{ padding: "4px" }}>
                    <button
                      onClick={() => {
                        if (confirm("¿Archivar este KPI? Los valores históricos se conservan.")) {
                          onArchiveKpi(kpi.id);
                        }
                      }}
                      title="Archivar KPI"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: DS.textMuted,
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 4,
                      }}
                    >
                      ×
                    </button>
                  </Td>
                )}
              </tr>
            );
          })}

          {/* HITO row */}
          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
            <Td style={{ fontWeight: 700, color: DS.textPrimary }}>HITO</Td>
            <Td style={{ textAlign: "left", fontSize: 11, color: DS.textSecondary, fontStyle: "italic" }}>
              AUTO-REPORTE — 1 si los 4 KPIs del día son "Sí", 0 si alguno falla
            </Td>
            {days.map((d, i) => {
              const vals = dayValues[i];
              const hasData = vals.some((v) => v !== null);
              const h = hasData ? dayHito(vals) : null;
              return (
                <Td key={isoDate(d)}>
                  <HitoBadge value={h} />
                </Td>
              );
            })}
            <Td>
              <PctPill pct={weekPct} strong />
            </Td>
            {canEditKpis && <Td />}
          </tr>

          {canEditKpis && (
            <tr>
              <Td colSpan={2 + DAY_LABELS_SHORT.length + 1 + 1}>
                <AddKpiButton onAdd={onAddKpi} nextOrder={kpis.length + 1} />
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, style }) {
  return (
    <th
      style={{
        padding: "12px 10px",
        fontSize: 9,
        fontWeight: 700,
        color: DS.textMuted,
        letterSpacing: "0.14em",
        textAlign: "center",
        borderBottom: DS.border,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "10px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        color: DS.textSecondary,
        textAlign: "center",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function CategoryTag({ category }) {
  const palette = {
    VELOCIDAD: DS.blue,
    CALIDAD: DS.green,
    PRESION: DS.amber,
    DATA: DS.purple,
  };
  const accent = palette[category] || DS.textSecondary;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: accent,
        letterSpacing: "0.14em",
        padding: "4px 8px",
        borderRadius: 50,
        background: `${accent}18`,
        border: `1px solid ${accent}40`,
      }}
    >
      {category}
    </span>
  );
}

// Parse "Título — descripción larga" → { title, description }
// Si no tiene " — ", todo es título y descripción queda vacía.
function splitLabel(label) {
  const parts = (label || "").split(/ — /);
  if (parts.length < 2) return { title: label || "", description: "" };
  return { title: parts[0], description: parts.slice(1).join(" — ") };
}

function KpiLabel({ kpi, editable, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const initial = splitLabel(kpi.label);
  const [titleVal, setTitleVal] = useState(initial.title);
  const [descVal, setDescVal] = useState(initial.description);
  const { title, description } = splitLabel(kpi.label);

  const save = async () => {
    setEditing(false);
    const nextLabel = descVal.trim()
      ? `${titleVal.trim()} — ${descVal.trim()}`
      : titleVal.trim();
    if (!titleVal.trim() || nextLabel === kpi.label) {
      setTitleVal(initial.title);
      setDescVal(initial.description);
      return;
    }
    try {
      await onUpdate(kpi.id, { label: nextLabel });
    } catch (e) {
      logger.error(e);
    }
  };

  if (!editable) {
    return (
      <div style={{ textAlign: "left" }}>
        <div style={{ color: DS.textPrimary, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </div>
        {description && (
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 11,
              fontWeight: 400,
              lineHeight: 1.45,
              marginTop: 3,
            }}
          >
            {description}
          </div>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
        <input
          value={titleVal}
          autoFocus
          onChange={(e) => setTitleVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitleVal(initial.title);
              setDescVal(initial.description);
              setEditing(false);
            }
          }}
          placeholder="Título del KPI (corto)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${DS.blue}55`,
            background: "transparent",
            color: DS.textPrimary,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: DS.font,
            outline: "none",
          }}
        />
        <textarea
          value={descVal}
          onChange={(e) => setDescVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitleVal(initial.title);
              setDescVal(initial.description);
              setEditing(false);
            }
          }}
          rows={2}
          placeholder="Descripción (opcional)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${DS.blue}55`,
            background: "transparent",
            color: DS.textSecondary,
            fontSize: 11,
            fontFamily: DS.font,
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: "text",
        padding: "4px 6px",
        borderRadius: 4,
        textAlign: "left",
      }}
      title="Click para editar"
    >
      <div style={{ color: DS.textPrimary, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </div>
      {description && (
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.45,
            marginTop: 3,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
}

function HitoBadge({ value }) {
  if (value === null || value === undefined) {
    return <span style={{ color: DS.textMuted, fontSize: 14 }}>—</span>;
  }
  const color = value === 1 ? DS.green : DS.red;
  return (
    <span
      style={{
        display: "inline-flex",
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: `${color}22`,
        color,
        fontWeight: 800,
        fontSize: 13,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {value}
    </span>
  );
}

function PctPill({ pct, strong }) {
  const color =
    pct >= 80 ? DS.green : pct >= 50 ? DS.amber : pct > 0 ? DS.red : DS.textMuted;
  return (
    <span
      style={{
        fontSize: strong ? 13 : 12,
        fontWeight: strong ? 800 : 700,
        color,
        padding: "4px 10px",
        borderRadius: 50,
        background: `${color}18`,
        border: `1px solid ${color}30`,
      }}
    >
      {pct}%
    </span>
  );
}

function AddKpiButton({ onAdd, nextOrder }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("VELOCIDAD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("VELOCIDAD");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: `1px dashed ${DS.textHint}`,
          color: DS.textSecondary,
          padding: "8px 14px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          fontFamily: DS.font,
          fontWeight: 600,
        }}
      >
        + Agregar KPI
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left", padding: "6px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${DS.textHint}`,
            background: DS.bgSide,
            color: DS.textPrimary,
            fontSize: 11,
            fontFamily: DS.font,
          }}
        >
          <option value="VELOCIDAD">VELOCIDAD</option>
          <option value="CALIDAD">CALIDAD</option>
          <option value="PRESION">PRESIÓN</option>
          <option value="DATA">DATA</option>
          <option value="OTRO">OTRO</option>
        </select>
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título corto del KPI"
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${DS.textHint}`,
            background: "transparent",
            color: DS.textPrimary,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: DS.font,
            outline: "none",
            minWidth: 280,
          }}
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción (opcional)"
        rows={2}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 10px",
          borderRadius: 6,
          border: `1px solid ${DS.textHint}`,
          background: "transparent",
          color: DS.textSecondary,
          fontSize: 11,
          fontFamily: DS.font,
          outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={reset}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: `1px solid ${DS.textHint}`,
            background: "transparent",
            color: DS.textMuted,
            fontSize: 11,
            fontFamily: DS.font,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={async () => {
            if (!title.trim()) return;
            const label = description.trim()
              ? `${title.trim()} — ${description.trim()}`
              : title.trim();
            try {
              await onAdd({ category, label, sort_order: nextOrder });
              reset();
            } catch (e) { logger.error(e); }
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: DS.green,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: DS.font,
            cursor: "pointer",
          }}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
