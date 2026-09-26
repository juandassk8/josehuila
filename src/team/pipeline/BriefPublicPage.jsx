import { useEffect, useMemo, useState } from "react";
import { sanitizeScript } from "./ScriptEditor.jsx";
import { splitScriptSections } from "./scriptSections.js";
import { buildCreativeName, formatNum } from "./pipelineConstants.js";
import { ordenarContenidos } from "./numeracion.js";
import { drivePreviewUrl, isDriveLink } from "../../lib/driveLinks.js";
import { countScriptWords, secondsForWords, formatDurationLabel, PRIMARY_PACE_WPM } from "../../lib/scriptDuration.js";

// Hoja de rodaje pública — `/brief/<token>`.
//
// La abre una creadora que no tiene cuenta. No lee de Supabase (`anon` está
// bloqueado en las tablas de tenant): los datos llegan por `api/brief-share.js`,
// que devuelve solo lo que ella necesita para grabar.
//
// Usa los mismos tokens del tema claro del portal (copiados de `index.css`) en
// vez de heredarlos: la página es SIEMPRE clara —se imprime— y así no depende
// de si quien la abre tiene el portal en oscuro.
//
// Se graban TODOS los hooks, no se elige uno: por eso van numerados y con el
// mismo peso. El cuerpo y el cierre se graban una sola vez.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] || ""}`.trim();
}

// Duración de UNA toma: un hook + el cuerpo + el cierre. Sumar los cinco hooks
// daría un número que no existe en ningún video.
function duracion(sections) {
  const text = [sections.hooks[0] || "", ...sections.body, ...sections.cta].join(" ");
  const words = countScriptWords(text);
  if (!words) return "";
  return formatDurationLabel(secondsForWords(words, PRIMARY_PACE_WPM));
}

export function BriefPublicPage({ token }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [playing, setPlaying] = useState(null);   // referencia abierta en el visor

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brief-share?token=${encodeURIComponent(token || "")}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) setState({ status: "error", data: null, error: json?.error || "No se pudo abrir el brief." });
        else setState({ status: "ok", data: json, error: "" });
      })
      .catch(() => { if (!cancelled) setState({ status: "error", data: null, error: "No hay conexión. Intenta de nuevo." }); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    document.title = state.data?.brief ? `${state.data.brief} · Hoja de rodaje` : "Hoja de rodaje";
  }, [state.data]);

  // Mismo orden que el board: agrupado por concepto.
  //
  // Si la hoja que recibe la UGC saliera en otro orden que la pantalla donde Nath la
  // armó, cruzar «el tercero de la lista» entre las dos sería imposible. El orden es
  // parte de lo que se comparte, no una decisión de cada pantalla.
  const slots = useMemo(() => ordenarContenidos(state.data?.slots || []), [state.data]);

  return (
    <div className="bp">
      <style>{CSS}</style>

      {state.status === "loading" && <div className="bp-center"><div className="bp-loading">Abriendo la hoja…</div></div>}

      {state.status === "error" && (
        <div className="bp-center">
          <div className="bp-empty">
            <h1>{state.error}</h1>
            <p>Pídele un link nuevo a quien te lo envió.</p>
          </div>
        </div>
      )}

      {state.status === "ok" && (
        <div className="bp-page">
          <Header company={state.data.company} brief={state.data.brief} slots={slots} />
          <main className="bp-main">
            {slots.length === 0 && <div className="bp-sheet bp-sheet--empty"><h2>Todavía no hay guiones acá.</h2><p>Quien te mandó el link los está terminando.</p></div>}
            {slots.map((s) => <Sheet key={s.num} slot={s} onPlay={setPlaying} />)}
          </main>
          <footer className="bp-foot">
            <span>{state.data.company || "Inforce"}</span>
            <button type="button" className="bp-btn bp-btn--ghost bp-noprint" onClick={() => window.print()}>Guardar en PDF</button>
          </footer>
        </div>
      )}

      {playing && <Player ref_={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

// ── Encabezado: sitúa a alguien que nunca vio esto ──────────────────────────
function Header({ company, brief, slots }) {
  const due = slots.map((s) => s.due).filter(Boolean).sort()[0];
  return (
    <header className="bp-head">
      <div className="bp-eyebrow">{company ? `${company} · ` : ""}Hoja de rodaje</div>
      <h1 className="bp-title">{brief}</h1>
      <p className="bp-lede">
        {slots.length === 1 ? "1 video para grabar" : `${slots.length} videos para grabar`}
        {due ? ` · el primero se entrega el ${fechaCorta(due)}` : ""}
      </p>
    </header>
  );
}

// ── Un guion ────────────────────────────────────────────────────────────────
function Sheet({ slot, onPlay }) {
  const sections = useMemo(() => splitScriptSections(slot.script), [slot.script]);
  const { hooks, body, cta } = sections;
  const nombre = buildCreativeName(slot) || slot.producto || "Creativo";
  const archivo = `${formatNum(slot.num)} - ${nombre}`;
  const dur = duracion(sections);
  const refs = (slot.refs || []).filter((r) => r.cover || r.video || r.meta);
  const vacio = !hooks.length && !body.length && !cta.length && !sections.raw;

  return (
    <article className="bp-sheet">
      <header className="bp-sheet-head">
        <span className="bp-num">{formatNum(slot.num)}</span>
        <h2 className="bp-name">{nombre}</h2>
        <div className="bp-tags">
          {dur && <span className="bp-tag">≈{dur}</span>}
          {slot.due && <span className="bp-tag bp-tag--due">Entrega {fechaCorta(slot.due)}</span>}
        </div>
      </header>

      <div className="bp-cols">
        <aside className="bp-side">
          {(refs.length > 0 || slot.loom) && (
            <section className="bp-box bp-box--antes">
              <span className="bp-label">Antes de grabar</span>
              {refs.map((r) => <RefBlock key={r.id || r.name} r={r} onPlay={onPlay} />)}
              {slot.loom && (
                <a className="bp-btn bp-btn--soft" href={slot.loom} target="_blank" rel="noreferrer">
                  <Icon name="play" /> Ver las indicaciones
                </a>
              )}
            </section>
          )}

          <section className="bp-box bp-box--despues">
            <span className="bp-label">Cuando termines</span>
            {slot.upload
              ? <a className="bp-btn bp-btn--primary" href={slot.upload} target="_blank" rel="noreferrer"><Icon name="up" /> Abrir la carpeta</a>
              : <div className="bp-missing">Pídele la carpeta a quien te mandó el link</div>}
            <FileName value={archivo} />
          </section>
        </aside>

        <div className="bp-script">
          {vacio && <p className="bp-missing">Este guion todavía se está escribiendo.</p>}

          {sections.raw && <Block title="Guion" items={[sections.raw]} />}
          {sections.lead?.length > 0 && <Block title="Antes de empezar" items={sections.lead} small />}

          {hooks.length > 0 && (
            <Block title="Hook" items={hooks} numbered
              hint={hooks.length > 1 ? `graba los ${hooks.length}, uno por toma` : ""} />
          )}
          {body.length > 0 && <Block title="Body" items={body} />}
          {cta.length > 0 && <Block title="CTA" items={cta} />}
          {(sections.extra || []).map((e) => <Block key={e.title} title={e.title} items={e.items} small />)}
        </div>
      </div>
    </article>
  );
}

// Un bloque del guion: Hook, Body o CTA.
//
// Cada beat va en su propia fila con una marca al costado —número si es un hook
// (cada uno es una toma distinta), punto si es cuerpo o cierre. Antes eran
// párrafos pegados y se leía como un muro; la marca y el aire dan el ritmo con
// el que de verdad se graba, frase por frase.
//
function Block({ title, items, hint = "", numbered = false, small = false }) {
  return (
    <section className={`bp-block${small ? " bp-block--small" : ""}`}>
      <div className="bp-block-head">
        <h3 className="bp-block-title">{title}</h3>
        {hint && <span className="bp-hint">{hint}</span>}
        <span className="bp-rule" />
      </div>
      <ol className="bp-beats">
        {items.map((t, i) => (
          <li key={i} className="bp-beat">
            {numbered
              ? <span className="bp-beat-n">{i + 1}</span>
              : <span className="bp-beat-dot" aria-hidden="true" />}
            <span className="bp-beat-txt" dangerouslySetInnerHTML={{ __html: sanitizeScript(t) }} />
          </li>
        ))}
      </ol>
    </section>
  );
}

// Nombre con el que tiene que subir el archivo. Se copia de un toque: tipearlo
// a mano es justo donde se rompe la trazabilidad con el creativo del portal.
function FileName({ value }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(value)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); })
      .catch(() => {});
  };
  return (
    <div className="bp-file">
      <span className="bp-file-cap">Súbelo con este nombre</span>
      <code className="bp-file-name">{value}</code>
      <button type="button" className="bp-file-copy bp-noprint" onClick={copiar}>
        <Icon name={copiado ? "check" : "copy"} /> {copiado ? "Copiado" : "Copiar nombre"}
      </button>
    </div>
  );
}

// ── Referencia: se ve que ES la referencia, no un video suelto ──────────────
function RefBlock({ r, onPlay }) {
  const [broken, setBroken] = useState(false);
  const titulo = r.name || "Referencia";
  const playable = !!r.video;
  const Tag = playable ? "button" : (r.meta ? "a" : "div");
  const props = playable
    ? { type: "button", onClick: () => onPlay(r) }
    : (r.meta ? { href: r.meta, target: "_blank", rel: "noreferrer" } : {});
  return (
    <Tag className={`bp-ref${playable || r.meta ? "" : " bp-ref--flat"}`} title={playable ? `Ver ${titulo}` : undefined} {...props}>
      <span className="bp-ref-thumb">
        {r.cover && !broken
          ? <img src={r.cover} alt="" loading="lazy" onError={() => setBroken(true)} />
          : <span className="bp-ref-blank" />}
        {(playable || r.meta) && <span className="bp-ref-play"><Icon name="play" /></span>}
      </span>
      <span className="bp-ref-txt">
        <span className="bp-ref-kicker">El video de referencia</span>
        <span className="bp-ref-name">{titulo}</span>
        {r.brand && <span className="bp-ref-brand">{r.brand}</span>}
      </span>
    </Tag>
  );
}

// ── Visor de la referencia ──────────────────────────────────────────────────
function Player({ ref_, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const drive = isDriveLink(ref_.video) ? drivePreviewUrl(ref_.video) : null;
  return (
    <div className="bp-player" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bp-player-box">
        <button type="button" className="bp-player-x" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        {drive
          ? <iframe src={drive} title="Referencia" allow="autoplay" allowFullScreen />
          : <video src={ref_.video} controls autoPlay playsInline poster={ref_.cover || undefined} />}
      </div>
    </div>
  );
}

function Icon({ name }) {
  const p = {
    play: <path d="M8 5v14l11-7z" fill="currentColor" />,
    up: <path d="M12 19V5M5 12l7-7 7 7" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7" />,
  }[name];
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────
// Los tokens son los del tema CLARO del portal (`index.css :root.light`),
// declarados acá para que la página no dependa de la clase del <html>.
const CSS = `
.bp {
  --bg: #EBF2FC;
  --surface: #FFFFFF;
  --surface-2: #F4F8FE;
  --line: rgba(38,100,204,0.16);
  --line-2: rgba(38,100,204,0.30);
  --ink: #0B1626; --ink-2: #465879; --ink-3: #7183A1; --ink-4: #93A3BD;
  --sel: #1F62C8; --sel-soft: rgba(38,100,204,0.13);
  --chip: rgba(38,100,204,0.09);
  --amber: #C4801C;
  --shadow: inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.55), 0 8px 28px rgba(16,44,100,0.10);
  --font: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
  min-height: 100vh;
  background: var(--bg);
  background-image:
    radial-gradient(720px 400px at 14% -10%, rgba(38,100,204,0.15), transparent 62%),
    radial-gradient(600px 360px at 94% 2%, rgba(110,84,208,0.09), transparent 64%);
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
}
.bp *, .bp *::before, .bp *::after { box-sizing: border-box; }
.bp p { margin: 0; }
.bp-page { padding: 0 24px 72px; }

.bp-center { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.bp-loading { font-size: 14px; color: var(--ink-3); animation: bp-pulse 1.4s ease-in-out infinite; }
@keyframes bp-pulse { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
.bp-empty { max-width: 420px; text-align: center; }
.bp-empty h1 { font-size: 21px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; }
.bp-empty p { font-size: 15px; color: var(--ink-2); line-height: 1.5; }

/* Encabezado */
.bp-head { max-width: 1160px; margin: 0 auto; padding: 52px 4px 26px; }
.bp-eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; color: var(--ink-3); }
.bp-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.035em; line-height: 1.05; margin: 8px 0 0; }
.bp-lede { font-size: 15.5px; color: var(--ink-2); margin-top: 8px; }

/* La hoja */
.bp-main { max-width: 1160px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.bp-sheet { background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); border-radius: 18px; padding: 22px 24px 24px; }
.bp-sheet--empty { text-align: center; padding: 48px 24px; }
.bp-sheet--empty h2 { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
.bp-sheet--empty p { font-size: 14px; color: var(--ink-3); }

/* Cabecera compacta: número, nombre del creativo y los datos, en una línea */
.bp-sheet-head { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.bp-num { font-family: var(--mono); font-size: 12.5px; font-weight: 500; color: var(--sel); background: var(--sel-soft); border-radius: 8px; padding: 4px 9px; flex: none; }
.bp-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.015em; margin: 0; line-height: 1.35; }
.bp-tags { display: flex; align-items: center; gap: 8px; flex: none; }
.bp-tag { font-family: var(--mono); font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.bp-tag--due { color: var(--ink-2); background: var(--chip); border-radius: 7px; padding: 4px 9px; }

/* Dos columnas en computador; apiladas en teléfono */
.bp-cols { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 30px; padding-top: 18px; align-items: start; }
.bp-side { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 18px; }
.bp-box { background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 13px; display: flex; flex-direction: column; gap: 10px; }
.bp-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink-3); margin: 0; display: flex; align-items: baseline; gap: 9px; }
.bp-hint { font-size: 11px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--ink-3); }

/* Referencia */
.bp-ref { display: flex; align-items: center; gap: 11px; width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font: inherit; color: inherit; text-align: left; cursor: pointer; text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease; }
.bp-ref:hover { border-color: var(--line-2); box-shadow: 0 0 0 3px var(--sel-soft); }
.bp-ref--flat { cursor: default; }
.bp-ref--flat:hover { border-color: var(--line); box-shadow: none; }
.bp-ref-thumb { position: relative; width: 54px; height: 68px; flex: none; border-radius: 9px; overflow: hidden; background: var(--chip); display: block; }
.bp-ref-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bp-ref-blank { display: block; width: 100%; height: 100%; background: repeating-linear-gradient(135deg, rgba(38,100,204,0.10) 0 6px, transparent 6px 12px); }
.bp-ref-play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; }
.bp-ref-play svg { width: 20px; height: 20px; filter: drop-shadow(0 1px 4px rgba(0,0,0,.6)); }
.bp-ref-txt { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.bp-ref-kicker { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sel); }
.bp-ref-name { font-size: 12.5px; font-weight: 600; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bp-ref-brand { font-size: 11.5px; color: var(--ink-3); }

/* Nombre del archivo */
.bp-file { display: flex; flex-direction: column; gap: 6px; }
.bp-file-cap { font-size: 11.5px; color: var(--ink-3); }
.bp-file-name { font-family: var(--mono); font-size: 11.5px; line-height: 1.5; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; word-break: break-word; }
.bp-file-copy { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-family: var(--font); font-size: 12.5px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
.bp-file-copy:hover { border-color: var(--line-2); color: var(--ink); }

/* Guion — lo más grande de la página.
   El ancho está topado a ~62 caracteres: en pantalla ancha, la línea larga es
   justo lo que hace que se lea como un muro de texto. */
.bp-script { display: flex; flex-direction: column; gap: 26px; max-width: 680px; }
.bp-block { display: flex; flex-direction: column; gap: 12px; }
.bp-block-head { display: flex; align-items: center; gap: 10px; }
.bp-block-title { font-size: 12.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sel); margin: 0; flex: none; }
.bp-hint { font-size: 11.5px; font-weight: 500; color: var(--ink-3); flex: none; }
.bp-rule { flex: 1; height: 1px; background: var(--line); }

/* Cada beat en su fila, con marca al costado: así se lee frase por frase, que
   es como se graba. Número para los hooks (cada uno es una toma). */
.bp-beats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.bp-beat { display: flex; gap: 13px; }
.bp-beat-n { width: 21px; height: 21px; flex: none; display: grid; place-items: center; border-radius: 7px; background: var(--sel-soft); color: var(--sel); font-family: var(--mono); font-size: 11px; margin-top: 5px; }
.bp-beat-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--line-2); margin: 12px 7px 0 8px; }
.bp-beat-txt { min-width: 0; font-size: 18px; line-height: 1.65; color: var(--ink); }
.bp-beat-txt p { margin: 0 0 8px; }
.bp-beat-txt p:last-child { margin-bottom: 0; }
.bp-beat-txt ul, .bp-beat-txt ol { margin: 6px 0; padding-left: 20px; }
.bp-block--small .bp-beat-txt { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; }

/* Botones */
.bp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; border-radius: 11px; border: 1px solid transparent; font-family: var(--font); font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none; }
.bp-btn--primary { background: var(--ink); color: #fff; }
.bp-btn--primary:hover { background: #16243a; }
.bp-btn--soft { background: var(--surface); border-color: var(--line); color: var(--ink); }
.bp-btn--soft:hover { border-color: var(--line-2); }
.bp-btn--ghost { background: transparent; border-color: var(--line-2); color: var(--ink-2); padding: 9px 15px; font-size: 12.5px; font-weight: 600; }
.bp-missing { font-size: 12.5px; color: var(--amber); line-height: 1.45; }

.bp-foot { max-width: 1160px; margin: 26px auto 0; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-4); }

/* Visor */
.bp-player { position: fixed; inset: 0; z-index: 60; background: rgba(9,16,30,.72); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; }
.bp-player-box { position: relative; width: min(420px, 100%); aspect-ratio: 9/16; max-height: 88vh; background: #000; border-radius: 16px; overflow: hidden; }
.bp-player-box iframe, .bp-player-box video { width: 100%; height: 100%; border: 0; display: block; object-fit: contain; }
.bp-player-x { position: absolute; top: 8px; right: 8px; z-index: 2; width: 34px; height: 34px; display: grid; place-items: center; border: none; border-radius: 10px; background: rgba(0,0,0,.55); color: #fff; cursor: pointer; }

/* Una sola columna cuando no hay ancho para el riel */
@media (max-width: 860px) {
  /* En teléfono el orden es el del trabajo: mira la referencia, lee el guion,
     y recién al final subes el material. display:contents deja que los dos
     bloques del riel se ordenen alrededor del guion. */
  .bp-cols { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .bp-side { display: contents; }
  .bp-box--antes { order: 1; }
  .bp-script { order: 2; max-width: none; }
  .bp-box--despues { order: 3; }
}
@media (max-width: 560px) {
  .bp-page { padding: 0 12px 48px; }
  .bp-head { padding: 32px 6px 20px; }
  .bp-sheet { padding: 18px; border-radius: 16px; }
  .bp-sheet-head { flex-wrap: wrap; }
  .bp-name { flex-basis: 100%; order: 3; }
  .bp-beat-txt { font-size: 17px; }
}

/* Impresión: sin cromo y sin bloques partidos. Los links van escritos porque en
   papel un botón no lleva a ningún lado. */
@page { margin: 13mm; }
@media print {
  .bp { background: #fff; background-image: none; }
  .bp-page { padding: 0; }
  .bp-noprint, .bp-player, .bp-ref-play { display: none !important; }
  .bp-head { padding: 0 0 16px; }
  .bp-sheet { box-shadow: none; border: none; border-top: 1.5px solid #99a; border-radius: 0; padding: 12px 0 0; margin-bottom: 6px; }
  .bp-cols { grid-template-columns: 210px minmax(0, 1fr); gap: 20px; padding-top: 12px; }
  .bp-side { position: static; }
  .bp-box { background: none; }
  .bp-sheet-head { break-inside: avoid; break-after: avoid; }
  .bp-block, .bp-beat, .bp-box { break-inside: avoid; page-break-inside: avoid; }
  .bp-label, .bp-block-head { break-after: avoid; }
  .bp-beat-txt { font-size: 12pt; }
  .bp-script { max-width: none; }
  /* En papel el botón no lleva a ningún lado: se imprime como una línea con su
     dirección debajo. Con el borde puesto, la URL larga lo deformaba entero. */
  .bp-btn { display: block; border: none !important; background: none !important; color: #000 !important; padding: 2px 0 !important; font-size: 10pt; text-align: left; }
  .bp-side a[href]::after { display: block; content: attr(href); font-family: var(--mono); font-size: 7.5pt; font-weight: 400; color: #445; word-break: break-all; }
  /* Las sombras del tema salen como rectángulos grises en la impresora. */
  .bp-sheet, .bp-box, .bp-ref { box-shadow: none !important; }
}
`;

export default BriefPublicPage;
