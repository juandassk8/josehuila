import { useEffect, useState } from 'react';
import { NICHES_LIST } from '../lib/niches.js';
import { ETIQUETAS, mostrar } from '../estandar/datos.js';
import { deleteBrandDocument, loadUniverse, saveBrandDocument, saveVoice } from './data.js';
import { initials, publicUrl, routeFor } from './model.js';
import { Icon, Loading, Modal, Notice } from './ui.jsx';
import { BrandEditor, DocumentEditor, ProductEditor, ProductPhoto } from './universe/Editors.jsx';
import { contextFields, documentText, ensureProductIds, productReadiness, voiceFields } from './universe/model.js';
import './universe/universe.css';

const tabs = [['perfil', 'Perfil de marca', 'orbit'], ['productos', 'Productos', 'box'], ['voz', 'Voz de marca', 'voice'], ['documentos', 'Documentos', 'document']];
function date(value) { const parsed = new Date(value); return value && !Number.isNaN(parsed.valueOf()) ? parsed.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : null; }
function profileText(row) { try { return mostrar(row.campo, row.valor, row.no_lo_se); } catch { return 'Dato pendiente de revisión'; } }
function Empty({ icon, title, children }) { return <div className="nf-empty"><Icon name={icon} size={34} /><h3>{title}</h3><p>{children}</p></div>; }
function ConfirmRemove({ document, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title="Quitar documento de la marca" onClose={onClose} busy={busy}><div className="nf-editor"><p>Se quitará «{document.title}» del conocimiento de esta empresa. Los documentos de otros productos y empresas se conservan.</p>{error && <Notice error>{error}</Notice>}<footer className="nf-editor-footer"><button className="nf-button nf-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="nf-button nf-primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }}>{busy ? 'Quitando…' : 'Quitar documento'}</button></footer></div></Modal>;
}
export default function Universe({ company, canEdit, link }) {
  const [state, setState] = useState({ data: null, error: '' });
  const [revision, setRevision] = useState(0), [tab, setTab] = useState('perfil'), [editor, setEditor] = useState(null), [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    let active = true;
    setState({ data: null, error: '' });
    const timer = setTimeout(() => { if (active) setState({ data: null, error: 'La carga está tardando demasiado. Reintenta para consultar tu marca.' }); }, 15000);
    loadUniverse(company.id).then(data => { if (active) setState({ data, error: '' }); })
      .catch(() => { if (active) setState({ data: null, error: 'No pudimos cargar el perfil de esta marca. Tus datos guardados siguen disponibles; vuelve a intentarlo.' }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [company.id, revision]);
  const reload = () => { setNotice(''); setRevision(value => value + 1); };
  const { voice, profile = [], documents = [] } = state.data || {};
  const context = voice?.brand_context || {};
  const products = Array.isArray(voice?.products) ? voice.products : [];
  const visibleProducts = products.map((product, index) => ({ product, index })).filter(({ product }) => `${product.name || ''} ${product.what || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const niche = NICHES_LIST.find(row => row.key === voice?.niche)?.label || voice?.niche;
  const web = publicUrl(profile.find(row => row.campo === 'web_url')?.valor);
  const profileRows = profile.filter(row => ['tipo_marca', 'instagram', 'marca_nombre', 'contacto_nombre', 'productos_principales', 'categorias_detalle'].includes(row.campo));
  const voiceCount = voiceFields.filter(([key]) => String(voice?.[key] || '').trim()).length;
  async function save(patch) {
    const saved = await saveVoice(company.id, voice, patch);
    setState(current => ({ ...current, data: { ...current.data, voice: saved } }));
    setEditor(null); setNotice('Cambios guardados en tu marca.');
  }
  async function saveProduct(product) {
    const next = editor.index == null ? [...products, product] : products.map((row, index) => index === editor.index ? product : row);
    await save({ products: ensureProductIds(next) });
  }
  async function saveDocument(values) {
    const saved = await saveBrandDocument(company.id, editor.document, values);
    setState(current => ({ ...current, data: { ...current.data, documents: editor.document?.id ? current.data.documents.map(doc => doc.id === saved.id ? saved : doc) : [saved, ...current.data.documents] } }));
    setEditor(null); setNotice('Documento guardado en el conocimiento de tu marca.');
  }
  async function removeDocument() {
    await deleteBrandDocument(company.id, editor.document);
    setState(current => ({ ...current, data: { ...current.data, documents: current.data.documents.filter(doc => doc.id !== editor.document.id) } }));
    setEditor(null); setNotice('Documento retirado de esta marca.');
  }
  return <div className="nf-universe">
    <header className="nf-page-heading"><div><p className="nf-eyebrow">El punto de partida</p><h1>Universo de marca</h1><p>Todo lo que hace única a tu marca, en un solo lugar.</p></div><button className="nf-icon-button nf-bordered" aria-label="Actualizar perfil de marca" onClick={reload} disabled={!!editor || (!state.data && !state.error)}><Icon name="refresh" /></button></header>
    {notice && <Notice>{notice}</Notice>}
    {state.error ? <Notice error retry={reload}>{state.error}</Notice> : !state.data ? <Loading text="Cargando la información de tu marca…" /> : <>
      <section className="nf-brand-hero nf-surface"><div className="nf-brand-identity"><span className="nf-brand-avatar">{initials(company.name)}</span><div><span className="nf-brand-caption">Tu marca</span><h2>{company.name}</h2><div className="nf-brand-links"><span>{niche || 'Nicho por definir'}</span>{web && <a href={web} target="_blank" rel="noreferrer">{new URL(web).hostname.replace(/^www\./, '')}<Icon name="external" size={14} /></a>}</div></div></div>
        <div className="nf-brand-facts"><div><strong>{products.length}</strong><span>Productos</span></div><div><strong>{documents.length}</strong><span>Documentos</span></div><div><strong>{voiceCount}<small>/4</small></strong><span>Campos de voz</span></div></div>
        <div className="nf-brand-hero-foot"><span><Icon name="orbit" size={16} />El contexto que acompaña tus próximos creativos.</span>{canEdit && <button className="nf-text-button" onClick={() => setEditor({ type: 'context' })}>Editar marca<Icon name="arrow" size={16} /></button>}</div>
      </section>
      <nav className="nf-tabs" aria-label="Secciones del universo de marca">{tabs.map(([id, label, icon]) => <button key={id} onClick={() => { setTab(id); setNotice(''); }} aria-current={tab === id ? 'page' : undefined}><Icon name={icon} size={17} />{label}</button>)}</nav>
      {tab === 'perfil' && <div className="nf-profile-layout"><section className="nf-panel nf-surface"><div className="nf-section-heading"><div><h2>La esencia de tu marca</h2><p>Una base compartida para todo tu equipo.</p></div>{canEdit && <button className="nf-icon-button nf-bordered" aria-label="Editar contexto de marca" onClick={() => setEditor({ type: 'context' })}><Icon name="edit" size={18} /></button>}</div>
        <dl className="nf-profile-details">{contextFields.map(([key, title]) => <div key={key}><dt>{title}</dt><dd className={!context[key] ? 'nf-muted' : ''}>{context[key] || 'Por definir'}</dd></div>)}</dl>
        {(web || profileRows.length > 0) && <details className="nf-original-profile"><summary>Información compartida anteriormente</summary><dl className="nf-profile-details">{web && <div><dt>Sitio web</dt><dd><a href={web} target="_blank" rel="noreferrer">{new URL(web).hostname}<Icon name="external" size={14} /></a></dd></div>}{profileRows.map(row => <div key={row.campo}><dt>{ETIQUETAS[row.campo]}</dt><dd>{profileText(row)}</dd></div>)}</dl></details>}
      </section><aside className="nf-context-column"><section className="nf-context-note"><p className="nf-eyebrow">Prepara tu contexto</p><h2>De la marca<br />a la próxima idea.</h2><p>Completa tus productos, reúne su material y define una voz que todo el equipo pueda seguir.</p><div className="nf-context-checklist">{[['productos', 'Catálogo de productos', products.length > 0], ['voz', 'Voz de marca', voiceCount === 4], ['documentos', 'Documentos de respaldo', documents.length > 0]].map(([id, label, ready]) => <button key={id} onClick={() => setTab(id)}><Icon name={ready ? 'check' : 'plus'} size={16} /><span>{label}</span><Icon name="arrow" size={15} /></button>)}</div></section><a className="nf-library-entry nf-surface" {...link(routeFor('biblioteca', company.id))}><Icon name="library" size={24} /><div><h3>Encuentra tu próxima referencia</h3><p>Explora los anuncios de las marcas que sigues.</p></div><Icon name="arrow" /></a></aside></div>}
      {tab === 'productos' && <section><div className="nf-section-heading"><div><h2>Tus productos <span className="nf-count">{products.length}</span></h2><p>Lo que vendes, a quién le sirve y cómo se ve.</p></div>{canEdit && <button className="nf-button nf-primary" onClick={() => setEditor({ type: 'product', product: {} })}><Icon name="plus" size={17} />Agregar producto</button>}</div>
        {products.length > 0 && <label className="nf-field nf-product-search">Buscar en tus productos<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o descripción" /></label>}
        {!products.length ? <div className="nf-surface"><Empty icon="box" title="Tu catálogo empieza aquí">Agrega la información de tu primer producto para construir el contexto de tu marca.</Empty></div> : !visibleProducts.length ? <Empty icon="box" title="No encontramos ese producto">Prueba otro nombre o borra la búsqueda.</Empty> : <div className="nf-product-grid">{visibleProducts.map(({ product, index }) => { const ready = productReadiness(product); return <article className="nf-product-card nf-surface" key={product.id || index}><div className="nf-product-cover"><ProductPhoto key={product.images?.[0]?.id || 'empty'} photo={product.images?.[0]} companyId={company.id} name={product.name} /></div><div className="nf-product-top"><span className="nf-product-price">{product.price || 'Precio por definir'}</span><small>{ready.complete}/{ready.total} datos básicos</small></div><h3>{product.name || 'Producto sin nombre'}</h3><p>{product.what || product.benefits || product.benefit || product.promise || product.context || 'Completa la información de este producto.'}</p>{product.offer && <span className="nf-product-offer">Oferta guardada</span>}<button className="nf-text-button" onClick={() => setEditor({ type: 'product', product, index })}>{canEdit ? 'Ver y editar producto' : 'Ver producto'}<Icon name="arrow" size={16} /></button></article>; })}</div>}
      </section>}
      {tab === 'voz' && <section><div className="nf-section-heading"><div><h2>Así suena tu marca</h2><p>Una voz coherente en cada mensaje.</p></div>{canEdit && <button className="nf-button nf-primary" onClick={() => setEditor({ type: 'voice' })}><Icon name="edit" size={17} />Editar voz</button>}</div><div className="nf-voice-list">{voiceFields.map(([key, label, hint]) => <section className="nf-voice-row" key={key}><h3>{label}</h3><div><p className={voice?.[key] ? '' : 'nf-muted'}>{voice?.[key] || 'Todavía no definido.'}</p><small>{hint}</small></div></section>)}</div></section>}
      {tab === 'documentos' && <section><div className="nf-section-heading"><div><h2>Conocimiento de marca <span className="nf-count">{documents.length}</span></h2><p>Manuales, investigaciones e información que ayudan a crear.</p></div>{canEdit && <button className="nf-button nf-primary" onClick={() => setEditor({ type: 'document' })}><Icon name="plus" size={17} />Agregar documento</button>}</div><div className="nf-panel nf-surface">{!documents.length ? <Empty icon="document" title="Reúne el conocimiento de tu marca">Agrega un documento o pega su contenido para compartirlo con tu equipo.</Empty> : documents.map(doc => <details key={doc.id} className="nf-document"><summary><Icon name="document" /><span><strong>{doc.title || 'Documento sin título'}</strong><small>{date(doc.created_at) || 'Fecha no disponible'}</small></span><Icon name="chevron" /></summary><div className="nf-document-content">{documentText(doc) || 'Este documento no tiene contenido de texto disponible.'}</div>{canEdit && <div className="nf-document-actions"><button className="nf-text-button" onClick={() => setEditor({ type: 'document', document: doc })}><Icon name="edit" size={16} />Editar documento</button><button className="nf-text-button" onClick={() => setEditor({ type: 'remove-document', document: doc })}>Quitar documento</button></div>}</details>)}</div></section>}
      <p className="nf-data-note">{voice?.updated_at ? `Perfil actualizado el ${date(voice.updated_at)}.` : 'La información se comparte con tu espacio actual de Inforce.'}</p>
      {editor?.type === 'product' && <ProductEditor product={editor.product} niche={voice?.niche} companyId={company.id} canEdit={canEdit} onSave={saveProduct} onClose={() => setEditor(null)} />}
      {['context', 'voice'].includes(editor?.type) && <BrandEditor type={editor.type} voice={voice} onSave={save} onClose={() => setEditor(null)} />}
      {editor?.type === 'document' && <DocumentEditor document={editor.document} onSave={saveDocument} onClose={() => setEditor(null)} />}
      {editor?.type === 'remove-document' && <ConfirmRemove document={editor.document} onConfirm={removeDocument} onClose={() => setEditor(null)} />}
    </>}
  </div>;
}
