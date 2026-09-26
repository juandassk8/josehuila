import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { LABEL_CATEGORIES, normLabel } from "../../despliegue/labels.js";
import { cargarTaxonomia } from "../../despliegue/taxonomiaDb.js";

// Selector de etiquetas del banco.
//
// El anterior tenía cuatro problemas, todos por el mismo motivo — trataba a las
// etiquetas como palabras sueltas:
//
//   · Las pestañas eran chips que envolvían, así que "Formato" quedaba solo en
//     una segunda línea. Con nueve ejes eso se vuelve ilegible.
//   · Cuarenta subnichos en una nube de chips sin buscador: hay que leerlos
//     todos para encontrar uno.
//   · Al cambiar de pestaña, lo que habías elegido en la anterior desaparecía
//     de la vista. Solo quedaba un "· 2" que no dice QUÉ.
//   · El conteo iba pegado al nombre ("Óptica 21"), y se lee como si fuera
//     parte de la etiqueta.
//
// Ahora los ejes van en una columna fija a la izquierda (escala a nueve), hay
// buscador que cruza TODOS los ejes, lo elegido vive arriba como chips que se
// quitan de a uno, y cada valor muestra lo que la taxonomía sabe de él: la
// definición del curso para los conceptos, el nicho padre para los subnichos,
// el grupo para los ángulos.

const CHIP = {
  padding: "4px 9px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
  fontSize: 11, fontWeight: 700, border: DS.border, background: "transparent",
  color: DS.textSecondary, display: "inline-flex", alignItems: "center", gap: 5,
};

const withAlpha = (hex, a) => `${hex}${a}`;

export function EtiquetasMultiSelect({ options, selected, onChange, categorias = LABEL_CATEGORIES }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(categorias[0]?.key || "nicho");
  const [q, setQ] = useState("");
  const [tax, setTax] = useState(null);
  const buscador = useRef(null);

  const total = categorias.reduce((a, c) => a + (selected[c.key]?.length || 0), 0);

  useEffect(() => { if (open) cargarTaxonomia().then(setTax); }, [open]);
  // Abrir y poder escribir sin tocar el mouse es la mitad de la mejora.
  useEffect(() => { if (open) buscador.current?.focus(); }, [open]);

  const toggle = (catKey, val) => {
    const cur = selected[catKey] || [];
    onChange({
      ...selected,
      [catKey]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val],
    });
  };

  // Buscar cruza TODOS los ejes: uno no siempre recuerda si "Gafas" era nicho o
  // subnicho, y obligar a adivinar la pestaña correcta es justamente el problema.
  const resultados = useMemo(() => {
    const term = normLabel(q || "");
    if (!term) return null;
    const out = [];
    for (const c of categorias) {
      for (const o of options[c.key] || []) {
        if (normLabel(o.valor).includes(term)) out.push({ cat: c, ...o });
      }
    }
    return out.sort((a, b) => b.n - a.n).slice(0, 60);
  }, [q, options, categorias]);

  const meta = categorias.find((c) => c.key === cat) || categorias[0];
  // Memo propio: `options[cat] || []` crea un array nuevo en cada render y haría
  // que el agrupado de abajo se recalcule siempre.
  const valores = useMemo(() => options[cat] || [], [options, cat]);

  // Los subnichos se agrupan por su nicho padre. Cuarenta en fila plana no se
  // pueden recorrer; "Belleza → Cabello, Óptica, Skincare" sí.
  const agrupados = useMemo(() => {
    if (cat !== "subnicho" || !tax) return null;
    const g = new Map();
    for (const o of valores) {
      const padre = tax.subnicho?.[o.valor]?.padre || "Otros";
      if (!g.has(padre)) g.set(padre, []);
      g.get(padre).push(o);
    }
    return [...g.entries()].sort((a, b) =>
      b[1].reduce((s, x) => s + x.n, 0) - a[1].reduce((s, x) => s + x.n, 0));
  }, [cat, valores, tax]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: DS.font,
          fontSize: 12, fontWeight: 700,
          border: total ? `1px solid ${DS.purple}` : DS.border,
          background: total ? withAlpha(DS.purple, "18") : "rgba(0,0,0,0.25)",
          color: total ? DS.purple : DS.textSecondary,
        }}
      >
        Etiquetas{total ? ` · ${total}` : ""} ▾
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: 36, left: 0, zIndex: 41, width: 560,
            borderRadius: 14, background: DS.bgSide, border: `1px solid ${DS.textHint}`,
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)", overflow: "hidden",
            display: "flex", flexDirection: "column", maxHeight: 520,
          }}>
            {/* Buscador */}
            <div style={{ padding: 10, borderBottom: `1px solid ${DS.textHint}33` }}>
              <input
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en todos los ejes…"
                style={{
                  width: "100%", padding: "7px 11px", borderRadius: 8, border: DS.border,
                  background: "rgba(0,0,0,0.3)", color: DS.textPrimary,
                  fontSize: 12.5, fontFamily: DS.font, outline: "none",
                }}
              />
            </div>

            {/* Lo elegido: visible SIEMPRE, sin importar en qué eje estés parado. */}
            {total > 0 && (
              <div style={{
                padding: "9px 10px", borderBottom: `1px solid ${DS.textHint}33`,
                display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
              }}>
                {categorias.flatMap((c) => (selected[c.key] || []).map((v) => (
                  <button key={`${c.key}:${v}`} onClick={() => toggle(c.key, v)}
                    title={`Quitar ${v}`}
                    style={{ ...CHIP, border: `1px solid ${c.color}`, background: withAlpha(c.color, "22"), color: c.color }}>
                    {v} <span style={{ opacity: 0.7 }}>✕</span>
                  </button>
                )))}
                <button onClick={() => onChange({})} style={{ ...CHIP, marginLeft: "auto", fontSize: 10 }}>
                  Limpiar todo
                </button>
              </div>
            )}

            <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
              {/* Ejes en columna: escala a nueve sin envolver. */}
              {!resultados && (
                <div style={{
                  width: 150, flexShrink: 0, borderRight: `1px solid ${DS.textHint}33`,
                  padding: 7, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto",
                }}>
                  {categorias.map((c) => {
                    const n = selected[c.key]?.length || 0;
                    const activa = cat === c.key;
                    const disponibles = (options[c.key] || []).length;
                    return (
                      <button key={c.key} onClick={() => setCat(c.key)} style={{
                        display: "flex", alignItems: "center", gap: 6, width: "100%",
                        padding: "7px 9px", borderRadius: 8, cursor: "pointer", fontFamily: DS.font,
                        fontSize: 12, fontWeight: 700, textAlign: "left", border: "none",
                        background: activa ? withAlpha(c.color, "22") : "transparent",
                        color: activa ? c.color : (n ? c.color : DS.textSecondary),
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: c.color, flexShrink: 0, opacity: activa || n ? 1 : 0.35 }} />
                        <span style={{ flex: 1 }}>{c.label}</span>
                        {n
                          ? <span style={{ fontSize: 10, fontWeight: 800 }}>{n}</span>
                          : <span style={{ fontSize: 10, color: DS.textMuted, fontWeight: 600 }}>{disponibles || ""}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Valores */}
              <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 9 }}>
                {resultados
                  ? (resultados.length === 0
                      ? <Vacio texto={`Nada que se parezca a “${q}”.`} />
                      : resultados.map((r) => (
                          <Fila key={`${r.cat.key}:${r.valor}`} o={r} color={r.cat.color}
                            info={tax?.[r.cat.key]?.[r.valor]} eje={r.cat.label}
                            on={(selected[r.cat.key] || []).includes(r.valor)}
                            onClick={() => toggle(r.cat.key, r.valor)} />
                        )))
                  : agrupados
                    ? agrupados.map(([padre, items]) => (
                        <div key={padre} style={{ marginBottom: 10 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: DS.textMuted, padding: "2px 4px 5px",
                          }}>{padre}</div>
                          {items.map((o) => (
                            <Fila key={o.valor} o={o} color={meta.color}
                              on={(selected[cat] || []).includes(o.valor)}
                              onClick={() => toggle(cat, o.valor)} />
                          ))}
                        </div>
                      ))
                    : valores.length === 0
                      ? <Vacio texto={`Todavía no hay etiquetas de ${meta.label.toLowerCase()}.`} />
                      : valores.map((o) => (
                          <Fila key={o.valor} o={o} color={meta.color} info={tax?.[cat]?.[o.valor]}
                            on={(selected[cat] || []).includes(o.valor)}
                            onClick={() => toggle(cat, o.valor)} />
                        ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Una fila: nombre, lo que la taxonomía sabe de esa etiqueta, y el conteo
// separado a la derecha — pegado al nombre se leía como parte de él.
// `info` se omite a propósito en la vista agrupada de subnichos: el encabezado
// del grupo ya dice el nicho padre, y repetirlo en cada fila es puro ruido.
function Fila({ o, color, info, on, onClick, eje }) {
  const sub = info?.descripcion || (info?.padre ? `De ${info.padre}` : null) || info?.grupo || null;
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "flex-start", gap: 9, width: "100%", textAlign: "left",
      padding: "7px 9px", borderRadius: 9, cursor: "pointer", fontFamily: DS.font, marginBottom: 2,
      border: on ? `1px solid ${color}` : "1px solid transparent",
      background: on ? withAlpha(color, "1f") : "transparent",
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
        border: `1.5px solid ${on ? color : DS.textHint}`, background: on ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, color: DS.bgSide, fontWeight: 900,
      }}>{on ? "✓" : ""}</span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? color : DS.textPrimary }}>{o.valor}</span>
          {eje && <span style={{ fontSize: 9.5, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.04em" }}>{eje.toUpperCase()}</span>}
          {info?.nota && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 50,
              background: withAlpha(color, "1a"), color, letterSpacing: "0.03em",
            }}>{info.nota}</span>
          )}
        </span>
        {sub && (
          <span style={{
            display: "block", fontSize: 11, color: DS.textMuted, marginTop: 2, lineHeight: 1.35,
          }}>{sub}</span>
        )}
      </span>

      <span style={{ fontSize: 11, fontWeight: 700, color: DS.textMuted, flexShrink: 0, marginTop: 1 }}>
        {o.n}
      </span>
    </button>
  );
}

function Vacio({ texto }) {
  return <div style={{ fontSize: 11.5, color: DS.textMuted, padding: "10px 6px" }}>{texto}</div>;
}
