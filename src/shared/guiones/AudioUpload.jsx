import { useState, useRef, useEffect, useCallback } from "react";
import { DS, darkBtnGhost } from "../../lib/design.js";
import { transcribeAudioFile } from "../../lib/audioTranscribe.js";

export function AudioUpload({ onTranscribed, label, droppedFile, onDropConsumed }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setProgress("Archivo muy grande (max 100MB)");
      setTimeout(() => setProgress(""), 3000);
      return;
    }

    setUploading(true);
    setProgress("Transcribiendo...");

    try {
      const text = await transcribeAudioFile(file, setProgress);
      setProgress("Transcripcion lista");
      onTranscribed(text);
      setTimeout(() => setProgress(""), 2000);
    } catch (err) {
      setProgress(`Error: ${err.message}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [onTranscribed]);

  useEffect(() => {
    if (droppedFile && !uploading) {
      onDropConsumed?.();
      processFile(droppedFile);
    }
  }, [droppedFile]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/") || /\.(mp3|mp4|m4a|wav|webm|ogg)$/i.test(file.name))) {
      processFile(file);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg"
        onChange={(e) => processFile(e.target.files?.[0])}
        style={{ display: "none" }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
        onDrop={handleDrop}
        style={{
          ...darkBtnGhost,
          padding: "6px 14px",
          fontSize: 11,
          opacity: uploading ? 0.5 : 1,
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: dragging ? `2px dashed ${DS.blue}` : darkBtnGhost.border,
          background: dragging ? "rgba(55,138,221,0.08)" : "transparent",
          transition: "border 0.1s, background 0.1s",
        }}
        title="Click para subir o arrastra un archivo aqui"
      >
        🎙️ {dragging ? "Suelta el archivo aqui" : (label || "Transcribir audio/video")}
      </button>
      {progress && (
        <span style={{ fontSize: 11, color: progress.startsWith("Error") ? DS.red : DS.green, fontWeight: 500 }}>
          {progress}
        </span>
      )}
    </div>
  );
}
