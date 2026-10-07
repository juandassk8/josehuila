import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest, changedSettings, dateTime, displaySetting, engineName, errorLabel, number } from './adminClient.js';
import './administration.css';
import ProxySettings from './ProxySettings.jsx';
import ScrapeGraphSettings from './ScrapeGraphSettings.jsx';
import { ADMIN_SECTIONS, adminSection } from './navigation.js';

function BrandRequests() {
  const list = useRemote({ action: 'brand-requests' });
  const reload = list.reload;
  useEffect(() => { const timer = setInterval(reload, 30000); return () => clearInterval(timer); }, [reload]);
  return <section className="ops-panel"><div className="ops-section-title"><h2>Marcas en preparación</h2><button onClick={reload} disabled={list.loading}>Actualizar</button></div>
    <p className="ops-note">Solicitudes guardadas por empresa. El servidor las procesa y reintenta aunque el usuario cierre la página. Máximo 500 solicitudes recientes.</p>
    {list.error && <ErrorNotice retry={reload}>{list.error}</ErrorNotice>}
    {list.loading ? <Empty>Cargando solicitudes…</Empty> : !list.data?.requests.length ? <Empty>No hay solicitudes pendientes.</Empty> : <div className="ops-table-wrap"><table><thead><tr><th>Enlace / empresa</th><th>Estado</th><th>Intentos</th><th>Siguiente intento</th><th>Último diagnóstico</th></tr></thead><tbody>{list.data.requests.map(row => <tr key={row.id}>
      <td className="ops-request-url">{row.input_url}<small>{row.company_id}</small></td><td>{{ pending: 'En cola', resolving: 'Buscando identidad', needs_selection: 'Esperando selección' }[row.status]}</td>
      <td>{row.attempts}</td><td>{row.status === 'pending' ? dateTime(row.next_attempt_at) : '—'}</td><td><code>{row.last_error || '—'}</code></td>
    </tr>)}</tbody></table></div>}
  </section>;
}

function useRemote(query, enabled = true, retain = false) {
  const key = JSON.stringify(query);
  const [state, setState] = useState({ data: null, error: '', request: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    adminRequest('GET', JSON.parse(key), controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data, error: '', request: `${key}:${version}` }); })
      .catch(error => { if (!controller.signal.aborted) setState(old => ({ data: retain ? old.data : null, error: error.message, request: `${key}:${version}` })); });
    return () => controller.abort();
  }, [key, enabled, version, retain]);
  const loading = state.request !== `${key}:${version}`;
  const reload = useCallback(() => setVersion(value => value + 1), []);
  return { data: loading && !retain ? null : state.data, error: loading ? '' : state.error, loading, reload };
}

function Badge({ tone = 'neutral', children }) { return <span className={`ops-badge ops-${tone}`}>{children}</span>; }
function ErrorNotice({ children, retry }) { return <div role="alert" className="ops-notice ops-error">{children}{retry && <button onClick={retry}>Reintentar</button>}</div>; }
function Empty({ children }) { return <div className="ops-empty">{children}</div>; }
function Pager({ offset, total, onChange }) {
  if (!total) return null;
  return <div className="ops-pager"><span>{number(offset + 1)}–{number(Math.min(offset + 25, total))} de {number(total)}</span>
    <div><button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 25))}>Anterior</button>
      <button disabled={offset + 25 >= total || offset + 25 > 100000} onClick={() => onChange(offset + 25)}>Siguiente</button></div></div>;
}

function ServiceLine({ name, signal, revision }) {
  return <div className="ops-service-line"><div><strong>{name}</strong><small>{signal ? `Última señal: ${dateTime(signal.at)}` : 'Sin confirmación reciente del proceso'}</small></div>
    <Badge tone={signal?.settingsAvailable && signal.revision === revision ? 'good' : 'warn'}>
      {!signal ? 'Sin señal' : !signal.settingsAvailable ? 'No lee ajustes' : signal.revision === revision ? `Lee versión ${revision}` : 'Cambio pendiente'}
    </Badge></div>;
}

function QueuePanel({ title, queue }) {
  return <div className="ops-queue"><div className="ops-section-title"><h3>{title}</h3>
    <Badge tone={!queue?.available || !queue.workers ? 'warn' : queue.paused ? 'warn' : 'good'}>
      {!queue?.available ? 'Sin conexión' : queue.paused ? 'Cola pausada' : !queue.workers ? 'Sin procesador' : 'Conectada'}</Badge></div>
    {queue?.available && <dl className="ops-queue-numbers">
      <div><dt>En curso</dt><dd>{number(queue.counts.active || 0)}</dd></div>
      <div><dt>En espera</dt><dd>{number((queue.counts.wait || 0) + (queue.counts.prioritized || 0) + (queue.counts.paused || 0))}</dd></div>
      <div><dt>Reintentos</dt><dd>{number(queue.counts.delayed || 0)}</dd></div>
    </dl>}
  </div>;
}

function Overview({ data, onNavigate, showBrands, showFailures }) {
  const { summary: s, settings, runtime } = data;
  return <>
    <div className="ops-metrics">
      <div><span>Anuncios catalogados</span><strong>{number(s.ads)}</strong><small>{number(s.active_ads)} activos según la última observación</small></div>
      <button onClick={showBrands}><span>Marcas seguidas</span><strong>{number(s.followed_brands)}</strong><small>{number(s.brands)} en el catálogo global →</small></button>
      <div><span>Consultas completas · 24 h</span><strong>{number(s.complete_24h)}</strong><small>De {number(s.runs_24h)} consultas iniciadas</small></div>
      <button onClick={showFailures}><span>Consultas fallidas · 24 h</span><strong>{number(s.failed_24h)}</strong><small>Revisar historial de errores →</small></button>
    </div>
    {!!s.attention && <div className="ops-notice"><span>{number(s.attention)} {Number(s.attention) === 1 ? 'marca seguida necesita' : 'marcas seguidas necesitan'} atención o su primera consulta completa.</span><button onClick={() => showBrands(true)}>Revisar marcas</button></div>}
    <div className="ops-columns"><section className="ops-panel"><div className="ops-section-title"><h2>Recolección</h2><Badge tone={settings.enabled ? 'good' : 'warn'}>{settings.enabled ? 'Habilitada' : 'Pausada'}</Badge></div>
      <ServiceLine name="Recolector" signal={runtime.worker} revision={settings.revision} />
      <ServiceLine name="Programador" signal={runtime.scheduler} revision={settings.revision} />
      <QueuePanel title="Consultas de marcas" queue={runtime.crawls} />
      <QueuePanel title="Archivos multimedia" queue={runtime.media} />
      {runtime.retryAt && <p className="ops-note">Próximo intento permitido por la cola: {dateTime(runtime.retryAt)}.</p>}
    </section><section className="ops-panel"><h2>Datos de Inforce</h2>
      <div className="ops-service-line"><span>Empresas registradas</span><button onClick={() => onNavigate('empresas')}>{number(s.companies)} · Ver empresas →</button></div>
      <div className="ops-service-line"><span>Integrantes activos</span><button onClick={() => onNavigate('equipo')}>{number(s.members)} · Ver equipo →</button></div>
      <dl className="ops-data-list"><div><dt>Archivos únicos guardados</dt><dd>{number(s.media_files)}</dd></div>
        <div><dt>Almacenamiento de originales</dt><dd>{(Number(s.media_bytes) / 1024 ** 3).toLocaleString('es-CO', { maximumFractionDigits: 2 })} GB</dd></div>
        <div><dt>Anuncios con medios pendientes</dt><dd>{number(s.media_pending)}</dd></div>
        <div><dt>Anuncios con error de medios</dt><dd>{number(s.media_failed)}</dd></div></dl>
      <p className="ops-note">El catálogo se comparte entre las empresas que siguen una marca. Los anuncios no se cuentan de nuevo por cada empresa.</p>
      <button onClick={() => onNavigate('adlibrary')}>Abrir biblioteca de anuncios →</button>
    </section></div>
  </>;
}

function Brands({ initialAttention, canRefresh, onRuns, onChanged, announce }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [attention, setAttention] = useState(initialAttention);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const list = useRemote({ action: 'brands', search: query, attention, offset });
  const refresh = async brand => {
    if (locked.current) return;
    locked.current = true; setBusy(brand.id); setError('');
    try {
      const result = await adminRequest('POST', { action: 'refresh-brand', brandId: brand.id });
      announce(`${brand.name}: ${result.message}`); onChanged();
    } catch (err) { setError(err.message); }
    finally { locked.current = false; setBusy(''); }
  };
  return <section className="ops-panel ops-table-panel"><div className="ops-toolbar">
    <form onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setOffset(0); }}>
      <label className="ops-search">Buscar marca o ID de Meta<input type="search" maxLength={100} value={search} placeholder="Nombre de marca o ID…" onChange={e => setSearch(e.target.value)} /></label>
      <button type="submit">Buscar</button></form>
    <label className="ops-check"><input type="checkbox" checked={attention} onChange={e => { setAttention(e.target.checked); setOffset(0); }} /> Necesitan atención</label>
    <button onClick={list.reload} disabled={list.loading}>Actualizar lista</button></div>
    {(list.error || error) && <ErrorNotice retry={list.error ? list.reload : undefined}>{list.error || error}</ErrorNotice>}
    {list.loading ? <Empty>Cargando marcas…</Empty> : list.data && <>
      {!list.data.rows.length ? <Empty>No hay marcas para esta búsqueda.</Empty> : <div className="ops-table-scroll"><table><caption className="ops-sr-only">Catálogo global de marcas</caption><thead><tr><th>Marca</th><th>Anuncios</th><th>Última consulta completa</th><th>Próxima consulta</th><th>Acciones</th></tr></thead><tbody>
        {list.data.rows.map(brand => <tr key={brand.id}><td><strong>{brand.name}</strong><small>ID {brand.meta_page_id} · {brand.country}</small><small>{number(brand.followers)} empresas siguiendo</small>
          {brand.last_crawl_status === 'failed' && <Badge tone="warn">Último intento fallido</Badge>}</td>
          <td><strong>{number(brand.ads)}</strong><small>{number(brand.active_ads)} activos</small></td>
          <td>{brand.last_complete_scan_at ? dateTime(brand.last_complete_scan_at) : <Badge tone="warn">Pendiente</Badge>}<small>{engineName(brand.source)}</small></td>
          <td>{brand.followers ? dateTime(brand.next_crawl_at) : 'Sin seguimiento'}<small>Fecha prevista; depende de la cola</small></td>
          <td><div className="ops-row-actions"><button onClick={() => onRuns(brand)}>Historial</button><button disabled={!!busy || !canRefresh || !brand.followers} onClick={() => refresh(brand)}>{busy === brand.id ? 'Solicitando…' : 'Consultar ahora'}</button></div></td></tr>)}
      </tbody></table></div>}
      <Pager offset={offset} total={list.data.total} onChange={setOffset} />
    </>}
  </section>;
}

function Runs({ brand, initialStatus, clearBrand }) {
  const [status, setStatus] = useState(initialStatus);
  const [offset, setOffset] = useState(0);
  const list = useRemote({ action: 'runs', status, brandId: brand?.id || '', offset });
  return <section className="ops-panel ops-table-panel"><div className="ops-toolbar">
    <label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">Todos</option><option value="complete">Completas</option><option value="failed">Fallidas</option><option value="running">En curso</option></select></label>
    {brand && <button onClick={clearBrand}>Quitar filtro: {brand.name} ×</button>}
    <span className="ops-note">Historial completo · horarios de tu dispositivo</span><button disabled={list.loading} onClick={list.reload}>Actualizar historial</button>
  </div>{list.error && <ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>}
    {list.loading ? <Empty>Cargando consultas…</Empty> : list.data && <>
      {!list.data.rows.length ? <Empty>No hay consultas para estos filtros.</Empty> : <div className="ops-table-scroll"><table><caption className="ops-sr-only">Historial de consultas</caption><thead><tr><th>Marca / inicio</th><th>Resultado</th><th>Anuncios / páginas</th><th>Motor e intentos</th></tr></thead><tbody>
        {list.data.rows.map(run => <tr key={run.id}><td><strong>{run.brand_name}</strong><small>{dateTime(run.started_at)}</small><small>{run.finished_at ? `Fin: ${dateTime(run.finished_at)}` : 'Sin cierre registrado'}</small></td>
          <td><Badge tone={run.status === 'failed' ? 'warn' : run.complete_scan ? 'good' : 'neutral'}>{run.status === 'running' ? 'En curso' : run.complete_scan ? 'Completa' : 'Parcial / fallida'}</Badge>
            {run.error_code && <><small>{errorLabel(run.error_code)}</small><small className="ops-code">{run.error_code}</small></>}{run.collection_method === 'stored_capture' && <small>Captura importada</small>}</td>
          <td><strong>{number(run.ads_seen)} / {number(run.pages_seen)}</strong><small>{number(run.new_ads)} nuevos · {number(run.changed_ads)} cambios</small></td>
          <td>{engineName(run.collector_engine)}{run.collector_attempts?.length > 0 && <details><summary>{run.collector_attempts.length} intentos</summary>
            <ol className="ops-attempts">{run.collector_attempts.map((attempt, i) => <li key={i}><strong>{engineName(attempt.engine)}</strong><small>{({ complete: 'Completo', running: 'En curso', failed: 'Fallido' })[attempt.status] || 'Sin estado'} · {number(attempt.ads)} anuncios</small>{attempt.error_code && <small className="ops-code">{attempt.error_code}</small>}</li>)}</ol></details>}</td></tr>)}
      </tbody></table></div>}<Pager offset={offset} total={list.data.total} onChange={setOffset} />
      <p className="ops-note ops-inset">Una consulta parcial conserva lo encontrado y no confirma que hayan desaparecido otros anuncios.</p>
    </>}
  </section>;
}

function Integrations({ runtime, settings }) {
  const worker = runtime.worker;
  const providers = [
    ['Chrome · Meta', worker ? 'Configurado' : 'Sin señal', 'Recolector principal. Usa las rutas de conexión configuradas en el servidor.'],
    ['Scrapling', !settings.scrapling_enabled ? 'Desactivado en el panel' : worker?.scraplingConfigured ? 'Respaldo habilitado' : worker ? 'Falta habilitar en servidor' : 'Sin señal', 'Se intenta ante fallos compatibles del recolector principal. No omite las pausas del proveedor.'],
    ['ScrapeGraphAI', 'Configurable en APIs', 'Guarda la clave y comprueba el saldo en la pestaña APIs. El respaldo automático sigue pendiente de validar.'],
    ['Foreplay', 'Integración pendiente', 'Histórico anterior al primer seguimiento. Todavía no se han activado importaciones.'],
  ];
  return <section className="ops-panel"><h2>Fuentes y conexiones</h2><p className="ops-note">Configuración reportada por el recolector. No representa una prueba de acceso al proveedor.</p>
    {providers.map(([name, state, description]) => <div key={name} className="ops-provider"><div><h3>{name}</h3><Badge>{state}</Badge></div><p>{description}</p></div>)}
    <h3>Proxies</h3>
    {!worker?.proxyStatusAvailable ? <p className="ops-note">No hay información reciente sobre las rutas de conexión.</p> : !worker.proxies.length ? <p className="ops-note">El recolector no reporta proxies configurados.</p> : worker.proxies.map(proxy => <div className="ops-service-line" key={proxy.label}><strong>{proxy.label}</strong>
      <span>{proxy.retryAt ? `En pausa hasta ${dateTime(proxy.retryAt)}` : 'Sin pausa registrada'}</span></div>)}
    <p className="ops-note">Puedes cambiar las rutas en Proxies y conectar ScrapeGraphAI en APIs.</p>
  </section>;
}

function Settings({ data, onChanged, announce }) {
  const [base, setBase] = useState(data.settings);
  const [draft, setDraft] = useState(data.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const changed = changedSettings(base, draft).length > 0;
  const conflict = data.settings.revision !== base.revision;
  const reset = () => { setBase(data.settings); setDraft(data.settings); setError(''); };
  const submit = async event => {
    event.preventDefault();
    if (locked.current || conflict || !changed) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const settings = Object.fromEntries(['enabled', 'scrapling_enabled', 'changes_hours', 'quiet_hours', 'error_hours'].map(key => [key, draft[key]]));
      const result = await adminRequest('POST', { action: 'save-settings', revision: base.revision, settings });
      setBase(result.settings); setDraft(result.settings); announce('Configuración guardada. Se aplicará a las nuevas consultas.'); onChanged();
    } catch (err) { setError(err.message); if (err.status === 409) onChanged(); }
    finally { locked.current = false; setBusy(false); }
  };
  return <div className="ops-columns"><section className="ops-panel"><div className="ops-section-title"><h2>Reglas de recolección</h2><Badge>Versión {base.revision}</Badge></div>
    <p className="ops-note">Se leen al comenzar cada consulta. Los trabajos en curso terminan con los ajustes que tenían al iniciar.</p>
    {conflict && <div role="alert" className="ops-notice">Hay una versión más reciente. <button onClick={reset} disabled={busy}>Recargar ajustes</button></div>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label className="ops-toggle"><span><strong>Recolección habilitada</strong><small>Al pausar, se conservan los datos y las consultas pendientes.</small></span><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /></label>
      <label className="ops-toggle"><span><strong>Usar Scrapling como respaldo</strong><small>Requiere que el servicio esté habilitado en el servidor.</small></span><input type="checkbox" checked={draft.scrapling_enabled} onChange={e => setDraft({ ...draft, scrapling_enabled: e.target.checked })} /></label>
      <div className="ops-fields">{[['changes_hours', 'Si hay anuncios nuevos o cambios', 168], ['quiet_hours', 'Si no hay cambios', 168], ['error_hours', 'Tras un error de consulta', 24]].map(([key, label, max]) => <label key={key}>{label}<div><input type="number" min={key === 'quiet_hours' ? draft.changes_hours || 1 : 1} max={max} step="1" required value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value === '' ? '' : Number(e.target.value) })} /> <span>horas</span></div></label>)}</div>
      <p className="ops-note">La frecuencia se usa al programar el siguiente ciclo; no adelanta las fechas ya guardadas. «Consultar ahora» permite solicitar una consulta puntual. Los reintentos de la cola y las pausas indicadas por Meta mantienen sus propios plazos.</p>
      <div className="ops-form-actions"><button className="ops-primary" type="submit" disabled={!changed || conflict || busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button><button type="button" disabled={!changed || busy} onClick={reset}>Descartar</button></div>
    </fieldset></form>
    <p className="ops-note">Último cambio: {dateTime(base.updated_at)}. La lectura de ajustes por los servicios se actualiza aproximadamente cada 30 segundos.</p>
    <ServiceLine name="Recolector" signal={data.runtime.worker} revision={base.revision} /><ServiceLine name="Programador" signal={data.runtime.scheduler} revision={base.revision} />
  </section><Integrations runtime={data.runtime} settings={data.settings} /></div>;
}

function Audit() {
  const list = useRemote({ action: 'audit' });
  return <section className="ops-panel"><div className="ops-section-title"><div><h2>Actividad administrativa</h2><p className="ops-note">Últimas 50 acciones · registro de responsables y cambios</p></div><button disabled={list.loading} onClick={list.reload}>Actualizar</button></div>
    {list.error && <ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>}
    {list.loading ? <Empty>Cargando actividad…</Empty> : !list.data?.rows.length ? <Empty>Aún no hay acciones registradas desde este panel.</Empty> : <ol className="ops-audit">{list.data.rows.map(row => <li key={row.id}>
      <div><strong>{row.action === 'scrapegraph_saved' ? 'Clave de ScrapeGraphAI actualizada' : row.action === 'scrapegraph_checked' ? 'Conexión de ScrapeGraphAI comprobada' : row.action === 'proxies_saved' ? 'Proxies actualizados' : row.action === 'settings_saved' ? 'Configuración actualizada' : 'Consulta solicitada'}</strong><small>{row.actor_name} · {dateTime(row.created_at)}</small></div>
      {row.action === 'scrapegraph_saved' ? <p>{row.after_value?.configured ? 'Clave guardada.' : 'Clave eliminada.'} Versión {row.after_value?.revision}.</p>
        : row.action === 'scrapegraph_checked' ? <p>{row.after_value?.status === 'connected' ? `Conexión correcta · ${number(row.after_value.remaining)} créditos disponibles.` : 'La comprobación requiere atención. Revisa la pestaña APIs.'}</p>
        : row.action === 'settings_saved' ? <ul>{changedSettings(row.before_value, row.after_value).map(change => <li key={change}>{change}</li>)}</ul>
        : row.action === 'proxies_saved' ? <p>{row.after_value?.routes?.length} conexiones configuradas · versión {row.after_value?.revision}. Credenciales ocultas.</p>
          : <p>Marca: <span className="ops-code">{row.brand_id}</span><br />{({ queued: 'Solicitud enviada a la cola.', requested: 'Solicitud registrada; envío sin confirmar.', unconfirmed: 'No se pudo confirmar el envío a la cola.' })[row.after_value?.status] || displaySetting(row.after_value?.status)}</p>}
    </li>)}</ol>}
  </section>;
}

export default function AdministrationPage({ currentMember, onNavigate, section, onSectionChange, showNavigation = true }) {
  const allowed = currentMember?.role === 'admin' && currentMember.active !== false;
  const overview = useRemote({ action: 'overview' }, allowed, true);
  const [internalTab, setInternalTab] = useState('overview');
  const tab = adminSection(section ?? internalTab)[0];
  const [attention, setAttention] = useState(false);
  const [runStatus, setRunStatus] = useState('');
  const [brand, setBrand] = useState(null);
  const [message, setMessage] = useState('');
  function setTab(next) {
    setMessage('');
    if (section === undefined) setInternalTab(next);
    else onSectionChange?.(next);
  }
  const reload = overview.reload;
  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 30_000);
    return () => clearInterval(timer);
  }, [allowed, reload]);
  if (!allowed) return <div className="ops-admin"><ErrorNotice>Esta sección está disponible solo para administradores de Inforce.</ErrorNotice></div>;
  const data = overview.data;
  return <section className="ops-admin" aria-labelledby="ops-title"><header className="ops-header"><div><p className="ops-eyebrow">INFORCE / CONTROL DEL SISTEMA</p><h1 id="ops-title">{showNavigation ? 'Administración' : adminSection(tab)[1]}</h1><p>Datos, consultas y configuración en un solo lugar.</p></div>
    <div><small>{data ? `Datos al ${dateTime(data.capturedAt)}` : 'Consultando estado…'}</small><button disabled={overview.loading} onClick={overview.reload}>{overview.loading ? 'Actualizando…' : 'Actualizar estado'}</button></div></header>
    {showNavigation && <nav className="ops-tabs" aria-label="Secciones de administración">{ADMIN_SECTIONS.map(([key, name]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{name}</button>)}</nav>}
    {message && <div className="ops-notice" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Cerrar aviso">×</button></div>}
    {overview.error && <ErrorNotice retry={overview.reload}>{overview.error}{data && ' Los datos visibles corresponden a la última lectura correcta.'}</ErrorNotice>}
    {!data ? !overview.error && <Empty>Cargando el panel de administración…</Empty> : <>
      {tab === 'overview' && <Overview data={data} onNavigate={onNavigate} showBrands={flag => { setAttention(flag === true); setTab('brands'); }} showFailures={() => { setRunStatus('failed'); setBrand(null); setTab('runs'); }} />}
      {tab === 'brands' && <Brands initialAttention={attention} canRefresh={data.settings.enabled} onChanged={overview.reload} announce={setMessage} onRuns={selected => { setBrand(selected); setRunStatus(''); setTab('runs'); }} />}
      {tab === 'runs' && <Runs key={brand?.id || 'all'} brand={brand} initialStatus={runStatus} clearBrand={() => setBrand(null)} />}
      {tab === 'requests' && <BrandRequests />}
      {tab === 'settings' && <Settings data={data} onChanged={overview.reload} announce={setMessage} />}
      {tab === 'proxies' && <ProxySettings runtime={data.runtime} onChanged={overview.reload} />}
      {tab === 'apis' && <ScrapeGraphSettings />}
      {tab === 'audit' && <Audit />}
    </>}
  </section>;
}
