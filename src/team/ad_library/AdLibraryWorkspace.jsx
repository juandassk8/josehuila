import { useCallback, useEffect, useRef, useState } from 'react';
import { DS } from '../../lib/design.js';
import { AdCard, AdDetail, Icon, Overview } from './workspaceUi.jsx';
import { date, number, request, safeHref } from './workspaceHelpers.js';
import { collectionCopy, collectionNotice } from './collectionState.js';
import { useCollectionStatus } from './useCollectionStatus.js';
import { FollowBrand } from './FollowBrand.jsx';
import { PendingBrands } from './PendingBrands.jsx';
import { SignalsPanel } from './SignalsPanel.jsx';
import { BrandNetworkPanel } from './BrandNetworkPanel.jsx';
import { PageAvatar } from './PageAvatar.jsx';
import './adLibrary.css';

const tabs = [ ['library', 'Biblioteca', 'grid'], ['signals', 'Señales', 'rank'], ['rank', 'Duración', 'rank'], ['launches', 'Lanzamientos', 'calendar'],
  ['destinations', 'Destinos', 'link'], ['network', 'Fanpages y dominios', 'link'], ['hooks', 'Ganchos del copy', 'hook'], ['saved', 'Mis guardados', 'save'] ];
const descriptions = {
  rank: 'Anuncios ordenados por duración hasta la última observación. La continuidad es una señal para investigar, no una medida de ventas.',
  launches: 'Anuncios agrupados por fecha de inicio en Meta (UTC). Si no está disponible, usamos la primera observación. Coincidir en una fecha no confirma una prueba A/B.',
  destinations: 'Rutas de destino agrupadas sin parámetros ni fragmentos. Abre cada grupo para revisar sus anuncios y enlaces completos.',
  hooks: 'Primeras líneas del copy, hasta 220 caracteres. Los ganchos hablados del video requieren transcripción y aún no se incluyen.',
  saved: 'Tu selección personal dentro de esta empresa. Puedes volver a consultar el creativo y su historial aquí.',
};

export function AdLibraryPage({ currentMember, companies = [], fixedCompanyId, canManage: manageOverride }) {
  const [companyId, setCompanyId] = useState(fixedCompanyId || '');
  const [brands, setBrands] = useState([]), [brandId, setBrandId] = useState('');
  const [network, setNetwork] = useState(null), [familyId, setFamilyId] = useState('');
  const [sourceRetryAt, setSourceRetryAt] = useState(null);
  const [tab, setTab] = useState('library'), [status, setStatus] = useState('active');
  const [format, setFormat] = useState('all'), [sort, setSort] = useState('newest');
  const [input, setInput] = useState(''), [search, setSearch] = useState(''), [group, setGroup] = useState(null);
  const [ads, setAds] = useState([]), [insights, setInsights] = useState(null), [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [showFollow, setShowFollow] = useState(false);
  const [requestRevision, setRequestRevision] = useState(0), [recentRequest, setRecentRequest] = useState(null);
  const [busy, setBusy] = useState(''), [saving, setSaving] = useState(''), [detail, setDetail] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const requestId = useRef(0), scope = useRef(companyId), pendingMedia = useRef(false);
  const canManage = manageOverride ?? ['admin', 'member'].includes(currentMember?.role);
  const selected = brands.find(brand => brand.id === brandId);
  const pageIds = new Map(brands.map(brand => [brand.id, brand.meta_page_id]));
  const selectedFamily = network?.families.find(family => family.brandIds.includes(familyId));
  const pageFamily = network?.families.find(family => family.brandIds.includes(brandId));
  const networkLastSeen = network?.domains.flatMap(item => item.fanpages)
    .filter(page => selectedFamily ? selectedFamily.brandIds.includes(page.brandId) : !brandId || page.brandId === brandId)
    .reduce((latest, page) => Date.parse(page.lastObserved) > Date.parse(latest || '1970-01-01') ? page.lastObserved : latest, null);
  const lastObserved = insights?.lastSeen || networkLastSeen;
  const effectiveSort = tab === 'rank' ? 'longest' : sort;
  const refreshResults = useCallback((changed = true) => {
    if (changed || pendingMedia.current) setRevision(value => value + 1);
  }, []);
  const collection = useCollectionStatus(companyId, brandId, collectionRefresh, refreshResults);
  const importMessage = collectionCopy(collection);
  const firstImport = !!selected && !selected.last_complete_scan_at && !collection?.hasCompleteScan;
  const showImportEmpty = firstImport && !loading && !ads.length && !insights?.total && !error;
  useEffect(() => { pendingMedia.current = ads.some(ad => !ad.media_error && ad.media_content_hash !== ad.content_hash); }, [ads]);

  useEffect(() => {
    if (fixedCompanyId) setCompanyId(fixedCompanyId);
    else if (!companies.some(company => company.id === companyId)) setCompanyId(companies[0]?.id || '');
  }, [companies, companyId, fixedCompanyId]);
  useEffect(() => {
    scope.current = companyId; setBrands([]); setNetwork(null); setFamilyId(''); setDetail(null); setBrandId(''); setGroup(null); setError(''); setRecentRequest(null);
  }, [companyId]);
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setGroup(null); }, 300); return () => clearTimeout(timer); }, [input]);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    request('GET', { action: 'brands', companyId }).then(result => {
      if (!cancelled) {
        setBrands(result.brands || []); setNetwork(result.network || null); setSourceRetryAt(result.sourceRetryAt);
        setFamilyId(current => result.network?.families.some(family => family.brandIds.includes(current)) ? current : '');
      }
    }).catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [companyId, revision]);

  const filters = useCallback(() => ({ companyId, status, format, search, sort: effectiveSort, saved: String(tab === 'saved'), ...(familyId ? { familyId } : brandId ? { brandId } : {}) }), [companyId, status, format, search, effectiveSort, tab, brandId, familyId]);
  useEffect(() => {
    let cancelled = false;
    setInsights(null);
    if (!companyId || tab === 'network') return;
    request('GET', { action: 'insights', ...filters() }).then(result => { if (!cancelled) setInsights(result); })
      .catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [companyId, filters, revision, tab]);

  const loadAds = useCallback(async (next = null) => {
    const id = ++requestId.current;
    if (!companyId || tab === 'network') { setAds([]); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await request('GET', { action: 'ads', ...filters(), ...(next ? { cursor: next } : {}), ...(group ? { groupType: group.type, groupValue: group.value } : {}) });
      if (id !== requestId.current) return;
      setAds(current => next ? [...current, ...result.ads] : result.ads); setCursor(result.nextCursor);
    } catch (cause) { if (id === requestId.current) setError(cause.message); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [companyId, filters, group, tab]);
  const invalidate = useCallback(() => { requestId.current++; }, []);
  useEffect(() => { setAds([]); setCursor(null); setError(''); loadAds(); return invalidate; }, [loadAds, revision, invalidate]);

  function changeTab(value) { setTab(value); setGroup(null); setDetail(null); if (value === 'saved') setStatus('all'); }
  function selectPage(id) { setBrandId(id); setFamilyId(''); setGroup(null); setDetail(null); }
  function selectFamily(id) { setFamilyId(id); setBrandId(''); setGroup(null); setDetail(null); }
  function openDomain(domain) { setTab('library'); setGroup({ type: 'domain', value: domain }); setStatus('all'); }
  function openGroup(type, item) { setGroup({ type, ...item }); }
  async function save(ad) {
    const currentScope = companyId;
    setSaving(ad.id); setNotice('');
    try {
      const result = await request('POST', { action: 'save', companyId, adId: ad.id, saved: !ad.saved });
      if (scope.current !== currentScope) return;
      setAds(current => current.map(item => item.id === ad.id ? { ...item, saved: result.saved } : item));
      setDetail(current => current?.id === ad.id ? { ...current, saved: result.saved } : current);
      setNotice(result.saved ? 'Anuncio guardado en tu selección.' : 'Anuncio retirado de tus guardados.');
      if (tab === 'saved') setRevision(value => value + 1);
    } catch (cause) { if (scope.current === currentScope) setError(cause.message); }
    finally { setSaving(''); }
  }
  function requestSaved(result) {
    setRecentRequest(result.request); setRequestRevision(value => value + 1); setShowFollow(false);
    setNotice('Enlace guardado. Prepararemos su biblioteca en segundo plano. Puedes seguir agregando marcas.');
    if (result.request.status === 'ready') requestReady(result.request.brandId);
  }
  function requestReady(id) {
    if (id) selectPage(id);
    setRevision(value => value + 1); setCollectionRefresh(value => value + 1);
  }
  async function changeFollow(action) {
    if (!selected) return;
    const currentScope = companyId; setBusy(action); setError('');
    try {
      const result = await request('POST', { action, companyId, brandId });
      if (scope.current !== currentScope) return;
      if (action === 'pause') { setBrandId(''); setGroup(null); }
      setNotice(action === 'sync' ? collectionNotice(result) : 'Has dejado de seguir esta marca.');
      setCollectionRefresh(value => value + 1);
      setRevision(value => value + 1);
    } catch (cause) { if (scope.current === currentScope) setError(cause.message); }
    finally { setBusy(''); }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setNotice('Copy copiado.'); } catch { setError('No se pudo copiar. Puedes seleccionar el texto manualmente.'); }
  }
  const groups = tab === 'launches' ? insights?.launches : tab === 'destinations' ? insights?.destinations : tab === 'hooks' ? insights?.hooks : null;
  const groupType = tab === 'launches' ? 'launch' : tab === 'destinations' ? 'landing' : 'hook';
  const showCards = !['launches', 'destinations', 'hooks'].includes(tab) || !!group;
  return <div className="adlib" style={{ '--adlib-card': DS.bgCard, '--adlib-surface': DS.bgSide, '--adlib-border': DS.border,
    '--adlib-text': DS.textPrimary, '--adlib-muted': DS.textSecondary, '--adlib-accent': DS.blue, '--adlib-success': DS.green, '--adlib-danger': DS.red, '--adlib-font': DS.font }}>
    <header className="adlib-heading"><div><p className="adlib-eyebrow">Creativos / Inteligencia competitiva</p><h1>Bibliotecas de anuncios</h1></div>
      <div className="adlib-heading-actions">{!fixedCompanyId && <label className="adlib-company"><span>Empresa</span><select value={companyId} onChange={event => setCompanyId(event.target.value)}>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        {canManage && <button className="adlib-primary" onClick={() => setShowFollow(value => !value)} aria-expanded={showFollow}>+ Seguir marca</button>}</div></header>
    {showFollow && canManage && <FollowBrand key={`follow-${companyId}`} companyId={companyId} onSaved={requestSaved} />}
    <PendingBrands key={`pending-${companyId}`} companyId={companyId} revision={requestRevision} canManage={canManage} onReady={requestReady} recentRequest={recentRequest} />
    {error && <div className="adlib-error" role="alert">{error}</div>}{notice && <div className="adlib-notice" role="status">{notice}<button className="adlib-icon" onClick={() => setNotice('')} aria-label="Cerrar aviso"><Icon name="close" /></button></div>}
    <div className="adlib-workspace">
      <div className="adlib-brandbar"><div className="adlib-brand-selector"><PageAvatar pageId={selected?.meta_page_id} name={selectedFamily?.name || selected?.display_name} large /><label><span>{brands.length} fanpages seguidas{network?.families.length > 0 && ` · ${network.families.length} ${network.families.length === 1 ? 'agrupación' : 'agrupaciones'}`}</span><select aria-label="Marca" value={familyId ? `family:${selectedFamily?.id || familyId}` : brandId} onChange={event => { const value = event.target.value; if (value.startsWith('family:')) selectFamily(value.slice(7)); else selectPage(value); }}><option value="">Todas las marcas</option>{!!network?.families.length && <optgroup label="Marcas agrupadas">{network.families.map(family => <option key={family.id} value={`family:${family.id}`}>{family.name} · {family.brandIds.length} fanpages · {family.domains.length} dominios</option>)}</optgroup>}<optgroup label="Fanpages individuales">{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.display_name}</option>)}</optgroup></select></label></div>
        <div className="adlib-freshness"><span>Meta Ads Library</span><small>{selected && collection?.phase !== 'ready' ? importMessage.title : lastObserved ? `Última observación: ${date(lastObserved)}` : selected?.last_complete_scan_at ? `Última consulta: ${date(selected.last_complete_scan_at)}` : 'Esperando primera observación'}</small></div>
        <div className="adlib-brand-actions"><button className="adlib-icon" aria-label="Actualizar resultados" title="Actualizar resultados" disabled={loading} onClick={() => { refreshResults(); setCollectionRefresh(value => value + 1); }}><Icon name="refresh" /></button>{canManage && selected && <details><summary>Gestionar marca</summary><div><button disabled={!!busy} onClick={() => changeFollow('sync')}>Solicitar actualización</button><button disabled={!!busy} onClick={() => changeFollow('pause')}>Dejar de seguir</button></div></details>}</div></div>
      {selected && collection && (collection.phase !== 'ready' || collection.stale) ? <div className="adlib-source-status" role="status" data-collection-phase={collection.phase}><strong>{importMessage.title}. </strong>{importMessage.description}{collection.stale && ' No se pudo actualizar el estado; volveremos a comprobarlo.'}</div>
        : !selected && sourceRetryAt && Date.parse(sourceRetryAt) > Date.now() && <div className="adlib-source-status" role="status">Las bibliotecas se están preparando en segundo plano. Puedes seguir consultando los anuncios guardados.</div>}
      {(selectedFamily || pageFamily) && <div className="adlib-family-notice"><p>{selectedFamily ? `Agrupación por destinos comprobados: ${selectedFamily.brandIds.length} fanpages y ${selectedFamily.domains.length} dominios. Cada fanpage conserva su historial.` : 'Esta fanpage tiene vínculos comprobados con una agrupación.'}</p><button className="adlib-text-button" onClick={() => { if (!selectedFamily) selectFamily(pageFamily.id); changeTab('network'); }}>Ver fanpages y vínculos →</button></div>}
      <nav className="adlib-tabs" aria-label="Vistas de la biblioteca">{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}><Icon name={icon} />{label}</button>)}</nav>
      {!['signals', 'network'].includes(tab) && <div className="adlib-toolbar"><label className="adlib-search"><Icon name="search" /><input type="search" aria-label="Buscar anuncios" placeholder="Buscar en el copy o la marca…" maxLength={120} value={input} onChange={event => setInput(event.target.value)} /></label>
        <div className="adlib-filters" aria-label="Estado del anuncio">{[['active', 'Activos'], ['historical', 'Históricos'], ['all', 'Todos']].map(([value, label]) => <button key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setGroup(null); }}>{label}</button>)}</div>
        <select aria-label="Formato" value={format} onChange={event => { setFormat(event.target.value); setGroup(null); }}><option value="all">Todos los formatos</option><option value="video">Videos</option><option value="image">Imágenes</option></select>
        <select aria-label="Orden" value={effectiveSort} disabled={tab === 'rank'} onChange={event => setSort(event.target.value)}><option value="newest">Recién encontrados</option><option value="longest">Mayor duración</option></select></div>}
      <main className="adlib-results" aria-busy={loading}>
        {tab === 'network' ? <BrandNetworkPanel network={network} brandId={brandId} family={selectedFamily} onFamily={selectFamily} onPage={selectPage} onDomain={openDomain} /> : tab === 'signals' ? <><SignalsPanel companyId={companyId} brandId={brandId} revision={revision} />{selectedFamily && <p className="adlib-caption">Para ver señales, elige una fanpage individual. Las posiciones de distintas fanpages no se mezclan.</p>}</> : <>
        {tab === 'library' && !group && (!firstImport || insights?.total > 0) && <Overview insights={insights} onGroup={openGroup} onTab={changeTab} />}
        {descriptions[tab] && <div className="adlib-view-intro"><h2>{tabs.find(([id]) => id === tab)?.[1]}</h2><p>{descriptions[tab]}</p></div>}
        {tab === 'rank' && insights && <div className="adlib-ranking-summary"><div><strong>{number(insights.total)}</strong><span>anuncios en la selección</span></div><div><strong>{number(insights.active)}</strong><span>activos al observarlos</span></div><div><strong>{number(insights.longRunning)}</strong><span>activos con 30 días o más</span></div></div>}
        {groups && <div className="adlib-groups">{groups.map(item => <section className={`adlib-group ${group?.value === item.value ? 'selected' : ''}`} key={item.value}>
          <button className="adlib-group-main" onClick={() => setGroup(group?.value === item.value ? null : { type: groupType, ...item })} aria-expanded={group?.value === item.value}><Icon name={tab === 'launches' ? 'calendar' : tab === 'destinations' ? 'link' : 'hook'} /><span>{tab === 'launches' ? date(item.value) : tab === 'destinations' ? item.value.replace(/^https?:\/\//, '') : item.value}</span><small>{tab === 'launches' ? `${item.active}/${item.total} activos` : `${item.total} anuncios`}</small><Icon name="arrow" /></button>
          {tab === 'hooks' && <button className="adlib-icon" aria-label="Copiar gancho" title="Copiar gancho" onClick={() => copy(item.value)}><Icon name="copy" /></button>}
          {tab !== 'launches' && <span className="adlib-group-days">Hasta {number(item.days)} d</span>}
          {tab === 'destinations' && !!item.fanpages?.length && <div className="adlib-destination-pages" aria-label="Fanpages que usan este destino">{item.fanpages.map(page => <button key={page.id} className="adlib-text-button" onClick={() => selectPage(page.id)}>{page.name} · {number(page.total)} anuncios</button>)}</div>}
          {group?.value === item.value && <div className="adlib-group-expanded"><p>{item.total} anuncios · {item.active} activos en la última observación{item.inferred > 0 ? ` · ${item.inferred} sin fecha de inicio publicada` : ''}.</p>{tab === 'destinations' && safeHref(item.url) && <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer">Abrir destino ↗</a>}
            {tab === 'launches' && <div className="adlib-duration-list">{ads.map(ad => <button key={ad.id} onClick={() => setDetail(ad)}><span className="adlib-duration-thumb">{ad.media?.[0]?.poster || ad.media?.[0]?.kind === 'image' ? <img loading="lazy" src={ad.media[0].poster || ad.media[0].url} alt="" /> : <Icon name="grid" />}</span><span className="adlib-duration-track"><span className={ad.status === 'active' ? 'active' : ''} style={{ width: `${Math.max(8, ad.running_days / Math.max(item.days, 1) * 100)}%` }} /><strong>{ad.running_days} días</strong></span><span className="adlib-duration-copy">{ad.body || ad.title || 'Ver anuncio'}</span></button>)}</div>}
          </div>}
        </section>)}<p className="adlib-caption">Hasta 60 grupos {tab === 'launches' ? 'recientes' : tab === 'hooks' ? 'con mayor duración' : 'más frecuentes'} para los filtros seleccionados.</p></div>}
        {showCards && !showImportEmpty && !(tab === 'launches' && group) && <><div className="adlib-results-label"><p>{group ? <><strong>{group.type === 'hook' ? 'Anuncios con este copy' : group.type === 'landing' ? 'Anuncios para este destino' : group.type === 'domain' ? `Anuncios vinculados a ${group.value}` : 'Anuncios del lanzamiento'}</strong><button className="adlib-text-button" onClick={() => setGroup(null)}>Quitar selección ×</button></> : <><strong>{number(insights?.total)} anuncios</strong><span>{ads.length} cargados</span></>}</p><small>Días hasta la última observación</small></div>
          <div className="adlib-cards">{ads.map((ad, index) => <AdCard key={ad.id} ad={ad} pageId={pageIds.get(ad.brand_id)} onOpen={setDetail} onSave={save} saving={saving === ad.id} rank={tab === 'rank' ? index + 1 : null} />)}</div></>}
        {loading && <p className="adlib-loading" role="status">Cargando anuncios…</p>}
        {showImportEmpty && <div className="adlib-empty" data-testid="import-empty"><Icon name="refresh" /><h3>{importMessage.title}</h3><p>Aún no hay una primera consulta completa de {selected.display_name}. No necesitas volver a agregar la marca.</p><p>El estado se comprueba automáticamente mientras esta página esté abierta.</p></div>}
        {!showImportEmpty && !error && !loading && !ads.length && (showCards || !groups?.length) && <div className="adlib-empty"><Icon name={tab === 'saved' ? 'save' : 'grid'} /><h3>{tab === 'saved' ? 'Tu selección empieza aquí' : 'No hay anuncios para estos filtros'}</h3><p>{!brands.length ? 'Sigue una marca para comenzar a construir su biblioteca.' : tab === 'saved' ? 'Guarda anuncios desde la biblioteca para consultarlos después.' : 'Prueba otro estado, formato o búsqueda.'}</p></div>}
        {showCards && cursor && <button className="adlib-more" disabled={loading} onClick={() => loadAds(cursor)}>Cargar más anuncios</button>}
        </>}
        <p className="adlib-footnote">El historial se construye desde la primera observación. La duración no indica ventas ni rentabilidad.</p>
      </main>
    </div>
    {detail && <AdDetail key={`${companyId}-${detail.id}`} ad={detail} pageId={pageIds.get(detail.brand_id)} companyId={companyId} onClose={() => setDetail(null)} onSave={save} saving={saving === detail.id} />}
  </div>;
}
