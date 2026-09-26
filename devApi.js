// Plugin de Vite que sirve las funciones de `api/` durante `npm run dev`.
//
// Vite solo sirve el front: en producción, `/api/*` lo atiende Vercel con cada
// archivo de `api/` como serverless function, pero en local esas rutas daban 404
// y cualquier feature de IA (guionista, generador de guiones del slot,
// transcripción, clasificador) era imposible de probar sin deployar.
//
// Este plugin importa el handler correspondiente y le pasa un req/res con la
// forma mínima que esperan: `req.body` ya parseado y `res.status().json()`.
// SOLO corre en `apply: "serve"` — no toca el build de producción.
//
// Las API keys salen de `.env.prod` (que es un symlink al pull de Vercel). No se
// exponen al browser: viven en el proceso de Node, igual que en producción.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

// Lee un .env sencillo (KEY=valor, con comillas opcionales). Los valores del
// pull de Vercel vienen entrecomillados y algunos con un "\n" literal al final.
function loadEnv(file) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return 0;
  let n = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;                 // no pisar lo que ya venga del shell
    process.env[key] = raw.trim().replace(/^"|"$/g, "").replace(/\\n$/, "");
    n++;
  }
  return n;
}

// Cuerpo de la request como texto (los handlers esperan `req.body` ya parseado,
// que es lo que hace el bodyParser de Vercel).
function readBody(req) {
  return new Promise((ok, fail) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => ok(data));
    req.on("error", fail);
  });
}

// Adapta el `res` de Node al subconjunto de la API de Vercel que usan los
// handlers: status().json(), send(), end(), setHeader(), writeHead() y write()
// (este último lo usa el streaming SSE de generate-script).
function adaptRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    return res;
  };
  return res;
}

export function devApi() {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      const loaded = loadEnv(".env.prod");
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      server.config.logger.info(
        `  ➜  API local:  api/*.js servidas en /api/*  (${loaded} vars de .env.prod` +
        `${hasAnthropic ? "" : ", ⚠ falta ANTHROPIC_API_KEY"})`,
      );

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const name = req.url.split("?")[0].replace(/^\/api\//, "").replace(/\/+$/, "");
        const file = resolve(ROOT, "api", `${name}.js`);
        if (!name || name.includes("..") || !existsSync(file)) return next();

        try {
          // Import fresco en cada request → editar un handler se ve sin reiniciar.
          const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
          const handler = mod.default;
          if (typeof handler !== "function") return next();

          const raw = await readBody(req);
          req.body = raw && raw.trim().startsWith("{") ? JSON.parse(raw) : raw;
          if (!req.query) req.query = Object.fromEntries(new URL(req.url, "http://localhost").searchParams);

          await handler(req, adaptRes(res));
          if (!res.writableEnded) res.end();
        } catch (err) {
          server.config.logger.error(`[dev-api] ${name}: ${err?.stack || err?.message || err}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
          }
          if (!res.writableEnded) res.end(JSON.stringify({ error: String(err?.message || err) }));
        }
      });
    },
  };
}
