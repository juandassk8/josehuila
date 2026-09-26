// Picker "Elegir del banco" del pipeline: navega los referentes REALES de la
// empresa (agrupados por concepto, el del slot primero), permite verlos con el
// visor real del despliegue (AdModalCliente: video + transcripción + notas +
// descarga) y seleccionar uno como referencia del slot.

import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { AdModalCliente } from "../../despliegue/DespliegueClienteView.jsx";
import { ordenarPorPrioridad, esPrioritaria } from "../../despliegue/labels.js";
import { CoverDrop } from "../../despliegue/CoverDrop.jsx";

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const STAGE_ORDER = { tofu: 0, mofu: 1, bofu: 2 };

// Modal para MOVER un referente a otro concepto (board del cliente + banco general).
function MoveReferenteModal({ variation: r, concepts = [], onMove, onClose }) {
  const [fmt, setFmt] = useState(r.format || "video");   // filtra por formato; arranca en el del ref
  const dests = useMemo(() => {
    const list = concepts.filter((c) => c.id !== r.concept_id && (fmt === "todo" || c.format === fmt));
    return list.sort((a, b) => (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9) || a.name.localeCompare(b.name));
  }, [concepts, r.concept_id, fmt]);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(6,7,12,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 20px", overflowY: "auto", fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(560px, 96vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.025em" }}>Mover referente</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3 }}>
              Desde <b>{r.concept_name || "—"}</b>. Se mueve en el banco del cliente <b>y en el banco general</b> (para no re-importarlo mal).
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-3)", width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", display: "flex", gap: 4 }}>
          {[["video", "Video"], ["static", "Estático"], ["todo", "Todos"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFmt(k)}
              style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 9, cursor: "pointer", border: "none", color: fmt === k ? "var(--ink)" : "var(--ink-3)", background: fmt === k ? "var(--surface-2)" : "transparent" }}>{l}</button>
          ))}
        </div>
        <div style={{ padding: "12px 16px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {dests.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--ink-4)", fontSize: 13, padding: "24px 0" }}>No hay otros conceptos de ese formato.</div>
          ) : dests.map((c) => (
            <button key={c.id} type="button" onClick={() => onMove(c)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, cursor: "pointer", textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--line)", fontFamily: DS.font }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", background: "var(--chip)", borderRadius: 999, padding: "2px 8px", flex: "none" }}>{STAGE_LABEL[c.stage] || c.stage}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{c.format === "static" ? "Estático" : "Video"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, accent }) {
  return (
    <button type="button" onClick={onClick}
      style={{ fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
        color: on ? "#fff" : (accent || "var(--ink-3)"),
        background: on ? (accent || "var(--sel)") : "var(--surface-2)",
        border: `1px solid ${on ? "transparent" : "var(--line)"}` }}>
      {label}
    </button>
  );
}

const STATE_BADGE = {
  created: { t: "✓ Creado", c: "var(--green)", bg: "rgba(63,207,155,0.16)" },
  discarded: { t: "Descartado", c: "var(--ink-4)", bg: "var(--chip)" },
  used: { t: "Ya elegido", c: "var(--sel)", bg: "var(--sel-soft)" },
};

function RefTile({ r, selected, state, atLimit, onOpen, onUse, onSetCover, onToggleDiscard }) {
  const isVideo = r.format === "video";
  const [editingCover, setEditingCover] = useState(false);
  const [broken, setBroken] = useState(false);
  const showDrop = onSetCover && (editingCover || !r.file_url);
  const usable = !selected && !atLimit;
  const badge = state ? STATE_BADGE[state] : null;
  const dim = state ? 0.5 : 1;   // grisecito para elegidos/creados/descartados
  return (
    <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", border: `1px solid ${selected ? "var(--sel)" : "var(--line)"}`, background: "var(--surface-2)", boxShadow: selected ? "var(--sel-rim)" : "none" }}>
      {badge && (
        <span style={{ position: "absolute", top: 8, left: 8, zIndex: 3, fontSize: 10, fontWeight: 700, color: badge.c, background: badge.bg, borderRadius: 999, padding: "3px 8px", backdropFilter: "blur(2px)" }}>{badge.t}</span>
      )}
      <div style={{ opacity: dim, transition: "opacity .15s" }}>
      {showDrop ? (
        <CoverDrop value={r.file_url} conceptId={r.concept_id || "ref"} aspect={isVideo ? "9 / 12" : "4 / 5"}
          hint="Arrastrá o click para la portada"
          onChange={(url) => { onSetCover(r.id, url); setEditingCover(false); }} />
      ) : (
        <button type="button" onClick={onOpen} title="Ver referente"
          style={{ display: "block", width: "100%", border: "none", padding: 0, cursor: "pointer", background: "transparent" }}>
          <div style={{ position: "relative", aspectRatio: isVideo ? "9 / 12" : "4 / 5", background: "var(--chip)" }}>
            {r.file_url && !broken
              ? <img src={r.file_url} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", backgroundImage: "repeating-linear-gradient(135deg, var(--chip) 0 7px, transparent 7px 14px)" }} />}
            {isVideo && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            )}
          </div>
        </button>
      )}
      <div style={{ padding: "8px 10px", textAlign: "left" }}>
        {r.brand && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.brand}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, fontSize: 11, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "Referencia"}</div>
          {onSetCover && r.file_url && (
            <button type="button" onClick={() => setEditingCover((v) => !v)} title="Cambiar portada"
              style={{ flex: "none", fontFamily: DS.font, fontSize: 10, fontWeight: 600, color: "var(--ink-4)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              {editingCover ? "cancelar" : "✎ portada"}
            </button>
          )}
        </div>
      </div>
      </div>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 3, display: "flex", alignItems: "center", gap: 6 }}>
        {onToggleDiscard && (
          <button type="button" onClick={onToggleDiscard} title={state === "discarded" ? "Recuperar (quitar de descartados)" : "Descartar — no lo quiero recrear"}
            style={{ width: 27, height: 27, borderRadius: 999, display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "var(--shadow)",
              color: state === "discarded" ? "#fff" : "#E24B4A",
              background: state === "discarded" ? "var(--green)" : "var(--surface-solid)",
              border: `1px solid ${state === "discarded" ? "transparent" : "rgba(226,75,74,0.5)"}` }}>
            {state === "discarded"
              ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" /></svg>
              : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>}
          </button>
        )}
        <button type="button" onClick={onUse} disabled={!usable} title={atLimit && !selected ? "Máximo 3 referencias — quitá una para agregar otra" : undefined}
          style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: DS.font, fontSize: 11, fontWeight: 700, padding: "5px 9px", borderRadius: 999, cursor: usable ? "pointer" : "default", opacity: !usable && !selected ? 0.45 : 1,
            color: selected ? "#fff" : "var(--sel)", background: selected ? "var(--green)" : "var(--surface-solid)", border: `1px solid ${selected ? "transparent" : "rgba(88,166,255,0.4)"}`, boxShadow: "var(--shadow)" }}>
          {selected ? "✓ Elegido" : "+ Usar"}
        </button>
      </div>
    </div>
  );
}

export function ReferentePickerModal({ slot, references = [], concepts = [], prioridades = null, loading = false, error = false, onRetry, onPick, onSetCover, onMove, onClose,
  usedIds, createdIds, discardedIds, onToggleDiscard }) {
  const [q, setQ] = useState("");
  const [fmt, setFmt] = useState("todo");          // todo | video | static
  const [viewing, setViewing] = useState(null);    // { ref, list }
  const [moving, setMoving] = useState(null);       // ref que se está moviendo
  const [hideChosen, setHideChosen] = useState(false);      // ocultar ya elegidos
  const [showCreated, setShowCreated] = useState(false);    // ver los ya creados (ocultos por defecto)
  const [showDiscarded, setShowDiscarded] = useState(false); // ver descartados (ocultos por defecto)

  // Escape cierra: el visor/mover si están abiertos, si no el picker.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (moving) setMoving(null);
      else if (viewing) setViewing(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moving, viewing, onClose]);

  const has = (set, id) => !!(set && set.has && set.has(id));
  // Estado de un referente: descartado > creado > elegido. (created = usado en un
  // slot que llegó a campaign/feedback; used = elegido en cualquier slot.)
  const stateOf = (r) => (has(discardedIds, r.id) ? "discarded" : has(createdIds, r.id) ? "created" : has(usedIds, r.id) ? "used" : null);
  const counts = useMemo(() => {
    let created = 0, discarded = 0;
    for (const r of references) { if (has(discardedIds, r.id)) discarded++; else if (has(createdIds, r.id)) created++; }
    return { created, discarded };
  }, [references, createdIds, discardedIds]);

  const selectedIds = useMemo(
    () => new Set((slot?.refs || []).map((r) => (typeof r === "string" ? r : r?.id))),
    [slot],
  );

  // Filtro por búsqueda + formato + estado (elegidos/creados/descartados).
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return references.filter((r) => {
      if (fmt !== "todo" && r.format !== fmt) return false;
      const st = has(discardedIds, r.id) ? "discarded" : has(createdIds, r.id) ? "created" : has(usedIds, r.id) ? "used" : null;
      if (st === "discarded" && !showDiscarded) return false;
      if (st === "created" && !showCreated) return false;
      if (st === "used" && hideChosen) return false;
      if (!needle) return true;
      const hay = `${r.name} ${r.brand} ${r.concept_name} ${Object.values(r.bank_labels || {}).flat().join(" ")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [references, q, fmt, usedIds, createdIds, discardedIds, hideChosen, showCreated, showDiscarded]);

  // Agrupa por concepto; el concepto del slot va primero.
  //
  // Adentro y entre grupos manda el orden que la cuenta eligió en su Despliegue:
  // elegir un referente para un anuncio y mirar el embudo son el mismo acto, y
  // ver dos órdenes distintos según la pantalla es peor que no ordenar nada.
  const groups = useMemo(() => {
    const ordenadas = ordenarPorPrioridad(filtered, prioridades);
    const byConcept = new Map();
    for (const r of ordenadas) {
      const k = r.concept_id || "_";
      if (!byConcept.has(k)) byConcept.set(k, { id: k, name: r.concept_name || "Sin concepto", stage: r.stage, list: [], prio: 0 });
      const g = byConcept.get(k);
      g.list.push(r);
      if (esPrioritaria(r, prioridades)) g.prio += 1;
    }
    const arr = [...byConcept.values()];
    // El concepto del slot siempre primero: es el contexto en el que estás
    // parado, y perderlo de vista por una prioridad global sería desorientar.
    arr.sort((a, b) => {
      if (a.id === slot?.concept_id) return -1;
      if (b.id === slot?.concept_id) return 1;
      return b.prio - a.prio;
    });
    return arr;
  }, [filtered, slot, prioridades]);

  const pick = (r) => { onPick(r); setViewing(null); };
  const atLimit = (slot?.refs || []).length >= 3;

  return (
    <>
      <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
        style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(6,7,12,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 20px", overflowY: "auto", fontFamily: DS.font }}>
        <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(920px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 14, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.025em" }}>Elegir del banco</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3 }}>
                Referentes de la empresa{slot?.concepto ? ` · concepto “${slot.concepto}” primero` : ""}. {atLimit ? "Máximo 3 alcanzado — quitá uno para agregar otro." : `${(slot?.refs || []).length}/3 elegidas.`}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-3)", width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>

          {/* Controles */}
          <div style={{ padding: "12px 22px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0, borderBottom: "1px solid var(--line)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por marca, nombre, etiqueta…"
              style={{ flex: "1 1 240px", fontFamily: DS.font, fontSize: 13, color: "var(--ink)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: "9px 12px", outline: "none" }} />
            <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: 3 }}>
              {[["todo", "Todo"], ["video", "Video"], ["static", "Estático"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFmt(k)}
                  style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: "none", color: fmt === k ? "var(--ink)" : "var(--ink-3)", background: fmt === k ? "var(--surface-solid)" : "transparent", boxShadow: fmt === k ? "var(--shadow)" : "none" }}>{l}</button>
              ))}
            </div>
            {/* Toggles de estado */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexBasis: "100%" }}>
              <Toggle on={hideChosen} onClick={() => setHideChosen((v) => !v)} label={hideChosen ? "Elegidos ocultos" : "Ocultar elegidos"} />
              <Toggle on={showCreated} onClick={() => setShowCreated((v) => !v)} label={`${showCreated ? "Ocultar" : "Ver"} creados${counts.created ? ` (${counts.created})` : ""}`} accent="var(--green)" />
              <Toggle on={showDiscarded} onClick={() => setShowDiscarded((v) => !v)} label={`${showDiscarded ? "Ocultar" : "Ver"} descartados${counts.discarded ? ` (${counts.discarded})` : ""}`} />
            </div>
          </div>

          {/* Cuerpo */}
          <div style={{ padding: "16px 22px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "var(--ink-4)", fontSize: 13, padding: "40px 0" }}>Cargando referentes…</div>
            ) : error ? (
              <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                <div style={{ color: "var(--amber)", fontSize: 13.5, lineHeight: 1.55, maxWidth: 420 }}>No se pudieron cargar los referentes. Puede ser un problema de conexión o permisos.</div>
                {onRetry && <button type="button" onClick={onRetry} style={{ fontFamily: DS.font, fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sel)", border: "none", borderRadius: 10, padding: "8px 16px", cursor: "pointer" }}>Reintentar</button>}
              </div>
            ) : references.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--ink-4)", fontSize: 13.5, padding: "40px 20px", lineHeight: 1.55 }}>
                Esta empresa todavía no tiene referentes en su despliegue. Cargá anuncios de referencia
                desde el Banco / la Bandeja y vuelven a aparecer acá.
              </div>
            ) : groups.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--ink-4)", fontSize: 13, padding: "40px 0" }}>Sin resultados para ese filtro.</div>
            ) : groups.map((g) => (
              <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{g.name}</span>
                  {g.stage && <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", background: "var(--chip)", borderRadius: 999, padding: "2px 8px" }}>{STAGE_LABEL[g.stage] || g.stage}</span>}
                  {g.id === slot?.concept_id && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--sel)", background: "var(--sel-soft)", borderRadius: 999, padding: "2px 9px" }}>del slot</span>}
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{g.list.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {g.list.map((r) => (
                    <RefTile key={r.id} r={r} selected={selectedIds.has(r.id)} state={stateOf(r)} atLimit={atLimit}
                      onOpen={() => setViewing({ ref: r, list: g.list })}
                      onUse={() => { if (!atLimit && !selectedIds.has(r.id)) pick(r); }}
                      onSetCover={onSetCover && r.owned !== false ? onSetCover : null}
                      onToggleDiscard={onToggleDiscard ? () => onToggleDiscard(r.id) : null} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visor real del despliegue (video + transcripción + notas + descarga) */}
      {viewing && (
        <AdModalCliente
          canTranscribe
          concept={{ format: viewing.ref.format, name: viewing.ref.concept_name, stage: viewing.ref.stage }}
          list={viewing.list}
          initialRef={viewing.ref}
          view="reference"
          onSelect={(next) => setViewing((v) => ({ ...v, ref: next }))}
          onClose={() => setViewing(null)}
          primaryAction={atLimit ? null : { label: "Seleccionar como referencia", onClick: (r) => pick(r) }}
          secondaryAction={onMove && viewing.ref.owned !== false ? { label: "↔ Mover", onClick: (r) => setMoving(r) } : null}
        />
      )}
      {/* Mover el referente a otro concepto (admin) */}
      {moving && (
        <MoveReferenteModal variation={moving} concepts={concepts}
          onMove={(target) => { onMove(moving, target); setMoving(null); setViewing(null); }}
          onClose={() => setMoving(null)} />
      )}
    </>
  );
}
