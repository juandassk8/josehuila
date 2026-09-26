import { useState, useMemo, useEffect } from "react";
import { database } from "../lib/backend.js";
import { DS } from "../lib/design.js";
import { initTaskTime } from "./tasks/taskTimeStore.js";
import { RutinaPage } from "./rutina/RutinaPage.jsx";
import { FocusWidget } from "./rutina/FocusWidget.jsx";
import { ThemeProvider, useTheme } from "../lib/theme.jsx";
import { TeamErrorBoundary } from "./TeamErrorBoundary.jsx";
import { TeamLogin } from "./auth/TeamLogin.jsx";
import { useTeamAuth } from "./auth/useTeamAuth.js";
import { resolveUserAccess, slugifyCompany } from "../lib/authAccess.js";
import { useMembers } from "./hooks/useMembers.js";
import { useTasks } from "./hooks/useTasks.js";
import { useSpaces } from "./hooks/useSpaces.js";
import { useCompanies } from "./hooks/useCompanies.js";
import { useRealtimePresence } from "./hooks/useRealtimePresence.js";
import { TeamLayout } from "./layout/TeamLayout.jsx";
import { WarRoom } from "./warroom/WarRoom.jsx";
import { NorthStarPage } from "./northstar/NorthStarPage.jsx";
import { MyTasks } from "./tasks/MyTasks.jsx";
import { MyAgenda } from "./tasks/MyAgenda.jsx";
import { AllTasks } from "./tasks/AllTasks.jsx";
import { SpaceView } from "./tasks/SpaceView.jsx";
import { EmpresasPage } from "./empresas/EmpresasPage.jsx";
import { EquipoPage } from "./equipo/EquipoPage.jsx";
import { SettingsPage } from "./settings/SettingsPage.jsx";
import { ContenidoPage } from "./contenido/ContenidoPage.jsx";
import { GuionesPage } from "./guiones/GuionesPage.jsx";
import { WorkspacePage } from "./workspace/WorkspacePage.jsx";
import { ScorecardPage } from "./scorecard/ScorecardPage.jsx";
import { MasterTrackingPage } from "./tracking/MasterTrackingPage.jsx";
import { TimeTrackerPage } from "./timetrack/TimeTrackerPage.jsx";
import { TrashPage } from "./tasks/TrashPage.jsx";
import { FeedbackPage } from "./feedback/FeedbackPage.jsx";
import { ConceptBankPage } from "./concept_bank/ConceptBankPage.jsx";
import { BandejaPage } from "./inbox/BandejaPage.jsx";
import { AdLibraryPage } from "./ad_library/AdLibraryPage.jsx";
import { CreativeImagesPage } from "./creative_images/CreativeImagesPage.jsx";
import { AdminPlanPage } from "./planimpl/AdminPlanPage.jsx";
import { lazy, Suspense } from "react";
const OnboardingEquipoPage = lazy(() => import("../estandar/OnboardingEquipoPage.jsx").then((m) => ({ default: m.OnboardingEquipoPage })));
const FinancePage = lazy(() => import("./finance/FinancePage.jsx").then((m) => ({ default: m.FinancePage })));
import { useContent } from "./hooks/useContent.js";
import { SpaceModal } from "./spaces/SpaceModal.jsx";
import { createSpace, updateSpace, archiveSpace, deleteSpaceCascade } from "./data/db.js";
import { syncReviewTasks } from "./data/reviewTasks.js";
import { canAccessView, isGuionesReadOnly } from "./lib/permissions.js";
import { usePathRoute } from "../lib/router.jsx";
import { puedeSalir } from "../lib/salidaGuard.js";

export default function TeamApp() {
  return (
    <ThemeProvider>
      <TeamErrorBoundary>
        <TeamAppInner />
      </TeamErrorBoundary>
    </ThemeProvider>
  );
}

// Se renderiza cuando alguien con sesión NO es equipo Inforce activo — porque no
// tiene fila en `team_members` o porque está desactivado. Le buscamos dónde
// trabaja y lo mandamos a /cliente/<slug>.
//
// Si no tiene ninguna empresa, muestra un "sin acceso" genérico: /equipo es área
// privilegiada y no se filtra el email, ni el nombre de la tabla, ni nada.
function RedirectToClientWorkspaceOrLogout({ session, signOut }) {
  const [state, setState] = useState({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) {
          if (!cancelled) setState({ status: "no_access" });
          return;
        }
        // Antes miraba SOLO `companies.owner_user_id`, así que encontraba al
        // dueño de una empresa y a nadie más. Un colaborador —un editor, un
        // trafficker— caía en "sin acceso" y lo único que se le ofrecía era
        // cerrar sesión, aunque tuviera su workspace esperándolo.
        //
        // `resolveUserAccess` es la función que ya reúne las empresas de una
        // persona por las tres vías: dueño, cuenta de cliente y ficha de
        // colaborador. Es la misma que usa la raíz del portal para mandar a cada
        // uno a donde trabaja.
        const access = await resolveUserAccess(session);
        if (cancelled) return;
        const destino = access.companies?.[0];
        if (destino) {
          const slug = slugifyCompany(destino);
          if (slug) {
            window.location.replace(`/cliente/${slug}`);
            return;
          }
        }
        setState({ status: "no_access" });
      } catch {
        if (!cancelled) setState({ status: "no_access" });
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (state.status === "checking") {
    return (
      <div style={{
        background: DS.bg, minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: DS.textMuted, fontFamily: DS.font, fontSize: 12,
        letterSpacing: "0.1em",
      }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{
      background: DS.bg, minHeight: "100vh",
      color: "#fff", fontFamily: DS.font,
      padding: "80px 40px",
    }}>
      <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>Sin acceso a esta sección</h1>
        <p style={{ color: DS.textSecondary, fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
          Tu cuenta no tiene permisos para entrar acá. Si crees que es un error,
          contactá al administrador.
        </p>
        <button
          onClick={signOut}
          style={{
            padding: "10px 22px", borderRadius: 50,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent", color: DS.textSecondary,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function TeamAppInner() {
  const { session, member, loading, error, signIn, signOut, refreshMember } = useTeamAuth();

  if (loading) {
    return (
      <div
        style={{
          background: DS.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: DS.textMuted,
          fontFamily: DS.font,
          fontSize: 12,
          letterSpacing: "0.1em",
        }}
      >
        Verificando sesión…
      </div>
    );
  }

  if (!session) {
    return <TeamLogin onSignIn={signIn} error={error} />;
  }

  if (!member) {
    // `member` es null si no está en `team_members` o si está DESACTIVADO. Las
    // dos cosas significan lo mismo para esta pantalla: acá no trabaja.
    return <RedirectToClientWorkspaceOrLogout session={session} signOut={signOut} />;
  }

  return <TeamWorkspace member={member} signOut={signOut} refreshMember={refreshMember} />;
}

function TeamWorkspace({ member, signOut, refreshMember }) {
  const { isDark } = useTheme(); // consume context to re-render on theme change

  // URL → view. Las views accesibles por URL son las del sidebar principal + space/workspace/scorecard.
  // Hash schemas:
  //   #/warroom · #/agenda · #/contenido · #/guiones · #/tracking · #/equipo · #/trash · #/settings · #/empresas · #/tasks
  //   #/space/<space_id>
  //   #/workspace/<member_id>
  //   #/scorecard/<member_id>
  const { segments, navigate: pushRoute } = usePathRoute({ prefix: "/equipo" });
  const view = segments[0] || "warroom";
  const hashSpaceId = view === "space" ? segments[1] : null;
  const hashWorkspaceMemberId = (view === "workspace" || view === "scorecard") ? segments[1] : null;

  const [spaceModal, setSpaceModal] = useState(null); // { mode: "create"|"edit", space, parentSpaceId }
  const [tasksMemberFilter, setTasksMemberFilter] = useState(null);

  const { members } = useMembers();
  const { tasks } = useTasks();
  const { spaces } = useSpaces(member.id);
  const { companies } = useCompanies();
  const { items: contentItems } = useContent();

  useRealtimePresence(member.id);
  useEffect(() => { initTaskTime(member.id); }, [member.id]);

  // Sync de tareas de revisión al entrar al módulo (una vez por montaje).
  // Backfill: crea tareas agrupadas para todos los slots que YA están en
  // "pide revisión" y cierra las auto-generadas que quedaron huérfanas.
  useEffect(() => {
    syncReviewTasks();
  }, []);

  // Reset filtro de tareas cuando se sale de la vista de tasks
  useEffect(() => {
    if (view !== "tasks") setTasksMemberFilter(null);
  }, [view]);

  // Gating central delegado a lib/permissions.js
  const allowedView = useMemo(() => {
    // workspace/scorecard mantienen lógica especial por requerir workspaceMemberId (vía URL)
    if ((view === "workspace" || view === "scorecard")) {
      if (!hashWorkspaceMemberId) return "warroom";
      const isSelf = hashWorkspaceMemberId === member.id;
      const target = members.find((m) => m.id === hashWorkspaceMemberId);
      // Un admin ve el workspace de miembros/editores (gestión), pero los admin son
      // PARES y no se ven entre sí → protege las tareas personales de cada admin.
      const canAccess = isSelf || (member.role === "admin" && target && target.role !== "admin");
      if (!canAccess) return "warroom";
      return view;
    }
    if (!canAccessView(member, view)) return "warroom";
    return view;
  }, [member, view, hashWorkspaceMemberId, members]);

  // Toda la navegación pasa por acá para que la sección actual pueda frenarla
  // si tiene trabajo a medias — al cambiar de vista se desmonta y lo pierde.
  const irA = (path) => {
    if (puedeSalir(() => pushRoute(path))) pushRoute(path);
  };

  const navigate = (next) => {
    irA("/" + next);
  };

  const openWorkspace = (memberId) => {
    if (memberId !== member.id) {
      // Solo un admin abre workspaces ajenos, y NUNCA el de otro admin (pares).
      const target = members.find((m) => m.id === memberId);
      if (member.role !== "admin" || target?.role === "admin") return;
    }
    irA(`/workspace/${memberId}`);
  };

  const selectSpace = (id) => {
    irA(`/space/${id}`);
  };

  const workspaceMemberId = hashWorkspaceMemberId;
  const currentSpaceId = hashSpaceId;
  const currentSpace = spaces.find((s) => s.id === currentSpaceId);
  const workspaceMember = workspaceMemberId
    ? members.find((m) => m.id === workspaceMemberId)
    : null;

  let content = null;
  if (allowedView === "warroom") {
    content = (
      <WarRoom
        members={members}
        tasks={tasks}
        spaces={spaces}
        companies={companies}
        contentItems={contentItems}
        currentMember={member}
        onOpenWorkspace={openWorkspace}
      />
    );
  } else if (allowedView === "northstar") {
    content = <NorthStarPage />;
  } else if (allowedView === "workspace" && workspaceMember) {
    const isOwnerOfWorkspace = workspaceMember.id === member.id;
    content = (
      <WorkspacePage
        targetMember={workspaceMember}
        currentMember={member}
        tasks={tasks}
        onOpenScorecard={() => pushRoute(`/scorecard/${workspaceMember.id}`)}
        onOpenTracking={() => navigate("tracking")}
        onOpenMyTasks={() => navigate("agenda")}
        onBack={() => navigate("warroom")}
      />
    );
  } else if (allowedView === "scorecard" && workspaceMember) {
    content = (
      <ScorecardPage
        targetMember={workspaceMember}
        currentMember={member}
        onBack={() => pushRoute(`/workspace/${workspaceMember.id}`)}
      />
    );
  } else if (allowedView === "mytasks") {
    content = (
      <MyTasks
        tasks={tasks}
        members={members}
        spaces={spaces}
        companies={companies}
        currentMember={member}
      />
    );
  } else if (allowedView === "agenda") {
    // Si workspaceMember está set y es distinto al admin logueado, mostramos SU agenda.
    const agendaTarget = workspaceMember && workspaceMember.id !== member.id ? workspaceMember : null;
    content = (
      <MyAgenda
        tasks={tasks}
        members={members}
        spaces={spaces}
        companies={companies}
        contentItems={contentItems}
        currentMember={member}
        targetMember={agendaTarget}
        onBack={agendaTarget ? () => navigate("workspace") : null}
      />
    );
  } else if (allowedView === "tasks") {
    content = (
      <AllTasks
        tasks={tasks}
        members={members}
        spaces={spaces}
        companies={companies}
        currentMember={member}
        initialMemberFilter={tasksMemberFilter}
      />
    );
  } else if (allowedView === "empresas") {
    content = (
      <EmpresasPage currentMember={member} />
    );
  } else if (allowedView === "space" && currentSpace) {
    content = (
      <SpaceView
        space={currentSpace}
        tasks={tasks}
        members={members}
        spaces={spaces}
        companies={companies}
        currentMember={member}
      />
    );
  } else if (allowedView === "contenido") {
    content = (
      <ContenidoPage
        items={contentItems}
        members={members}
        currentMember={member}
      />
    );
  } else if (allowedView === "guiones") {
    content = <GuionesPage contentItems={contentItems} readOnly={isGuionesReadOnly(member)} />;
  } else if (allowedView === "tracking") {
    content = (
      <MasterTrackingPage
        companies={companies}
        members={members}
        currentMember={member}
      />
    );
  } else if (allowedView === "rutina") {
    content = <RutinaPage member={member} tasks={tasks} members={members} spaces={spaces} companies={companies} />;
  } else if (allowedView === "tiempo") {
    content = <TimeTrackerPage member={member} />;
  } else if (allowedView === "trash") {
    content = (
      <TrashPage
        spaces={spaces}
        companies={companies}
        members={members}
        currentMember={member}
      />
    );
  } else if (allowedView === "equipo") {
    content = (
      <EquipoPage
        members={members}
        tasks={tasks}
        currentMember={member}
        onRefresh={refreshMember}
      />
    );
  } else if (allowedView === "settings") {
    content = (
      <SettingsPage
        currentMember={member}
        onRefresh={refreshMember}
        onSignOut={signOut}
      />
    );
  } else if (allowedView === "planimpl") {
    content = <AdminPlanPage />;
  } else if (allowedView === "feedback") {
    content = <FeedbackPage currentMember={member} />;
  } else if (allowedView === "banco") {
    content = <ConceptBankPage currentMember={member} />;
  } else if (allowedView === "bandeja") {
    content = <BandejaPage currentMember={member} companies={companies} />;
  } else if (allowedView === "adlibrary") {
    content = <AdLibraryPage currentMember={member} companies={companies} />;
  } else if (allowedView === "crear-imagenes") {
    content = <CreativeImagesPage />;
  } else if (allowedView === "finance") {
    content = (
      <Suspense fallback={<div style={{ padding: 60, color: "#888", fontSize: 12 }}>Cargando Finanzas…</div>}>
        <FinancePage currentMember={member} />
      </Suspense>
    );
  }

  const handleSaveSpace = async (payload) => {
    if (spaceModal?.mode === "edit" && spaceModal.space) {
      await updateSpace(spaceModal.space.id, payload);
    } else {
      await createSpace({ ...payload, owner_id: member.id, sort_order: 999 });
    }
    setSpaceModal(null);
  };

  const handleArchiveSpace = async (id) => {
    if (!confirm("¿Archivar este espacio?")) return;
    await archiveSpace(id);
    if (currentSpaceId === id) navigate("warroom");
  };

  // Eliminar = sacar del panel el espacio + subespacios y mandar sus tareas a
  // la Papelera (recuperables 30 días). Confirmación con conteo claro.
  const handleDeleteSpace = async (id) => {
    const descIds = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of (spaces || [])) {
        if (s.parent_space_id && descIds.has(s.parent_space_id) && !descIds.has(s.id)) {
          descIds.add(s.id);
          grew = true;
        }
      }
    }
    const sp = (spaces || []).find((s) => s.id === id);
    const name = sp?.name || "este espacio";
    const childCount = descIds.size - 1;
    const taskCount = (tasks || []).filter((t) => !t.deleted_at && descIds.has(t.space_id)).length;
    const parts = [];
    if (childCount > 0) parts.push(`${childCount} subespacio${childCount > 1 ? "s" : ""}`);
    if (taskCount > 0) parts.push(`${taskCount} tarea${taskCount > 1 ? "s" : ""} (irán a la Papelera, recuperables 30 días)`);
    const detail = parts.length ? `\n\nSe eliminará junto con ${parts.join(" y ")}.` : "";
    if (!confirm(`¿Eliminar "${name}"?${detail}`)) return;
    const { error } = await deleteSpaceCascade(id, spaces || []);
    if (error) {
      alert("No se pudo eliminar el espacio: " + (error.message || error));
      return;
    }
    if (descIds.has(currentSpaceId)) navigate("warroom");
  };

  // Onboarding de una marca: a pantalla completa y sin el menú del War Room, porque
  // se comparte en la llamada con el cliente mirando.
  if (allowedView === "onboarding" && segments[1]) {
    return (
      <Suspense fallback={null}>
        <OnboardingEquipoPage companyId={decodeURIComponent(segments[1])} member={member} onVolver={() => pushRoute("empresas")} />
      </Suspense>
    );
  }

  return (
    <>
      <TeamLayout
        member={member}
        members={members}
        currentView={allowedView}
        onNavigate={navigate}
        spaces={spaces}
        currentSpaceId={currentSpaceId}
        onSelectSpace={selectSpace}
        onSignOut={signOut}
        onCreateSpace={(parentSpaceId) => setSpaceModal({ mode: "create", parentSpaceId })}
        onEditSpace={(space) => setSpaceModal({ mode: "edit", space })}
        onArchiveSpace={handleArchiveSpace}
        onDeleteSpace={handleDeleteSpace}
      >
        {content}
        <FocusWidget member={member} tasks={tasks} />
      </TeamLayout>
      {spaceModal && (
        <SpaceModal
          space={spaceModal.mode === "edit" ? spaceModal.space : null}
          parentSpaceId={spaceModal.parentSpaceId}
          onSave={handleSaveSpace}
          onClose={() => setSpaceModal(null)}
        />
      )}
    </>
  );
}
