import { useEffect, useMemo, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { SESSION_EXPIRED } from "../../lib/backend.js";
import { extractAdLibraryPageId } from "../../lib/adLibrary.js";
import { registrarGuardiaDeSalida } from "../../lib/salidaGuard.js";
import { enqueueImportJob } from "./importJobsDb.js";
import { LabelChips } from "../../despliegue/ReferenceLabelUI.jsx";
import { canManageBank, canOperateInbox } from "../lib/permissions.js";
import { BANK_REFS_COMPANY_NAME, listBankConcepts } from "../concept_bank/db.js";
import { BandejaFilterPanel } from "./BandejaFilterPanel.jsx";
import { InboxItemModal } from "./InboxItemModal.jsx";
import { ClassifyRefsModal } from "./ClassifyRefsModal.jsx";
import { ForeplaySyncModal } from "./ForeplaySyncModal.jsx";
import { RetagFeed } from "./RetagFeed.jsx";
import { LabelManagerModal } from "../concept_bank/LabelManagerModal.jsx";
import { DuplicatesModal } from "./DuplicatesModal.jsx";
import {
  listInbox, addInboxItems, setInboxStatus, setInboxStatusBulk,
  deleteInboxItem, deleteInboxBulk, assignCompanyBulk, classifyInboxBulk, reclassifyLabelsBulk,
  analyzeInboxItem, buildKnownFormats, buildKnownLabels,
  commitInboxItem, commitInboxItemsBulk, canAutoCommit,
  createUploadInboxItems, analyzeUploadedVideo,
  addDriveInboxItems, analyzeDriveVideo, isDriveLink, isFacebookAdsLibrary,
  identifyDocument, importSections, enrichFaltantesWithApify,
  backfillVariationNotes, backupItemsToDrive, ensureFormatPatterns,
  findInboxDuplicates, findBankDuplicates, deleteBankVariations,
} from "./inboxDb.js";
import { BANK_REFS_COMPANY_ID } from "../concept_bank/db.js";
import { logger } from "../../lib/logger.js";

const STATUS_TABS = [
  { key: "review",   label: "Por revisar", match: (s) => ["pending", "enriching", "ready"].includes(s) },
  { key: "approved", label: "Aprobados",   match: (s) => s === "approved" },
  { key: "imported", label: "Cargados",    match: (s) => s === "imported" },
  { key: "rejected", label: "Rechazados",  match: (s) => s === "rejected" },
];

const CAP_STAGES = [
  { key: "", label: "— etapa" },
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];
const CAP_MEDIA = [
  { key: "", label: "— tipo" },
  { key: "video", label: "Video" },
  { key: "static", label: "Imagen" },
];

const PLATFORM = {
  meta:   { label: "Meta", color: DS.blue },
  drive:  { label: "Drive", color: DS.green },
  upload: { label: "Subido", color: DS.purple },
  other:  { label: "Link", color: DS.textMuted },
};

// Bandeja de Referentes ("Por revisar"): staging de anuncios de Facebook Ads
// Library antes de cargarlos al Banco de creativos. Config fija (sticky) para
// pegar tandas de links de la misma etapa/tipo/concepto sin re-seleccionar.
// Cuenta aparte lo que ya estaba de lo que Meta devolvió repetido. Antes iban
// juntos en un "N ya estaban" que mentía: importar una marca nueva decía que 79
// ya estaban cuando nunca se había traído ninguno.
function resumenDescarte(yaEstaban = 0, copias = 0) {
  const partes = [];
  if (yaEstaban) partes.push(`${yaEstaban} ya ${yaEstaban === 1 ? "estaba" : "estaban"}`);
  if (copias) partes.push(`${copias} ${copias === 1 ? "era una copia" : "eran copias"} del mismo creativo en Meta`);
  return partes.length ? ` · ${partes.join(" · ")}` : "";
}

export function BandejaPage({ currentMember = null, companies = [] }) {
  // Traer, analizar, aprobar y cargar es el trabajo de la bandeja: lo hace quien
  // tiene la vista. `canManage` queda solo para lo que reorganiza el BANCO —
  // etiquetas, notas, patrones— que sí es de dueño.
  const puedeOperar = canOperateInbox(currentMember);
  const canManage = canManageBank(currentMember);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Barra de captura (todo sticky salvo el textarea) ───
  const [urlsText, setUrlsText] = useState("");
  const [addCompanyId, setAddCompanyId] = useState("");
  const [addPipeline, setAddPipeline] = useState("ads");
  const [addStage, setAddStage] = useState("");
  const [addMedia, setAddMedia] = useState("");
  const [conceptMode, setConceptMode] = useState("none"); // none | new | existing
  const [addFormatName, setAddFormatName] = useState("");
  const [addTargetConceptId, setAddTargetConceptId] = useState("");
  const [conceptSearch, setConceptSearch] = useState("");
  const [bankConcepts, setBankConcepts] = useState(null);
  const [addNote, setAddNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState(null);

  // Filtros
  const [tab, setTab] = useState("review");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [conceptFilter, setConceptFilter] = useState("all");
  const [hideMissing, setHideMissing] = useState(false);
  const [search, setSearch] = useState("");

  // Selección múltiple
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCompany, setBulkCompany] = useState("");
  const [classifyOpen, setClassifyOpen] = useState(false);

  // Modal detalle
  const [detailItem, setDetailItem] = useState(null);

  // Feed de re-etiquetado (snapshot estable al abrir, no la vista viva)
  const [retagOpen, setRetagOpen] = useState(false);
  const [retagItems, setRetagItems] = useState([]);
  // Gestor de etiquetas (unifica banco + bandeja)
  const [labelMgrOpen, setLabelMgrOpen] = useState(false);
  // Duplicados (bandeja o banco)
  const [dupMode, setDupMode] = useState(null);      // null | 'inbox' | 'bank'
  const [dupGroups, setDupGroups] = useState([]);
  const [dupBusy, setDupBusy] = useState(false);

  // Análisis con IA
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  // Progreso global de un lote (barra X/N) + fallas visibles (id → motivo).
  const [batch, setBatch] = useState({ done: 0, total: 0, label: "" });
  const [forceReanalyze, setForceReanalyze] = useState(false);   // re-analizar los ya hechos (gasta Claude)
  const [failedIds, setFailedIds] = useState(new Map());
  const batchStart = (total, label = "Analizando") => setBatch({ done: 0, total, label });
  const batchTick = () => setBatch((b) => ({ ...b, done: b.done + 1 }));
  const batchEnd = () => setBatch({ done: 0, total: 0, label: "" });
  const markFailed = (id, reason) => setFailedIds((m) => { const n = new Map(m); if (reason) n.set(id, reason); else n.delete(id); return n; });
  const [committing, setCommitting] = useState(false);
  const [apifyBusy, setApifyBusy] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  // 🏆 Descubrir top de una marca (Apify)
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverBrand, setDiscoverBrand] = useState("");
  const [discoverN, setDiscoverN] = useState(100);
  const [discoverMedia, setDiscoverMedia] = useState("");   // "", "video", "static"
  // Meta corre la misma creatividad en varios anuncios. Por defecto se trae una
  // sola —es el mismo video— pero a veces hace falta el lote completo.
  const [traerCopias, setTraerCopias] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState(null);
  const [foreplayOpen, setForeplayOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);   // menú "Importar ▾"
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);     // menú "Herramientas ▾"
  const knownFormatsRef = useRef(null);
  const knownLabelsRef = useRef(null);
  const fileFallbackRef = useRef(null);
  const pendingFileItemRef = useRef(null);
  const uploadVideosRef = useRef(null);
  const [progressById, setProgressById] = useState({});
  const [docOpen, setDocOpen] = useState(false);
  const [docText, setDocText] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [docErr, setDocErr] = useState(null);
  const [docStep, setDocStep] = useState("paste");   // 'paste' | 'preview'
  const [docRows, setDocRows] = useState([]);         // filas editables del preview
  const [docConcepts, setDocConcepts] = useState([]); // conceptos existentes (para el selector)
  const [docSel, setDocSel] = useState(new Set());    // índices seleccionados para la tanda
  // Cola de análisis (no bloqueante): Jose sigue subiendo/pegando mientras corre.
  const queueRef = useRef([]);            // tareas: { item, kind:'file'|'drive', file? }
  const drainingRef = useRef(false);
  const [queueCount, setQueueCount] = useState(0);

  // ─── No perder trabajo al navegar ──────────────────────────────────────
  // Todo esto vive en memoria de este componente, y al cambiar de sección
  // TeamApp lo desmonta. Hasta que la cola viva en el servidor, avisamos.
  const [salidaPendiente, setSalidaPendiente] = useState(null);

  const enCurso = [];
  if (queueCount > 0) enCurso.push(`${queueCount} en cola de análisis`);
  if (batch.total > 0) enCurso.push(`${batch.label.toLowerCase()} ${batch.done} de ${batch.total}`);
  if (discoverBusy) enCurso.push("trayendo anuncios de una marca");
  if (apifyBusy) enCurso.push("buscando en Meta los que faltaban");
  if (driveBusy) enCurso.push("respaldando videos en Drive");
  if (committing) enCurso.push("pasando anuncios al banco");
  const hayTrabajo = enCurso.length > 0;

  useEffect(() => {
    if (!hayTrabajo) return;

    // Cerrar o recargar la pestaña: solo se puede el aviso nativo del navegador.
    const alCerrar = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", alCerrar);

    // Cambiar de sección dentro de la app: acá sí podemos preguntar bien.
    const soltar = registrarGuardiaDeSalida((continuar) => {
      setSalidaPendiente(() => continuar);
      return false;
    });

    return () => { window.removeEventListener("beforeunload", alCerrar); soltar(); };
  }, [hayTrabajo]);

  // Si el trabajo termina con el diálogo abierto, ya no hay nada que perder:
  // lo dejamos ir a donde quería.
  useEffect(() => {
    if (!hayTrabajo && salidaPendiente) {
      const ir = salidaPendiente;
      setSalidaPendiente(null);
      ir();
    }
  }, [hayTrabajo, salidaPendiente]);

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id) => (id ? (m.get(id) || id) : BANK_REFS_COMPANY_NAME);
  }, [companies]);

  const reload = async () => {
    setLoading(true); setError(null);
    try {
      setItems(await listInbox());
    } catch (e) {
      logger.error("[Bandeja] load failed", e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  // Update INCREMENTAL de un solo ítem (sin re-fetch de toda la bandeja) → evita el
  // "se reinicia la página" tras analizar cada uno. `row` = la fila ya actualizada
  // que devuelven analyzeInboxItem/analyzeUploadedVideo/etc.
  const patchItem = (id, row) => {
    if (!row) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...row } : x)));
  };

  // Conceptos del banco (fuente canónica): se cargan al montar. Los usa tanto el
  // selector "concepto existente" como el FILTRO por concepto de la bandeja.
  useEffect(() => {
    if (bankConcepts === null) {
      listBankConcepts().then(setBankConcepts).catch((e) => setError(e?.message || String(e)));
    }
  }, [bankConcepts]);

  const conceptOptions = useMemo(() => {
    if (!bankConcepts) return [];
    const term = conceptSearch.trim().toLowerCase();
    const list = bankConcepts
      .filter((c) => c.pipeline_type === addPipeline)
      .filter((c) => {
        if (!term) return true; // sin texto → mostramos TODOS
        const hay = `${c.name || ""} ${c.company_name || ""}`.toLowerCase();
        return hay.includes(term);
      });
    // Empresa elegida primero, luego alfabético por nombre.
    list.sort((a, b) => {
      const aOwn = addCompanyId && a.company_id === addCompanyId ? 0 : 1;
      const bOwn = addCompanyId && b.company_id === addCompanyId ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return (a.name || "").localeCompare(b.name || "");
    });
    return list.slice(0, 100);
  }, [bankConcepts, conceptSearch, addCompanyId, addPipeline]);

  const selectedConcept = useMemo(
    () => (bankConcepts || []).find((c) => c.id === addTargetConceptId) || null,
    [bankConcepts, addTargetConceptId]
  );

  const activeTab = STATUS_TABS.find((t) => t.key === tab) || STATUS_TABS[0];
  const counts = useMemo(() => {
    const out = {};
    for (const t of STATUS_TABS) out[t.key] = items.filter((it) => t.match(it.status)).length;
    return out;
  }, [items]);

  const companyOptions = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const id = it.company_id || "__bank__";
      if (!map.has(id)) map.set(id, companyName(it.company_id));
    }
    return [{ id: "all", name: "Todas" }, ...Array.from(map.entries()).map(([id, name]) => ({ id, name }))];
  }, [items, companyName]);

  // Analizado pero SIN transcripción (típico: Whisper falló por saldo OpenAI) con
  // el video ya guardado → se puede re-analizar para completar ángulo/descripción.
  const isNoTranscript = (it) => !it.ai_raw?.needs_file && !!it.ai_raw?.video_url && !(it.transcript && it.transcript.trim());
  // Tiene video para respaldar pero NO tiene link de Drive → "Faltan Drive".
  const isNoDrive = (it) => !it.video_backup_url && !!it.ai_raw?.video_url;
  // Formato dudoso (candidato a re-etiquetar en el feed): lo puso la IA pero sin
  // formato, con baja confianza de formato, o cayó en el genérico "UGC".
  const isReviewFormat = (it) => {
    if (it.status === "imported" || it.status === "rejected") return false;
    if (it.source_kind !== "ai") return false;
    const fc = it.ai_raw?.format_confidence;
    const fmt = (it.suggested_format || "").trim().toLowerCase();
    if (!fmt) return true;
    if (typeof fc === "number" && fc < 0.6) return true;
    if (fmt === "ugc") return true;
    return false;
  };

  // ── Fuente canónica: conceptos que REALMENTE existen en el banco. El filtro y el
  //    agrupado mapean cada item a su concepto del banco (ignorando sufijo de etapa,
  //    tildes y mayúsculas) → nada de duplicados ni valores sueltos. Lo que no matchea
  //    el banco cae en "Nuevos / fuera del banco".
  const [mediaFilter, setMediaFilter] = useState("all"); // all | video | static
  const normConcept = (s) => {
    let x = (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s*\((tofu|mofu|bofu)\)\s*/g, " ").replace(/\s+/g, " ").trim();
    // Quita un prefijo de MEDIO al inicio ("Video Oferta"→"oferta", "Tv Comercial"→
    // "comercial") para que mapee al formato real del banco. Solo si queda algo.
    const stripped = x.replace(/^(videos?|vid|tv|foto|fotos|imagen|imagenes|reel|reels|clip|clips)\s+/i, "").trim();
    return stripped || x;
  };
  const parseStage = (fmt) => { const m = /\((tofu|mofu|bofu)\)/i.exec(fmt || ""); return m ? m[1].toLowerCase() : ""; };
  const stageOf = (it) => (it.suggested_stage || parseStage(it.suggested_format) || "").toLowerCase();
  const mediaOf = (it) => (it.suggested_media_type === "static" ? "static" : "video");
  const canonMap = useMemo(() => {
    const m = new Map(); // `${stage}|${normName}` → { label, stage }
    for (const c of bankConcepts || []) {
      const st = (c.stage || "").toLowerCase();
      const key = `${st}|${normConcept(c.name)}`;
      if (!m.has(key)) m.set(key, { label: c.name, stage: st });
    }
    return m;
  }, [bankConcepts]);
  const itemKey = (it) => `${stageOf(it)}|${normConcept(it.suggested_format)}`;
  const canonLabelFor = (it) => canonMap.get(itemKey(it))?.label || null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!activeTab.match(it.status)) return false;
      if (companyFilter !== "all") {
        const key = it.company_id || "__bank__";
        if (key !== companyFilter) return false;
      }
      // Filtro de medio (video / imagen) — independiente del concepto.
      if (mediaFilter !== "all" && mediaOf(it) !== mediaFilter) return false;
      // Ocultar faltantes: los saca de la vista pero NO los borra (el scraping los procesa después).
      if (hideMissing && conceptFilter !== "__needvideo__" && it.ai_raw?.needs_file) return false;
      if (conceptFilter === "__needvideo__") { if (!it.ai_raw?.needs_file) return false; }
      else if (conceptFilter === "__notranscript__") { if (!isNoTranscript(it)) return false; }
      else if (conceptFilter === "__nodrive__") { if (!isNoDrive(it)) return false; }
      else if (conceptFilter === "__reformat__") { if (!isReviewFormat(it)) return false; }
      else if (conceptFilter === "__done__") { if (it.status !== "ready" || it.ai_raw?.needs_file) return false; }
      else if (conceptFilter.startsWith("c:")) { if (`c:${itemKey(it)}` !== conceptFilter) return false; }
      else if (conceptFilter.startsWith("n:")) { if (`n:${it.suggested_format || "— sin concepto —"}` !== conceptFilter) return false; }
      if (term) {
        const hay = `${it.source_url || ""} ${it.suggested_format || ""} ${it.suggested_name || ""} ${it.note || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, activeTab, companyFilter, conceptFilter, mediaFilter, canonMap, hideMissing, search]);

  // Duplicados en la bandeja (todos los estados) — conteo para el botón + apertura.
  const inboxDupGroups = useMemo(() => findInboxDuplicates(items), [items]);
  const inboxDupCount = useMemo(() => inboxDupGroups.reduce((n, g) => n + g.removeIds.length, 0), [inboxDupGroups]);
  const STATUS_LABEL = { pending: "por revisar", enriching: "analizando", ready: "listo", approved: "aprobado", imported: "cargado", rejected: "rechazado" };
  const dispInbox = (it) => ({
    id: it.id, thumb: it.cover_url,
    title: it.suggested_format || it.suggested_name || "Sin clasificar",
    sub: [it.suggested_labels?.marca?.[0], it.suggested_stage?.toUpperCase()].filter(Boolean).join(" · "),
    tag: STATUS_LABEL[it.status] || it.status,
  });
  const openInboxDups = () => {
    setDupGroups(inboxDupGroups.map((g) => ({ keepId: g.keepId, removeIds: g.removeIds, items: g.items.map(dispInbox) })));
    setDupMode("inbox");
  };
  const openBankDups = async () => {
    setDupBusy(true); setAddMsg("Buscando duplicados en el banco…");
    try {
      const { groups } = await findBankDuplicates(addPipeline);
      const disp = groups.map((g) => ({
        keepId: g.keepId, removeIds: g.removeIds,
        items: g.items.map((v) => ({
          id: v.id, thumb: v.file_url,
          title: v.concept_name || v.name || "Ref",
          sub: [v.bank_labels?.marca?.[0], v.company_name].filter(Boolean).join(" · "),
          tag: v.drive_url ? "video" : (v.transcript ? "guion" : null),
        })),
      }));
      setDupGroups(disp); setDupMode("bank");
      setAddMsg(disp.length ? `Duplicados en el banco: ${disp.length} grupo(s).` : "No hay duplicados en el banco. 👌");
    } catch (e) { setError(`No se pudo buscar duplicados en el banco: ${e?.message || e}`); }
    finally { setDupBusy(false); }
  };
  const handleDeleteDups = async (ids) => {
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} duplicado(s)? No se puede deshacer.`)) return;
    setDupBusy(true);
    try {
      if (dupMode === "bank") { await deleteBankVariations(ids); setAddMsg(`✓ ${ids.length} duplicado(s) del banco eliminados.`); }
      else { await deleteInboxBulk(ids); setAddMsg(`✓ ${ids.length} duplicado(s) de la bandeja eliminados.`); }
      setDupMode(null); setDupGroups([]);
      await reload();
    } catch (e) { setError(`No se pudieron eliminar: ${e?.message || e}`); }
    finally { setDupBusy(false); }
  };

  // Filtro por concepto, CANÓNICO: solo los conceptos que existen en el banco,
  // agrupados por etapa (TOFU/MOFU/BOFU). Cada item se mapea a su concepto del banco
  // (ignorando sufijo/tildes/mayúsculas) y se cuenta. Lo que no matchea el banco va a
  // "Nuevos / fuera del banco" para triaje. Respeta el filtro de medio (video/imagen).
  const conceptFilterGroups = useMemo(() => {
    const pass = (it) => activeTab.match(it.status) && (mediaFilter === "all" || mediaOf(it) === mediaFilter);
    const counts = new Map();   // canonKey → n
    const nuevos = new Map();   // rawLabel → n
    for (const it of items) {
      if (!pass(it)) continue;
      const k = itemKey(it);
      if (canonMap.has(k)) counts.set(k, (counts.get(k) || 0) + 1);
      else { const raw = it.suggested_format || "— sin concepto —"; nuevos.set(raw, (nuevos.get(raw) || 0) + 1); }
    }
    const byStage = { tofu: [], mofu: [], bofu: [], "": [] };
    for (const [k, info] of canonMap.entries()) {
      const n = counts.get(k) || 0;
      if (!n) continue;   // en el filtro solo mostramos conceptos con items en la vista actual
      (byStage[info.stage] || byStage[""]).push({ label: info.label, key: `c:${k}`, n });
    }
    for (const st of Object.keys(byStage)) byStage[st].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    const nuevosArr = [...nuevos.entries()].map(([label, n]) => ({ label, key: `n:${label}`, n })).sort((a, b) => b.n - a.n);
    return { byStage, nuevos: nuevosArr };
  }, [items, activeTab, mediaFilter, canonMap]);
  const needVideoCount = useMemo(() => items.filter((it) => activeTab.match(it.status) && it.ai_raw?.needs_file).length, [items, activeTab]);
  const noTranscriptCount = useMemo(() => items.filter((it) => activeTab.match(it.status) && it.status !== "imported" && isNoTranscript(it)).length, [items, activeTab]);
  const noDriveCount = useMemo(() => items.filter((it) => activeTab.match(it.status) && isNoDrive(it)).length, [items, activeTab]);
  const needFormatCount = useMemo(() => items.filter((it) => activeTab.match(it.status) && isReviewFormat(it)).length, [items, activeTab]);
  const doneCount = useMemo(() => items.filter((it) => activeTab.match(it.status) && it.status === "ready" && !it.ai_raw?.needs_file).length, [items, activeTab]);

  // Secciones agrupadas por concepto (el que más tiene, primero) — para organizar.
  const [groupByConcept, setGroupByConcept] = useState(false);
  const conceptSections = useMemo(() => {
    const m = new Map();
    for (const it of filtered) { const k = canonLabelFor(it) || (it.suggested_format || "— sin concepto —"); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered, canonMap]);

  // Borra en bloque los faltantes (needs_file) del tab actual.
  const deleteMissing = async () => {
    const ids = items.filter((it) => activeTab.match(it.status) && it.ai_raw?.needs_file).map((it) => it.id);
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} referentes que no se pudieron completar (necesitan video)? No se puede deshacer.`)) return;
    try { await deleteInboxBulk(ids); await reload(); setAddMsg(`✓ ${ids.length} faltantes eliminados.`); }
    catch (e) { setError(`No se pudieron eliminar: ${e?.message || e}`); }
  };

  // Render de una tarjeta (reusado en la lista plana y en las secciones agrupadas).
  const renderCard = (it) => (
    <InboxCard
      key={it.id}
      item={it}
      companyName={companyName(it.company_id)}
      canManage={puedeOperar}
      selectionMode={selectionMode}
      selected={selectedIds.has(it.id)}
      analyzing={analyzingIds.has(it.id)}
      progress={progressById[it.id]}
      failReason={failedIds.get(it.id)}
      committing={committing}
      onToggleSelect={() => toggleSelect(it.id)}
      onOpen={() => setDetailItem(it)}
      onAnalyze={() => analyzeOne(it)}
      onUploadVideo={() => uploadVideoFor(it)}
      onQuickCommit={() => quickCommit(it)}
      onApprove={() => quickStatus(it.id, "approved")}
      onReject={() => quickStatus(it.id, "rejected")}
      onRestore={() => quickStatus(it.id, "pending")}
      onDelete={() => quickDelete(it.id)}
    />
  );

  const handleAdd = async () => {
    if (!urlsText.trim()) return;
    setAdding(true); setError(null); setAddMsg(null);
    try {
      // El "formato" pre-elegido: si es concepto nuevo, el nombre tipeado;
      // si es existente, el nombre del concepto (para que la tarjeta lo muestre).
      const format = conceptMode === "new"
        ? addFormatName
        : (conceptMode === "existing" ? (selectedConcept?.name || null) : null);
      const targetConceptId = conceptMode === "existing" ? (addTargetConceptId || null) : null;

      // Separamos: links de DRIVE (video ya subido → se baja, analiza y el link
      // es el respaldo) vs links de FACEBOOK Ads Library (flujo Foreplay/Meta).
      const lines = urlsText.split("\n").map((l) => l.trim()).filter(Boolean);
      const driveLinks = lines.filter(isDriveLink);
      const fbLines = lines.filter((l) => !isDriveLink(l));

      // 1) Drive → crear + ENCOLAR (analiza en segundo plano, no bloquea).
      let driveCreated = [];
      if (driveLinks.length) {
        const r = await addDriveInboxItems(driveLinks, {
          companyId: addCompanyId || null, pipelineType: addPipeline, note: addNote,
          stage: addStage || null, format, targetConceptId,
        });
        driveCreated = r.created;
      }

      // 2) Facebook → flujo existente.
      const { created, skipped } = fbLines.length
        ? await addInboxItems({
            urls: fbLines, companyId: addCompanyId || null, pipelineType: addPipeline,
            note: addNote, stage: addStage || null, mediaType: addMedia || null, format, targetConceptId,
          })
        : { created: [], skipped: 0 };

      setUrlsText(""); // solo se limpia el textarea; la config queda fija
      if (created.length === 0 && driveCreated.length === 0 && skipped > 0) {
        setError(`Ningún link válido. Pegá links de Facebook Ads Library o de Google Drive. Ignorados: ${skipped}.`);
      } else {
        const parts = [];
        if (driveCreated.length) parts.push(`${driveCreated.length} de Drive (analizando en cola)`);
        if (created.length) parts.push(`${created.length} de Facebook`);
        setAddMsg(`✓ ${parts.join(" · ")}${skipped > 0 ? ` · ${skipped} ignorado(s)` : ""}.`);
      }
      await reload();
      if (driveCreated.length) enqueue(driveCreated.map((item) => ({ item, kind: "drive" })));
      // Auto-analizar en segundo plano (sin bloquear el botón).
      if (autoAnalyze && created.length) {
        (async () => {
          const { ok, needFile } = await runAnalyzeLoop(created, { force: true });
          setAddMsg(`✓ ${ok} analizado(s) con IA.` + (needFile ? ` ⚠️ ${needFile} necesitan el video (Meta los bloqueó y Foreplay no los tiene) → dale a "📎 Subir video" en la tarjeta.` : ""));
        })();
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setAdding(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); setBulkCompany(""); };

  const quickStatus = async (id, status) => {
    try { await setInboxStatus(id, status); await reload(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  const quickDelete = async (id) => {
    if (!confirm("¿Eliminar este referente de la bandeja?")) return;
    try { await deleteInboxItem(id); await reload(); }
    catch (e) { setError(e?.message || String(e)); }
  };

  const bulkStatus = async (status) => {
    if (selectedIds.size === 0) return;
    try { await setInboxStatusBulk([...selectedIds], status); exitSelection(); await reload(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} referente(s)?`)) return;
    try { await deleteInboxBulk([...selectedIds]); exitSelection(); await reload(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  const bulkAssign = async () => {
    if (selectedIds.size === 0) return;
    try { await assignCompanyBulk([...selectedIds], bulkCompany || null); exitSelection(); await reload(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  const bulkClassify = async (payload) => {
    await classifyInboxBulk([...selectedIds], payload);
    exitSelection(); await reload();
  };

  // ── Análisis con IA ──
  const getKnownFormats = async () => {
    if (!knownFormatsRef.current) knownFormatsRef.current = await buildKnownFormats();
    return knownFormatsRef.current;
  };
  const getKnownLabels = async () => {
    if (!knownLabelsRef.current) knownLabelsRef.current = await buildKnownLabels();
    return knownLabelsRef.current;
  };
  // formats + vocabulario de etiquetas existentes, cacheados.
  const getCtx = async () => [await getKnownFormats(), await getKnownLabels()];
  const markAnalyzing = (id, on) => setAnalyzingIds((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  // Corre analyzeInboxItem sobre una lista con: barra de progreso X/N, update
  // INCREMENTAL por ítem (sin reiniciar la página) y fallas visibles. Un solo
  // reload() al final. Devuelve { ok, needFile, failed }.
  // Ya analizado = pasó por la IA (enriched_at) y no está esperando video. Saltear
  // estos evita re-gastar Claude al re-seleccionar (salvo force).
  const isAnalyzed = (it) => !!it.enriched_at && !it.ai_raw?.needs_file;
  const runAnalyzeLoop = async (list, { label = "Analizando", force = false } = {}) => {
    let arr = (list || []).filter(Boolean);
    const skipped = force ? 0 : arr.filter(isAnalyzed).length;
    if (!force) arr = arr.filter((it) => !isAnalyzed(it));
    if (!arr.length) return { ok: 0, needFile: 0, failed: 0, skipped };
    const [formats, labels] = await getCtx();
    batchStart(arr.length, label);
    let ok = 0, needFile = 0, failed = 0;
    try {
      for (const it of arr) {
        markAnalyzing(it.id, true); markFailed(it.id, null);
        try {
          const r = await analyzeInboxItem(it, formats, labels);
          if (r?.needsFile) needFile++;
          else { ok++; if (r?.item) patchItem(it.id, r.item); }
        } catch (e) { failed++; markFailed(it.id, e?.message || String(e)); }
        finally { markAnalyzing(it.id, false); batchTick(); }
      }
    } finally { batchEnd(); await reload(); }
    return { ok, needFile, failed, skipped };
  };

  const analyzeOne = async (item) => {
    markAnalyzing(item.id, true); markFailed(item.id, null);
    setError(null);
    try {
      const [formats, labels] = await getCtx();
      const r = await analyzeInboxItem(item, formats, labels);
      if (r?.needsFile) {
        // Meta bloqueó el fetch → pedimos el archivo de video para transcribir en el navegador.
        pendingFileItemRef.current = item;
        setAddMsg(`⚠️ ${r.reason} Elegí el archivo del video…`);
        fileFallbackRef.current?.click();
      } else if (r?.item) { patchItem(item.id, r.item); }
    } catch (e) {
      markFailed(item.id, e?.message || String(e));
      setError(`No se pudo analizar: ${e?.message || e}`);
    } finally {
      markAnalyzing(item.id, false);
      await reload();
    }
  };

  // 🎬 Traer videos de los faltantes vía Apify: scrapea por marca, matchea por
  // ad_id, parchea video + marca corregida, y analiza los encontrados. Los que no
  // aparezcan en Meta quedan como faltantes (video a mano).
  const handleApifyEnrich = async () => {
    // Prioridad: si hay tarjetas SELECCIONADAS, procesa solo esas (para probar de a
    // poco). Si no hay selección, procesa los faltantes VISIBLES (filtro/búsqueda).
    // Las marcas se derivan de TODA la bandeja igual (más cobertura del match).
    const pool = selectedIds.size ? items.filter((it) => selectedIds.has(it.id)) : filtered;
    const faltantes = pool.filter((it) => it.ai_raw?.needs_file);
    if (!faltantes.length) {
      setAddMsg(selectedIds.size ? "Ninguno de los seleccionados es un faltante." : "No hay faltantes en la vista actual.");
      return;
    }
    const scopeTxt = selectedIds.size ? `${faltantes.length} seleccionado(s)` : `${faltantes.length} faltantes de la vista`;
    // Marcas extra a mano (opcional): mejora la cobertura de las que la IA no puso.
    const extraRaw = window.prompt(
      `Voy a buscar en Meta por marca y matchear ${scopeTxt} por su id.\n\n` +
      `Podés agregar marcas EXTRA separadas por coma (opcional, dejá vacío para usar solo las detectadas):`,
      ""
    );
    if (extraRaw === null) return;  // canceló
    const extraBrands = extraRaw.split(",").map((s) => s.trim()).filter(Boolean);
    setApifyBusy(true); setError(null);
    try {
      const res = await enrichFaltantesWithApify(faltantes, { allItems: items, extraBrands, scopeBrandsToTargets: selectedIds.size > 0, onProgress: (m) => setAddMsg(m) });
      await reload();
      if (res.reason) { setAddMsg(`Apify: ${res.reason}`); setApifyBusy(false); return; }
      setAddMsg(`✓ Apify: ${res.matched} de ${faltantes.length} encontrados en Meta (${res.brandsScraped} marcas, ${res.totalAds} anuncios). Analizando los encontrados…`);
      if (res.matchedItems?.length) {
        const { ok, needFile: nf } = await runAnalyzeLoop(res.matchedItems, { label: "Analizando (Apify)", force: true });
        const restantes = faltantes.length - res.matched;
        setAddMsg(`✓ Apify: ${ok} analizados con video.` + (nf ? ` ${nf} sin audio.` : "") + (restantes > 0 ? ` ⚠️ ${restantes} no aparecieron en Meta → video a mano (o agregá su marca y reintentá).` : ""));
      }
    } catch (e) {
      setError(`Apify falló: ${e?.message || e}`);
    } finally { setApifyBusy(false); }
  };

  // ☁ Respaldar a Drive los que tienen video pero no link de Drive (selección o vista).
  const handleBackupDrive = async () => {
    const pool = selectedIds.size ? items.filter((it) => selectedIds.has(it.id)) : filtered;
    const targets = pool.filter(isNoDrive);
    if (!targets.length) { setAddMsg("No hay videos sin respaldo en la vista/selección."); return; }
    setDriveBusy(true); setError(null);
    batchStart(targets.length, "Respaldando a Drive");
    try {
      const res = await backupItemsToDrive(targets, (i) => setBatch((b) => ({ ...b, done: i })));
      await reload();
      setAddMsg(`☁ Drive: ${res.done} respaldado(s)${res.failed ? ` · ⚠️ ${res.failed} no se pudieron (video vencido/bloqueado → subilo a mano)` : ""}.`);
    } catch (e) { setError(`Respaldo a Drive falló: ${e?.message || e}`); }
    finally { setDriveBusy(false); batchEnd(); }
  };

  // 📝 Rellenar notas faltantes de variaciones ya cargadas (bug histórico de mapeo).
  const handleBackfillNotes = async () => {
    if (!confirm("Rellenar las NOTAS faltantes de las referencias ya cargadas al banco (con la descripción que generó la IA)? No pisa las que ya tienen nota.")) return;
    setAddMsg("Rellenando notas del banco…");
    try {
      const { filled, checked } = await backfillVariationNotes();
      setAddMsg(`✓ Notas rellenadas en ${filled} referencia(s) del banco (de ${checked} revisadas).`);
    } catch (e) { setError(`No se pudieron rellenar las notas: ${e?.message || e}`); }
  };

  // Genera los PATRONES (cómo funciona / cómo se hace) de los formatos del banco
  // que no los tienen → la IA clasifica el formato mucho mejor (matchea por patrón).
  const [patternsBusy, setPatternsBusy] = useState(false);
  const handleGenPatterns = async () => {
    if (patternsBusy) return;
    if (!confirm("Generar con IA los patrones (cómo funciona / cómo se hace) de los formatos del banco que aún no los tienen, a partir de sus referencias? Mejora la clasificación automática del formato.")) return;
    setPatternsBusy(true); setAddMsg("Generando patrones de formato…");
    try {
      const r = await ensureFormatPatterns(addPipeline, { onProgress: (m) => setAddMsg(m) });
      knownFormatsRef.current = null;   // invalidar caché → el próximo análisis usa los patrones nuevos
      setAddMsg(`✓ Patrones: ${r.filled} generados${r.skipped ? `, ${r.skipped} sin material` : ""}${r.failed ? `, ${r.failed} con error` : ""} (de ${r.total}).`);
    } catch (e) { setError(`No se pudieron generar patrones: ${e?.message || e}`); }
    finally { setPatternsBusy(false); }
  };

  // 🎬 Traer los anuncios de una marca (orden natural de Meta: recientes primero) e
  // importarlos. Cada uno guarda days_running/copies (señal de ganador) para el card.
  // Encolar, no ejecutar. Antes esto bloqueaba el modal cuatro minutos y moría
  // si Jose cambiaba de sección; ahora el trabajo lo hace el worker del
  // servidor y sobrevive a cerrar el navegador. El progreso se ve en el widget
  // de abajo a la derecha, desde cualquier sección.
  const handleDiscoverBrand = async () => {
    const input = discoverBrand.trim();
    if (!input) { setDiscoverMsg("Escribí una marca o pegá el link de la Ad Library."); return; }
    // Si pegan el link de la Facebook Ads Library (o un page_id), scrapeamos esa
    // PÁGINA exacta → solo anuncios de esa marca, sin traer marcas que no son.
    const pageId = extractAdLibraryPageId(input);
    setDiscoverBusy(true);
    setDiscoverMsg(null);
    try {
      await enqueueImportJob({
        kind: "brand",
        rawInput: input,
        brand: pageId ? null : input,
        pageId,
        topN: discoverN,
        // Se scrapea de más para poder quedarse con el top N.
        scrapeCount: Math.max(discoverN * 2, 300),
        mediaOnly: discoverMedia || null,
        incluirCopias: traerCopias,
        companyId: addCompanyId || null,
        pipelineType: addPipeline,
      });
      setDiscoverOpen(false);
      setDiscoverBrand("");
      setAddMsg(`✓ ${input} quedó en cola. Podés cerrar esto y seguir trabajando — el progreso está abajo a la derecha.`);
    } catch (e) {
      const msg = e?.message || String(e);
      setDiscoverMsg(msg.includes("ya está en la cola") ? "Esa marca ya está en la cola." : `Falló: ${msg}`);
    } finally { setDiscoverBusy(false); }
  };

  // Subir el video a mano para UN item concreto (cuando ni Foreplay ni Meta dieron
  // el archivo). Va directo al selector de archivo, sin reintentar contra Meta.
  const uploadVideoFor = (item) => {
    pendingFileItemRef.current = item;
    setAddMsg(null);
    fileFallbackRef.current?.click();
  };

  const onFallbackFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const item = pendingFileItemRef.current;
    pendingFileItemRef.current = null;
    if (!file || !item) return;
    markAnalyzing(item.id, true);
    setError(null);
    try {
      const [formats, labels] = await getCtx();
      // Mismo flujo completo que "Subir videos": portada + transcript + IA + Drive.
      await analyzeUploadedVideo(item, file, formats, labels, (m) => setItemProgress(item.id, m));
      setAddMsg("✓ Analizado desde el archivo y respaldado a Drive.");
    } catch (err) {
      setError(`No se pudo analizar el archivo: ${err?.message || err}`);
    } finally {
      markAnalyzing(item.id, false);
      setItemProgress(item.id, null);
      await reload();
    }
  };

  const bulkAnalyze = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const targets = items.filter((it) => ids.includes(it.id));
    const force = forceReanalyze;
    exitSelection();
    const { ok, needFile, failed, skipped } = await runAnalyzeLoop(targets, { force });
    setAddMsg(`✓ ${ok} analizado(s).` + (needFile ? ` · ${needFile} necesitan video` : "") + (skipped ? ` · ${skipped} ya analizados (saltados, activá 🔁 Forzar para rehacer)` : "") + (failed ? ` · ⚠️ ${failed} con error` : ""));
  };

  // 🔖 Reorganizar SOLO las etiquetas (barato): re-clasifica labels usando la
  // transcripción/portada ya guardada, sin re-analizar ni re-transcribir el video.
  const bulkRetagLabels = async () => {
    if (selectedIds.size === 0) return;
    const targets = items.filter((it) => selectedIds.has(it.id));
    exitSelection();
    setAddMsg(`Reorganizando etiquetas de ${targets.length}… (sin re-analizar el video)`);
    try {
      const { updated, skipped, failed, sampleReason } = await reclassifyLabelsBulk(targets, {
        onProgress: (m) => setAddMsg(m),
      });
      setAddMsg(`✓ ${updated} re-etiquetado(s).` + (skipped ? ` · ${skipped} sin material re-clasificable` : "") + (failed ? ` · ⚠️ ${failed} con error` : "") + (sampleReason && (skipped || failed) ? ` · motivo: ${sampleReason}` : ""));
      await reload();
    } catch (e) {
      setAddMsg(`Falló: ${e?.message || e}`);
    }
  };

  // 🔖 Reorganizar etiquetas de TODO lo filtrado (sin necesidad de entrar en modo
  // selección): re-clasifica las etiquetas de los items de la pestaña activa que
  // matchean los filtros, reusando la transcripción/portada guardada. Barato.
  const retagFilteredLabels = async () => {
    if (filtered.length === 0) { setAddMsg("No hay items en la vista actual."); return; }
    setAddMsg(`Reorganizando etiquetas de ${filtered.length}… (sin re-analizar el video)`);
    try {
      const { updated, skipped, failed, sampleReason } = await reclassifyLabelsBulk(filtered, {
        onProgress: (m) => setAddMsg(m),
      });
      setAddMsg(`✓ ${updated} re-etiquetado(s).` + (skipped ? ` · ${skipped} sin material re-clasificable` : "") + (failed ? ` · ⚠️ ${failed} con error` : "") + (sampleReason && (skipped || failed) ? ` · motivo: ${sampleReason}` : ""));
      await reload();
    } catch (e) {
      setAddMsg(`Falló: ${e?.message || e}`);
    }
  };

  // ── Carga al banco ──
  // Carga rápida de UN item (sin abrir el modal): usa el concepto matcheado por
  // la IA, o crea uno con el nombre de formato sugerido.
  const quickCommit = async (item) => {
    setCommitting(true); setError(null);
    try {
      await commitInboxItem(item, item.target_concept_id
        ? { mode: "existing", targetConceptId: item.target_concept_id }
        : { mode: "new" });
      setAddMsg(`✓ Cargado al banco: ${item.suggested_format || item.suggested_name || "referente"}.`);
      await reload();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === SESSION_EXPIRED || /row-level security|jwt|expired/i.test(msg)) {
        setError("Tu sesión expiró (suele pasar cuando la misma cuenta se usa en dos equipos a la vez). Cerrá sesión y volvé a entrar, y probá de nuevo.");
      } else {
        setError(`No se pudo cargar: ${msg}. Abrí "✏️ Editar" para completar el formato.`);
      }
    } finally { setCommitting(false); }
  };

  // Carga en masa: los seleccionados, o —si no hay selección— todos los de la
  // pestaña actual que ya se puedan cargar (analizados / con formato).
  const bulkCommit = async (idsFromSelection = null) => {
    const pool = idsFromSelection
      ? items.filter((it) => idsFromSelection.includes(it.id))
      : filtered.filter((it) => it.status !== "imported" && it.status !== "rejected");
    const targets = pool.filter(canAutoCommit);
    if (targets.length === 0) {
      setError("Ningún referente listo para cargar. Analizá con IA o completá el formato primero.");
      return;
    }
    if (!confirm(`¿Cargar ${targets.length} referente(s) al banco de creativos?`)) return;
    setCommitting(true); setError(null);
    try {
      const res = await commitInboxItemsBulk(targets, (msg) => setAddMsg(msg));
      if (idsFromSelection) exitSelection();
      setAddMsg(
        `✓ ${res.committed} cargado(s) al banco` +
        (res.backedUp ? ` · ${res.backedUp} video(s) respaldado(s)` : "") +
        (res.conceptsCreated ? ` · ${res.conceptsCreated} formato(s) nuevo(s)` : "") +
        (res.skipped ? ` · ${res.skipped} omitido(s) (sin formato)` : "") +
        (res.errors.length ? ` · ${res.errors.length} con error` : "")
      );
      // Si hubo errores, mostramos el primero para no dejarlo a ciegas.
      if (res.errors.length) setError(`Error al cargar (${res.errors.length}): ${res.errors[0]}`);
      await reload();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === SESSION_EXPIRED || /row-level security|jwt|expired/i.test(msg)) {
        setError("Tu sesión expiró (suele pasar cuando la misma cuenta se usa en dos equipos a la vez). Cerrá sesión y volvé a entrar, y probá de nuevo.");
      } else {
        setError(`No se pudo cargar en masa: ${msg}`);
      }
    } finally { setCommitting(false); }
  };

  // Cuántos de la pestaña actual están listos para cargar (para el botón grande).
  const readyToCommitCount = useMemo(
    () => filtered.filter((it) => it.status !== "imported" && it.status !== "rejected" && canAutoCommit(it)).length,
    [filtered]
  );

  const handleForeplayImported = async (created, { autoAnalyze: aa, yaEstaban = 0, copias = 0 } = {}) => {
    setAddMsg(`✓ ${created?.length || 0} traído(s) de Foreplay${resumenDescarte(yaEstaban, copias)}${aa && created?.length ? " · analizando…" : ""}.`);
    await reload();
    // Análisis en segundo plano (no bloquea el cierre del modal).
    if (aa && created?.length) {
      (async () => {
        const { needFile } = await runAnalyzeLoop(created, { label: "Analizando (Foreplay)", force: true });
        if (needFile) setAddMsg(`Análisis listo. ⚠️ ${needFile} necesitan el video (Foreplay no los tiene y Meta bloqueó) → dale a “📎 Subir video” en la tarjeta.`);
      })();
    }
  };

  // ── Subir videos directo (el camino confiable, sin Foreplay/Meta) ──
  // Vos ya descargaste el anuncio; la app hace todo: portada + transcript +
  // marca/nicho/ángulo/formato + respaldo a Drive. Usa la "Config fija" de arriba
  // (empresa + pipeline) como destino.
  const setItemProgress = (id, msg) => setProgressById((p) => {
    const n = { ...p }; if (msg) n[id] = msg; else delete n[id]; return n;
  });

  // Encola tareas y arranca el drenado si no está corriendo (no bloqueante).
  const enqueue = (tasks) => {
    if (!tasks.length) return;
    queueRef.current.push(...tasks);
    setQueueCount(queueRef.current.length);
    drainQueue();
  };

  // Procesa la cola de a uno. Jose puede seguir agregando: las nuevas tareas se
  // suman a `queueRef` y este mismo loop las toma sin reiniciarse.
  const drainQueue = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setError(null);
    try {
      const [formats, labels] = await getCtx();
      while (queueRef.current.length) {
        const { item, file, kind } = queueRef.current.shift();
        setQueueCount(queueRef.current.length);
        markAnalyzing(item.id, true); markFailed(item.id, null);
        try {
          const r = kind === "drive"
            ? await analyzeDriveVideo(item, formats, labels, (m) => setItemProgress(item.id, m))
            : await analyzeUploadedVideo(item, file, formats, labels, (m) => setItemProgress(item.id, m));
          if (r?.item) patchItem(item.id, r.item);   // update incremental, sin reiniciar
        } catch (e) { logger.error("[Bandeja] queue analyze failed", e); markFailed(item.id, e?.message || String(e)); }
        finally { markAnalyzing(item.id, false); setItemProgress(item.id, null); }
      }
    } finally {
      drainingRef.current = false;
      setQueueCount(0);
      await reload();
      setAddMsg("✓ Cola vacía — todo analizado. Revisá y cargá al banco.");
    }
  };

  // Subir archivos de video → crear items → encolar (sigue subiendo sin esperar).
  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f && (f.type?.startsWith("video/") || f.type?.startsWith("image/")));
    if (!files.length) return;
    setError(null);
    setAddMsg(`Encolando ${files.length} archivo(s)…`);
    let pairs;
    try {
      pairs = await createUploadInboxItems(files, { companyId: addCompanyId || null, pipelineType: addPipeline });
    } catch (e) { setError(`No se pudieron crear los referentes: ${e?.message || e}`); return; }
    setTab("review");
    await reload();
    enqueue(pairs.map(({ item, file }) => ({ item, file, kind: "file" })));
  };

  // Paso 1: IDENTIFICAR — parsea el doc y muestra el preview editable (sin escribir).
  const handleIdentify = async () => {
    if (!docText.trim()) return;
    setDocBusy(true); setDocErr(null);
    try {
      const { rows, concepts } = await identifyDocument(docText, { pipelineType: addPipeline });
      if (!rows.length) { setDocErr("No se encontraron secciones con links. Revisá el formato (encabezado + links debajo)."); setDocBusy(false); return; }
      setDocRows(rows);
      setDocConcepts(concepts);
      setDocSel(new Set(rows.map((_, i) => i)));   // por defecto todos seleccionados
      setDocStep("preview");
    } catch (e) { setDocErr(e?.message || String(e)); }
    finally { setDocBusy(false); }
  };

  const updateDocRow = (i, patch) => setDocRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // Al escribir el nombre del concepto: si matchea uno existente → azul; si no → nuevo (verde).
  const setRowConcept = (i, name) => {
    const match = docConcepts.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    updateDocRow(i, { concept: name, matchedConceptId: match ? match.id : null, isNew: !match, ...(match ? { stage: match.stage || docRows[i].stage } : {}) });
  };

  // Paso 2: IMPORTAR la tanda seleccionada → crea conceptos/items + encola análisis.
  const handleImportSelected = async () => {
    const idxs = [...docSel].filter((i) => !docRows[i]?.imported);
    const rows = idxs.map((i) => docRows[i]);
    if (!rows.length) return;
    setDocBusy(true); setDocErr(null);
    let res;
    try {
      res = await importSections(rows, { companyId: addCompanyId || BANK_REFS_COMPANY_ID, pipelineType: addPipeline });
    } catch (e) { setDocErr(e?.message || String(e)); setDocBusy(false); return; }
    setDocRows((rr) => rr.map((r, idx) => (idxs.includes(idx) ? { ...r, imported: true } : r)));
    setDocSel(new Set());
    setDocBusy(false);
    setTab("review");
    setAddMsg(`✓ Importados ${res.created.length} links en ${rows.length} concepto(s). Analizando en segundo plano…`);
    await reload();
    if (res.created?.length) {
      (async () => {
        const { ok, needFile } = await runAnalyzeLoop(res.created, { label: "Analizando documento", force: true });
        setAddMsg(`✓ ${ok} analizado(s).` + (needFile ? ` ⚠️ ${needFile} necesitan el video → filtrá "Faltan video".` : ""));
      })();
    }
  };

  const closeDoc = () => { setDocOpen(false); setDocStep("paste"); setDocText(""); setDocRows([]); setDocSel(new Set()); setDocErr(null); };

  // Copia al portapapeles los faltantes (needs_file) agrupados por concepto.
  const copyMissing = async () => {
    const pool = items.filter((it) => activeTab.match(it.status));
    const byConcept = new Map();
    for (const it of pool) {
      const c = it.suggested_format || "— sin concepto —";
      if (!byConcept.has(c)) byConcept.set(c, { done: [], missing: [] });
      const g = byConcept.get(c);
      if (it.ai_raw?.needs_file) g.missing.push(it.source_url);
      else if (it.status === "imported" || it.status === "ready" || it.status === "approved") g.done.push(it.source_url);
    }
    const lines = [];
    for (const [c, g] of [...byConcept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!g.missing.length && !g.done.length) continue;
      lines.push(`### ${c}  (✅ ${g.done.length} listos · ❌ ${g.missing.length} faltan)`);
      for (const u of g.missing) lines.push(`❌ ${u}`);
      lines.push("");
    }
    const txt = lines.join("\n") || "No hay faltantes 🎉";
    try { await navigator.clipboard.writeText(txt); setAddMsg("✓ Faltantes copiados al portapapeles (pegalos en un doc)."); }
    catch { setAddMsg("No se pudo copiar. Acá están:\n" + txt); }
  };

  return (
    <div style={{ padding: "26px 30px 60px", fontFamily: DS.font, color: DS.textPrimary, maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.purple, fontWeight: 800, marginBottom: 4 }}>
            Banco de creativos
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>📥 Bandeja de referentes</h1>
        </div>
        {/* Un solo botón "Importar ▾" con las opciones que sí se usan (Apify +
            documento). Foreplay y "Subir videos" quedaron ocultos (los handlers y
            modales siguen en el código por si se necesitan de nuevo). */}
        {puedeOperar && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0, justifyContent: "flex-end", position: "relative" }}>
            <button onClick={() => setImportMenuOpen((o) => !o)} style={{
              padding: "9px 22px", borderRadius: 50, border: "none",
              background: DS.green, color: "#fff", fontSize: 12.5, fontWeight: 800,
              cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap",
            }}>📥 Importar ▾</button>
            {importMenuOpen && (
              <>
                <div onClick={() => setImportMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41, background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 12, padding: 6, minWidth: 260, boxShadow: "0 14px 44px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => { setImportMenuOpen(false); setDiscoverMsg(null); setDiscoverOpen(true); }} style={importMenuItem(DS)}>
                    <span style={{ fontSize: 16 }}>🎬</span>
                    <span><div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Traer de una marca</div><div style={{ fontSize: 11, color: DS.textMuted }}>Busca en Meta por marca (Apify)</div></span>
                  </button>
                  <button onClick={() => { setImportMenuOpen(false); setDocErr(null); setDocStep("paste"); setDocOpen(true); }} style={importMenuItem(DS)}>
                    <span style={{ fontSize: 16 }}>📄</span>
                    <span><div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>Importar documento</div><div style={{ fontSize: 11, color: DS.textMuted }}>Pegá conceptos + links de un doc</div></span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <input ref={uploadVideosRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }}
          onChange={(e) => { const fs = e.target.files; e.target.value = ""; handleUploadFiles(fs); }} />
      </div>

      {/* Barra de captura */}
      <div style={{ padding: 16, borderRadius: 14, border: DS.border, background: DS.bgCard, marginBottom: 20 }}>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={3}
          placeholder={"Pegá links (Ad Library o Google Drive), uno por línea…"}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: DS.border, background: DS.bgSide, color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 64 }}
        />

        {/* Config fija (sticky) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.textMuted }}>Config fija:</span>
          <select value={addCompanyId} onChange={(e) => setAddCompanyId(e.target.value)} style={selectStyle}>
            <option value="">🏦 {BANK_REFS_COMPANY_NAME} (sin empresa)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgSide, border: DS.border, gap: 2 }}>
            {[{ k: "ads", l: "🎬 Creativos" }, { k: "organic", l: "🌱 Contenido" }].map((p) => (
              <MiniToggle key={p.k} active={addPipeline === p.k} onClick={() => setAddPipeline(p.k)}>{p.l}</MiniToggle>
            ))}
          </div>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgSide, border: DS.border, gap: 2 }}>
            {CAP_STAGES.map((s) => (
              <MiniToggle key={s.key} active={addStage === s.key} color={s.color} onClick={() => setAddStage(s.key)}>{s.label}</MiniToggle>
            ))}
          </div>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgSide, border: DS.border, gap: 2 }}>
            {CAP_MEDIA.map((m) => (
              <MiniToggle key={m.key} active={addMedia === m.key} onClick={() => setAddMedia(m.key)}>{m.label}</MiniToggle>
            ))}
          </div>
        </div>

        {/* Concepto (opcional) */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.textMuted, paddingTop: 8 }}>Concepto:</span>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgSide, border: DS.border, gap: 2 }}>
            <MiniToggle active={conceptMode === "none"} onClick={() => setConceptMode("none")}>Ninguno</MiniToggle>
            <MiniToggle active={conceptMode === "new"} color={DS.green} onClick={() => setConceptMode("new")}>➕ Nuevo</MiniToggle>
            <MiniToggle active={conceptMode === "existing"} color={DS.blue} onClick={() => setConceptMode("existing")}>📎 Existente</MiniToggle>
          </div>
          {conceptMode === "new" && (
            <input value={addFormatName} onChange={(e) => setAddFormatName(e.target.value)}
              placeholder="Nombre del formato nuevo (ej: Noticia)" style={{ ...selectStyle, minWidth: 240 }} />
          )}
          {conceptMode === "existing" && (
            <div style={{ position: "relative", minWidth: 260 }}>
              <input value={selectedConcept ? selectedConcept.name : conceptSearch}
                onChange={(e) => { setConceptSearch(e.target.value); setAddTargetConceptId(""); }}
                placeholder="Buscar formato del banco…" style={{ ...selectStyle, width: "100%" }} />
              {!selectedConcept && (
                <div style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 30, maxHeight: 200, overflowY: "auto", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
                  {bankConcepts === null && <div style={{ padding: 12, color: DS.textMuted, fontSize: 12 }}>Cargando…</div>}
                  {bankConcepts !== null && conceptOptions.length === 0 && <div style={{ padding: 12, color: DS.textMuted, fontSize: 12 }}>Sin resultados.</div>}
                  {conceptOptions.map((c) => (
                    <button key={c.id} onClick={() => { setAddTargetConceptId(c.id); setConceptSearch(""); }}
                      style={{ display: "flex", width: "100%", textAlign: "left", gap: 8, alignItems: "center", padding: "8px 12px", border: "none", cursor: "pointer", fontFamily: DS.font, background: "transparent", color: DS.textPrimary, fontSize: 12, borderBottom: `1px solid ${withAlpha(DS.textHint, "40")}` }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{c.stage}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 10, color: DS.textMuted }}>{c.company_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedConcept && (
                <button onClick={() => { setAddTargetConceptId(""); setConceptSearch(""); }}
                  style={{ position: "absolute", top: 7, right: 7, border: "none", background: "transparent", color: DS.textMuted, cursor: "pointer", fontSize: 14 }}>×</button>
              )}
            </div>
          )}
        </div>

        {/* Nota + acción */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Nota (opcional)…"
            style={{ ...selectStyle, flex: 1, minWidth: 160 }} />
          {puedeOperar && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: autoAnalyze ? DS.purple : DS.textMuted, cursor: "pointer", fontWeight: 700 }}>
              <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
              ✨ Auto-analizar con IA
            </label>
          )}
          <button onClick={handleAdd} disabled={adding || !urlsText.trim()} style={{
            padding: "9px 20px", borderRadius: 50, border: "none", background: DS.green, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: adding || !urlsText.trim() ? "not-allowed" : "pointer",
            fontFamily: DS.font, opacity: adding || !urlsText.trim() ? 0.55 : 1,
          }}>{adding ? "Agregando…" : "Agregar a la bandeja"}</button>
        </div>
        {addMsg && <div style={{ fontSize: 11, color: DS.green, marginTop: 8 }}>{addMsg}</div>}
        {queueCount > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: DS.purple, marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 50, background: withAlpha(DS.purple, "14"), border: `1px solid ${withAlpha(DS.purple, "44")}` }}>
            ⏳ {queueCount} en cola · analizando en segundo plano — podés seguir agregando
          </div>
        )}
        {batch.total > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: DS.purple, marginBottom: 4 }}>
              <span>{batch.label} {batch.done}/{batch.total}{failedIds.size ? ` · ⚠️ ${failedIds.size} con error` : ""}</span>
              <span>{Math.round((batch.done / batch.total) * 100)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 50, background: withAlpha(DS.purple, "22"), overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(batch.done / batch.total) * 100}%`, background: DS.purple, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs de status */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "7px 14px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 12, fontWeight: 700,
            border: tab === t.key ? `1px solid ${DS.blue}` : DS.border,
            background: tab === t.key ? withAlpha(DS.blue, "22") : "transparent",
            color: tab === t.key ? DS.blue : DS.textSecondary,
          }}>{t.label} <span style={{ opacity: 0.7 }}>· {counts[t.key] || 0}</span></button>
        ))}
        <span style={{ flex: 1 }} />
        <BandejaFilterPanel
          conceptFilter={conceptFilter} setConceptFilter={setConceptFilter}
          mediaFilter={mediaFilter} setMediaFilter={setMediaFilter}
          groups={conceptFilterGroups}
          statusOptions={[
            doneCount > 0 && { key: "__done__", label: "✓ Completos", n: doneCount },
            needVideoCount > 0 && { key: "__needvideo__", label: "⚠ Faltan video", n: needVideoCount },
            noTranscriptCount > 0 && { key: "__notranscript__", label: "📝 Sin transcripción", n: noTranscriptCount },
            noDriveCount > 0 && { key: "__nodrive__", label: "☁ Faltan Drive", n: noDriveCount },
            needFormatCount > 0 && { key: "__reformat__", label: "⚠ Revisar formato", n: needFormatCount },
          ].filter(Boolean)}
        />
        {filtered.length > 0 && (
          <button onClick={() => { setRetagItems(selectedIds.size ? filtered.filter((it) => selectedIds.has(it.id)) : filtered); setRetagOpen(true); }}
            title="Revisá y corregí el formato de a una, tipo feed (video + info + cambiar formato al vuelo). Toma la selección, o la vista actual."
            style={{ ...ghostSmall, borderColor: DS.purple, color: DS.purple, fontWeight: 800 }}>
            🎬 Revisar etiquetas{selectedIds.size ? ` · ${selectedIds.size}` : ""}
          </button>
        )}
        <button onClick={() => setGroupByConcept((g) => !g)} title="Agrupar la bandeja por concepto (el que más tiene primero)"
          style={{ ...ghostSmall, borderColor: groupByConcept ? DS.blue : DS.border, color: groupByConcept ? DS.blue : DS.textSecondary }}>
          {groupByConcept ? "▤ Agrupado" : "▤ Agrupar"}
        </button>
        {needVideoCount > 0 && (
          <button onClick={() => setHideMissing((h) => !h)} title="Oculta los que necesitan video (no los borra) — el scraping los procesa después"
            style={{ ...ghostSmall, borderColor: hideMissing ? DS.green : DS.border, color: hideMissing ? DS.green : DS.textSecondary }}>
            {hideMissing ? "👁 Faltantes ocultos" : "🙈 Ocultar faltantes"}
          </button>
        )}
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={selectStyle}>
          {companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
          style={{ ...selectStyle, minWidth: 140 }} />
        {/* Todas las acciones batch/admin agrupadas en UN menú → menos ruido visual. */}
        {puedeOperar && (
          <div style={{ position: "relative" }}>
            <button onClick={() => setToolsMenuOpen((o) => !o)} title="Acciones y herramientas" style={{ ...ghostSmall, borderColor: DS.textHint }}>🛠 Herramientas ▾</button>
            {toolsMenuOpen && (
              <>
                <div onClick={() => setToolsMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 12, padding: 6, minWidth: 270, boxShadow: "0 14px 44px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 1 }}>
                  {needVideoCount > 0 && <button onClick={() => { setToolsMenuOpen(false); handleApifyEnrich(); }} disabled={apifyBusy} style={toolItem(DS)}>🎬 Traer videos faltantes (Apify) · {selectedIds.size ? items.filter((it) => selectedIds.has(it.id) && it.ai_raw?.needs_file).length : needVideoCount}</button>}
                  {needVideoCount > 0 && <button onClick={() => { setToolsMenuOpen(false); copyMissing(); }} style={toolItem(DS)}>📄 Copiar links faltantes</button>}
                  {needVideoCount > 0 && <button onClick={() => { setToolsMenuOpen(false); deleteMissing(); }} style={toolItem(DS, DS.red)}>🗑 Borrar faltantes ({needVideoCount})</button>}
                  {noDriveCount > 0 && <button onClick={() => { setToolsMenuOpen(false); handleBackupDrive(); }} disabled={driveBusy} style={toolItem(DS)}>☁ Respaldar a Drive · {selectedIds.size ? items.filter((it) => selectedIds.has(it.id) && isNoDrive(it)).length : noDriveCount}</button>}
                  {/* Estas tres reorganizan el BANCO entero, no la bandeja: se quedan
                      en admin aunque el resto del menú sea del equipo. */}
                  {canManage && <button onClick={() => { setToolsMenuOpen(false); handleGenPatterns(); }} disabled={patternsBusy} style={toolItem(DS)}>🧬 Generar patrones de formato</button>}
                  {canManage && <button onClick={() => { setToolsMenuOpen(false); setLabelMgrOpen(true); }} style={toolItem(DS)}>🏷 Organizar etiquetas</button>}
                  <button onClick={() => { setToolsMenuOpen(false); retagFilteredLabels(); }} title="Re-clasifica SOLO las etiquetas usando la transcripción guardada — barato, no re-analiza el video." style={toolItem(DS)}>🔖 Reorganizar etiquetas · {filtered.length}</button>
                  {inboxDupCount > 0 && <button onClick={() => { setToolsMenuOpen(false); openInboxDups(); }} style={toolItem(DS)}>🔁 Duplicados en bandeja · {inboxDupCount}</button>}
                  {canManage && <button onClick={() => { setToolsMenuOpen(false); openBankDups(); }} disabled={dupBusy} style={toolItem(DS)}>🔁 Duplicados en el banco</button>}
                  {canManage && <button onClick={() => { setToolsMenuOpen(false); handleBackfillNotes(); }} style={toolItem(DS)}>📝 Rellenar notas del banco</button>}
                </div>
              </>
            )}
          </div>
        )}
        {puedeOperar && !selectionMode && readyToCommitCount > 0 && (
          <button onClick={() => bulkCommit(null)} disabled={committing} style={{
            padding: "8px 16px", borderRadius: 50, border: "none", background: DS.green, color: "#fff",
            fontSize: 12, fontWeight: 800, cursor: committing ? "default" : "pointer", fontFamily: DS.font,
            opacity: committing ? 0.6 : 1, whiteSpace: "nowrap",
          }}>{committing ? "Cargando…" : `⬆ Cargar ${readyToCommitCount} listos al banco`}</button>
        )}
        {puedeOperar && (
          selectionMode ? (
            <button onClick={exitSelection} style={ghostSmall}>Cancelar selección</button>
          ) : (
            <button onClick={() => setSelectionMode(true)} style={ghostSmall}>Seleccionar</button>
          )
        )}
      </div>

      {/* Barra bulk */}
      {selectionMode && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: withAlpha(DS.blue, "14"), border: `1px solid ${withAlpha(DS.blue, "44")}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: DS.textSecondary }}>{selectedIds.size} seleccionado(s)</span>
          <button
            onClick={() => {
              const visible = filtered.map((it) => it.id);
              const allSelected = visible.length > 0 && visible.every((id) => selectedIds.has(id));
              setSelectedIds(allSelected ? new Set() : new Set(visible));
            }}
            style={{ ...ghostSmall, borderColor: DS.blue, color: DS.blue, fontWeight: 800 }}>
            {filtered.length > 0 && filtered.every((it) => selectedIds.has(it.id)) ? "Deseleccionar todos" : `Seleccionar todos (${filtered.length})`}
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={bulkAnalyze} disabled={!selectedIds.size} style={{ ...ghostSmall, borderColor: DS.purple, color: DS.purple }}>✨ Analizar</button>
          <button onClick={bulkRetagLabels} disabled={!selectedIds.size} title="Re-clasifica SOLO las etiquetas usando la transcripción ya guardada — barato, no re-analiza ni re-baja el video." style={{ ...ghostSmall, borderColor: DS.blue, color: DS.blue }}>🔖 Reorganizar etiquetas</button>
          <label title="Re-analizar también los que ya estaban analizados (gasta Claude). Útil para rehacer con transcripción o marca corregida." style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: forceReanalyze ? DS.amber : DS.textMuted, cursor: "pointer" }}>
            <input type="checkbox" checked={forceReanalyze} onChange={(e) => setForceReanalyze(e.target.checked)} /> 🔁 Forzar
          </label>
          <button onClick={() => setClassifyOpen(true)} disabled={!selectedIds.size} style={{ ...ghostSmall, borderColor: DS.amber, color: DS.amber }}>🏷 Clasificar</button>
          <button onClick={() => bulkCommit([...selectedIds])} disabled={!selectedIds.size || committing} style={{ ...ghostSmall, borderColor: DS.green, color: DS.green, fontWeight: 800 }}>⬆ Cargar al banco</button>
          <button onClick={() => bulkStatus("approved")} disabled={!selectedIds.size} title="Marca estos como bien etiquetados → pasan a Aprobados, listos para cargar al banco." style={{ ...ghostSmall, borderColor: DS.green, color: DS.green, fontWeight: 800 }}>✓ Bien etiquetado (listo)</button>
          <button onClick={() => bulkStatus("rejected")} disabled={!selectedIds.size} style={ghostSmall}>✕ Rechazar</button>
          <select value={bulkCompany} onChange={(e) => setBulkCompany(e.target.value)} style={selectStyle}>
            <option value="">Asignar empresa…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={bulkAssign} disabled={!selectedIds.size} style={ghostSmall}>Asignar</button>
          <button onClick={bulkDelete} disabled={!selectedIds.size} style={{ ...ghostSmall, color: DS.red, borderColor: withAlpha(DS.red, "66") }}>🗑 Eliminar</button>
        </div>
      )}

      {error && <div style={{ color: DS.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>Cargando bandeja…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
          {items.length === 0 ? "La bandeja está vacía. Pegá links arriba para empezar." : "Nada en esta pestaña."}
        </div>
      ) : groupByConcept ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {conceptSections.map(([name, its]) => (
            <div key={name}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${DS.textHint}` }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{name}</span>
                <span style={{ fontSize: 11, color: DS.textMuted, fontWeight: 700 }}>{its.length}</span>
                {puedeOperar && !selectionMode && (
                  <button onClick={() => { setSelectionMode(true); setSelectedIds(new Set(its.map((x) => x.id))); }}
                    style={{ ...ghostSmall, padding: "3px 10px", fontSize: 10 }}>Seleccionar sección</button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {its.map((it) => renderCard(it))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map((it) => renderCard(it))}
        </div>
      )}

      {detailItem && (
        <InboxItemModal
          item={detailItem}
          companies={companies}
          canCommit={puedeOperar}
          onClose={() => setDetailItem(null)}
          onSaved={reload}
        />
      )}
      {retagOpen && (
        <RetagFeed
          items={retagItems}
          companyName={companyName}
          onUpdated={(u) => { if (u?.id) setItems((prev) => prev.map((it) => (it.id === u.id ? u : it))); }}
          onClose={() => { setRetagOpen(false); reload(); }}
        />
      )}
      {labelMgrOpen && (
        <LabelManagerModal
          onClose={() => setLabelMgrOpen(false)}
          onChanged={() => { knownLabelsRef.current = null; reload(); }}
        />
      )}
      {dupMode && (
        <DuplicatesModal
          title={dupMode === "bank" ? "Duplicados en el Banco" : "Duplicados en la Bandeja"}
          subtitle={dupMode === "bank" ? "Se borran del banco de creativos." : "Incluye todos los estados (por revisar, aprobados, cargados, rechazados)."}
          groups={dupGroups}
          busy={dupBusy}
          onDelete={handleDeleteDups}
          onClose={() => { if (!dupBusy) { setDupMode(null); setDupGroups([]); } }}
        />
      )}
      {classifyOpen && (
        <ClassifyRefsModal
          count={selectedIds.size}
          onClose={() => setClassifyOpen(false)}
          onApply={bulkClassify}
        />
      )}

      {foreplayOpen && (
        <ForeplaySyncModal
          companies={companies}
          onClose={() => setForeplayOpen(false)}
          onImported={handleForeplayImported}
        />
      )}

      {salidaPendiente && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10010, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
          <div style={{ background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, width: "min(460px, 96vw)", color: DS.textPrimary }}>
            <div style={{ padding: "18px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Hay trabajo a medias</h3>
            </div>
            <div style={{ padding: "16px 22px", fontSize: 13.5, lineHeight: 1.55, color: DS.textSecondary }}>
              <p style={{ margin: "0 0 10px" }}>Si sales de la Bandeja ahora, esto se detiene y se pierde:</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: DS.textPrimary, fontWeight: 600 }}>
                {enCurso.map((t) => <li key={t} style={{ marginBottom: 4 }}>{t}</li>)}
              </ul>
              <p style={{ margin: "12px 0 0", fontSize: 12.5 }}>
                El proceso corre en esta pantalla, así que al cambiar de sección se corta.
              </p>
            </div>
            <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { const ir = salidaPendiente; setSalidaPendiente(null); ir(); }} style={ghostSmall}>
                Salir igual
              </button>
              <button onClick={() => setSalidaPendiente(null)} style={{
                padding: "9px 20px", borderRadius: 50, border: "none", background: DS.green, color: "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: DS.font,
              }}>Quedarme acá</button>
            </div>
          </div>
        </div>
      )}

      {discoverOpen && (
        <div onClick={() => !discoverBusy && setDiscoverOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, width: "min(560px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", color: DS.textPrimary }}>
            <div style={{ padding: "18px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🎬 Traer de una marca</h3>
            </div>
            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: DS.textSecondary, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  MARCA O LINK DE LA AD LIBRARY
                  <span title="Pegá el link de la Facebook Ads Library de la marca (el que tiene view_all_page_id) para traer SOLO los anuncios de esa marca. También podés escribir solo el nombre."
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${DS.textHint}`, color: DS.textMuted, fontSize: 10, fontWeight: 700, cursor: "help" }}>?</span>
                </label>
                <input value={discoverBrand} onChange={(e) => setDiscoverBrand(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && !discoverBusy) handleDiscoverBrand(); }}
                  placeholder="Nombre o link de la Ad Library"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${DS.textHint}`, background: DS.bgCard, color: DS.textPrimary, fontSize: 14, fontFamily: DS.font, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: DS.textSecondary, display: "block", marginBottom: 6 }}>CUÁNTOS (máximo)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[50, 100, 200, 300].map((n) => (
                    <button key={n} onClick={() => setDiscoverN(n)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontSize: 13, fontWeight: 800,
                      border: `1px solid ${discoverN === n ? DS.green : DS.textHint}`,
                      background: discoverN === n ? withAlpha(DS.green, "22") : DS.bgCard,
                      color: discoverN === n ? DS.green : DS.textSecondary,
                    }}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: DS.textSecondary, display: "block", marginBottom: 6 }}>TIPO (opcional)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["", "Todos"], ["video", "Solo video"], ["static", "Solo imagen"]].map(([v, l]) => (
                    <button key={v} onClick={() => setDiscoverMedia(v)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontSize: 12.5, fontWeight: 700,
                      border: `1px solid ${discoverMedia === v ? DS.blue : DS.textHint}`,
                      background: discoverMedia === v ? withAlpha(DS.blue, "22") : DS.bgCard,
                      color: discoverMedia === v ? DS.blue : DS.textSecondary,
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              {/* Meta corre la misma creatividad en varios anuncios: por defecto
                  se trae una sola, porque son el mismo video. */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                <input type="checkbox" checked={traerCopias} onChange={(e) => setTraerCopias(e.target.checked)}
                  style={{ marginTop: 2, width: 15, height: 15, accentColor: DS.green, cursor: "pointer", flex: "none" }} />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: DS.textSecondary }}>
                  <b style={{ color: DS.textPrimary, fontWeight: 700 }}>Traer también las copias.</b>{" "}
                  Meta suele correr la misma creatividad en varios anuncios; sin esto se trae una sola de cada una.
                </span>
              </label>
              {discoverMsg && <div style={{ fontSize: 12.5, color: discoverMsg.startsWith("Falló") || discoverMsg.startsWith("Apify:") || discoverMsg.startsWith("No se") ? DS.red : DS.textSecondary }}>{discoverMsg}</div>}
            </div>
            <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDiscoverOpen(false)} disabled={discoverBusy} style={ghostSmall}>Cancelar</button>
              <button onClick={handleDiscoverBrand} disabled={discoverBusy || !discoverBrand.trim()} style={{
                padding: "9px 20px", borderRadius: 50, border: "none", background: DS.green, color: "#fff",
                fontSize: 13, fontWeight: 800, cursor: discoverBusy ? "default" : "pointer", fontFamily: DS.font,
                opacity: discoverBusy || !discoverBrand.trim() ? 0.6 : 1,
              }}>{discoverBusy ? "Encolando…" : `🎬 Encolar ${discoverN}`}</button>
            </div>
          </div>
        </div>
      )}

      {docOpen && (
        <div onClick={() => !docBusy && closeDoc()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, width: docStep === "preview" ? "min(920px, 97vw)" : "min(680px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", color: DS.textPrimary }}>
            <div style={{ padding: "18px 22px 12px", borderBottom: `1px solid ${DS.textHint}` }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📄 Importar desde documento</h3>
              <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 5 }}>
                {docStep === "paste"
                  ? <>Pegá el doc con los <b>encabezados de concepto</b> y sus <b>links debajo</b>. Se identifica primero (revisás y corregís antes de cargar). Escribí <b>"nuevo concepto"</b> junto a un título para forzar formato nuevo.</>
                  : <>Revisá a qué formato va cada bloque: <span style={{ color: DS.blue, fontWeight: 700 }}>azul = existente</span>, <span style={{ color: DS.green, fontWeight: 700 }}>verde = nuevo</span>. Corregí el que esté mal, elegí las tandas y cargá.</>}
              </div>
            </div>

            {docStep === "paste" ? (
              <>
                <div style={{ padding: "14px 22px", flex: 1, overflowY: "auto" }}>
                  <textarea value={docText} onChange={(e) => setDocText(e.target.value)} rows={14}
                    placeholder={"Famoso\nhttps://www.facebook.com/ads/library/?id=...\n\nUGC (Carro)\nhttps://www.facebook.com/ads/library/?id=...\n\nUGC Bofu   nuevo concepto\nhttps://www.facebook.com/ads/library/?id=..."}
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${DS.textHint}`, background: DS.bgCard, color: DS.textPrimary, fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5, outline: "none", resize: "vertical", boxSizing: "border-box", minHeight: 220 }} />
                  {docErr && <div style={{ color: DS.red, fontSize: 12, marginTop: 8 }}>{docErr}</div>}
                </div>
                <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={closeDoc} disabled={docBusy} style={ghostSmall}>Cancelar</button>
                  <button onClick={handleIdentify} disabled={docBusy || !docText.trim()} style={{ padding: "9px 22px", borderRadius: 50, border: "none", background: DS.green, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font, opacity: docBusy || !docText.trim() ? 0.55 : 1 }}>
                    {docBusy ? "Identificando…" : "Identificar →"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: "8px 16px 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setDocSel(new Set(docRows.map((_, i) => i).filter((i) => !docRows[i].imported)))} style={ghostSmall}>Seleccionar todos</button>
                  <button onClick={() => setDocSel(new Set())} style={ghostSmall}>Ninguno</button>
                  <span style={{ fontSize: 11, color: DS.textMuted }}>{docSel.size} seleccionado(s) · {docRows.filter((r) => r.imported).length}/{docRows.length} importados</span>
                </div>
                <div style={{ padding: "6px 16px 14px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {docRows.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${r.imported ? withAlpha(DS.green, "55") : DS.border}`, background: r.imported ? withAlpha(DS.green, "10") : DS.bgCard, opacity: r.imported ? 0.75 : 1 }}>
                      <input type="checkbox" checked={docSel.has(i)} disabled={r.imported}
                        onChange={(e) => setDocSel((s) => { const n = new Set(s); e.target.checked ? n.add(i) : n.delete(i); return n; })} />
                      <div style={{ width: 150, flexShrink: 0, fontSize: 11.5, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.header}>{r.header}</div>
                      <span style={{ fontSize: 10, color: DS.textMuted, flexShrink: 0 }}>{r.count} link{r.count === 1 ? "" : "s"}</span>
                      <input value={r.concept} onChange={(e) => setRowConcept(i, e.target.value)} disabled={r.imported}
                        list="doc-concepts" placeholder="Formato…"
                        style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${r.isNew ? DS.green : DS.blue}`, background: withAlpha(r.isNew ? DS.green : DS.blue, "12"), color: r.isNew ? DS.green : DS.blue, fontSize: 12, fontWeight: 700, fontFamily: DS.font, outline: "none" }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: r.isNew ? DS.green : DS.blue, flexShrink: 0 }}>{r.imported ? "✓ importado" : r.isNew ? "➕ NUEVO" : "existente"}</span>
                      <select value={r.stage} onChange={(e) => updateDocRow(i, { stage: e.target.value })} disabled={r.imported} style={{ ...selectStyle, padding: "5px 8px", flexShrink: 0 }}>
                        <option value="tofu">TOFU</option><option value="mofu">MOFU</option><option value="bofu">BOFU</option>
                      </select>
                      <input value={r.subConcept} onChange={(e) => updateDocRow(i, { subConcept: e.target.value })} disabled={r.imported}
                        placeholder="sub…" style={{ width: 90, flexShrink: 0, padding: "6px 8px", borderRadius: 8, border: DS.border, background: DS.bgSide, color: DS.textPrimary, fontSize: 11, fontFamily: DS.font, outline: "none" }} />
                    </div>
                  ))}
                  <datalist id="doc-concepts">{docConcepts.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                  {docErr && <div style={{ color: DS.red, fontSize: 12 }}>{docErr}</div>}
                </div>
                <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <button onClick={() => setDocStep("paste")} disabled={docBusy} style={ghostSmall}>← Volver</button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={closeDoc} disabled={docBusy} style={ghostSmall}>Cerrar</button>
                    <button onClick={handleImportSelected} disabled={docBusy || docSel.size === 0} style={{ padding: "9px 22px", borderRadius: 50, border: "none", background: DS.green, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font, opacity: docBusy || docSel.size === 0 ? 0.55 : 1 }}>
                      {docBusy ? "Cargando…" : `⬆ Importar y analizar (${[...docSel].filter((i) => !docRows[i]?.imported).length})`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Input oculto para el fallback: subir el video cuando Meta bloquea el fetch */}
      <input ref={fileFallbackRef} type="file" accept="video/*,audio/*" style={{ display: "none" }} onChange={onFallbackFile} />
    </div>
  );
}

function MiniToggle({ children, active, color, onClick }) {
  const c = color || DS.blue;
  return (
    <button onClick={onClick} style={{
      padding: "5px 11px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: DS.font,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      background: active ? withAlpha(c, "22") : "transparent",
      color: active ? c : DS.textMuted,
    }}>{children}</button>
  );
}

function InboxCard({ item, companyName, canManage, selectionMode, selected, analyzing, progress, failReason, committing, onToggleSelect, onOpen, onAnalyze, onUploadVideo, onQuickCommit, onApprove, onReject, onRestore, onDelete }) {
  const hasLink = /^https?:\/\//i.test(item.source_url || "");
  const plat = PLATFORM[item.source_platform] || PLATFORM.other;
  const isRejected = item.status === "rejected";
  const isImported = item.status === "imported";
  const hasMeta = item.suggested_format || item.suggested_name;
  // La IA no pudo traer el video (Foreplay no lo tiene y Meta bloqueó): esperando el archivo.
  const needsFile = !!item.ai_raw?.needs_file && !isImported && !isRejected;
  // Se puede cargar directo si hay concepto matcheado o nombre de formato.
  const canLoad = !!(item.target_concept_id || item.suggested_format?.trim() || item.suggested_name?.trim());
  const confPct = typeof item.ai_confidence === "number" ? Math.round(item.ai_confidence * 100) : null;
  const lowFormat = typeof item.ai_raw?.format_confidence === "number" && item.ai_raw.format_confidence < 0.6 && !isImported && !isRejected;

  return (
    <div
      onClick={selectionMode ? onToggleSelect : undefined}
      style={{
        borderRadius: 12, border: selected ? `1.5px solid ${DS.blue}` : DS.border,
        background: DS.bgCard, padding: 14, display: "flex", flexDirection: "column", gap: 10,
        cursor: selectionMode ? "pointer" : "default",
        boxShadow: selected ? `0 0 0 3px ${withAlpha(DS.blue, "22")}` : "none",
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: DS.bgSide, border: DS.border, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {item.cover_url
            ? <img src={item.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 20, opacity: 0.4 }}>{item.suggested_media_type === "static" ? "🖼" : "🎬"}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", color: plat.color, background: withAlpha(plat.color, "22"), border: `1px solid ${withAlpha(plat.color, "44")}`, padding: "1px 7px", borderRadius: 50, textTransform: "uppercase" }}>{plat.label}</span>
            {item.source_kind === "ai" && <span style={{ fontSize: 8.5, fontWeight: 800, color: DS.purple }}>✨ IA{confPct != null ? ` ${confPct}%` : ""}</span>}
            {lowFormat && <span title="La IA no está segura del formato — revisalo en 🎬 Revisar etiquetas" style={{ fontSize: 8.5, fontWeight: 800, color: DS.amber }}>⚠ formato</span>}
            {item.ai_raw?.days_running != null && (
              <span title="Días corriendo (más = mejor)" style={{ fontSize: 8.5, fontWeight: 800, color: DS.green }}>🏆 {item.ai_raw.days_running}d</span>
            )}
            {item.ai_raw?.copies > 1 && (
              <span title="Copias activas del anuncio (más = más apuesta de la marca)" style={{ fontSize: 8.5, fontWeight: 800, color: DS.green }}>×{item.ai_raw.copies}</span>
            )}
            {item.video_backup_url && (
              <a href={item.video_backup_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                title="Respaldo en Drive" style={{ fontSize: 8.5, fontWeight: 800, color: DS.green, textDecoration: "none" }}>☁ Drive</a>
            )}
            <span style={{ fontSize: 10, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{companyName}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: hasMeta ? DS.textPrimary : DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.suggested_format || item.suggested_name || "Sin clasificar"}
          </div>
          {hasLink ? (
            <a href={item.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 10.5, color: DS.blue, textDecoration: "none", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.source_platform === "upload" || /drive\.google\.com/.test(item.source_url) ? "Ver video ↗" : "Abrir anuncio ↗"}
            </a>
          ) : (
            <span style={{ fontSize: 10.5, color: DS.textMuted }}>🎬 Video subido</span>
          )}
        </div>
      </div>

      {hasMeta && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {item.suggested_stage && (
            <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.suggested_stage}</span>
          )}
          <LabelChips v={{ bank_labels: item.suggested_labels }} max={4} compact />
        </div>
      )}
      {item.note && <div style={{ fontSize: 11, color: DS.textMuted, fontStyle: "italic" }}>“{item.note}”</div>}

      {needsFile && !analyzing && (
        <span title="No está en Foreplay y Meta bloqueó la descarga. Subí el video a mano o eliminalo."
          style={{ alignSelf: "flex-start", fontSize: 9.5, fontWeight: 800, color: DS.amber, background: withAlpha(DS.amber, "18"), border: `1px solid ${withAlpha(DS.amber, "44")}`, borderRadius: 50, padding: "2px 9px" }}>
          ⚠ necesita video
        </span>
      )}

      {!selectionMode && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {isImported ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: DS.green }}>✓ Cargado al banco</span>
          ) : isRejected ? (
            <>
              <button onClick={onRestore} style={cardBtn}>↩ Restaurar</button>
              {canManage && <button onClick={onDelete} style={{ ...cardBtn, color: DS.red }}>🗑</button>}
            </>
          ) : (
            analyzing ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: DS.purple }}>✨ {progress || "Analizando con IA…"}</span>
            ) : (
              <>
                {failReason && <span title={failReason} style={{ fontSize: 10.5, fontWeight: 700, color: DS.red, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⚠ falló: {failReason}</span>}
                {canManage && needsFile && <button onClick={onUploadVideo} style={{ ...cardBtn, borderColor: DS.green, color: DS.green, fontWeight: 800 }}>📎 Subir video</button>}
                {canManage && <button onClick={onAnalyze} style={{ ...cardBtn, borderColor: failReason ? DS.red : DS.purple, color: failReason ? DS.red : DS.purple }}>✨ {failReason ? "Reintentar" : (item.source_kind === "ai" ? "Re-analizar" : "Analizar")}</button>}
                <button onClick={onOpen} style={{ ...cardBtn, borderColor: DS.blue, color: DS.blue }}>✏️ Editar</button>
                {canManage && canLoad && <button onClick={onQuickCommit} disabled={committing} style={{ ...cardBtn, borderColor: DS.green, color: DS.green, fontWeight: 800, opacity: committing ? 0.6 : 1 }}>⬆ Cargar</button>}
                {canManage && item.status !== "approved" && <button onClick={onApprove} style={cardBtn}>✓ Aprobar</button>}
                {canManage && <button onClick={onReject} style={{ ...cardBtn, color: DS.textMuted }}>✕</button>}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

const selectStyle = {
  padding: "8px 12px", borderRadius: 8, border: DS.border, background: "rgba(0,0,0,0.22)",
  color: DS.textPrimary, fontSize: 12, fontFamily: DS.font, outline: "none",
};
const ghostSmall = {
  padding: "7px 12px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
// Item del menú "Importar ▾".
const importMenuItem = (DSx) => ({
  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
  padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent",
  cursor: "pointer", fontFamily: DSx.font, width: "100%",
});
// Item del menú "Herramientas ▾".
const toolItem = (DSx, color) => ({
  display: "flex", alignItems: "center", gap: 8, textAlign: "left", width: "100%",
  padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent",
  cursor: "pointer", fontFamily: DSx.font, fontSize: 12.5, fontWeight: 600,
  color: color || DSx.textPrimary, whiteSpace: "nowrap",
});
const cardBtn = {
  padding: "5px 11px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
