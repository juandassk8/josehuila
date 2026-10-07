import { useEffect, useRef, useState } from 'react';
import { NICHES_LIST, questionsForNiche } from '../../lib/niches.js';
import { Icon, Modal, Notice } from '../ui.jsx';
import { publicUrl } from '../model.js';
import { contextFields, documentText, photoUrl, voiceFields } from './model.js';
import { preparePhoto, readDocument, uploadPhoto } from './files.js';

function Field({ field, value, onChange, readOnly = false, multiline = true }) {
  const [key, label, hint] = field;
  return <label className="nf-field">{label}{multiline
    ? <textarea name={key} value={value || ''} onChange={event => onChange(key, event.target.value)} rows={3} maxLength={12000} readOnly={readOnly} />
    : <input name={key} value={value || ''} onChange={event => onChange(key, event.target.value)} maxLength={key === 'name' ? 240 : 2000} readOnly={readOnly} />}
  {hint && <small>{hint}</small>}</label>;
}
function Footer({ busy, onClose, label = 'Guardar cambios', readOnly = false }) {
  return <footer className="nf-editor-footer"><button type="button" className="nf-button nf-secondary" onClick={onClose} disabled={busy}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>{!readOnly && <button type="submit" className="nf-button nf-primary" disabled={busy}>{busy ? 'Guardando…' : label}</button>}</footer>;
}

export function BrandEditor({ voice, onSave, onClose, type }) {
  const [draft, setDraft] = useState(type === 'voice' ? voice || {} : { ...voice?.brand_context, niche: voice?.niche || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const patch = type === 'voice' ? Object.fromEntries(voiceFields.map(([key]) => [key, String(draft[key] || '').trim()]))
        : { niche: draft.niche, brand_context: { ...voice?.brand_context, ...Object.fromEntries(contextFields.map(([key]) => [key, String(draft[key] || '').trim()])) } };
      await onSave(patch);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Modal title={type === 'voice' ? 'La voz de tu marca' : 'El contexto de tu marca'} onClose={onClose} busy={busy}><form className="nf-editor" onSubmit={submit} aria-busy={busy}>
    {type !== 'voice' && <fieldset className="nf-niche-options"><legend>Nicho de la marca</legend><p>Usaremos este contexto en las fichas de tus productos.</p><div>{[...NICHES_LIST, ...(draft.niche && !NICHES_LIST.some(row => row.key === draft.niche) ? [{ key: draft.niche, label: draft.niche }] : [])].map(row => <label key={row.key}><input type="radio" name="niche" value={row.key} checked={draft.niche === row.key} onChange={() => change('niche', row.key)} disabled={busy} /><span>{row.label}</span></label>)}</div></fieldset>}
    {(type === 'voice' ? voiceFields : contextFields).map(field => <Field key={field[0]} field={field} value={draft[field[0]]} onChange={change} readOnly={busy} />)}
    {error && <Notice error>{error}</Notice>}<Footer busy={busy} onClose={onClose} />
  </form></Modal>;
}

export function DocumentEditor({ document = {}, onSave, onClose }) {
  const [title, setTitle] = useState(document.title || ''), [content, setContent] = useState(documentText(document));
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState('');
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setReading(true); setError('');
    try { const text = await readDocument(file); setContent(text); if (!title) setTitle(file.name); } catch (cause) { setError(cause.message); } finally { setReading(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || reading) return;
    setBusy(true); setError('');
    try { await onSave({ title, content }); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Modal title={document.id ? 'Edita tu documento' : 'Agrega conocimiento de marca'} onClose={onClose} busy={busy || reading}><form className="nf-editor" onSubmit={submit}>
    <label className="nf-upload-field">Importar texto de un archivo<input type="file" accept=".pdf,.docx,.txt,.md" onChange={importFile} disabled={busy || reading} /><small>{reading ? 'Leyendo documento…' : 'PDF, DOCX, TXT o MD · hasta 10 MB. Puedes revisar el texto antes de guardarlo. Se conserva el texto, no el archivo original.'}</small></label>
    <label className="nf-field">Título<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={240} readOnly={busy} /></label>
    <label className="nf-field">Contenido<textarea rows={12} value={content} onChange={event => setContent(event.target.value)} required maxLength={200000} readOnly={busy || reading} /><small>Pega aquí tu manual, investigación o información de marca. No se genera contenido con IA.</small></label>
    {error && <Notice error>{error}</Notice>}<Footer busy={busy || reading} onClose={onClose} label="Guardar documento" />
  </form></Modal>;
}

export function ProductEditor({ product, niche, companyId, canEdit, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...product, id: product.id || crypto.randomUUID() }));
  const [section, setSection] = useState('ficha'), [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState('');
  const previews = useRef([]), uploaded = useRef(new Map());
  useEffect(() => () => previews.current.forEach(url => URL.revokeObjectURL(url)), []);
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const images = Array.isArray(draft.images) ? draft.images : [], documents = Array.isArray(draft.documents) ? draft.documents : [];
  const blocked = !canEdit || busy || reading;
  const questions = questionsForNiche(niche || 'otro').filter(q => !['price', 'avatar', 'what', 'benefits'].includes(q.key));
  async function addPhotos(event) {
    const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
    if (images.length + files.length > 12) { setError('Puedes guardar hasta 12 fotos por producto.'); return; }
    setReading(true); setError('');
    try {
      const next = [];
      for (const file of files) { const photo = await preparePhoto(file); previews.current.push(photo.preview); next.push(photo); }
      change('images', [...images, ...next]);
    } catch (cause) { setError(cause.message); } finally { setReading(false); }
  }
  async function addDocuments(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (documents.length >= 20) { setError('Puedes guardar hasta 20 documentos por producto.'); return; }
    setReading(true); setError('');
    try { const content = await readDocument(file); change('documents', [...documents, { id: crypto.randomUUID(), name: file.name, content }]); } catch (cause) { setError(cause.message); } finally { setReading(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (blocked) return;
    if (!draft.name?.trim()) { setSection('ficha'); setError('Escribe el nombre del producto.'); return; }
    if (draft.purchase_url?.trim() && !publicUrl(draft.purchase_url)) { setSection('oferta'); setError('Escribe un enlace válido del producto, por ejemplo https://tumarca.com/producto.'); return; }
    setBusy(true); setError('');
    try {
      const savedPhotos = [];
      for (const image of images) {
        let saved = uploaded.current.get(image.id);
        if (!saved) { saved = await uploadPhoto(companyId, image); uploaded.current.set(image.id, saved); }
        savedPhotos.push({ ...saved, alt: image.alt });
      }
      await onSave({ ...draft, name: draft.name.trim(), images: savedPhotos });
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Modal title={product.name || 'Un nuevo producto'} onClose={onClose} busy={busy || reading}><form className="nf-editor nf-product-editor" onSubmit={submit} aria-busy={busy || reading}>
    <nav className="nf-editor-sections" aria-label="Secciones del producto">{[['ficha', 'Ficha'], ['oferta', 'Precio y oferta'], ['fotos', `Fotos · ${images.length}`], ['documentos', `Documentos · ${documents.length}`]].map(([key, label]) => <button type="button" key={key} aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)} disabled={busy || reading}>{label}</button>)}</nav>
    {section === 'ficha' && <><Field field={['name', 'Nombre del producto']} value={draft.name} onChange={change} multiline={false} readOnly={blocked} /><Field field={['what', 'Qué es y para qué sirve']} value={draft.what} onChange={change} readOnly={blocked} />{(!questions.some(q => ['benefit', 'promise'].includes(q.key)) || draft.benefits) && <Field field={['benefits', questions.some(q => ['benefit', 'promise'].includes(q.key)) ? 'Beneficios adicionales' : 'Beneficios principales', 'Describe beneficios concretos que puedas respaldar.']} value={draft.benefits} onChange={change} readOnly={blocked} />}<Field field={['avatar', 'A quién va dirigido', 'Necesidades y perfil de las personas que lo compran.']} value={draft.avatar} onChange={change} readOnly={blocked} />
      {questions.map(q => <Field key={q.key} field={[q.key, q.label]} value={draft[q.key]} onChange={change} readOnly={blocked} multiline={!!q.multiline} />)}<Field field={['context', 'Contexto adicional']} value={draft.context} onChange={change} readOnly={blocked} />
    </>}
    {section === 'oferta' && <><Field field={['price', 'Precio', 'Incluye la moneda. Por ejemplo: $90.000 COP.']} value={draft.price} onChange={change} readOnly={blocked} multiline={false} /><Field field={['offer', 'Oferta o promoción', 'Qué incluye, condiciones, fechas y restricciones.']} value={draft.offer} onChange={change} readOnly={blocked} /><Field field={['purchase_url', 'Enlace del producto', 'La página donde una persona puede conocerlo o comprarlo.']} value={draft.purchase_url} onChange={change} readOnly={blocked} multiline={false} /></>}
    {section === 'fotos' && <>{canEdit && <label className="nf-upload-field">Agregar fotos del producto<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={blocked} /><small>JPG, PNG o WebP · máximo 8 MB por foto y 12 fotos. Agrega distintos ángulos, detalles y fotos de uso. Se guardan al guardar el producto.</small></label>}{!images.length && <p className="nf-muted">Todavía no hay fotos de este producto.</p>}<div className="nf-photo-grid">{images.map((photo, index) => <figure key={photo.id || index}><ProductPhoto photo={photo} companyId={companyId} /><label className="nf-field">Descripción de la foto<input value={photo.alt || ''} maxLength={240} readOnly={blocked} onChange={event => change('images', images.map((row, i) => i === index ? { ...row, alt: event.target.value } : row))} placeholder="Ej. Vista frontal del empaque" /></label><div className="nf-photo-actions"><span>{index === 0 ? 'Portada' : `Foto ${index + 1}`}</span>{canEdit && <>{index > 0 && <button type="button" className="nf-text-button" disabled={blocked} onClick={() => change('images', [photo, ...images.filter((_, i) => i !== index)])}>Usar de portada</button>}<button type="button" className="nf-icon-button" disabled={blocked} aria-label={`Quitar foto ${index + 1}`} onClick={() => change('images', images.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button></>}</div></figure>)}</div></>}
    {section === 'documentos' && <>{canEdit && <label className="nf-upload-field">Importar ficha o documento<input type="file" accept=".pdf,.docx,.txt,.md" onChange={addDocuments} disabled={blocked} /><small>PDF, DOCX, TXT o MD · hasta 10 MB. Se guarda el texto extraído, no el archivo original.</small></label>}{reading && <p role="status">Leyendo archivo…</p>}{!documents.length && <p className="nf-muted">Agrega fichas técnicas, instrucciones o información de respaldo.</p>}{documents.map((doc, index) => <details key={doc.id || index} className="nf-document-content"><summary>{doc.name || 'Documento'}</summary><p>{doc.content || 'Sin contenido de texto.'}</p>{canEdit && <button type="button" className="nf-text-button" disabled={blocked} onClick={() => change('documents', documents.filter((_, i) => i !== index))}>Quitar del producto</button>}</details>)}{(draft.info_brief || draft.info_doc_text) && <details className="nf-document-content"><summary>Ficha guardada anteriormente</summary><p>{draft.info_brief || draft.info_doc_text}</p></details>}</>}
    {error && <Notice error>{error}</Notice>}<Footer busy={busy || reading} onClose={onClose} label="Guardar producto" readOnly={!canEdit} />
  </form></Modal>;
}

export function ProductPhoto({ photo, companyId, name = '' }) {
  const [failed, setFailed] = useState(false);
  const url = photo?.preview || photoUrl(photo, companyId);
  return url && !failed ? <img src={url} alt={photo.alt || name || 'Foto del producto'} loading="lazy" onError={() => setFailed(true)} /> : <span className="nf-photo-placeholder"><Icon name="box" size={32} /><span>{failed ? 'Foto no disponible' : 'Agrega fotos del producto'}</span></span>;
}
