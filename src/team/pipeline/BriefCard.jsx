import { DS } from "../../lib/design.js";
import { calcProgress } from "./pipelineConstants.js";

// Tarjeta de brief en la vista Etapas (README §3). Presentacional: recibe los
// props de drag de dnd-kit. Aparece una vez por etapa donde el brief tiene slots.
// Sin × de borrar. Un brief se lleva por delante sus decenas de contenidos con
// sus guiones y referentes, y tenerlo a un clic de distancia —apareciendo solo al
// pasar el mouse, encima de la tarjeta que uno quiere abrir— es pedirlo. Ahora se
// borra desde adentro del brief, después de ver lo que se va.
export function BriefCard({ brief, countHere, briefSlots = [], onOpen, dnd = {} }) {
  const pct = calcProgress(briefSlots);
  const total = briefSlots.length;
  const vacio = total === 0;
  const { setNodeRef, attributes, listeners, isDragging, style: dndStyle } = dnd;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.()}
      title="Abrir brief"
      style={{
        borderRadius: 15, padding: "13px 14px",
        background: "var(--surface)", boxShadow: "var(--shadow)",
        border: "1px solid var(--line)", cursor: vacio ? "pointer" : "grab",
        // Un brief vacío no se arrastra: no tiene contenidos que mover de etapa,
        // así que soltarlo en otra columna no hacía absolutamente nada.
        opacity: isDragging ? 0.4 : 1, position: "relative", ...dndStyle,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brief.n}</span>
        {!vacio && <span className="mono" style={{ fontSize: 11, color: DS.textMuted }}>{countHere} acá</span>}
      </div>
      <div style={{ fontSize: 11.5, color: DS.textMuted, marginTop: 3 }}>Creado {brief.created} · {brief.owner}</div>

      {/* Un brief sin contenidos no está "0% hecho": no tiene nada que hacer, y
          la barra al 0% con "de 0 contenidos" lo hacía leer como una tanda
          recién arrancada. No se reemplaza por un cartel que explique el vacío
          —eso es ruido sobre ruido—: simplemente no se dibuja nada. La tarjeta
          queda con el nombre, la fecha y Abrir, que es todo lo que hay. */}
      {!vacio && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: pct >= 100 ? "var(--green)" : "var(--sel)", transition: "width .3s ease" }} />
            </div>
            <span className="mono" style={{ fontSize: 13, color: DS.textSecondary }}>{pct}%</span>
          </div>
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: vacio ? 10 : 6 }}>
        <span style={{ fontSize: 11.5, color: DS.textMuted }}>{vacio ? "" : `de ${total} contenidos`}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
          style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sel)", background: "none", border: "none", cursor: "pointer", fontFamily: DS.font, padding: 0 }}
        >Abrir ›</button>
      </div>
    </div>
  );
}
