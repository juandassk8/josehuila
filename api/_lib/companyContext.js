// Contexto de producto/negocio para los prompts de IA (workspaces de empresa).
//
// Fuente: `company_voice_profile.niche` + `products[]` (jsonb).
//
// Extraído de api/generate-script.js, con un bug importante arreglado de paso:
// el serializador genérico `Object.entries(p)` volcaba TODAS las claves del
// producto como `- clave: valor`, y con el modelo de producto nuevo eso rompía:
//
//   • `touchpoints` (ÁNGULOS DE VENTA, objeciones y niveles de conciencia)
//     llegaba al prompt literalmente como `- touchpoints: [object Object]`.
//     O sea: la estrategia de venta entera se perdía. Tiene UI completa, se
//     extrae con IA, se guarda por producto… y nunca llegaba al guionista.
//   • `info_doc_text` (hasta 40k chars) se volcaba crudo y encima quedaba FUERA
//     del trim adaptativo de buildSystemPrompt (que solo recorta ejemplos y
//     docs de expertise) → podía reventar el SYSTEM_BUDGET de 22k tokens.
//   • `info_file_url` / `info_file_name` / `creators` entraban como ruido.
//
// Ahora esas claves se excluyen del loop genérico y se renderizan explícitas.

// Claves con tratamiento propio (o que no aportan nada al prompt).
const HANDLED_KEYS = new Set([
  "id", "name", "documents", "context",
  "touchpoints",                            // → sección de estrategia
  "info_brief", "info_doc_text",            // → documento (resumen nuevo / crudo viejo)
  "never_say",                              // → bloque PROHIBIDO, no info del producto
  "info_file_url", "info_file_name",        // ruido: URLs
  "creators",                               // → línea propia
]);

const TOUCHPOINT_SECTIONS = [
  { key: "angles",     title: "ÁNGULOS DE VENTA", hint: "Motivos, beneficios o dolores por los que te compran." },
  { key: "objections", title: "OBJECIONES",       hint: "Motivos por los que NO compran — hay que desactivarlas." },
  { key: "awareness",  title: "CONCIENCIA",       hint: "Cosas que la gente no sabe y, si las entendiera, compraría más." },
];

// Cap del texto del archivo de info. 6000 chars ≈ 1.7k tokens: entra info real
// sin comerse el presupuesto del system prompt.
const INFO_DOC_LIMIT = 6000;

function renderTouchpoints(tp) {
  if (!tp || typeof tp !== "object") return "";
  let out = "";
  for (const sec of TOUCHPOINT_SECTIONS) {
    const items = Array.isArray(tp[sec.key]) ? tp[sec.key] : [];
    const clean = items.filter((it) => it && String(it.title || "").trim());
    if (!clean.length) continue;
    out += `\n**${sec.title}** — ${sec.hint}\n`;
    for (const it of clean) {
      const desc = String(it.desc || "").trim();
      out += `- ${String(it.title).trim()}${desc ? `: ${desc}` : ""}\n`;
    }
  }
  return out;
}

// Devuelve el objeto completo de un ángulo a partir de su título (que es lo que
// guarda el slot del pipeline en `angulo`). Match tolerante a mayúsculas y
// espacios. Null si no lo encuentra.
export function findAngle(product, angleTitle) {
  const wanted = String(angleTitle || "").trim().toLowerCase();
  if (!wanted) return null;
  const angles = product?.touchpoints?.angles;
  if (!Array.isArray(angles)) return null;
  return angles.find((a) => String(a?.title || "").trim().toLowerCase() === wanted) || null;
}

// Devuelve el producto de `voice.products[]` por id, con fallback por nombre
// (el slot del pipeline guarda ambos, pero los slots viejos solo tienen nombre).
export function findProduct(voice, productId, productName = null) {
  const products = Array.isArray(voice?.products) ? voice.products : [];
  if (productId) {
    const byId = products.find((p) => p?.id === productId);
    if (byId) return byId;
  }
  const wanted = String(productName || "").trim().toLowerCase();
  if (wanted) {
    const byName = products.find((p) => String(p?.name || "").trim().toLowerCase() === wanted);
    if (byName) return byName;
  }
  return null;
}

// Si productId está presente, FILTRA al producto seleccionado. Esto evita que el
// LLM mezcle datos entre productos cuando una empresa tiene varios (bug del
// 2026-04-23: una empresa con 2 productos veía ambos y el guion mezclaba claims).
export function buildCompanyContext(voice, productId = null) {
  if (!voice) return "";
  const niche = voice.niche || "";
  const allProducts = Array.isArray(voice.products) ? voice.products : [];
  let products = allProducts;
  if (productId) {
    const match = allProducts.find((p) => p?.id === productId);
    if (match) products = [match];
  }
  if (!niche && products.length === 0) return "";

  let out = `\n## INFORMACIÓN DEL PRODUCTO / NEGOCIO\nEstás escribiendo guiones para este negocio. Usá esta info para adaptar TODO el guion al producto real — nunca escribas genérico.\n`;
  if (niche) out += `\nNicho: ${niche}\n`;

  for (const p of products) {
    out += `\n### Producto: ${p.name || "(sin nombre)"}\n`;

    // Campos simples del nicho (what, avatar, benefit, price, differentiator…).
    for (const [k, v] of Object.entries(p)) {
      if (HANDLED_KEYS.has(k)) continue;
      if (!v || !String(v).trim()) continue;
      out += `- ${k}: ${v}\n`;
    }

    if (Array.isArray(p.creators) && p.creators.length) {
      out += `- creadores asignados: ${p.creators.filter(Boolean).join(", ")}\n`;
    }

    // Estrategia de venta del producto — lo que antes se perdía entero.
    const strategy = renderTouchpoints(p.touchpoints);
    if (strategy) out += `\n#### Estrategia de venta de este producto${strategy}`;

    if (p.context && String(p.context).trim()) {
      out += `\nContexto / reglas: ${String(p.context).trim()}\n`;
    }

    // `info_brief` es el documento ya destilado al subirlo (una llamada a
    // /api/extract-knowledge, no 40k chars crudos por generación). `info_doc_text`
    // es el formato viejo: se sigue leyendo para los productos que aún lo tengan,
    // recortado, hasta que se vuelva a subir el archivo.
    const doc = String(p.info_brief || p.info_doc_text || "").trim();
    if (doc) {
      out += `\n--- Ficha del producto${p.info_file_name ? ` (${p.info_file_name})` : ""} ---\n${doc.slice(0, INFO_DOC_LIMIT)}\n`;
      if (doc.length > INFO_DOC_LIMIT) out += `[…recortado]\n`;
    }

    if (Array.isArray(p.documents)) {
      for (const d of p.documents) {
        if (d?.content && String(d.content).trim()) {
          out += `\n--- Documento: ${d.name} ---\n${String(d.content).slice(0, 4000)}\n`;
        }
      }
    }
  }

  out += `\nREGLA CRÍTICA: Cada guion que escribas debe hablar de este producto específico con su avatar real, sus diferenciadores reales, sus beneficios reales. Nada genérico.\n`;
  return out;
}
