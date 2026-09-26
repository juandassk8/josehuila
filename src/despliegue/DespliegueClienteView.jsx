// Despliegue creativo — VISTA CLIENTE (solo lectura).
// Componente NUEVO y aislado: se usa SOLO en la rama del cliente del render
// (App.jsx). La vista admin (DespliegueCreativo.jsx) queda intacta.
// Reskin del handoff "Cliente — Despliegue": header + toolbar (3 layouts) +
// embudo TOFU/MOFU/BOFU · Conceptos / Colmena / Grilla + popover de filtros +
// panel flotante read-only (Anuncios|Orgánico · Referentes|Creados) + modales
// PROPIOS del cliente (concepto, referencia, cadencia) + StrategyModal read-only.
// Read-only: sin drag, sin agregar/editar, sin config editable, sin simulador.
import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useCompanyMask } from "../lib/censor.jsx";
import { transcribeVariation } from "./transcribeRef.js";
import { useDespliegue } from "./hooks.js";
import { updateBoardConfig, applyTargetsToConcepts, deleteConceptsBulk, deleteVariationsBulk, createVariation } from "./db.js";
import { ConfirmarAccion } from "../lib/ConfirmarAccion.jsx";
import { toast } from "../lib/toast.js";
import { AddProducedModal } from "./AddProducedModal.jsx";
import { WinnersScorecard } from "./WinnersScorecard.jsx";
import { toastError, toastSuccess } from "../lib/toast.js";
import { STAGES, FORMATS, weekRangeISO } from "./constants.js";
import { getLabels, variationMatches, normLabel, LABEL_CATEGORIES, CATEGORY_BY_KEY,
  ordenarPorPrioridad, cuantasPrioritarias, hayPrioridades } from "./labels.js";
import { PrioridadesModal } from "./PrioridadesPanel.jsx";
import { StrategyModal, normalizeTouchpoints, normalizeGuide } from "./StrategyModal.jsx";
import { useStrategyProducts } from "./useStrategyProducts.jsx";
import { ConceptModal } from "./ConceptModal.jsx";
import { syncBoardFromBank } from "../team/concept_bank/db.js";
import { ExampleThumb } from "./ConceptCard.jsx";
import { isDriveLink, drivePreviewUrl, driveDownloadUrl } from "../lib/driveLinks.js";

// ── Iconos SVG de trazo (cero emoji) ──
const IC = {
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5",
  filter: "M3 5h18M6 12h12M10 19h4",
  // Barras de distinto largo, de mayor a menor: un orden, no un filtro.
  sort: "M4 6h13M4 12h9M4 18h5",
  chevron: "M9 5l7 7-7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronDown: "M6 9.5l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  x: "M18 6 6 18M6 6l12 12",
  play: "M8 5v14l11-7z",
  image: "M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12A1.5 1.5 0 0 1 4.5 4.5zM3 16l5-4 3 2.5 4-3.5 6 5",
  layers: "M12 3 2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  concepts: "M4 5h16v6H4zM4 15h10v4H4z",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z",
  funnel: "M3 5h18l-7 8v6l-4-2v-4L3 5z",
  mail: "M4 5h16v14H4zM4 6l8 6 8-6",
  doc: "M4 5h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zM8 9h8M8 13h5",
  download: "M12 3v12M7 11l5 5 5-5M4 21h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  pencil: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3",
  check: "M4 12l5 5L20 6",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6",
  sync: "M20 11a8 8 0 1 0-.5 4M20 5v6h-6",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
};
const Icon = ({ d, size = 15, sw = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
    <path d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Colores de etapa (README §10). Texto/relleno por tema.
function stageColor(key, isDark) {
  const map = {
    tofu: isDark ? "#27E38F" : "#0F8F5B",
    mofu: isDark ? "#FFD23F" : "#8A6A12",
    bofu: isDark ? "#FF5A5A" : "#C4302F",
  };
  return map[key] || "var(--sel)";
}
const STAGE_WIDTH = { tofu: "100%", mofu: "84%", bofu: "68%" };
const LABEL_FILTER_CATS = LABEL_CATEGORIES.filter((c) => c.key !== "formato"); // Formato se filtra por concepto

// Moneda configurable por empresa (config.currency, ISO). La cadencia formatea
// montos con { symbol, locale } y muestra el code (p. ej. "USD por semana").
const CURRENCIES = {
  COP: { symbol: "$",   locale: "es-CO", label: "Peso colombiano" },
  USD: { symbol: "US$", locale: "en-US", label: "Dólar" },
  MXN: { symbol: "$",   locale: "es-MX", label: "Peso mexicano" },
  GTQ: { symbol: "Q",   locale: "es-GT", label: "Quetzal" },
  PEN: { symbol: "S/",  locale: "es-PE", label: "Sol" },
  CLP: { symbol: "$",   locale: "es-CL", label: "Peso chileno" },
  ARS: { symbol: "$",   locale: "es-AR", label: "Peso argentino" },
  EUR: { symbol: "€",   locale: "es-ES", label: "Euro" },
  BRL: { symbol: "R$",  locale: "pt-BR", label: "Real" },
};
const CURRENCY_CODES = Object.keys(CURRENCIES);
const currencyOf = (code) => CURRENCIES[code] || CURRENCIES.COP;

export function DespliegueClienteView({ companyId, companyName, pipelineType = "ads", onNavigate, isAdmin = false, onEdit, esInforce = false, verComoCliente = false, onVerComoCliente }) {
  const { isDark } = useTheme();
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);

  // Cadencia y Estrategia de venta: las puede editar CUALQUIERA que vea su propio
  // despliegue (admin Y cliente) — es su data (inversión, CPA, ángulos, etc.). El
  // botón "Editar despliegue" (canvas completo, mover/borrar conceptos) sigue solo
  // para admin (prop isAdmin real).
  const canEditConfig = true;

  // pipeline (Anuncios|Orgánico) re-consulta el board; view (Referentes|Creados)
  // filtra por source_type de la variación.
  const [pipeline, setPipeline] = useState(pipelineType);
  const [view, setView] = useState("reference"); // reference | produced

  const { board, concepts, variations, loading, error, patchBoardConfig, patchConcepts, patchVariations, reloadSilent } = useDespliegue({ companyId, canCreate: false, pipelineType: pipeline });

  // Estrategia POR PRODUCTO (fuente única = company_voice_profile.products), con
  // selector de producto + espejo a board.config para la vista read-only del cliente.
  const { touchpoints: strategyTouchpoints, selId: strategyProductId, productSelector: strategyProductSelector, saveStrategy } = useStrategyProducts({ companyId, board, patchBoardConfig });

  // Agregar anuncio creado a mano (base de información de formatos/guiones que funcionaron).
  const [addProducedConcept, setAddProducedConcept] = useState(null);
  const [winnersOpen, setWinnersOpen] = useState(false);
  const saveProduced = async (concept, payload) => {
    if (!concept?.id) return;
    try {
      await createVariation({
        concept_id: concept.id, source_type: "produced", state: "produced", label: "Producido",
        name: payload.name, drive_url: payload.drive_url, file_url: payload.file_url, transcript: payload.transcript,
        metrics: payload.metrics || {}, dims: payload.dims || {},
      });
      await reloadSilent();
    } catch (e) {
      toastError("No se pudo agregar el anuncio: " + (e?.message || e));
      throw e;   // el modal se queda abierto (no cierra en error)
    }
  };

  const [layout, setLayout] = useState("conceptos"); // conceptos | colmena | grilla
  const [stageFilter, setStageFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [labelFilters, setLabelFilters] = useState({}); // { marca:[], nicho:[], subnicho:[], angulo:[] }
  const [filterMode, setFilterMode] = useState("resaltar"); // resaltar | ocultar
  const [filterOpen, setFilterOpen] = useState(false);
  const [prioridadesOpen, setPrioridadesOpen] = useState(false);
  const [filterTab, setFilterTab] = useState("etapa");
  const [conceptView, setConceptView] = useState(null);
  const [refModal, setRefModal] = useState(null);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyEdit, setStrategyEdit] = useState(false); // admin: abre StrategyModal editable encima del tablero
  const [cadenceOpen, setCadenceOpen] = useState(false);

  // ───── Modo admin: gestión completa del despliegue DENTRO de esta vista ─────
  // TODO lo de acá está gateado por `isAdmin` en el render. El cliente (isAdmin
  // false) nunca ve ninguna de estas piezas: el botón, el panel, los checkboxes,
  // el editor ni el ConceptModal. `adminMode` arranca en OFF → la vista es
  // idéntica a la del cliente hasta que el admin abre "Administrar".
  // Espeja el modo selección de DespliegueCreativo (borrado PERMANENTE del
  // despliegue de ESTE cliente — jamás toca el Banco).
  const [adminMode, setAdminMode] = useState(false);
  const [selectedConcepts, setSelectedConcepts] = useState(() => new Set());
  const [selectedRefs, setSelectedRefs] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Las confirmaciones van DENTRO del portal. `confirm()` es una caja del sistema
  // operativo y, sobre todo, congela la pestaña entera hasta que alguien la
  // cierre a mano. Hasta ahora nadie llegaba a estas acciones; con el arreglo de
  // permisos pasan a ser el camino normal, y una de ellas vacía el despliegue.
  const [accion, setAccion] = useState(null);
  const [conceptModal, setConceptModal] = useState(null); // { concept } → editar concepto

  const exitAdmin = () => {
    setAdminMode(false);
    setSelectedConcepts(new Set());
    setSelectedRefs(new Set());
  };
  const clearSelection = () => { setSelectedConcepts(new Set()); setSelectedRefs(new Set()); };
  const toggleConceptSelected = (id) => setSelectedConcepts((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const toggleRefSelected = (id) => setSelectedRefs((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const selectAllConcepts = () => { setSelectedConcepts(new Set((concepts || []).map((c) => c.id))); setSelectedRefs(new Set()); };

  const selectionCount = selectedConcepts.size + selectedRefs.size;

  // Borra conceptos/refs seleccionados. Refs cuyo concepto también está
  // seleccionado caen por cascade → no se borran dos veces. Igual patrón y
  // confirmación que DespliegueCreativo.handleDeleteSelected.
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
    setAccion({
      titulo: `Eliminar ${parts.join(" y ")} de ${displayName || "este cliente"}`,
      detalle: "Se borran solo del despliegue de esta empresa. El Banco de creativos no se toca.",
      aviso: "Es definitivo: no es archivar, no se puede deshacer.",
      ok: "Eliminar",
      peligro: true,
      onOk: () => borrarSeleccion(conceptIds, refIds),
    });
  };
  const borrarSeleccion = async (conceptIds, refIds) => {
    setDeleting(true);
    try {
      if (conceptIds.length) await deleteConceptsBulk(conceptIds);
      if (refIds.length) await deleteVariationsBulk(refIds);
      patchConcepts((cs) => cs.filter((c) => !selectedConcepts.has(c.id)));
      patchVariations((vs) => vs.filter((v) => !selectedConcepts.has(v.concept_id) && !selectedRefs.has(v.id)));
      clearSelection();
    } catch (e) {
      toast(`No se pudo eliminar: ${e?.message || e}`);
    } finally { setDeleting(false); }
  };

  // Vacía TODO el despliegue del cliente para rehacerlo. No toca el banco.
  const handleDeleteAll = async () => {
    const ids = (concepts || []).map((c) => c.id);
    if (!ids.length) return;
    setAccion({
      titulo: `Vaciar el despliegue de ${displayName || "este cliente"}`,
      detalle: `Se borran los ${ids.length} conceptos y todas sus referencias, para rehacerlo desde cero. El Banco de creativos no se toca.`,
      aviso: "Es definitivo: no es archivar, no se puede deshacer.",
      ok: "Vaciar despliegue",
      peligro: true,
      onOk: () => borrarTodo(ids),
    });
  };
  const borrarTodo = async (ids) => {
    setDeleting(true);
    try {
      await deleteConceptsBulk(ids);
      patchConcepts(() => []);
      patchVariations(() => []);
      clearSelection();
    } catch (e) {
      toast(`No se pudo eliminar todo: ${e?.message || e}`);
    } finally { setDeleting(false); }
  };

  // Sincroniza desde el Banco (mismo handler que DespliegueCreativo). Trae
  // refs/notas/guion nuevas de los nichos que la empresa ya tiene. Sin duplicar.
  const handleSyncFromBank = async () => {
    setAccion({
      titulo: "Sincronizar este despliegue desde el Banco",
      detalle: "Trae notas, guion, video y referencias nuevas de cada formato, solo de los nichos que esta empresa ya tiene. No mete nichos ajenos ni duplica lo que ya está.",
      ok: "Sincronizar",
      onOk: correrSync,
    });
  };
  const correrSync = async () => {
    setSyncing(true);
    try {
      const r = await syncBoardFromBank(companyId, pipeline);
      await reloadSilent();
      const nichesMsg = r.niches?.length ? ` · nichos: ${r.niches.slice(0, 6).join(", ")}${r.niches.length > 6 ? "…" : ""}` : " · todos los nichos (la empresa no tenía filtro)";
      toast(`${r.synced} formato(s) · ${r.added} refs nuevas · ${r.refreshed} refrescadas${r.relocated ? ` · ${r.relocated} reubicadas` : ""}`, "success");
    } catch (e) {
      toast(`No se pudo sincronizar: ${e?.message || e}`);
    } finally { setSyncing(false); }
  };

  // Variaciones de la vista activa (Referentes vs Creados) por source_type.
  const viewVariations = useMemo(
    () => variations.filter((v) => (view === "produced"
      ? v.source_type === "produced"
      : (v.source_type || "reference") === "reference")),
    [variations, view]
  );

  // Resumen general de resultados de los creativos producidos (métricas del Feedback).
  const producedAgg = useMemo(() => {
    if (view !== "produced") return null;
    const num = (s) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
    const withM = viewVariations.filter((v) => v.metrics && Object.values(v.metrics).some((x) => x));
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    return {
      count: viewVariations.length,
      withMetrics: withM.length,
      gasto: withM.reduce((a, v) => a + num(v.metrics.gasto), 0),
      resultados: withM.reduce((a, v) => a + num(v.metrics.resultados), 0),
      roas: avg(withM.map((v) => num(v.metrics.roas)).filter((x) => x > 0)),
      cpa: avg(withM.map((v) => num(v.metrics.cpa)).filter((x) => x > 0)),
    };
  }, [view, viewVariations]);

  const examplesByConcept = useMemo(() => {
    const m = {};
    for (const v of viewVariations) (m[v.concept_id] ||= []).push(v);
    return m;
  }, [viewVariations]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (stageFilter !== "all") n++;
    if (formatFilter !== "all") n++;
    for (const k in labelFilters) n += (labelFilters[k] || []).length;
    return n;
  }, [stageFilter, formatFilter, labelFilters]);

  const anyLabelFilter = useMemo(() => Object.values(labelFilters).some((a) => (a || []).length), [labelFilters]);

  // Refs que matchean los filtros de etiqueta (para contar y para visibilidad).
  const refMatches = (ref) => (anyLabelFilter ? variationMatches(ref, labelFilters) : true);

  // Lo que esta cuenta quiere ver primero. Sin configurar, `ordenarPorPrioridad`
  // devuelve la misma lista y nada de esto cambia el orden.
  const prioridades = board?.config?.prioridades || null;

  // Guarda y pinta al toque. `patchBoardConfig` solo actualiza en memoria —es
  // para no parpadear—, así que la escritura va aparte.
  const guardarPrioridades = async (p) => {
    if (!board?.id) return;
    try {
      await updateBoardConfig(board.id, { ...(board.config || {}), prioridades: p });
      patchBoardConfig({ prioridades: p });
      toastSuccess("Listo — tus referencias ya salen en ese orden");
    } catch (e) {
      toastError("No se pudieron guardar las prioridades: " + (e?.message || e));
      throw e;   // el modal se queda abierto
    }
  };

  // Concepto visible + refs que matchean, ya ordenadas por prioridad.
  const conceptData = useMemo(() => {
    const datos = concepts.map((c) => {
      const refs = ordenarPorPrioridad(examplesByConcept[c.id] || [], prioridades);
      const matched = refs.filter(refMatches);
      const stageOk = stageFilter === "all" || c.stage === stageFilter;
      const formatOk = formatFilter === "all" || c.format === formatFilter;
      const visible = stageOk && formatOk && (!anyLabelFilter || matched.length > 0);
      return { concept: c, refs, matched, visible, prio: cuantasPrioritarias(refs, prioridades) };
    });
    // Las tarjetas también se mueven: la que tiene MÁS referencias de lo que te
    // interesa sube. Por cantidad y no por "tiene al menos una", para que una
    // tarjeta con diez referencias buenas no quede debajo de otra con una sola.
    //
    // El orden es global pero el embudo no se rompe: el render agrupa por etapa
    // después, así que esto solo reordena adentro de Tofu, Mofu y Bofu.
    if (!hayPrioridades(prioridades)) return datos;
    return datos.map((d, i) => ({ d, i })).sort((a, b) => (b.d.prio - a.d.prio) || (a.i - b.i)).map((x) => x.d);
  }, [concepts, examplesByConcept, stageFilter, formatFilter, labelFilters, anyLabelFilter, prioridades]);

  const visibleConcepts = conceptData.filter((d) => d.visible);
  const totalRefsShown = visibleConcepts.reduce((n, d) => n + (anyLabelFilter ? d.matched.length : d.refs.length), 0);

  // Escape en cascada: referencia → concepto → estrategia/cadencia → popover.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (conceptModal) setConceptModal(null);      // editor de concepto (admin)
      else if (refModal) setRefModal(null);
      else if (conceptView) setConceptView(null);
      else if (strategyEdit) setStrategyEdit(false);
      else if (strategyOpen) setStrategyOpen(false);
      else if (cadenceOpen) setCadenceOpen(false);
      else if (adminMode) exitAdmin();              // salir del modo admin
      else if (filterOpen) setFilterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conceptModal, refModal, conceptView, strategyEdit, strategyOpen, cadenceOpen, adminMode, filterOpen]);

  // ── Estados ──
  if (loading) return <Shell displayName={displayName} isAdmin={isAdmin} onEdit={onEdit} esInforce={esInforce} verComoCliente={verComoCliente} onVerComoCliente={onVerComoCliente}><LoadingState /></Shell>;
  if (error) return <Shell displayName={displayName} isAdmin={isAdmin} onEdit={onEdit} esInforce={esInforce} verComoCliente={verComoCliente} onVerComoCliente={onVerComoCliente}><EmptyState kind="error" onNavigate={onNavigate} pipeline={pipeline} onBackToAds={() => setPipeline("ads")} /></Shell>;
  if (!board) return <Shell displayName={displayName} isAdmin={isAdmin} onEdit={onEdit} esInforce={esInforce} verComoCliente={verComoCliente} onVerComoCliente={onVerComoCliente}><EmptyState kind="sin-despliegue" onNavigate={onNavigate} pipeline={pipeline} onBackToAds={() => setPipeline("ads")} /></Shell>;
  if (concepts.length === 0) return <Shell displayName={displayName} isAdmin={isAdmin} onEdit={onEdit} esInforce={esInforce} verComoCliente={verComoCliente} onVerComoCliente={onVerComoCliente}><EmptyState kind="vacio" onNavigate={onNavigate} pipeline={pipeline} onBackToAds={() => setPipeline("ads")} /></Shell>;

  const clearFilters = () => { setStageFilter("all"); setFormatFilter("all"); setLabelFilters({}); };
  const noMatch = filterMode === "ocultar" && visibleConcepts.length === 0;

  // Refs del concepto abierto (respetando el filtro activo).
  const cvRefsAll = conceptView ? (examplesByConcept[conceptView.id] || []) : [];
  const cvRefs = anyLabelFilter ? cvRefsAll.filter(refMatches) : cvRefsAll;

  return (
    <Shell displayName={displayName} isAdmin={isAdmin} onEdit={onEdit} esInforce={esInforce} verComoCliente={verComoCliente} onVerComoCliente={onVerComoCliente}>
      {/* Toolbar sticky */}
      <div style={{
        position: "sticky", top: 0, zIndex: 25, background: "var(--bg)",
        paddingBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <Segmented
          options={[
            { key: "conceptos", label: "Conceptos", icon: IC.concepts },
            { key: "colmena", label: "Colmena", icon: IC.layers },
            { key: "grilla", label: "Grilla", icon: IC.grid },
          ]}
          value={layout}
          onChange={setLayout}
        />
        <span style={{ fontSize: 12.5, color: "var(--ink-3)", letterSpacing: "-0.01em" }}>
          {visibleConcepts.length} conceptos · {totalRefsShown} referencias
        </span>
        <span style={{ flex: 1 }} />
        {/* Ganadores — SOLO en la vista Creados. Abre el scorecard de rendimiento. */}
        {view === "produced" && (
          <button
            data-action="despliegue.ganadores"
            onClick={() => setWinnersOpen(true)}
            title="Ranking de tus creativos producidos por rendimiento: qué formatos, ángulos, etapas y creadores ganan."
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12,
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--ink-2)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            🏆 Ganadores
          </button>
        )}
        {/* Botón de MODO ADMIN — SOLO admin. El cliente (isAdmin false) nunca lo
            ve. Abre "Administrar" (gestión in-view: seleccionar/eliminar/editar/
            sincronizar) sin salir a la vista de edición vieja. */}
        {isAdmin && (
          <button
            data-action="new:despliegue.administrar"
            onClick={() => setAdminMode(true)}
            title="Gestionar el despliegue de este cliente: seleccionar y eliminar conceptos/referencias, editar conceptos y sincronizar desde el banco. Permanente, no toca el Banco."
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12,
              border: "1px solid rgba(111,184,255,0.5)", background: "var(--sel-soft)",
              color: "var(--sel)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            <Icon d={IC.sliders} size={14} sw={1.9} /> Administrar
          </button>
        )}
        <div style={{ position: "relative" }} data-menu-root>
          <button
            data-action="despliegue.filtrar"
            onClick={() => setFilterOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12,
              border: `1px solid ${activeFilterCount ? "rgba(111,184,255,0.5)" : "var(--line)"}`,
              background: activeFilterCount ? "var(--sel-soft)" : "var(--surface)",
              color: activeFilterCount ? "var(--sel)" : "var(--ink-2)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            <Icon d={IC.filter} size={14} sw={1.9} />
            Opciones de filtro{activeFilterCount ? ` · ${activeFilterCount}` : ""}
          </button>
          {/* Va pegado al filtro porque es el mismo tema: qué veo y en qué orden.
              El filtro es para este rato; la prioridad queda guardada. */}
          {canEditConfig && (
            <button
              onClick={() => setPrioridadesOpen(true)}
              title="En qué orden querés ver las referencias"
              style={{
                marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12,
                border: `1px solid ${hayPrioridades(prioridades) ? "rgba(111,184,255,0.5)" : "var(--line)"}`,
                background: hayPrioridades(prioridades) ? "var(--sel-soft)" : "var(--surface)",
                color: hayPrioridades(prioridades) ? "var(--sel)" : "var(--ink-2)", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
              <Icon d={IC.sort} size={14} sw={1.9} />
              Mis prioridades
            </button>
          )}
          {filterOpen && (
            <FilterPopover
              variations={variations}
              stageFilter={stageFilter} setStageFilter={setStageFilter}
              formatFilter={formatFilter} setFormatFilter={setFormatFilter}
              labelFilters={labelFilters} setLabelFilters={setLabelFilters}
              filterMode={filterMode} setFilterMode={setFilterMode}
              filterTab={filterTab} setFilterTab={setFilterTab}
              onClear={clearFilters}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Chips de filtro activo */}
      {activeFilterCount > 0 && (
        <ActiveChips
          stageFilter={stageFilter} setStageFilter={setStageFilter}
          formatFilter={formatFilter} setFormatFilter={setFormatFilter}
          labelFilters={labelFilters} setLabelFilters={setLabelFilters}
          filterMode={filterMode} onClear={clearFilters}
        />
      )}

      {/* Vista activa */}
      {noMatch ? (
        <EmptyState kind="sin-match" onNavigate={onNavigate} onClear={clearFilters} />
      ) : layout === "grilla" ? (
        <GridView data={conceptData} isDark={isDark} anyLabelFilter={anyLabelFilter} filterMode={filterMode}
          onOpenConcept={setConceptView} onOpenRef={(concept, ref, list) => setRefModal({ concept, ref, list })} />
      ) : (
        <FunnelCanvas
          data={conceptData} layout={layout} isDark={isDark} companyName={displayName}
          view={view} anyLabelFilter={anyLabelFilter} filterMode={filterMode} producedAgg={producedAgg}
          onOpenConcept={setConceptView}
          onOpenRef={(concept, ref, list) => setRefModal({ concept, ref, list })}
        />
      )}

      {/* Panel flotante read-only — se oculta cuando hay un modal abierto (no tapar)
          y en Grilla (vista de documento, no canvas) donde tapaba/cortaba las tarjetas. */}
      {layout !== "grilla" && !conceptView && !refModal && !strategyOpen && !cadenceOpen && !winnersOpen && (
        <FloatingPanel
          companyName={displayName} config={board?.config || {}} concepts={concepts} variations={variations}
          isDark={isDark}
          pipeline={pipeline} setPipeline={setPipeline}
          view={view} setView={setView}
          onOpenStrategy={() => setStrategyOpen(true)} onOpenCadence={() => setCadenceOpen(true)}
        />
      )}

      {/* Modales del cliente */}
      {conceptView && (
        <ConceptDetailCliente
          concept={conceptView}
          refs={cvRefs}
          totalRefs={cvRefsAll.length}
          anyLabelFilter={anyLabelFilter}
          view={view}
          isDark={isDark}
          isAdmin={canEditConfig}
          onAddProduced={() => setAddProducedConcept(conceptView)}
          onOpenRef={(ref) => setRefModal({ concept: conceptView, ref, list: cvRefs })}
          onClose={() => setConceptView(null)}
        />
      )}
      {addProducedConcept && (
        <AddProducedModal
          concept={addProducedConcept}
          companyName={displayName}
          onSave={(payload) => saveProduced(addProducedConcept, payload)}
          onClose={() => setAddProducedConcept(null)}
        />
      )}
      {winnersOpen && (
        <WinnersScorecard
          variations={variations}
          concepts={concepts}
          onClose={() => setWinnersOpen(false)}
          onOpenConcept={(c) => { setWinnersOpen(false); setConceptView(c); }}
        />
      )}
      {prioridadesOpen && (
        <PrioridadesModal
          variations={variations}
          prioridades={prioridades}
          onGuardar={guardarPrioridades}
          onClose={() => setPrioridadesOpen(false)}
        />
      )}
      {refModal && (
        <AdModalCliente
          concept={refModal.concept}
          list={refModal.list || []}
          initialRef={refModal.ref}
          view={view}
          isDark={isDark}
          onSelect={(ref) => setRefModal((m) => ({ ...m, ref }))}
          onClose={() => setRefModal(null)}
        />
      )}
      {strategyOpen && (
        <StrategyBoard
          touchpoints={strategyTouchpoints}
          mode={board?.config?.strategy_mode || "items"}
          guide={board?.config?.strategy_guide || {}}
          isDark={isDark}
          isAdmin={canEditConfig}
          productSelector={strategyProductSelector}
          onEdit={() => setStrategyEdit(true)}
          onClose={() => setStrategyOpen(false)}
        />
      )}
      {strategyEdit && (
        // Admin: editor real (StrategyModal) encima del tablero de lectura.
        <StrategyModal
          key={strategyProductId || "general"}
          touchpoints={strategyTouchpoints}
          legacyAngles={board?.config?.sales_angles_md || ""}
          mode={board?.config?.strategy_mode || "items"}
          guide={board?.config?.strategy_guide || {}}
          canEdit={true}
          companyName={displayName}
          boardId={board?.id || null}
          productSelector={strategyProductSelector}
          onSave={saveStrategy}
          onClose={() => setStrategyEdit(false)}
        />
      )}
      {cadenceOpen && (
        <CadenceReadOnly
          config={board?.config || {}}
          isDark={isDark}
          isAdmin={canEditConfig}
          board={board}
          patchBoardConfig={patchBoardConfig}
          reloadSilent={reloadSilent}
          onClose={() => setCadenceOpen(false)}
        />
      )}

      {/* ───── Modo admin (SOLO admin) ─────────────────────────────────────
          Doble gate: isAdmin && adminMode. Ninguna pieza de acá llega al
          cliente. Gestión completa in-view del despliegue de este cliente. */}
      {isAdmin && adminMode && (
        <AdminManagePanel
          displayName={displayName}
          concepts={concepts}
          variations={variations}
          isDark={isDark}
          selectedConcepts={selectedConcepts}
          selectedRefs={selectedRefs}
          selectionCount={selectionCount}
          deleting={deleting}
          syncing={syncing}
          onToggleConcept={toggleConceptSelected}
          onToggleRef={toggleRefSelected}
          onSelectAll={selectAllConcepts}
          onDeselectAll={clearSelection}
          onDeleteSelected={handleDeleteSelected}
          onDeleteAll={handleDeleteAll}
          onSync={handleSyncFromBank}
          onEditConcept={(c) => setConceptModal({ concept: c })}
          onExit={exitAdmin}
        />
      )}
      <ConfirmarAccion accion={accion} onCancel={() => setAccion(null)} />

      {isAdmin && conceptModal && board && (
        <ConceptModal
          boardId={board.id}
          concept={conceptModal.concept}
          onClose={() => setConceptModal(null)}
          onUpdated={(updated) => patchConcepts((cs) => cs.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))}
          onArchived={(id) => patchConcepts((cs) => cs.filter((c) => c.id !== id))}
        />
      )}
    </Shell>
  );
}

// ── Shell de la pantalla (header + scroller) ──
// `isAdmin` acá significa "puede gestionar ESTA pantalla ahora mismo": es falso
// tanto para el cliente como para alguien de Inforce que está simulando su vista.
// `esInforce` es quién sos de verdad, y es lo que decide si se ofrece el simulador.
function Shell({ displayName, children, isAdmin = false, onEdit, esInforce = false, verComoCliente = false, onVerComoCliente }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100vh", minWidth: 0,
      fontFamily: DS.font, color: "var(--ink)",
      background: "var(--bg)", backgroundImage: "var(--ambient)", backgroundAttachment: "local", backgroundRepeat: "no-repeat",
    }}>
      <div style={{ padding: "20px 28px 40px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0, flex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-4)" }}>
              <Icon d={IC.home} size={13} />
              <span>{displayName}</span>
              <span style={{ opacity: 0.5 }}>/</span>
              <span style={{ color: "var(--ink-3)" }}>Despliegue</span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.032em", color: "var(--ink)", margin: 0, lineHeight: 1.1 }}>
              Despliegue creativo
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            {isAdmin && onEdit && (
              <button
                data-action="new:despliegue.editar"
                onClick={onEdit}
                title="Entrar a la vista de edición (crear/mover conceptos). Solo tu equipo la ve."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999,
                  background: "var(--sel-soft)", border: "1px solid rgba(111,184,255,0.42)", color: "var(--sel)",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                }}
              >
                <Icon d={IC.gear} size={13} /> Editar despliegue
              </button>
            )}
            {/* Entrar por /cliente/<empresa> ERA la vista previa: veías lo mismo
                que el cliente. Ahora que ahí adentro se puede editar, hay que
                reponerla explícita — si no, no queda forma de revisar cómo le
                queda la pantalla a él. */}
            {esInforce && !verComoCliente && onVerComoCliente && (
              <button
                data-action="new:despliegue.ver-como-cliente"
                onClick={() => onVerComoCliente(true)}
                title="Ver esta pantalla igual que la ve el cliente, sin controles de edición."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999,
                  background: "var(--chip)", border: "1px solid var(--line)", color: "var(--ink-3)",
                  fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                }}
              >
                <Icon d={IC.eye} size={13} /> Ver como cliente
              </button>
            )}
            {esInforce && verComoCliente && onVerComoCliente && (
              <button
                data-action="new:despliegue.salir-ver-como-cliente"
                onClick={() => onVerComoCliente(false)}
                title="Volver a tu vista, con los controles de edición."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999,
                  background: "var(--amber-soft, rgba(240,169,59,.15))", border: "1px solid rgba(240,169,59,.45)", color: "var(--amber, #C4801C)",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                }}
              >
                <Icon d={IC.eye} size={13} /> Estás viendo como cliente · Volver
              </button>
            )}
            {!isAdmin && !esInforce && (
              <span
                title="Esta vista es de solo lectura: tu equipo de Inforce es quien arma y edita el despliegue."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999,
                  background: "var(--chip)", border: "1px solid var(--line)", color: "var(--ink-3)",
                  fontSize: 11.5, fontWeight: 600, cursor: "help", whiteSpace: "nowrap",
                }}
              >
                <Icon d={IC.eye} size={13} /> Solo lectura
              </span>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════ Panel de administración (SOLO admin) ═══════════
// Gestión completa del despliegue de ESTE cliente SIN salir a la vista de
// edición vieja: seleccionar + eliminar conceptos y referencias LOCALES
// (permanente, jamás el Banco), editar conceptos (ConceptModal) y sincronizar
// desde el banco. Renderizado bajo doble gate `isAdmin && adminMode` en el
// componente padre → el cliente nunca ve nada de esto.
//
// Solo las refs LOCALES del board son seleccionables: mismo guard que
// ConceptCard — una ref es local cuando no tiene origin_concept_id distinto a
// su concept_id (las externas vienen del banco/otras empresas con el concept_id
// remapeado y NO se pueden borrar desde acá).
const isLocalRef = (v) => !v.origin_concept_id || v.origin_concept_id === v.concept_id;

function AdminCheckbox({ checked, disabled, onChange, title }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : (e) => { e.stopPropagation(); onChange?.(); }}
      title={title}
      aria-checked={checked}
      role="checkbox"
      disabled={disabled}
      style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: 6, display: "grid", placeItems: "center",
        border: `1.5px solid ${checked ? "var(--sel)" : "var(--line-2, var(--line))"}`,
        background: checked ? "var(--sel)" : "transparent",
        color: checked ? "#fff" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, padding: 0,
      }}
    >
      <Icon d={IC.check} size={13} sw={2.6} />
    </button>
  );
}

function AdminManagePanel({
  displayName, concepts, variations, isDark,
  selectedConcepts, selectedRefs, selectionCount, deleting, syncing,
  onToggleConcept, onToggleRef, onSelectAll, onDeselectAll,
  onDeleteSelected, onDeleteAll, onSync, onEditConcept, onExit,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  // TODAS las variaciones por concepto (sin filtro de vista referentes/creados) —
  // acá se administra todo el despliegue, no una vista.
  const allByConcept = useMemo(() => {
    const m = {};
    for (const v of variations) (m[v.concept_id] ||= []).push(v);
    return m;
  }, [variations]);

  const byStage = STAGES.map((st) => ({ ...st, items: concepts.filter((c) => c.stage === st.key) }));
  const totalConcepts = concepts.length;
  const conceptCount = selectedConcepts.size;
  const refCount = selectedRefs.size;
  const hasSelection = selectionCount > 0;

  const stopBtn = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
  const redBtn = (enabled) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 15px", borderRadius: 10, border: "none", background: enabled ? "var(--brand, #E24B4A)" : "rgba(226,75,74,0.35)", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.7, whiteSpace: "nowrap" });

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !deleting) onExit(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(8,8,14,0.66)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px 24px", overflowY: "auto", fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 920, minHeight: 0, background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: "calc(100vh - 64px)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 22px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999, background: "var(--sel-soft)", color: "var(--sel)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em" }}>
                <Icon d={IC.sliders} size={12} sw={2} /> ADMIN
              </span>
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.024em", margin: 0 }}>Administrar despliegue</h2>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {displayName} · las eliminaciones son <strong style={{ color: "var(--ink-2)" }}>permanentes</strong> y afectan SOLO el despliegue de este cliente. Nunca tocan el Banco de creativos.
            </span>
          </div>
          <button data-action="new:despliegue.admin-cerrar" onClick={onExit} disabled={deleting} title="Salir del modo admin (Esc)" style={closeBtn}><Icon d={IC.x} size={15} sw={2} /></button>
        </div>

        {/* Barra de acciones */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 22px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <button data-action="new:despliegue.admin-seleccionar-todo" onClick={onSelectAll} disabled={deleting || totalConcepts === 0} style={stopBtn}>Seleccionar todo</button>
          <button data-action="new:despliegue.admin-deseleccionar" onClick={onDeselectAll} disabled={deleting || !hasSelection} style={{ ...stopBtn, opacity: (deleting || !hasSelection) ? 0.5 : 1, cursor: (deleting || !hasSelection) ? "not-allowed" : "pointer" }}>Deseleccionar</button>
          <span style={{ flex: 1 }} />
          <button data-action="new:despliegue.admin-sincronizar" onClick={onSync} disabled={syncing || deleting}
            title="Traer refs/notas/guion nuevas del banco para los nichos de esta empresa. Sin duplicar."
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 10, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: (syncing || deleting) ? "not-allowed" : "pointer", opacity: (syncing || deleting) ? 0.6 : 1, whiteSpace: "nowrap" }}>
            <Icon d={IC.sync} size={14} sw={2} /> {syncing ? "Sincronizando…" : "Sincronizar desde banco"}
          </button>
        </div>

        {/* Cuerpo: conceptos por etapa */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 22px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
          {byStage.map((st) => {
            const col = stageColor(st.key, isDark);
            if (st.items.length === 0) return null;
            return (
              <div key={st.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, background: "var(--surface-solid)", paddingTop: 8, paddingBottom: 4, zIndex: 1 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{st.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{st.items.length} concepto{st.items.length === 1 ? "" : "s"}</span>
                </div>
                {st.items.map((c) => {
                  const refs = allByConcept[c.id] || [];
                  const localRefs = refs.filter(isLocalRef);
                  const extRefs = refs.length - localRefs.length;
                  const isOpen = expanded.has(c.id);
                  const conSel = selectedConcepts.has(c.id);
                  const fmtLabel = FORMATS.find((f) => f.key === c.format)?.label || c.format;
                  return (
                    <div key={c.id} style={{ borderRadius: 13, border: `1px solid ${conSel ? "var(--sel)" : "var(--line)"}`, background: conSel ? "var(--sel-soft)" : "var(--surface-2)", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px" }}>
                        <AdminCheckbox checked={conSel} onChange={() => onToggleConcept(c.id)} title="Seleccionar este concepto (y todas sus referencias por cascada)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "Concepto"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: col }}>{String(c.stage || "").toUpperCase()}</span>
                            <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{fmtLabel}</span>
                            <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>· {refs.length} ref{refs.length === 1 ? "" : "s"}{extRefs > 0 ? ` (${extRefs} del banco)` : ""}</span>
                          </div>
                        </div>
                        <button data-action="new:despliegue.admin-editar-concepto" onClick={() => onEditConcept(c)} title="Editar nombre, descripción, etapa y formato"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                          <Icon d={IC.pencil} size={12} sw={1.9} /> Editar
                        </button>
                        {refs.length > 0 && (
                          <button data-action="new:despliegue.admin-expandir" onClick={() => toggleExpand(c.id)} title={isOpen ? "Ocultar referencias" : "Ver referencias"}
                            style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                            <Icon d={IC.chevronDown} size={14} sw={2} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                          </button>
                        )}
                      </div>
                      {isOpen && refs.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 13px 12px", background: "var(--surface)" }}>
                          {extRefs > 0 && (
                            <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginBottom: 8 }}>
                              Las referencias del Banco (marcadas) no son borrables desde acá — viven en el Banco, no en este cliente.
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                            {refs.map((r, i) => {
                              const local = isLocalRef(r);
                              const refSel = local && selectedRefs.has(r.id);
                              const brand = (getLabels(r).marca || [])[0] || "Referencia";
                              const rTitle = r.name || r.title || "";
                              return (
                                <div key={r.id || i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, border: `1px solid ${refSel ? "var(--sel)" : "var(--line)"}`, background: refSel ? "var(--sel-soft)" : "var(--surface-2)" }}>
                                  <AdminCheckbox checked={refSel} disabled={!local} onChange={() => onToggleRef(r.id)} title={local ? "Seleccionar esta referencia local" : "Referencia del Banco — no borrable desde acá"} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brand}</div>
                                    {rTitle && <div style={{ fontSize: 10.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rTitle}</div>}
                                    {!local && <div style={{ fontSize: 9.5, color: "var(--ink-4)", fontStyle: "italic" }}>del Banco</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {totalConcepts === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--ink-4)" }}>Este despliegue no tiene conceptos.</div>
          )}
        </div>

        {/* Footer: barra de selección + borrado */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 22px", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)" }}>
            {selectionCount} seleccionado{selectionCount === 1 ? "" : "s"}
            {hasSelection && <span style={{ fontWeight: 600, color: "var(--ink-4)" }}> ({conceptCount} concepto{conceptCount === 1 ? "" : "s"}, {refCount} ref{refCount === 1 ? "" : "s"})</span>}
          </span>
          <span style={{ flex: 1 }} />
          <button data-action="new:despliegue.admin-eliminar-seleccion" onClick={onDeleteSelected} disabled={!hasSelection || deleting} style={redBtn(hasSelection && !deleting)}
            title="Eliminar los seleccionados del despliegue de ESTE cliente (permanente, no el Banco)">
            <Icon d={IC.trash} size={13} sw={1.9} /> {deleting ? "Eliminando…" : "Eliminar seleccionados"}
          </button>
          <button data-action="new:despliegue.admin-eliminar-todo" onClick={onDeleteAll} disabled={totalConcepts === 0 || deleting} style={redBtn(totalConcepts > 0 && !deleting)}
            title="Eliminar TODO el despliegue de este cliente para rehacerlo (permanente, no el Banco)">
            Eliminar todo (rehacer)
          </button>
          <button data-action="new:despliegue.admin-salir" onClick={onExit} disabled={deleting} style={stopBtn}>Salir</button>
        </div>
      </div>
    </div>, document.body);
}

// ── Segmented control ──
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 4, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key}
            data-action="new:despliegue.cambiar-layout"
            onClick={() => onChange(o.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, border: "none",
              cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, whiteSpace: "nowrap",
              background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)",
              fontWeight: on ? 600 : 500, boxShadow: on ? "var(--shadow)" : "none",
            }}>
            <Icon d={o.icon} size={14} /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle en pill de ancho completo (panel flotante) ──
function PillToggle({ options, value, onChange, action }) {
  return (
    <div style={{ display: "flex", padding: 4, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", gap: 3 }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} data-action={action} title={o.hint} onClick={() => onChange(o.key)}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 999, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap",
              background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)",
              fontWeight: on ? 600 : 500, boxShadow: on ? "var(--shadow)" : "none",
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Descripción con clamp + Ver más ──
function ClampDesc({ text, lines = 2, fontSize = 11, color = "var(--ink-3)", lineHeight = 1.45 }) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  if (!text) return null;
  return (
    <div>
      <div ref={ref} style={{
        fontSize, color, lineHeight,
        ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }),
      }}>{text}</div>
      {(overflow || open) && (
        <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{ marginTop: 3, border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: Math.max(9.5, fontSize - 0.5), fontWeight: 600, padding: 0 }}>
          {open ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

// ── Canvas con embudo (Conceptos / Colmena) + zoom/pan dentro del tablero ──
function FunnelCanvas({ data, layout, isDark, companyName, view, anyLabelFilter, filterMode, producedAgg = null, onOpenConcept, onOpenRef }) {
  const boxRef = useRef(null);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasH, setCanvasH] = useState(560);
  const panSession = useRef(null);
  // Refs vivos de scale/pan para el zoom-hacia-el-cursor (el onWheel se registra una vez).
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const panRef = useRef(pan); panRef.current = pan;

  // Alto del canvas MEDIDO: llena exactamente hasta el fondo de la ventana
  // (menos un margen chico). Elimina el "hueco" vacío de abajo sin depender de
  // la cadena flex. Como el canvas llena el viewport, la página no scrollea y el
  // top se mantiene estable.
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top;
      setCanvasH(Math.max(480, Math.round(window.innerHeight - top - 20)));
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 60); // re-mide tras el layout inicial
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, []);

  // Zoom/pan SOLO dentro del tablero: wheel nativo NO pasivo + preventDefault.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        // Zoom HACIA EL CURSOR: mantener fijo el punto del canvas bajo el mouse.
        const s = scaleRef.current;
        const s2 = Math.min(2.2, Math.max(0.28, s * Math.exp(-e.deltaY * 0.006)));
        if (s2 === s) return;
        const rect = el.getBoundingClientRect();
        const p = panRef.current;
        const Ox = rect.width / 2;           // transformOrigin X (50%); Y = 0
        const k = (s - s2) / s;
        setPan({
          x: p.x + ((e.clientX - rect.left) - p.x - Ox) * k,
          y: p.y + ((e.clientY - rect.top) - p.y) * k,
        });
        setScale(s2);
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target?.closest?.("[data-action]")) return;
    panSession.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    const onMove = (ev) => {
      const s = panSession.current; if (!s) return;
      setPan({ x: s.px + (ev.clientX - s.sx), y: s.py + (ev.clientY - s.sy) });
    };
    const onUp = () => {
      panSession.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const byStage = STAGES.map((st) => ({
    ...st,
    items: data.filter((d) => d.concept.stage === st.key),
  }));
  const soloStage = ["tofu", "mofu", "bofu"].filter((k) => byStage.find((s) => s.key === k)?.items.some((d) => d.visible)).length === 1;
  const subtitle = view === "produced" ? "Anuncios creados para tu cuenta" : "Referentes que inspiran cada concepto";

  return (
    <div ref={wrapRef} style={{ position: "relative", borderRadius: 20, border: "1px solid var(--line)", overflow: "hidden", height: canvasH, minHeight: 480, background: "var(--canvas)" }}>
      <div ref={boxRef}
        onPointerDown={onPointerDown}
        style={{
          position: "absolute", inset: 0, cursor: "grab", touchAction: "none",
          backgroundImage: `radial-gradient(var(--canvas-dot) 1px, transparent 1px)`, backgroundSize: "26px 26px",
        }}>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "50% 0", padding: "40px 20px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 28, pointerEvents: "none" }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.035em", color: "var(--ink)", lineHeight: 1.05, textShadow: isDark ? "0 0 30px rgba(95,222,240,0.22)" : "none" }}>
              Embudo de {companyName}
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 8 }}>{subtitle}</div>
            {producedAgg && producedAgg.withMetrics > 0 && (
              <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
                {[
                  ["Creativos", String(producedAgg.count)],
                  ["Con métricas", String(producedAgg.withMetrics)],
                  ["Gasto total", Math.round(producedAgg.gasto).toLocaleString("es-CO")],
                  ["Resultados", Math.round(producedAgg.resultados).toLocaleString("es-CO")],
                  ["ROAS prom", producedAgg.roas ? producedAgg.roas.toFixed(1) + "x" : "—"],
                  ["CPA prom", producedAgg.cpa ? Math.round(producedAgg.cpa).toLocaleString("es-CO") : "—"],
                ].map(([l, v]) => (
                  <span key={l} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "6px 12px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{v}</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{l}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {byStage.map((st, i) => {
            const col = stageColor(st.key, isDark);
            const width = soloStage ? "100%" : STAGE_WIDTH[st.key];
            const statics = st.items.filter((d) => d.concept.format === "static");
            const videos = st.items.filter((d) => d.concept.format === "video");
            return (
              <div key={st.key} style={{ margin: "0 auto", width: "fit-content", maxWidth: "min(94vw, 2400px)" }}>
                <div style={{
                  borderLeft: `2px solid ${col}55`, borderRight: `2px solid ${col}55`, borderRadius: 24,
                  padding: "22px 26px 28px", marginBottom: 8,
                }}>
                  <div style={{ textAlign: "center", marginBottom: 16, pointerEvents: "none" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: col, textShadow: isDark ? `0 0 22px ${col}55` : "none" }}>{st.label}</div>
                    <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{st.sub}</div>
                  </div>
                  {/* Los dos grupos (Estáticos | Video) toman su ancho natural y el
                      frame del embudo crece con el contenido → TOFU (más conceptos)
                      queda más ancho y BOFU más angosto = forma de embudo, pero sin
                      apilar como un "palo". */}
                  <div style={{ display: "flex", gap: 52, alignItems: "flex-start", justifyContent: "center", flexWrap: "nowrap", overflowX: "auto", maxWidth: "100%" }}>
                    {[{ key: "static", label: "Estáticos", items: statics }, { key: "video", label: "Video", items: videos }].map((fmt) => {
                      // Honeycomb "wide-first" para las tarjetas de concepto: columnas
                      // según la cantidad, con sesgo a lo ancho. Nunca más columnas que
                      // ítems. Card 172px → grid de cCols columnas fijas.
                      const nItems = fmt.items.length;
                      const cCols = Math.min(Math.max(1, nItems), Math.min(8, Math.max(3, Math.ceil(Math.sqrt(nItems * 1.6)))));
                      return (
                      <div key={fmt.key} style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                          <span style={{ background: "var(--ink)", color: "var(--bg)", padding: "5px 16px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em" }}>{fmt.label}</span>
                        </div>
                        {fmt.items.length === 0 ? (
                          <div style={{ display: "flex", justifyContent: "center" }}><BucketEmpty anyLabelFilter={anyLabelFilter} /></div>
                        ) : layout === "colmena" ? (
                          // flex-wrap + justifyContent center + ancho fijo (cCols) →
                          // cada fila (incl. la última incompleta) queda CENTRADA, no
                          // pegada a la izquierda.
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", width: cCols * 208, maxWidth: "100%" }}>
                            {fmt.items.map((d) => (
                              <ColmenaPanel key={d.concept.id} d={d} isDark={isDark} dim={filterMode === "resaltar" && !d.visible} anyLabelFilter={anyLabelFilter}
                                onOpenConcept={() => onOpenConcept(d.concept)} onOpenRef={(ref) => onOpenRef(d.concept, ref, anyLabelFilter ? d.matched : d.refs)} />
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", width: cCols * 172 + (cCols - 1) * 10 }}>
                            {fmt.items.map((d) => (
                              <ConceptCardCliente key={d.concept.id} d={d} isDark={isDark} dim={filterMode === "resaltar" && !d.visible} anyLabelFilter={anyLabelFilter}
                                onOpenConcept={() => onOpenConcept(d.concept)} onOpenRef={(ref) => onOpenRef(d.concept, ref, anyLabelFilter ? d.matched : d.refs)} />
                            ))}
                          </div>
                        )}
                      </div>
                    );})}
                  </div>
                </div>
                {i < byStage.length - 1 && (
                  <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px", color: "var(--ink-3)", pointerEvents: "none" }}>
                    <Icon d={IC.chevronDown} size={22} sw={2} style={{ color: "var(--ink-2)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Zoom controls */}
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <ZoomBtn onClick={() => setScale((s) => Math.min(2.2, s + 0.15))} d={IC.plus} />
        <ZoomBtn onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} d={IC.target} />
        <ZoomBtn onClick={() => setScale((s) => Math.max(0.28, s - 0.15))} d={IC.minus} />
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, fontSize: 11.5, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

function ZoomBtn({ onClick, d }) {
  return (
    <button data-action="despliegue.zoom" onClick={onClick} style={{
      width: 38, height: 38, borderRadius: 11, border: "1px solid var(--line)", background: "var(--surface-solid)",
      color: "var(--ink-2)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "var(--shadow)",
    }}><Icon d={d} size={16} sw={2} /></button>
  );
}

function BucketEmpty({ anyLabelFilter }) {
  return <div style={{ fontSize: 12.5, fontStyle: "italic", color: "var(--ink-4)", padding: "8px 4px" }}>{anyLabelFilter ? "nada coincide con el filtro" : "sin conceptos en este bucket"}</div>;
}

// ── Cover de la tarjeta de concepto ──
// Representa FORMATO (play=video · imagen=estático) y ETAPA (color + chip
// TOFU/MOFU/BOFU). En dark: glow LED suave con el color de etapa; en light:
// tinte muy tenue, sin glow. Solo CSS (gradients/box-shadow), sin imágenes.
function ConceptCover({ stage, format, isDark }) {
  const col = stageColor(stage, isDark);
  const isVideo = format === "video";
  const cover = isDark
    ? {
        background: `radial-gradient(115% 82% at 50% 4%, ${col}30 0%, ${col}12 42%, var(--raised) 100%)`,
        boxShadow: `inset 0 1px 0 ${col}55, inset 0 22px 44px -22px ${col}66`,
      }
    : {
        background: `radial-gradient(115% 82% at 50% 4%, ${col}1C 0%, ${col}0B 46%, var(--raised) 100%)`,
        boxShadow: `inset 0 1px 0 ${col}2A`,
      };
  return (
    <div style={{
      position: "relative", height: 104, display: "grid", placeItems: "center",
      borderBottom: "1px solid var(--line)", overflow: "hidden", ...cover,
    }}>
      {/* Línea de acento superior — brilla en dark, tenue en light */}
      <span style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${col}, transparent)`,
        boxShadow: isDark ? `0 0 9px ${col}` : "none", opacity: isDark ? 0.9 : 0.45,
      }} />
      {/* Chip de etapa */}
      <span style={{
        position: "absolute", top: 8, left: 8, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.09em",
        padding: "2px 6px", borderRadius: 999, color: col,
        background: isDark ? `${col}1F` : `${col}14`, border: `1px solid ${col}${isDark ? "55" : "33"}`,
      }}>{String(stage || "").toUpperCase()}</span>
      {/* Badge de formato centrado */}
      <div style={{
        position: "relative", width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", color: col,
        background: isDark ? `${col}22` : `${col}14`, border: `1px solid ${col}${isDark ? "66" : "3A"}`,
        boxShadow: isDark ? `0 0 18px -3px ${col}99, inset 0 0 11px -5px ${col}` : "none",
      }}>
        <Icon d={isVideo ? IC.play : IC.image} size={20} sw={1.8} />
      </div>
      {/* Etiqueta de formato */}
      <span style={{
        position: "absolute", bottom: 7, right: 9, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em",
        color: isDark ? "var(--ink-3)" : "var(--ink-4)",
      }}>{isVideo ? "VIDEO" : "ESTÁTICO"}</span>
    </div>
  );
}

// ── Tarjeta de concepto (layout Conceptos) ──
function ConceptCardCliente({ d, isDark, dim, anyLabelFilter, onOpenConcept, onOpenRef }) {
  const c = d.concept;
  const refs = anyLabelFilter ? d.matched : d.refs;
  const labelChips = firstLabels(refs, 2);
  return (
    <div data-action="despliegue.abrir-concepto" onClick={onOpenConcept}
      style={{
        width: 172, borderRadius: 14, border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer",
        overflow: "hidden", boxShadow: "var(--shadow)", opacity: dim ? 0.26 : 1, display: "flex", flexDirection: "column",
        transition: "opacity .18s ease",
      }}>
      <ConceptCover stage={c.stage} format={c.format} isDark={isDark} />
      <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.name || "Concepto"}</div>
        {c.description && <ClampDesc text={c.description} lines={2} fontSize={11} />}
        {labelChips.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {labelChips.map((lc, i) => (
              <span key={i} style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: `${lc.color}22`, color: lc.color, maxWidth: 78, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lc.value}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.05em", color: "var(--ink-4)", marginBottom: 6 }}>{refs.length} referencia{refs.length === 1 ? "" : "s"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
            {refs.slice(0, 3).map((ref, i) => (
              <ExampleThumb key={ref.id || i} example={ref} isDark={isDark}
                onClick={(e) => { e?.stopPropagation?.(); onOpenRef(ref); }} />
            ))}
            {refs.length > 3 && (
              <div data-action="despliegue.abrir-concepto" onClick={onOpenConcept}
                style={{ aspectRatio: "4/5", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)", cursor: "pointer" }}>+{refs.length - 3}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panel de concepto (layout Colmena) — todas las refs uniformes 52×65 ──
function ColmenaPanel({ d, isDark, dim, anyLabelFilter, onOpenConcept, onOpenRef }) {
  const c = d.concept;
  const refs = anyLabelFilter ? d.matched : d.refs;
  const n = refs.length;
  const cols = n <= 6 ? 3 : Math.min(8, Math.max(4, Math.ceil(Math.sqrt(n))));
  const width = cols * 52 + (cols - 1) * 6 + 28;
  return (
    <div style={{ width, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--shadow)", border: "1px solid var(--line)", opacity: dim ? 0.26 : 1, overflow: "hidden", transition: "opacity .18s ease" }}>
      <div data-action="despliegue.abrir-concepto" onClick={onOpenConcept} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>{c.name || "Concepto"}</div>
        {c.description && <div style={{ marginTop: 3 }}><ClampDesc text={c.description} lines={2} fontSize={11} lineHeight={1.5} /></div>}
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink-4)", marginBottom: 8 }}>{n} referencia{n === 1 ? "" : "s"}</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 52px)`, gap: 6, justifyContent: "center" }}>
          {refs.map((ref, i) => (
            <ExampleThumb key={ref.id || i} example={ref} isDark={isDark} onClick={() => onOpenRef(ref)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Vista Grilla (secundaria) ──
function GridView({ data, isDark, anyLabelFilter, filterMode, onOpenConcept, onOpenRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {STAGES.map((st) => {
        const col = stageColor(st.key, isDark);
        const items = data.filter((d) => d.concept.stage === st.key);
        if (items.length === 0) return null;
        return (
          <div key={st.key} style={{ position: "relative", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--line)", padding: "18px 20px 20px", boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>{st.label}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{st.sub}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {FORMATS.map((fmt) => {
                const cards = items.filter((d) => d.concept.format === fmt.key);
                return (
                  <div key={fmt.key} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>{fmt.label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {cards.length === 0 ? <BucketEmpty anyLabelFilter={anyLabelFilter} /> : cards.map((d) => {
                        const refs = anyLabelFilter ? d.matched : d.refs;
                        const dim = filterMode === "resaltar" && !d.visible;
                        const chips = firstLabels(refs, 2);
                        // Máximo 12 miniaturas: 11 + una tile "+N más" que abre el concepto.
                        const cap = 12;
                        const overflow = refs.length > cap;
                        const shown = overflow ? refs.slice(0, cap - 1) : refs.slice(0, cap);
                        return (
                          <div key={d.concept.id} data-action="despliegue.abrir-concepto" onClick={() => onOpenConcept(d.concept)}
                            style={{ borderRadius: 16, border: "1px solid var(--line)", background: "var(--surface-2)", padding: "13px 14px", cursor: "pointer", opacity: dim ? 0.26 : 1, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.concept.name || "Concepto"}</div>
                              {d.concept.description && <ClampDesc text={d.concept.description} lines={2} fontSize={12} lineHeight={1.5} />}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 96px)", gap: 8 }}>
                              {shown.map((ref, i) => (
                                <div key={ref.id || i} style={{ width: 96, height: 120 }}>
                                  <ExampleThumb example={ref} isDark={isDark}
                                    onClick={(e) => { e?.stopPropagation?.(); onOpenRef(d.concept, ref, refs); }} />
                                </div>
                              ))}
                              {overflow && (
                                <div onClick={(e) => { e.stopPropagation(); onOpenConcept(d.concept); }}
                                  style={{ width: 96, height: 120, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", cursor: "pointer" }}>
                                  +{refs.length - (cap - 1)} más
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 6 }}>
                              <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{refs.length} referencia{refs.length === 1 ? "" : "s"}</span>
                              {chips.map((lc, i) => <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: `${lc.color}22`, color: lc.color, whiteSpace: "nowrap" }}>{lc.value}</span>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Popover de filtros (2 paneles) ──
function FilterPopover({ variations, stageFilter, setStageFilter, formatFilter, setFormatFilter, labelFilters, setLabelFilters, filterMode, setFilterMode, filterTab, setFilterTab, onClear, onClose }) {
  useEffect(() => {
    const h = (e) => { if (!e.target.closest("[data-menu-root]")) onClose(); };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [onClose]);

  const cats = [
    { key: "etapa", label: "Etapa", kind: "stage" },
    { key: "formato", label: "Formato", kind: "format" },
    ...LABEL_FILTER_CATS.map((c) => ({ key: c.key, label: c.label, kind: "label", color: c.color })),
  ];
  const count = (cat) => {
    if (cat.kind === "stage") return stageFilter !== "all" ? 1 : 0;
    if (cat.kind === "format") return formatFilter !== "all" ? 1 : 0;
    return (labelFilters[cat.key] || []).length;
  };
  const toggleLabel = (catKey, val) => {
    setLabelFilters((prev) => {
      const arr = prev[catKey] || [];
      const has = arr.some((x) => normLabel(x) === normLabel(val));
      return { ...prev, [catKey]: has ? arr.filter((x) => normLabel(x) !== normLabel(val)) : [...arr, val] };
    });
  };
  const activeCat = cats.find((c) => c.key === filterTab) || cats[0];

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60, width: 392, maxHeight: "62vh",
      borderRadius: 18, background: "var(--surface-solid)", border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "138px minmax(0,1fr)", flex: 1, minHeight: 0 }}>
        {/* Rail de categorías */}
        <div style={{ borderRight: "1px solid var(--line)", padding: 8, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {cats.map((cat) => {
            const on = filterTab === cat.key;
            const n = count(cat);
            return (
              <button key={cat.key} onClick={() => setFilterTab(cat.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: on ? "var(--sel-soft)" : "transparent", color: on ? "var(--sel)" : "var(--ink-2)",
                  fontFamily: "inherit", fontSize: 12.5, fontWeight: on ? 600 : 500, textAlign: "left",
                }}>
                <span style={{ flex: 1 }}>{cat.label}</span>
                {n > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: cat.color || "var(--sel)" }}>{n}</span>}
              </button>
            );
          })}
        </div>
        {/* Valores */}
        <div style={{ padding: 12, overflowY: "auto" }}>
          {activeCat.kind === "stage" ? (
            <ChipSet options={[{ v: "all", l: "Todo el embudo" }, ...STAGES.map((s) => ({ v: s.key, l: s.label }))]} isActive={(v) => stageFilter === v} onPick={(v) => setStageFilter(v)} />
          ) : activeCat.kind === "format" ? (
            <ChipSet options={[{ v: "all", l: "Todos" }, ...FORMATS.map((f) => ({ v: f.key, l: f.label }))]} isActive={(v) => formatFilter === v} onPick={(v) => setFormatFilter(v)} />
          ) : (
            <LabelChips variations={variations} catKey={activeCat.key} color={activeCat.color} selected={labelFilters[activeCat.key] || []} onToggle={(v) => toggleLabel(activeCat.key, v)} />
          )}
        </div>
      </div>
      {/* Pie */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>Al filtrar</span>
        <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {[{ k: "resaltar", l: "Resaltar" }, { k: "ocultar", l: "Ocultar resto" }].map((m) => {
            const on = filterMode === m.k;
            return <button key={m.k} data-action="despliegue.filtro-modo" onClick={() => setFilterMode(m.k)} style={{ padding: "6px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: on ? 600 : 500, background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", boxShadow: on ? "var(--shadow)" : "none" }}>{m.l}</button>;
          })}
        </div>
        <span style={{ flex: 1 }} />
        <button data-action="despliegue.limpiar-filtros" onClick={onClear} style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600 }}>Limpiar</button>
      </div>
    </div>
  );
}

function ChipSet({ options, isActive, onPick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => {
        const on = isActive(o.v);
        return <button key={o.v} data-action="new:despliegue.filtrar-etapa" onClick={() => onPick(o.v)} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${on ? "var(--sel)" : "var(--line)"}`, background: on ? "var(--sel-soft)" : "transparent", color: on ? "var(--sel)" : "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>{o.l}</button>;
      })}
    </div>
  );
}

function LabelChips({ variations, catKey, color, selected, onToggle }) {
  const values = useMemo(() => {
    const counts = new Map();
    for (const v of variations) for (const val of getLabels(v)[catKey] || []) {
      const k = normLabel(val);
      if (!counts.has(k)) counts.set(k, { value: val, n: 0 });
      counts.get(k).n++;
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [variations, catKey]);
  if (values.length === 0) return <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>Sin etiquetas en esta categoría.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {values.map((x) => {
        const on = selected.some((s) => normLabel(s) === normLabel(x.value));
        return (
          <button key={x.value} data-action="despliegue.filtro-categoria" onClick={() => onToggle(x.value)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, border: `1px solid ${on ? color : "var(--line)"}`, background: on ? `${color}22` : "transparent", color: on ? color : "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
            {x.value}<span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{x.n}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActiveChips({ stageFilter, setStageFilter, formatFilter, setFormatFilter, labelFilters, setLabelFilters, filterMode, onClear }) {
  const chips = [];
  if (stageFilter !== "all") chips.push({ label: STAGES.find((s) => s.key === stageFilter)?.label || stageFilter, clear: () => setStageFilter("all") });
  if (formatFilter !== "all") chips.push({ label: FORMATS.find((f) => f.key === formatFilter)?.label || formatFilter, clear: () => setFormatFilter("all") });
  for (const k in labelFilters) for (const val of labelFilters[k] || []) {
    chips.push({ label: val, clear: () => setLabelFilters((prev) => ({ ...prev, [k]: (prev[k] || []).filter((x) => x !== val) })) });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -4 }}>
      <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{filterMode === "resaltar" ? "Resaltando:" : "Ocultando lo que no coincide:"}</span>
      {chips.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--sel-soft)", color: "var(--sel)", fontSize: 11.5, fontWeight: 600 }}>
          {c.label}
          <button onClick={c.clear} style={{ border: "none", background: "transparent", color: "var(--sel)", cursor: "pointer", padding: 0, display: "grid" }}><Icon d={IC.x} size={11} sw={2.4} /></button>
        </span>
      ))}
      <button onClick={onClear} style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600 }}>Limpiar todo</button>
    </div>
  );
}

// ── Panel flotante read-only ──
function FloatingPanel({ companyName, config, concepts, variations, isDark, pipeline, setPipeline, view, setView, onOpenStrategy, onOpenCadence }) {
  const [collapsed, setCollapsed] = useState(false);
  const stats = useMemo(() => computeCompliance(concepts, variations, config), [concepts, variations, config]);
  const pct = stats.target > 0 ? stats.done / stats.target : 0;
  const pctColor = pct >= 0.8 ? "var(--green)" : pct >= 0.4 ? "var(--amber)" : "var(--brand)";

  if (collapsed) {
    return createPortal(
      <button onClick={() => setCollapsed(false)} style={{ position: "fixed", top: 152, left: 286, zIndex: 40, width: 40, height: 40, borderRadius: 12, background: "var(--surface-solid)", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "var(--shadow-lg)" }}>
        <Icon d={IC.target} size={17} />
      </button>, document.body);
  }
  return createPortal(
    <div style={{ position: "fixed", top: 152, left: 286, zIndex: 40, width: 286, borderRadius: 18, background: "var(--surface-solid)", border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)", padding: 16, fontFamily: DS.font, color: "var(--ink)", maxHeight: "calc(100vh - 120px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--ink-4)", letterSpacing: "0.08em" }}>DESPLIEGUE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>{companyName}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button data-action="new:despliegue.ver-cadencia" onClick={onOpenCadence} title="Ver la cadencia de creativos" style={panelIconBtn}><Icon d={IC.gear} size={15} /></button>
          <button data-action="despliegue.colapsar-panel" onClick={() => setCollapsed(true)} title="Colapsar el panel" style={panelIconBtn}><Icon d={IC.chevronLeft} size={15} /></button>
        </div>
      </div>

      {/* Segmented: Anuncios | Orgánico */}
      <PillToggle
        action="despliegue.cambiar-pipeline"
        options={[{ key: "ads", label: "Anuncios" }, { key: "organic", label: "Orgánico" }]}
        value={pipeline} onChange={setPipeline}
      />
      {/* Segmented: Referentes | Creados */}
      <PillToggle
        action="despliegue.cambiar-vista"
        options={[
          { key: "reference", label: "Referentes", hint: "Las referencias que inspiran cada concepto" },
          { key: "produced", label: "Creados", hint: "Los anuncios ya producidos para tu cuenta" },
        ]}
        value={view} onChange={setView}
      />

      <button data-action="despliegue.estrategia-de-venta" onClick={onOpenStrategy}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon d={IC.doc} size={14} /> Estrategia de venta
      </button>

      <div style={{ height: 1, background: "var(--line)" }} />

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Cumplimiento semanal</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: pctColor, fontVariantNumeric: "tabular-nums" }}>{stats.done} / {stats.target}</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", background: pctColor }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {STAGES.map((s) => {
          const data = stats.byStage[s.key];
          const p = data.target > 0 ? data.done / data.target : 0;
          return (
            <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: stageColor(s.key, isDark) }}>{s.label}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{data.done} / {data.target}</span>
              </div>
              <div style={{ height: 4, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, p * 100)}%`, height: "100%", background: stageColor(s.key, isDark) }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.55 }}>Arrastrá para mover · ⌘ + scroll para zoom.</div>
    </div>, document.body);
}
const panelIconBtn = { width: 30, height: 30, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", borderRadius: 9, display: "grid", placeItems: "center" };

// ═══════════ Modal de concepto (read-only, cliente) ═══════════
function ConceptDetailCliente({ concept, refs, totalRefs, anyLabelFilter, view, isDark, isAdmin = false, onAddProduced, onOpenRef, onClose }) {
  const c = concept;
  const stageDef = STAGES.find((s) => s.key === c.stage);
  const stageCol = stageColor(c.stage, isDark);
  const chips = otherLabels(refs, 2);
  const brands = brandsList(refs);
  const brandLine = brands.slice(0, 4).join(" · ") + (brands.length > 4 ? ` +${brands.length - 4}` : "");
  const refsTitle = view === "produced" ? "Anuncios creados" : "Referentes";
  const refsCount = anyLabelFilter ? `${refs.length} de ${totalRefs}` : String(refs.length);
  const isVideo = c.format === "video";

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(8,8,14,0.62)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "center", padding: "56px 24px 24px", overflowY: "auto", fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 800, height: "fit-content", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "var(--chip)", color: stageCol }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: stageCol }} />{stageDef?.label || c.stage}
              </span>
              <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "var(--chip)", color: "var(--ink-3)" }}>{isVideo ? "Video" : "Estático"}</span>
              {chips.map((ch, i) => (
                <span key={i} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${ch.color}22`, color: ch.color }}>{ch.value}</span>
              ))}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.028em", color: "var(--ink)", lineHeight: 1.15, margin: 0 }}>{c.name || "Concepto"}</h2>
            {c.description && <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{shortLine(c.description)}</span>}
          </div>
          <button data-action="despliegue.cerrar-concepto" onClick={onClose} title="Cerrar (Esc)" style={closeBtn}><Icon d={IC.x} size={15} sw={2} /></button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, alignItems: "start" }}>
            <TextCard label="Por qué funciona" text={c.description} />
            <TextCard label="Cómo se hace" text={c.execution} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{refsTitle}</span>
              <span style={{ fontSize: 12, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{refsCount}</span>
              <span style={{ flex: 1 }} />
              {brandLine && <span style={{ fontSize: 11.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{brandLine}</span>}
              {isAdmin && view === "produced" && (
                <button type="button" onClick={onAddProduced}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 12, fontWeight: 700, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.34)", borderRadius: 9, padding: "6px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Agregar anuncio creado
                </button>
              )}
            </div>
            {refs.length === 0 ? (
              <div style={{ padding: "28px 0", textAlign: "center", fontSize: 12.5, color: "var(--ink-4)", fontStyle: "italic" }}>
                {view === "produced" ? "Todavía no hay anuncios creados para este concepto." : "Este concepto todavía no tiene referencias."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(136px, 1fr))", gap: 10 }}>
                {refs.map((r, i) => (
                  <RefCard key={r.id || i} ref_={r} isVideo={isVideo} onClick={() => onOpenRef(r)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextCard({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface-2)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>{label}</span>
      {text ? (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", margin: 0, ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{text}</p>
          {(open || text.length > 180) && (
            <button data-action="new:despliegue.ver-mas-concepto" onClick={() => setOpen((o) => !o)}
              style={{ alignSelf: "flex-start", padding: "5px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              {open ? "Ver menos" : "Ver más"}
            </button>
          )}
        </>
      ) : (
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontStyle: "italic" }}>Tu equipo todavía no cargó esto.</span>
      )}
    </div>
  );
}

// Tarjeta de referencia dentro del modal de concepto.
function RefCard({ ref_, isVideo, onClick }) {
  const brand = (getLabels(ref_).marca || [])[0] || "Referencia";
  const title = ref_.name || ref_.title || "";
  const ar = isVideo ? "9 / 16" : "4 / 5";
  return (
    <button data-action="despliegue.abrir-referencia" onClick={onClick} title={`${brand}${title ? " · " + title : ""}`}
      style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface-2)", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <span style={{ position: "relative", aspectRatio: ar, backgroundColor: "var(--raised)", backgroundImage: "repeating-linear-gradient(135deg, rgba(180,200,225,0.10) 0 6px, transparent 6px 13px)", display: "grid", placeItems: "center", overflow: "hidden" }}>
        {ref_.file_url && <img src={ref_.file_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {isVideo && (
          <span style={{ position: "relative", width: 32, height: 32, borderRadius: "50%", background: "rgba(8,10,16,0.7)", border: "1px solid var(--line-2, var(--line))", display: "grid", placeItems: "center", color: "#fff" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        )}
      </span>
      <span style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brand}</span>
        {title && <span style={{ fontSize: 11, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>}
      </span>
    </button>
  );
}

// ═══════════ Modal de referencia / anuncio (read-only, cliente) ═══════════
export function AdModalCliente({ concept, list, initialRef, view, isDark, onSelect, onClose, primaryAction, secondaryAction, canTranscribe = false }) {
  // Transcripciones sacadas en esta sesión, por id de referente. La fila del
  // banco ya quedó actualizada; esto es solo para pintarla sin recargar.
  // Va ANTES del early return de abajo: los hooks no pueden ser condicionales.
  const [freshTx, setFreshTx] = useState({});
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState("");

  const refs = list && list.length ? list : (initialRef ? [initialRef] : []);
  const idx = Math.max(0, refs.findIndex((r) => r.id === initialRef?.id));
  const ref_ = refs[idx] || initialRef;
  if (!ref_) return null;

  const go = (delta) => {
    if (refs.length < 2) return;
    const next = refs[(idx + delta + refs.length) % refs.length];
    if (next) onSelect(next);
  };

  const shownTranscript = ref_.transcript || freshTx[ref_.id] || "";
  const runTranscribe = async () => {
    setTxBusy(true); setTxError("");
    try {
      const r = await transcribeVariation(ref_);
      if (r.ok) setFreshTx((prev) => ({ ...prev, [ref_.id]: r.transcript }));
      else setTxError(r.reason || "No se pudo transcribir.");
    } finally { setTxBusy(false); }
  };

  const isVideo = concept?.format === "video";
  const stageDef = STAGES.find((s) => s.key === concept?.stage);
  const brand = (getLabels(ref_).marca || [])[0] || "Referencia";
  const title = ref_.name || ref_.title || "";
  const metaLine = `${concept?.name || ""}${stageDef ? " · " + stageDef.label : ""}`;
  const chips = allChips(ref_);

  const driveUrl = ref_.drive_url || "";
  const fileUrl = ref_.file_url || "";
  const metaUrl = ref_.meta_ads_library_url || "";
  const drive = !!driveUrl;
  const ar = isVideo ? "9 / 16" : "4 / 5";
  const arLabel = isVideo ? "9:16" : "4:5";

  // Días corriendo (si tiene produced_at computable).
  let daysRunning = null;
  if (ref_.produced_at) {
    const d = new Date(ref_.produced_at);
    if (!isNaN(d.getTime())) daysRunning = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }

  const facts = [
    { label: "Formato", value: isVideo ? "Video" : "Estático" },
    ...(daysRunning != null ? [{ label: "Días corriendo", value: `${daysRunning} días` }] : []),
    { label: "Meta Ads Library", value: metaUrl ? "Disponible" : "—" },
    { label: "Archivo en Drive", value: drive ? "Disponible" : "—" },
    // Rendimiento + métricas (del Feedback del pipeline o cargadas a mano).
    ...(ref_.metrics?.rendimiento ? [{ label: "Rendimiento", value: ref_.metrics.rendimiento.charAt(0).toUpperCase() + ref_.metrics.rendimiento.slice(1) }] : []),
    ...(["gasto", "resultados", "cpa", "roas"].some((k) => ref_.metrics?.[k]) ? [
      { label: "Gasto", value: ref_.metrics.gasto || "—" },
      { label: "Resultados", value: ref_.metrics.resultados || "—" },
      { label: "CPA", value: ref_.metrics.cpa || "—" },
      { label: "ROAS", value: ref_.metrics.roas || "—" },
    ] : []),
  ];

  const downloadHref = isVideo ? (drive ? driveDownloadUrl(driveUrl) : null) : (fileUrl || null);
  const downloadLabel = isVideo ? "Descargar video" : "Descargar imagen";
  const showDownload = isVideo ? drive : !!fileUrl;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(6,7,12,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", overflowY: "auto", fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 1000, maxHeight: "calc(100vh - 64px)", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.022em", color: "var(--ink)" }}>{brand}</span>
              {title && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{title}</span>}
            </div>
            {metaLine.trim() && <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{metaLine}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {secondaryAction && (
              <button type="button" onClick={() => secondaryAction.onClick(ref_)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 13px", cursor: "pointer", whiteSpace: "nowrap", marginRight: 2 }}>
                {secondaryAction.label}
              </button>
            )}
            {primaryAction && (
              <button type="button" onClick={() => primaryAction.onClick(ref_)}
                style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: DS.font, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--sel)", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", boxShadow: "var(--sel-rim)", whiteSpace: "nowrap", marginRight: 4 }}>
                {primaryAction.label}
              </button>
            )}
            {refs.length > 1 && (
              <>
                <button data-action="new:despliegue.referencia-anterior" onClick={() => go(-1)} title="Anterior" style={navBtn}><Icon d={IC.chevronLeft} size={14} sw={2.2} /></button>
                <span style={{ fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{idx + 1} / {refs.length}</span>
                <button data-action="new:despliegue.referencia-siguiente" onClick={() => go(1)} title="Siguiente" style={navBtn}><Icon d={IC.chevron} size={14} sw={2.2} /></button>
              </>
            )}
            <button data-action="despliegue.cerrar-referencia" onClick={onClose} title="Cerrar (Esc)" style={{ ...navBtn, marginLeft: 4 }}><Icon d={IC.x} size={15} sw={2} /></button>
          </div>
        </div>

        {/* Cuerpo dos columnas */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", flex: "1 1 auto", minHeight: 0 }}>
          {/* Izquierda: media + acciones + etiquetas + ficha */}
          <div style={{ borderRight: "1px solid var(--line)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", background: "#05070B" }}>
              {isVideo ? (
                drive && isDriveLink(driveUrl) ? (
                  <iframe title="video" src={drivePreviewUrl(driveUrl)} allow="autoplay" style={{ display: "block", width: "100%", aspectRatio: ar, maxHeight: "52vh", border: "none", background: "#05070B" }} />
                ) : drive ? (
                  <video src={driveUrl} controls playsInline preload="metadata" style={{ display: "block", width: "100%", aspectRatio: ar, maxHeight: "52vh", background: "#05070B", objectFit: "contain" }} />
                ) : fileUrl ? (
                  <img src={fileUrl} alt="" style={{ display: "block", width: "100%", aspectRatio: ar, maxHeight: "52vh", objectFit: "contain", background: "#05070B" }} />
                ) : (
                  <MediaPlaceholder ar={ar} arLabel={arLabel} isVideo />
                )
              ) : (
                fileUrl ? (
                  <img src={fileUrl} alt="" style={{ display: "block", width: "100%", aspectRatio: ar, maxHeight: "52vh", objectFit: "contain", background: "#05070B" }} />
                ) : (
                  <MediaPlaceholder ar={ar} arLabel={arLabel} />
                )
              )}
            </div>

            {(showDownload || metaUrl) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {showDownload && (
                  <a data-action="despliegue.descargar-video" href={downloadHref || "#"} target="_blank" rel="noreferrer" style={actionLink}>
                    <Icon d={IC.download} size={14} /> {downloadLabel}
                  </a>
                )}
                {metaUrl && (
                  <a data-action="despliegue.ver-en-meta" href={metaUrl} target="_blank" rel="noreferrer" style={actionLink}>
                    <Icon d={IC.external} size={14} /> Ver en Meta
                  </a>
                )}
              </div>
            )}

            {chips.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>Etiquetas</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {chips.map((ch, i) => (
                    <span key={i} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${ch.color}22`, color: ch.color }}>{ch.value}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {facts.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)", flex: 1 }}>{f.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Derecha: notas + guion */}
          <div style={{ padding: "16px 20px 18px", display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            {ref_.notes ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>Notas del equipo</span>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", margin: 0 }}>{ref_.notes}</p>
              </div>
            ) : null}
            {shownTranscript ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>Guion / transcripción</span>
                <div style={{ flex: 1, minHeight: 140, padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", fontSize: 12.5, lineHeight: 1.75, color: "var(--ink-2)", whiteSpace: "pre-wrap", overflowY: "auto" }}>{shownTranscript}</div>
              </div>
            ) : null}
            {/* Sin guion no se puede replicar la estructura del anuncio, así que
                el visor ofrece sacarlo acá mismo. Se guarda en el banco: se paga
                una sola vez. Solo del lado del equipo (canTranscribe). */}
            {canTranscribe && !shownTranscript && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minHeight: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)" }}>Guion / transcripción</span>
                <div style={{ padding: "18px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px dashed var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6, marginBottom: 12 }}>
                    {txError || "Este referente todavía no tiene guion. Sin él no se puede replicar su estructura."}
                  </div>
                  <button type="button" onClick={runTranscribe} disabled={txBusy}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: txBusy ? "var(--ink-3)" : "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 10, padding: "8px 14px", cursor: txBusy ? "wait" : "pointer" }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                    {txBusy ? "Transcribiendo… puede tardar un minuto" : "Transcribir guion"}
                  </button>
                </div>
              </div>
            )}
            {!ref_.notes && !shownTranscript && !canTranscribe && (
              <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", color: "var(--ink-4)", fontSize: 12.5, padding: "40px 20px" }}>
                Tu equipo todavía no cargó notas ni guion para este creativo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaPlaceholder({ ar, arLabel, isVideo }) {
  return (
    <div style={{ width: "100%", aspectRatio: ar, maxHeight: "52vh", backgroundColor: "var(--raised)", backgroundImage: "repeating-linear-gradient(135deg, rgba(180,200,225,0.10) 0 7px, transparent 7px 15px)", display: "grid", placeItems: "center" }}>
      <span style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", padding: "0 16px", lineHeight: 1.6 }}>
        {isVideo ? "video" : "creativo estático"}<br />{arLabel}
      </span>
    </div>
  );
}

// ── Cadencia read-only (README §5.4) ──
// Cadencia de creativos. Read-only para el cliente; EDITABLE para el admin con
// la MISMA matemática de ConfigModal (avgOrder=CPA, budgetPerCreative, minCreatives,
// splits) para que los números coincidan con el canvas admin.
function CadenceReadOnly({ config, isDark, onClose, isAdmin = false, board = null, patchBoardConfig, reloadSilent }) {
  const c0 = config || {};
  // Estado editable (solo se usa cuando isAdmin). Strings para inputs controlados.
  const [wSpend, setWSpend] = useState(c0.weekly_spend ? String(c0.weekly_spend) : "");
  const [cpaS, setCpaS] = useState(c0.aov ? String(c0.aov) : "");
  const [ticketS, setTicketS] = useState(c0.ticket_aov ? String(c0.ticket_aov) : "");
  const [multS, setMultS] = useState(String(c0.kill_rule_multiplier ?? 3));
  const [scaleS, setScaleS] = useState(String(c0.budget_split?.scale ?? 70));
  const [testingS, setTestingS] = useState(String(c0.budget_split?.testing ?? 30));
  const [tofuS, setTofuS] = useState(String(c0.distribution?.tofu ?? 60));
  const [mofuS, setMofuS] = useState(String(c0.distribution?.mofu ?? 30));
  const [bofuS, setBofuS] = useState(String(c0.distribution?.bofu ?? 10));
  const [curCode, setCurCode] = useState(c0.currency || "COP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Moneda efectiva: editable (admin) o guardada (cliente). Default COP.
  const currency = isAdmin ? curCode : (c0.currency || "COP");
  const CUR = currencyOf(currency);

  // Valores efectivos: del estado editable (admin) o del config (cliente).
  // CPA se guarda (histórico) en config.aov; ticket/AOV real en config.ticket_aov.
  const spend = isAdmin ? (parseFloat(wSpend) || 0) : (Number(c0.weekly_spend) || 0);
  const cpa = isAdmin ? (parseFloat(cpaS) || 0) : (Number(c0.aov) || 0);
  const ticket = isAdmin ? (parseFloat(ticketS) || 0) : (Number(c0.ticket_aov) || 0);
  const mult = isAdmin ? (parseFloat(multS) || 3) : (Number(c0.kill_rule_multiplier) || 3);
  const testingShare = isAdmin ? (parseFloat(testingS) || 0) : Number(c0.budget_split?.testing ?? 30);
  const scaleShare = isAdmin ? (parseFloat(scaleS) || 0) : (100 - Number(c0.budget_split?.testing ?? 30));
  const roas = cpa > 0 && ticket > 0 ? (ticket / cpa).toFixed(1).replace(".", ",") : "—";
  const fmt = (n) => `${CUR.symbol}${Math.round(n || 0).toLocaleString(CUR.locale)}`;
  const testingBudget = spend * (testingShare / 100);
  const scaleBudget = spend * (scaleShare / 100);
  // Presupuesto de prueba por creativo = CPA × multiplicador (igual que ConfigModal
  // avgOrder×mult y computeCompliance) para que el mínimo coincida con el canvas.
  const perCreative = cpa * mult;
  const minWeek = perCreative > 0 ? Math.floor(testingBudget / perCreative) : 0;

  const tofuN = isAdmin ? (parseFloat(tofuS) || 0) : Number(c0.distribution?.tofu ?? 60);
  const mofuN = isAdmin ? (parseFloat(mofuS) || 0) : Number(c0.distribution?.mofu ?? 30);
  const bofuN = isAdmin ? (parseFloat(bofuS) || 0) : Number(c0.distribution?.bofu ?? 10);
  const distEff = { tofu: tofuN, mofu: mofuN, bofu: bofuN };
  const videoShare = Number(c0.format_split?.video ?? 60) / 100;

  // Validación de sumas (solo relevante en modo admin).
  const splitTotal = scaleShare + testingShare;
  const splitValid = Math.abs(splitTotal - 100) < 0.01;
  const pctTotal = tofuN + mofuN + bofuN;
  const pctValid = Math.abs(pctTotal - 100) < 0.01;

  // Auto-balance escalar ↔ testing (mismo patrón que ConfigModal).
  const setScaleBalanced = (v) => {
    const clean = String(v).replace(/[^\d.]/g, ""); setScaleS(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setTestingS(String(Math.round((100 - n) * 100) / 100));
  };
  const setTestingBalanced = (v) => {
    const clean = String(v).replace(/[^\d.]/g, ""); setTestingS(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setScaleS(String(Math.round((100 - n) * 100) / 100));
  };

  const facts = [
    { label: "Inversión semanal", value: fmt(spend), hint: `${currency} por semana en pauta`, edit: "money", state: wSpend, set: setWSpend },
    { label: "Costo por compra (CPA)", value: fmt(cpa), hint: "Promedio de los últimos 30 días", edit: "money", state: cpaS, set: setCpaS },
    { label: "Ticket promedio (AOV)", value: fmt(ticket), hint: "Lo que deja cada venta", edit: "money", state: ticketS, set: setTicketS },
    { label: "ROAS objetivo", value: `${roas}×`, hint: "Meta acordada con tu equipo", edit: null },
  ];
  const split = [
    { key: "scale", label: "ESCALAR GANADORES", pct: scaleShare, amount: `≈ ${fmt(scaleBudget)} ${currency}`, hint: "Se reparte entre los winners validados.", color: "var(--green)", border: "rgba(52,192,138,0.35)", bg: "rgba(52,192,138,0.08)", state: scaleS, set: setScaleBalanced },
    { key: "testing", label: "TESTING", pct: testingShare, amount: `≈ ${fmt(testingBudget)} ${currency}`, hint: "Financia los creativos nuevos de la semana.", color: "var(--amber)", border: "rgba(240,169,59,0.35)", bg: "rgba(240,169,59,0.08)", state: testingS, set: setTestingBalanced },
  ];
  const funnelStates = { tofu: [tofuS, setTofuS], mofu: [mofuS, setMofuS], bofu: [bofuS, setBofuS] };
  const funnel = STAGES.map((st) => {
    const pctVal = distEff[st.key] || 0;
    const n = Math.round((minWeek * pctVal) / 100);
    const vid = Math.round(n * videoShare);
    const stat = Math.max(0, n - vid);
    const [state, set] = funnelStates[st.key];
    return { key: st.key, label: st.label, color: stageColor(st.key, isDark), pct: `${pctVal}%`, creatives: `≈ ${n} creativo${n === 1 ? "" : "s"}`, split: `${vid} video · ${stat} estático${stat === 1 ? "" : "s"}`, state, set };
  });

  // Slider 1×–10×, banda 3×–5×.
  const scaleMax = 10, bandFrom = 3, bandTo = 5;
  const bandLeft = ((bandFrom - 1) / (scaleMax - 1)) * 100;
  const bandWidth = ((bandTo - bandFrom) / (scaleMax - 1)) * 100;
  const markerLeft = ((Math.min(scaleMax, Math.max(1, mult)) - 1) / (scaleMax - 1)) * 100;

  const doSave = async () => {
    if (!board?.id) return;
    if (!splitValid) { setError("La distribución del presupuesto (escalar + testing) debe sumar 100."); return; }
    if (!pctValid) { setError("Los porcentajes del embudo deben sumar 100."); return; }
    if (spend <= 0 || cpa <= 0) { setError("Completá inversión semanal y CPA."); return; }
    setSaving(true); setError(null);
    const patch = {
      weekly_spend: spend,
      aov: cpa,
      ticket_aov: ticket || null,
      kill_rule_multiplier: mult,
      budget_split: { scale: scaleShare, testing: testingShare },
      distribution: { tofu: tofuN, mofu: mofuN, bofu: bofuN },
      currency: curCode,
    };
    try {
      patchBoardConfig?.(patch);            // optimista en memoria
      await updateBoardConfig(board.id, { ...c0, ...patch });
      await reloadSilent?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(8,8,14,0.64)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "44px 24px 24px", overflowY: "auto", fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 880, height: "fit-content", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.026em", margin: 0 }}>Cadencia de creativos</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{isAdmin ? "Ajustá los números de la cuenta y la distribución. Se aplica al despliegue del cliente." : "Cuántos creativos se producen por semana según tu inversión. La configura tu equipo."}</span>
          </div>
          <button data-action="despliegue.cerrar-cadencia" onClick={onClose} title="Cerrar (Esc)" style={closeBtn}><Icon d={IC.x} size={15} sw={2} /></button>
        </div>

        <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Números de la cuenta */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Números de la cuenta</span>
              <span style={{ flex: 1 }} />
              {isAdmin ? (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Moneda</span>
                  <select
                    data-action="despliegue.cadencia-moneda"
                    value={curCode}
                    onChange={(e) => setCurCode(e.target.value)}
                    title="Moneda en que se muestran los montos de la cuenta"
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
                    {CURRENCY_CODES.map((code) => (
                      <option key={code} value={code}>{code} · {currencyOf(code).label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 600 }}>{currency} · {CUR.label}</span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 12 }}>
              {facts.map((f, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface-2)", padding: "13px 15px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{f.label}</span>
                  {isAdmin && f.edit === "money" ? (
                    <CadMoneyInput value={f.state} onChange={f.set} symbol={CUR.symbol} locale={CUR.locale} />
                  ) : (
                    <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.028em", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{f.value}</span>
                  )}
                  <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)" }}>{f.hint}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Presupuesto de prueba por creativo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Presupuesto de prueba por creativo</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Cuántas veces el CPA recibe cada creativo antes de descartarlo.</span>
            </div>
            <div style={{ position: "relative", height: 36 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 16, height: 4, borderRadius: 999, background: "var(--chip)" }} />
              <div style={{ position: "absolute", left: `${bandLeft}%`, width: `${bandWidth}%`, top: 16, height: 4, borderRadius: 999, background: "rgba(52,192,138,0.5)" }} />
              <div style={{ position: "absolute", left: `${markerLeft}%`, top: 6, width: 34, marginLeft: -17, height: 24, borderRadius: 999, background: "var(--surface-solid)", border: "1.5px solid var(--green)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--green)", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>{mult % 1 === 0 ? mult : mult}×</div>
              {isAdmin && (
                <input type="range" min={1} max={scaleMax} step={0.5} value={Math.min(scaleMax, Math.max(1, mult))}
                  data-action="despliegue.cadencia-multiplicador"
                  onChange={(e) => setMultS(e.target.value)}
                  title="Arrastrá para elegir el presupuesto de prueba"
                  style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: 36, margin: 0, opacity: 0, cursor: "pointer" }} />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {Array.from({ length: scaleMax }, (_, i) => {
                const n = i + 1;
                const inBand = n >= bandFrom && n <= bandTo;
                return isAdmin ? (
                  <button key={n} onClick={() => setMultS(String(n))} data-action="despliegue.cadencia-multiplicador"
                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 10.5, fontWeight: inBand ? 700 : 500, color: inBand ? "var(--green)" : "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{n}×</button>
                ) : (
                  <span key={n} style={{ fontSize: 10.5, fontWeight: inBand ? 700 : 500, color: inBand ? "var(--green)" : "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{n}×</span>
                );
              })}
            </div>
            <span style={{ fontSize: 11.5, color: "var(--green)" }}>Entre 3× y 5× es el rango recomendado para tu CPA actual.</span>
          </div>

          {/* 3. Distribución del presupuesto */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Distribución del presupuesto</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {split.map((sp) => (
                <div key={sp.key} style={{ border: `1px solid ${sp.border}`, borderRadius: 14, background: sp.bg, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: sp.color }}>{sp.label}</span>
                  {isAdmin ? (
                    <CadPctInput value={sp.state} onChange={sp.set} color={sp.color} big />
                  ) : (
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{sp.pct}%</span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{sp.amount}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{sp.hint}</span>
                </div>
              ))}
            </div>
            {isAdmin && (
              <span style={{ fontSize: 11, color: splitValid ? "var(--green)" : "var(--brand)" }}>Suma: {Math.round(splitTotal * 100) / 100}% {splitValid ? "✓" : "(debe ser 100)"}</span>
            )}
          </div>

          {/* 4. Creativos mínimos por semana */}
          <div style={{ border: "1px solid rgba(52,192,138,0.3)", borderRadius: 16, background: "rgba(52,192,138,0.07)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 180 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", color: "var(--green)" }}>CREATIVOS MÍNIMOS POR SEMANA</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Presupuesto de testing ÷ (CPA × presupuesto de prueba).</span>
            </div>
            <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.04em", color: "var(--ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{minWeek}</span>
          </div>

          {/* 5. Distribución por embudo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Distribución por embudo</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {funnel.map((cf) => (
                <div key={cf.key} style={{ border: "1px solid var(--line)", borderLeft: `2px solid ${cf.color}`, borderRadius: 14, background: "var(--surface-2)", padding: "13px 15px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: cf.color }}>{cf.label}</span>
                  {isAdmin ? (
                    <CadPctInput value={cf.state} onChange={(v) => cf.set(String(v).replace(/[^\d.]/g, ""))} color={cf.color} />
                  ) : (
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{cf.pct}</span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{cf.creatives}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{cf.split}</span>
                </div>
              ))}
            </div>
            {isAdmin && (
              <span style={{ fontSize: 11, color: pctValid ? "var(--green)" : "var(--brand)" }}>Suma: {Math.round(pctTotal * 100) / 100}% {pctValid ? "✓" : "(debe ser 100)"}</span>
            )}
          </div>

          {/* Guardar (solo admin) */}
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, paddingTop: 4, borderTop: "1px solid var(--line)", marginTop: 2, flexWrap: "wrap" }}>
              {error && <span style={{ fontSize: 12, color: "var(--brand)", flex: 1 }}>{error}</span>}
              <button onClick={onClose} disabled={saving} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
              <button data-action="despliegue.cadencia-guardar" onClick={doSave} disabled={saving || !splitValid || !pctValid}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 999, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", fontSize: 12.5, fontWeight: 700, cursor: (saving || !splitValid || !pctValid) ? "not-allowed" : "pointer", opacity: (saving || !splitValid || !pctValid) ? 0.55 : 1, fontFamily: "inherit" }}>
                <Icon d={IC.check} size={14} sw={2} /> {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Input de dinero para la cadencia editable — mantiene el look de valor 21px.
function CadMoneyInput({ value, onChange, symbol = "$", locale = "es-CO" }) {
  const display = value ? Number(value).toLocaleString(locale) : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-4)" }}>{symbol}</span>
      <input value={display} inputMode="numeric" placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        style={{ width: "100%", minWidth: 0, border: "none", borderBottom: "1px solid var(--line-2)", background: "transparent", color: "var(--ink)", fontSize: 21, fontWeight: 700, letterSpacing: "-0.028em", fontVariantNumeric: "tabular-nums", fontFamily: "inherit", outline: "none", padding: "1px 0" }} />
    </div>
  );
}

// Input de porcentaje para la cadencia editable.
function CadPctInput({ value, onChange, color, big = false }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
      <input type="number" min={0} max={100} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: big ? 62 : 54, border: "none", borderBottom: `1px solid ${color}`, background: "transparent", color: "var(--ink)", fontSize: big ? 24 : 20, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", fontFamily: "inherit", outline: "none", padding: "1px 0" }} />
      <span style={{ fontSize: big ? 15 : 13, fontWeight: 700, color: "var(--ink-3)" }}>%</span>
    </div>
  );
}

// ═══════════ Estrategia de venta — tablero read-only (3 columnas) ═══════════
// Espeja StrategyModal (§5.3). El admin ve un lápiz que abre el StrategyModal
// editable; el cliente nunca puede editar.
// Parsea el texto libre de una guía en estructura: intro + preguntas numeradas
// (1. ¿…? explicación) + notas (Dónde/Regla/Ojo/Cómo…). Tolerante: si el texto no
// tiene esa forma, no rompe (items/notes quedan vacíos → se muestra como prosa).
function parseGuide(text) {
  const lines = String(text || "").split(/\r?\n/);
  const intro = [];
  const items = [];
  const notes = [];
  let seen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const note = line.match(/^(Dónde[^:]*|Regla|Ojo|Cómo[^:]*|Nota|Tip)\s*:\s*(.*)$/i);
    const num = line.match(/^(\d+)[.)]\s*(.*)$/);
    if (note) { notes.push({ label: note[1], text: note[2] }); seen = true; }
    else if (num) {
      seen = true;
      const rest = num[2];
      const q = rest.indexOf("?");
      let question = rest, body = "";
      if (q >= 0) { question = rest.slice(0, q + 1).trim(); body = rest.slice(q + 1).trim(); }
      items.push({ num: num[1], question, body });
    } else if (!seen) intro.push(line);
    else if (items.length) items[items.length - 1].body = (items[items.length - 1].body + " " + line).trim();
    else notes.push({ label: "", text: line });
  }
  return { intro: intro.join(" "), items, notes };
}

// Render lindo de una guía de sección (dropshipping): intro + tarjetas numeradas
// (número en badge de color, pregunta en negrita, explicación) + callouts.
function GuideBlock({ text, color, tint }) {
  const { intro, items, notes } = useMemo(() => parseGuide(text), [text]);
  if (!items.length && !notes.length) {
    return <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{text}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {intro && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-3)" }}>{intro}</p>}
      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "12px 14px", borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <span style={{ flexShrink: 0, width: 25, height: 25, borderRadius: 8, display: "grid", placeItems: "center", background: `linear-gradient(${tint}, ${tint}), var(--surface-solid)`, color, fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{it.num}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", lineHeight: 1.4 }}>{it.question}</div>
                {it.body && <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-3)", marginTop: 4 }}>{it.body}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {notes.map((n, i) => (
        <div key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", padding: "10px 14px", borderRadius: 11, background: `linear-gradient(${tint}, ${tint}), var(--surface-solid)`, borderLeft: `3px solid ${color}` }}>
          {n.label && <span style={{ fontWeight: 800, color }}>{n.label}: </span>}{n.text}
        </div>
      ))}
    </div>
  );
}

function StrategyBoard({ touchpoints, mode = "items", guide = {}, isDark, isAdmin = false, productSelector = null, onEdit, onClose }) {
  const data = useMemo(() => normalizeTouchpoints(touchpoints), [touchpoints]);
  const guideData = useMemo(() => normalizeGuide(guide), [guide]);
  const isGuide = mode === "guide";
  const SECTIONS = [
    { key: "angles", label: isGuide ? "Ángulos de venta" : "Ángulos", color: isDark ? "#34C08A" : "#17976A", tint: isDark ? "rgba(52,192,138,0.13)" : "rgba(23,151,106,0.10)", hint: "Las razones por las que la gente sí compra — cada concepto sale de un ángulo." },
    { key: "objections", label: "Objeciones", color: isDark ? "#E24B4A" : "#C4302F", tint: isDark ? "rgba(226,75,74,0.14)" : "rgba(196,48,47,0.09)", hint: "Motivos por los que NO compran — hay que derribarlos con contenido." },
    { key: "awareness", label: isGuide ? "Puntos de conciencia" : "Conciencia", color: isDark ? "#58A6FF" : "#2664CC", tint: isDark ? "rgba(88,166,255,0.14)" : "rgba(38,100,204,0.09)", hint: "Cosas que la gente no sabe y, si las entendiera, te compraría más." },
  ];
  const [hidden, setHidden] = useState({});
  const [expanded, setExpanded] = useState({});
  const visible = SECTIONS.filter((s) => !hidden[s.key]);
  const cols = Math.max(1, visible.length);
  const total = SECTIONS.reduce((n, s) => n + data[s.key].length, 0);
  const cardBg = isDark ? "var(--surface-2)" : "#FFFFFF";

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-modal
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(8,8,14,0.64)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "44px 24px 24px", overflowY: "auto", fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 900, maxHeight: "calc(100vh - 68px)", background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow-lg)", color: "var(--ink)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px 14px", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.026em", margin: 0 }}>Estrategia de venta</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Los puntos de contacto que guían cada concepto del embudo.</span>
            {productSelector && <div style={{ marginTop: 8 }}>{productSelector}</div>}
          </div>
          {isAdmin && (
            <button data-action="despliegue.estrategia-editar" onClick={onEdit} title="Editar la estrategia de venta"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
              <Icon d={IC.pencil} size={13} sw={1.9} /> Editar
            </button>
          )}
          <button data-action="despliegue.cerrar-estrategia" onClick={onClose} title="Cerrar (Esc)" style={closeBtn}><Icon d={IC.x} size={15} sw={2} /></button>
        </div>

        {isGuide ? (
          /* Modo GUÍA (dropshipping): 3 secciones apiladas con prosa explicativa */
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 22px 26px", display: "flex", flexDirection: "column", gap: 24 }}>
            {SECTIONS.map((sec) => {
              const txt = (guideData[sec.key] || "").trim();
              return (
                <div key={sec.key} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                  <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, padding: "8px 15px", borderRadius: 12, background: `linear-gradient(${sec.tint}, ${sec.tint}), var(--surface-solid)`, border: `1px solid ${sec.color}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: sec.color }}>{sec.label}</span>
                  </div>
                  {txt ? (
                    <GuideBlock text={guideData[sec.key]} color={sec.color} tint={sec.tint} />
                  ) : (
                    <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-4)", padding: "4px 2px" }}>Aún no está cargada esta guía.</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
        <>
        {/* Fila Mostrar */}
        <div style={{ padding: "0 22px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>Mostrar</span>
          {SECTIONS.map((s) => {
            const on = !hidden[s.key];
            return (
              <button key={s.key} data-action="new:despliegue.estrategia-seccion"
                onClick={() => setHidden((h) => ({ ...h, [s.key]: on }))}
                title={on ? `Ocultar ${s.label.toLowerCase()}` : `Mostrar ${s.label.toLowerCase()}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, border: `1px solid ${on ? s.color : "var(--line)"}`, background: on ? s.tint : "transparent", color: on ? s.color : "var(--ink-4)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
                {s.label}
                <span style={{ fontSize: 10.5, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{data[s.key].length}</span>
              </button>
            );
          })}
        </div>

        {/* Cuerpo: columnas */}
        {total === 0 ? (
          <div style={{ padding: "48px 24px 56px", textAlign: "center", color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)" }}>Tu estrategia de venta todavía no está cargada.</span>
            {isAdmin ? (
              <button data-action="despliegue.estrategia-editar" onClick={onEdit}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700 }}>
                <Icon d={IC.pencil} size={14} sw={1.9} /> Cargar estrategia
              </button>
            ) : (
              <span style={{ fontSize: 12.5 }}>Tu equipo de Inforce la va a cargar acá.</span>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 22px 24px", display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14, alignItems: "start" }}>
            {visible.map((sec) => (
              <div key={sec.key} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px", borderRadius: 12, background: `linear-gradient(${sec.tint}, ${sec.tint}), var(--surface-solid)`, border: `1px solid ${sec.color}` }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: sec.color, flex: 1 }}>{sec.label}</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{data[sec.key].length}</span>
                  </div>
                  <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-3)" }}>{sec.hint}</span>
                </div>
                {data[sec.key].length === 0 ? (
                  <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-4)", padding: "4px 2px" }}>Aún no hay puntos cargados acá.</div>
                ) : (
                  data[sec.key].map((it) => {
                    const open = !!expanded[it.id];
                    return (
                      <div key={it.id} style={{ border: "1px solid var(--line)", borderLeft: `2px solid ${sec.color}`, borderRadius: 12, background: cardBg, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{it.title || "—"}</span>
                        {it.desc && (
                          <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-3)", whiteSpace: "pre-wrap", ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal" }) }}>{it.desc}</span>
                        )}
                        {it.desc && it.desc.length > 90 && (
                          <button data-action="new:despliegue.estrategia-ver-mas" onClick={() => setExpanded((e) => ({ ...e, [it.id]: !e[it.id] }))}
                            style={{ alignSelf: "flex-start", padding: "4px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                            {open ? "Ver menos" : "Ver más"}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

const closeBtn = { width: 32, height: 32, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 };
const navBtn = { width: 32, height: 32, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center" };
const actionLink = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none", fontFamily: "inherit" };

// ── Estados ──
function LoadingState() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "calc(100vh - 240px)", minHeight: 400, color: "var(--ink-3)", gap: 14 }}>
      <div className="spinner" />
      <span style={{ fontSize: 13.5 }}>Cargando tu despliegue…</span>
    </div>
  );
}
function EmptyState({ kind, onNavigate, onClear, pipeline, onBackToAds }) {
  const organic = pipeline === "organic";
  const map = {
    "sin-despliegue": {
      t: organic ? "Todavía no hay despliegue orgánico" : "Tu despliegue todavía no está armado",
      s: organic ? "Aún no montaron el embudo de contenido orgánico para esta cuenta." : "Tu equipo de Inforce va a montar acá el embudo con los conceptos y referencias de tu cuenta.",
      cta: "Escribirle a tu equipo",
    },
    vacio: {
      t: organic ? "El despliegue orgánico todavía no tiene conceptos" : "Todavía no hay conceptos",
      s: organic ? "En cuanto tu equipo agregue conceptos orgánicos, los vas a ver acá." : "En cuanto tu equipo agregue conceptos al despliegue, los vas a ver acá organizados por embudo.",
      cta: "Escribirle a tu equipo",
    },
    "sin-match": { t: "Nada coincide con este filtro", s: "Probá con menos filtros o limpialos para ver todo el despliegue.", cta: null },
    error: { t: "No pudimos cargar el despliegue", s: "Los datos siguen guardados; volvé a intentar en un momento.", cta: null },
  };
  const c = map[kind] || map.vacio;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", padding: "60px 32px", borderRadius: 20, border: "1.5px dashed var(--line-2)", background: "var(--surface)" }}>
      <div style={{ width: 54, height: 54, borderRadius: 17, background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--ink-4)" }}><Icon d={IC.funnel} size={25} sw={1.7} /></div>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--ink)" }}>{c.t}</span>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-3)", maxWidth: "52ch" }}>{c.s}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Volver a Anuncios — si el orgánico está vacío, que no quedes atrapado. */}
        {organic && onBackToAds && (
          <button data-action="new:despliegue.volver-anuncios" onClick={onBackToAds} style={ctaBtn}>
            <Icon d={IC.chevron} size={14} style={{ transform: "rotate(180deg)" }} /> Volver a Anuncios
          </button>
        )}
        {kind === "sin-match" ? (
          <button onClick={onClear} data-action="despliegue.limpiar-filtros" style={ctaBtn}>Limpiar filtros</button>
        ) : c.cta ? (
          <button data-action="new:despliegue.contactar-equipo" onClick={() => onNavigate?.("equipo")} style={{ ...ctaBtn, background: "transparent", color: "var(--ink-2)", border: "1px solid var(--line)" }}><Icon d={IC.mail} size={14} /> {c.cta}</button>
        ) : null}
      </div>
    </div>
  );
}
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: "1px solid rgba(111,184,255,0.42)", background: "var(--sel-soft)", color: "var(--sel)", cursor: "pointer", fontFamily: DS.font, fontSize: 13.5, fontWeight: 600 };

// ── Helpers ──
function shortLine(text) {
  const s = (text || "").split(/[.\n]/)[0].trim();
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
// Marca dominante = la que más se repite entre las refs del concepto.
function dominantBrand(refs) {
  const counts = new Map();
  for (const ref of refs) for (const b of getLabels(ref).marca || []) {
    const k = normLabel(b);
    if (!counts.has(k)) counts.set(k, { value: b, n: 0 });
    counts.get(k).n++;
  }
  let best = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best ? best.value : null;
}
// Hasta `max` chips: marca dominante primero, después otras categorías.
function firstLabels(refs, max) {
  const out = [];
  const seen = new Set();
  const brand = dominantBrand(refs);
  if (brand) { out.push({ value: brand, color: CATEGORY_BY_KEY.marca.color }); seen.add(`marca:${normLabel(brand)}`); }
  for (const ref of refs) {
    for (const cat of LABEL_CATEGORIES) {
      if (cat.key === "formato" || cat.key === "marca") continue;
      for (const val of getLabels(ref)[cat.key] || []) {
        const k = `${cat.key}:${normLabel(val)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ value: val, color: cat.color });
        if (out.length >= max) return out;
      }
    }
    if (out.length >= max) return out;
  }
  return out;
}
// Chips de categorías que NO son marca ni formato (para la cabecera del modal).
function otherLabels(refs, max) {
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    for (const cat of LABEL_CATEGORIES) {
      if (cat.key === "formato" || cat.key === "marca") continue;
      for (const val of getLabels(ref)[cat.key] || []) {
        const k = `${cat.key}:${normLabel(val)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ value: val, color: cat.color });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}
// Todos los chips de una variación, en orden de categoría.
function allChips(ref) {
  const out = [];
  const l = getLabels(ref);
  for (const cat of LABEL_CATEGORIES) for (const val of l[cat.key] || []) out.push({ value: val, color: cat.color });
  return out;
}
// Lista de marcas únicas presentes en las refs.
function brandsList(refs) {
  const seen = [];
  for (const r of refs) {
    const b = (getLabels(r).marca || [])[0];
    if (b && !seen.some((x) => normLabel(x) === normLabel(b))) seen.push(b);
  }
  return seen;
}
function computeCompliance(concepts, variations, config) {
  const byStage = { tofu: { target: 0, done: 0 }, mofu: { target: 0, done: 0 }, bofu: { target: 0, done: 0 } };
  const spend = Number(config?.weekly_spend) || 0;
  const aov = Number(config?.aov) || 0;
  const mult = Number(config?.kill_rule_multiplier) || 3;
  const dist = config?.distribution;
  const testingShare = Number(config?.budget_split?.testing ?? 30);
  if (spend > 0 && aov > 0 && dist) {
    const total = (aov * mult) > 0 ? Math.floor((spend * (testingShare / 100)) / (aov * mult)) : 0;
    byStage.tofu.target = Math.round((total * (dist.tofu || 0)) / 100);
    byStage.mofu.target = Math.round((total * (dist.mofu || 0)) / 100);
    byStage.bofu.target = Math.round((total * (dist.bofu || 0)) / 100);
  } else {
    for (const c of concepts) if (byStage[c.stage]) byStage[c.stage].target += c.weekly_target || 0;
  }
  const range = weekRangeISO(new Date());
  const byConcept = {};
  for (const v of variations) (byConcept[v.concept_id] ||= []).push(v);
  for (const c of concepts) {
    const vs = byConcept[c.id] || [];
    const inWeek = vs.filter((v) => v.source_type === "produced" && v.produced_at && new Date(v.produced_at) >= range.from && new Date(v.produced_at) <= range.to).length;
    if (byStage[c.stage]) byStage[c.stage].done += inWeek;
  }
  const target = byStage.tofu.target + byStage.mofu.target + byStage.bofu.target;
  const done = byStage.tofu.done + byStage.mofu.done + byStage.bofu.done;
  return { byStage, target, done };
}
