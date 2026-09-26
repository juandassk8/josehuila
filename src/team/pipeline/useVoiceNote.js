// Grabar una nota de voz y transcribirla.
//
// Extraído del FeedbackPanel de SlotCard, que ya hacía esto para el feedback del
// creativo. Ahora lo usan dos lugares (feedback y "Ajustar con IA"), así que vive
// en un solo sitio en vez de duplicado.
//
// Devuelve { rec, busy, toggle, supported }:
//   - `toggle()` arranca la grabación; llamado otra vez, la corta y transcribe.
//   - el texto transcrito llega por el callback `onText`.

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudioFile } from "../../lib/audioTranscribe.js";
import { logger } from "../../lib/logger.js";
import { toastError, toastSuccess } from "../../lib/toast.js";

export function useVoiceNote(onText, { successMsg = "Nota de voz transcrita" } = {}) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);       // MediaRecorder
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Si el componente se desmonta grabando, hay que soltar el micrófono igual —
  // si no, el navegador deja el indicador de grabación prendido.
  useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* ya estaba parado */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;

    if (rec) {
      const mr = recRef.current;
      if (!mr) { setRec(false); return; }
      mr.onstop = async () => {
        stopStream();
        setRec(false); setBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
          const file = new File([blob], "nota-de-voz.webm", { type: blob.type });
          const text = (await transcribeAudioFile(file)).trim();
          if (text) { onTextRef.current?.(text); if (successMsg) toastSuccess(successMsg); }
          else toastError("No se entendió el audio; probá de nuevo");
        } catch (e) {
          logger.error("transcribir nota falló", e);
          toastError("No se pudo transcribir: " + (e?.message || e));
        } finally { setBusy(false); }
      };
      try { mr.stop(); } catch { stopStream(); setRec(false); }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recRef.current = mr;
      mr.start();
      setRec(true);
    } catch (e) {
      logger.warn("no se pudo acceder al micrófono", e?.message || e);
      toastError("No se pudo acceder al micrófono");
    }
  }, [busy, rec, stopStream, successMsg]);

  return { rec, busy, toggle, supported: typeof window !== "undefined" && !!navigator?.mediaDevices?.getUserMedia };
}
