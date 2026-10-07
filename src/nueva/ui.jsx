import { useEffect, useRef } from 'react';
const icons = {
  dashboard: 'M3 3h7v7H3z M14 3h7v4h-7z M3 14h7v7H3z M14 11h7v10h-7z',
  tag: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  inbox: 'M4 4h16l2 10v6H2v-6z M2 14h6l2 3h4l2-3h6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  sliders: 'M3 6h7 M14 6h7 M3 12h12 M19 12h2 M3 18h2 M9 18h12 M10 3v6 M15 9v6 M5 15v6',
  network: 'M9 3h6v6H9z M3 16h6v5H3z M15 16h6v5h-6z M12 9v4 M6 16v-3h12v3',
  key: 'M14 3a7 7 0 1 1-4 13L3 23H1v-5l7-7a7 7 0 0 1 6-8 M17 7h.01',
  history: 'M3 4v6h6 M3 10a9 9 0 1 1 2 8 M12 7v5l3 2',
  orbit: 'M21 12a9 9 0 1 1-9-9 M20 3l1 4-4-1 M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0 M15 9l6-6',
  library: 'M3 4h7v7H3z M14 4h7v7h-7z M3 15h7v6H3z M14 15h7v6h-7z',
  arrow: 'M5 12h14 M13 6l6 6-6 6', chevron: 'm8 10 4 4 4-4',
  logout: 'M9 4H4v16h5 M10 12h11 m-4-4 4 4-4 4',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M9 12l2 2 4-4',
  menu: 'M4 6h16 M4 12h16 M4 18h16', close: 'm6 6 12 12 M6 18 18 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  lock: 'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
  box: 'm3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 5 9-5 M12 12v9 M7 5l10 5',
  voice: 'M8 7a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0z M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8',
  globe: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0 M3 12h18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18',
  document: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',
  edit: 'm14 5 5 5 M4 20l5-1L21 7l-5-5L4 14z', plus: 'M12 5v14 M5 12h14',
  refresh: 'M20 10a8 8 0 1 0-2 8 M20 4v6h-6', check: 'm5 12 4 4L19 6',
  info: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0 M12 11v6 M12 7v.1',
  external: 'M14 3h7v7 M21 3 10 14 M10 4H4v16h16v-6',
};
export function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name] || icons.orbit} /></svg>;
}
export function Logo() { return <span className="nf-logo"><span className="nf-symbol"><Icon name="orbit" size={24} /></span><span>Inforce<span className="nf-logo-caption">Espacio creativo</span></span></span>; }
export function Loading({ text = 'Cargando tu espacio…' }) { return <div className="nf-loading" role="status"><span className="nf-spinner" />{text}</div>; }
export function Notice({ children, error = false, retry }) { return <div className={`nf-notice${error ? ' nf-error' : ''}`} role={error ? 'alert' : 'status'}><Icon name="info" /><div>{children}</div>{retry && <button className="nf-button nf-secondary" onClick={retry}>Reintentar</button>}</div>; }
export function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="nf-dialog nf-surface" aria-labelledby="nf-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><p className="nf-eyebrow">Universo de marca</p><h2 id="nf-dialog-title">{title}</h2></div><button className="nf-icon-button" aria-label="Cerrar edición" onClick={onClose} disabled={busy}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}
