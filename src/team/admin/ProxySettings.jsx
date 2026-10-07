import { useEffect, useRef, useState } from 'react';
import { adminRequest, dateTime } from './adminClient.js';
import { MAX_PROXY_ROUTES, proxyLabel } from '../../../shared/proxyPool.js';
import { ProxyDiagnostics } from './ProxyDiagnostics.jsx';

const makeDraft = (route, slot) => ({ slot: route?.slot || slot, server: route?.server || '', credentials: route ? 'keep' : 'replace', username: '', password: '' });
const payload = route => ({ ...route, username: route.credentials === 'replace' ? route.username : '', password: route.credentials === 'replace' ? route.password : '' });
const paths = {
  plus: 'M12 4v16 M4 12h16', check: 'M20 11v1a8 8 0 1 1-5-7 M9 10l3 3L21 4',
  refresh: 'M20 10a8 8 0 1 0-2 8 M20 4v6h-6', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  edit: 'M15 4l5 5 M4 20l5-1L21 7l-5-5L4 14z M13 21h8', trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  close: 'M6 6l12 12 M6 18L18 6', copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
};
function Icon({ name }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
function Dialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { const element = ref.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={ref} className="ops-proxy-dialog" aria-labelledby="proxy-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="ops-proxy-dialog-head"><h2 id="proxy-dialog-title">{title}</h2><button type="button" className="ops-icon-button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
function waitForProbe(ms, signal) {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelado', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export default function ProxySettings({ runtime, onChanged }) {
  const [base, setBase] = useState(null), [busy, setBusy] = useState('loading');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false);
  const [search, setSearch] = useState(''), [selected, setSelected] = useState([]), [results, setResults] = useState({});
  const [editor, setEditor] = useState(null), [removing, setRemoving] = useState(false), [editorResult, setEditorResult] = useState(null);
  const [progress, setProgress] = useState('');
  const lock = useRef(false), operation = useRef(null), nextProbeAt = useRef(0), selectAll = useRef(null);
  function populate(config) { setBase(config); setSelected([]); setResults({}); setConflict(false); setEditor(null); setRemoving(false); setEditorResult(null); }
  useEffect(() => {
    const controller = new AbortController();
    adminRequest('GET', { action: 'proxies' }, controller.signal).then(r => { if (!controller.signal.aborted) populate(r.proxies); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(''); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, []);
  const rows = (base?.routes || []).map((route, index) => ({ ...route, index })).filter(r => `${r.server} ${proxyLabel(r.index)}`.toLowerCase().includes(search.toLowerCase()));
  const selectedRows = rows.filter(r => selected.includes(r.slot));
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedRows.length > 0 && selectedRows.length < rows.length; }, [selectedRows.length, rows.length]);
  function start(kind) {
    if (lock.current) return null;
    lock.current = true; operation.current = new AbortController(); setBusy(kind); setError(''); setMessage('');
    return operation.current.signal;
  }
  function finish() { lock.current = false; setBusy(''); setProgress(''); }
  function failed(e, signal) { if (!signal.aborted) { setError(e.message); if (e.status === 409) setConflict(true); } }
  async function reload() {
    const signal = start('loading'); if (!signal) return;
    try { populate((await adminRequest('GET', { action: 'proxies' }, signal)).proxies); setMessage('Lista actualizada.'); }
    catch (e) { failed(e, signal); } finally { finish(); }
  }
  function openEditor(index) {
    setError(''); setMessage(''); setEditorResult(results[base.routes[index]?.slot] || null);
    setEditor({ index, draft: makeDraft(base.routes[index], index === 0 ? 'primary' : `proxy-${crypto.randomUUID()}`) });
  }
  function change(patch) { setEditor(old => ({ ...old, draft: { ...old.draft, ...patch } })); setEditorResult(null); }
  async function probe(route, signal) {
    // The existing endpoint allows one check per administrator every 15 seconds.
    const wait = nextProbeAt.current - Date.now();
    if (wait > 0) { setProgress('Esperando unos segundos para la siguiente comprobación…'); await waitForProbe(wait, signal); }
    setProgress(`Comprobando proxy ${route.slot === 'primary' ? 'principal' : 'de respaldo'}…`);
    nextProbeAt.current = Date.now() + 15500;
    const response = await adminRequest('POST', { action: 'test-proxy', revision: base.revision, route: payload(route) }, signal);
    return { ...response.result, checkedAt: response.result.checkedAt || new Date().toISOString() };
  }
  async function testEditor() {
    const signal = start('test-editor'); if (!signal) return;
    try { setEditorResult(await probe(editor.draft, signal)); } catch (e) { failed(e, signal); } finally { finish(); }
  }
  async function testSelected() {
    const signal = start('test-list'); if (!signal) return;
    try {
      for (const row of selectedRows) {
        const result = await probe(makeDraft(row, row.slot), signal);
        setResults(old => ({ ...old, [row.slot]: result }));
      }
      setMessage('Comprobación terminada. Revisa el estado de cada conexión.');
    } catch (e) { failed(e, signal); } finally { finish(); }
  }
  async function save(routes) {
    const signal = start('save'); if (!signal) return;
    try {
      const result = await adminRequest('POST', { action: 'save-proxies', revision: base.revision, routes: routes.map(payload) }, signal);
      populate(result.proxies);
      if (editor && editorResult) setResults({ [editor.draft.slot]: editorResult });
      setMessage('Proxies guardados. Se usarán al iniciar la siguiente consulta.'); onChanged();
    } catch (e) { failed(e, signal); } finally { finish(); }
  }
  function saveEditor(e) {
    e.preventDefault();
    const routes = base.routes.map(r => makeDraft(r, r.slot)); routes[editor.index] = editor.draft;
    return save(routes);
  }
  async function copyServer(server) {
    try { await navigator.clipboard.writeText(server); setMessage('Dirección copiada, sin credenciales.'); }
    catch { setError('No se pudo copiar. Puedes seleccionar la dirección y copiarla manualmente.'); }
  }
  const notices = <>{error && <div className="ops-notice ops-error" role="alert">{error}</div>}
    {conflict && <div className="ops-notice" role="alert"><span>La configuración cambió en otra sesión. Recarga antes de guardar.</span><button disabled={!!busy} onClick={reload}>Descartar y recargar</button></div>}</>;
  const readOnly = !base?.writable || conflict;
  const formReady = editor?.draft.server && (editor.draft.credentials !== 'replace' || (editor.draft.username && editor.draft.password));
  return <section className="ops-panel ops-proxy-panel">
    <div className="ops-proxy-toolbar">
      <div className="ops-proxy-actions">
        <button className="ops-primary" disabled={!!busy || readOnly || base.routes.length >= (base.maxRoutes || MAX_PROXY_ROUTES)} title={(base?.routes.length || 0) >= (base?.maxRoutes || MAX_PROXY_ROUTES) ? 'Alcanzaste el máximo de conexiones. Puedes editar o eliminar un respaldo.' : undefined} onClick={() => openEditor(base.routes.length)}><Icon name="plus" /> Agregar proxy</button>
        <button disabled={!!busy || readOnly || !selectedRows.length} onClick={testSelected}><Icon name="check" /> Comprobar {selectedRows.length > 1 ? 'proxies' : 'proxy'}</button>
        <button disabled={!!busy || !Object.keys(results).length} onClick={() => { setResults({}); setMessage('Resultados de esta sesión limpiados.'); }}><Icon name="close" /> Limpiar resultados</button>
      </div>
      <div className="ops-proxy-tools"><label className="ops-proxy-search"><Icon name="search" /><span className="ops-sr-only">Buscar proxy</span><input type="search" value={search} maxLength={100} placeholder="Buscar proxy…" onChange={e => setSearch(e.target.value)} /></label>
        <button className="ops-icon-button" aria-label="Actualizar proxies" title="Actualizar lista" disabled={!!busy} onClick={reload}><Icon name="refresh" /></button></div>
    </div>
    <div className="ops-proxy-caption"><span>{selectedRows.length ? `${selectedRows.length} seleccionados` : 'Conexiones del scraper'}</span><span>{base ? `${base.routes.length} de ${base.maxRoutes || MAX_PROXY_ROUTES} conexiones · En orden de uso` : 'Cargando conexiones…'}</span></div>
    {!editor && !removing && <div className="ops-proxy-notices">{notices}{message && <div className="ops-notice" role="status">{message}</div>}</div>}
    {busy === 'test-list' && <div className="ops-notice ops-proxy-progress" role="status"><span>{progress || 'Preparando comprobación…'}</span><button onClick={() => operation.current?.abort()}>Cancelar</button></div>}
    {base && !base.writable && <p className="ops-notice ops-error" role="alert">Falta preparar el almacenamiento seguro. Aún no se pueden guardar credenciales.</p>}
    {!base ? <div className="ops-empty">{busy ? 'Cargando conexiones…' : 'No se pudieron cargar las conexiones.'}</div> : <>
      <div className="ops-proxy-table-wrap"><table className="ops-proxy-table"><caption className="ops-sr-only">Proxies del scraper</caption><thead><tr>
        <th className="ops-proxy-select"><label><input ref={selectAll} aria-label="Seleccionar todos los proxies visibles" type="checkbox" disabled={!!busy || !rows.length} checked={!!rows.length && selectedRows.length === rows.length} onChange={e => setSelected(e.target.checked ? rows.map(r => r.slot) : [])} /></label></th>
        <th className="ops-proxy-number">#</th><th>DSN proxy</th><th>Uso</th><th>Verificar estado</th><th>Última comprobación</th><th>Acciones</th>
      </tr></thead><tbody>{rows.map(row => {
        const result = results[row.slot];
        return <tr key={row.slot} aria-selected={selected.includes(row.slot)}>
          <td className="ops-proxy-select"><label><input type="checkbox" aria-label={`Seleccionar proxy ${proxyLabel(row.index).toLowerCase()}`} disabled={!!busy} checked={selected.includes(row.slot)} onChange={e => setSelected(old => e.target.checked ? [...old, row.slot] : old.filter(s => s !== row.slot))} /></label></td>
          <td className="ops-proxy-number">{row.index + 1}</td>
          <td data-label="DSN proxy"><div className="ops-proxy-address"><span title={row.server}>{row.server}</span><button className="ops-icon-button" aria-label={`Copiar dirección ${proxyLabel(row.index).toLowerCase()}`} title="Copiar dirección" onClick={() => copyServer(row.server)}><Icon name="copy" /></button></div><small>{row.hasCredentials ? 'Credenciales protegidas' : 'Sin autenticación'}</small></td>
          <td data-label="Uso"><strong>{proxyLabel(row.index)}</strong><small>{row.index ? 'Si falla el principal' : 'Primera conexión'}</small></td>
          <td data-label="Verificar estado"><span className={`ops-badge ${result ? result.ok ? 'ops-good' : 'ops-warn' : ''}`}>{result ? result.ok ? 'Meta: conexión disponible' : 'Meta: conexión fallida' : 'Sin comprobar'}</span><ProxyDiagnostics result={result} compact />{result && <small className="ops-proxy-result">{result.message}</small>}</td>
          <td data-label="Última comprobación">{result ? dateTime(result.checkedAt) : '—'}</td>
          <td data-label="Acciones"><div className="ops-row-actions"><button className="ops-icon-button" aria-label={`Editar proxy ${proxyLabel(row.index).toLowerCase()}`} title="Editar proxy" disabled={!!busy || readOnly} onClick={() => openEditor(row.index)}><Icon name="edit" /></button><button className="ops-icon-button" aria-label={`Eliminar proxy ${proxyLabel(row.index).toLowerCase()}`} title={row.index ? 'Eliminar respaldo' : 'El principal es obligatorio. Puedes editarlo.'} disabled={!row.index || !!busy || readOnly} onClick={() => { setRemoving(row.index); setError(''); }}><Icon name="trash" /></button></div></td>
        </tr>;
      })}</tbody></table>{!rows.length && <div className="ops-empty">{base.routes.length ? 'No hay proxies para esta búsqueda.' : 'Agrega el proxy principal para empezar.'}</div>}</div>
      <div className="ops-proxy-footer"><span>{rows.length} {rows.length === 1 ? 'conexión' : 'conexiones'}{search && ' en esta búsqueda'}</span><span>Comprobaciones de esta sesión · Meta e ipwho.is</span></div>
      <div className="ops-proxy-help"><p>Para reemplazar una conexión, usa el lápiz. Las credenciales se guardan cifradas.</p><p>Último cambio: {dateTime(base.updatedAt)} · {runtime?.worker?.proxyStatusAvailable && runtime.worker.proxyRevision === base.revision ? 'Configuración disponible para el recolector.' : 'Lectura del recolector pendiente.'}</p><p>Después de guardar, ve a Marcas → Consultar ahora.</p></div>
    </>}
    {editor && <Dialog title={`${base.routes[editor.index] ? 'Editar' : 'Agregar'} proxy ${proxyLabel(editor.index).toLowerCase()}`} busy={!!busy} onClose={() => setEditor(null)}>
      {notices}<form onSubmit={saveEditor} autoComplete="off"><fieldset disabled={!!busy || readOnly} className="ops-proxy-fields">
        <label>Dirección y puerto<input autoFocus required maxLength={300} value={editor.draft.server} placeholder="socks5://IP:puerto" onChange={e => change({ server: e.target.value })} /></label>
        <p className="ops-note">Admite SOCKS5 y HTTP. El usuario y la contraseña van en los campos de autenticación.</p>
        <label>Autenticación<select value={editor.draft.credentials} onChange={e => change({ credentials: e.target.value, username: '', password: '' })}>
          {base.routes[editor.index] && <option value="keep">Conservar credenciales guardadas</option>}<option value="replace">Introducir usuario y contraseña</option><option value="none">Sin autenticación</option>
        </select></label>
        {editor.draft.credentials === 'replace' ? <div className="ops-proxy-credentials"><label>Usuario<input required autoComplete="off" maxLength={255} value={editor.draft.username} onChange={e => change({ username: e.target.value })} /></label><label>Contraseña<input type="password" required autoComplete="new-password" maxLength={255} value={editor.draft.password} onChange={e => change({ password: e.target.value })} /></label></div>
          : editor.draft.credentials === 'keep' && <p className="ops-note">Las credenciales guardadas no se muestran. Si cambias la dirección, vuelve a introducirlas o elige «Sin autenticación».</p>}
        <button type="button" disabled={!formReady} onClick={testEditor}><Icon name="check" /> Probar conexión</button>
      </fieldset>
      {busy === 'test-editor' && <p className="ops-note" role="status">{progress || 'Preparando comprobación…'}</p>}
      {editorResult && <><p className={`ops-notice ${editorResult.ok ? '' : 'ops-error'}`} role="status">{editorResult.message}</p><ProxyDiagnostics result={editorResult} /></>}
      <p className="ops-note">Probar no guarda cambios. El proxy se usará en la siguiente consulta; las que estén en curso continúan.</p>
      <div className="ops-proxy-dialog-footer"><button type="button" disabled={!!busy} onClick={() => setEditor(null)}>Cancelar</button><button type="submit" className="ops-primary" disabled={!!busy || readOnly}>{busy === 'save' ? 'Guardando…' : 'Guardar proxy'}</button></div>
      </form></Dialog>}
    {removing && <Dialog title={`Eliminar proxy ${proxyLabel(removing).toLowerCase()}`} busy={!!busy} onClose={() => setRemoving(false)}>{notices}<p>Se quitará esta conexión. Los demás proxies conservarán su orden y sus credenciales.</p><div className="ops-proxy-dialog-footer"><button disabled={!!busy} onClick={() => setRemoving(false)}>Cancelar</button><button className="ops-proxy-danger" disabled={!!busy || readOnly} onClick={() => save(base.routes.filter((_, i) => i !== removing).map(r => makeDraft(r, r.slot)))}>{busy === 'save' ? 'Eliminando…' : 'Eliminar respaldo'}</button></div></Dialog>}
  </section>;
}
