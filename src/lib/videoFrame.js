// Núcleo compartido: con un <video> ya apuntando a una fuente, busca un frame
// con contenido y devuelve un Blob JPEG (o null). No revoca ni limpia el src:
// eso lo hace quien lo llama (según sea objectURL o URL remota).
async function grabFrame(video, quality) {
  // Esperamos a tener metadata (duración/tamaño).
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("No se pudo leer el video"));
    setTimeout(() => reject(new Error("Timeout leyendo el video")), 15000);
  });

  // Buscamos un frame con contenido (no el negro inicial): ~25% de la duración,
  // acotado entre 0.5s y 3s. Muchos anuncios abren con un gancho visual ahí.
  const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
  const target = Math.min(Math.max(dur * 0.25, 0.5), 3);

  await new Promise((resolve, reject) => {
    video.onseeked = resolve;
    video.onerror = () => reject(new Error("No se pudo posicionar el video"));
    setTimeout(resolve, 8000); // si no dispara seeked, seguimos con lo que haya
    try { video.currentTime = target; } catch { resolve(); }
  });

  const w = video.videoWidth || 720;
  const h = video.videoHeight || 1280;
  // Acotamos el lado mayor a 1080px para no generar imágenes enormes.
  const scale = Math.min(1, 1080 / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, cw, ch);

  return await new Promise((resolve) => {
    // toBlob lanza SecurityError si el canvas quedó "tainted" (sin CORS) → null.
    try { canvas.toBlob((b) => resolve(b), "image/jpeg", quality); }
    catch { resolve(null); }
  });
}

// Extrae un fotograma desde la URL de un video ya HOSTEADO (p.ej. respaldo en
// Supabase Storage, que sí manda CORS `*`). Sirve para RECUPERAR portadas rotas
// del banco a partir del video de respaldo, sin depender de que el anuncio siga
// vivo en Meta. crossOrigin=anonymous evita que el canvas quede tainted.
// Devuelve un Blob JPEG o null (nunca lanza).
export async function extractVideoCoverFromUrl(url, { quality = 0.82 } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    return await grabFrame(video, quality);
  } catch {
    return null;
  } finally {
    video.src = "";
  }
}

// Extrae un fotograma representativo de un archivo de video en el navegador.
// Sirve para que la IA "vea" el creativo (detectar marca/formato) sin depender
// de que Foreplay/Meta nos den una portada. Devuelve un Blob JPEG o null.
export async function extractVideoCover(file, { quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith("video/")) return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    return await grabFrame(video, quality);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}
