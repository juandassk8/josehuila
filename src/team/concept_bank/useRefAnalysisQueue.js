import { useEffect, useRef, useState } from "react";
import { updateVariation } from "../../despliegue/db.js";
import { classifyReference } from "../../lib/classifyRef.js";
import { fetchLabelVocabulary } from "./db.js";
import { logger } from "../../lib/logger.js";

// Merge conservador: por marca/nicho/ángulo, si ya hay valor se respeta; si está
// vacío se agrega el de la IA. Formato se OMITE (la ref ya vive en un concepto que
// ES el formato). Devuelve las bank_labels combinadas.
export function mergeMissingLabels(existing, ai) {
  const out = { ...(existing || {}) };
  for (const cat of ["marca", "nicho", "angulo"]) {
    const cur = Array.isArray(out[cat]) ? out[cat] : [];
    const sug = Array.isArray(ai?.[cat]) ? ai[cat] : [];
    if (cur.length === 0 && sug.length) out[cat] = sug;
  }
  return out;
}

// Cola de análisis con IA de referencias (variations), no bloqueante y reusable.
// Cada ref se analiza desde su mejor fuente (Drive → imagen → Meta), se hace merge
// conservador de etiquetas y se rellenan name/notes/transcript solo si están vacíos.
// `onAfterEach` recarga la vista del consumidor tras cada ref.
export function useRefAnalysisQueue({ onAfterEach } = {}) {
  const vocabRef = useRef({});
  const queueRef = useRef([]);
  const drainingRef = useRef(false);
  const [queueCount, setQueueCount] = useState(0);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [progressById, setProgressById] = useState({});
  const [analyzeMsg, setAnalyzeMsg] = useState(null);

  useEffect(() => { fetchLabelVocabulary().then((v) => { vocabRef.current = v || {}; }).catch(() => {}); }, []);

  const markAnalyzing = (id, on) => setAnalyzingIds((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
  const setItemProgress = (id, msg) => setProgressById((p) => { const n = { ...p }; if (msg) n[id] = msg; else delete n[id]; return n; });

  const analyzeOne = async (v, onProgress) => {
    const r = await classifyReference({
      driveUrl: v.drive_url || "", metaUrl: v.meta_ads_library_url || "", imageUrl: v.file_url || "",
      conceptId: v.concept_id, knownLabels: vocabRef.current, onProgress,
    });
    const patch = { bank_labels: mergeMissingLabels(v.bank_labels, r.suggested_labels) };
    if (!v.name && r.suggested_name) patch.name = r.suggested_name;
    if (!v.notes && r.suggested_description) patch.notes = r.suggested_description;
    if (!v.transcript && r.transcript?.trim()) patch.transcript = r.transcript.trim();
    await updateVariation(v.id, patch);
  };

  const drainQueue = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    let ok = 0, fail = 0;
    try {
      while (queueRef.current.length) {
        const v = queueRef.current.shift();
        setQueueCount(queueRef.current.length);
        markAnalyzing(v.id, true);
        try { await analyzeOne(v, (m) => setItemProgress(v.id, m)); ok++; }
        catch (e) { fail++; logger.error("[analyze] failed", e); }
        finally {
          markAnalyzing(v.id, false); setItemProgress(v.id, null);
          if (onAfterEach) { try { await onAfterEach(); } catch { /* noop */ } }
        }
      }
    } finally {
      drainingRef.current = false;
      setQueueCount(0);
      setAnalyzeMsg(`✓ Análisis listo (${ok} ok${fail ? ` · ${fail} fallaron` : ""}).`);
    }
  };

  const enqueue = (list) => {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return;
    queueRef.current.push(...arr);
    setQueueCount(queueRef.current.length);
    drainQueue();
  };

  return { enqueue, queueCount, analyzingIds, progressById, analyzeMsg, setAnalyzeMsg };
}
