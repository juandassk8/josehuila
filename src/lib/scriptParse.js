// Helpers compartidos para extraer/strippar el bloque ## TÍTULO que el LLM
// emite arriba del guion. El título se persiste en company_scripts.title;
// el resto del texto (HOOKS/BODY/CTA) va en generated_content.

// Extrae el título del bloque ## TÍTULO si existe.
// Match flexible: acepta `## TÍTULO\nxxx`, `## TÍTULO: xxx`, `**TÍTULO**`, etc.
// Strippa todo markdown (no solo en bordes) por si el modelo emite **El...** mid-frase.
export function extractTitleFromScript(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/(?:^|\n)\s*[#*_]{0,4}\s*T[ÍI]TULO\s*:?\s*[#*_]{0,4}\s*([^\n]+)/i);
  if (!m) return null;
  let t = m[1].trim();
  t = t.replace(/[*_`]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^["']+|["']+$/g, "").trim();
  t = t.replace(/^[-–—:]+\s*/, "").trim();
  t = t.replace(/[.,;:]+$/, "").trim();
  if (!t) return null;
  return t.slice(0, 100);
}

// Devuelve el texto sin el bloque previo a ## HOOKS (incluido ## TÍTULO).
// Si no aparece HOOKS, devuelve el texto original.
export function stripTitleSection(text) {
  if (!text || typeof text !== "string") return text;
  const idx = text.search(/(?:^|\n)\s*[#*_]{0,4}\s*HOOKS?\b/i);
  if (idx < 0) return text;
  const sliced = text.slice(idx).replace(/^\n+/, "");
  return sliced || text;
}
