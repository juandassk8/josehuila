// Hook reusable de grabación de audio + transcripción Whisper.
//
// Manejo de estado:
//   "idle"        → listo, click para grabar
//   "recording"   → grabando (con elapsed en segundos)
//   "transcribing"→ procesando audio con Whisper
//   "error"       → algo falló (e.g. permiso denegado)
//
// API:
//   const { state, elapsed, error, transcription, start, stop, cancel, reset } = useVoiceRecorder({ onTranscribed });
//
// onTranscribed(text) se llama cuando termina la transcripción exitosa. El
// caller decide qué hacer (rellenar input, abrir modal, etc).

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAuthHeadersOnly } from "../../../lib/apiAuth.js";

const SUPPORTS_MEDIA = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function useVoiceRecorder({ onTranscribed, autoLanguage = false } = {}) {
  const [state, setState] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState("");

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tickerRef = useRef(null);
  const startedAtRef = useRef(0);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  // Cleanup al desmontar.
  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const reset = useCallback(() => {
    cleanupStream();
    chunksRef.current = [];
    recorderRef.current = null;
    setState("idle");
    setElapsed(0);
    setError("");
    setTranscription("");
  }, [cleanupStream]);

  const transcribeBlob = useCallback(async (blob) => {
    // Transcribe vía /api/transcribe (server-side). La key de Whisper vive solo
    // en el server; el browser nunca la ve.
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    // Solo Authorization (sin Content-Type: el browser fija el boundary multipart).
    const headers = await buildAuthHeadersOnly();
    const tRes = await fetch("/api/transcribe", { method: "POST", headers, body: formData });
    if (!tRes.ok) {
      const err = await tRes.text();
      throw new Error("Transcripción falló: " + err);
    }
    const { text } = await tRes.json();
    return text || "";
  }, []);

  const start = useCallback(async () => {
    if (!SUPPORTS_MEDIA) {
      setError("Tu navegador no soporta grabación de audio.");
      setState("error");
      return;
    }
    setError("");
    setTranscription("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size < 500) {
          setError("Grabación muy corta. Probá de nuevo.");
          setState("error");
          return;
        }
        setState("transcribing");
        try {
          const text = await transcribeBlob(blob);
          setTranscription(text);
          if (!text.trim()) {
            setError("No se detectó audio. Probá hablar más cerca del micrófono.");
            setState("error");
            return;
          }
          setState("idle");
          onTranscribed?.(text);
        } catch (e) {
          setError(e?.message || String(e));
          setState("error");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      tickerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      setState("recording");
    } catch (e) {
      setError("No se pudo acceder al micrófono: " + (e?.message || e));
      setState("error");
    }
  }, [cleanupStream, transcribeBlob, onTranscribed]);

  const stop = useCallback(() => {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    chunksRef.current = []; // descartar el audio
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
    cleanupStream();
    recorderRef.current = null;
    setState("idle");
    setElapsed(0);
    setError("");
  }, [cleanupStream]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle" || state === "error") start();
  }, [state, start, stop]);

  return {
    state,
    elapsed,
    error,
    transcription,
    start, stop, cancel, reset, toggle,
    supported: SUPPORTS_MEDIA,
  };
}
