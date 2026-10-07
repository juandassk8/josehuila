import { date, number, safeHref } from './workspaceHelpers.js';

export function BrandNetworkPanel({ network, brandId, family, onFamily, onPage, onDomain }) {
  if (!network) return <p role="status">Buscando relaciones entre fanpages y destinos…</p>;
  const scope = family ? new Set(family.brandIds) : brandId ? new Set([brandId]) : null;
  const domains = network.domains.map(item => ({ ...item, fanpages: item.fanpages.filter(page => !scope || scope.has(page.brandId)) })).filter(item => item.fanpages.length);
  const families = network.families.filter(item => !scope || item.brandIds.some(id => scope.has(id)));
  return <section className="adlib-network" aria-label="Fanpages y dominios">
    <div className="adlib-view-intro"><h2>Fanpages y dominios</h2><p>Relaciones comprobadas en anuncios o enlaces publicados por una fanpage. Puedes ver qué páginas envían a cada dominio y abrir la evidencia.</p></div>
    {network.truncated && <p role="status" className="adlib-notice">Hay más relaciones de las que podemos mostrar en esta vista. Las agrupaciones automáticas están suspendidas hasta poder revisar el conjunto completo.</p>}
    {!!families.length && <div className="adlib-network-families" aria-label="Agrupaciones automáticas">{families.map(item => <button key={item.id} aria-pressed={family?.id === item.id} onClick={() => onFamily(item.id)}>
      <strong>{item.name}</strong><span>{item.brandIds.length} {item.brandIds.length === 1 ? 'fanpage' : 'fanpages'} · {item.domains.length} {item.domains.length === 1 ? 'dominio' : 'dominios'}</span><small>Ver agrupación →</small>
    </button>)}</div>}
    <p className="adlib-caption">Una fanpage vinculada a un único dominio conserva su biblioteca individual si ninguna otra fanpage comparte ese destino. Los nombres parecidos y las extensiones no crean relaciones. El historial de vínculos se conserva aunque cambien los anuncios.</p>
    {domains.map(item => <article className="adlib-domain" key={item.domain}>
      <header><div><h3>{item.domain}</h3><p>{item.fanpages.length} {item.fanpages.length === 1 ? 'fanpage observada' : 'fanpages observadas'}{item.shared && ' · Destino compartido: no agrupa marcas'}</p></div>
        <button className="adlib-text-button" onClick={() => onDomain(item.domain)}>Ver anuncios vinculados →</button></header>
      <div className="adlib-domain-table"><table><thead><tr><th>Fanpage</th><th>Vínculo comprobado</th><th>Primera observación</th><th>Última observación</th><th>Evidencia</th></tr></thead>
        <tbody>{item.fanpages.map(page => <tr key={page.brandId}>
          <td><button className="adlib-text-button" onClick={() => onPage(page.brandId)}>{page.name}</button><small>ID {page.pageId}</small></td>
          <td>{page.adCount > 0 && <span>{number(page.adCount)} {page.adCount === 1 ? 'anuncio' : 'anuncios'}</span>}{page.profileLinked && <small>Enlace publicado por la fanpage</small>}</td>
          <td>{date(page.firstObserved)}</td><td>{date(page.lastObserved)}</td>
          <td>{safeHref(page.sourceUrl) && <a href={safeHref(page.sourceUrl)} target="_blank" rel="noopener noreferrer">{page.sourceUrl.includes('/ads/library/') ? 'Ver anuncio' : 'Ver fanpage'} ↗</a>}{safeHref(page.exampleUrl) && <a href={safeHref(page.exampleUrl)} target="_blank" rel="noopener noreferrer">Ver destino ↗</a>}</td>
        </tr>)}</tbody></table></div>
    </article>)}
    {!domains.length && <div className="adlib-empty"><h3>Aún no hay vínculos comprobados</h3><p>Los destinos aparecerán aquí cuando una consulta encuentre anuncios o enlaces publicados por esta fanpage.</p></div>}
  </section>;
}
