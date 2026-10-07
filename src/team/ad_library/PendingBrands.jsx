import { useEffect, useRef, useState } from 'react';
import { request, safeHref } from './workspaceHelpers.js';

export function PendingBrands({ companyId, revision, canManage, onReady, recentRequest }) {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const previous = useRef(null), mounted = useRef(true), callback = useRef(onReady), lock = useRef(false);
  callback.current = onReady;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false, timer;
    const poll = async () => {
      try {
        const data = await request('GET', { action: 'brand-requests', companyId });
        if (cancelled) return;
        if (previous.current?.some(id => !data.requests.some(row => row.id === id))) callback.current();
        previous.current = data.requests.map(row => row.id); setRows(data.requests); setLoadedRevision(revision); setError('');
      } catch { if (!cancelled) setError('Estamos actualizando el estado de tus solicitudes.'); }
      if (!cancelled) timer = setTimeout(poll, 15000);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [companyId, revision]);
  async function act(row, pageId) {
    if (lock.current) return;
    lock.current = true; setBusy(row.id); setError('');
    try {
      const data = await request('POST', { action: pageId ? 'select-brand-request' : 'cancel-brand-request', companyId, requestId: row.id, ...(pageId ? { pageId } : {}) });
      if (mounted.current) { setRows(current => current.filter(item => item.id !== row.id)); callback.current(data.brandId); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { lock.current = false; if (mounted.current) setBusy(''); }
  }
  const visible = recentRequest && !['ready', 'cancelled'].includes(recentRequest.status) && loadedRevision !== revision
    ? [recentRequest, ...rows.filter(row => row.id !== recentRequest.id)] : rows;
  if (!visible.length && !error) return null;
  return <section className="adlib-pending" aria-label="Marcas en preparación">
    <div><h2>Preparando tus bibliotecas</h2><p>Los enlaces están guardados. Puedes cerrar esta página o seguir otras marcas; sus anuncios aparecerán cuando estén disponibles.</p></div>
    {error && <p role="status">{error}</p>}
    {visible.map(row => <article key={row.id}>
      <div className="adlib-pending-heading"><div><strong>{new URL(row.url).hostname.replace(/^www\./, '')}</strong><small>{row.url}</small></div><span>{row.status === 'needs_selection' ? 'Elige su fanpage' : row.status === 'resolving' ? 'Identificando marca' : 'En espera'}</span>
        {canManage && <button className="adlib-text-button" disabled={!!busy} onClick={() => act(row)} aria-label={`Cancelar seguimiento pendiente de ${new URL(row.url).hostname}`}>Cancelar</button>}</div>
      {row.status === 'needs_selection' && <div className="adlib-identity-results"><p>Encontramos varias fanpages. Elige cuál pertenece a la marca:</p>{row.candidates.map(candidate => <div key={candidate.pageId}>
        <strong>{candidate.name}</strong>{safeHref(candidate.fanpageUrl) && <a href={safeHref(candidate.fanpageUrl)} target="_blank" rel="noopener noreferrer">Ver fanpage ↗</a>}
        {canManage && <button disabled={!!busy} onClick={() => act(row, candidate.pageId)}>Seguir esta fanpage</button>}
      </div>)}</div>}
    </article>)}
  </section>;
}
