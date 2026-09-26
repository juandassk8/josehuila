// PDF de entrega de guiones — layout premium con portada, una página por
// guion y branding consistente. jspdf lazy-imported.

// ─── Paleta & tipografía ──────────────────────────────────────────────────
const ACCENT = [29, 158, 117];        // verde Inforce
const ACCENT_SOFT = [232, 245, 240];  // verde claro (soft background)
const INK = [20, 22, 21];             // near black
const INK_SOFT = [60, 62, 60];
const GREY = [110, 111, 106];
const GREY_SOFT = [170, 170, 165];
const LINE = [225, 225, 218];
const WARM = [250, 248, 243];         // off-white papel
const CARD = [253, 252, 248];

const FONT = "helvetica";

// ─── Parser del script ────────────────────────────────────────────────────
// Reconoce headers HOOKS/BODY/CTA tolerando:
//   - Mayúsculas o minúsculas ("HOOKS", "Hook", "hook")
//   - Sinónimos en ES ("cuerpo" → BODY, "gancho/s" → HOOK, "llamado a la
//     acción" → CTA)
//   - Decoración markdown previa ("## HOOKS", "**Hook:**", "—— BODY ——")
//   - Singular o plural ("Hook" tanto como "Hooks")
// Y limpia comillas (rectas y curvas) alrededor de cada sección y de cada
// hook individual.
//
// El header debe estar al inicio de una línea (con posible decoración) — eso
// evita falsos positivos con palabras comunes que aparezcan inline. Marcas
// tipo "Hook 1:" NO se tratan como header de sección sino como item dentro
// de la sección HOOKS.
export function parseScript(raw) {
  if (!raw || typeof raw !== "string") return { hooks: [], body: "", cta: "" };

  // Normalizamos solo las comillas curvas a rectas para que stripQuotes
  // detecte el par envolvente. Em-dashes (—) y en-dashes (–) los preservamos:
  // forman parte del estilo del guion y no afectan al parser.
  const text = String(raw)
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");

  const SECTIONS = [
    // Orden importa: más largos primero para que "hooks" se prefiera sobre
    // "hook" en la alternancia del regex.
    { key: "HOOKS", words: ["hooks", "hook", "ganchos", "gancho"] },
    { key: "BODY", words: ["body", "cuerpo", "desarrollo"] },
    { key: "CTA", words: ["call to action", "llamado a la acción", "llamada a la acción", "cta", "cierre"] },
  ];

  const SENTINEL = "";

  // Reemplaza cada header de sección por un sentinel-marker. Cada sección
  // tiene su propio regex porque queremos preservar contenido inline después
  // del header (ej: "Body: Lo que pasó..." — preservamos "Lo que pasó...").
  let prepped = text;
  for (const { key, words } of SECTIONS) {
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(
      `^[\\s>#*_\\-]*\\*{0,3}\\s*(?:${escaped.join("|")})\\*{0,3}\\s*[:.\\-]?[ \\t]*`,
      "gim",
    );
    prepped = prepped.replace(re, (match, offset, full) => {
      const after = full.slice(offset + match.length);
      const nextChar = after[0] || "";
      // Si después del marker viene un dígito o paréntesis (ej "Hook 1:"),
      // NO es header de sección — es un item de hook. Lo dejamos intacto.
      if (/[0-9(]/.test(nextChar)) return match;
      return `\n${SENTINEL}${key}${SENTINEL}\n`;
    });
  }

  const positions = [];
  const reSentinel = new RegExp(`${SENTINEL}(HOOKS|BODY|CTA)${SENTINEL}`, "g");
  let m;
  while ((m = reSentinel.exec(prepped)) !== null) {
    positions.push({ key: m[1], start: m.index, end: m.index + m[0].length });
  }

  if (positions.length === 0) {
    // Sin marcadores: si el texto parece lista de hooks (líneas numeradas o
    // con bullets), lo tratamos como hooks. Si no, va todo al body.
    const cleaned = text.trim();
    const looksLikeHookList = /^(\s*(?:[-•*]|\d+[.)])\s+).+(\n\s*(?:[-•*]|\d+[.)])\s+.+){1,}/.test(cleaned);
    if (looksLikeHookList) {
      return { hooks: splitHooks(cleaned), body: "", cta: "" };
    }
    return { hooks: [], body: stripQuotes(cleaned), cta: "" };
  }

  const sections = { HOOKS: "", BODY: "", CTA: "" };

  // Contenido ANTES del primer marcador: si el primer header es BODY o CTA,
  // lo que aparece arriba casi siempre es la lista de hooks. Si el primer
  // header ya es HOOKS, ese prefix lo descartamos (suele ser ruido/título).
  const prefix = prepped.slice(0, positions[0].start).trim();
  if (prefix && positions[0].key !== "HOOKS") {
    sections.HOOKS = prefix;
  }

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const next = positions[i + 1];
    const slice = prepped.slice(p.end, next ? next.start : prepped.length).trim();
    if (slice) {
      sections[p.key] = sections[p.key] ? sections[p.key] + "\n" + slice : slice;
    }
  }

  return {
    hooks: splitHooks(sections.HOOKS),
    body: stripQuotes(sections.BODY.trim()),
    cta: stripQuotes(sections.CTA.trim()),
  };
}

// Quita comillas envolventes (rectas/curvas ya normalizadas), backticks y
// asteriscos markdown. Itera hasta que no se pueda quitar más para soportar
// capas tipo **"texto"**.
function stripQuotes(s) {
  if (!s) return "";
  let out = String(s).trim();
  for (let i = 0; i < 5; i++) {
    const before = out;
    if (/^\*+/.test(out) && /\*+$/.test(out)) {
      out = out.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim();
    }
    if (out.length >= 2) {
      const first = out[0];
      const last = out[out.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        out = out.slice(1, -1).trim();
      }
    }
    if (/^`+/.test(out) && /`+$/.test(out)) {
      out = out.replace(/^`+\s*/, "").replace(/\s*`+$/, "").trim();
    }
    if (out === before) break;
  }
  return out;
}

// Convierte el bloque de hooks en items individuales. Soporta:
//   "Hook 1: ..." "1. ..." "1) ..." "- ..." "• ..." o líneas separadas.
function splitHooks(raw) {
  if (!raw) return [];
  const cleaned = String(raw).replace(/\*+/g, "").trim();
  if (!cleaned) return [];

  // Intento 1: split por marcadores al inicio de línea ("Hook N:", "N.", "- ").
  const lineRe = /(?:^|\n)\s*(?:hook\s+\d+\s*[:.)]\s*|\d{1,2}\s*[:.)]\s+|[-•*]\s+)/gi;
  let items = cleaned.split(lineRe).map((s) => s.trim()).filter(Boolean);

  // Intento 2: si quedó como un solo item pero hay saltos de línea, split por línea.
  if (items.length <= 1 && /\r?\n/.test(cleaned)) {
    items = cleaned
      .split(/\r?\n+/)
      .map((s) => s.replace(/^(?:hook\s*\d+\s*[:.)]\s*|\d+[.)]\s+|[-•*]\s+)/i, "").trim())
      .filter(Boolean);
  }

  // Intento 3: split inline tipo "Hook 1: ... Hook 2: ... Hook 3: ...".
  if (items.length <= 1) {
    const inlineRe = /\s*hook\s+\d+\s*[:.)]\s*/gi;
    const parts = cleaned.split(inlineRe).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) items = parts;
  }

  return items.map((h) => stripQuotes(h)).filter(Boolean);
}

// ─── Helpers de dibujo ────────────────────────────────────────────────────
function createDraw(doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const setColor = (rgb, kind = "text") => {
    if (kind === "text") doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    if (kind === "fill") doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    if (kind === "draw") doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  };

  const fillPage = (rgb) => {
    setColor(rgb, "fill");
    doc.rect(0, 0, pageW, pageH, "F");
  };

  const fillRect = (x, y, w, h, rgb) => {
    setColor(rgb, "fill");
    doc.rect(x, y, w, h, "F");
  };

  const roundRect = (x, y, w, h, r, rgb, kind = "F") => {
    if (kind === "F" || kind === "FD") setColor(rgb, "fill");
    if (kind === "D" || kind === "FD") setColor(rgb, "draw");
    doc.roundedRect(x, y, w, h, r, r, kind);
  };

  const line = (x1, y1, x2, y2, rgb, lw = 0.7) => {
    setColor(rgb, "draw");
    doc.setLineWidth(lw);
    doc.line(x1, y1, x2, y2);
  };

  const text = (str, x, y, {
    size = 11, bold = false, color = INK, align = "left",
  } = {}) => {
    doc.setFont(FONT, bold ? "bold" : "normal");
    doc.setFontSize(size);
    setColor(color, "text");
    doc.text(String(str || ""), x, y, { align });
  };

  // Texto wrap-ado, retorna la nueva Y después de escribir. Sin saltos de página.
  const paragraph = (str, x, y, w, {
    size = 11, bold = false, color = INK,
    lineGap = 1.45,
  } = {}) => {
    doc.setFont(FONT, bold ? "bold" : "normal");
    doc.setFontSize(size);
    setColor(color, "text");
    const lines = doc.splitTextToSize(String(str || ""), w);
    const lh = size * lineGap;
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], x, y + size * 0.9 + i * lh);
    }
    return y + lines.length * lh;
  };

  const measureText = (str, { size = 11, bold = false } = {}) => {
    doc.setFont(FONT, bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.getTextWidth(String(str || ""));
  };

  return {
    pageW, pageH,
    setColor, fillPage, fillRect, roundRect, line, text, paragraph, measureText,
  };
}

// Chip con label + valor ("Concepto: X"). Solo trunca si el texto natural
// excede maxW — si cabe, lo deja entero.
function chip(draw, label, value, x, y, { maxW = 200, size = 10 } = {}) {
  const padX = 9, padY = 5;
  const labelText = label;
  const valueText = value || "—";
  const labelW = draw.measureText(labelText, { size, bold: true });
  const sepW = 4;
  const valueW = draw.measureText(valueText, { size, bold: false });
  const naturalW = labelW + sepW + valueW + padX * 2;

  let displayValue = valueText;
  let totalW = naturalW;
  if (naturalW > maxW) {
    const availW = maxW - padX * 2 - labelW - sepW;
    let w = valueW;
    while (w > availW && displayValue.length > 3) {
      displayValue = displayValue.slice(0, -2) + "…";
      w = draw.measureText(displayValue, { size });
    }
    totalW = maxW;
  }

  const h = size + padY * 2;
  draw.roundRect(x, y, totalW, h, 50, WARM, "F");
  draw.text(labelText, x + padX, y + padY + size * 0.9, { size, bold: true, color: INK_SOFT });
  draw.text(displayValue, x + padX + labelW + sepW, y + padY + size * 0.9, { size, color: INK });

  return { width: totalW, height: h };
}

// Header secundario con tipo-lettermark "—— HOOKS ——" estilo decorado
function sectionHeading(draw, label, x, y, w, { accentColor = ACCENT } = {}) {
  const size = 11;
  draw.text(label.toUpperCase(), x, y + size, {
    size, bold: true, color: INK,
  });
  // línea decorativa debajo del texto del mismo ancho
  const labelW = draw.measureText(label.toUpperCase(), { size, bold: true });
  draw.line(x, y + size + 3, x + labelW, y + size + 3, accentColor, 1.2);
  return y + size + 14;
}

// ─── Portada ──────────────────────────────────────────────────────────────
function drawCover(draw, doc, opts, count) {
  const { pageW, pageH } = draw;
  const margin = 54;

  // Background warm
  draw.fillPage(WARM);
  // Top accent strip
  draw.fillRect(0, 0, pageW, 10, ACCENT);

  // Kicker
  draw.text("INFORCE CONSULTING · ENTREGA DE GUIONES", margin, 150, {
    size: 9.5, bold: true, color: GREY,
  });

  // Big #NNN
  const bigNumber = `#${(opts.batchNumber || "001")}`;
  draw.text(bigNumber, margin, 230, { size: 72, bold: true, color: INK });

  // Company name + meta row
  if (opts.companyName) {
    draw.text(opts.companyName.toUpperCase(), margin, 275, {
      size: 14, bold: true, color: ACCENT,
    });
  }

  // Stats row — 3 columnas. Fecha en formato corto para que no overflowee.
  const todayLong = new Date().toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const todayShort = new Date().toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
  }).replace(/\./g, "");

  const cardY = 330;
  const cardH = 110;
  draw.roundRect(margin, cardY, pageW - margin * 2, cardH, 14, CARD, "F");
  draw.line(margin, cardY + 1, pageW - margin, cardY + 1, LINE, 0.7);

  const colW = (pageW - margin * 2) / 3;
  const cols = [
    { label: "FECHA", value: todayShort },
    { label: "RESPONSABLE", value: opts.responsable || "—" },
    { label: "GUIONES", value: String(count) },
  ];
  cols.forEach((col, i) => {
    const colLeft = margin + colW * i;
    const x = colLeft + 24;
    draw.text(col.label, x, cardY + 34, { size: 9, bold: true, color: GREY });
    // Size dinámico + truncado si sobrepasa el ancho de columna.
    const maxValueW = colW - 48;
    let size = 18;
    let valueText = String(col.value || "");
    let w = draw.measureText(valueText, { size, bold: true });
    while (w > maxValueW && size > 12) {
      size -= 1;
      w = draw.measureText(valueText, { size, bold: true });
    }
    while (w > maxValueW && valueText.length > 3) {
      valueText = valueText.slice(0, -2) + "…";
      w = draw.measureText(valueText, { size, bold: true });
    }
    draw.text(valueText, x, cardY + 68, { size, bold: true, color: INK });
  });

  // Nota opcional
  if ((opts.notes || "").trim()) {
    const notesY = cardY + cardH + 26;
    draw.text("NOTA", margin, notesY, { size: 9, bold: true, color: GREY });
    draw.paragraph(opts.notes, margin, notesY + 12, pageW - margin * 2, {
      size: 11, color: INK_SOFT,
    });
  }

  // Footer de portada
  const footY = pageH - 80;
  draw.line(margin, footY, pageW - margin, footY, LINE, 0.7);
  draw.text("Documento confidencial — para uso del equipo de producción.", margin, footY + 20, {
    size: 9, color: GREY,
  });
  draw.text(`inforce · ${todayLong}`, pageW - margin, footY + 20, {
    size: 9, color: GREY, align: "right",
  });
}

// ─── Página de un guion ───────────────────────────────────────────────────
function drawScriptPage(draw, doc, slot, idx, total, opts) {
  const { pageW, pageH } = draw;
  const margin = 54;
  const contentW = pageW - margin * 2;
  let y = margin;

  draw.fillPage(WARM);
  // Top mini strip
  draw.fillRect(0, 0, pageW, 4, ACCENT);

  // Header: badge numérico grande + título
  const badgeSize = 52;
  draw.roundRect(margin, y, badgeSize, badgeSize, 12, ACCENT, "F");
  const numStr = String(idx + 1).padStart(2, "0");
  doc.setFont(FONT, "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  const numW = doc.getTextWidth(numStr);
  doc.text(numStr, margin + (badgeSize - numW) / 2, y + badgeSize * 0.68);

  // Kicker + título — título con wrap completo (no limitado a 2 líneas).
  const titleX = margin + badgeSize + 16;
  draw.text(`GUIÓN ${idx + 1} DE ${total}`, titleX, y + 16, {
    size: 9, bold: true, color: GREY,
  });
  const titleText = slot.title || "Sin título";
  doc.setFont(FONT, "bold");
  doc.setFontSize(18);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const titleLines = doc.splitTextToSize(titleText, contentW - badgeSize - 16);
  const titleBaseline = y + 38;
  const titleLH = 22;
  for (let i = 0; i < titleLines.length && i < 3; i++) {
    doc.text(titleLines[i], titleX, titleBaseline + i * titleLH);
  }
  const titleHeight = Math.max(badgeSize, 16 + (Math.min(titleLines.length, 3) * titleLH) + 8);
  y += titleHeight + 8;

  // Nomenclatura auto (si hay)
  const creativoStr = slot.creative_number
    ? `Creativo #${String(slot.creative_number).padStart(3, "0")}`
    : "Creativo";
  const stage = (slot.stage || "").toUpperCase();
  const format = slot.format === "static" ? "ESTÁTICO" : "VIDEO";
  draw.text(
    [creativoStr, format, stage].filter(Boolean).join(" · "),
    margin, y + 12,
    { size: 10, bold: true, color: ACCENT },
  );
  y += 28;

  // Card de contexto — chips con Concepto / Ángulo / UGC (omitimos vacíos).
  // El "producto" real vive en company_voice_profile.products — no acá.
  // Lo que en despliegue_concepts llamamos "concepto" es el ÁNGULO CREATIVO,
  // no el SKU que se vende.
  const angleFirst = (slot.angle || "").split(/[,.|·—]/)[0].trim();
  const ugcName = slot._ugc?.name || "";
  const conceptoName = slot._concept?.name || slot.concept_name || "";
  const chipsData = [];
  if (conceptoName) chipsData.push(["Concepto", conceptoName]);
  if (angleFirst) chipsData.push(["Ángulo", angleFirst]);
  if (ugcName) chipsData.push([slot.format === "static" ? "Diseñador" : "UGC", ugcName]);

  if (chipsData.length > 0) {
    let cx = margin;
    let chipsY = y;
    for (const [k, v] of chipsData) {
      // maxW más generoso — muchos chips quedaban cortando nombres cortos.
      const { width, height } = chip(draw, `${k}:`, v, cx, chipsY, { maxW: 450 });
      cx += width + 8;
      if (cx > pageW - margin - 120) {
        cx = margin;
        chipsY += height + 6;
      }
    }
    y = chipsY + 38;
  } else {
    y += 8;
  }

  // Links (referencia + loom brief) como cards CLICKEABLES — doc.link crea
  // una zona que al clickear en el PDF abre el URL en el browser del lector.
  const linkH = 46;
  const linkGap = 10;
  const linkW = (contentW - linkGap) / 2;
  const drawLinkCard = (x, label, url, accent) => {
    draw.roundRect(x, y, linkW, linkH, 10, CARD, "F");
    draw.fillRect(x, y, 3, linkH, accent);
    draw.text(label.toUpperCase(), x + 12, y + 15, {
      size: 8.5, bold: true, color: GREY,
    });
    if (url) {
      // Dominio como preview legible en vez del URL largo. Sin caracteres
      // unicode raros — Helvetica embebida en jsPDF solo soporta latin-1.
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* dejamos crudo */ }
      const displayHost = host.length > 42 ? host.slice(0, 41) + "..." : host;
      draw.text(`Abrir ${displayHost}`, x + 12, y + 34, {
        size: 11, bold: true, color: accent,
      });
      // Toda la card es un enlace clickeable.
      doc.link(x, y, linkW, linkH, { url });
    } else {
      draw.text("(sin link)", x + 12, y + 34, {
        size: 10.5, color: GREY_SOFT,
      });
    }
  };
  drawLinkCard(margin, "Link de Referencia", slot.reference_url || "", ACCENT);
  drawLinkCard(margin + linkW + linkGap, "Link de Loom (brief)", slot.loom_review_url || "", [212, 169, 59]); // dorado
  y += linkH + 24;

  // Divider
  draw.line(margin, y, pageW - margin, y, LINE, 0.7);
  y += 18;

  // Guión parseado
  const parts = parseScript(slot.script_body);

  // Hooks
  y = sectionHeading(draw, "Hooks", margin, y, contentW) + 4;
  if (parts.hooks.length === 0) {
    draw.text("(sin hooks)", margin + 10, y + 10, { size: 10.5, color: GREY_SOFT });
    y += 24;
  } else {
    parts.hooks.forEach((h, i) => {
      const bulletNum = String(i + 1).padStart(2, "0");
      draw.text(bulletNum, margin + 8, y + 10, { size: 9, bold: true, color: ACCENT });
      const newY = draw.paragraph(h, margin + 32, y, contentW - 40, { size: 11, color: INK });
      y = Math.max(newY, y + 22) + 6;
      if (y > pageH - 120) { doc.addPage(); draw.fillPage(WARM); y = margin; }
    });
    y += 6;
  }

  // Body — saltamos la sección entera si está vacía (antes dejaba header + "(sin body)").
  if (parts.body) {
    if (y > pageH - 140) { doc.addPage(); draw.fillPage(WARM); y = margin; }
    y = sectionHeading(draw, "Body", margin, y, contentW) + 4;
    const bodyStart = y - 2;
    // Paragraph con page-break automático por línea.
    const bodyLines = doc.splitTextToSize(parts.body, contentW - 24);
    doc.setFont(FONT, "normal");
    doc.setFontSize(11);
    doc.setTextColor(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
    const lh = 11 * 1.55;
    let barStart = bodyStart;
    for (const line of bodyLines) {
      if (y + lh > pageH - 60) {
        // Cerramos la barra accent antes del page break.
        draw.fillRect(margin, barStart, 3, y - barStart, ACCENT);
        doc.addPage();
        draw.fillPage(WARM);
        y = margin;
        barStart = y;
      }
      doc.text(line, margin + 18, y + 11 * 0.9);
      y += lh;
    }
    draw.fillRect(margin, barStart, 3, y - barStart - 4, ACCENT);
    y += 14;
  }

  // CTA — también se omite si está vacío.
  if (parts.cta) {
    if (y > pageH - 120) { doc.addPage(); draw.fillPage(WARM); y = margin; }
    y = sectionHeading(draw, "CTA", margin, y, contentW) + 4;
    // Card con fondo verde claro. Calculamos altura según el texto.
    const ctaLines = doc.splitTextToSize(parts.cta, contentW - 28);
    const lh = 11.5 * 1.5;
    const ctaH = Math.max(48, ctaLines.length * lh + 18);
    if (y + ctaH > pageH - 60) { doc.addPage(); draw.fillPage(WARM); y = margin; }
    draw.roundRect(margin, y, contentW, ctaH, 10, ACCENT_SOFT, "F");
    doc.setFont(FONT, "normal");
    doc.setFontSize(11.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    for (let i = 0; i < ctaLines.length; i++) {
      doc.text(ctaLines[i], margin + 14, y + 16 + i * lh);
    }
    y += ctaH + 10;
  }
}

// ─── Footer paginado ──────────────────────────────────────────────────────
function drawFooter(doc, opts) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.5);
    doc.line(54, pageH - 36, pageW - 54, pageH - 36);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text(opts.companyName || "—", 54, pageH - 20);
    doc.text(`Entrega #${opts.batchNumber || "001"}`, pageW / 2, pageH - 20, { align: "center" });
    doc.text(`${p} / ${total}`, pageW - 54, pageH - 20, { align: "right" });
  }
}

// ─── Generador principal ──────────────────────────────────────────────────
export async function generateScriptsPdf(slots, opts = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const draw = createDraw(doc);

  const batchNumber = (opts.batchNumber || "").toString().padStart(3, "0") || "001";
  const ctx = { ...opts, batchNumber };

  drawCover(draw, doc, ctx, slots.length);

  slots.forEach((slot, idx) => {
    doc.addPage();
    // recreate draw para nueva página (las dimensiones no cambian pero para consistencia)
    drawScriptPage(draw, doc, slot, idx, slots.length, ctx);
  });

  drawFooter(doc, ctx);

  // Filename: "#008 - Masc Col - 2026-04-21.pdf"
  const dateStr = new Date().toISOString().slice(0, 10);
  const empresaName = (opts.companyName || "Inforce").trim();
  const filename = `#${batchNumber} - ${empresaName} - ${dateStr}.pdf`;
  doc.save(filename);
}
