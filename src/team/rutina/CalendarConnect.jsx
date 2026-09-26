import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { getCalendarUrl, saveCalendarUrl } from "./rutinaDb.js";

const VALID = /^https:\/\/calendar\.google\.com\/calendar\/ical\/\S+\.ics$/i;

// Conectar Google Calendar pegando la "dirección secreta en formato iCal" (solo lectura).
export function CalendarConnect({ memberId, error, onClose, onChanged }) {
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getCalendarUrl(memberId).then(({ data }) => { if (alive) setConnected(!!data?.calendar_ics_url); });
    return () => { alive = false; };
  }, [memberId]);

  const save = async (value) => {
    if (value && /\/public\//i.test(value)) { setMsg('Esa es la dirección PÚBLICA (solo funciona si tu calendario es público). Copia la de más abajo: "Dirección secreta en formato iCal" — trae la palabra "private" en el enlace.'); return; }
    if (value && !VALID.test(value.trim())) { setMsg("Esa no parece la dirección secreta iCal: debe empezar por https://calendar.google.com/calendar/ical/ y terminar en .ics"); return; }
    setBusy(true); setMsg("");
    const { error: err } = await saveCalendarUrl(memberId, value ? value.trim() : null);
    setBusy(false);
    if (err) { setMsg(err.message); return; }
    setUrl(""); setConnected(!!value);
    onChanged();
    if (value) onClose();
  };

  const step = { fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.5, margin: 0 };
  const ghost = { padding: "8px 14px", borderRadius: 50, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", background: DS.bgSide, border: DS.border, borderRadius: 16, padding: 22, fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DS.textPrimary }}>Google Calendar en tu rutina</div>
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 10px", borderRadius: 50, border: `1px solid ${connected ? DS.green : DS.textHint}`, color: connected ? DS.green : DS.textMuted }}>
            {connected ? "Conectado" : "Sin conectar"}
          </span>
        </div>
        <p style={step}>Tus llamadas y eventos aparecen dentro del calendario de Mi rutina. Es de solo lectura: el portal no puede crear ni cambiar nada en tu Google Calendar.</p>
        <ol style={{ ...step, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Abre <b>calendar.google.com</b> en el computador.</li>
          <li>A la izquierda, pasa el mouse sobre tu calendario → <b>⋮</b> → <b>Configuración y uso compartido</b>.</li>
          <li>Baja hasta <b>Integrar el calendario</b>. Hay dos direcciones iCal: copia la <b>última, "Dirección secreta en formato iCal"</b> (no la "pública"). Si sale tapada con puntos, dale al ícono de copiar.</li>
          <li>Pégala aquí y guarda.</li>
        </ol>
        <input
          id="gcal-url" aria-label="Dirección secreta en formato iCal" type="password" autoComplete="off" value={url}
          placeholder={connected ? "Pega una dirección nueva para reemplazar la actual" : "https://calendar.google.com/calendar/ical/…/basic.ics"}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && url) save(url); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none" }}
        />
        <p style={{ ...step, fontSize: 11.5, color: DS.textMuted }}>Esa dirección es privada: quien la tenga puede ver tus eventos. Se guarda solo en tu configuración y nunca se muestra. Si algún día la quieres anular, en Google Calendar hay un botón "Restablecer".</p>
        {(msg || error) && <div style={{ fontSize: 12, color: DS.red }}>{msg || error}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          {connected ? <button onClick={() => save(null)} disabled={busy} style={{ ...ghost, color: DS.red, borderColor: `${DS.red}66` }}>Desconectar</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghost}>Cerrar</button>
            <button onClick={() => save(url)} disabled={busy || !url} style={{ ...ghost, background: DS.textPrimary, color: DS.bg, borderColor: DS.textPrimary, opacity: url ? 1 : 0.5 }}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
