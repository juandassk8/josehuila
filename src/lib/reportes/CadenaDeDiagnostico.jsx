import { useMemo } from "react";
import { DS } from "../design.js";
import { diagnosticarCadena } from "./diagnostico.js";

// La cadena de diagnóstico, dibujada — clase 9.5.
//
// La tarjeta del anuncio ya dice si el CPA está bien o mal. Esto dice DÓNDE se
// rompe, que es lo que evita tirar el creativo entero cuando el problema era el
// checkout.
//
// Solo se muestra en anuncios que vienen mal: con todo en verde no hay nada que
// diagnosticar, y un panel siempre presente se vuelve decoración.
//
// Los eslabones sin datos se muestran EN GRIS, no se esconden. Esconderlos daría
// la impresión de una cadena revisada entera cuando la mitad no se pudo mirar —
// hoy las métricas de la web no vienen en la exportación de Meta.

const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`;

const COLOR = {
  ok: "#1DB97A",
  roto: "#E24B4A",
  sin_datos: DS.textMuted,
  sin_umbral: "#F5A623",
};

export function CadenaDeDiagnostico({ metricas, umbrales, isDark = false }) {
  const r = useMemo(() => diagnosticarCadena(metricas || {}, { umbrales }), [metricas, umbrales]);

  // Sin un solo dato medible no hay cadena que mostrar: sería una lista de seis
  // guiones que no informa nada.
  const medibles = r.pasos.filter((p) => p.estado !== "sin_datos").length;
  if (!medibles) return null;

  return (
    <div style={{
      marginBottom: 10, padding: "11px 13px", borderRadius: 8,
      background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Dónde se rompe
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
        {r.pasos.map((p) => {
          const c = COLOR[p.estado];
          const esElRoto = r.primerRoto?.key === p.key;
          return (
            <div key={p.key}
              title={p.estado === "sin_datos" ? "Falta este dato en la exportación de Meta"
                : p.estado === "sin_umbral" ? "Se mide, pero el curso nunca fijó el umbral" : p.porque}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, padding: "4px 9px", borderRadius: 20,
                color: c,
                background: esElRoto ? c + "22" : "transparent",
                border: `1px solid ${esElRoto ? c + "66" : (isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)")}`,
                fontWeight: esElRoto ? 700 : 500,
              }}>
              <span>{p.estado === "ok" ? "✓" : p.estado === "roto" ? "✕" : p.estado === "sin_umbral" ? "?" : "—"}</span>
              <span>{p.titulo}</span>
              {p.valor !== null && <span className="mono" style={{ opacity: 0.75 }}>{pct(p.valor)}</span>}
            </div>
          );
        })}
      </div>

      {r.primerRoto ? (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: DS.textSecondary }}>
          <div style={{ color: COLOR.roto, fontWeight: 700 }}>{r.primerRoto.porque}</div>
          <div style={{ marginTop: 3 }}>{r.primerRoto.accion}</div>
        </div>
      ) : r.cadenaCompleta ? (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: DS.textSecondary }}>
          La cadena está sana entera. Si el retorno igual no cuadra, el problema no es una pieza:
          son los márgenes, el ticket o los costos.
        </div>
      ) : (
        // El caso honesto: lo medible da bien, pero falta media cadena. Decir
        // "está todo bien" acá mandaría a rotar creativos sin haber mirado la web.
        <div style={{ fontSize: 12, lineHeight: 1.6, color: DS.textSecondary }}>
          Lo que se puede medir da bien, pero faltan {r.sinDatos.length} eslabones.
          Antes de tocar el creativo, sumá a la exportación de Meta el % de carga de página,
          los pagos iniciados y la conversión de checkout — ahí es donde más plata se cae.
        </div>
      )}
    </div>
  );
}

export default CadenaDeDiagnostico;
