import { useEffect, useRef, useState } from 'react';
import { date, request, safeHref } from './workspaceHelpers.js';

const labels = { primera_observacion: 'Primera observación', nuevo_destacado: 'Nuevo destacado', en_ascenso: 'En ascenso',
  pierde_posiciones: 'Pierde posiciones', retoma_posiciones: 'Retoma posiciones', posicion_sostenida: 'Posición sostenida', sin_cambio_destacado: 'Sin cambio destacado' };
export function SignalsPanel({ companyId, brandId, revision }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current; setData(null); setError('');
    if (!brandId) { setLoading(false); return; }
    setLoading(true);
    request('GET', { action: 'signals', companyId, brandId }).then(value => { if (generation.current === id) setData(value); })
      .catch(cause => { if (generation.current === id) setError(cause.message); })
      .finally(() => { if (generation.current === id) setLoading(false); });
    return () => { generation.current = id + 1; };
  }, [companyId, brandId, revision]);
  async function more() {
    const id = generation.current; setLoading(true); setError('');
    try {
      const value = await request('GET', { action: 'signals', companyId, brandId, offset: data.nextOffset });
      if (id === generation.current) setData(old => value.observedAt === old.observedAt ? { ...value, ads: [...old.ads, ...value.ads] } : value);
    } catch (cause) { if (id === generation.current) setError(cause.message); }
    finally { if (id === generation.current) setLoading(false); }
  }
  return <section className="adlib-signals" aria-label="Señales de creativos">
    <div className="adlib-view-intro"><h2>Señales de creativos</h2><p>Un indicador de 0 a 100 para comparar anuncios de esta marca: posición observada, cambios diarios y antigüedad publicada. Ayuda a elegir qué investigar; no mide ventas ni rentabilidad.</p></div>
    <details className="adlib-signal-method"><summary>Cómo se calcula</summary><p>65 % posición relativa, 20 % cambio desde el día observado anterior y 15 % impulso de anuncios recientes. Cuando falta historial o fecha de inicio, se usan solo los componentes disponibles. Meta debe recibir el pedido de ordenar por impresiones; no obtenemos sus cifras de impresiones.</p><p>Usamos consultas completas de anuncios activos, con el mismo país y orden comprobado en la solicitud. Una consulta parcial, un bloqueo o un anuncio ausente no se convierten en una caída. Una posición alta puede orientar una revisión, pero no demuestra que el anuncio sea ganador.</p></details>
    {error && <p role="alert" className="adlib-error">{error}</p>}
    {!brandId ? <div className="adlib-empty"><h3>Elige una marca para comparar sus anuncios</h3><p>El indicador se calcula dentro de cada marca.</p></div> : data && !data.ads.length ? <div className="adlib-empty"><h3>Estamos reuniendo observaciones comparables</h3><p>Necesitamos una consulta completa de al menos cinco anuncios activos y comprobar el orden solicitado a Meta. El historial comenzará desde esa primera consulta; los anuncios guardados siguen en Biblioteca.</p></div> : data && <>
      <p className="adlib-caption">Última observación: {date(data.observedAt)} · {data.total} anuncios · {data.days} días observados · País: {data.country === 'ALL' ? 'Todos' : data.country}</p>
      {data.stale && <p className="adlib-notice">Esta comparación lleva más de dos días sin actualizarse. Conservamos la última evidencia disponible.</p>}
      <div className="adlib-signal-list">{data.ads.map(ad => <article key={ad.source_ad_id} className="adlib-signal-row">
        <div className="adlib-signal-score"><strong>{ad.score}</strong><span>/ 100</span></div>
        <div className="adlib-signal-content"><h3>{labels[ad.state]}</h3><p>{ad.body?.slice(0, 220) || ad.title || `Anuncio ${ad.source_ad_id}`}</p>
          <p className="adlib-caption">Posición {Number(ad.position.toFixed(1))} de {ad.total} · {ad.ageDays === null ? 'Inicio no disponible' : `${ad.ageDays} días desde su inicio`} · {ad.observedDays} días observados{ad.delta !== null ? ` · ${ad.delta > 0 ? '+' : ''}${ad.delta} puntos de posición relativa` : ''}</p>
          <details><summary>Ver evolución diaria</summary><div className="adlib-signal-history"><table><caption>Comparaciones disponibles, sin rellenar días faltantes</caption><thead><tr><th>Fecha</th><th>Posición</th><th>Posición relativa</th></tr></thead><tbody>{ad.history.map(point => <tr key={point.date}><td>{date(point.date)}</td><td>{point.position} / {point.total}</td><td>{point.percentile} / 100</td></tr>)}</tbody></table></div></details>
        </div>
        {safeHref(ad.source_url) && <a href={safeHref(ad.source_url)} target="_blank" rel="noopener noreferrer">Ver anuncio ↗</a>}
      </article>)}</div>
      {data.nextOffset !== null && <button className="adlib-more" disabled={loading} onClick={more}>Cargar más señales</button>}
    </>}
    {loading && <p role="status">Consultando señales…</p>}
  </section>;
}
