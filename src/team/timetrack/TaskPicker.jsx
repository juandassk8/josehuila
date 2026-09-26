// TaskPicker — popup/modal para elegir qué tarea hacer en el time tracker.
//
// Features:
//   - Modo 'popup' (anclado a un parent) o 'modal' (overlay centrado con backdrop).
//   - Chips de filtro por ESPACIO: si la categoría matchea (por nombre) con
//     un space, muestra el match + sus subspaces. Si no, muestra todos los roots.
//   - Chips de filtro por FECHA: Para hoy / 7 días / Todas.
//   - Quick complete: ✓ a la derecha de cada tarea para marcarla completada
//     sin elegirla (útil para limpiar tareas "ya hechas" olvidadas).
//   - Buscador con autofocus.

import { useEffect, useMemo, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function isOverdue(due) {
  if (!due) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(due) < today;
}
function isToday(due) {
  if (!due) return false;
  const d = new Date(due);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}
function formatDue(due) {
  if (!due) return null;
  try {
    const d = new Date(due);
    const today = new Date();
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return null;
  }
}

const DATE_FILTERS = [
  { key: "today",  label: "Para hoy" },
  { key: "7days",  label: "Próx. 7 días" },
  { key: "all",    label: "Todas" },
];

function matchesDateFilter(task, mode) {
  if (mode === "all") return true;
  const due = task.due_date;
  if (!due) return true; // sin fecha → siempre se muestra
  const dueDate = new Date(due);
  if (mode === "today") {
    // Vencidas hasta 3 días atrás + hoy. Más viejas se asumen olvidadas.
    const minDate = new Date(); minDate.setDate(minDate.getDate() - 3); minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(); maxDate.setHours(23, 59, 59, 999);
    return dueDate >= minDate && dueDate <= maxDate;
  }
  if (mode === "7days") {
    // Vencidas última semana + próx 7 días.
    const minDate = new Date(); minDate.setDate(minDate.getDate() - 7); minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 7); maxDate.setHours(23, 59, 59, 999);
    return dueDate >= minDate && dueDate <= maxDate;
  }
  return true;
}

export function TaskPicker({
  tasks = [],
  currentTaskId = null,
  onPick,
  onClose,
  onCompleteTask,
  onUncompleteTask,
  anchor = "bottom",
  mode = "popup",
  title = null,
  space = null,        // el space activo (root). Si está, los chips se basan en él.
  spaces = [],
  // Legacy compat: si recibe category, lo trata como un space con name.
  category = null,
}) {
  const [query, setQuery] = useState("");
  const [undoTask, setUndoTask] = useState(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // El "scope space" es el space recibido directamente, o uno matcheado por
  // nombre desde category (legacy compat).
  const scopeSpace = useMemo(() => {
    if (space) return space;
    if (category?.name) {
      const cn = norm(category.name);
      return spaces.find((s) => norm(s.name) === cn) || null;
    }
    return null;
  }, [space, category, spaces]);
  const matchedSpace = scopeSpace;

  // Chips de espacio.
  const spaceChips = useMemo(() => {
    const todos = { id: "all", name: "Todos", _kind: "all" };
    if (matchedSpace) {
      const children = spaces.filter((s) => s.parent_space_id === matchedSpace.id);
      return [todos, matchedSpace, ...children];
    }
    const roots = spaces.filter((s) => !s.parent_space_id && s.visibility === "shared");
    return [todos, ...roots];
  }, [matchedSpace, spaces]);

  // Estado: chip de espacio activo. Pre-selecciona matched (root o sub).
  const [selectedSpaceId, setSelectedSpaceId] = useState(matchedSpace?.id || "all");
  useEffect(() => {
    setSelectedSpaceId(matchedSpace?.id || "all");
  }, [matchedSpace?.id]);

  // Chip de fecha activo. Default: hoy + vencidas + sin fecha.
  const [dateFilter, setDateFilter] = useState("today");

  // Descendientes del space seleccionado (BFS por si hay anidación).
  const descendantSet = useMemo(() => {
    if (selectedSpaceId === "all") return null;
    const ids = new Set([selectedSpaceId]);
    const queue = [selectedSpaceId];
    while (queue.length) {
      const id = queue.shift();
      spaces.filter((s) => s.parent_space_id === id).forEach((c) => {
        if (!ids.has(c.id)) { ids.add(c.id); queue.push(c.id); }
      });
    }
    return ids;
  }, [selectedSpaceId, spaces]);

  // Autofocus al buscador.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // ESC cierra + click fuera cierra (popup mode).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    let outsideHandler;
    let timer;
    if (mode === "popup") {
      outsideHandler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          onClose?.();
        }
      };
      timer = setTimeout(() => document.addEventListener("mousedown", outsideHandler), 100);
    }
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (outsideHandler) document.removeEventListener("mousedown", outsideHandler);
      if (timer) clearTimeout(timer);
    };
  }, [onClose, mode]);

  // Filtrado final: espacio + fecha + búsqueda.
  const filtered = useMemo(() => {
    const q = norm(query);
    return tasks.filter((t) => {
      // Espacio: si tiene space_id, filtrar por descendientes; si no (company tasks),
      // pasa cuando selectedSpaceId === "all".
      if (descendantSet) {
        if (!t.space_id) return false;
        if (!descendantSet.has(t.space_id)) return false;
      }
      if (!matchesDateFilter(t, dateFilter)) return false;
      if (q) {
        const hay = `${norm(t.title)} ${norm(t.scope_label)}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, descendantSet, dateFilter, query]);

  const handlePickNone = () => {
    onPick?.({ taskId: null, taskKind: null, taskLabel: null });
    onClose?.();
  };

  const handlePick = (task) => {
    onPick?.({ taskId: task.id, taskKind: task.kind, taskLabel: task.title });
    onClose?.();
  };

  const handleComplete = async (task, e) => {
    e.stopPropagation();
    if (!onCompleteTask) return;
    await onCompleteTask({ taskId: task.id, taskKind: task.kind });
    // Mostrar toast con opción de deshacer 5s.
    setUndoTask({ task, expiresAt: Date.now() + 5000 });
  };

  // Auto-dismiss del undo toast.
  useEffect(() => {
    if (!undoTask) return undefined;
    const t = setTimeout(() => setUndoTask(null), 5000);
    return () => clearTimeout(t);
  }, [undoTask]);

  const handleUndo = async () => {
    if (!undoTask || !onUncompleteTask) return;
    const t = undoTask.task;
    setUndoTask(null);
    await onUncompleteTask({ taskId: t.id, taskKind: t.kind });
  };

  const cardStyle = mode === "modal"
    ? {
        width: 540,
        maxWidth: "calc(100vw - 32px)",
        background: DS.bgSide,
        border: `1px solid ${withAlpha(DS.textHint, "55")}`,
        borderRadius: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        overflow: "hidden",
        fontFamily: DS.font,
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
      }
    : {
        position: "absolute",
        [anchor === "top" ? "bottom" : "top"]: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: anchor === "bottom" ? 8 : 0,
        marginBottom: anchor === "top" ? 8 : 0,
        width: 440,
        maxWidth: "calc(100vw - 32px)",
        background: DS.bgSide,
        border: `1px solid ${withAlpha(DS.textHint, "55")}`,
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
        zIndex: 9999,
        overflow: "hidden",
        fontFamily: DS.font,
      };

  const card = (
    <div ref={containerRef} style={cardStyle}>
      {title && (
        <div style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${withAlpha(DS.textHint, "44")}`,
          fontSize: 14,
          fontWeight: 600,
          color: DS.textPrimary,
          letterSpacing: "-0.005em",
        }}>
          {title}
        </div>
      )}

      {/* Buscador */}
      <div style={{ padding: "12px 14px 10px" }}>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, opacity: 0.5, pointerEvents: "none",
          }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarea…"
            style={{
              width: "100%",
              padding: "10px 14px 10px 34px",
              borderRadius: 10,
              border: `1px solid ${withAlpha(DS.textHint, "55")}`,
              background: withAlpha(DS.textPrimary, "06"),
              color: DS.textPrimary,
              fontSize: 13,
              fontFamily: DS.font,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Chips de filtro (espacio + fecha) */}
      <div style={{
        padding: "0 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {spaceChips.length > 1 && (
          <FilterRow
            label="Espacio"
            options={spaceChips.map((s) => ({ key: s.id, label: s.name }))}
            value={selectedSpaceId}
            onChange={setSelectedSpaceId}
            accent={DS.blue}
          />
        )}
        <FilterRow
          label="Fecha"
          options={DATE_FILTERS.map((f) => ({ key: f.key, label: f.label }))}
          value={dateFilter}
          onChange={setDateFilter}
          accent={DS.purple || DS.blue}
        />
      </div>

      {/* Sin tarea */}
      <button
        onClick={handlePickNone}
        style={{
          width: "100%",
          padding: "11px 18px",
          background: currentTaskId === null ? withAlpha(DS.textHint, "22") : "transparent",
          border: "none",
          borderTop: `1px solid ${withAlpha(DS.textHint, "33")}`,
          borderBottom: `1px solid ${withAlpha(DS.textHint, "33")}`,
          color: DS.textSecondary,
          fontSize: 12,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: DS.font,
          fontWeight: 500,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(DS.textHint, "18"); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = currentTaskId === null ? withAlpha(DS.textHint, "22") : "transparent"; }}
      >
        ○ <span style={{ marginLeft: 4 }}>Sin tarea</span>
        <span style={{ color: DS.textMuted, fontWeight: 400, marginLeft: 6 }}>— sólo categoría</span>
      </button>

      {/* Lista */}
      <div style={{ maxHeight: 440, overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 18px", textAlign: "center", color: DS.textMuted, fontSize: 12, lineHeight: 1.5 }}>
            {tasks.length === 0
              ? "No tienes tareas abiertas. Creá una desde Tareas o el workspace de una empresa."
              : "Ningún resultado con los filtros activos."}
          </div>
        ) : (
          filtered.map((t) => {
            const isActive = t.id === currentTaskId;
            const due = formatDue(t.due_date);
            const overdue = isOverdue(t.due_date);
            const today = isToday(t.due_date);
            return (
              <div
                key={`${t.kind}:${t.id}`}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderBottom: `1px solid ${withAlpha(DS.textHint, "22")}`,
                  background: isActive ? withAlpha(DS.blue, "12") : "transparent",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = withAlpha(DS.textPrimary, "04");
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <button
                  onClick={() => handlePick(t)}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    background: "transparent",
                    border: "none",
                    color: DS.textPrimary,
                    fontSize: 13,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: DS.font,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>📋</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 500,
                      lineHeight: 1.35,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}>
                      {t.assigned && (
                        <span
                          title="Asignada a vos"
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 50,
                            background: "transparent",
                            border: `1px solid ${withAlpha(DS.green, "66")}`,
                            color: DS.green,
                            letterSpacing: "0.06em",
                            flexShrink: 0,
                          }}
                        >
                          MÍA
                        </span>
                      )}
                      <span style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {t.title || "(sin título)"}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: DS.textMuted,
                      marginTop: 3,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}>
                      <span>{t.scope_label}</span>
                      {due && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{
                            color: overdue ? DS.red : (today ? DS.amber : DS.textMuted),
                            fontWeight: overdue || today ? 600 : 400,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}>
                            {overdue ? "⚠️" : "🗓"} {due}
                            {overdue && <span style={{ marginLeft: 2 }}>vencida</span>}
                            {today && <span style={{ marginLeft: 2 }}>hoy</span>}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                {onCompleteTask && (
                  <button
                    onClick={(e) => handleComplete(t, e)}
                    title="Marcar tarea como completada"
                    style={{
                      width: 36,
                      border: "none",
                      borderLeft: `1px solid ${withAlpha(DS.textHint, "22")}`,
                      background: "transparent",
                      color: DS.textMuted,
                      cursor: "pointer",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = withAlpha(DS.green, "18");
                      e.currentTarget.style.color = DS.green;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = DS.textMuted;
                    }}
                  >✓</button>
                )}
              </div>
            );
          })
        )}
      </div>

      {undoTask && (
        <div style={{
          padding: "10px 14px",
          background: withAlpha(DS.green, "18"),
          borderTop: `1px solid ${withAlpha(DS.green, "55")}`,
          color: DS.textPrimary,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span>✓ "{undoTask.task.title}" completada</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={handleUndo}
            style={{
              padding: "4px 12px",
              borderRadius: 50,
              border: `1px solid ${withAlpha(DS.green, "66")}`,
              background: "transparent",
              color: DS.green,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >Deshacer</button>
        </div>
      )}
      <div style={{
        padding: "8px 14px",
        background: withAlpha(DS.textPrimary, "04"),
        fontSize: 10,
        color: DS.textMuted,
        letterSpacing: "0.04em",
        borderTop: `1px solid ${withAlpha(DS.textHint, "33")}`,
        display: "flex",
        gap: 12,
      }}>
        <span>{filtered.length} de {tasks.length} tareas</span>
        <span style={{ flex: 1 }} />
        <span>ESC para cerrar</span>
      </div>
    </div>
  );

  if (mode === "modal") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9990,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
        onClick={onClose}
      >
        <div onClick={(e) => e.stopPropagation()}>{card}</div>
      </div>
    );
  }
  return card;
}

// Row de chips con label a la izquierda, opciones a la derecha. Scroll
// horizontal si excede ancho.
function FilterRow({ label, options, value, onChange, accent }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        color: DS.textMuted,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        minWidth: 56,
      }}>{label}</span>
      <div style={{
        display: "flex",
        gap: 5,
        flex: 1,
        flexWrap: "wrap",
        overflowX: "auto",
      }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              style={{
                padding: "5px 10px",
                borderRadius: 50,
                border: `1px solid ${active ? accent : withAlpha(DS.textHint, "44")}`,
                background: active ? withAlpha(accent, "18") : "transparent",
                color: active ? accent : DS.textSecondary,
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: DS.font,
                whiteSpace: "nowrap",
                transition: "all 0.12s",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
