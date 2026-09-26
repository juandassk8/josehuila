import { useState } from "react";
import { Topbar } from "../layout/Topbar.jsx";
import { TasksBoard } from "./TasksBoard.jsx";
import { TaskModal } from "./TaskModal.jsx";

export function MyTasks({ tasks, members, spaces, companies, currentMember }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const myTasks = (tasks || []).filter(
    (t) => (t.assigneeIds || []).includes(currentMember?.id) || t.created_by === currentMember?.id
  );

  return (
    <div>
      <Topbar title="Mis tareas" subtitle={`${myTasks.length} en total`} accent={currentMember?.color} />
      <TasksBoard
        tasks={myTasks}
        members={members}
        spaces={spaces}
        companies={companies}
        currentMember={currentMember}
        onOpenTask={setEditing}
        onCreate={() => setCreating(true)}
        title="Mi operations board"
        emptyHint="Nada asignado a ti. Respira 🌿"
      />
      {(editing || creating) && (
        <TaskModal
          task={editing}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
