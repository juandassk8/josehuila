import { useCallback, useEffect, useState } from 'react';
import { creativeRequest } from './client.js';
import './creativeImages.css';

export function CreativeImagesPage({ fixedCompanyId }) {
  const [companies, setCompanies] = useState([]), [selected, setSelected] = useState('');
  const companyId = fixedCompanyId || selected;
  const [data, setData] = useState({ images: [], connections: [] });
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    creativeRequest('companies', {}, { signal: controller.signal }).then(result => {
      setCompanies(result.companies); setSelected(result.companies[0]?.id || ''); setUrl(result.mcp_url);
      if (!result.companies.length) setLoading(false);
    }).catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, []);
  const load = useCallback(async signal => {
    if (!companyId) return;
    const result = await creativeRequest('list', { companyId }, { signal });
    if (!signal?.aborted) { setData(result); setUrl(result.mcp_url); setError(''); }
  }, [companyId]);
  useEffect(() => {
    const controller = new AbortController();
    setData({ images: [], connections: [] }); setLoading(true); setNotice('');
    if (!companyId) return () => controller.abort();
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(controller.signal).catch(() => {});
    }, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [companyId, load]);
  async function refresh() {
    setBusy(true);
    try { await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await creativeRequest('disconnect', { companyId }, { method: 'POST' }); await load(); setNotice('Tu conexión con esta empresa quedó revocada.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice('Enlace del conector copiado.'); }
    catch { setNotice('Selecciona el enlace del conector y cópialo.'); }
  }
  return <section className="creative-images ci-page">
    <header className="ci-heading"><div><h1>Crear imágenes</h1><p>De una referencia guardada a una pieza para tu producto.</p></div>
      {!fixedCompanyId && <label>Empresa<select value={selected} onChange={e => setSelected(e.target.value)} disabled={!companies.length || busy}>
        {!companies.length && <option value="">Sin empresas disponibles</option>}
        {companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}
      </select></label>}
    </header>
    {error && <p className="ci-error" role="alert">{error}</p>}
    {notice && <p className="ci-notice" role="status">{notice}</p>}
    <div className="ci-workbench"><section className="ci-panel ci-guide">
      <div className="ci-panel-title"><h2>Crear desde ChatGPT</h2><span className="ci-tag">Prueba MCP</span></div>
      <p>Usa tu propia cuenta de ChatGPT. Esta prueba comprueba la lectura de referencias y el regreso de archivos a Inforce.</p>
      <ol className="ci-steps"><li><strong>Guarda una referencia</strong><p>Elige un anuncio de imagen en Bibliotecas de anuncios y guárdalo en esta empresa.</p></li>
        <li><strong>Conecta Inforce en ChatGPT</strong><p>Añade el conector desde el modo desarrollador, usa OAuth y autoriza esta empresa. La disponibilidad depende de tu cuenta.</p></li>
        <li><strong>Crea y devuelve la imagen</strong><p>Selecciona el producto, adjunta su foto y pide una versión de la referencia. Después pide guardar el archivo en Inforce.</p></li></ol>
      <label>URL del conector<div className="ci-copy"><input readOnly value={url} aria-label="URL del conector MCP" placeholder="Disponible al activar el conector" /><button onClick={copy} disabled={!url}>Copiar</button></div></label>
      <p className="ci-caption">Si ChatGPT no entrega la imagen directamente, adjunta el archivo generado al chat y pide guardarlo. La generación nativa todavía debe validarse con tu cuenta.</p>
      <div className="ci-actions"><a className="ci-primary" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Abrir ChatGPT ↗</a>
        {!!data.connections.length && <button onClick={disconnect} disabled={busy}>Desconectar mi cuenta</button>}</div>
      <p className="ci-caption">{data.connections.length ? 'Tienes una conexión autorizada para esta empresa.' : 'Aún no has autorizado una conexión para esta empresa.'}</p>
    </section><section className="ci-results" aria-busy={loading}>
      <div className="ci-panel-title"><h2>Imágenes recibidas</h2><button disabled={!companyId || busy || loading} onClick={refresh}>{busy ? 'Actualizando…' : 'Actualizar'}</button></div>
      {loading ? <div className="ci-empty" role="status">Cargando imágenes…</div> : data.images.length ? <div className="ci-grid">
        {data.images.map(item => <article className="ci-image" key={item.id}><a href={item.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${item.title}`}><img src={item.url} alt={item.title} loading="lazy" /></a>
          <div><h3>{item.title}</h3><p>{item.product_name}</p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('es-CO')}</time></div></article>)}
      </div> : <div className="ci-empty"><h3>Tu primera pieza empieza con una referencia</h3><p>Las imágenes que guardes desde ChatGPT aparecerán aquí, asociadas al producto y a esta empresa.</p></div>}
    </section></div>
  </section>;
}
