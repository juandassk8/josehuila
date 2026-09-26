import { useMemo, useState } from "react";
import { DS, darkBtnGhost, darkBtnRed } from "../../lib/design.js";
import { useCompanyTrashedTasks } from "./hooks/useCompanyTrashedTasks.js";
import { restoreTask, hardDeleteTask, emptyTrash } from "./workspace_tasks_db.js";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useCompanyMask } from "../../lib/censor.jsx";

// Papelera scoped por empresa. Auto-limpieza a los 30 días.
export function TrashPage({ companyId, companyName, spaces = [] }) {
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);
  const { trashed, loading } = useCompanyTrashedTasks(companyId);
  const [working, setWorking] = useState(null);

  const spaceMap = useMemo(() => {
    const m = new Map();
    (spaces || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [spaces]);

  const handleRestore = async (id) => {
    setWorking(id);
    await restoreTask(id);
    setWorking(null);
  };

  const handleHardDelete = async (id) => {
    if (!confirm("Eliminar permanentemente. Esta acción no se puede deshacer.")) return;
    setWorking(id);
    await hardDeleteTask(id);
    setWorking(null);
  };

  const handleEmptyTrash = async () => {
    if (!trashed.length) return;
    if (!confirm(`Vaciar papelera: se eliminarán permanentemente ${trashed.length} tarea${trashed.length === 1 ? "" : "s"}. ¿Continuar?`)) return;
    setWorking("all");
    await emptyTrash(companyId);
    setWorking(null);
  };

  return (
    <div style={{ padding: "26px 28px 72px", maxWidth: 1280, margin: "0 auto", fontFamily: DS.font }}>
      {/* Header inline (sin Topbar del team module) */}
      <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 4 }}>
            Papelera · {displayName}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: DS.textPrimary, margin: 0, letterSpacing: "-0.02em" }}>
            🗑 Papelera
          </h1>
          <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 4 }}>
            {trashed.length} tarea{trashed.length === 1 ? "" : "s"} · auto-limpieza a los 30 días
          </div>
        </div>
        {trashed.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            disabled={working === "all"}
            style={{ ...darkBtnRed, padding: "8px 16px", fontSize: 12 }}
          >
            Vaciar papelera
          </button>
        )}
      </div>

      <InfoBanner />

      {loading && (
        <div style={{ color: DS.textMuted, fontSize: 12, padding: "10px 0" }}>Cargando…</div>
      )}

      {!loading && trashed.length === 0 && (
        <div style={{
          padding: 40, textAlign: "center",
          border: DS.border, borderRadius: 12, background: DS.bgCard,
          color: DS.textMuted, fontSize: 13,
        }}>
          La papelera está vacía.
        </div>
      )}

      {trashed.length > 0 && (
        <div style={{
          border: DS.border, borderRadius: 12,
          background: DS.bgCard, overflow: "hidden",
        }}>
          <HeaderRow />
          {trashed.map((t) => (
            <Row
              key={t.id}
              task={t}
              space={spaceMap.get(t.space_id)}
              busy={working === t.id}
              onRestore={() => handleRestore(t.id)}
              onHardDelete={() => handleHardDelete(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InfoBanner() {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 10,
      border: `1px solid ${DS.amber}55`,
      background: `${DS.amber}12`,
      color: DS.textSecondary,
      fontSize: 12,
      marginBottom: 14,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 14 }}>ℹ️</span>
      <span>Las tareas se eliminan <strong style={{ color: DS.textPrimary }}>automáticamente a los 30 días</strong> de entrar a la papelera. Puedes restaurarlas antes de eso.</span>
    </div>
  );
}

function HeaderRow() {
  const cell = {
    fontSize: 10, fontWeight: 700, color: DS.textMuted,
    letterSpacing: "0.14em", textTransform: "uppercase",
    padding: "12px 14px",
  };
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 180px 140px 180px",
      borderBottom: DS.border, background: DS.bgSide,
    }}>
      <div style={cell}>Tarea</div>
      <div style={cell}>Espacio</div>
      <div style={cell}>Eliminada</div>
      <div style={{ ...cell, textAlign: "right" }}>Acciones</div>
    </div>
  );
}

function Row({ task, space, busy, onRestore, onHardDelete }) {
  const when = task.deleted_at
    ? formatDistanceToNow(new Date(task.deleted_at), { addSuffix: true, locale: es })
    : "—";
  const daysLeft = task.deleted_at
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(task.deleted_at).getTime()) / (1000 * 60 * 60 * 24)))
    : 30;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 180px 140px 180px",
      borderBottom: DS.border, alignItems: "center",
      opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ padding: "12px 14px", minWidth: 0 }}>
        <div style={{
          color: DS.textPrimary, fontSize: 13, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title}
        </div>
        {task.description && (
          <div style={{
            color: DS.textMuted, fontSize: 11, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {task.description}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px", color: DS.textSecondary, fontSize: 12 }}>
        {space ? `${space.icon || "📁"} ${space.name}` : <span style={{ color: DS.textMuted }}>—</span>}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ color: DS.textPrimary, fontSize: 12 }}>{when}</div>
        <div style={{ color: daysLeft <= 7 ? DS.amber : DS.textMuted, fontSize: 10, marginTop: 2 }}>
          {daysLeft} día{daysLeft === 1 ? "" : "s"} restante{daysLeft === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onRestore}
          disabled={busy}
          style={{ ...darkBtnGhost, padding: "6px 12px", fontSize: 11 }}
        >
          ↩ Restaurar
        </button>
        <button
          onClick={onHardDelete}
          disabled={busy}
          style={{
            ...darkBtnGhost,
            padding: "6px 12px", fontSize: 11,
            color: DS.red, borderColor: `${DS.red}55`,
          }}
          title="Eliminar permanentemente"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
