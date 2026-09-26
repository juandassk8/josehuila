// Zona de portada reutilizable: arrastrar, hacer click o PEGAR (Cmd/Ctrl+V) una
// imagen para usarla como portada de un video. Sube al bucket de ejemplos y
// devuelve la URL pública vía onChange. Reusa uploadExampleImage (storage.js).
//
// enablePaste: solo activar en instancias ÚNICAS (p. ej. un modal). En grillas con
// varias zonas dejalo en false — el paste es global y sería ambiguo entre tarjetas.

import { useCallback, useEffect, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { toastError } from "../lib/toast.js";
import { uploadExampleImage } from "./storage.js";

export function CoverDrop({ value, conceptId = "cover", onChange, aspect = "9 / 12", enablePaste = false, hint }) {
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const upload = useCallback(async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { toastError("Subí una imagen (JPG o PNG)"); return; }
    setUploading(true);
    try { const url = await uploadExampleImage(file, { conceptId }); onChange(url); }
    catch (e) { toastError("No se pudo subir la portada: " + (e?.message || e)); }
    finally { setUploading(false); }
  }, [conceptId, onChange]);

  // Pegar imagen del portapapeles (tomar captura → Cmd/Ctrl+V directo).
  useEffect(() => {
    if (!enablePaste) return;
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); upload(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enablePaste, upload]);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}
      title="Arrastrá, hacé click o pegá una imagen"
      style={{
        position: "relative", aspectRatio: aspect, borderRadius: 12, cursor: "pointer", overflow: "hidden",
        border: `1.5px dashed ${over ? "var(--sel)" : value ? "var(--line)" : "var(--line-2)"}`,
        background: over ? "var(--sel-soft)" : "var(--surface-2)", display: "grid", placeItems: "center", textAlign: "center",
      }}>
      {value ? <img src={value} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      <div style={{ position: "relative", padding: "6px 10px", borderRadius: 8, fontFamily: DS.font, fontSize: 11, fontWeight: 600,
        color: value ? "#fff" : (over ? "var(--sel)" : "var(--ink-4)"), background: value ? "rgba(0,0,0,0.5)" : "transparent" }}>
        {uploading ? "Subiendo…" : value ? "Cambiar portada" : (hint || "Arrastrá, pegá o click")}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
