import { describe, it, expect } from "vitest";
import { mergeLabelValue } from "../../../despliegue/labels.js";

// Lógica de `classifyInboxBulk` sobre las etiquetas de UNA fila. Se prueba
// aparte de Supabase: lo que importa es qué queda en el jsonb, no la escritura.
const aplicar = (actuales, cat, nuevas, reemplazar) => {
  const labels = { ...(actuales || {}) };
  if (reemplazar) { labels[cat] = [...nuevas]; return labels; }
  let acc = Array.isArray(labels[cat]) ? [...labels[cat]] : [];
  for (const v of nuevas) acc = mergeLabelValue(acc, v);
  labels[cat] = acc;
  return labels;
};

describe("etiquetar en tanda", () => {
  // El caso real: 80 anuncios de sillas gamer con nicho "Salud" porque el banco
  // no tenía muebles. Sumando quedaban ["Salud","Muebles"] y el dato falso
  // sobrevivía — por eso hace falta poder pisar.
  it("reemplazar deja SOLO lo nuevo: el error viejo no sobrevive", () => {
    const r = aplicar({ nicho: ["Salud"], angulo: ["Oferta"] }, "nicho", ["Muebles"], true);
    expect(r.nicho).toEqual(["Muebles"]);
  });

  it("reemplazar no toca las otras categorías", () => {
    const r = aplicar({ nicho: ["Salud"], angulo: ["Oferta"], marca: ["Versus"] }, "nicho", ["Muebles"], true);
    expect(r.angulo).toEqual(["Oferta"]);
    expect(r.marca).toEqual(["Versus"]);
  });

  it("sumar conserva lo que ya estaba", () => {
    const r = aplicar({ angulo: ["Oferta"] }, "angulo", ["Ergonomía"], false);
    expect(r.angulo).toEqual(["Oferta", "Ergonomía"]);
  });

  // Un Set dejaba pasar "Muebles" y "muebles" como dos etiquetas distintas.
  it("sumar no duplica por mayúsculas ni acentos", () => {
    expect(aplicar({ nicho: ["Muebles"] }, "nicho", ["muebles"], false).nicho).toEqual(["Muebles"]);
    expect(aplicar({ nicho: ["Ergonomía"] }, "nicho", ["ergonomia"], false).nicho).toEqual(["Ergonomía"]);
  });

  it("sobre una ficha sin etiquetas, funciona igual", () => {
    expect(aplicar({}, "nicho", ["Muebles"], false).nicho).toEqual(["Muebles"]);
    expect(aplicar({}, "nicho", ["Muebles"], true).nicho).toEqual(["Muebles"]);
  });
});
