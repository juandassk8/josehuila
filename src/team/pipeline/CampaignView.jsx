import { DS } from "../../lib/design.js";
import { toast, toastSuccess } from "../../lib/toast.js";
import { TINT, buildAdName, marcarPublicado } from "./pipelineConstants.js";

// Vista In Campaign (README §5): dos grupos — Pendientes por publicar (ámbar) y
// Publicados (verde). Fila por creativo con checkbox, nombre del anuncio (mono,
// tachado al publicar), pill de tipo, botón Drive y Copiar.
function Row({ slot, onUpdate }) {
  const name = buildAdName(slot);
  const isVid = slot.tipo === "video";
  const openDrive = (e) => {
    e.preventDefault();
    if (!slot.drive) { toast("Este creativo todavía no tiene carpeta de Drive", "info"); return; }
    window.open("https://" + slot.drive.replace(/^https?:\/\//, ""), "_blank", "noopener");
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
      {/* Escribe `stage_done` además de `publicado`: esta es la pantalla donde
          el trafficker trabaja, y hasta ahora marcar acá no movía su tarea. */}
      <button type="button" title={slot.publicado ? "Marcar como pendiente" : "Marcar como publicado"}
        onClick={() => onUpdate(slot.id, marcarPublicado(!slot.publicado))}
        style={{ width: 20, height: 20, flex: "none", borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center",
          border: `1.5px solid ${slot.publicado ? "var(--green)" : "var(--line-2)"}`, background: slot.publicado ? "var(--green)" : "transparent" }}>
        {slot.publicado && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#04120C" strokeWidth={3} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
      </button>
      <span className="mono" style={{ flex: "1 1 320px", minWidth: 0, fontSize: 12, wordBreak: "break-all",
        color: slot.publicado ? "var(--ink-4)" : "var(--ink)", textDecoration: slot.publicado ? "line-through" : "none" }}>{name}</span>
      <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 9px", flex: "none",
        color: isVid ? "var(--neon)" : "var(--purple)", background: isVid ? TINT.neon : TINT.purple }}>{isVid ? "Video" : "Estático"}</span>
      <a href={slot.drive ? "#" : "#"} onClick={openDrive}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, borderRadius: 9, padding: "6px 10px", flex: "none", cursor: "pointer", textDecoration: "none",
          color: slot.drive ? "var(--sel)" : "var(--ink-4)", background: slot.drive ? "var(--sel-soft)" : "var(--chip)", border: `1px solid ${slot.drive ? "rgba(88,166,255,0.3)" : "var(--line)"}` }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>Drive
      </a>
      <button type="button" title="Copiar nombre" onClick={() => { navigator.clipboard?.writeText(name); toastSuccess("Nombre copiado"); }}
        style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", background: "var(--chip)", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 10px", cursor: "pointer", flex: "none" }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={9} y={9} width={11} height={11} rx={2} /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>Copiar
      </button>
    </div>
  );
}

function Group({ title, color, rows, empty }) {
  return (
    <div style={{ borderRadius: 18, border: "1px solid var(--line)", background: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px" }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: color }} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", color: DS.textPrimary }}>{title}</span>
        <span className="mono" style={{ fontSize: 12, color: DS.textMuted, background: "var(--chip)", borderRadius: 999, padding: "2px 9px" }}>{rows.length}</span>
      </div>
      {rows.length ? rows : <div style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "0 16px 16px" }}>{empty}</div>}
    </div>
  );
}

export function CampaignView({ slots, onUpdate }) {
  const pend = slots.filter((s) => !s.publicado);
  const pub = slots.filter((s) => s.publicado);
  return (
    <div style={{ padding: "0 30px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Group title="Pendientes por publicar" color="var(--amber)" empty="Nada pendiente." rows={pend.map((s) => <Row key={s.id} slot={s} onUpdate={onUpdate} />)} />
      <Group title="Publicados" color="var(--green)" empty="Aún no hay publicados." rows={pub.map((s) => <Row key={s.id} slot={s} onUpdate={onUpdate} />)} />
    </div>
  );
}
