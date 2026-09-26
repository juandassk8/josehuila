import { describe, it, expect } from "vitest";
import { validar, validarCalculalo, validarAcceso, aviso } from "../validaciones.js";
import { montoEnPalabras, pesos, decimal, leerMonto, leerDecimal, mesMasTres } from "../formato.js";

describe("validaciones que evitan basura en el diagnóstico", () => {
  it("los dos porcentajes de la 3.9 tienen que sumar 100", () => {
    expect(validar("3.9", { contraentrega: 60, anticipado: 40 }).ok).toBe(true);
    expect(validar("3.9", { contraentrega: 60, anticipado: 50 }).ok).toBe(false);
  });

  it("productos: uno mínimo, hasta tres", () => {
    const p = (n) => Array.from({ length: n }, (_, i) => ({ nombre: `Prod ${i}`, precio: 50_000 }));
    expect(validar("2.4", p(0)).ok).toBe(false);
    expect(validar("2.4", p(1)).ok).toBe(true);
    expect(validar("2.4", p(3)).ok).toBe(true);
    expect(validar("2.4", p(4)).ok).toBe(false);
  });

  it("'no lo sé' solo se acepta en las tres casillas; el CPA y el ROAS no la llevan", () => {
    expect(validar("4.1", null, { noLoSe: true }).ok).toBe(true);
    expect(validar("4.2", null, { noLoSe: true }).ok).toBe(true);
    expect(validar("5.1", null, { noLoSe: true }).ok).toBe(true);
    expect(validar("3.6", null, { noLoSe: true }).ok).toBe(false);
    expect(validar("3.1", null, { noLoSe: true }).ok).toBe(false);
  });

  it("un CPA mayor que el ticket NO se rechaza", () => {
    expect(validar("3.6", 250_000, { r: { ticket_promedio: 100_000 } }).ok).toBe(true);
  });

  it("montos: obligatorios, positivos, redondos", () => {
    expect(validar("3.1", 45_000_000).valor).toBe(45_000_000);
    expect(validar("3.1", 0).ok).toBe(false);
    expect(validar("3.1", null).ok).toBe(false);
  });

  it("la tasa de conversión guarda un decimal", () => {
    expect(validar("4.1", 1.84).valor).toBe(1.8);
    expect(validar("4.1", 120).ok).toBe(false);
  });

  it("la meta menor solo se confirma contra la meta que de verdad puso", () => {
    const r = { facturacion_objetivo_3m: 30_000_000, facturacion_mes_pasado: 40_000_000 };
    expect(validar("3.3s", 30_000_000, { r }).ok).toBe(true);
    expect(validar("3.3s", 99, { r }).ok).toBe(false);
  });

  it("Calcúlalo por mí: compras de al menos una, ingresos en pesos", () => {
    expect(validarCalculalo("3.6", 100).ok).toBe(true);
    expect(validarCalculalo("3.6", 0).ok).toBe(false);
  });
});

describe("avisos: «¿estás seguro?» — no rechazan, preguntan", () => {
  const r = { facturacion_mes_pasado: 700_000_000, ticket_promedio: 104_000, productos_principales: [{ nombre: "Fresh", precio: 89_900 }] };
  it("invertir en pauta más de lo que facturó: casi siempre es un cero de más", () => {
    expect(aviso("3.5", 130_000_000_000, r)).toMatch(/cero de más/);
    expect(aviso("3.5", 125_000_000, r)).toBe(null);
  });
  it("rentabilidad: en % o en pesos, con su IVA; cero es válido y más que el ticket no", () => {
    const rr = { ticket_promedio: 104_000, cpa_mes: 22_915 };
    expect(validar("3.8", { valor: 20, unidad: "pct", iva: "descontado" }, { r: rr }).valor).toEqual({ valor: 20, unidad: "pct", iva: "descontado" });
    expect(validar("3.8", { valor: 20, unidad: "pct" }, { r: rr }).ok).toBe(false);
    expect(validar("3.8", { valor: 0, unidad: "pct", iva: "no_aplica" }, { r: rr }).ok).toBe(true);
    expect(validar("3.8", { valor: 120_000, unidad: "pesos", iva: "no_aplica" }, { r: rr }).ok).toBe(false);
    expect(validar("3.8", null, { noLoSe: true }).ok).toBe(false);
  });
  it("rentabilidad: avisa si puso $22 en vez de 22%, si es casi nada, o si no cuadra con su CPA", () => {
    const rr = { ticket_promedio: 104_000, cpa_mes: 22_915 };
    expect(aviso("3.8", { valor: 22, unidad: "pesos", iva: "descontado" }, rr)).toMatch(/22%/);
    expect(aviso("3.8", { valor: 1, unidad: "pct", iva: "descontado" }, rr)).toMatch(/solo te queda el 1%/);
    expect(aviso("3.8", { valor: 70, unidad: "pct", iva: "descontado" }, rr)).toMatch(/DESPUÉS de pagar la pauta/);
    expect(aviso("3.8", { valor: 20, unidad: "pct", iva: "descontado" }, rr)).toBe(null);
  });
  it("recompra: número + días, meses o años; o «se compra una sola vez»", () => {
    expect(validar("5.1", { pct: 20, cada: { n: 3, unidad: "meses" } }).valor).toEqual({ pct: 20, cada: { n: 3, unidad: "meses" } });
    expect(validar("5.1", { pct: 0, cada: "una_vez" }).ok).toBe(true);
    expect(validar("5.1", { pct: 20, cada: { n: 3 } }).ok).toBe(false);
    expect(validar("5.1", { pct: 20 }).ok).toBe(false);
  });
  it("equipo: uno o varios roles de la lista, o lo que hace escrito", () => {
    expect(validar("6.1", [{ nombre: "Juan", roles: ["Edición de video", "Servicio al cliente / WhatsApp", "Inventado"] }]).valor[0].roles).toEqual(["Edición de video", "Servicio al cliente / WhatsApp"]);
    expect(validar("6.1", [{ nombre: "Ana", roles: [], que_hace: "lleva la contabilidad" }]).ok).toBe(true);
    expect(validar("6.1", [{ nombre: "Ana", roles: [] }]).ok).toBe(false);
  });
  it("un CPA objetivo más alto que el de hoy se pregunta", () => {
    expect(aviso("3.11", 30_000, { cpa_mes: 20_000 })).toBeTruthy();
    expect(aviso("3.11", 12_000, { cpa_mes: 20_000 })).toBe(null);
  });
  it("un CPA mayor que el ticket se pregunta, no se rechaza", () => {
    expect(aviso("3.6", 23_831_347, r)).toMatch(/más que tu ticket/);
    expect(validar("3.6", 23_831_347, { r }).ok).toBe(true);
    expect(aviso("3.6", 22_000, r)).toBe(null);
  });
  it("meta diez veces mayor, ticket imposible, facturación sin ceros", () => {
    expect(aviso("3.3", 8_000_000_000, r)).toBeTruthy();
    expect(aviso("3.3", 1_300_000_000, r)).toBe(null);
    expect(aviso("3.4", 400_000_000, r)).toBeTruthy();
    expect(aviso("3.1", 700_000, {})).toBeTruthy();
  });
  it("el total de tres meses no puede ser menor que el último mes", () => {
    expect(validar("3.2", 500_000_000, { r }).ok).toBe(false);
    expect(validar("3.2", 1_900_000_000, { r }).ok).toBe(true);
  });
});

describe("normaliza lo que el cliente pega desde el celular", () => {
  it("la página: le pone https si no lo trae", () => {
    expect(validar("1.4", "peluna.co").valor).toBe("https://peluna.co/");
    expect(validar("1.4", "https://peluna.co/tienda").valor).toBe("https://peluna.co/tienda");
    expect(validar("1.4", "no es una pagina").ok).toBe(false);
  });
  it("el Instagram: arroba, link o nombre suelto terminan en @usuario", () => {
    expect(validar("1.5", "@Peluna.Pets").valor).toBe("@peluna.pets");
    expect(validar("1.5", "peluna.pets").valor).toBe("@peluna.pets");
    expect(validar("1.5", "https://www.instagram.com/peluna.pets/?hl=es").valor).toBe("@peluna.pets");
    expect(validar("1.5", "peluna pets").ok).toBe(false);
  });
  it("socios: correo bien escrito, sin repetir, y el primero es quien llena", () => {
    const v = validar("1.6", [
      { nombre: "Laura", correo: " Laura@Peluna.co ", telefono: "300 123 4567" },
      { nombre: "Camilo", correo: "camilo@peluna.co", telefono: "+57 3109876543" },
    ]);
    expect(v.valor[0]).toEqual({ nombre: "Laura", correo: "laura@peluna.co", telefono: "3001234567", soy_yo: true });
    expect(v.valor[1].soy_yo).toBe(false);
    expect(validar("1.6", [{ nombre: "Laura", correo: "laura@", telefono: "3001234567" }]).ok).toBe(false);
    expect(validar("1.6", [
      { nombre: "Laura", correo: "a@p.co", telefono: "3001234567" },
      { nombre: "Camilo", correo: "A@p.co", telefono: "3001234567" },
    ]).ok).toBe(false);
  });
  it("teléfonos: un celular son 10 dígitos; de otro país, con + e indicativo", () => {
    const socio = (telefono) => validar("1.6", [{ nombre: "Laura", correo: "l@p.co", telefono }]);
    expect(socio("312 716 8243").ok).toBe(true);
    expect(socio("+57 312 716 8243").ok).toBe(true);
    expect(socio("573127168243").ok).toBe(true);
    expect(socio("6012345678").ok).toBe(true);
    expect(socio("+1 305 555 0142").ok).toBe(true);
    expect(socio("312918232323").ok).toBe(false);
    expect(socio("31271682").ok).toBe(false);
  });
  it("el acceso: correo, 8 caracteres y que coincidan", () => {
    expect(validarAcceso({ correo: "L@p.co", clave: "12345678", confirmacion: "12345678" }).valor.correo).toBe("l@p.co");
    expect(validarAcceso({ correo: "l@p.co", clave: "1234567", confirmacion: "1234567" }).ok).toBe(false);
    expect(validarAcceso({ correo: "l@p.co", clave: "12345678", confirmacion: "12345679" }).ok).toBe(false);
  });
});

describe("la cifra en palabras", () => {
  it.each([
    [45_000_000, "cuarenta y cinco millones"],
    [1_000_000, "un millón"],
    [21_000_000, "veintiún millones"],
    [2_100_000, "dos millones cien mil"],
    [47_000, "cuarenta y siete mil"],
    [61_500, "sesenta y un mil quinientos"],
    [1_000, "mil"],
    [101, "ciento uno"],
    [100, "cien"],
    [21, "veintiuno"],
    [450_000_000, "cuatrocientos cincuenta millones"],
    [1_500_000_000, "mil quinientos millones"],
    [999_999, "novecientos noventa y nueve mil novecientos noventa y nueve"],
  ])("%i → %s", (n, palabras) => {
    expect(montoEnPalabras(n)).toBe(palabras);
  });
  it("formato colombiano: punto de miles, coma decimal", () => {
    expect(pesos(45_000_000)).toBe("$45.000.000");
    expect(decimal(3.3333)).toBe("3,3");
    expect(decimal(3)).toBe("3");
    expect(leerMonto("$45.000.000")).toBe(45_000_000);
    expect(leerMonto("")).toBe(null);
    expect(leerDecimal("2,5")).toBe(2.5);
  });
  it("el mes + 3", () => {
    expect(mesMasTres(new Date(2026, 8, 20))).toBe("diciembre");
    expect(mesMasTres(new Date(2026, 10, 5))).toBe("febrero");
  });
});
