// Transcripcion de audio/video via Whisper (OpenAI).
//
// Whisper tiene un limite DURO de 25MB por archivo. Para poder subir audios
// mas grandes/largos, comprimimos en el navegador antes de enviar: mono 16kHz
// (lo que Whisper usa internamente) baja muchisimo el peso sin perder voz. Si
// aun asi es largo, lo partimos en tramos y unimos el texto.

import { buildAuthHeadersOnly } from "./apiAuth.js";

const WHISPER_LIMIT = 25 * 1024 * 1024;
// LÍMITE REAL: Vercel corta el body de la función serverless en ~4.5MB. Aunque
// Whisper aguanta 25MB, el request nunca llega si pasa ~4.5MB → HTTP 413. Por eso
// los umbrales van bajo ESE límite, no bajo el de Whisper.
const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // ~4MB, margen seguro bajo los 4.5MB
// Enviamos directo (sin recomprimir) solo si el archivo ya cabe en el body de Vercel.
const DIRECT_LIMIT = VERCEL_BODY_LIMIT;
// Tramos de ~100s: a 16kHz mono/16-bit WAV son ~3.2MB, cómodos bajo los 4.5MB de
// Vercel (antes eran de 8 min = ~15MB → 413 en cualquier audio largo).
const CHUNK_SECONDS = 100;
const TARGET_RATE = 16000;

// Transcribe vía el endpoint server-side /api/transcribe: le mandamos el audio
// y el server llama a Whisper con la key (que NUNCA se expone al browser).
async function transcribeBlob(blob, filename) {
  const formData = new FormData();
  formData.append("file", blob, filename);

  // Solo Authorization (sin Content-Type: el browser fija el boundary multipart).
  const headers = await buildAuthHeadersOnly();
  const res = await fetch("/api/transcribe", { method: "POST", headers, body: formData });

  if (!res.ok) {
    let errMsg = "Error desconocido";
    try {
      const err = await res.json();
      errMsg = err.error?.message || err.error || errMsg;
    } catch {
      errMsg = `HTTP ${res.status}`;
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.text;
}

function downmixToMono(audioBuffer) {
  const n = audioBuffer.length;
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    out[i] = sum / channels.length;
  }
  return out;
}

async function resampleTo16k(mono, fromRate) {
  if (fromRate === TARGET_RATE) return mono;
  const duration = mono.length / fromRate;
  const length = Math.max(1, Math.ceil(duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const buf = offline.createBuffer(1, mono.length, fromRate);
  buf.copyToChannel(mono, 0);
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

async function compressToChunks(file, onProgress) {
  onProgress?.("Decodificando audio...");
  const arrayBuffer = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Tu navegador no soporta comprimir audio");

  // Pedir 16kHz al decodificar reduce mucho la memoria (Chrome resamplea aqui).
  let ctx;
  try {
    ctx = new AC({ sampleRate: TARGET_RATE });
  } catch {
    ctx = new AC();
  }
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close?.();
  }

  onProgress?.("Comprimiendo audio...");
  const mono = downmixToMono(audioBuffer);
  const samples = await resampleTo16k(mono, audioBuffer.sampleRate);

  const perChunk = CHUNK_SECONDS * TARGET_RATE;
  const chunks = [];
  for (let i = 0; i < samples.length; i += perChunk) {
    const slice = samples.subarray(i, Math.min(i + perChunk, samples.length));
    chunks.push(encodeWav(slice, TARGET_RATE));
  }
  return chunks;
}

// API publica: transcribe cualquier archivo de audio/video, comprimiendo y
// troceando si hace falta. onProgress(msg) recibe mensajes de estado.
export async function transcribeAudioFile(file, onProgress) {
  if (file.size <= DIRECT_LIMIT) {
    onProgress?.("Transcribiendo...");
    return transcribeBlob(file, file.name);
  }

  const chunks = await compressToChunks(file, onProgress);

  // Si por algun motivo un tramo aun supera el limite del body de Vercel, avisamos.
  if (chunks.some((c) => c.size > WHISPER_LIMIT || c.size > VERCEL_BODY_LIMIT * 1.15)) {
    throw new Error("Un tramo quedo muy grande; probá con un audio mas corto");
  }

  let full = "";
  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1) {
      onProgress?.(`Transcribiendo parte ${i + 1}/${chunks.length}...`);
    } else {
      onProgress?.("Transcribiendo...");
    }
    const text = await transcribeBlob(chunks[i], `parte${i + 1}.wav`);
    if (text && text.trim()) full += (full ? " " : "") + text.trim();
  }
  return full;
}
