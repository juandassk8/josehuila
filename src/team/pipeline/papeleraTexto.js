// Cuánto hace que se borró, dicho como lo diría una persona.
//
// Vive aparte del modal —y no adentro, que sería lo natural— porque es la única
// parte con reglas propias: los cortes entre "recién", horas y días. Acá se
// puede probar sin montar nada.
export function haceCuanto(iso, ahora = Date.now()) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const seg = Math.max(0, Math.round((ahora - t) / 1000));
  if (seg < 60) return "recién";
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} ${hs === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(hs / 24);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

// "17 contenidos" / "1 contenido". `null` mientras todavía no se sabe: no es lo
// mismo que cero, y mostrar "0 contenidos" mientras carga hace creer que el
// brief está vacío justo cuando la persona decide si recuperarlo.
export function contenidosTexto(n) {
  if (n == null) return "…";
  return `${n} ${n === 1 ? "contenido" : "contenidos"}`;
}
