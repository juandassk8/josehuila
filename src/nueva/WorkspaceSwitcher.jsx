import { useEffect, useId, useRef, useState } from 'react';
import { initials } from './model.js';
import { Icon } from './ui.jsx';

/* Hallmark · component: workspace picker · supplied Inforce glass kit
 * Pre-emit critique: P5 H5 E4 S5 R5 V4. Existing tenant permissions stay upstream. */
export default function WorkspaceSwitcher({ companies, company, onChange, status = 'ready' }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const search = useRef({ value: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const options = [...companies.filter(row => !row.archived), ...companies.filter(row => row.archived)];
  const disabled = !options.length || status === 'loading' || status === 'error';
  const firstArchived = options.findIndex(row => row.archived);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, cursor]);

  function expand(index = options.findIndex(row => row.id === company?.id)) {
    if (disabled) return;
    search.current = { value: '', at: 0 };
    setCursor(Math.max(0, index));
    setOpen(true);
  }
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function choose(row) {
    close(true);
    if (row.id !== company?.id) onChange(row.id);
  }
  function onKeyDown(event) {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault(); close(true);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setCursor(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (options[cursor]) choose(options[cursor]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - search.current.at < 700 ? search.current.value : '';
      const value = previous + event.key.toLocaleLowerCase('es');
      search.current = { value, at: now };
      const prefix = [...value].every(char => char === value[0]) ? value[0] : value;
      const normalize = text => text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const next = options.findIndex((_, offset) => normalize(options[(cursor + 1 + offset) % options.length].name).startsWith(normalize(prefix)));
      if (next >= 0) setCursor((cursor + 1 + next) % options.length);
    }
  }

  const label = status === 'loading' ? 'Cargando espacios…' : status === 'error' ? 'Espacios no disponibles'
    : company?.name || 'Sin empresa asignada';
  return <div className="nf-workspace-switch" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <p className="nf-workspace-label" id={`${id}-label`}>Espacio de trabajo</p>
    <button type="button" className="nf-workspace-trigger" ref={trigger} disabled={disabled}
      data-state={status} aria-busy={status === 'loading' || undefined}
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      onClick={() => open ? close() : expand()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); expand(event.key === 'ArrowUp' ? options.length - 1 : undefined);
        }
      }}>
      <span className="nf-avatar" aria-hidden="true">{initials(company?.name)}</span>
      <span className="nf-workspace-name" id={`${id}-value`}><strong title={label}>{label}</strong>{company?.archived && <small>Archivada</small>}</span>
      {status === 'loading' ? <span className="nf-spinner" aria-hidden="true" /> : <Icon name={status === 'error' ? 'info' : status === 'success' ? 'check' : 'chevron'} size={16} />}
    </button>
    {open && <div className="nf-workspace-popover">
      <div className="nf-workspace-list" id={`${id}-list`} ref={list} role="listbox" tabIndex={-1}
        aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-option-${cursor}`} onKeyDown={onKeyDown}>
        {[{ rows: options.filter(row => !row.archived), start: 0, label: 'Tus empresas' },
          { rows: options.filter(row => row.archived), start: firstArchived, label: 'Empresas archivadas' }]
          .filter(group => group.rows.length).map(group => <div role="group" aria-label={group.label} key={group.label}>
            <p className="nf-workspace-group" aria-hidden="true">{group.label}</p>
            {group.rows.map((row, offset) => {
              const index = group.start + offset;
              return <div id={`${id}-option-${index}`} key={row.id} role="option" aria-selected={row.id === company?.id}
                data-index={index} data-highlighted={index === cursor} className="nf-workspace-option"
                onPointerMove={() => setCursor(index)} onClick={() => choose(row)} title={row.name}>
                <span className="nf-avatar" aria-hidden="true">{initials(row.name)}</span>
                <span className="nf-workspace-name"><strong>{row.name}</strong>{row.archived && <small>Archivada</small>}</span>
                {row.id === company?.id && <Icon name="check" size={16} />}
              </div>;
            })}
          </div>)}
      </div>
    </div>}
  </div>;
}
