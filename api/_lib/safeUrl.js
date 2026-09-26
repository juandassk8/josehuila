// Descargas externas server-side. Valida la URL y todas sus resoluciones DNS
// antes de cada solicitud, y vuelve a validar cada redirección.
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function ipv4Private(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

export function isPrivateAddress(raw) {
  const address = String(raw || "").toLowerCase().split("%")[0];
  const family = isIP(address);
  if (family === 4) return ipv4Private(address);
  if (family !== 6) return true;
  if (address === "::" || address === "::1") return true;
  if (/^(fc|fd)/.test(address) || /^fe[89ab]/.test(address) || /^ff/.test(address)) return true;
  if (address.startsWith("2001:db8:")) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? ipv4Private(mapped[1]) : false;
}

export function isSafeExternalUrl(raw) {
  let url;
  try { url = new URL(String(raw || "")); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST.test(host) || isIP(host)) return false;
  return true;
}

async function resolveSafeExternalUrl(raw, lookupFn = lookup) {
  if (!isSafeExternalUrl(raw)) throw new Error("URL externa no permitida");
  const url = new URL(String(raw));
  const addresses = await lookupFn(url.hostname, { all: true, verbatim: true });
  if (!addresses?.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("La URL resuelve a una red privada o reservada");
  }
  return { url, addresses };
}

export async function assertSafeExternalUrl(raw, lookupFn = lookup) {
  return (await resolveSafeExternalUrl(raw, lookupFn)).url;
}

function pinnedHttpsFetch(url, options, address, timeoutMs) {
  return new Promise((resolve, reject) => {
    const signal = options.signal || AbortSignal.timeout(timeoutMs);
    const request = httpsRequest(url, {
      method: options.method || "GET",
      headers: options.headers,
      signal,
      family: address.family,
      autoSelectFamily: false,
      // Usa exactamente la IP que acabamos de validar. El hostname original
      // se conserva para Host, SNI y la validación del certificado TLS.
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      resolve({
        status: incoming.statusCode || 0,
        ok: (incoming.statusCode || 0) >= 200 && (incoming.statusCode || 0) < 300,
        headers,
        body: Readable.toWeb(incoming),
      });
    });
    request.on("error", reject);
    if (options.body !== undefined && options.body !== null) request.write(options.body);
    request.end();
  });
}

export async function safeExternalFetch(raw, options = {}, {
  maxRedirects = 3,
  timeoutMs = 20_000,
  lookupFn = lookup,
  fetchFn = fetch,
} = {}) {
  let current = String(raw || "");
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, addresses } = await resolveSafeExternalUrl(current, lookupFn);
    const requestOptions = { ...options, redirect: "manual", signal: options.signal || AbortSignal.timeout(timeoutMs) };
    const response = fetchFn === fetch
      ? await pinnedHttpsFetch(url, requestOptions, addresses[0], timeoutMs)
      : await fetchFn(url, requestOptions);
    if (!REDIRECTS.has(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location || hop === maxRedirects) throw new Error("Demasiadas redirecciones externas");
    current = new URL(location, url).toString();
  }
  throw new Error("Descarga externa rechazada");
}

export async function readResponseBuffer(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("archivo demasiado grande");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("archivo demasiado grande");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, size);
}

export async function readResponseText(response, maxBytes) {
  return (await readResponseBuffer(response, maxBytes)).toString("utf8");
}
