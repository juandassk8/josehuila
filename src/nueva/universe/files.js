import { database } from '../../lib/backend.js';

export async function readDocument(file) {
  if (!file || !/\.(pdf|docx|txt|md)$/i.test(file.name)) throw new Error('Selecciona un documento PDF, DOCX, TXT o MD.');
  if (file.size > 10 * 1048576) throw new Error('El documento debe pesar máximo 10 MB.');
  let text;
  if (/\.pdf$/i.test(file.name)) {
    // Bundle as .js: the VPS serves raw .mjs assets as application/octet-stream.
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?worker&url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const document = await loadingTask.promise;
      text = '';
      for (let page = 1; page <= document.numPages && text.length <= 200000; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n\n';
      }
      if (!text.trim()) throw new Error('El PDF no tiene texto extraíble. Pega su contenido manualmente.');
    } finally { await loadingTask.destroy(); }
  } else {
    const { extractFileText } = await import('../../workspace/guiones/extractFileText.js');
    text = await extractFileText(file);
  }
  return text.length > 200000 ? text.slice(0, 199850) + '\n\n[Documento extenso: se importaron los primeros 199.850 caracteres.]' : text;
}
export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
  if (file.size > 8 * 1048576) throw new Error('Cada foto debe pesar máximo 8 MB.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('La imagen es demasiado grande. Usa una foto de menos de 40 megapíxeles.'); }
  bitmap.close();
  return { id: crypto.randomUUID(), name: file.name, alt: '', file, preview: URL.createObjectURL(file) };
}
export async function uploadPhoto(companyId, photo, client = database) {
  if (!photo.file) return photo;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.file.type];
  const path = `${companyId}/${photo.id}.${extension}`;
  const { error } = await client.storage.from('company-assets').upload(path, photo.file, { contentType: photo.file.type });
  if (error) throw new Error(error.message || 'No pudimos guardar la foto.');
  return { id: photo.id, name: photo.name, alt: photo.alt, path };
}
