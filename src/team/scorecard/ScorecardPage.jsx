import { useState, useMemo } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { WeekSelector } from "./WeekSelector.jsx";
import { ScorecardTable } from "./ScorecardTable.jsx";
import { NotesRow } from "./NotesRow.jsx";
import { weekStartMonday, weekDaysMonToSat } from "../../lib/weeks.js";
import { useScorecard } from "../hooks/useScorecard.js";
import {
  upsertEntry,
  upsertNote,
  createKpi,
  updateKpi,
  archiveKpi,
} from "../data/scorecardDb.js";
import { logger } from "../../lib/logger.js";

export function ScorecardPage({ targetMember, currentMember, onBack }) {
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(new Date()));
  const [notesOpen, setNotesOpen] = useState(false);

  const memberId = targetMember?.id;
  const { kpis, entries, notes, loading } = useScorecard(memberId, weekStart);

  const isAdmin = currentMember?.role === "admin";
  const isOwner = currentMember?.id === memberId;
  const canEdit = isAdmin || isOwner;
  const canEditKpis = isAdmin;

  const accent = targetMember?.color || DS.blue;
  const days = useMemo(() => weekDaysMonToSat(weekStart), [weekStart]);

  const handleSetValue = async ({ kpi_id, date, value }) => {
    const { error } = await upsertEntry({ kpi_id, member_id: memberId, date, value });
    if (error) throw error;
  };

  const handleSaveNote = async ({ date, note }) => {
    const { error } = await upsertNote({ member_id: memberId, date, note });
    if (error) throw error;
  };

  const handleAddKpi = async ({ category, label, sort_order }) => {
    const { error } = await createKpi({ member_id: memberId, category, label, sort_order });
    if (error) throw error;
  };

  const handleUpdateKpi = async (id, patch) => {
    const { error } = await updateKpi(id, patch);
    if (error) throw error;
  };

  const handleArchiveKpi = async (id) => {
    const { error } = await archiveKpi(id);
    if (error) throw error;
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title={`Scorecard — ${targetMember?.name || "…"}`}
        subtitle={isOwner ? "Tu scorecard semanal" : `Scorecard de ${targetMember?.name}`}
        accent={accent}
        actions={
          onBack ? (
            <button
              onClick={onBack}
              style={{
                padding: "6px 14px",
                borderRadius: 50,
                border: `1px solid ${DS.textHint}`,
                background: "transparent",
                color: DS.textSecondary,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: DS.font,
                cursor: "pointer",
              }}
            >
              ← Volver
            </button>
          ) : null
        }
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
        <div style={{ fontSize: 11, color: DS.textMuted, letterSpacing: "0.12em" }}>
          {kpis.length} KPI{kpis.length === 1 ? "" : "s"} · L-S
        </div>
      </div>

      {loading && (
        <div style={{ color: DS.textMuted, fontSize: 12, padding: 24, textAlign: "center" }}>
          Cargando scorecard…
        </div>
      )}

      {!loading && kpis.length === 0 && (
        <EmptyState canEditKpis={canEditKpis} onAddKpi={handleAddKpi} />
      )}

      {!loading && kpis.length > 0 && (
        <>
          <ScorecardTable
            kpis={kpis}
            entries={entries}
            weekStart={weekStart}
            canEdit={canEdit}
            canEditKpis={canEditKpis}
            onSetValue={handleSetValue}
            onUpdateKpi={handleUpdateKpi}
            onArchiveKpi={handleArchiveKpi}
            onAddKpi={handleAddKpi}
          />

          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => setNotesOpen((o) => !o)}
              style={{
                background: "transparent",
                border: "none",
                color: DS.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: DS.font,
                padding: "4px 0",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 10 }}>{notesOpen ? "▼" : "▶"}</span>
              NOTAS DEL DÍA
              <span style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.1em" }}>
                — una por día
              </span>
            </button>
            {notesOpen && (
              <NotesRow
                days={days}
                notes={notes}
                onSave={handleSaveNote}
                disabled={!canEdit}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ canEditKpis, onAddKpi }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("VELOCIDAD");

  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: DS.textPrimary, marginBottom: 6 }}>
        Aún no hay KPIs configurados
      </div>
      <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 20 }}>
        {canEditKpis
          ? "Agrega el primer KPI de este miembro para empezar."
          : "Pídele a José que configure tus KPIs."}
      </div>

      {canEditKpis && !adding && (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: "10px 22px",
            borderRadius: 50,
            border: "none",
            background: DS.green,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: DS.font,
            cursor: "pointer",
          }}
        >
          + Agregar primer KPI
        </button>
      )}

      {canEditKpis && adding && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${DS.textHint}`,
              background: DS.bgSide,
              color: DS.textPrimary,
              fontSize: 12,
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
            value={label}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Texto del KPI"
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${DS.textHint}`,
              background: "transparent",
              color: DS.textPrimary,
              fontSize: 12,
              fontFamily: DS.font,
              minWidth: 260,
              outline: "none",
            }}
          />
          <button
            onClick={async () => {
              if (!label.trim()) return;
              try {
                await onAddKpi({ category, label: label.trim(), sort_order: 1 });
                setLabel("");
                setAdding(false);
              } catch (e) { logger.error(e); }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: DS.green,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: DS.font,
              cursor: "pointer",
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}
