import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { ESTADOS, PRIOS, ESTADO_BY_KEY, PRIO_BY_KEY, normalizePrio, dayKey, shortDay } from "./centerModel.js";
import { DateCalendar } from "./DateCalendar.jsx";
import { listAutoTaskSlots, setSlotDone, refrescarAvance, agruparPorConcepto, etiquetaItem } from "./autoTaskItems.js";
import { buildSpaceTree, flattenTree } from "./spacesTree.js";

// Modal de tarea — el mismo para crear y para editar.
//
// Cinco bandas separadas por hairlines: de qué cuenta es, qué hay que hacer,
// cómo está configurada, qué pasó con ella, y qué se puede hacer ahora. El
// título y la descripción no tienen caja: lo importante se escribe, no se
// completa un formulario.

const P = {
  x: "M6 6l12 12M18 6L6 18",
  estado: "M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  persona: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 7.5a3 3 0 1 0 0 .01",
  fecha: "M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  bandera: "M5 21V4h10l-1 3h6v8h-8l-1-3H5",
  espacio: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};

function Ico({ d, size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

// Pill con un select nativo adentro. El select va sin apariencia para que el
// chip mande visualmente; la flecha nativa se esconde.
function Chip({ icon, color, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, cursor: "pointer",
      background: "var(--surface-2)", border: "1px solid var(--line)", color: color || "var(--ink-2)" }}>
      <Ico d={icon} />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: "none", WebkitAppearance: "none", border: "none", background: "transparent", outline: "none",
          fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: "inherit", cursor: "pointer", paddingRight: 2 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const banda = { padding: "16px 22px", borderBottom: "1px solid var(--line)" };

export function TaskCenterModal({ task, companyName, members, spaces = [], defaultSpaceId = "", onSave, onDelete, onClose, onAbrirPipeline }) {
  const nueva = !task;
  const [f, setF] = useState(() => ({
    titulo: task?.titulo || "",
    nota: task?.nota || "",
    estado: task?.estado || "pendiente",
    who: task?.who || "",
    fecha: task?.fecha || "",
    prio: normalizePrio(task?.prio),
    spaceId: task ? (task.spaceId || "") : (defaultSpaceId || ""),
  }));

  // El espacio se elige arriba, junto a la cuenta: es de dónde CUELGA la tarea,
  // no un atributo más. Los hijos van indentados para que se lea la jerarquía.
  const opcionesEspacio = useMemo(() => [
    { value: "", label: "Sin espacio" },
    ...flattenTree(buildSpaceTree(spaces)).map(({ space, depth }) => ({
      value: space.id,
      label: `${"— ".repeat(depth)}${space.name}`,
    })),
  ], [spaces]);
  const [calendario, setCalendario] = useState(false);
  const hoy = useMemo(() => dayKey(new Date()), []);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const guardar = () => {
    if (!f.titulo.trim()) return;
    onSave(f);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onClick={() => setCalendario(false)}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,8,14,0.62)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "7vh 20px", overflow: "auto", fontFamily: DS.font }}>
      {/* Sin `overflow: hidden`: recortaba el calendario del chip de fecha. Las
          esquinas las redondean las bandas de los extremos. */}
      <div className="glass" style={{ width: "min(660px, 96vw)", borderRadius: 20,
        background: "var(--surface-solid)", boxShadow: "var(--shadow-lg)", color: "var(--ink)" }}>

        {/* 1. De qué cuenta es */}
        <div style={{ ...banda, background: "var(--surface-2)", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10, padding: "13px 22px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 11px", borderRadius: 999, background: "var(--sel-soft)", fontSize: 12, fontWeight: 700, color: "var(--sel)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--sel)" }} />
            {companyName}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>/</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
            background: "var(--surface-solid)", border: "1px solid var(--line)", color: f.spaceId ? "var(--ink-2)" : "var(--ink-4)" }}>
            <Ico d={P.espacio} />
            <select value={f.spaceId} onChange={(e) => set({ spaceId: e.target.value })}
              style={{ appearance: "none", WebkitAppearance: "none", border: "none", background: "transparent", outline: "none",
                fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "inherit", cursor: "pointer", maxWidth: 190 }}>
              {opcionesEspacio.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={onClose}
            style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer",
              background: "var(--chip)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
            <Ico d={P.x} size={14} />
          </button>
        </div>

        {/* 2. Qué hay que hacer */}
        <div style={{ ...banda, display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus value={f.titulo} onChange={(e) => set({ titulo: e.target.value })}
            placeholder="Nueva tarea"
            onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
            style={{ border: "none", background: "transparent", outline: "none", fontFamily: DS.font,
              fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)" }} />
          <textarea value={f.nota} onChange={(e) => set({ nota: e.target.value })} rows={3}
            placeholder="Añade una descripción"
            style={{ border: "none", background: "transparent", outline: "none", resize: "vertical", fontFamily: DS.font,
              fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }} />
        </div>

        {/* 3. Cómo está configurada */}
        <div style={{ ...banda, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Chip icon={P.estado} color={ESTADO_BY_KEY[f.estado]?.color} value={f.estado} onChange={(v) => set({ estado: v })}
            options={ESTADOS.map((e) => ({ value: e.key, label: e.label }))} />
          <Chip icon={P.persona} value={f.who} onChange={(v) => set({ who: v })}
            options={[{ value: "", label: "Sin asignar" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
          {/* El chip entero abre el calendario del portal. El input nativo solo
              respondía en su iconito y traía la caja del sistema operativo. */}
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setCalendario((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                background: "var(--surface-2)", border: "1px solid var(--line)", color: f.fecha ? "var(--ink-2)" : "var(--ink-4)",
                fontFamily: DS.font, fontSize: 12.5, fontWeight: 600 }}>
              <Ico d={P.fecha} />
              {f.fecha ? shortDay(f.fecha) : "Sin fecha"}
            </button>
            {calendario && (
              <div className="glass" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 50, width: 300,
                borderRadius: 16, padding: 14, background: "var(--surface-solid)", boxShadow: "var(--shadow-lg)" }}>
                <DateCalendar mode="single" value={f.fecha} hoy={hoy}
                  onChange={(k) => { set({ fecha: k }); setCalendario(false); }}
                  onClear={() => { set({ fecha: "" }); setCalendario(false); }} />
              </div>
            )}
          </div>
          <Chip icon={P.bandera} color={PRIO_BY_KEY[f.prio]?.color} value={f.prio} onChange={(v) => set({ prio: v })}
            options={PRIOS.map((p) => ({ value: p.key, label: p.label }))} />
        </div>

        {/* 4. Qué hay que hacer, o qué pasó */}
        {task?.autoKey
          ? <ChecklistDelPipeline task={task} onAbrirPipeline={onAbrirPipeline} />
          : (
            <div style={{ ...banda }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Actividad</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                {nueva ? "La actividad va a aparecer cuando se cree la tarea." : "Sin movimientos registrados todavía."}
              </div>
            </div>
          )}

        {/* 5. Qué se puede hacer ahora */}
        <div style={{ padding: "14px 22px", background: "var(--surface-2)", borderRadius: "0 0 20px 20px", display: "flex", alignItems: "center", gap: 9 }}>
          {/* Las automáticas no se borran: el pipeline las vuelve a crear en la
              siguiente pasada. Se cierran solas cuando la etapa termina. */}
          {!nueva && !task.auto && (
            <button type="button" onClick={() => onDelete(task)}
              style={{ ...btn, background: "transparent", border: "1px solid rgba(217,63,62,0.35)", color: "var(--brand)" }}>Eliminar</button>
          )}
          {!nueva && task.auto && (
            <span style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.4, maxWidth: 300 }}>
              La arma el Content Pipeline y se cierra sola cuando la etapa termine.
            </span>
          )}
          <button type="button" onClick={onClose} style={{ ...btn, marginLeft: "auto", background: "var(--chip)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={!f.titulo.trim()}
            style={{ ...btn, background: "var(--sel)", border: "none", color: "#fff", opacity: f.titulo.trim() ? 1 : 0.5, cursor: f.titulo.trim() ? "pointer" : "not-allowed" }}>
            {nueva ? "Crear tarea" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Los contenidos detrás de una tarea del Content Pipeline, agrupados por
// concepto. Marcar una casilla escribe en el slot: la tarea es una vista del
// pipeline, no una copia con vida propia.
function ChecklistDelPipeline({ task, onAbrirPipeline }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    listAutoTaskSlots(task.autoKey)
      .then((s) => { if (!cancelado) setSlots(s); })
      .catch(() => { if (!cancelado) { setSlots([]); setError("No se pudieron cargar los contenidos."); } });
    return () => { cancelado = true; };
  }, [task.autoKey]);

  const marcar = async (slot, done) => {
    const antes = slots;
    const next = slots.map((s) => (s.id === slot.id ? { ...s, stage_done: done } : s));
    setSlots(next);                                   // se siente inmediato
    try {
      await setSlotDone(slot.id, done);
      await refrescarAvance(task.id, next.filter((s) => s.stage_done).length, next.length);
    } catch {
      setSlots(antes);                                // se revierte si falla
      setError("No se pudo guardar. Intentá de nuevo.");
    }
  };

  const grupos = agruparPorConcepto(slots || []);
  const done = (slots || []).filter((s) => s.stage_done).length;

  return (
    <div style={{ ...banda, display: "flex", flexDirection: "column", gap: 12, maxHeight: 340, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>Qué hay que hacer</span>
        {slots && <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{done}/{slots.length}</span>}
        {error && <span style={{ fontSize: 11.5, color: "var(--brand)", marginLeft: "auto" }}>{error}</span>}
        {/* La lista dice QUÉ hay que hacer; el creativo —la referencia, el guion,
            la carpeta— vive en el pipeline. Sin este salto había que buscarlo a
            mano en la vista de embudo. */}
        {task.briefId && onAbrirPipeline && (
          <button type="button" onClick={() => onAbrirPipeline(task.briefId, task.etapa)}
            style={{ marginLeft: error ? 10 : "auto", border: "none", background: "transparent", cursor: "pointer",
              fontFamily: DS.font, fontSize: 12, fontWeight: 700, color: "var(--sel)", padding: 0 }}>
            Ver en el Content Pipeline →
          </button>
        )}
      </div>

      {slots === null && <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Cargando…</span>}
      {slots?.length === 0 && !error && <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>No quedan contenidos en esta etapa.</span>}

      {grupos.map((g) => (
        <div key={g.concepto} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--sel)" }}>{g.concepto}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{g.done}/{g.total}</span>
          </div>
          {g.items.map((s) => (
            <label key={s.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 9, cursor: "pointer",
                background: s.stage_done ? "var(--chip)" : "transparent" }}>
              <input type="checkbox" checked={!!s.stage_done} onChange={(e) => marcar(s, e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "var(--sel)", cursor: "pointer", flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35,
                color: s.stage_done ? "var(--ink-4)" : "var(--ink-2)",
                textDecoration: s.stage_done ? "line-through" : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {etiquetaItem(s)}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

const btn = { padding: "9px 17px", borderRadius: 11, cursor: "pointer", fontFamily: DS.font, fontSize: 13, fontWeight: 700 };
