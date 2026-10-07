import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { database } from '../lib/backend.js';
import { loadWorkspace } from './data.js';
import { AUTH_ROUTES, canManageBrand, initials, isPlatformAdmin, routeFor, safeReturnPath, selectedCompany } from './model.js';
import { Icon, Loading, Logo, Notice } from './ui.jsx';
import AuthPage from './AuthPage.jsx';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import { ADMIN_SECTIONS, adminSection } from '../team/admin/navigation.js';
import './nueva.css';

const Universe = lazy(() => import('./Universe.jsx'));
const Library = lazy(() => import('../team/ad_library/AdLibraryPage.jsx').then(module => ({ default: module.AdLibraryPage })));
const Administration = lazy(() => import('../team/admin/AdministrationPage.jsx'));

function useLocation() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener('popstate', update); window.addEventListener('pathchange', update);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener('pathchange', update); };
  }, []);
  const navigate = useCallback((href, replace = false) => {
    if (href === window.location.pathname + window.location.search) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
    window.dispatchEvent(new Event('pathchange'));
  }, []);
  const link = useCallback(href => ({ href, onClick: event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(href);
  } }), [navigate]);
  return { location, navigate, link };
}

function useSession() {
  const [state, setState] = useState({ loading: true, user: null, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let seenEvent = false;
    const accept = session => { if (active) setState({ loading: false, user: session?.user || null, error: '' }); };
    const timer = setTimeout(() => { if (active) setState({ loading: false, user: null, error: 'La conexión está tardando demasiado. Reintenta para verificar tu sesión.' }); }, 15000);
    const { data: { subscription } } = database.auth.onAuthStateChange((_event, session) => { seenEvent = true; clearTimeout(timer); accept(session); });
    database.auth.getSession().then(({ data, error }) => {
      clearTimeout(timer);
      if (!active || seenEvent) return;
      if (error && error.status !== 401) setState({ loading: false, user: null, error: 'No pudimos verificar tu sesión. Revisa tu conexión y reintenta.' });
      else accept(data?.session);
    }).catch(() => { clearTimeout(timer); if (active) setState({ loading: false, user: null, error: 'No pudimos verificar tu sesión.' }); });
    return () => { active = false; clearTimeout(timer); subscription.unsubscribe(); };
  }, [revision]);
  return { ...state, retry: () => { setState({ loading: true, user: null, error: '' }); setRevision(value => value + 1); } };
}

function MobileMenu({ children, close }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; const before = document.activeElement; dialog.showModal(); return () => { dialog.close(); before?.focus(); }; }, []);
  return <dialog className="nf-mobile-dialog" ref={ref} aria-label="Menú del espacio" onCancel={event => { event.preventDefault(); close(); }}><button className="nf-icon-button nf-menu-close" aria-label="Cerrar menú" onClick={close}><Icon name="close" /></button>{children}</dialog>;
}

function Workspace({ user, location, navigate, link, signOut }) {
  const userId = user.id;
  const [state, setState] = useState({ userId: '', data: null, error: '' });
  const [revision, setRevision] = useState(0);
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const main = useRef(null);
  const path = location.split('?')[0].split('/').filter(Boolean).slice(1);
  const page = path[0] || 'universo';
  const admin = page === 'admin';
  const requested = new URLSearchParams(location.split('?')[1]).get('empresa');
  const [adminTab, adminLabel] = adminSection(new URLSearchParams(location.split('?')[1]).get('seccion'));
  const adminHref = section => `/nueva/admin?seccion=${encodeURIComponent(section)}${requested ? `&empresa=${encodeURIComponent(requested)}` : ''}`;
  const retry = () => setRevision(value => value + 1);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { if (active) setState({ userId: user.id, data: null, error: 'La carga está tardando demasiado. Reintenta para abrir tus empresas.' }); }, 15000);
    setState({ userId: user.id, data: null, error: '' });
    loadWorkspace({ id: userId }).then(data => { if (active) setState({ userId, data, error: '' }); })
      .catch(() => { if (active) setState({ userId: user.id, data: null, error: 'No pudimos cargar tus empresas y permisos. Revisa tu conexión e inténtalo de nuevo.' }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [user.id, userId, revision]);
  useEffect(() => { setMenu(false); main.current?.focus(); window.scrollTo(0, 0); }, [location]);
  useEffect(() => { document.title = `${admin ? `${adminLabel} · Administración` : page === 'biblioteca' ? 'Biblioteca de anuncios' : 'Universo de marca'} · Inforce`; }, [admin, adminLabel, page]);
  const data = state.userId === user.id ? state.data : null;
  const company = selectedCompany(data?.companies || [], requested);
  const platformAdmin = isPlatformAdmin(data?.member);
  const manage = canManageBrand(company, user, data?.member, data?.memberships);
  const name = data?.member?.name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Tu cuenta';
  const role = platformAdmin ? 'Administrador' : data?.member?.active !== false && data?.member?.role === 'member' ? 'Equipo Inforce' : company?.owner_user_id === user.id ? 'Responsable' : 'Colaborador';
  async function logout() { setLoggingOut(true); await signOut(); setLoggingOut(false); }
  const navigation = () => <>
    <a className="nf-sidebar-logo" {...link('/nueva')} aria-label="Inforce, universo de marca"><Logo /></a>
    <WorkspaceSwitcher companies={data?.companies || []} company={company} onChange={id => navigate(routeFor(page === 'biblioteca' ? 'biblioteca' : 'universo', id))} />
    <nav aria-label="Módulos de tu empresa"><p className="nf-nav-caption">Crear con contexto</p><a {...link(routeFor('universo', company?.id))} aria-current={page === 'universo' ? 'page' : undefined}><Icon name="orbit" />Universo de marca</a><a {...link(routeFor('biblioteca', company?.id))} aria-current={page === 'biblioteca' ? 'page' : undefined}><Icon name="library" />Biblioteca de anuncios</a></nav>
    <div className="nf-sidebar-bottom"><div className="nf-user"><span className="nf-avatar">{initials(name)}</span><span><strong>{name}</strong><small>{role}</small></span><button className="nf-icon-button" aria-label="Cerrar sesión" disabled={loggingOut} onClick={logout}><Icon name="logout" /></button></div></div>
  </>;
  if (!data) return <div className="nf-session-screen"><Logo />{state.error ? <Notice error retry={retry}>{state.error}</Notice> : <Loading />}<button className="nf-button nf-secondary" onClick={logout} disabled={loggingOut}>Cerrar sesión</button></div>;
  if (admin) {
    const adminNavigation = <>
      <a className="nf-sidebar-logo" {...link(adminHref('overview'))} aria-label="Inforce, administración"><Logo /></a>
      <div className="nf-admin-context"><Icon name="shield" /><span>Administración<small>Control de Inforce</small></span></div>
      <nav className="nf-admin-navigation" aria-label="Secciones de administración"><p className="nf-nav-caption">Sistema</p>{ADMIN_SECTIONS.map(([key, label, icon]) => <a key={key} {...link(adminHref(key))} aria-current={adminTab === key ? 'page' : undefined}><Icon name={icon} />{label}</a>)}</nav>
      <div className="nf-sidebar-bottom"><div className="nf-user"><span className="nf-avatar">{initials(name)}</span><span><strong>{name}</strong><small>Administrador</small></span><button className="nf-icon-button" aria-label="Cerrar sesión" disabled={loggingOut} onClick={logout}><Icon name="logout" /></button></div></div>
    </>;
    return <div className={platformAdmin ? 'nf-workspace nf-administration' : 'nf-administration'}>
      {platformAdmin && <aside className="nf-sidebar nf-surface">{adminNavigation}</aside>}
      {platformAdmin && menu && <MobileMenu close={() => setMenu(false)}><div className="nf-sidebar-inner nf-admin-menu-inner" onClick={event => { if (event.target.closest('a')) setMenu(false); }}>{adminNavigation}</div></MobileMenu>}
      <div className="nf-workspace-body"><header className="nf-topbar nf-administration-topbar">
        {platformAdmin && <button className="nf-icon-button nf-menu-button" aria-label="Abrir menú de administración" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>}
        <span className="nf-breadcrumb">Administración <span>/</span><strong>{platformAdmin ? adminLabel : 'Acceso restringido'}</strong></span>
        <a className="nf-button nf-secondary nf-return-space" {...link(routeFor('universo', company?.id))}>Volver a mi espacio <Icon name="arrow" size={16} /></a>
      </header><main id="nf-content" ref={main} tabIndex={-1} className="nf-main nf-administration-main">{!platformAdmin ? <Notice error>Esta sección es exclusiva para administradores de Inforce. Puedes volver al espacio de tu empresa.</Notice> : <Suspense fallback={<Loading text="Cargando administración…" />}><Administration currentMember={data.member} section={adminTab} onSectionChange={section => navigate(adminHref(section))} showNavigation={false} onNavigate={target => target === 'adlibrary' ? navigate(routeFor('biblioteca', company?.id)) : window.location.assign(`/equipo/${target}`)} /></Suspense>}</main></div>
    </div>;
  }
  return <div className="nf-workspace">
    <aside className="nf-sidebar nf-surface">{navigation()}</aside>
    {menu && <MobileMenu close={() => setMenu(false)}><div className="nf-sidebar-inner" onClick={event => { if (event.target.closest('a')) setMenu(false); }}>{navigation()}</div></MobileMenu>}
    <div className="nf-workspace-body"><header className="nf-topbar"><button className="nf-icon-button nf-menu-button" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button><span className="nf-breadcrumb">Espacio de trabajo <span>/</span> <strong>{company?.name || 'Tu empresa'}</strong></span><div className="nf-topbar-end"><span className="nf-version">Nueva experiencia</span>{platformAdmin && <a className="nf-admin-link" {...link('/nueva/admin')}><Icon name="shield" size={16} />Administración</a>}</div></header>
      <main ref={main} id="nf-content" tabIndex={-1} className="nf-main">
        {!company ? <section className="nf-empty nf-surface"><Icon name="orbit" size={36} /><h1>Tu espacio está por comenzar</h1><p>Tu cuenta aún no tiene una empresa activa. Pide al administrador que la vincule para ver tu universo de marca y tus anuncios.</p><button className="nf-button nf-secondary" onClick={retry}><Icon name="refresh" />Actualizar acceso</button></section>
          : <Suspense fallback={<Loading text={page === 'biblioteca' ? 'Abriendo tu biblioteca…' : 'Cargando tu universo de marca…'} />}>{page === 'universo' ? <Universe key={company.id} company={company} canEdit={manage} link={link} /> : page === 'biblioteca' ? <div className="nf-library"><Library key={company.id} companies={data.companies} fixedCompanyId={company.id} currentMember={data.member} canManage={manage} /></div> : <section className="nf-empty"><h1>Esta sección no está disponible</h1><a className="nf-button nf-primary" {...link(routeFor('universo', company.id))}>Ir a Universo de marca</a></section>}</Suspense>}
      </main><footer className="nf-workspace-footer">Inforce <span>·</span> Un espacio para crear con contexto.</footer>
    </div>
  </div>;
}

export default function NuevaApp() {
  const { location, navigate, link } = useLocation();
  const session = useSession();
  const page = location.split('?')[0].split('/')[2] || '';
  const isAuth = AUTH_ROUTES.has(page);
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    document.documentElement.classList.add('nf-root');
    return () => document.documentElement.classList.remove('nf-root');
  }, []);
  useEffect(() => {
    if (session.loading || session.error) return;
    if (!session.user && !isAuth) navigate(`/nueva/login?volver=${encodeURIComponent(safeReturnPath(location))}`, true);
    if (session.user && isAuth) navigate(safeReturnPath(new URLSearchParams(location.split('?')[1]).get('volver')), true);
  }, [session.loading, session.error, session.user, isAuth, location, navigate]);
  useEffect(() => { if (isAuth) document.title = `${page === 'login' ? 'Inicia sesión' : page === 'registro' ? 'Registro' : 'Recuperar acceso'} · Inforce`; }, [page, isAuth]);
  async function signOut() {
    const { error } = await database.auth.signOut();
    setLogoutError(error ? 'No se confirmó el cierre de sesión en el servidor. Revisa tu conexión y vuelve a intentarlo antes de dejar este equipo.' : '');
    navigate('/nueva/login', true);
  }
  return <div className="nf-app"><a href="#nf-content" className="nf-skip">Saltar al contenido</a>
    {session.loading ? <div className="nf-session-screen"><Logo /><Loading /></div>
      : session.error ? <div className="nf-session-screen"><Logo /><Notice error retry={session.retry}>{session.error}</Notice></div>
        : session.user ? <Workspace key={session.user.id} user={session.user} location={location} navigate={navigate} link={link} signOut={signOut} />
          : <AuthPage key={page} page={isAuth ? page : 'login'} link={link} sessionError={logoutError} />}
  </div>;
}
