import { useEffect, useMemo, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PIPELINE_STATUSES,
  REVIEW_STATUSES,
  COLUMNS_WITH_REVIEW,
  currentWeekIso,
  listSlotsForBoard,
  createSlot,
  updateSlot,
  deleteSlot,
} from "./pipeline_db.js";
import { getOrCreateBoard, getBoardByCompany, listConcepts } from "./db.js";
import { database } from "../lib/backend.js";
import { SlotModal } from "./SlotModal.jsx";
import { WeeklyPlanModal } from "./WeeklyPlanModal.jsx";
import { ExportScriptsModal } from "./ExportScriptsModal.jsx";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { canMoveSlot, canManagePipeline, canBulkEdit } from "../workspace/permissions/slot_permissions.js";
import { syncStageTasks, autoMoveStaleInCampaign } from "../workspace/data/stageTasks.js";
import { useCompanyMask } from "../lib/censor.jsx";
import { PipelineTypeToggle } from "../lib/PipelineTypeToggle.jsx";
import { logger } from "../lib/logger.js";

// Content Pipeline — vista admin estilo Notion Kanban.
// 6 columnas: Idea → Scripting → To Film → To Edit → In Campaign → Feedback.
// Filtros arriba: Todo / Videos / Estáticos.
// Cada tarjeta muestra Tipo (TOFU/MOFU/BOFU) + Formato (concepto) + review status.
// Drag-and-drop cambia status. Click abre modal para editar detalles.

const STAGE_COLORS = {
  tofu: "#1D9E75",
  mofu: "#D4A93B",
  bofu: "#E24B4A",
};

const FORMAT_FILTER = [
  { key: "all",    label: "Todo" },
  { key: "video",  label: "Videos" },
  { key: "static", label: "Estáticos" },
];

export function ContentPipeline({ companyId, companyName, isAdmin = true, onBack, simpleMode = false, currentMember = null, pipelineType: initialPipelineType = "ads", forcePipelineType = false }) {
  const { isDark } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const displayCompanyName = mask.name(companyName, companyId);
  // Construye el "member efectivo" para la matriz de permisos: si Jose entra
  // como admin global (PIN admin) lo marcamos con is_admin_global=true para
  // bypassear todo. Si el currentMember viene del workspace cliente, se usa
  // tal cual. Si no hay nada, no hay permisos (se pintan campos disabled).
  const effectiveMember = useMemo(() => {
    if (currentMember) {
      return isAdmin ? { ...currentMember, is_admin_global: true } : currentMember;
    }
    if (isAdmin) return { is_admin_global: true };
    return null;
  }, [currentMember, isAdmin]);

  // Permisos derivados — reemplazan al viejo `isAdmin` para gating de UI.
  const canManage = canManagePipeline(effectiveMember); // crear slots, planear semana, exportar
  const canBulk = canBulkEdit(effectiveMember);          // batch review, selección múltiple, eliminar

  const [board, setBoard] = useState(null);
  const [slots, setSlots] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  // Tipo de pipeline — admin puede togglear, workspace cliente es forzado.
  const [pipelineType, setPipelineType] = useState(initialPipelineType);
  // Toast efímero cuando un drag es bloqueado por permiso. Se autodescarta.
  const [permissionToast, setPermissionToast] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const [openSlotId, setOpenSlotId] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Review batch: Nat selecciona slots que piden revisión y por grupos decide
  // cuáles aprueba y cuáles piden cambios. Al final pega el Loom y aplica.
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewLoomUrl, setReviewLoomUrl] = useState("");
  // Mapa slotId → 'approved' | 'changes_requested'. Se construye a medida
  // que Nat marca grupos con los botones del panel.
  const [pendingDecisions, setPendingDecisions] = useState(new Map());

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => { setSelectedIds(new Set()); setSelectionMode(false); };
  const selectAllInColumn = (statusKey) => {
    const ids = (slotsByStatus[statusKey] || []).map((s) => s.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} slots? No se puede deshacer.`)) return;
    const ids = Array.from(selectedIds);
    setSlots((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    clearSelection();
    try {
      await Promise.all(ids.map((id) => deleteSlot(id)));
    } catch (e) {
      logger.error("bulkDelete failed", e);
      load();
    }
  };
  const bulkMove = async (targetStatus) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setSlots((prev) => prev.map((s) => selectedIds.has(s.id) ? { ...s, status: targetStatus } : s));
    clearSelection();
    try {
      await Promise.all(ids.map((id) => updateSlot(id, { status: targetStatus })));
    } catch (e) {
      logger.error("bulkMove failed", e);
      load();
    }
  };

  // Marca los slots actualmente seleccionados con una decisión pendiente.
  // Al terminar, deselecciona para que Nat pueda marcar otro grupo distinto.
  const markSelectedAs = (decision) => {
    if (selectedIds.size === 0) return;
    if (!["approved", "changes_requested"].includes(decision)) return;
    setPendingDecisions((prev) => {
      const next = new Map(prev);
      selectedIds.forEach((id) => next.set(id, decision));
      return next;
    });
    setSelectedIds(new Set());
  };

  // Quita la decisión pendiente de un slot (por si Nat se equivocó).
  const clearDecision = (id) => {
    setPendingDecisions((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  // Aplica las decisiones pendientes. El Loom (si hay) se agrega al historial
  // `review_feedback` — NO se pisa `loom_review_url` que es el brief del UGC.
  const applyReview = async () => {
    if (pendingDecisions.size === 0) return;
    const loom = (reviewLoomUrl || "").trim();
    const entries = Array.from(pendingDecisions.entries());
    const now = new Date().toISOString();
    // Snapshot del state actual para construir los patches con contexto.
    const slotSnapshot = new Map(slots.map((s) => [s.id, s]));

    setSlots((prev) => prev.map((s) => {
      const dec = pendingDecisions.get(s.id);
      if (!dec) return s;
      const existing = Array.isArray(s.review_feedback) ? s.review_feedback : [];
      const entry = {
        id: crypto.randomUUID?.() || `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        stage: s.status,
        decision: dec,
        loom_url: loom || null,
        at: now,
      };
      return {
        ...s,
        review_status: dec,
        review_feedback: [...existing, entry],
      };
    }));
    setPendingDecisions(new Map());
    setSelectedIds(new Set());
    setReviewLoomUrl("");
    setReviewMode(false);

    // Flujo en 2 pasos por slot:
    //   1) update review_status → SIEMPRE se persiste (no depende de columnas nuevas)
    //   2) append al historial review_feedback → si falla por columna inexistente, se ignora silenciosamente
    try {
      await Promise.all(entries.map(async ([id, decision]) => {
        const slot = slotSnapshot.get(id);
        // Paso 1 — cambio de estado (crítico)
        try {
          await updateSlot(id, { review_status: decision });
        } catch (err) {
          logger.error("[applyReview] status update failed for slot", id, err);
          throw err;
        }
        // Paso 2 — agregar entry al historial (best-effort)
        const entry = {
          id: crypto.randomUUID?.() || `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          stage: slot?.status || "unknown",
          decision,
          loom_url: loom || null,
          at: now,
        };
        const existing = Array.isArray(slot?.review_feedback) ? slot.review_feedback : [];
        try {
          const { error } = await database
            .from("despliegue_slots")
            .update({ review_feedback: [...existing, entry] })
            .eq("id", id);
          if (error) {
            logger.warn("[applyReview] review_feedback append skipped:", error.message || error.code);
          }
        } catch (fbErr) {
          logger.warn("[applyReview] review_feedback append threw:", fbErr?.message || fbErr);
        }
      }));
    } catch (e) {
      logger.error("applyReview failed", e);
      load();
    }
  };

  const toggleReviewMode = () => {
    setReviewMode((v) => !v);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setReviewLoomUrl("");
    setPendingDecisions(new Map());
  };

  // En modo review solo los slots que piden revisión son seleccionables.
  const selectAllReviewable = () => {
    const ids = slots
      .filter((s) => s.review_status === "requested" && !pendingDecisions.has(s.id))
      .map((s) => s.id);
    setSelectedIds(new Set(ids));
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      let b = await getBoardByCompany(companyId, pipelineType);
      // Auto-crear board SIEMPRE — cualquier cliente que entre tiene su
      // pipeline listo sin esperar a un "asesor". Crear el board no es
      // destructivo. Las permisiones para crear slots concretos siguen
      // gateadas por la matriz de roles (canManage abajo).
      if (!b) b = await getOrCreateBoard(companyId, pipelineType);
      if (!b) {
        setBoard(null);
        setSlots([]);
        setLoading(false);
        return;
      }
      setBoard(b);
      const [ss, cs] = await Promise.all([
        listSlotsForBoard(b.id),
        listConcepts(b.id),
      ]);
      setSlots(ss);
      setConcepts(cs);
      setLoading(false);
    } catch (e) {
      setError(e?.message || String(e));
      setLoading(false);
    }
  }, [companyId, canManage, pipelineType]);

  useEffect(() => { load(); }, [load]);

  // ?highlight={slotId} — cuando Natt llega desde una task de revisión, el
  // link incluye el slot_id. Apenas cargan los slots, abrimos el SlotModal
  // de ese slot directo. Si el slot ya no existe (fue archivado) lo ignoramos.
  // Limpiamos el query param al abrir para que un refresh no re-abra el modal.
  useEffect(() => {
    if (!slots || slots.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const highlight = params.get("highlight");
    if (!highlight) return;
    const target = slots.find((s) => s.id === highlight);
    if (target) setOpenSlotId(target.id);
    params.delete("highlight");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }, [slots]);

  // Reconciliación de tareas auto-generated por stage + barrido de slots
  // viejos (>3 días en in_campaign → feedback). Sin cron — se dispara al
  // montar el pipeline. Solo cuando la board ya cargó.
  useEffect(() => {
    if (!companyId || !board?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const moved = await autoMoveStaleInCampaign(companyId);
        if (cancelled) return;
        if (moved && moved.length > 0) {
          // Refrescar slots para reflejar el cambio de columna in situ.
          load();
        }
        await syncStageTasks(companyId);
      } catch (e) {
        logger.error("[ContentPipeline] sync failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Columnas visibles según filter de formato:
  //   "all"    → todas (videos + estáticos comparten idea/in_campaign/feedback).
  //   "video"  → oculta to_design.
  //   "static" → oculta scripting/to_film/to_edit.
  const visibleStatuses = useMemo(() => {
    if (filter === "video")  return PIPELINE_STATUSES.filter((x) => x.key !== "to_design");
    if (filter === "static") return PIPELINE_STATUSES.filter((x) => !["scripting", "to_film", "to_edit"].includes(x.key));
    return PIPELINE_STATUSES;
  }, [filter]);

  const filteredSlots = useMemo(() => {
    if (filter === "all") return slots;
    return slots.filter((s) => s.format === filter);
  }, [slots, filter]);

  const slotsByStatus = useMemo(() => {
    const map = {};
    for (const s of PIPELINE_STATUSES) map[s.key] = [];
    for (const slot of filteredSlots) {
      if (map[slot.status]) map[slot.status].push(slot);
    }
    // Ordenar por column_order asc para que el drag visual quede estable.
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.column_order || 0) - (b.column_order || 0));
    }
    return map;
  }, [filteredSlots]);

  // Options del sensor memoizadas — el objeto inline generaba un sensors
  // array nuevo cada render y desestabilizaba el measurement de dnd-kit
  // (React #185).
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 8 } }), []);
  const dndSensors = useSensors(useSensor(PointerSensor, pointerOptions));

  const handleDragStart = (e) => setActiveDragId(e.active.id);
  const handleDragCancel = () => setActiveDragId(null);
  const handleDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeSlot = slots.find((s) => s.id === active.id);
    if (!activeSlot) return;

    const isColumn = typeof over.id === "string" && over.id.startsWith("col:");
    let targetStatus, targetIdx;
    if (isColumn) {
      targetStatus = over.id.slice("col:".length);
      const list = (slotsByStatus[targetStatus] || []).filter((s) => s.id !== active.id);
      targetIdx = list.length;
    } else {
      const overSlot = slots.find((s) => s.id === over.id);
      if (!overSlot) return;
      targetStatus = overSlot.status;
      const list = (slotsByStatus[targetStatus] || []).filter((s) => s.id !== active.id);
      targetIdx = list.findIndex((s) => s.id === overSlot.id);
      if (targetIdx < 0) targetIdx = list.length;
    }

    if (targetStatus === activeSlot.status && targetIdx === (activeSlot.column_order || 0)) return;

    // Permission check: el rol puede mover de from→to en este formato?
    if (targetStatus !== activeSlot.status) {
      const allowed = canMoveSlot(effectiveMember, activeSlot.status, targetStatus, activeSlot.format);
      if (!allowed) {
        setPermissionToast(`No tenés permiso para mover de "${activeSlot.status}" a "${targetStatus}".`);
        setTimeout(() => setPermissionToast(null), 3500);
        return;
      }
    }

    // Construimos el orden final de la columna destino.
    const targetColumn = (slotsByStatus[targetStatus] || []).filter((s) => s.id !== active.id);
    targetColumn.splice(targetIdx, 0, { ...activeSlot, status: targetStatus });

    // OPTIMISTIC: reescribimos column_order a todos los slots de la columna
    // destino en el estado local, así la UI se reordena al instante.
    setSlots((prev) => prev.map((s) => {
      const idxInTarget = targetColumn.findIndex((t) => t.id === s.id);
      if (idxInTarget >= 0) {
        return { ...s, status: targetStatus, column_order: idxInTarget };
      }
      return s;
    }));

    // Persistir en background. Solo persistimos los slots que realmente
    // cambiaron de orden o status — evita ruido de escrituras inútiles.
    (async () => {
      try {
        await Promise.all(
          targetColumn.map((it, idx) => {
            const statusChanged = it.status !== targetStatus || it.id === active.id;
            const orderChanged = (it.column_order || 0) !== idx;
            if (!statusChanged && !orderChanged) return null;
            const patch = {};
            if (it.status !== targetStatus || it.id === active.id) patch.status = targetStatus;
            if (orderChanged) patch.column_order = idx;
            return updateSlot(it.id, patch);
          }).filter(Boolean)
        );
      } catch (e) {
        logger.error("updateSlot failed", e);
        load(); // revert on error
      }
    })();
  };

  const handleNewSlot = async (status = "idea") => {
    if (!board?.id) return;
    try {
      const created = await createSlot({
        board_id: board.id,
        stage: "tofu",
        format: "video",
        status,
        title: "Nueva idea",
        week_iso: currentWeekIso(),
        column_order: (slotsByStatus[status] || []).length,
      });
      setSlots((prev) => [...prev, created]);
      setOpenSlotId(created.id);
    } catch (e) {
      logger.error("createSlot failed", e);
    }
  };

  const handleUpdateSlot = async (id, patch) => {
    // Optimistic.
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const updated = await updateSlot(id, patch);
      setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    } catch (e) {
      logger.error("updateSlot failed", e);
      load();
    }
  };

  const handleDeleteSlot = async (id) => {
    if (!confirm("¿Eliminar este slot? No se puede deshacer.")) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setOpenSlotId(null);
    try {
      await deleteSlot(id);
    } catch (e) {
      logger.error("deleteSlot failed", e);
      load();
    }
  };

  const activeSlot = activeDragId ? slots.find((s) => s.id === activeDragId) : null;
  const openSlot = openSlotId ? slots.find((s) => s.id === openSlotId) : null;

  if (error) {
    return <CenteredMsg color="#E24B4A">Error: {error}</CenteredMsg>;
  }
  if (!board && !loading) {
    return <CenteredMsg>Preparando tu pipeline…</CenteredMsg>;
  }

  // Si hay un slot abierto, renderizamos el editor inline (reemplaza el
  // kanban en el área de contenido del workspace). El sidebar queda visible.
  if (openSlot) {
    return (
      <SlotModal
        slot={openSlot}
        concepts={concepts}
        isAdmin={isAdmin}
        companyId={companyId}
        currentMember={effectiveMember}
        touchpoints={board?.config?.touchpoints || null}
        onClose={() => setOpenSlotId(null)}
        onUpdate={(patch) => handleUpdateSlot(openSlot.id, patch)}
        onDelete={() => handleDeleteSlot(openSlot.id)}
        simpleMode={simpleMode}
      />
    );
  }

  return (
    <div style={{
      width: "100%",
      height: "100%",
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.font,
      color: T.textPrimary,
      overflow: "hidden",
    }}>
      {/* Header estilo Notion — título grande + LIVE + acciones */}
      <div style={{
        padding: "22px 32px 14px",
        background: T.bg,
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 14, gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>
              Content Pipeline
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: T.textPrimary }}>
              {displayCompanyName || "—"}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontWeight: 500 }}>
              {slots.length} ITEMS
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "4px 10px", borderRadius: 50,
              background: `${T.purple}22`, color: T.purple,
              fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            }}>
              LIVE
            </div>
            {/* Review batch + selección múltiple = solo PM/owner/admin (acciones de gestión). */}
            {canBulk && (
              <>
                <button
                  data-tour="btn-revisar"
                  onClick={toggleReviewMode}
                  style={reviewMode ? primaryBtn() : ghostBtn()}
                  title={reviewMode ? "Salir de revisión" : "Iniciar revisión batch"}
                >
                  {reviewMode ? "✓ Revisando" : "🔍 Revisar"}
                </button>
                <button
                  onClick={() => { setSelectionMode((v) => !v); if (selectionMode) clearSelection(); if (reviewMode) setReviewMode(false); }}
                  style={selectionMode ? primaryBtn() : ghostBtn()}
                  title={selectionMode ? "Salir de selección" : "Seleccionar múltiples"}
                >
                  {selectionMode ? "✓ Seleccionando" : "☐ Seleccionar"}
                </button>
              </>
            )}
            {/* Crear slots / planear / exportar = owner / PM / copywriter / admin. */}
            {canManage && (
              <>
                <button data-tour="exportar-guiones" onClick={() => setExportOpen(true)} style={ghostBtn()}>
                  📄 Exportar guiones
                </button>
                <button data-tour="planear-semana" onClick={() => setPlanOpen(true)} style={ghostBtn()}>
                  📅 Planear semana
                </button>
                <button data-tour="generar-slots" onClick={() => handleNewSlot("idea")} style={primaryBtn()}>
                  + Nuevo slot
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter chips (pill style como Notion) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Toggle Anuncios / Orgánico — solo si el caller permite cambiar */}
            {!forcePipelineType && (
              <PipelineTypeToggle value={pipelineType} onChange={setPipelineType} size="sm" />
            )}
            <div data-tour="filtros-video-static" style={{ display: "flex", gap: 6 }}>
              {FORMAT_FILTER.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: "8px 18px", borderRadius: 50,
                    border: "none",
                    background: filter === f.key ? T.textPrimary : "transparent",
                    color: filter === f.key ? T.bg : T.textSecondary,
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bulk action bar — selección general */}
        {!reviewMode && selectedIds.size > 0 && (
          <div style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: "#1A1D1C",
            color: "#fff",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13,
          }}>
            <span style={{ fontWeight: 700 }}>{selectedIds.size} seleccionados</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "#A0A29E" }}>Mover a:</span>
            {PIPELINE_STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => bulkMove(s.key)}
                style={{
                  padding: "5px 10px", borderRadius: 50,
                  border: `1px solid ${s.color}`,
                  background: "transparent", color: s.color,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={bulkDelete}
              style={{
                padding: "6px 14px", borderRadius: 50,
                border: "none",
                background: "#E24B4A", color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🗑 Eliminar
            </button>
            <button
              onClick={clearSelection}
              style={{
                padding: "6px 10px", borderRadius: 50,
                border: "none", background: "rgba(255,255,255,0.1)",
                color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Panel de revisión batch — theme-aware, flujo en 3 pasos */}
        {reviewMode && (() => {
          const pendingCount = slots.filter((s) => s.review_status === "requested").length;
          let approvedCount = 0, changesCount = 0;
          pendingDecisions.forEach((v) => {
            if (v === "approved") approvedCount++;
            else if (v === "changes_requested") changesCount++;
          });
          const totalDecided = pendingDecisions.size;
          const undecidedCount = pendingCount - totalDecided;

          // Colores adaptativos al theme
          const panelBg = isDark ? "#1A1D1C" : "#F7F6F1";
          const panelText = isDark ? "#fff" : "#1A1D1C";
          const panelMuted = isDark ? "#A0A29E" : "#6E6F6A";
          const panelHint = isDark ? "#8A8E8B" : "#8A8E8B";
          const chipBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
          const chipBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
          const softBtnBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";

          return (
            <div style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 10,
              background: panelBg,
              color: panelText,
              border: isDark ? "none" : "1px solid rgba(0,0,0,0.08)",
              display: "flex", flexDirection: "column", gap: 10,
              fontSize: 13,
              fontFamily: "inherit",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>
                  🔍 Modo revisión
                </span>
                <span style={{ fontSize: 11, color: panelMuted }}>
                  {pendingCount} piden revisión · {selectedIds.size} seleccionados
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={selectAllReviewable}
                  style={{
                    padding: "5px 12px", borderRadius: 50,
                    border: `1px solid ${chipBorder}`,
                    background: "transparent", color: panelText,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Seleccionar sin decidir
                </button>
                <button
                  onClick={toggleReviewMode}
                  style={{
                    padding: "5px 10px", borderRadius: 50,
                    border: "none", background: softBtnBg,
                    color: panelText, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✕ Salir
                </button>
              </div>

              {/* Paso 1: marcar selecciones con decisión */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: panelMuted, marginRight: 2, fontWeight: 600 }}>
                  1. Seleccioná y marcá:
                </span>
                <button
                  onClick={() => markSelectedAs("approved")}
                  disabled={selectedIds.size === 0}
                  style={{
                    padding: "7px 14px", borderRadius: 50,
                    border: "none",
                    background: "#1D9E75", color: "#fff",
                    fontSize: 12, fontWeight: 700,
                    cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                    opacity: selectedIds.size === 0 ? 0.4 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  ✅ Marcar aprobados {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </button>
                <button
                  onClick={() => markSelectedAs("changes_requested")}
                  disabled={selectedIds.size === 0}
                  style={{
                    padding: "7px 14px", borderRadius: 50,
                    border: "none",
                    background: "#E24B4A", color: "#fff",
                    fontSize: 12, fontWeight: 700,
                    cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                    opacity: selectedIds.size === 0 ? 0.4 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  ✏️ Marcar cambios {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </button>
                {totalDecided > 0 && (
                  <span style={{
                    fontSize: 11, color: panelMuted, marginLeft: 4,
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ color: "#1D9E75", fontWeight: 700 }}>{approvedCount} aprob.</span>
                    <span style={{ color: "#E24B4A", fontWeight: 700 }}>{changesCount} cambios</span>
                    <span>{undecidedCount} sin decidir</span>
                  </span>
                )}
              </div>

              {/* Paso 2: Loom + aplicar */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: panelMuted, marginRight: 2, fontWeight: 600 }}>
                  2. Loom + enviar:
                </span>
                <input
                  type="url"
                  value={reviewLoomUrl}
                  onChange={(e) => setReviewLoomUrl(e.target.value)}
                  placeholder="Pegá el link de Loom (opcional)…"
                  style={{
                    flex: 1, minWidth: 220,
                    padding: "8px 12px", borderRadius: 8,
                    border: `1px solid ${chipBorder}`,
                    background: chipBg,
                    color: panelText, fontSize: 12.5, fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  onClick={applyReview}
                  disabled={totalDecided === 0}
                  style={{
                    padding: "8px 16px", borderRadius: 50,
                    border: "none",
                    background: totalDecided === 0
                      ? softBtnBg
                      : (isDark ? "#EBEBEB" : "#1A1D1C"),
                    color: totalDecided === 0
                      ? panelMuted
                      : (isDark ? "#1A1D1C" : "#fff"),
                    fontSize: 12, fontWeight: 700,
                    cursor: totalDecided === 0 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  📤 Enviar revisión {totalDecided > 0 ? `(${totalDecided})` : ""}
                </button>
              </div>

              <div style={{ fontSize: 10.5, color: panelHint, lineHeight: 1.5 }}>
                Seleccioná los slots que piden revisión, marcá cada grupo como aprobado o con cambios, pegá el Loom y enviá todo de una vez. Podés mezclar en el mismo envío.
              </div>
            </div>
          );
        })()}
      </div>

      {/* Toast efímero cuando un drag fue bloqueado por permiso */}
      {permissionToast && (
        <div style={{
          position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
          padding: "10px 18px", borderRadius: 50,
          background: "#E24B4A", color: "#fff",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
          boxShadow: "0 6px 20px rgba(226,75,74,0.35)",
          zIndex: 9999,
        }}>
          🚫 {permissionToast}
        </div>
      )}

      {/* Kanban */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "10px 32px 32px",
      }}>
        <DndContext
          sensors={dndSensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div data-tour="pipeline-columnas" style={{
            display: "flex",
            gap: 12,
            minHeight: "100%",
            alignItems: "flex-start",
          }}>
            {visibleStatuses.map((st) => (
              <PipelineColumn
                key={st.key}
                status={st}
                slots={slotsByStatus[st.key] || []}
                canManage={canManage}
                canBulk={canBulk}
                onNewSlot={() => handleNewSlot(st.key)}
                onOpenSlot={setOpenSlotId}
                concepts={concepts}
                selectionMode={selectionMode || reviewMode}
                reviewMode={reviewMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={() => selectAllInColumn(st.key)}
                pendingDecisions={pendingDecisions}
                onClearDecision={clearDecision}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeSlot ? (
              <SlotCard slot={activeSlot} isOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modal de planear semana */}
      {planOpen && board && (
        <WeeklyPlanModal
          board={board}
          concepts={concepts}
          onClose={() => setPlanOpen(false)}
          onGenerated={(newSlots) => {
            setSlots((prev) => [...prev, ...newSlots]);
          }}
        />
      )}

      {/* Modal de exportar guiones a PDF (slots en to_film) */}
      {exportOpen && (
        <ExportScriptsModal
          companyId={companyId}
          companyName={companyName}
          slots={slots.filter((s) => s.status === "to_film")}
          concepts={concepts}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// ───── Column ──────────────────────────────────────────────────────────

function PipelineColumn({ status, slots, canManage, canBulk, onNewSlot, onOpenSlot, concepts, selectionMode, reviewMode, selectedIds, onToggleSelect, onSelectAll, pendingDecisions, onClearDecision }) {
  const { isDark } = useTheme();
  const T = DS;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.key}` });
  const ids = slots.map((s) => s.id);
  const count = slots.length;

  return (
    <div style={{
      minWidth: 280,
      maxWidth: 280,
      background: `${status.color}${isDark ? "14" : "0A"}`,
      border: `1px solid ${status.color}${isDark ? "33" : "22"}`,
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      maxHeight: "calc(100vh - 180px)",
    }}>
      {/* Column header — dot + name + count + "+" derecha */}
      <div style={{
        padding: "12px 14px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: status.color,
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: status.color }}>
            {status.label}
          </span>
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>
            {count}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {selectionMode && canBulk && count > 0 && (
            <button onClick={onSelectAll} title="Seleccionar todos" style={iconBtn()}>☑</button>
          )}
          {canManage && (
            <button onClick={onNewSlot} title="Nuevo slot" style={iconBtn()}>+</button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 10px 10px",
          minHeight: 80,
          background: isOver ? `${status.color}12` : "transparent",
          transition: "background 0.15s",
          borderRadius: 12,
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {slots.map((slot) => {
            const reviewable = !reviewMode || slot.review_status === "requested";
            const decision = pendingDecisions?.get(slot.id) || null;
            return (
              <SortableSlot
                key={slot.id}
                slot={slot}
                statusColor={status.color}
                onClick={() => {
                  if (reviewMode) {
                    if (!reviewable) return;
                    // Si ya tiene decisión pendiente, click la limpia.
                    if (decision) { onClearDecision?.(slot.id); return; }
                    onToggleSelect(slot.id);
                    return;
                  }
                  if (selectionMode) onToggleSelect(slot.id);
                  else onOpenSlot(slot.id);
                }}
                selectionMode={selectionMode}
                selected={selectedIds?.has(slot.id)}
                dimmed={reviewMode && !reviewable && !decision}
                reviewDecision={decision}
              />
            );
          })}
        </SortableContext>
        {slots.length === 0 && canManage && (
          <button
            onClick={onNewSlot}
            style={{
              width: "100%", padding: "10px 12px",
              background: "transparent", border: "none",
              color: T.textMuted, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit",
              textAlign: "left",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"; e.currentTarget.style.color = T.textSecondary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; }}
          >
            + Nuevo slot
          </button>
        )}
      </div>
    </div>
  );
}

// ───── SortableSlot ───────────────────────────────────────────────────

function SortableSlot({ slot, statusColor, onClick, selectionMode, selected, dimmed = false, reviewDecision = null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: selectionMode, // no draggear mientras seleccionas
  });
  const style = isDragging
    ? { opacity: 0.3, transition }
    : { transform: CSS.Transform.toString(transform), transition };

  const decisionBorder =
    reviewDecision === "approved" ? "2px solid #1D9E75" :
    reviewDecision === "changes_requested" ? "2px solid #E24B4A" : null;
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: dimmed ? 0.35 : style.opacity ?? 1,
        pointerEvents: dimmed ? "none" : undefined,
        borderRadius: 12,
        outline: decisionBorder ? decisionBorder : "none",
        outlineOffset: 1,
        marginBottom: 10,
      }}
      {...(selectionMode ? {} : attributes)}
      {...(selectionMode ? {} : listeners)}
    >
      <SlotCard
        slot={slot}
        statusColor={statusColor}
        onClick={onClick}
        selectionMode={selectionMode}
        selected={selected}
        reviewDecision={reviewDecision}
      />
    </div>
  );
}

// ───── SlotCard — estilo Notion (igual al pipeline personal de Jose) ─────

function SlotCard({ slot, statusColor, onClick, isOverlay = false, selectionMode = false, selected = false, reviewDecision = null }) {
  const { isDark } = useTheme();
  const T = DS;
  const stageColor = STAGE_COLORS[slot.stage] || T.textMuted;
  const showReview = COLUMNS_WITH_REVIEW.includes(slot.status);

  // Icono circular del tipo (TOFU verde, MOFU amarillo, BOFU rojo)
  const stageDot = (
    <span style={{
      width: 10, height: 10, borderRadius: "50%",
      background: stageColor, flexShrink: 0,
      border: "1.5px solid #fff",
      boxShadow: `0 0 0 1.5px ${stageColor}`,
    }} />
  );

  // Icono circular del status de columna (gris pendiente / color activo)
  const colDot = (
    <span style={{
      width: 8, height: 8, borderRadius: "50%",
      background: statusColor || "#C4C6C2",
      flexShrink: 0,
    }} />
  );

  const cardBg = isDark ? "#14141A" : "#FFFFFF";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const cardHoverBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const selectedBg = isDark ? `${T.blue}22` : "#EEF5FF";

  // Badge sticky esquina sup-derecha cuando hay decisión pendiente de revisión.
  const decisionBadge = reviewDecision ? (
    <span style={{
      position: "absolute", top: -6, right: -6,
      padding: "3px 9px", borderRadius: 50,
      background: reviewDecision === "approved" ? "#1D9E75" : "#E24B4A",
      color: "#fff", fontSize: 9.5, fontWeight: 800,
      letterSpacing: "0.04em", zIndex: 2,
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
    }}>
      {reviewDecision === "approved" ? "✅ APROBAR" : "✏️ CAMBIOS"}
    </span>
  ) : null;

  return (
    <div
      onClick={() => { if (!isOverlay) onClick?.(); }}
      style={{
        background: selected ? selectedBg : cardBg,
        border: selected ? `1.5px solid ${T.blue}` : `1px solid ${cardBorder}`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: isOverlay ? "grabbing" : "pointer",
        boxShadow: isOverlay ? "0 12px 28px rgba(0,0,0,0.35)" : selected ? `0 2px 8px ${T.blue}33` : (isDark ? "none" : "0 1px 2px rgba(0,0,0,0.03)"),
        transition: "box-shadow 0.15s, transform 0.15s, border-color 0.15s, background 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isOverlay && !selected) {
          e.currentTarget.style.borderColor = cardHoverBorder;
          e.currentTarget.style.boxShadow = isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isOverlay && !selected) {
          e.currentTarget.style.borderColor = cardBorder;
          e.currentTarget.style.boxShadow = isDark ? "none" : "0 1px 2px rgba(0,0,0,0.03)";
        }
      }}
    >
      {decisionBadge}
      {/* Checkbox cuando hay selection mode */}
      {selectionMode && !isOverlay && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          width: 18, height: 18, borderRadius: 4,
          border: selected ? "none" : `1.5px solid ${isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"}`,
          background: selected ? T.blue : (isDark ? "transparent" : "#fff"),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#fff", fontWeight: 800,
        }}>
          {selected && "✓"}
        </div>
      )}

      {/* Row 1: dots + título */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, paddingRight: selectionMode ? 26 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, paddingTop: 3 }}>
          {colDot}
          {stageDot}
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: T.textPrimary,
          lineHeight: 1.35, flex: 1,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
        }}>
          {slot.title || "Sin título"}
        </div>
      </div>

      {/* Row 2: tags (TOFU pill + concepto + review) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingLeft: 34 }}>
        <span style={{
          padding: "2px 8px", borderRadius: 4,
          background: `${stageColor}18`, color: stageColor,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          {slot.stage}
        </span>
        {slot.concept_name && (
          <span style={{
            fontSize: 10, color: T.textSecondary, fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 130,
          }}>
            {slot.concept_name}
          </span>
        )}
        {slot.angle && (
          <span style={{ fontSize: 10, color: T.textMuted }}>
            · {slot.angle}
          </span>
        )}
        {showReview && slot.review_status === "requested" && (
          <span style={{
            padding: "2px 7px", borderRadius: 4,
            background: "#FEE5E5", color: "#E24B4A",
            fontSize: 9, fontWeight: 700,
          }}>
            Pide revisión
          </span>
        )}
        {showReview && slot.review_status === "approved" && (
          <span style={{
            padding: "2px 7px", borderRadius: 4,
            background: "#E0F5EC", color: "#1D9E75",
            fontSize: 9, fontWeight: 700,
          }}>
            Aprobado
          </span>
        )}
        {showReview && slot.review_status === "changes_requested" && (
          <span style={{
            padding: "2px 7px", borderRadius: 4,
            background: "#FFEFD4", color: "#B07407",
            fontSize: 9, fontWeight: 700,
          }}>
            Cambios
          </span>
        )}
      </div>

      {/* Row 3: Performance + rating si existe */}
      {(slot.performance || typeof slot.review_rating === "number") && (
        <div style={{
          marginTop: 8, paddingLeft: 34,
          display: "flex", gap: 8, fontSize: 10, color: "#7A7E7B",
        }}>
          {slot.performance && (
            <span style={{
              fontWeight: 700,
              color: slot.performance === "green" ? "#1D9E75" : slot.performance === "yellow" ? "#D4A93B" : "#E24B4A",
            }}>
              {slot.performance === "green" ? "🟢" : slot.performance === "yellow" ? "🟡" : "🔴"}
            </span>
          )}
          {typeof slot.review_rating === "number" && (
            <span>⭐ {slot.review_rating}/10</span>
          )}
        </div>
      )}
    </div>
  );
}

// ───── Helpers ───────────────────────────────────────────────────────

function CenteredMsg({ children, color = "#9A9A92" }) {
  return (
    <div style={{
      padding: 40,
      textAlign: "center",
      color,
      fontFamily: "'Inter',sans-serif",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {children}
    </div>
  );
}

function ghostBtn() {
  return {
    padding: "8px 14px",
    borderRadius: 50,
    border: `1px solid ${DS.textHint}`,
    background: "transparent",
    color: DS.textPrimary,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function primaryBtn() {
  return {
    padding: "9px 18px",
    borderRadius: 50,
    border: "none",
    background: DS.textPrimary,
    color: DS.bg,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function iconBtn() {
  return {
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "none",
    background: DS.bgCard,
    color: DS.textSecondary,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
  };
}
