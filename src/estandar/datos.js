// Cómo se nombra y se muestra cada dato del perfil de marca (brand_profile_data).
// Lo usan la pantalla de onboarding y el modal de Empresas.

import { pesos, decimal } from "../formulario/formato.js";

// ── Cómo se muestra un dato del formulario ──────────────────────────────────
export const ETIQUETAS = {
  contacto_nombre: "Contacto", marca_nombre: "Marca", tipo_marca: "Tipo de marca", web_url: "Página", instagram: "Instagram",
  socios: "Dueños", maneja_categorias: "Maneja categorías", num_categorias: "Categorías", num_productos: "Productos",
  productos_principales: "Productos principales", categorias_detalle: "Categorías", facturacion_mes_pasado: "Facturó el mes pasado",
  facturacion_3m_total: "Facturó en 3 meses", facturacion_objetivo_3m: "Meta a 3 meses", ticket_promedio: "Ticket promedio",
  gasto_pauta_mes: "Pauta del mes pasado", cpa_mes: "CPA de hoy", compras_mes: "Compras de la pauta", cpa_objetivo: "CPA objetivo",
  rentabilidad_neta: "Le queda por venta", reparto_pago: "Contraentrega / anticipado", tasa_entrega: "Se entregan",
  tasa_conversion: "Conversión de la web", porcentaje_carga: "Carga de la página", recompra: "Recompra", base_datos_clientes: "Base de datos exportable",
  equipo: "Equipo", cpa_maximo: "CPA máximo", roas_equilibrio: "ROAS de equilibrio", roas_general: "ROAS general", salud_margen: "Aire del margen",
  conoce_numeros: "\"No lo sé\" marcados", nivel: "Nivel", rentabilidad_por_venta: "Le queda por venta ($)", ventas_necesarias: "Ventas para la meta",
  inversion_necesaria_actual: "Pauta necesaria a CPA de hoy", facturacion_promedio_3m: "Promedio de 3 meses",
};
const EN_PESOS = /facturacion|ticket|gasto|cpa_|^cpa|rentabilidad_por|inversion|utilidad/;
export const TIPOS = { marca_propia: "Marca propia", aspiracional: "Aspiracional", dropshipping: "Dropshipping" };
const UNIDADES = { dias: "días", meses: "meses", anos: "años" };

export function mostrar(campo, v, noLoSe) {
  if (noLoSe) return "No lo sabe";
  if (v === null || v === undefined) return "—";
  switch (campo) {
    case "tipo_marca": return TIPOS[v] || v;
    case "socios": return v.map((s) => s.nombre).join(", ");
    case "productos_principales": return v.map((p) => `${p.nombre} (${pesos(p.precio)})`).join(" · ");
    case "categorias_detalle": return v.map((c) => `${c.categoria} (${pesos(c.ticket)})`).join(" · ");
    case "rentabilidad_neta": return `${v.unidad === "pct" ? `${decimal(v.valor)}%` : pesos(v.valor)} · IVA: ${{ descontado: "ya descontado", sin_descontar: "sin descontar", no_aplica: "no aplica" }[v.iva] || "—"}`;
    case "reparto_pago": return `${v.contraentrega}% / ${v.anticipado}%`;
    case "recompra": return `${decimal(v.pct)}% · ${v.cada === "una_vez" ? "se compra una sola vez" : `cada ${v.cada?.n} ${UNIDADES[v.cada?.unidad] || ""}`}`;
    case "equipo": return v.map((p) => `${p.nombre}: ${[...(p.roles || []), p.que_hace].filter(Boolean).join(", ")}`).join(" · ");
    case "salud_margen": return `${decimal(v.aire * 100, 0)}% · ${String(v.semaforo).replace("_", " ")}`;
    case "conoce_numeros": return `${v.marcadas} de ${v.de}`;
    case "nivel": return `${v.nivel}${v.sobre_escala ? " · sobre la escala" : ""}`;
    case "tasa_entrega": case "tasa_conversion": case "porcentaje_carga": return `${decimal(v)}%`;
    default: break;
  }
  if (typeof v === "number") return EN_PESOS.test(campo) ? pesos(v) : decimal(v, 2);
  if (v === "si") return "Sí";
  if (v === "no") return "No";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

