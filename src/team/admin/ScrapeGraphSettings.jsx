import { useEffect, useRef, useState } from 'react';
import { adminRequest, dateTime, number } from './adminClient.js';

const failures = {
  SGAI_AUTH_FAILED: 'La clave no fue aceptada. Revisa o reemplaza la clave de tu cuenta.',
  SGAI_CREDITS_EXHAUSTED: 'La cuenta no tiene créditos disponibles.',
  SGAI_RATE_LIMITED: 'ScrapeGraphAI pidió esperar. Intenta comprobar el saldo más tarde.',
  SGAI_TRANSPORT_FAILED: 'No se pudo conectar con ScrapeGraphAI. Puedes comprobarlo más tarde.',
};

export default function ScrapeGraphSettings() {
  const [data, setData] = useState(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [remove, setRemove] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest('GET', { action: 'scrapegraph' }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result.scrapegraph); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  const reload = () => { setError(''); setLoading(true); setVersion(value => value + 1); };
  async function perform(action, mode) {
    if (locked.current) return;
    locked.current = true; setBusy(mode || 'check'); setError(''); setNotice('');
    try {
      const result = await adminRequest('POST', { action, revision: data.revision,
        ...(mode ? { mode, ...(mode === 'replace' ? { apiKey: key.trim() } : {}) } : {}) });
      setData(result.scrapegraph);
      if (mode) { setKey(''); setRemove(false); }
      setNotice(mode === 'replace' ? 'Clave guardada. Ahora puedes comprobar la conexión y el saldo.'
        : mode === 'remove' ? 'Clave eliminada de Inforce.' : 'Comprobación terminada. No se consultaron anuncios.');
    } catch (err) { setError(err.message); }
    finally { locked.current = false; setBusy(''); }
  }
  const check = data?.check;
  return <div className="ops-columns"><section className="ops-panel ops-sgai">
    <div className="ops-section-title"><h2>ScrapeGraphAI</h2><span className="ops-badge">{data?.configured ? 'Clave guardada' : 'Pendiente de conexión'}</span></div>
    <p>Conecta tu cuenta para preparar un respaldo con la infraestructura de ScrapeGraphAI.</p>
    {error && <div className="ops-notice ops-error" role="alert"><span>{error}</span><button onClick={reload} disabled={!!busy || loading}>Recargar</button></div>}
    {notice && <p role="status" className="ops-notice">{notice}</p>}
    {loading ? <p role="status" className="ops-empty">Cargando conexión…</p> : data && <>
      {!data.writable && <p role="alert" className="ops-notice">Falta habilitar el almacenamiento seguro en el servidor.</p>}
      <form onSubmit={event => { event.preventDefault(); perform('save-scrapegraph', 'replace'); }}>
        <label className="ops-sgai-key">{data.configured ? 'Reemplazar clave de API' : 'Clave de API'}
          <input type="password" autoComplete="new-password" spellCheck={false} maxLength={512} required value={key}
            disabled={!!busy || !data.writable} onChange={event => setKey(event.target.value)}
            placeholder={data.configured ? 'Introduce una nueva clave para cambiarla' : 'Pega aquí la clave de tu cuenta'} aria-describedby="sgai-key-note" /></label>
        <p className="ops-note" id="sgai-key-note">Se guarda cifrada y no se vuelve a mostrar. Solo los administradores pueden cambiar esta conexión.</p>
        <div className="ops-form-actions"><button type="submit" className="ops-primary" disabled={!!busy || !key.trim() || !data.writable}>{busy === 'replace' ? 'Guardando…' : 'Guardar clave'}</button>
          {data.configured && <button type="button" disabled={!!busy} onClick={() => setRemove(!remove)}>Quitar clave</button>}</div>
      </form>
      {remove && <div className="ops-notice"><span>¿Quitar la clave guardada en Inforce?</span><div className="ops-row-actions"><button disabled={!!busy} onClick={() => perform('save-scrapegraph', 'remove')}>Sí, quitar</button><button disabled={!!busy} onClick={() => setRemove(false)}>Cancelar</button></div></div>}
      <div className="ops-provider"><div><h3>Conexión y créditos</h3><span className={`ops-badge ${check?.status === 'connected' ? 'ops-good' : ''}`}>{!check ? 'Sin comprobar' : check.status === 'connected' ? 'Conexión comprobada' : 'Revisar conexión'}</span></div>
        {check?.status === 'connected' ? <><dl className="ops-data-list"><div><dt>Créditos disponibles</dt><dd>{number(check.remaining)}</dd></div><div><dt>Créditos usados en la cuenta</dt><dd>{number(check.used)}</dd></div></dl>
          {check.remaining < 6 && <p>El saldo actual no alcanza para la prueba prevista de 6 créditos.</p>}</>
          : check && <p role="alert">{failures[check.status] || 'El proveedor no devolvió un saldo válido. Intenta comprobarlo más tarde.'}</p>}
        <p className="ops-note">Última comprobación: {dateTime(check?.at)}. El saldo corresponde a toda tu cuenta.</p>
        <button disabled={!!busy || !data.configured || !data.writable || !!key.trim()} onClick={() => perform('check-scrapegraph')}>{busy === 'check' ? 'Comprobando…' : 'Comprobar conexión y saldo'}</button>
        <p className="ops-note">Esta comprobación no consume créditos de extracción.</p>
      </div>
    </>}
  </section><section className="ops-panel"><h2>Preparación del respaldo</h2>
    <ol className="ops-sgai-steps"><li><strong>Crea tu cuenta y obtén la clave</strong><p>Encuéntrala en tu cuenta de <a href="https://scrapegraphai.com/" target="_blank" rel="noreferrer">ScrapeGraphAI ↗</a> y guárdala aquí.</p></li>
      <li><strong>Comprueba la conexión</strong><p>Consultamos el saldo para verificar que Inforce puede acceder a tu cuenta.</p></li>
      <li><strong>Prueba con anuncios reales</strong><p>El siguiente paso será una prueba limitada para revisar anuncios, imágenes, videos y cobertura. Costo previsto: 6 créditos por consulta, sujeto a la tarifa del proveedor.</p></li></ol>
    <p className="ops-notice">El respaldo automático sigue pendiente de validación. Guardar la clave o comprobar el saldo no inicia consultas de anuncios.</p>
    <p className="ops-note"><a href="https://docs.scrapegraphai.com/services/scrape" target="_blank" rel="noreferrer">Ver tarifas por consulta ↗</a></p>
  </section></div>;
}
