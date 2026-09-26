import { useCallback, useEffect, useState } from 'react';
import { database } from '../../lib/backend.js';
import { creativeRequest, decodeConnection } from './client.js';
import './creativeImages.css';

export default function CreativeConnect() {
  const [request] = useState(() => decodeConnection(window.location.search));
  const [companies, setCompanies] = useState([]), [companyId, setCompanyId] = useState('');
  const [scope, setScope] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [phase, setPhase] = useState('loading'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!request) { setError('Este enlace de conexión no es válido. Inicia la conexión desde ChatGPT.'); setPhase('invalid'); return; }
    const { data } = await database.auth.getSession();
    if (!data?.session) { setPhase('login'); return; }
    const [info, result] = await Promise.all([
      creativeRequest('inspect', { request }, { method: 'POST', auth: true }), creativeRequest('companies'),
    ]);
    setScope(info.scope); setCompanies(result.companies); setCompanyId(result.companies[0]?.id || ''); setPhase('consent');
  }, [request]);
  useEffect(() => { load().catch(e => { setError(e.message); setPhase('invalid'); }); }, [load]);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await database.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error('No pudimos iniciar sesión. Revisa tu correo y contraseña de Inforce.');
      setPassword(''); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError('');
    try {
      const result = await creativeRequest('approve', { request, companyId }, { method: 'POST', auth: true });
      // Server only returns the exact allowlisted OAuth redirect, never a URL supplied by the widget.
      window.location.assign(result.redirect);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <main className="creative-images ci-connect"><section className="ci-panel ci-consent">
    <a className="ci-brand" href="/">Inforce</a>
    <h1>Conectar con ChatGPT</h1>
    <p>Elige qué empresa podrá consultar esta cuenta de ChatGPT.</p>
    {error && <p className="ci-error" role="alert">{error}</p>}
    {phase === 'loading' && <p role="status">Comprobando tu sesión…</p>}
    {phase === 'login' && <form onSubmit={login} className="ci-form">
      <p>Inicia sesión con tu cuenta de Inforce.</p>
      <label>Correo de Inforce<input autoComplete="username" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Contraseña de Inforce<input autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="ci-primary" disabled={busy}>{busy ? 'Entrando…' : 'Continuar'}</button>
    </form>}
    {phase === 'consent' && <div className="ci-form">
      <label>Empresa<select value={companyId} onChange={e => setCompanyId(e.target.value)} disabled={busy || !companies.length}>
        {!companies.length && <option value="">No tienes empresas disponibles</option>}
        {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select></label>
      <div className="ci-permissions"><strong>Permisos que autorizas</strong><ul>
        <li>Consultar productos y tus referencias guardadas de esta empresa.</li>
        <li>Ver las imágenes recibidas en esta empresa.</li>
        {scope.split(' ').includes('creatives:write') && <li>Guardar archivos de imagen desde ChatGPT.</li>}
      </ul><p>Puedes desconectar tu cuenta desde Crear imágenes en Inforce. La autorización vence en 30 días.</p></div>
      <button className="ci-primary" onClick={connect} disabled={busy || !companyId}>{busy ? 'Conectando…' : 'Autorizar esta empresa'}</button>
    </div>}
    <a className="ci-cancel" href="/">Cancelar y volver a Inforce</a>
  </section></main>;
}
