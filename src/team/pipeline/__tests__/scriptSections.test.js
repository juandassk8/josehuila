import { describe, it, expect } from "vitest";
import { splitScriptSections, itemText, hasContent } from "../scriptSections.js";
import { slotScriptToHtml, EMPTY_SCRIPT_HTML } from "../scriptHtml.js";

describe("splitScriptSections", () => {
  it("lee el HTML que genera el propio generador", () => {
    const html = slotScriptToHtml({
      hooks: ["Gancho uno", "Gancho dos", "Gancho tres"],
      body: ["Beat uno", "Beat dos"],
      cta: "Pedilo hoy",
    });
    const s = splitScriptSections(html);
    expect(s.hooks).toEqual(["Gancho uno", "Gancho dos", "Gancho tres"]);
    expect(s.body).toEqual(["Beat uno", "Beat dos"]);
    expect(s.cta).toEqual(["Pedilo hoy"]);
    expect(s.raw).toBeNull();
  });

  it("conserva las notas de grabación como bloque extra", () => {
    const html = slotScriptToHtml({ hooks: ["A"], body: ["B"], cta: "C", notes: "Grabar de día" });
    const s = splitScriptSections(html);
    expect(s.extra).toEqual([{ title: "Notas de grabación", items: ["Grabar de día"] }]);
  });

  it("reconoce títulos escritos a mano, con acentos y mayúsculas", () => {
    const s = splitScriptSections("<h3>GANCHOS</h3><ul><li>uno</li></ul><h2>Cuerpo</h2><p>algo</p><h3>Cierre</h3><p>compralo</p>");
    expect(s.hooks).toEqual(["uno"]);
    expect(s.body).toEqual(["algo"]);
    expect(s.cta).toEqual(["compralo"]);
  });

  it("descarta los ítems vacíos del esqueleto", () => {
    const s = splitScriptSections(EMPTY_SCRIPT_HTML);
    expect(s.hooks).toEqual([]);
    expect(s.body).toEqual([]);
    expect(s.raw).toBeNull();
  });

  it("devuelve raw cuando el guion no tiene títulos", () => {
    const s = splitScriptSections("<p>Pegué esto de otro lado</p>");
    expect(s.raw).toBe("<p>Pegué esto de otro lado</p>");
    expect(s.hooks).toEqual([]);
  });

  it("no rompe con guion vacío", () => {
    for (const v of ["", null, undefined, "<p><br></p>"]) {
      const s = splitScriptSections(v);
      expect(s.raw).toBeNull();
      expect(s.hooks).toEqual([]);
    }
  });

  // Los guiones anteriores al generador se tipearon a mano en el editor, que
  // escribe <p> y <div> en vez de headings. Copiado tal cual de la base.
  it("lee los guiones viejos con <p>Hook</p> y <div>Body</div>", () => {
    const real = "<p>Hook</p><ul><li>Lamento haber ignorado tu mal aliento</li></ul><div><br></div><div>Body</div>"
      + "<ul><li>Tenías las encías inflamadas</li><li>No podías ni comer</li></ul><div><br></div><div>CTA</div>"
      + "<ul><li>Espero más dueños se lo den a sus perritos</li></ul><div>(Clip final mostrando peluna fresh)</div>";
    const s = splitScriptSections(real);
    expect(s.raw).toBeNull();
    expect(s.hooks).toEqual(["Lamento haber ignorado tu mal aliento"]);
    expect(s.body).toEqual(["Tenías las encías inflamadas", "No podías ni comer"]);
    expect(s.cta).toEqual(["Espero más dueños se lo den a sus perritos", "(Clip final mostrando peluna fresh)"]);
  });

  it("no confunde un párrafo que menciona el hook con un título", () => {
    const s = splitScriptSections("<h3>Body</h3><ul><li>Acá el hook se repite para cerrar</li></ul>");
    expect(s.body).toEqual(["Acá el hook se repite para cerrar"]);
    expect(s.hooks).toEqual([]);
  });

  it("conserva lo que haya antes del primer título", () => {
    const s = splitScriptSections("<p>Grabar en la cocina</p><h3>Hook</h3><ul><li>a</li></ul>");
    expect(s.lead).toEqual(["Grabar en la cocina"]);
    expect(s.hooks).toEqual(["a"]);
  });

  it("junta dos bloques del mismo rol", () => {
    const s = splitScriptSections("<h3>Hook</h3><ul><li>a</li></ul><h3>Hook alterno</h3><ul><li>b</li></ul>");
    expect(s.hooks).toEqual(["a", "b"]);
  });

  it("conserva el formato inline dentro del ítem", () => {
    const s = splitScriptSections("<h3>Body</h3><ul><li>Con <b>énfasis</b></li></ul>");
    expect(s.body).toEqual(["Con <b>énfasis</b>"]);
  });
});

describe("itemText", () => {
  it("saca las etiquetas y normaliza espacios", () => {
    expect(itemText("Con <b>énfasis</b>  y   aire")).toBe("Con énfasis y aire");
  });
  it("desescapa las entidades básicas", () => {
    expect(itemText("perros &amp; gatos")).toBe("perros & gatos");
  });
});

describe("hasContent", () => {
  it("distingue relleno de contenido", () => {
    expect(hasContent("<p><br></p>")).toBe(false);
    expect(hasContent("  ")).toBe(false);
    expect(hasContent("<p>hola</p>")).toBe(true);
  });
});
