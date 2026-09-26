// Datos de EJEMPLO para diseñar la pantalla de onboarding en desarrollo
// (`/inicio/_demo-onboarding`). No es ningún cliente real y no toca la base.
const f = (campo, valor, puntos, origen = "formulario", extra = {}) => ({ campo, valor, puntos_estandar: puntos, origen, no_lo_se: false, ...extra });

export const DEMO = {
  company: { id: "_demo", name: "Marca de ejemplo", slug: "demo" },
  formulario: { status: "completo", alerta: false, alerta_motivos: [] },
  perfil: [
    f("tipo_marca", "marca_propia", []),
    f("web_url", "https://ejemplo.co/", ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8"]),
    f("instagram", "@ejemplo", ["7.1"]),
    f("num_productos", 8, ["1.0"]),
    f("productos_principales", [{ nombre: "Producto A", precio: 104000 }, { nombre: "Producto B", precio: 89900 }], ["1.0", "2.0"]),
    f("facturacion_mes_pasado", 700000000, ["2.0"]),
    f("facturacion_objetivo_3m", 1300000000, ["2.0", "1.11"]),
    f("ticket_promedio", 104000, ["2.0"]),
    f("gasto_pauta_mes", 125000000, ["2.0", "5.0"]),
    f("cpa_mes", 22915, ["2.1", "2.2"]),
    f("cpa_objetivo", 15000, ["2.1"]),
    f("rentabilidad_neta", { valor: 20, unidad: "pct", iva: "descontado" }, ["2.1"]),
    f("tasa_conversion", 2.1, ["6.1", "2.2"]),
    f("porcentaje_carga", 84, ["6.2", "2.2"]),
    f("recompra", { pct: 25, cada: { n: 2, unidad: "meses" } }, ["8.2", "2.2"]),
    f("base_datos_clientes", "si", ["8.3"]),
    f("equipo", [{ nombre: "Camilo", roles: ["Dueño / gerencia", "Pauta (trafficker)"], que_hace: "" }], ["9.1", "9.2", "9.4"]),
    f("cpa_maximo", 43715, ["2.1"], "calculado"),
    f("salud_margen", { aire: 0.476, semaforo: "verde" }, ["2.1"], "calculado"),
    f("conoce_numeros", { marcadas: 0, de: 3, lectura: "si" }, ["2.2"], "calculado"),
    f("nivel", { nivel: "ELITE", sobre_escala: true }, [], "calculado"),
  ],
  notas: {
    "1.1": { punto: "1.1", calificacion: { nota: 8 }, descripcion: "Vende bien incluso con anuncios flojos." },
    "1.2": { punto: "1.2", calificacion: { nota: 4 }, descripcion: "" },
    "1.7": { punto: "1.7", calificacion: { distribucion: [10, 20, 40, 20, 10] }, descripcion: "" },
  },
};
