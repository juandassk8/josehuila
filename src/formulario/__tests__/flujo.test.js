import { describe, it, expect } from "vitest";
import {
  PANTALLAS, CAMPOS, pantalla, pantallasActivas, siguientePantalla, despuesDe, antesDe,
  respuestasVigentes, estaCompleto, progreso, bloquesNavegables, textoRecompensaWeb, texto,
} from "../flujo.js";
import { calcular } from "../calculos.js";

const ids = (r) => pantallasActivas(r).map((p) => p.id);

// Una marca que ya respondió todo, por la rama de productos y sin contraentrega.
const completo = (extra = {}) => ({
  contacto_nombre: "Laura", marca_nombre: "Peluna", tipo_marca: "marca_propia",
  web_url: "https://peluna.co/", instagram: "@peluna", socios: [{ nombre: "Laura", correo: "l@p.co", telefono: "3001234567" }],
  maneja_categorias: "no", num_productos: 5,
  productos_principales: [{ nombre: "Fresh", precio: 100_000 }],
  facturacion_mes_pasado: 40_000_000, facturacion_3m_total: 114_000_000, facturacion_objetivo_3m: 80_000_000,
  ticket_promedio: 100_000, gasto_pauta_mes: 6_000_000, cpa_mes: 18_000,
  rentabilidad_neta: { valor: 12_000, unidad: "pesos", iva: "no_aplica" }, reparto_pago: { contraentrega: 0, anticipado: 100 }, cpa_objetivo: 12_000,
  tasa_conversion: 1.8, porcentaje_carga: 85, recompra: { pct: 20, cada: { n: 3, unidad: "meses" } },
  base_datos_clientes: "si", equipo: [{ nombre: "Laura", roles: ["Dueño / gerencia"], que_hace: "" }],
  ...extra,
});

describe("el mapa pantalla → punto del Estándar", () => {
  const MAPA = {
    contacto_nombre: ["1.1", ["perfil"]], marca_nombre: ["1.2", ["perfil"]], tipo_marca: ["1.3", []],
    web_url: ["1.4", ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8"]], instagram: ["1.5", ["7.1"]], socios: ["1.6", ["perfil", "9.1"]],
    maneja_categorias: ["2.1", ["1.0"]], num_categorias: ["2.2", ["1.0"]], num_productos: ["2.3", ["1.0"]],
    productos_principales: ["2.4", ["1.0", "2.0"]],
    facturacion_mes_pasado: ["3.1", ["2.0"]], facturacion_3m_total: ["3.2", ["2.0"]], facturacion_objetivo_3m: ["3.3", ["2.0", "1.11"]],
    ticket_promedio: ["3.4", ["2.0"]], gasto_pauta_mes: ["3.5", ["2.0", "5.0"]],
    cpa_mes: ["3.6", ["2.1", "2.2"]],
    rentabilidad_neta: ["3.8", ["2.1"]], reparto_pago: ["3.9", ["2.0"]],
    tasa_entrega: ["3.10", ["2.0"]], cpa_objetivo: ["3.11", ["2.1"]],
    tasa_conversion: ["4.1", ["6.1", "2.2"]], porcentaje_carga: ["4.2", ["6.2", "2.2"]],
    recompra: ["5.1", ["8.2", "2.2"]], base_datos_clientes: ["5.2", ["8.3"]], equipo: ["6.1", ["9.1", "9.2", "9.4"]],
  };
  it.each(Object.entries(MAPA))("%s", (campo, [pant, puntos]) => {
    expect(CAMPOS[campo]).toMatchObject({ pantalla: pant, puntos });
  });
  it("el margen por producto y por categoría ya no se piden: la rentabilidad es UNA pregunta", () => {
    expect(CAMPOS.margen_por_producto).toBeUndefined();
    expect(CAMPOS.margen_tienda_confirmado).toBeUndefined();
    expect(CAMPOS.responsable_iva).toBeUndefined();
    expect(CAMPOS.categorias_detalle).toMatchObject({ noLoSe: false, puntos: ["1.0"] });
  });
  it("la casilla 'no lo sé' existe solo en tres: conversión, carga y recompra", () => {
    const conCasilla = Object.entries(CAMPOS).filter(([, c]) => c.noLoSe).map(([k]) => k).sort();
    expect(conCasilla).toEqual(["porcentaje_carga", "recompra", "tasa_conversion"]);
  });
  it("los datos crudos de Calcúlalo por mí tienen su propio campo", () => {
    expect(CAMPOS.compras_mes.pantalla).toBe("3.6");
    expect(CAMPOS.roas_mes).toBeUndefined();            // la 3.7 se quitó
    expect(CAMPOS.ingresos_pauta_mes).toBeUndefined();
  });
  it("ningún id ni campo repetido", () => {
    expect(new Set(PANTALLAS.map((p) => p.id)).size).toBe(PANTALLAS.length);
    const campos = PANTALLAS.filter((p) => p.campo).map((p) => p.campo);
    expect(new Set(campos).size).toBe(campos.length);
  });
});

describe("las cuatro ramas", () => {
  it("1 · dropshipping: llega a la salida y no hay nada más", () => {
    const r = { contacto_nombre: "Ana", marca_nombre: "X", tipo_marca: "dropshipping" };
    expect(ids(r)).toEqual(["1.0", "1.1", "1.2", "1.3", "salida"]);
    expect(siguientePantalla(r)).toBe("salida");
    expect(estaCompleto(r)).toBe(false);
  });
  it("marca propia y aspiracional no ven la salida", () => {
    expect(ids({ tipo_marca: "marca_propia" })).not.toContain("salida");
    expect(ids({ tipo_marca: "aspiracional" })).not.toContain("salida");
  });
  it("2 · más de 20 productos: se llena por categoría y la 2.4 se salta", () => {
    const muchos = ids({ num_productos: 21 });
    expect(muchos).toContain("2.6");
    expect(muchos).not.toContain("2.4");
    const pocos = ids({ num_productos: 20 });
    expect(pocos).toContain("2.4");
    expect(pocos).not.toContain("2.6");
  });
  it("el IVA ya no es una rama: va dentro de la pregunta de rentabilidad", () => {
    expect(ids({})).not.toContain("3.8b");
    expect(pantalla("3.8").opcionesIva.map((o) => o.valor)).toEqual(["descontado", "sin_descontar", "no_aplica"]);
  });
  it("3 · hay contraentrega: aparece la 3.10", () => {
    expect(ids({ reparto_pago: { contraentrega: 1, anticipado: 99 } })).toContain("3.10");
    expect(ids({ reparto_pago: { contraentrega: 0, anticipado: 100 } })).not.toContain("3.10");
  });
  it("la 2.2 solo sale si maneja categorías distintas", () => {
    expect(ids({ maneja_categorias: "si" })).toContain("2.2");
    expect(ids({ maneja_categorias: "no" })).not.toContain("2.2");
  });
});

describe("retomar donde quedó", () => {
  it("sin nada respondido arranca en la bienvenida", () => {
    expect(siguientePantalla({})).toBe("1.0");
  });
  it("devuelve a la primera pregunta sin responder, no al principio", () => {
    expect(siguientePantalla({ contacto_nombre: "Laura", marca_nombre: "Peluna" })).toBe("1.3");
  });
  it("cerró el navegador a mitad del bloque 3: vuelve ahí", () => {
    const r = completo();
    for (const c of ["cpa_mes", "rentabilidad_neta", "reparto_pago", "cpa_objetivo", "tasa_conversion", "porcentaje_carga", "recompra", "base_datos_clientes", "equipo"]) delete r[c];
    expect(siguientePantalla(r)).toBe("3.6");
  });
  it("'no lo sé' es una respuesta: no lo devuelve a esa pregunta", () => {
    const r = completo();
    delete r.tasa_conversion;
    expect(siguientePantalla(r)).toBe("4.1");
    expect(siguientePantalla(r, { tasa_conversion: true })).toBe("cierre");
  });
  it("con todo respondido va al cierre", () => {
    expect(siguientePantalla(completo())).toBe("cierre");
    expect(estaCompleto(completo())).toBe(true);
  });
  it("si cambia una rama, retoma en lo que esa rama le pide", () => {
    expect(siguientePantalla(completo({ num_productos: 25 }))).toBe("2.6");
    expect(siguientePantalla(completo({ reparto_pago: { contraentrega: 60, anticipado: 40 } }))).toBe("3.10");
  });
  it("lo que respondió en la otra rama no se borra, pero queda por fuera", () => {
    const r = completo({ num_productos: 25 });
    const v = respuestasVigentes(r);
    expect(r.productos_principales).toBeDefined();
    expect(v.productos_principales).toBeUndefined();
    expect(v.num_productos).toBe(25);
  });
});

describe("la meta más baja que el mes pasado", () => {
  const r = completo({ facturacion_objetivo_3m: 30_000_000 });
  it("aparece la pantalla intermedia, y retoma ahí", () => {
    expect(ids(r)).toContain("3.3s");
    expect(siguientePantalla(r)).toBe("3.3s");
    expect(despuesDe("3.3", r)).toBe("3.3s");
  });
  it("si confirma, sigue normal y no se le vuelve a preguntar", () => {
    const ok = { ...r, meta_menor_confirmada: 30_000_000 };
    expect(ids(ok)).not.toContain("3.3s");
    expect(despuesDe("3.3", ok)).toBe("3.4");
  });
  it("si después pone otra meta que también es menor, se le vuelve a preguntar", () => {
    expect(ids({ ...r, meta_menor_confirmada: 30_000_000, facturacion_objetivo_3m: 20_000_000 })).toContain("3.3s");
  });
  it("con una meta mayor nunca sale", () => {
    expect(ids(completo())).not.toContain("3.3s");
  });
  it("'No, la corrijo' vuelve a la 3.3", () => {
    expect(pantalla("3.3s").vuelveA).toBe("3.3");
  });
});

describe("recompensas", () => {
  it("la del bloque 3 usa los números calculados, el nombre, y dice de dónde sale el techo", () => {
    const r = completo();
    const c = calcular(respuestasVigentes(r));
    const ctx = { nombre: "Laura", marca: "Peluna", r, c };
    const p = pantalla("3.f");
    expect(texto(p.titulo, ctx)).toBe("Estos son tus números, Laura.");
    const b = p.bloques(ctx);
    expect(b[0].titulo).toBe("Tu CPA máximo es $30.000");
    expect(b[0].deDonde).toBe("$12.000 que te quedan por venta + $18.000 que pagas hoy por conseguirla = $30.000");
    expect(b[0].corregir.map((d) => d.ir)).toEqual(["3.8", "3.6"]);
    expect(b[0].corregir[0]).toMatchObject({ dato: "Lo que te queda por venta", valor: "$12.000" });
    expect(b[1].titulo).toBe("Tu ROAS de equilibrio es 3,3");
    expect(b[2].titulo).toBe("Para facturar $80.000.000 necesitas 800 ventas al mes");
    expect(b[2].texto).toBe("Con tu CPA de hoy eso son $14.400.000 en pauta.");
  });
  it("la línea: pegado al techo avisa; con aire no va nada", () => {
    const linea = (cpa, queda) => {
      const r = completo({ cpa_mes: cpa, rentabilidad_neta: { valor: queda, unidad: "pesos", iva: "no_aplica" } });
      return pantalla("3.f").linea({ nombre: "Laura", r, c: calcular(respuestasVigentes(r)) });
    };
    expect(linea(27_000, 3_000)).toBe("Estás a $3.000 de tu techo. De eso hablamos en la llamada.");
    expect(linea(25_500, 4_500)).toBe(null);
    expect(linea(18_000, 12_000)).toBe(null);
  });
  it("la del bloque 4 es condicional", () => {
    expect(textoRecompensaWeb({ porcentaje_carga: 70, tasa_conversion: 1.8 }))
      .toBe("De cada 100 personas que le dan clic a tus anuncios, 30 nunca alcanzan a ver tu página. Eso es plata que pagas por gente que no vio nada.");
    expect(textoRecompensaWeb({ porcentaje_carga: 85, tasa_conversion: 1.8 }))
      .toBe("Tu web convierte al 1,8% y 85% de tus clics alcanzan a cargarla.");
    expect(textoRecompensaWeb({})).toBe(null);
    expect(ids(completo())).toContain("4.f");
    expect(ids(completo({ porcentaje_carga: null, tasa_conversion: null }))).not.toContain("4.f");
  });
  it("los bloques 1, 5 y 6 no llevan recompensa: pasan directo al respiro", () => {
    const r = completo();
    expect(despuesDe("1.6", r)).toBe("2.r");
    expect(despuesDe("2.4", r)).toBe("3.r");
    expect(despuesDe("3.11", r)).toBe("3.f");
    expect(despuesDe("3.f", r)).toBe("4.r");
    expect(despuesDe("5.2", r)).toBe("6.r");
    expect(despuesDe("6.1", r)).toBe("cierre");
  });
});

describe("la barra de progreso", () => {
  it("seis bloques, y dice en cuál va", () => {
    expect(progreso("3.6", completo())).toMatchObject({ bloque: 3, bloques: 6 });
  });
  it("se puede devolver a un bloque que ya pasó, nunca saltar adelante", () => {
    const nav = bloquesNavegables({ contacto_nombre: "Laura", marca_nombre: "Peluna", tipo_marca: "marca_propia", web_url: "x", instagram: "@x", socios: [{}], maneja_categorias: "no" });
    expect(nav.map((b) => b.destino)).toEqual(["1.1", "2.1", null, null, null, null]);
  });
  it("volver atrás respeta las ramas", () => {
    expect(antesDe("3.1", completo())).toBe("3.r");
    expect(antesDe("3.r", completo())).toBe("2.4");
    expect(antesDe("3.r", completo({ num_productos: 30, categorias_detalle: [{ categoria: "X", ticket: 1 }] }))).toBe("2.6");
  });
});

describe("bienvenida y cambios de sección", () => {
  it("la bienvenida saluda, dice 15 minutos y va en tres bloques", () => {
    const p = pantalla("1.0");
    expect(p.titulo).toBe("Hola, bienvenido a Inforce 🦾");
    expect(p.puntos).toHaveLength(3);
    expect(p.puntos[0].titulo).toBe("15 minutos");
  });
  it("cada cambio de sección trae título, bajada y gráfico", () => {
    for (const id of ["2.r", "3.r", "4.r", "5.r", "6.r"]) {
      const p = pantalla(id);
      expect(p.titulo, id).toBeTruthy();
      expect(p.texto, id).toBeTruthy();
      expect(p.icono, id).toBeTruthy();
    }
  });
  it("la 1.3 pregunta el tipo de marca y el ejemplo va dentro de cada tarjeta", () => {
    const p = pantalla("1.3");
    expect(texto(p.titulo, { marca: "Peluna Pets" })).toBe("¿Qué tipo de marca es Peluna Pets?");
    expect(p.instruccion).toBeUndefined();
    expect(p.opciones.every((o) => o.ejemplo)).toBe(true);
  });
});
