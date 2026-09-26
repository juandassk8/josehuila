import { useEffect, useMemo, useState } from "react";
import { Topbar } from "../layout/Topbar.jsx";
import { BirthdayBanner } from "../layout/BirthdayBanner.jsx";
import { StatCards } from "./StatCards.jsx";
import { TeamStrip } from "./TeamStrip.jsx";
import { OperationsBoard } from "./OperationsBoard.jsx";
import { ContentBoard } from "./ContentBoard.jsx";
import { TaskModal } from "../tasks/TaskModal.jsx";
import { DS } from "../../lib/design.js";
import { visibleTasksFor } from "../lib/permissions.js";
import { isOnlineSince } from "../../lib/dates.js";
import { usePathRoute } from "../../lib/router.jsx";

const TABS = [
  { key: "operations", label: "Operaciones", accent: DS.blue },
  { key: "content",    label: "Contenido",   accent: DS.purple },
];

export function WarRoom({ members, tasks, spaces, companies, contentItems, currentMember, onOpenWorkspace }) {
  const isEditor = currentMember?.role === "editor";
  const storageKey = `warroom:tab:${currentMember?.id || "anon"}`;
  const defaultTab = isEditor ? "content" : "operations";

  // URL: #/warroom/<tab>
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const urlTab = segments[1];
  const isValidTab = TABS.some((t) => t.key === urlTab);

  // Al entrar al war room arrancamos siempre en el default por rol.
  // Los filtros se persisten durante la sesión vía URL, no en localStorage,
  // para que cada refresh/login sea una vista limpia.
  const [fallbackTab, setFallbackTab] = useState(defaultTab);
  const activeTab = isValidTab ? urlTab : fallbackTab;

  const switchTab = (key) => {
    navigate(`/warroom/${key}`);
    setFallbackTab(key);
  };

  // Suprimir warning de unused variables (storageKey ya no se usa).
  void storageKey;

  const tasksForMember = useMemo(
    () => visibleTasksFor(tasks, currentMember),
    [tasks, currentMember]
  );

  const onlineCount = (members || []).filter((m) => isOnlineSince(m.last_seen_at, 5)).length;
  const openCount = tasksForMember.filter((t) => t.status !== "completado").length;

  const [creating, setCreating] = useState(false);
  const [opsFilterOpen, setOpsFilterOpen] = useState(false);

  return (
    <div>
      <div data-tour="war-room-header">
        <Topbar
          title="War Room"
          subtitle="Centro de operaciones"
          actions={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "7px 13px", borderRadius: 999,
                background: "var(--chip)", border: DS.border,
                fontSize: 12, fontWeight: 600, color: DS.textSecondary, letterSpacing: "-0.01em",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: DS.green }} />
                {onlineCount} de {members?.length || 0} en línea
              </span>
              {activeTab === "operations" && (
                <>
                  <button
                    onClick={() => setOpsFilterOpen((v) => !v)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "8px 14px", borderRadius: 11,
                      background: opsFilterOpen ? `${DS.sel}1A` : "transparent",
                      border: opsFilterOpen ? `1px solid ${DS.sel}59` : DS.border,
                      color: opsFilterOpen ? DS.sel : DS.textSecondary,
                      fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                    Mis tareas
                  </button>
                  <button
                    onClick={() => setCreating(true)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "9px 16px", borderRadius: 11, border: "none",
                      background: DS.sel, color: "#fff",
                      fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Nueva tarea
                  </button>
                </>
              )}
            </div>
          }
        />
      </div>
      <BirthdayBanner members={members} currentMemberId={currentMember?.id} />
      <div data-tour="panel-general">
        <StatCards tasks={tasksForMember} members={members} currentMember={currentMember} />
      </div>

      <div data-tour="equipo-activo">
        <TeamStrip
          members={members}
          tasks={tasksForMember}
          currentMemberId={currentMember?.id}
          currentMemberRole={currentMember?.role}
          onOpenWorkspace={onOpenWorkspace}
        />
      </div>

      {/* Tabs Operaciones / Contenido + contador */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        marginBottom: 18, flexWrap: "wrap",
      }}>
        <div style={{
          display: "flex", gap: 4, padding: 4,
          background: DS.bgCard, border: DS.border, borderRadius: 12,
          width: "fit-content",
        }}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                style={{
                  padding: "8px 18px", borderRadius: 9, border: "none",
                  background: active ? DS.bgSide : "transparent",
                  color: active ? DS.textPrimary : DS.textSecondary,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
                  boxShadow: active ? "var(--shadow)" : "none",
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                {t.label}
                {t.key === "content" && isEditor && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em",
                    background: `${DS.purple}26`, color: DS.purple,
                    padding: "2px 7px", borderRadius: 999, lineHeight: 1.2,
                  }}>
                    Tu zona
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        {activeTab === "operations" && (
          <span style={{ fontSize: 12, color: DS.textMuted, letterSpacing: "-0.01em" }}>
            {openCount} tarea{openCount === 1 ? "" : "s"} abierta{openCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {activeTab === "operations" && (
        <div data-tour="panel-operaciones">
          <OperationsBoard
            members={members}
            tasks={tasksForMember}
            spaces={spaces}
            companies={companies}
            currentMember={currentMember}
            filterOpen={opsFilterOpen}
            onNewTask={() => setCreating(true)}
          />
        </div>
      )}
      {activeTab === "content" && (
        <ContentBoard
          items={contentItems}
          members={members}
          currentMember={currentMember}
        />
      )}

      {creating && (
        <TaskModal
          task={null}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      )}
    </div>
  );
}
