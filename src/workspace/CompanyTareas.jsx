import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useCompanyMask } from "../lib/censor.jsx";
import { listTeamMembers } from "./team_db.js";
import { toast } from "../lib/toast.js";
import { TasksCenter } from "./tasks/TasksCenter.jsx";
import { TaskCenterModal } from "./tasks/TaskCenterModal.jsx";
import { SpaceManager } from "./tasks/SpaceManager.jsx";
import { toTask } from "./tasks/centerModel.js";
import { createTask, updateTask, deleteTask, replaceAssignees } from "./tasks/workspace_tasks_db.js";
import { useTareasData } from "./tasks/TareasDataContext.jsx";

// Página de Tareas por empresa — el Centro de Tareas.
//
// Acá viven los datos y las escrituras; `TasksCenter` solo pinta. Los datos
// llegan del TareasDataContext, que es el mismo que consume la sección de
// espacios del sidebar, así que el espacio activo sigue acotando el tablero
// (el sidebar no cambia).

export function CompanyTareas({ companyId, companyName, isAdmin = false, currentMember, onAbrirPipeline }) {
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);

  const data = useTareasData();
  const rows = data?.tasks || [];
  const reload = data?.reload;
  const loading = data?.loading ?? true;
  const spaces = data?.spaces || [];
  const reloadSpaces = data?.reloadSpaces;
  const activeSpaceId = data?.activeSpaceId ?? null;
  const showSpaceMgr = data?.showSpaceMgr || false;
  const mgrInitialEditId = data?.mgrInitialEditId || null;
  const mgrInitialNewParentId = data?.mgrInitialNewParentId || null;
  const closeManager = data?.closeManager;

  const [members, setMembers] = useState([]);
  // Pintado optimista del arrastre: { [taskId]: {status|due_date} }. Se limpia
  // cuando la recarga trae la fila ya con el valor nuevo.
  const [optimista, setOptimista] = useState({});
  const [editing, setEditing] = useState(null);   // tarea abierta
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await listTeamMembers(companyId);
        if (!cancelled) setMembers((raw || []).map((m) => ({ ...m, color: m.avatar_color || DS.blue })));
      } catch { /* sin equipo cargado el tablero igual funciona */ }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members],
  );

  // El espacio activo del sidebar acota el tablero, igual que antes.
  const tasks = useMemo(() => {
    const base = activeSpaceId === "none"
      ? rows.filter((r) => !r.space_id)
      : activeSpaceId ? rows.filter((r) => r.space_id === activeSpaceId) : rows;
    return base.map((r) => toTask({ ...r, ...(optimista[r.id] || {}) }, membersById));
  }, [rows, activeSpaceId, membersById, optimista]);

  // Arrastrar tiene que sentirse inmediato: se pinta primero y se confirma
  // después. Y se RECARGA a mano — el realtime de `company_tasks` no está
  // entregando, y confiar solo en él era la razón por la que nada "se guardaba".
  const patch = async (id, p) => {
    setOptimista((o) => ({ ...o, [id]: { ...(o[id] || {}), ...p } }));
    const { error } = await updateTask(id, p);
    if (error) {
      toast("No se pudo guardar el cambio", "error");
      setOptimista((o) => { const n = { ...o }; delete n[id]; return n; });
      return;
    }
    await reload?.();
    setOptimista((o) => { const n = { ...o }; delete n[id]; return n; });
  };

  const guardar = async (form) => {
    const payload = {
      title: form.titulo.trim(),
      description: form.nota || null,
      status: form.estado,
      priority: form.prio,
      due_date: form.fecha || null,
      space_id: form.spaceId || null,
    };
    try {
      if (editing) {
        const { error } = await updateTask(editing.id, payload);
        if (error) throw error;
        // Los demás asignados se conservan: solo se reemplaza el primero.
        const resto = (editing.asignados || []).slice(1);
        const nuevos = form.who ? [form.who, ...resto.filter((x) => x !== form.who)] : resto;
        await replaceAssignees(editing.id, nuevos);
      } else {
        const { error } = await createTask(companyId, payload, form.who ? [form.who] : []);
        if (error) throw error;
      }
      await reload?.();
      cerrar();
    } catch (e) {
      toast(e?.message || "No se pudo guardar la tarea", "error");
    }
  };

  // Borrar una tarea es de quien la tiene o de quien gestiona la cuenta. Antes
  // cualquiera con acceso a Tareas podía borrar la de cualquiera.
  const puedeBorrar = (t) => {
    if (isAdmin) return true;
    const yo = currentMember?.id;
    if (!yo) return false;
    return (t?.asignados || []).includes(yo) || t?.who === yo;
  };

  const eliminar = async (t) => {
    if (!puedeBorrar(t)) { toast("Esta tarea no es tuya", "error"); return; }
    const { error } = await deleteTask(t.id);
    if (error) { toast("No se pudo eliminar", "error"); return; }
    await reload?.();
    toast("Tarea enviada a la papelera", "success");
    cerrar();
  };

  const cerrar = () => { setEditing(null); setCreating(false); };

  // `nombreEmpresa` va SIN enmascarar a propósito: sirve para reconocer la fila
  // de `company_team_members` que representa a la empresa y no a una persona.
  // El nombre enmascarado solo sirve para mostrar.
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      {loading ? (
        <div style={{ padding: 28, fontSize: 13, color: "var(--ink-4)", fontFamily: DS.font }}>Cargando tareas…</div>
      ) : (
        <TasksCenter
          /* Vuelve a montar cuando se resuelve quién sos. Las preferencias se
             leen UNA vez al montar y están guardadas por persona: sin esto, el
             primer render —que ocurre antes de saber quién entró— las leería de
             la llave anónima y al recargar no se restauraría ni "Mías" ni el
             último filtro de fecha. */
          key={currentMember?.id || "anon"}
          companyId={companyId}
          companyName={displayName}
          nombreEmpresa={companyName}
          members={members}
          tasks={tasks}
          currentMember={currentMember}
          onOpenTask={setEditing}
          onNewTask={() => setCreating(true)}
          onPatch={patch}
        />
      )}

      {(editing || creating) && (
        <TaskCenterModal
          task={editing}
          companyName={displayName}
          members={members}
          spaces={spaces}
          defaultSpaceId={activeSpaceId && activeSpaceId !== "none" ? activeSpaceId : ""}
          onSave={guardar}
          /* Sin permiso ni se ofrece: mostrar el botón y después negarlo es peor
             que no mostrarlo. */
          onDelete={editing && puedeBorrar(editing) ? eliminar : null}
          onClose={cerrar}
          onAbrirPipeline={onAbrirPipeline && ((briefId, etapa) => { cerrar(); onAbrirPipeline(briefId, etapa); })}
        />
      )}

      {showSpaceMgr && (
        <SpaceManager
          companyId={companyId}
          spaces={spaces}
          onReload={reloadSpaces}
          initialEditId={mgrInitialEditId}
          initialNewParentId={mgrInitialNewParentId}
          onClose={closeManager}
        />
      )}
    </div>
  );
}
