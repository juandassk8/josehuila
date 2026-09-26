// Extrae texto plano de archivos subidos (PDF, DOCX, XLSX, CSV, TXT, MD).
// Todas las libs pesadas se cargan con dynamic import: sólo se descargan
// cuando el usuario efectivamente sube un archivo de ese tipo.

const MAX_CHARS = 200_000;

export async function extractFileText(file) {
  if (!file) throw new Error("No file provided");
  const name = (file.name || "").toLowerCase();
  const ext = name.slice(name.lastIndexOf(".") + 1);

  let text = "";
  if (ext === "pdf") text = await extractPdf(file);
  else if (ext === "docx") text = await extractDocx(file);
  else if (ext === "xlsx" || ext === "xls") text = await extractXlsx(file);
  else if (ext === "csv" || ext === "txt" || ext === "md") text = await file.text();
  else throw new Error(`Formato no soportado: .${ext}. Usá PDF, DOCX, XLSX, CSV, TXT o MD.`);

  text = (text || "").trim();
  if (!text) throw new Error("No se pudo extraer texto del archivo (puede estar vacío o ser un escaneo).");
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + `\n\n[…truncado — archivo muy largo, se tomaron los primeros ${MAX_CHARS.toLocaleString()} caracteres]`;
  }
  return text;
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  // Worker servido como módulo — Vite lo copia al bundle automáticamente.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}

async function extractDocx(file) {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}

async function extractXlsx(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) sheets.push(`--- Hoja: ${sheetName} ---\n${csv}`);
  }
  return sheets.join("\n\n");
}
