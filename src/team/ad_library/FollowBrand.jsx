import { useEffect, useRef, useState } from 'react';
import { request } from './workspaceHelpers.js';

export function FollowBrand({ companyId, onSaved }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const data = await request('POST', { action: 'request-brand', companyId, url });
      if (alive.current) { setUrl(''); onSaved(data); }
    } catch (cause) { if (alive.current) setError(cause.message); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="adlib-follow-box" aria-label="Seguir una marca">
    <form className="adlib-follow" onSubmit={submit}>
      <div><h2>Seguir una marca</h2><p>Pega su sitio web, fanpage o biblioteca de anuncios. Guardaremos el enlace y prepararemos su biblioteca con el nombre de su fanpage.</p></div>
      <input aria-label="Enlace de la marca" placeholder="https://…" maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} required disabled={busy} />
      <button className="adlib-primary" disabled={busy || !companyId}>{busy ? 'Guardando…' : 'Seguir marca'}</button>
    </form>
    {error && <p className="adlib-error" role="alert">{error}</p>}
  </section>;
}
