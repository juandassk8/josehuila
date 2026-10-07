import { Component, StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

// Separate entries keep legacy styles, widgets and onboarding out of /nueva.
const NuevaApp = lazy(() => import('./nueva/NuevaApp.jsx'));
const LegacyRoot = lazy(() => import('./LegacyRoot.jsx'));
const nueva = /^\/nueva(?:\/|$)/i.test(window.location.pathname);
class EntryBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert"><h1>No pudimos abrir Inforce</h1><p>Recarga la página para intentarlo de nuevo.</p><button onClick={() => window.location.reload()}>Recargar</button></div> : this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<StrictMode><EntryBoundary>
  <Suspense fallback={<div role="status" style={{ padding: 32 }}>Abriendo Inforce…</div>}>
    {nueva ? <NuevaApp /> : <LegacyRoot />}
  </Suspense>
</EntryBoundary></StrictMode>);
