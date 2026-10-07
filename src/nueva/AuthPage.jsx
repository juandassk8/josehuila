import { useState } from 'react';
import { database } from '../lib/backend.js';
import { Icon, Logo, Notice } from './ui.jsx';

export default function AuthPage({ page, link, sessionError }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = page === 'login';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await database.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
      if (result.error) setError(result.error.status === 401 ? 'El correo o la contraseña no coinciden. Revisa tus datos e inténtalo de nuevo.' : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.');
    } catch { setError('No pudimos conectar con Inforce. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <div className="nf-auth">
    <header className="nf-auth-header"><a {...link('/nueva/login')} aria-label="Inforce, inicio de sesión"><Logo /></a><span className="nf-version">Nueva experiencia</span></header>
    <main className="nf-auth-grid" id="nf-content">
      <section className="nf-auth-story"><p className="nf-eyebrow">Tu espacio creativo</p><h1>{login ? <>Bienvenido<br />de vuelta.</> : <>Tu marca.<br />Un mismo lugar.</>}</h1>
        <p>El contexto de tu marca y los anuncios que te inspiran, conectados en un solo espacio.</p>
        <div className="nf-auth-features"><span><Icon name="orbit" />Universo de marca</span><span><Icon name="library" />Biblioteca de anuncios</span></div>
      </section>
      <section className="nf-auth-card nf-surface" aria-labelledby="nf-auth-title">
        <div className="nf-auth-card-heading"><h2 id="nf-auth-title">{login ? 'Inicia sesión' : page === 'registro' ? 'Crea tu acceso' : 'Recupera tu acceso'}</h2><p>{login ? 'Continúa donde lo dejaste.' : page === 'registro' ? 'Una cuenta para tu espacio de trabajo.' : 'Vuelve a entrar a tu espacio de trabajo.'}</p></div>
        {login ? <form onSubmit={submit} aria-busy={busy}>
          <label className="nf-field">Correo electrónico<input name="email" type="email" autoComplete="username" placeholder="tu@empresa.com" maxLength={254} required aria-invalid={!!error} aria-describedby={error ? 'nf-auth-error' : undefined} /></label>
          <div className="nf-password-heading"><label htmlFor="nf-password">Contraseña</label><a {...link('/nueva/recuperar')}>¿La olvidaste?</a></div>
          <div className="nf-password"><input id="nf-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" required aria-invalid={!!error} aria-describedby={error ? 'nf-auth-error' : undefined} /><button type="button" className="nf-icon-button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(value => !value)}><Icon name="eye" /></button></div>
          {(error || sessionError) && <div id="nf-auth-error"><Notice error>{error || sessionError}</Notice></div>}
          <button className="nf-button nf-primary nf-auth-submit" type="submit" disabled={busy}>{busy ? 'Iniciando sesión…' : 'Entrar a Inforce'}{!busy && <Icon name="arrow" />}</button>
          <div className="nf-auth-bottom">¿Todavía no tienes acceso? <a {...link('/nueva/registro')}>Registrarme <Icon name="arrow" size={15} /></a></div>
        </form> : <>
          <div className="nf-access-info"><span className="nf-symbol"><Icon name="lock" /></span><h3>{page === 'registro' ? 'Registro por invitación' : 'Tu administrador puede ayudarte'}</h3><p>{page === 'registro' ? 'Por ahora, el administrador de Inforce debe habilitar tu cuenta y vincularla a tu empresa. Cuando tengas tu correo y contraseña, ingresa por este mismo acceso.' : 'Pide al administrador de Inforce que restablezca tu contraseña. La recuperación automática por correo todavía no está disponible.'}</p></div>
          <a className="nf-button nf-primary nf-auth-submit" {...link('/nueva/login')}>Ir a iniciar sesión <Icon name="arrow" /></a>
        </>}
      </section>
    </main>
    <footer className="nf-auth-footer"><span>Inforce · Tu espacio de trabajo</span><span><Icon name="lock" size={14} />Acceso con correo y contraseña</span></footer>
  </div>;
}
