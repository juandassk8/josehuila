// Convert script markdown (HOOKS/BODY/CTA with **Hook N:** patterns) to HTML for RichEditor
export function scriptMarkdownToHtml(text) {
  if (!text || typeof text !== "string") return "";

  // Split into sections by ## HEADER
  const sections = [];
  let current = { header: null, lines: [] };

  const lines = text.split("\n");
  for (const line of lines) {
    // Detecta header tanto con `## HOOKS`, `**HOOKS**`, `HOOKS:` o `HOOKS`
    // suelto en su propia línea. La línea TIENE que ser solo el label —
    // así "el body de la marca" en medio del texto no rompe la sección.
    const headerMatch = line.match(/^\s*[#*_]{0,4}\s*(HOOKS?|BODY|CTA)\s*:?\s*[#*_]{0,4}\s*$/i);
    if (headerMatch) {
      if (current.header || current.lines.length) sections.push(current);
      current = { header: headerMatch[1].toUpperCase(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.header || current.lines.length) sections.push(current);

  let html = "";
  for (const sec of sections) {
    if (sec.header) {
      html += `<h2>${sec.header === "HOOK" ? "HOOKS" : sec.header}</h2>`;
    }
    const content = sec.lines.join("\n").trim();
    if (!content) continue;

    if ((sec.header || "").startsWith("HOOK")) {
      // Parse individual hooks
      const hookRegex = /\*{0,2}Hook\s*(\d+):?\*{0,2}\s*([^]+?)(?=(?:\*{0,2}Hook\s*\d+:)|$)/gi;
      const hooks = [];
      let match;
      while ((match = hookRegex.exec(content)) !== null) {
        hooks.push({ num: match[1], text: match[2].trim() });
      }
      if (hooks.length) {
        for (const h of hooks) {
          html += `<p><strong>Hook ${h.num}:</strong> ${escapeHtml(h.text)}</p>`;
        }
      } else {
        // Fallback: treat each non-empty paragraph as a hook line
        content.split(/\n\n+/).forEach((para) => {
          const clean = para.replace(/\*\*/g, "").trim();
          if (clean) html += `<p>${escapeHtml(clean)}</p>`;
        });
      }
    } else {
      // BODY or CTA: split into paragraphs by double newlines
      content.split(/\n\n+/).forEach((para) => {
        const clean = para.trim();
        if (clean) html += `<p>${escapeHtml(clean)}</p>`;
      });
    }
  }

  // If no sections found, just wrap each paragraph
  if (!html) {
    text.split(/\n\n+/).forEach((para) => {
      const clean = para.trim();
      if (clean) html += `<p>${escapeHtml(clean)}</p>`;
    });
  }

  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*/g, "");
}
