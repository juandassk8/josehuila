import { useEffect, useRef, useState } from 'react';
import { date, number, request, safeHref, share, formatName, statusName } from './workspaceHelpers.js';

const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  rank: 'M5 20V11 M12 20V4 M19 20V8',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
  link: 'M9 15l6-6 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  hook: 'M5 6h14v11H9l-4 4z M9 10h6 M9 13h4',
  save: 'M6 3h12v18l-6-4-6 4z',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  close: 'M6 6l12 12 M6 18L18 6',
  refresh: 'M20 10a8 8 0 1 0-2 8 M20 4v6h-6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
};
export function Icon({ name, ...props }) { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.grid} /></svg>; }

export function Creative({ ad, compact = false }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const video = useRef(null);
  const assets = ad.media || [], asset = assets[Math.min(index, assets.length - 1)];
  if (!asset) return <div className="adlib-media adlib-media-empty">{ad.media_error ? 'Creativo pendiente de descarga' : 'El creativo todavía no está disponible'}</div>;
  return <>
    <div className="adlib-media">
      {asset.kind === 'video' ? <><video ref={video} key={asset.url} controls={started} playsInline preload="none" poster={asset.poster || undefined} src={asset.url} onPlay={() => { setPlaying(true); setStarted(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} aria-label={`Video de ${ad.page_name || 'anuncio'}`} />{!playing && <button className="adlib-play" aria-label="Reproducir video" onClick={() => video.current?.play().catch(() => setPlaying(false))}><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 4l13 8-13 8z" /></svg></button>}</>
        : <img src={asset.url} alt={`Creativo de ${ad.page_name || 'anuncio'}`} loading="lazy" />}
    </div>
    {assets.length > 1 && <div className="adlib-variants" aria-label="Archivos del anuncio">{assets.map((item, i) => <button key={i} className={i === index ? 'active' : ''} onClick={() => { setIndex(i); setPlaying(false); setStarted(false); }} aria-pressed={i === index}>{i + 1} · {item.kind === 'video' ? 'Video' : 'Imagen'}</button>)}</div>}
    {!compact && asset.duration && <p className="adlib-caption">Video · {Math.round(asset.duration)} s{asset.width ? ` · ${asset.width} × ${asset.height}` : ''}</p>}
  </>;
}

export function AdCard({ ad, onOpen, onSave, saving, rank }) {
  return <article className="adlib-ad">
    <header className="adlib-ad-top"><span className="adlib-avatar" aria-hidden="true">{(ad.page_name || 'M').slice(0, 1)}</span>
      <strong title={ad.page_name}>{ad.page_name || 'Anunciante'}</strong>
      <button className={`adlib-icon ${ad.saved ? 'selected' : ''}`} disabled={saving} onClick={() => onSave(ad)} aria-label={ad.saved ? 'Quitar de mis guardados' : 'Guardar anuncio'} aria-pressed={!!ad.saved}><Icon name="save" /></button></header>
    <div className="adlib-ad-status"><span className={`adlib-dot ${ad.status}`} />{statusName(ad.status)}<span>{number(ad.running_days)} d{!ad.source_start_at ? ' observados' : ''}</span></div>
    {rank && <div className="adlib-rank"><Icon name="rank" />{String(rank).padStart(2, '0')}<span>por duración observada</span></div>}
    <Creative ad={ad} compact />
    <div className="adlib-ad-content"><p>{ad.body || ad.title || ad.caption || 'Sin copy disponible'}</p>
      <button className="adlib-detail-button" onClick={() => onOpen(ad)}>Ver detalle{ad.media?.length > 1 && ` · ${ad.media.length} archivos`}<Icon name="arrow" /></button></div>
  </article>;
}

export function AdCardSkeletons({ count = 8 }) {
  return <div className="adlib-cards adlib-skeletons" role="status" aria-label="Cargando anuncios…">
    {Array.from({ length: count }, (_, i) => <div key={i} className="adlib-ad adlib-skeleton" aria-hidden="true">
      <div className="adlib-ad-top"><span className="adlib-avatar" /><span className="adlib-skeleton-line" style={{ width: '55%' }} /></div>
      <div className="adlib-ad-status"><span className="adlib-skeleton-line" style={{ width: '35%' }} /></div>
      <div className="adlib-media" />
      <div className="adlib-ad-content"><span className="adlib-skeleton-line" /><span className="adlib-skeleton-line" style={{ width: '70%' }} /><span className="adlib-skeleton-line button" /></div>
    </div>)}
  </div>;
}

export function AdDetail({ ad, companyId, onClose, onSave, saving }) {
  const dialog = useRef(null);
  const [history, setHistory] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    request('GET', { action: 'history', companyId, adId: ad.id })
      .then(result => { if (!cancelled) setHistory(result.versions || []); })
      .catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [ad.id, companyId]);
  return <dialog className="adlib-dialog" ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="adlib-detail-title">
    <div className="adlib-dialog-header"><div><p className="adlib-eyebrow">Detalle del anuncio</p><h2 id="adlib-detail-title">{ad.page_name || 'Anunciante'}</h2></div><button autoFocus className="adlib-icon" onClick={onClose} aria-label="Cerrar detalle"><Icon name="close" /></button></div>
    <div className="adlib-detail-grid"><div><Creative ad={ad} /></div><div className="adlib-detail-copy">
      <div className="adlib-detail-status"><span className={`adlib-dot ${ad.status}`} />{statusName(ad.status)} · {number(ad.running_days)} días{!ad.source_start_at ? ' observados' : ''}</div>
      <h3>{ad.title || 'Copy del anuncio'}</h3><p className="adlib-full-copy">{ad.body || ad.caption || 'Sin texto disponible'}</p>
      {ad.cta && <span className="adlib-cta">{ad.cta}</span>}
      <dl className="adlib-facts"><div><dt>Inicio en Meta</dt><dd>{date(ad.source_start_at)}</dd></div><div><dt>Primera observación</dt><dd>{date(ad.first_seen)}</dd></div><div><dt>Última observación</dt><dd>{date(ad.last_seen)}</dd></div><div><dt>ID del anuncio</dt><dd>{ad.source_ad_id}</dd></div></dl>
      <p className="adlib-caption">La duración llega hasta la última observación. Una pausa entre consultas puede no ser visible.</p>
      <div className="adlib-detail-actions"><a href={safeHref(ad.source_url)} target="_blank" rel="noopener noreferrer">Abrir en Meta ↗</a>{safeHref(ad.landing_url) && <a href={safeHref(ad.landing_url)} target="_blank" rel="noopener noreferrer">Página de destino ↗</a>}
        <button onClick={() => onSave(ad)} disabled={saving}><Icon name="save" />{ad.saved ? 'Quitar de guardados' : 'Guardar anuncio'}</button></div>
      <details className="adlib-history"><summary>Historial de versiones{history ? ` · ${history.length}` : ''}</summary><p className="adlib-caption">Cambios registrados desde que empezamos a observar este anuncio. Hasta 50 versiones recientes.</p>
        {error && <p role="alert">{error}</p>}{!history && !error && <p>Cargando historial…</p>}
        {history?.map(version => <article key={version.id}><strong>{date(version.captured_at)}</strong><span>{statusName(version.status)}</span><p>{version.body || version.title || 'Sin copy'}</p></article>)}
      </details>
    </div></div>
  </dialog>;
}

export function Overview({ insights, onGroup, onTab }) {
  if (!insights) return <div className="adlib-overview-loading" role="status">Calculando analítica del catálogo…</div>;
  const total = insights.total || 0;
  return <div className="adlib-overview">
    <section className="adlib-mix"><div className="adlib-panel-heading"><h3>Mezcla de formatos</h3><Icon name="grid" /></div><div className="adlib-total"><strong>{number(total)}</strong><span>anuncios en esta selección</span></div>
      <div className="adlib-mix-bar" aria-hidden="true">{insights.formats.map((format, i) => <span key={format.name} className={`tone-${i % 4}`} style={{ width: `${share(format.total, total)}%` }} />)}</div>
      <div className="adlib-format-list">{insights.formats.map((format, i) => <div key={format.name}><span className={`adlib-swatch tone-${i % 4}`} />{formatName(format.name)}<strong>{number(format.total)}</strong><span>{Math.round(share(format.total, total))}%</span></div>)}</div>
      {!total && <p className="adlib-caption">Todavía no hay datos para estos filtros.</p>}
    </section>
    <section><div className="adlib-panel-heading"><h3>Destinos más usados</h3><Icon name="link" /></div><div className="adlib-top-list">{insights.destinations.slice(0, 4).map(item => <button key={item.value} onClick={() => onGroup('landing', item)} title={item.value}><span>{item.value.replace(/^https?:\/\//, '')}</span><strong>{number(item.total)}</strong></button>)}{!insights.destinations.length && <p className="adlib-caption">Sin páginas de destino disponibles.</p>}</div><button className="adlib-text-button" onClick={() => onTab('destinations')}>Explorar destinos <Icon name="arrow" /></button></section>
    <section><div className="adlib-panel-heading"><h3>Aperturas con más duración</h3><Icon name="hook" /></div><div className="adlib-top-list hooks">{insights.hooks.slice(0, 3).map(item => <button key={item.value} onClick={() => onGroup('hook', item)}><span>{item.value}</span><strong>{number(item.days)} d</strong></button>)}{!insights.hooks.length && <p className="adlib-caption">Sin copy disponible.</p>}</div><button className="adlib-text-button" onClick={() => onTab('hooks')}>Explorar ganchos del copy <Icon name="arrow" /></button></section>
  </div>;
}
