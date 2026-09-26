import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { dayKey, fromKey, monthGrid, monthLabel, chipRange } from "./centerModel.js";

// El calendario del portal. Uno solo para los dos usos:
//
//   multi  — el filtro de la barra: se agregan y se quitan días sueltos.
//   single — el chip de fecha del modal: se elige uno y se cierra.
//
// El nativo (`input type="date"`) solo abría desde su iconito y traía la caja
// del sistema operativo, que no se parece a nada del portal.
//
// Cualquier día es elegible, incluidos los pasados y los de los meses vecinos
// que completan la rejilla: filtrar "lo que quedó de la semana pasada" es
// justamente para lo que sirve.

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

const CHIPS = [
  ["semana", "Esta semana"], ["ayer", "Ayer"], ["hoy", "Hoy"], ["manana", "Mañana"], ["finde", "Fin de semana"],
];

function Flecha({ dir }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export function DateCalendar({ mode = "multi", value = [], hoy, conTareas, onChange, onClear }) {
  const seleccion = useMemo(() => (Array.isArray(value) ? value : [value].filter(Boolean)), [value]);
  const inicial = fromKey(seleccion[0] || hoy) || new Date();
  const [ver, setVer] = useState({ y: inicial.getFullYear(), m: inicial.getMonth() });
  const semanas = useMemo(() => monthGrid(ver.y, ver.m), [ver]);

  const mover = (n) => setVer(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const elegir = (key) => {
    if (mode === "single") { onChange(key); return; }
    onChange(seleccion.includes(key) ? seleccion.filter((x) => x !== key) : [...seleccion, key]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => mover(-1)} style={nav} aria-label="Mes anterior"><Flecha dir="prev" /></button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{monthLabel(ver.y, ver.m)}</span>
        <button type="button" onClick={() => mover(1)} style={nav} aria-label="Mes siguiente"><Flecha dir="next" /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {DIAS.map((d, i) => (
          <span key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--ink-4)" }}>{d}</span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {semanas.flat().map((d) => {
          const on = seleccion.includes(d.key);
          const esHoy = d.key === hoy;
          const pasado = d.key < hoy;
          return (
            <button key={d.key} type="button" onClick={() => elegir(d.key)}
              style={{
                position: "relative", height: 32, borderRadius: 9, cursor: "pointer", fontFamily: DS.font, fontSize: 12,
                fontWeight: esHoy || on ? 700 : 500,
                color: on ? "#fff" : pasado || d.fuera ? "var(--ink-4)" : "var(--ink-2)",
                background: on ? "var(--sel)" : esHoy ? "var(--chip)" : "transparent",
                border: `1px solid ${esHoy && !on ? "var(--line-2)" : "transparent"}`,
                opacity: d.fuera && !on ? 0.55 : 1,
              }}>
              {d.num}
              {conTareas?.has(d.key) && (
                <span style={{ position: "absolute", left: "50%", bottom: 4, transform: "translateX(-50%)", width: 3, height: 3, borderRadius: 999, background: on ? "#fff" : "var(--sel)" }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        {mode === "multi"
          ? <>
            {CHIPS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => onChange(k === "semana" ? [] : chipRange(k, hoy))} style={chip}>{label}</button>
            ))}
            <span style={{ flexBasis: "100%", fontSize: 11, lineHeight: 1.45, color: "var(--ink-4)", marginTop: 2 }}>
              Sin días elegidos ves esta semana, lo que no tiene fecha y lo atrasado sin cerrar.
            </span>
          </>
          : (
            <>
              <button type="button" onClick={() => onChange(hoy)} style={chip}>Hoy</button>
              <button type="button" onClick={() => onChange(dayKey(new Date(fromKey(hoy).getTime() + 86400000)))} style={chip}>Mañana</button>
              <button type="button" onClick={onClear} style={{ ...chip, marginLeft: "auto", color: "var(--brand)" }}>Quitar fecha</button>
            </>
          )}
      </div>
    </div>
  );
}

const nav = { width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 8, cursor: "pointer", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" };
const chip = { padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontFamily: DS.font, fontSize: 11.5, fontWeight: 600, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" };
