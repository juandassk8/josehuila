import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useDespliegue } from "./hooks.js";
import { STAGES, FORMATS, STATES, weekRangeISO } from "./constants.js";
import { ConceptCard, ConceptCardPresentational } from "./ConceptCard.jsx";
import { ExampleModal } from "./ExampleModal.jsx";
import { CanvasFilterContext } from "./CanvasFilterContext.js";
import { CanvasFilterBar } from "./CanvasFilterBar.jsx";
import { suggestionsByCategory, LABEL_CATEGORIES } from "./labels.js";
import { fetchLabelVocabulary, syncBoardFromBank } from "../team/concept_bank/db.js";
import { ConceptModal } from "./ConceptModal.jsx";
import { ConceptViewPanel } from "./ConceptViewPanel.jsx";
import { ConfigModal } from "./ConfigModal.jsx";
import { ScalingSimulatorModal } from "./scaling_simulator/ScalingSimulatorModal.jsx";
import { GridBackground } from "./GridBackground.jsx";
import { FunnelLines } from "./FunnelLines.jsx";
import { EditableText } from "./EditableText.jsx";
import { updateBoardLabels, updateBoardConfig, updateConcept, archiveEmptyConcepts, deleteConceptsBulk, deleteVariationsBulk } from "./db.js";
import { NicheCleanupModal } from "./NicheCleanupModal.jsx";
import { MergeDuplicateConceptsModal } from "./MergeDuplicateConceptsModal.jsx";
import { StrategyModal } from "./StrategyModal.jsx";
import { useStrategyProducts } from "./useStrategyProducts.jsx";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import {
  canCreateConceptCanvas,
  canEditConceptVariations,
} from "../workspace/permissions/slot_permissions.js";
import { useCompanyMask } from "../lib/censor.jsx";
import { PipelineTypeToggle, pipelineTypeLabel } from "../lib/PipelineTypeToggle.jsx";
import { ConceptBankBrowserModal } from "../team/concept_bank/ConceptBankBrowserModal.jsx";
import { logger } from "../lib/logger.js";

// Canvas infinito estilo Miro para el Despliegue Creativo.
//
// Gestos nativos (sin modificadores):
//   • Pinch trackpad            → zoom (anclado al cursor, exponencial)
//   • Two-finger swipe          → pan
//   • Click + drag              → pan
//   • Ctrl/Cmd + scroll         → zoom
//
// Canvas enorme para que el grid adaptativo nunca se vea "cortado" al alejarse
// o panear fuerte. El título queda fuera del transform (sticky al viewport),
// así nunca se pierde al hacer zoom.
const CANVAS_W = 20000;
const CANVAS_H_MIN = 12000;
const CENTER_X = CANVAS_W / 2;
const CENTER_Y = CANVAS_H_MIN / 2;

// Anchos del embudo (decrecientes) por stage. Deben acomodar DOS columnas
// (estáticos | video), cada una con grilla 3xN de cards de 220px.
// Column width = 3*220 + 2*8 = 676. Two columns + gap 40 = 1392 min.
const STAGE_WIDTHS = { tofu: 3000, mofu: 2400, bofu: 1800 };

// Altura estimada de una concept card según cuántos referentes tiene.
// Card: header (title + desc ~60-90px) + section label (~20px) + grid refs.
// Grid refs es 4 cols de ~46px ancho con aspect 3/4 → ~61px alto cada fila,
// + gap 4. Siempre hay 1 botón "+" (add-tile) si estamos en reference mode.
function computeCardHeight(refsCount) {
  const tiles = (refsCount || 0) + 1; // +1 por el botón "+"
  const refRows = Math.max(1, Math.ceil(tiles / 4));
  const BASE = 105; // title + description + paddings + section label
  const REF_ROW_H = 65; // alto de fila de refs + gap
  return BASE + refRows * REF_ROW_H;
}

// Altura de una columna (static o video): filas de 3 concept-cards, donde cada
// fila usa la altura MÁXIMA entre sus cards (comportamiento natural del grid).
function computeColumnHeight(conceptIds, examplesByConcept) {
  if (!conceptIds || conceptIds.length === 0) return 0;
  const heights = conceptIds.map((id) =>
    computeCardHeight((examplesByConcept[id] || []).length)
  );
  const rows = Math.ceil(heights.length / 3);
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const rowCards = heights.slice(r * 3, r * 3 + 3);
    total += Math.max(...rowCards);
  }
  total += (rows - 1) * 12; // gap entre filas
  return total;
}

// Altura del stage: header + pills + max entre las dos columnas + padding.
function computeStageHeight(staticIds, videoIds, examplesByConcept) {
  const hS = computeColumnHeight(staticIds, examplesByConcept);
  const hV = computeColumnHeight(videoIds, examplesByConcept);
  const columnsH = Math.max(hS, hV, 180);
  return 160 /* stage header (label 64px + sub + margin) */
    + 50 /* pill row por columna */
    + columnsH
    + 30 /* padding inferior */;
}

// Espacio vertical entre stages. Lo bajamos para que el embudo se sienta más
// compacto sin dejar stages pegados entre sí.
const STAGE_GAP = 70;

function buildLayout(concepts, examplesByConcept = {}) {
  const byStage = {
    tofu: { s: [], v: [] },
    mofu: { s: [], v: [] },
    bofu: { s: [], v: [] },
  };
  for (const c of concepts) {
    if (!byStage[c.stage]) continue;
    if (c.format === "static") byStage[c.stage].s.push(c.id);
    else if (c.format === "video") byStage[c.stage].v.push(c.id);
  }
  const tofuH = computeStageHeight(byStage.tofu.s, byStage.tofu.v, examplesByConcept);
  const mofuH = computeStageHeight(byStage.mofu.s, byStage.mofu.v, examplesByConcept);
  const bofuH = computeStageHeight(byStage.bofu.s, byStage.bofu.v, examplesByConcept);

  // Posicionamos el contenido en el CENTRO del canvas (vertical y horizontal).
  // Así `centerOnInit` del TransformWrapper muestra el contenido centrado
  // inicialmente, y el usuario tiene mucho grid alrededor para pan/zoom.
  const totalH = tofuH + STAGE_GAP + mofuH + STAGE_GAP + bofuH;
  const canvasHeight = Math.max(CANVAS_H_MIN, totalH + 4000);
  const contentTop = canvasHeight / 2 - totalH / 2;
  const tofuY = contentTop;
  const mofuY = tofuY + tofuH + STAGE_GAP;
  const bofuY = mofuY + mofuH + STAGE_GAP;
  return {
    stages: [
      { key: "tofu", y: tofuY, height: tofuH, width: STAGE_WIDTHS.tofu },
      { key: "mofu", y: mofuY, height: mofuH, width: STAGE_WIDTHS.mofu },
      { key: "bofu", y: bofuY, height: bofuH, width: STAGE_WIDTHS.bofu },
    ],
    canvasHeight,
  };
}

export function DespliegueCreativo({ companyId, companyName, isAdmin = false, isTeamAdmin = false, onBack, leftOffset = 0, currentMember = null, pipelineType: initialPipelineType = "ads", forcePipelineType = false }) {
  const { isDark } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const displayCompanyName = mask.name(companyName, companyId);
  // Estado interno del tipo. Si forcePipelineType=true (workspace cliente),
  // no se puede cambiar — el caller decide y el toggle no se renderiza.
  const [pipelineType, setPipelineType] = useState(initialPipelineType);

  // Member efectivo para la matriz de permisos. Si Jose entra como admin
  // global lo pasamos con is_admin_global=true.
  const effectiveMember = useMemo(() => {
    if (currentMember) {
      return isAdmin ? { ...currentMember, is_admin_global: true } : currentMember;
    }
    if (isAdmin) return { is_admin_global: true };
    return null;
  }, [currentMember, isAdmin]);

  // Granular caps: crear nuevo concepto vs subir variations a uno existente.
  const canCreateConcept = canCreateConceptCanvas(effectiveMember);
  const canEditVariations = canEditConceptVariations(effectiveMember);
  // El isAdmin viejo controlaba muchas cosas (drag, edit labels, abrir
  // modales). Lo mantenemos como gate de "edición meta" — esa parte sigue
  // siendo PM/owner/admin. Las acciones específicas se gatean abajo.
  const canEditMeta = !!(effectiveMember?.is_admin_global || effectiveMember?.is_owner ||
    (effectiveMember?.roles || []).includes("project_manager"));

  // El board se auto-crea SIEMPRE — cualquier cliente que entre tiene su
  // tablero listo sin esperar a un "asesor". Las permisiones para CREAR
  // concepts/slots siguen gateadas por la matriz de roles más abajo.
  const {
    board, concepts, variations, loading, error, reload, reloadSilent,
    patchBoardConfig, patchConcepts, patchVariations,
  } = useDespliegue({ companyId, canCreate: true, pipelineType });

  const [variationModal, setVariationModal] = useState(null);
  const [conceptModal, setConceptModal] = useState(null);
  const [conceptView, setConceptView] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [nicheCleanupOpen, setNicheCleanupOpen] = useState(false);
  const [mergeDupOpen, setMergeDupOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // 🔄 Sincroniza el despliegue de esta empresa desde el banco (idempotente): trae
  // notas/guion/video actualizados y refs nuevas, sin duplicar formatos.
  // Conceptos vacíos (sin ninguna referencia) — para el botón "limpiar vacíos".
  const emptyConceptIds = useMemo(() => {
    const withVars = new Set((variations || []).map((v) => v.concept_id));
    return (concepts || []).filter((c) => !withVars.has(c.id)).map((c) => c.id);
  }, [concepts, variations]);

  const handleCleanEmpty = async () => {
    const n = emptyConceptIds.length;
    if (!n) return;
    if (!confirm(`¿Archivar ${n} concepto(s) vacío(s) (sin ninguna referencia)? Es reversible.`)) return;
    try {
      const r = await archiveEmptyConcepts(board.id);
      await reloadSilent();
      alert(`🧹 ${r.archived} concepto(s) vacío(s) archivado(s)${r.names?.length ? `: ${r.names.slice(0, 8).join(", ")}${r.names.length > 8 ? "…" : ""}` : ""}.`);
    } catch (e) { alert(`No se pudo limpiar: ${e?.message || e}`); }
  };

  const handleSyncFromBank = async () => {
    if (!confirm("Sincronizar este despliegue desde el banco? Trae notas, guion, video y refs nuevas de cada formato, SOLO de los nichos que esta empresa ya tiene (no mete otros nichos). Sin duplicar.")) return;
    setSyncing(true);
    try {
      const r = await syncBoardFromBank(companyId, pipelineType);
      await reloadSilent();
      const nichesMsg = r.niches?.length ? ` · nichos: ${r.niches.slice(0, 6).join(", ")}${r.niches.length > 6 ? "…" : ""}` : " · todos los nichos (la empresa no tenía filtro)";
      alert(`🔄 Sincronizado: ${r.synced} formato(s) · ${r.added} refs nuevas · ${r.refreshed} refrescadas${r.relocated ? ` · ${r.relocated} reubicadas` : ""}${nichesMsg}.`);
    } catch (e) {
      alert(`No se pudo sincronizar: ${e?.message || e}`);
    } finally { setSyncing(false); }
  };
  // ───── Modo selección + borrado permanente (SOLO admin de equipo) ─────────
  // Permite a Jose seleccionar conceptos y/o referencias LOCALES de ESTE cliente
  // y borrarlos definitivamente (no archivar) — o vaciar todo el despliegue para
  // rehacerlo. NUNCA toca el banco: borra solo filas de despliegue_concepts /
  // despliegue_variations de este board; los conceptos hermanos del banco (otro
  // board, company_id="bank_refs") quedan intactos.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConcepts, setSelectedConcepts] = useState(() => new Set());
  const [selectedRefs, setSelectedRefs] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedConcepts(new Set());
    setSelectedRefs(new Set());
  };
  const toggleSelectionMode = () => {
    if (selectionMode) exitSelection();
    else setSelectionMode(true);
  };
  const toggleConceptSelected = (id) => setSelectedConcepts((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleRefSelected = (id) => setSelectedRefs((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAllConcepts = () => {
    setSelectedConcepts(new Set((concepts || []).map((c) => c.id)));
    setSelectedRefs(new Set());
  };
  const deselectAll = () => {
    setSelectedConcepts(new Set());
    setSelectedRefs(new Set());
  };

  const selectionCount = selectedConcepts.size + selectedRefs.size;

  // Borra los conceptos/refs seleccionados. Los refs cuyo concepto también está
  // seleccionado caen por cascade → no los borramos dos veces.
  const handleDeleteSelected = async () => {
    const conceptIds = [...selectedConcepts];
    const refIds = [...selectedRefs].filter((rid) => {
      const v = (variations || []).find((x) => x.id === rid);
      return !v || !selectedConcepts.has(v.concept_id);
    });
    if (!conceptIds.length && !refIds.length) return;
    const parts = [];
    if (conceptIds.length) parts.push(`${conceptIds.length} concepto(s)`);
    if (refIds.length) parts.push(`${refIds.length} referencia(s)`);
    if (!confirm(
      `¿Eliminar PERMANENTEMENTE ${parts.join(" y ")} del despliegue de ${displayCompanyName || "este cliente"}?\n\n` +
      "Esto los borra SOLO del despliegue de ESTE cliente. NO afecta el Banco de creativos.\n" +
      "Es DEFINITIVO (no es archivar): no se puede deshacer."
    )) return;
    setDeleting(true);
    try {
      if (conceptIds.length) await deleteConceptsBulk(conceptIds);
      if (refIds.length) await deleteVariationsBulk(refIds);
      // Estado local: quitamos conceptos borrados, sus refs (cascade) y las refs
      // sueltas seleccionadas.
      patchConcepts((cs) => cs.filter((c) => !selectedConcepts.has(c.id)));
      patchVariations((vs) => vs.filter((v) => !selectedConcepts.has(v.concept_id) && !selectedRefs.has(v.id)));
      exitSelection();
    } catch (e) {
      alert(`No se pudo eliminar: ${e?.message || e}`);
    } finally { setDeleting(false); }
  };

  // Vacía TODO el despliegue del cliente (todos los conceptos del board) para
  // rehacerlo desde cero. No toca el banco.
  const handleDeleteAll = async () => {
    const ids = (concepts || []).map((c) => c.id);
    if (!ids.length) return;
    if (!confirm(
      `¿ELIMINAR TODO el despliegue de ${displayCompanyName || "este cliente"} (${ids.length} concepto(s) y todas sus referencias)?\n\n` +
      "Esto borra el despliegue de ESTE cliente por completo para rehacerlo desde cero. NO afecta el Banco de creativos.\n" +
      "Es DEFINITIVO (no es archivar): no se puede deshacer."
    )) return;
    setDeleting(true);
    try {
      await deleteConceptsBulk(ids);
      patchConcepts(() => []);
      patchVariations(() => []);
      exitSelection();
    } catch (e) {
      alert(`No se pudo eliminar todo: ${e?.message || e}`);
    } finally { setDeleting(false); }
  };

  const [activeDragId, setActiveDragId] = useState(null);
  // Modo de visualización: referentes (inspiración) vs producidos (anuncios
  // creados por la empresa, ingresados vía pipeline → in_campaign).
  const [viewMode, setViewMode] = useState("reference");

  // Estado del filtro de canvas (etiquetas + links). Disponible para admin y
  // clientes — solo afecta la vista, no los datos.
  const [filters, setFilters] = useState({});
  const [filterMode, setFilterMode] = useState("resaltar");
  const [linkFilter, setLinkFilter] = useState("all");
  const [showLabels, setShowLabels] = useState(false);
  const canvasFilter = useMemo(
    () => ({ filters, linkFilter, mode: filterMode, showLabels }),
    [filters, linkFilter, filterMode, showLabels]
  );

  const transformRef = useRef(null);

  const weekRange = useMemo(() => weekRangeISO(new Date()), []);

  const examplesByConcept = useMemo(() => {
    const map = {};
    for (const v of variations) {
      if (!map[v.concept_id]) map[v.concept_id] = [];
      map[v.concept_id].push(v);
    }
    return map;
  }, [variations]);

  // Vocabulario GLOBAL de etiquetas (todas las marcas/nichos/ángulos del banco)
  // para que al etiquetar elijas de las que ya existen en cualquier concepto.
  // Solo lo carga el admin (el que puede editar etiquetas).
  const [globalVocab, setGlobalVocab] = useState(null);
  useEffect(() => {
    if (canEditVariations) fetchLabelVocabulary().then(setGlobalVocab).catch(() => {});
  }, [canEditVariations]);

  // Sugerencias para el editor: vocabulario global + lo de este tablero.
  const labelSuggestions = useMemo(() => {
    const local = suggestionsByCategory(variations);
    if (!globalVocab) return local;
    const merged = {};
    for (const c of LABEL_CATEGORIES) {
      merged[c.key] = [...new Set([...(globalVocab[c.key] || []), ...(local[c.key] || [])])].sort((a, b) => a.localeCompare(b));
    }
    return merged;
  }, [variations, globalVocab]);

  const conceptsByBucket = useMemo(() => {
    const map = {};
    for (const c of concepts) {
      const k = `${c.stage}/${c.format}`;
      if (!map[k]) map[k] = [];
      map[k].push(c);
    }
    return map;
  }, [concepts]);

  const weekStats = useMemo(
    () => computeWeekStats(concepts, variations, weekRange, board?.config),
    [concepts, variations, weekRange, board?.config]
  );

  // Layout dinámico: las alturas de stage se ajustan al contenido REAL
  // (incluye cantidad de referentes de cada card para estimar altura precisa).
  const { stages: STAGE_LAYOUT, canvasHeight: CANVAS_H } = useMemo(
    () => buildLayout(concepts, examplesByConcept),
    [concepts, examplesByConcept]
  );

  // Labels editables (con fallback a defaults).
  const labels = board?.config?.labels || {};
  const defaultTitle = `DESPLIEGUE CREATIVO: @${(displayCompanyName || "").toUpperCase().replace(/\s+/g, "")}`;

  // Optimistic: aplica el patch localmente primero y persiste en background
  // para evitar flashes. Si la DB falla, logueamos sin romper la UI.
  const saveLabels = (patch) => {
    if (!board?.id) return;
    const currentLabels = board.config?.labels || {};
    const nextLabels = { ...currentLabels, ...patch };
    patchBoardConfig({ labels: nextLabels });
    updateBoardLabels(board.id, patch).catch((e) => logger.error("saveLabels failed", e));
  };

  // Ángulos de venta: markdown por empresa, guardado en la config del board
  // (el cliente ya puede leer su board). Optimista + persiste en background.
  const salesAngles = board?.config?.sales_angles_md || "";
  const saveAngles = async (md) => {
    if (!board?.id) return;
    const nextConfig = { ...(board.config || {}), sales_angles_md: md };
    patchBoardConfig({ sales_angles_md: md });
    await updateBoardConfig(board.id, nextConfig);
  };

  // Estrategia de venta: puntos de contacto estructurados (ángulos/objeciones/
  // conciencia) por empresa, en config.touchpoints. Mismo patrón de persistencia.
  // Estrategia POR PRODUCTO (fuente única: company_voice_profile.products), con
  // selector de producto + espejo a board.config. Ver useStrategyProducts.
  const { touchpoints, selId: strategyProductId, productSelector: strategyProductSelector, saveStrategy: saveTouchpoints } = useStrategyProducts({ companyId, board, patchBoardConfig });
  const hasTouchpoints = !!touchpoints && ["angles", "objections", "awareness"].some((k) => (touchpoints[k] || []).length);

  // Drag & drop: requiere movimiento > 8px para iniciar (evita conflictos con
  // clicks y con el pan del canvas). Options memoizadas — el objeto inline
  // generaba un sensors array nuevo cada render y desestabilizaba el
  // measurement de dnd-kit (React #185).
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 8 } }), []);
  const dndSensors = useSensors(useSensor(PointerSensor, pointerOptions));

  // Usamos DragOverlay para que la card arrastrada se renderice FUERA del canvas
  // zoomeado (en un portal viewport-level). Así el cursor siempre está sobre
  // la card, el collision detection funciona con los rects reales de los
  // buckets, y no hay mismatch entre la posición visual y la lógica de drop.
  const handleDragStart = (event) => setActiveDragId(event.active.id);
  const handleDragCancel = () => setActiveDragId(null);
  const handleDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeConcept = concepts.find((c) => c.id === active.id);
    if (!activeConcept) return;

    const isBucket = typeof over.id === "string" && over.id.startsWith("bucket:");
    let targetStage, targetFormat, targetIdx;
    if (isBucket) {
      const [stageKey, formatKey] = over.id.slice("bucket:".length).split("/");
      targetStage = stageKey;
      targetFormat = formatKey;
      const list = concepts.filter((c) => c.stage === stageKey && c.format === formatKey && c.id !== active.id);
      targetIdx = list.length;
    } else {
      const overConcept = concepts.find((c) => c.id === over.id);
      if (!overConcept) return;
      targetStage = overConcept.stage;
      targetFormat = overConcept.format;
      const list = concepts
        .filter((c) => c.stage === targetStage && c.format === targetFormat && c.id !== active.id)
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      targetIdx = list.findIndex((c) => c.id === overConcept.id);
      if (targetIdx < 0) targetIdx = list.length;
    }

    const bucketList = concepts
      .filter((c) => c.stage === targetStage && c.format === targetFormat && c.id !== active.id)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const movedConcept = { ...activeConcept, stage: targetStage, format: targetFormat };
    bucketList.splice(targetIdx, 0, movedConcept);

    // Optimista: actualiza el array local.
    patchConcepts((prev) => prev.map((c) => {
      if (c.id === activeConcept.id) return { ...movedConcept, order_index: targetIdx };
      const i = bucketList.findIndex((b) => b.id === c.id);
      if (i >= 0) return { ...c, order_index: i };
      return c;
    }));

    // DB: persiste en background.
    Promise.all(
      bucketList.map((c, i) => {
        const patch = { order_index: i };
        if (c.id === activeConcept.id) { patch.stage = targetStage; patch.format = targetFormat; }
        return updateConcept(c.id, patch);
      })
    ).catch((e) => logger.error("handleDragEnd persist failed", e));
  };

  // Pan por ARRASTRE con mouse (y touch/pen) — implementación propia.
  //
  // react-zoom-pan-pinch no paneaba de forma fiable con click-drag de mouse:
  //   • Su pan interno se comportaba distinto según el target y con los
  //     portales (título/stats) fuera del wrapper.
  //   • En la vista CLIENTE no hay cards arrastrables (dnd-kit), así que el
  //     fondo quedaba "muerto": solo el trackpad (wheel) movía el canvas.
  // Solución: deshabilitamos el `panning` de la librería (abajo) y paneamos
  // nosotros con pointer events —unificados para mouse/touch/pen— usando el
  // mismo setTransform imperativo que el wheel handler. Umbral de 4px para no
  // tragarnos los clicks (abrir modal de un referente).
  const panRef = useRef(null);
  const handleCanvasPointerDown = (e) => {
    if (activeDragId) return;               // hay un card en drag (dnd-kit)
    if (!e.isPrimary || e.button !== 0) return;
    // No panear sobre controles, handles de drag o texto editable.
    if (e.target?.closest?.("input,button,textarea,select,a,[data-drag-handle],[data-no-pan]")) return;
    if (!transformRef.current) return;
    const state = transformRef.current.state || transformRef.current.instance?.transformState;
    if (!state) return;
    const session = {
      startX: e.clientX, startY: e.clientY,
      posX: state.positionX, posY: state.positionY, scale: state.scale,
      moved: false,
    };
    panRef.current = session;
    const onMove = (ev) => {
      const p = panRef.current;
      if (!p || !transformRef.current) return;
      const dx = ev.clientX - p.startX;
      const dy = ev.clientY - p.startY;
      if (!p.moved && Math.abs(dx) + Math.abs(dy) < 4) return; // deja pasar el click
      if (!p.moved) {
        p.moved = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      transformRef.current.setTransform(p.posX + dx, p.posY + dy, p.scale, 0);
    };
    const onUp = () => {
      panRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Gestos nativos del trackpad — WHEEL A NIVEL DOCUMENTO.
  //
  // Por qué document-level (no onWheel={} en un div):
  //   • El título y el stats panel se renderizan vía createPortal → son hijos
  //     de document.body, NO del outer div del canvas.
  //   • Si el usuario pincha con el cursor SOBRE el stats panel o el título,
  //     el wheel bubbles desde ese elemento hacia document.body, pasando POR
  //     FUERA del outer div. Un onWheel en el div no lo capturaría.
  //   • Sin preventDefault, el browser interpreta el pinch como zoom nativo
  //     y escala el visual viewport → el stats card "se ve" corrido/desaparece.
  //   • Document-level handler captura SIEMPRE, independientemente del target.
  //
  // Excluimos wheels dentro de modales para permitir scroll nativo ahí.
  useEffect(() => {
    const handleWheel = (e) => {
      // Dejar scroll nativo dentro de modales.
      if (e.target?.closest?.("[data-modal]")) return;
      if (!transformRef.current) return;
      e.preventDefault();
      // v4 expone el state en ref.current.state. Mantenemos fallback a
      // instance.transformState por si la librería cambia.
      const state = transformRef.current.state || transformRef.current.instance?.transformState;
      if (!state) return;
      const { positionX, positionY, scale } = state;

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.01);
        const newScale = Math.min(12, Math.max(0.03, scale * zoomFactor));
        if (newScale === scale) return;
        const cursorX = e.clientX;
        const cursorY = e.clientY;
        const worldX = (cursorX - positionX) / scale;
        const worldY = (cursorY - positionY) / scale;
        const newPosX = cursorX - worldX * newScale;
        const newPosY = cursorY - worldY * newScale;
        transformRef.current.setTransform(newPosX, newPosY, newScale, 0);
      } else {
        transformRef.current.setTransform(
          positionX - e.deltaX,
          positionY - e.deltaY,
          scale,
          0
        );
      }
    };
    // passive:false para que preventDefault bloquee el pinch-zoom del browser.
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  // Lock body to prevent any residual browser pan/zoom while el canvas está
  // montado. Restaura al desmontar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontFamily: T.font, background: T.bg, minHeight: "100vh" }}>
        Cargando despliegue creativo…
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: 20, color: T.red, background: T.bg, minHeight: "100vh" }}>Error: {error}</div>;
  }
  if (!board) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: T.textMuted, fontFamily: T.font, background: T.bg, minHeight: "100vh" }}>
        Preparando tu tablero…
      </div>
    );
  }

  const activeConcept = activeDragId ? concepts.find((c) => c.id === activeDragId) : null;

  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <CanvasFilterContext.Provider value={canvasFilter}>
    <div
      onPointerDown={handleCanvasPointerDown}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: isDark ? "#06060A" : "#F5F5F0",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={0.4}
        minScale={0.03}
        maxScale={12}
        centerOnInit
        limitToBounds={false}
        wheel={{ disabled: true }}
        pinch={{ disabled: true }}
        doubleClick={{ disabled: true }}
        panning={{ disabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: CANVAS_W, height: CANVAS_H }}
            >
              <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
                {/* Grid adaptativo Miro-style */}
                <GridBackground width={CANVAS_W} height={CANVAS_H} isDark={isDark} />

                {/* Líneas diagonales del embudo */}
                <FunnelLines
                  canvasWidth={CANVAS_W}
                  canvasHeight={CANVAS_H}
                  stroke={isDark ? "rgba(255,255,255,0.35)" : "#9A9A92"}
                  stages={STAGE_LAYOUT.map((s) => ({
                    top: s.y,
                    bottom: s.y + s.height,
                    width: s.width,
                    centerX: CENTER_X,
                  }))}
                />

                {/* Título del tablero: parte del contenido del canvas, arriba
                    del funnel. Escala con el zoom como el resto. Editable
                    (doble-click admin) con toolbar A−/A+. */}
                <div style={{
                  position: "absolute",
                  top: STAGE_LAYOUT[0].y - 220,
                  left: 0,
                  width: CANVAS_W,
                  textAlign: "center",
                }}>
                  <EditableText
                    // En modo censor ignoramos el label custom guardado (que
                    // típicamente contiene el nombre real de la empresa) y
                    // usamos siempre el defaultTitle ya enmascarado.
                    value={mask.enabled ? defaultTitle : (labels.title || defaultTitle)}
                    size={labels.title_size || 120}
                    defaultSize={120}
                    minSize={24}
                    maxSize={300}
                    sizeStep={8}
                    onSave={(v, s) => saveLabels({ title: v, title_size: s })}
                    isAdmin={canEditMeta && !mask.enabled}
                    fontWeight={900}
                    letterSpacing="-0.01em"
                    color={isDark ? "#EBEBEB" : "#1A1D1C"}
                  />
                </div>

                {/* Stages */}
                {STAGES.map((stage, idx) => {
                  const layout = STAGE_LAYOUT[idx];
                  return (
                    <StageRow
                      key={stage.key}
                      stage={stage}
                      layout={layout}
                      labels={labels}
                      isDark={isDark}
                      viewMode={viewMode}
                      conceptsByFormat={{
                        static: conceptsByBucket[`${stage.key}/static`] || [],
                        video: conceptsByBucket[`${stage.key}/video`] || [],
                      }}
                      examplesByConcept={examplesByConcept}
                      canEditMeta={canEditMeta}
                      canCreateConcept={canCreateConcept}
                      canEditVariations={canEditVariations}
                      selectionMode={selectionMode}
                      selectedConcepts={selectedConcepts}
                      selectedRefs={selectedRefs}
                      onToggleConcept={toggleConceptSelected}
                      onToggleRef={toggleRefSelected}
                      onEditConcept={(c) => setConceptModal({ concept: c })}
                      onOpenConcept={(c) => setConceptView(c)}
                      onOpenExample={(ex) => setVariationModal({ concept: concepts.find((c) => c.id === ex.concept_id), variation: ex })}
                      onAddExample={(concept) => setVariationModal({ concept, variation: null })}
                      onNewConcept={(stageKey, formatKey) => setConceptModal({
                        stage: stageKey,
                        format: formatKey,
                        nextOrderIndex: (conceptsByBucket[`${stageKey}/${formatKey}`] || []).length,
                      })}
                      onSaveLabels={saveLabels}
                    />
                  );
                })}
              </div>
            </TransformComponent>

            <ZoomControls
              isDark={isDark}
              onZoomIn={() => zoomIn()}
              onZoomOut={() => zoomOut()}
              onReset={() => resetTransform()}
            />
            <HintBadge />
          </>
        )}
      </TransformWrapper>

      {/* Stats panel: portal en document.body para que NUNCA lo atrape un
          ancestor con transform. Siempre viewport-fixed. Se OCULTA mientras hay un
          modal abierto (referencia/concepto) para no taparlo. */}
      {!variationModal && !conceptView && !conceptModal && createPortal(
        <FloatingStatsPanel
          stats={weekStats}
          companyName={displayCompanyName}
          isAdmin={canEditMeta}
          isDark={isDark}
          config={board.config || {}}
          onBack={onBack}
          onOpenConfig={() => setConfigOpen(true)}
          onOpenSimulator={() => setSimulatorOpen(true)}
          onOpenBank={() => setBankOpen(true)}
          onSync={isTeamAdmin ? handleSyncFromBank : null}
          onCleanEmpty={isTeamAdmin && emptyConceptIds.length ? handleCleanEmpty : null}
          emptyCount={emptyConceptIds.length}
          onCleanNiche={isTeamAdmin ? () => setNicheCleanupOpen(true) : null}
          onMergeDups={isTeamAdmin ? () => setMergeDupOpen(true) : null}
          onToggleSelection={isTeamAdmin ? toggleSelectionMode : null}
          selectionMode={selectionMode}
          syncing={syncing}
          onOpenAngles={() => setStrategyOpen(true)}
          hasAngles={hasTouchpoints || !!salesAngles.trim()}
          leftOffset={leftOffset}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          pipelineType={pipelineType}
          onPipelineTypeChange={forcePipelineType ? null : setPipelineType}
        />,
        document.body
      )}

      {/* Barra de filtros flotante — etiquetas + links. Admin y cliente
          (solo cambia la vista, no toca datos). */}
      <CanvasFilterBar
        variations={variations}
        filters={filters}
        onFilters={setFilters}
        linkFilter={linkFilter}
        onLinkFilter={setLinkFilter}
        mode={filterMode}
        onMode={setFilterMode}
        showLabels={showLabels}
        onShowLabels={setShowLabels}
      />

      {/* Barra de selección/borrado — solo visible en modo selección (admin de
          equipo). Borra permanentemente del despliegue de ESTE cliente, no del banco. */}
      {selectionMode && (
        <SelectionToolbar
          isDark={isDark}
          count={selectionCount}
          conceptCount={selectedConcepts.size}
          refCount={selectedRefs.size}
          totalConcepts={(concepts || []).length}
          deleting={deleting}
          onSelectAll={selectAllConcepts}
          onDeselectAll={deselectAll}
          onDeleteSelected={handleDeleteSelected}
          onDeleteAll={handleDeleteAll}
          onExit={exitSelection}
        />
      )}

      {variationModal && (
        <ExampleModal
          conceptId={variationModal.concept?.id}
          conceptName={variationModal.concept?.name}
          variation={variationModal.variation}
          canEdit={isTeamAdmin}
          canEditLabels={canEditVariations}
          labelSuggestions={labelSuggestions}
          onClose={() => setVariationModal(null)}
          onSaved={reloadSilent}
        />
      )}

      {conceptView && (
        <ConceptViewPanel
          concept={conceptView}
          examples={examplesByConcept[conceptView.id] || []}
          isDark={isDark}
          canEdit={canEditMeta}
          onOpenExample={(ex) => setVariationModal({ concept: conceptView, variation: ex })}
          onEditConcept={(c) => setConceptModal({ concept: c })}
          onClose={() => setConceptView(null)}
        />
      )}

      {conceptModal && board && (
        <ConceptModal
          boardId={board.id}
          concept={conceptModal.concept}
          defaultStage={conceptModal.stage}
          defaultFormat={conceptModal.format}
          defaultOrderIndex={conceptModal.nextOrderIndex ?? 0}
          onClose={() => setConceptModal(null)}
          onCreated={(created) => patchConcepts((cs) => [...cs, created])}
          onUpdated={(updated) => patchConcepts((cs) => cs.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))}
          onArchived={(id) => patchConcepts((cs) => cs.filter((c) => c.id !== id))}
        />
      )}

      {configOpen && (
        <ConfigModal
          board={board}
          onClose={() => setConfigOpen(false)}
          onSaved={reloadSilent}
        />
      )}

      {nicheCleanupOpen && (
        <NicheCleanupModal
          variations={variations}
          onClose={() => setNicheCleanupOpen(false)}
          onDone={async (n) => { setNicheCleanupOpen(false); await reloadSilent(); alert(`🧽 ${n} referencia(s) de otros nichos removida(s) del despliegue.`); }}
        />
      )}

      {mergeDupOpen && (
        <MergeDuplicateConceptsModal
          boardId={board.id}
          onClose={() => setMergeDupOpen(false)}
          onDone={async (r) => { setMergeDupOpen(false); await reloadSilent(); alert(r.mode === "merge" ? `🔀 ${r.merged} fusión(es) · ${r.refsMoved} referencia(s) movidas · ${r.archived} concepto(s) viejo(s) archivado(s)${r.dupRemoved ? ` · ${r.dupRemoved} repetidas limpiadas` : ""}.` : `🗑 ${r.archived} concepto(s) viejo(s) borrado(s) del despliegue. Quedó solo el organizado.`); }}
        />
      )}

      {strategyOpen && (
        <StrategyModal
          key={strategyProductId || "general"}
          touchpoints={touchpoints}
          legacyAngles={salesAngles}
          mode={board?.config?.strategy_mode || "items"}
          guide={board?.config?.strategy_guide || {}}
          canEdit={canEditMeta}
          companyName={displayCompanyName}
          boardId={board?.id || null}
          productSelector={canEditMeta ? strategyProductSelector : null}
          onSave={saveTouchpoints}
          onClose={() => setStrategyOpen(false)}
        />
      )}

      {simulatorOpen && (
        <ScalingSimulatorModal
          board={board}
          companyId={companyId}
          onClose={() => setSimulatorOpen(false)}
        />
      )}

      {bankOpen && (
        <ConceptBankBrowserModal
          targetBoardId={board.id}
          targetCompanyId={companyId}
          onClose={() => setBankOpen(false)}
          onDone={() => { setBankOpen(false); reloadSilent(); }}
        />
      )}
    </div>

    {/* DragOverlay: portal viewport-level, renderiza la card arrastrada 1:1
        con el cursor (no escalada por el canvas). El original queda tenue en
        su lugar. Así el collision detection usa rects reales y el drop funciona. */}
    <DragOverlay dropAnimation={null}>
      {activeConcept ? (
        <ConceptCardPresentational
          concept={activeConcept}
          examples={examplesByConcept[activeConcept.id] || []}
          style={{
            transform: `scale(${transformRef.current?.state?.scale ?? transformRef.current?.instance?.transformState?.scale ?? 1})`,
            transformOrigin: "top left",
            boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            cursor: "grabbing",
          }}
        />
      ) : null}
    </DragOverlay>
    </CanvasFilterContext.Provider>
    </DndContext>
  );
}

function StageRow({ stage, layout, labels, isDark, viewMode, conceptsByFormat, examplesByConcept, canEditMeta, canCreateConcept, canEditVariations, selectionMode, selectedConcepts, selectedRefs, onToggleConcept, onToggleRef, onEditConcept, onOpenConcept, onOpenExample, onAddExample, onNewConcept, onSaveLabels }) {
  const leftX = (CANVAS_W - layout.width) / 2;
  const labelKey = `${stage.key}_label`;
  const subKey = `${stage.key}_sub`;
  const sizeKey = `${stage.key}_size`;
  const subSizeKey = `${stage.key}_sub_size`;

  return (
    <div data-tour={stage.key === "tofu" ? "tabs-tofu-mofu-bofu" : undefined} style={{
      position: "absolute",
      top: layout.y,
      left: leftX,
      width: layout.width,
    }}>
      {/* Stage header editable — tamaño default grande, glow neón para look "caro". */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <EditableText
          value={labels?.[labelKey] ?? stage.label}
          size={labels?.[sizeKey] || 64}
          defaultSize={64}
          minSize={24}
          maxSize={120}
          sizeStep={4}
          onSave={(v, s) => onSaveLabels?.({ [labelKey]: v, [sizeKey]: s })}
          isAdmin={canEditMeta}
          fontWeight={900}
          color={stage.color}
          letterSpacing="-0.01em"
          textShadow={`0 0 28px ${stage.color}66, 0 0 12px ${stage.color}55`}
          placeholder={stage.label}
        />
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <EditableText
          value={labels?.[subKey] ?? stage.sub}
          size={labels?.[subSizeKey] || 12}
          defaultSize={12}
          minSize={10}
          maxSize={24}
          sizeStep={1}
          onSave={(v, s) => onSaveLabels?.({ [subKey]: v, [subSizeKey]: s })}
          isAdmin={canEditMeta}
          fontWeight={400}
          color={isDark ? "rgba(255,255,255,0.55)" : "#5A5E5C"}
          placeholder={stage.sub}
        />
      </div>

      {/* Formatos SIDE-BY-SIDE: columna izq = Estáticos, columna der = Video.
          Usamos auto auto + justifyContent center para que las dos columnas
          queden pegadas al centro en vez de pegadas a cada borde del stage. */}
      <div data-tour={stage.key === "tofu" ? "tabs-estaticos-videos" : undefined} style={{
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: 80,
        alignItems: "start",
        justifyContent: "center",
      }}>
        {FORMATS.map((format) => (
          <FormatBlock
            key={format.key}
            stage={stage}
            format={format}
            isDark={isDark}
            viewMode={viewMode}
            concepts={conceptsByFormat[format.key]}
            examplesByConcept={examplesByConcept}
            canEditMeta={canEditMeta}
            canCreateConcept={canCreateConcept}
            canEditVariations={canEditVariations}
            selectionMode={selectionMode}
            selectedConcepts={selectedConcepts}
            selectedRefs={selectedRefs}
            onToggleConcept={onToggleConcept}
            onToggleRef={onToggleRef}
            onEditConcept={onEditConcept}
            onOpenConcept={onOpenConcept}
            onOpenExample={onOpenExample}
            onAddExample={onAddExample}
            onNewConcept={() => onNewConcept(stage.key, format.key)}
          />
        ))}
      </div>
    </div>
  );
}

function FormatBlock({ stage, format, isDark, viewMode, concepts, examplesByConcept, canEditMeta, canCreateConcept, canEditVariations, selectionMode, selectedConcepts, selectedRefs, onToggleConcept, onToggleRef, onEditConcept, onOpenConcept, onOpenExample, onAddExample, onNewConcept }) {
  const bucketId = `bucket:${stage.key}/${format.key}`;
  const { setNodeRef, isOver } = useDroppable({ id: bucketId });
  const sortedIds = concepts.map((c) => c.id);

  return (
    <div>
      {/* Etiqueta + botón + agregar inline */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}>
        <div style={{
          background: isDark ? "#EBEBEB" : "#1A1D1C",
          color: isDark ? "#06060A" : "#fff",
          padding: "8px 22px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "'Inter',sans-serif",
          letterSpacing: "0.06em",
        }}>
          {format.label}
        </div>
        {canCreateConcept && (
          <button
            data-tour={stage.key === "tofu" && format.key === "video" ? "btn-agregar-concepto" : undefined}
            onClick={onNewConcept}
            title="Agregar concepto"
            style={{
              padding: "6px 12px",
              borderRadius: 50,
              border: `1px dashed ${stage.color}`,
              background: "transparent",
              color: stage.color,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Inter',sans-serif",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${stage.color}12`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            + Agregar
          </button>
        )}
      </div>

      {/* Cards: flex-wrap con max-width = 3 * 220 + 2 * 8 = 676px.
          Así 1 card queda centrada bajo la etiqueta, 2 lado a lado, 3 llenan
          la fila, y la 4ta hace wrap a una nueva fila (también centrada). */}
      <SortableContext items={sortedIds} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignContent: "flex-start",
            gap: 8,
            minHeight: 60,
            padding: 4,
            borderRadius: 10,
            maxWidth: 684,
            margin: "0 auto",
            background: isOver ? `${stage.color}12` : "transparent",
            outline: isOver ? `2px dashed ${stage.color}66` : "none",
            transition: "background 0.15s, outline 0.15s",
          }}
        >
          {concepts.map((concept) => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              examples={examplesByConcept[concept.id] || []}
              viewMode={viewMode}
              canEditMeta={canEditMeta}
              canEditVariations={canEditVariations}
              selectionMode={selectionMode}
              conceptSelected={!!selectedConcepts?.has?.(concept.id)}
              selectedRefIds={selectedRefs}
              onToggleConcept={onToggleConcept}
              onToggleRef={onToggleRef}
              onEditConcept={onEditConcept}
              onOpenConcept={onOpenConcept}
              onOpenExample={onOpenExample}
              onAddExample={canEditVariations ? onAddExample : null}
            />
          ))}
          {concepts.length === 0 && (
            <div style={{
              padding: "10px 20px",
              textAlign: "center",
              fontSize: 11,
              color: isDark ? "rgba(255,255,255,0.35)" : "#9A9A92",
              fontStyle: "italic",
              fontFamily: "'Inter',sans-serif",
            }}>
              {canCreateConcept ? "Agrega o arrastra aquí" : "Sin conceptos"}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function FloatingStatsPanel({ stats, companyName, isAdmin, isDark, config, onBack, onOpenConfig, onOpenSimulator, onOpenBank, onSync, syncing = false, onCleanEmpty = null, emptyCount = 0, onCleanNiche = null, onMergeDups = null, onToggleSelection = null, selectionMode = false, onOpenAngles, hasAngles = false, leftOffset = 0, viewMode = "reference", onViewModeChange, pipelineType = "ads", onPipelineTypeChange = null }) {
  const [collapsed, setCollapsed] = useState(false);

  const panelBg = isDark ? "rgba(14,14,20,0.96)" : "rgba(255,255,255,0.96)";
  const panelBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
  const textPrimary = isDark ? "#EBEBEB" : "#1A1D1C";
  const textMuted = isDark ? "rgba(255,255,255,0.5)" : "#7A7E7B";
  const trackBg = isDark ? "rgba(255,255,255,0.08)" : "#E8E8E0";
  const dividerBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed", top: 20, left: 20 + leftOffset,
          padding: "8px 14px", borderRadius: 50,
          border: panelBorder, background: panelBg,
          color: textPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer",
          boxShadow: isDark ? "0 2px 10px rgba(0,0,0,0.4)" : "0 2px 10px rgba(0,0,0,0.08)",
          fontFamily: "'Inter',sans-serif", zIndex: 9999,
        }}
      >
        📊 Stats
      </button>
    );
  }

  const pct = stats.target > 0 ? stats.done / stats.target : 0;
  const pctColor = pct >= 0.8 ? "#1D9E75" : pct >= 0.5 ? "#D4A93B" : "#E24B4A";
  const hasConfig = !!config?.weekly_spend;
  // El target se calcula solo sobre el budget de testing (no el presupuesto
  // total — el resto va a escalar ganadores). Default 30% si no se configuró.
  const testingSharePct = Number(config?.budget_split?.testing ?? 30);
  const testingBudgetCfg = (config?.weekly_spend || 0) * (testingSharePct / 100);
  const budgetPerCreativeCfg = (config?.aov || 0) * (config?.kill_rule_multiplier || 3);
  const targetFromConfig = hasConfig && budgetPerCreativeCfg > 0 && testingBudgetCfg > 0
    ? Math.floor(testingBudgetCfg / budgetPerCreativeCfg)
    : null;

  return (
    <div style={{
      position: "fixed", top: 20, left: 20 + leftOffset, width: 280,
      background: panelBg, backdropFilter: "blur(10px)",
      border: panelBorder, borderRadius: 12,
      padding: "16px 18px", fontFamily: "'Inter',sans-serif", color: textPrimary,
      boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.08)", zIndex: 9999,
      maxHeight: "calc(100vh - 40px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Despliegue
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{companyName || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {isAdmin && onOpenBank && (
            <button onClick={onOpenBank} title="Importar del banco de creativos" style={iconBtn(isDark)}>📚</button>
          )}
          {isAdmin && onSync && (
            <button onClick={onSync} disabled={syncing} title="Sincronizar desde el banco: trae notas/guion/video actualizados y refs nuevas, sin duplicar" style={{ ...iconBtn(isDark), opacity: syncing ? 0.5 : 1 }}>{syncing ? "…" : "🔄"}</button>
          )}
          {isAdmin && onCleanEmpty && (
            <button onClick={onCleanEmpty} title={`Archivar ${emptyCount} concepto(s) vacío(s) (sin ninguna referencia). Reversible.`} style={iconBtn(isDark)}>🧹{emptyCount ? ` ${emptyCount}` : ""}</button>
          )}
          {isAdmin && onCleanNiche && (
            <button onClick={onCleanNiche} title="Limpiar por nicho: remover del despliegue las referencias de nichos que no van (ej. dejar solo Calzado/Ropa). Con preview." style={iconBtn(isDark)}>🧽</button>
          )}
          {isAdmin && onMergeDups && (
            <button onClick={onMergeDups} title="Fusionar conceptos duplicados (ej. 'Comparativo' + 'Comparativo (Bofu)'): conserva el más completo y le mueve las refs. Con preview." style={iconBtn(isDark)}>🧩</button>
          )}
          {isAdmin && onToggleSelection && (
            <button
              onClick={onToggleSelection}
              title="Seleccionar conceptos/referencias para ELIMINAR permanentemente del despliegue de este cliente (no toca el banco)."
              style={selectionMode
                ? { ...iconBtn(isDark), background: "#E24B4A", color: "#fff" }
                : iconBtn(isDark)}
            >☑</button>
          )}
          {isAdmin && (
            <button onClick={onOpenConfig} title="Configurar cadencia" style={iconBtn(isDark)}>⚙</button>
          )}
          {isAdmin && onOpenSimulator && (
            <button onClick={onOpenSimulator} title="Simulador de escala" style={iconBtn(isDark)}>🎯</button>
          )}
          {onBack && (
            <button onClick={onBack} title="Volver" style={iconBtn(isDark)}>←</button>
          )}
          <button onClick={() => setCollapsed(true)} title="Colapsar" style={iconBtn(isDark)}>×</button>
        </div>
      </div>

      {/* Toggle Anuncios / Orgánico — solo admin (workspace cliente NO
          recibe onPipelineTypeChange, siempre ve su tipo fijo). */}
      {onPipelineTypeChange && (
        <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
          <PipelineTypeToggle value={pipelineType} onChange={onPipelineTypeChange} size="sm" />
        </div>
      )}

      {/* Toggle de vista: referentes vs anuncios creados */}
      <div style={{
        display: "flex", gap: 4, padding: 3,
        background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
        borderRadius: 50, marginBottom: 12,
      }}>
        <ModeTab
          label="📚 Referentes"
          active={viewMode === "reference"}
          onClick={() => onViewModeChange?.("reference")}
          isDark={isDark}
        />
        <ModeTab
          label="🚀 Creados"
          active={viewMode === "produced"}
          onClick={() => onViewModeChange?.("produced")}
          isDark={isDark}
        />
      </div>

      {/* Ángulos de venta — visible para el cliente si hay, y para admin siempre
          (para cargarlos). Opcional: si no hay y es cliente, no se muestra. */}
      {onOpenAngles && (isAdmin || hasAngles) && (
        <button
          onClick={onOpenAngles}
          style={{
            width: "100%", marginBottom: 12, padding: "9px 12px", borderRadius: 10,
            border: `1px solid ${hasAngles ? "rgba(201,118,31,0.5)" : (isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)")}`,
            background: hasAngles ? "rgba(201,118,31,0.12)" : "transparent",
            color: hasAngles ? "#D98B3A" : textMuted, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          📇 Estrategia de venta{isAdmin && !hasAngles ? " · agregar" : ""}
        </button>
      )}

      {/* Meta de cadencia (si hay config) */}
      {targetFromConfig !== null && (
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(29,158,117,0.12)", border: "1px solid rgba(29,158,117,0.25)",
          marginBottom: 12, fontSize: 11,
        }}>
          <div style={{ color: textMuted }}>Meta semanal según inversión</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: isDark ? "#3FCF9B" : "#1D9E75" }}>
            {targetFromConfig} creativos
          </div>
        </div>
      )}

      {/* Cumplimiento */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: textMuted }}>Cumplimiento semanal</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: pctColor }}>
            {stats.done} / {stats.target}
          </span>
        </div>
        <div style={{ height: 6, background: trackBg, borderRadius: 50, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(100, pct * 100)}%`, height: "100%",
            background: pctColor, transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Por etapa */}
      <div style={{ marginBottom: 12 }}>
        {STAGES.map((s) => {
          const data = stats.byStage[s.key];
          const p = data.target > 0 ? data.done / data.target : 0;
          return (
            <div key={s.key} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.04em" }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 11, color: textMuted, fontFamily: "monospace" }}>
                  {data.done} / {data.target}
                </span>
              </div>
              <div style={{ height: 4, background: trackBg, borderRadius: 50, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, p * 100)}%`, height: "100%", background: s.color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ paddingTop: 10, borderTop: dividerBorder, fontSize: 10, color: textMuted, lineHeight: 1.4 }}>
        💡 <strong>Mouse:</strong> arrastra para mover · <strong>Trackpad:</strong> pinch zoom · dos dedos pan
      </div>
    </div>
  );
}

// Barra flotante de acciones de selección/borrado. Aparece cuando el admin
// activa el modo selección. Estilo destructivo (rojo DS) para el borrado, que es
// PERMANENTE y solo afecta el despliegue de este cliente (nunca el banco).
function SelectionToolbar({ isDark, count, conceptCount, refCount, totalConcepts, deleting, onSelectAll, onDeselectAll, onDeleteSelected, onDeleteAll, onExit }) {
  const RED = DS.red; // "#E24B4A"
  const panelBg = isDark ? "rgba(14,14,20,0.97)" : "rgba(255,255,255,0.98)";
  const panelBorder = isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)";
  const textPrimary = isDark ? "#EBEBEB" : "#1A1D1C";
  const textMuted = isDark ? "rgba(255,255,255,0.55)" : "#7A7E7B";
  const hasSelection = count > 0;

  const ghostBtn = {
    padding: "8px 14px", borderRadius: 8,
    border: panelBorder, background: "transparent",
    color: textPrimary, fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap",
  };
  const redBtn = (enabled) => ({
    padding: "8px 16px", borderRadius: 8, border: "none",
    background: enabled ? RED : (isDark ? "rgba(226,75,74,0.3)" : "rgba(226,75,74,0.4)"),
    color: "#fff", fontSize: 12, fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.7,
    fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap",
  });

  return (
    <div
      data-no-pan
      style={{
        position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        maxWidth: "calc(100vw - 40px)",
        padding: "10px 14px", borderRadius: 12,
        background: panelBg, border: `1.5px solid ${RED}`,
        boxShadow: isDark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 6px 24px rgba(0,0,0,0.14)",
        backdropFilter: "blur(10px)", zIndex: 10000,
        fontFamily: "'Inter',sans-serif",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: textPrimary, padding: "0 4px" }}>
        {count} seleccionado{count === 1 ? "" : "s"}
        {hasSelection && (
          <span style={{ fontWeight: 600, color: textMuted }}>
            {" "}({conceptCount} concepto{conceptCount === 1 ? "" : "s"}, {refCount} ref{refCount === 1 ? "" : "s"})
          </span>
        )}
      </span>
      <button onClick={onSelectAll} style={ghostBtn} disabled={deleting}>Seleccionar todo</button>
      <button onClick={onDeselectAll} style={ghostBtn} disabled={deleting || !hasSelection}>Deseleccionar</button>
      <button
        onClick={onDeleteSelected}
        style={redBtn(hasSelection && !deleting)}
        disabled={!hasSelection || deleting}
        title="Eliminar los seleccionados del despliegue de ESTE cliente (permanente, no el banco)"
      >
        {deleting ? "Eliminando…" : "🗑 Eliminar seleccionados"}
      </button>
      <button
        onClick={onDeleteAll}
        style={redBtn(totalConcepts > 0 && !deleting)}
        disabled={totalConcepts === 0 || deleting}
        title="Eliminar TODO el despliegue de este cliente para rehacerlo (permanente, no el banco)"
      >
        Eliminar todo (rehacer)
      </button>
      <button onClick={onExit} style={ghostBtn} disabled={deleting}>Salir</button>
    </div>
  );
}

function ModeTab({ label, active, onClick, isDark }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 10px",
        borderRadius: 50,
        border: "none",
        background: active
          ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.95)")
          : "transparent",
        color: active
          ? (isDark ? "#EBEBEB" : "#1A1D1C")
          : (isDark ? "rgba(255,255,255,0.5)" : "#7A7E7B"),
        fontSize: 11, fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s, color 0.15s",
        boxShadow: active
          ? (isDark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.08)")
          : "none",
      }}
    >
      {label}
    </button>
  );
}

function ZoomControls({ isDark, onZoomIn, onZoomOut, onReset }) {
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      display: "flex", flexDirection: "column", gap: 6, zIndex: 9999,
    }}>
      <button onClick={onZoomIn} title="Acercar" style={zoomBtn(isDark)}>+</button>
      <button onClick={onReset} title="Centrar" style={{ ...zoomBtn(isDark), fontSize: 14 }}>⊙</button>
      <button onClick={onZoomOut} title="Alejar" style={zoomBtn(isDark)}>−</button>
    </div>
  );
}

function HintBadge() {
  return null;
}

function iconBtn(isDark = false) {
  return {
    width: 26, height: 26, border: "none",
    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    color: isDark ? "rgba(255,255,255,0.7)" : "#3A3D3C",
    borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

function zoomBtn(isDark = false) {
  return {
    width: 36, height: 36,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
    background: isDark ? "rgba(14,14,20,0.96)" : "#FFFFFF",
    color: isDark ? "#EBEBEB" : "#1A1D1C",
    borderRadius: 8,
    cursor: "pointer", fontSize: 18, fontWeight: 400,
    fontFamily: "inherit",
    boxShadow: isDark ? "0 2px 6px rgba(0,0,0,0.4)" : "0 2px 6px rgba(0,0,0,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

function computeWeekStats(concepts, variations, weekRange, config) {
  const byStage = {
    tofu: { target: 0, done: 0 },
    mofu: { target: 0, done: 0 },
    bofu: { target: 0, done: 0 },
  };
  const variationsByConcept = {};
  for (const v of variations) {
    if (!variationsByConcept[v.concept_id]) variationsByConcept[v.concept_id] = [];
    variationsByConcept[v.concept_id].push(v);
  }

  // Targets por etapa: si hay config con inversión/AOV/distribución, derivamos
  // los targets del total semanal * distribución. Así el usuario ve 60/30/10
  // aunque no haya clickeado "aplicar a conceptos". Si no hay config, caemos
  // al sum de concept.weekly_target.
  const spend = Number(config?.weekly_spend) || 0;
  const aov = Number(config?.aov) || 0;
  const mult = Number(config?.kill_rule_multiplier) || 3;
  const dist = config?.distribution;
  // Testing share: % del presupuesto destinado a probar creativos nuevos
  // (el resto se escala). Default 30% para compatibilidad con configs viejas.
  const testingShare = Number(config?.budget_split?.testing ?? 30);
  const hasConfigTargets = spend > 0 && aov > 0 && dist;

  if (hasConfigTargets) {
    const testingBudget = spend * (testingShare / 100);
    const perCreative = aov * mult;
    const total = perCreative > 0 ? Math.floor(testingBudget / perCreative) : 0;
    byStage.tofu.target = Math.round((total * (dist.tofu || 0)) / 100);
    byStage.mofu.target = Math.round((total * (dist.mofu || 0)) / 100);
    byStage.bofu.target = Math.round((total * (dist.bofu || 0)) / 100);
  } else {
    for (const c of concepts) {
      if (byStage[c.stage]) byStage[c.stage].target += c.weekly_target || 0;
    }
  }

  for (const c of concepts) {
    const vs = variationsByConcept[c.id] || [];
    // Solo cuentan los creativos PRODUCIDOS (anuncios ya montados en campaña,
    // vía pipeline → in_campaign). Los referentes NO suman al cumplimiento —
    // son inspiración, no creativos ejecutados por la empresa.
    const inWeek = vs.filter((v) => {
      if (v.source_type !== "produced") return false;
      if (!v.produced_at) return false;
      const d = new Date(v.produced_at);
      return d >= weekRange.from && d <= weekRange.to;
    }).length;
    if (byStage[c.stage]) byStage[c.stage].done += inWeek;
  }

  const target = byStage.tofu.target + byStage.mofu.target + byStage.bofu.target;
  const done = byStage.tofu.done + byStage.mofu.done + byStage.bofu.done;
  return { byStage, target, done };
}
