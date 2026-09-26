import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { WeekSelector } from "../scorecard/WeekSelector.jsx";
import { ClientTrackingBlock } from "./ClientTrackingBlock.jsx";
import { ContenidoCellModal } from "./ContenidoCellModal.jsx";
import { PerformanceReportModal } from "./PerformanceReportModal.jsx";
import { SlaModal } from "./SlaModal.jsx";
import { useMasterTracking } from "../hooks/useMasterTracking.js";
import { weekStartMonday, weekDaysMonToSat, isoDate } from "../../lib/weeks.js";
import {
  createContentMilestone,
  updateContentMilestone,
  deleteContentMilestone,
  upsertPerformanceReport,
  deletePerformanceReport,
  createSlaItem,
  updateSlaItem,
  deleteSlaItem,
} from "../data/trackingDb.js";
import { usePathRoute } from "../../lib/router.jsx";

export function MasterTrackingPage({ companies, members, currentMember }) {
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(new Date()));
  // Por defecto, ocultamos empresas archivadas. El toggle "Archivadas (N)"
  // junto al ViewToggle las desoculta — útil cuando hay que revisar el
  // tracking histórico de una empresa que ya no está activa.
  const [showArchivedCompanies, setShowArchivedCompanies] = useState(false);
  const filterableCompanies = useMemo(
    () => (showArchivedCompanies ? companies : (companies || []).filter((c) => !c.archived)),
    [companies, showArchivedCompanies]
  );
  const archivedCompaniesCount = useMemo(
    () => (companies || []).filter((c) => !!c.archived).length,
    [companies]
  );

  // URL: #/tracking/all  o  #/tracking/single/<companyId>
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const urlMode = segments[1];
  const viewMode = urlMode === "single" ? "single" : "all";
  const selectedCompanyId =
    viewMode === "single" && segments[2]
      ? segments[2]
      : (companies?.[0]?.id || null);
  const setViewMode = (mode) => {
    if (mode === "single") {
      const id = selectedCompanyId || companies?.[0]?.id;
      navigate(id ? `/tracking/single/${id}` : "/tracking/single");
    } else {
      navigate("/tracking/all");
    }
  };
  const setSelectedCompanyId = (id) => {
    navigate(`/tracking/single/${id}`);
  };

  const [milestoneModal, setMilestoneModal] = useState(null); // { mode, milestone?, category?, day_of_week?, date?, company }
  const [reportModal, setReportModal] = useState(null);       // { date, type, report, company }
  const [slaModal, setSlaModal] = useState(null);             // { date, items, company }

  const days = useMemo(() => weekDaysMonToSat(weekStart), [weekStart]);
  const { milestones, reports, sla, loading } = useMasterTracking(weekStart);

  // Defaults de owner: Nat para contenido, Deison para performance.
  const contentOwnerId = useMemo(
    () => members?.find((m) => /nat/i.test(m.name))?.id || null,
    [members]
  );
  const perfOwnerId = useMemo(
    () => members?.find((m) => /de[iy]son/i.test(m.name))?.id || null,
    [members]
  );

  const visibleCompanies = useMemo(() => {
    if (viewMode === "single" && selectedCompanyId) {
      // En single mode permitimos elegir archivadas si el usuario las
      // seleccionó manualmente, aunque el toggle esté en "ocultar".
      return (companies || []).filter((c) => c.id === selectedCompanyId);
    }
    return filterableCompanies;
  }, [companies, filterableCompanies, viewMode, selectedCompanyId]);

  // ----- handlers -----
  const handleOpenMilestone = (ctx) => {
    setMilestoneModal(ctx);
  };

  const handleSaveMilestone = async (payload) => {
    if (milestoneModal.mode === "edit" && milestoneModal.milestone) {
      await updateContentMilestone(milestoneModal.milestone.id, payload);
    } else {
      await createContentMilestone({
        company_id: String(milestoneModal.company.id),
        week_start: isoDate(weekStart),
        day_of_week: milestoneModal.day_of_week,
        category: milestoneModal.category,
        ...payload,
      });
    }
  };

  const handleDeleteMilestone = async () => {
    if (milestoneModal?.milestone?.id) {
      await deleteContentMilestone(milestoneModal.milestone.id);
    }
  };

  const handleOpenReport = (ctx) => setReportModal(ctx);

  const handleSaveReport = async (payload) => {
    await upsertPerformanceReport({
      ...payload,
      company_id: String(reportModal.company.id),
    });
  };

  const handleDeleteReport = async (id) => {
    await deletePerformanceReport(id);
  };

  const handleOpenSla = (ctx) => setSlaModal(ctx);

  const handleUpsertSlaNote = async ({ id, day_date, question, owner_id }) => {
    if (!question) {
      // texto vacío → si existía, borrar
      if (id) await deleteSlaItem(id);
      return;
    }
    if (id) {
      await updateSlaItem(id, { question, owner_id });
    } else {
      await createSlaItem({
        company_id: String(slaModal.company.id),
        day_date,
        question,
        owner_id,
      });
    }
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title="Master Tracking"
        subtitle={`${filterableCompanies.length} empresas · vista semanal`}
        accent={DS.purple}
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            {viewMode === "single" && (
              <select
                value={selectedCompanyId || ""}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                style={{
                  padding: "6px 12px", borderRadius: 50,
                  background: DS.bgCard, border: DS.border,
                  color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
                }}
              >
                {(showArchivedCompanies ? companies : filterableCompanies).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.archived ? " · archivada" : ""}
                  </option>
                ))}
              </select>
            )}
            {archivedCompaniesCount > 0 && (
              <button
                onClick={() => setShowArchivedCompanies((v) => !v)}
                style={{
                  padding: "5px 14px", borderRadius: 50, border: "none",
                  background: showArchivedCompanies ? "rgba(255,255,255,0.07)" : "transparent",
                  color: showArchivedCompanies ? DS.textPrimary : DS.textMuted,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}
              >
                {showArchivedCompanies ? "▾" : "▸"} Archivadas ({archivedCompaniesCount})
              </button>
            )}
            <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
          </div>
        }
      />

      {loading && (
        <div style={{ color: DS.textMuted, fontSize: 12, padding: "8px 0 16px" }}>
          Cargando…
        </div>
      )}

      {!loading && visibleCompanies.length === 0 && (
        <div style={{ color: DS.textMuted, fontSize: 13, padding: 20, textAlign: "center" }}>
          No hay empresas para mostrar.
        </div>
      )}

      {visibleCompanies.map((c) => (
        <ClientTrackingBlock
          key={c.id}
          company={c}
          days={days}
          milestones={milestones}
          reports={reports}
          sla={sla}
          initiallyExpanded={viewMode === "single" || visibleCompanies.length <= 3}
          onOpenMilestone={handleOpenMilestone}
          onOpenReport={handleOpenReport}
          onOpenSla={handleOpenSla}
        />
      ))}

      {milestoneModal && (
        <ContenidoCellModal
          mode={milestoneModal.mode}
          milestone={milestoneModal.milestone}
          category={milestoneModal.category}
          dayOfWeek={milestoneModal.day_of_week}
          companyName={milestoneModal.company?.name}
          members={members}
          currentMember={currentMember}
          defaultOwnerId={contentOwnerId}
          onSave={handleSaveMilestone}
          onDelete={handleDeleteMilestone}
          onClose={() => setMilestoneModal(null)}
        />
      )}

      {reportModal && (
        <PerformanceReportModal
          report={reportModal.report}
          date={reportModal.date}
          type={reportModal.type}
          company={reportModal.company}
          companyName={reportModal.company?.name}
          currentMember={currentMember}
          defaultOwnerId={perfOwnerId}
          onSave={handleSaveReport}
          onDelete={handleDeleteReport}
          onClose={() => setReportModal(null)}
        />
      )}

      {slaModal && (
        <SlaModal
          date={slaModal.date}
          items={slaModal.items}
          companyName={slaModal.company?.name}
          currentMember={currentMember}
          defaultOwnerId={perfOwnerId}
          onUpsertNote={handleUpsertSlaNote}
          onClose={() => setSlaModal(null)}
        />
      )}
    </div>
  );
}

function ViewToggle({ mode, onChange }) {
  const opts = [
    { key: "all", label: "Todos" },
    { key: "single", label: "Cliente único" },
  ];
  return (
    <div style={{ display: "flex", background: DS.bgCard, border: DS.border, borderRadius: 50, padding: 3 }}>
      {opts.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "5px 14px",
              borderRadius: 50,
              border: "none",
              background: active ? DS.purple : "transparent",
              color: active ? "#fff" : DS.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
