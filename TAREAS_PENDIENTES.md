> ⚠️ **DOCUMENTO DESACTUALIZADO — 26 de julio de 2026**
>
> Desde que se escribió hubo **95 commits y +22.470 líneas**. No menciona la
> papelera de briefs, la sofisticación de mercado, la cadena de diagnóstico ni
> el banco de creativos, y varias cosas que da por pendientes ya se hicieron.
>
> **Para el estado real: [ESTADO.md](ESTADO.md).** Esto se conserva como
> historia de lo que se pensaba en julio, no como guía.

# Tareas pendientes — Portal Inforce Reports

## Contexto
Portal de reportes de Meta Ads en portal.josehuila.com. Stack: React 19 + Vite, Supabase, Vercel. Archivo principal: `src/App.jsx` (~5000+ líneas). El archivo ya tiene implementado: CSV import de 3 niveles (campañas/conjuntos/anuncios), análisis con IA, observaciones de anuncios con matching, viewer estilo Meta Ads Manager con tabs y sorting.

## Tareas completadas (1, 2, 3)
- ✅ Autocomplete en match manual (buscar por nombre con filtro en vivo)
- ✅ Reconciliación Meta↔Shopify compacta (chip inline en vez de bloque grande)
- ✅ Embudo + Llamada + Accionables legacy → colapsados al final del reporte

---

## Tareas pendientes (4-10)

### Tarea 4: Coloring de métricas primarias en ReportView
**Dónde:** En la sección "Métricas primarias" del ReportView (las 6 MetricCards: Valor de conversión, Gasto total, Compras, Costo por compra, ROAS, Ticket promedio).

**Qué hacer:**
- Agregar un toggle con 2 opciones: "Comparar por objetivos" / "Comparar por promedio"
- Default: **promedio** (promedio de reportes anteriores del mismo cliente)
- Los colores de cada card cambian según la comparación:
  - **Rojo**: 30-40% por debajo del promedio/objetivo
  - **Naranja**: ~10% por debajo
  - **Gris**: en el promedio/objetivo
  - **Verde**: por encima del promedio/objetivo
  - **Azul/Dorado**: muy por encima (rendimiento excepcional)
- Para "comparar por promedio": necesita query a Supabase para obtener reportes anteriores del mismo `company_id`, calcular promedios de cada métrica
- Para "comparar por objetivos": usar `company.objectives` (roasTarget, roasMin, costPerPurchaseTarget, costPerPurchaseMax, revenueTarget)
- Valor de conversión: comparar con meta diaria/semanal/mensual proporcionalmente (revenueTarget / días del mes * días del período)

### Tarea 5: Modo Embudo en CampaignsAdsViewer
**Dónde:** Componente `CampaignsAdsViewer` en ReportView (la tabla de campañas/conjuntos/anuncios).

**Qué hacer:**
- Agregar toggle: "Modo completo" (actual) / "Modo embudo"
- Modo completo = tabla actual con todas las columnas y scroll horizontal
- Modo embudo:
  - Muestra solo: Nombre, Estado, Presupuesto, Gasto
  - Luego columnas de TRÁFICO (Impresiones, Alcance, Frecuencia, CPM, Clics, CPC, CTR) con coloring tenue según objetivos del cliente
  - Luego columnas de CONVERSIÓN (Visitas, Costo/visita, Pagos iniciados, Costo/pago, Compras, Costo/compra, Conversión, ROAS) con coloring fuerte según objetivos
  - Cada columna tiene su propia comparación coloreada:
    - Rojo: por debajo del objetivo
    - Naranja: cerca del objetivo
    - Gris: en el objetivo
    - Verde: por encima
    - Azul/dorado: muy por encima (excepcional)
  - Sigue con las tabs de Campañas/Conjuntos/Anuncios
  - Sigue con sorting clickeable

### Tarea 6: Rediseño del mensaje de WhatsApp
**Dónde:** Bloque de "Mensaje para WhatsApp" dentro de ReportView (IIFE que genera `waMsg`).

**Qué hacer:**
- NO mencionar cuellos de botella genéricos (CTR, checkout rate). Solo mencionar si el usuario los mencionó en su análisis.
- Sección "Campañas" con:
  - Campañas con BUEN rendimiento (verde): "Recomendable evaluar para escalar" + datos (compras, costo/compra, ROAS)
  - Campañas con MAL rendimiento (rojo): "Importante evaluar para optimizar" + datos (compras, costo/compra, ROAS)
  - NO incluir campañas mediocres (amarillo/gris)
  - Primero las buenas, luego las malas
- Sección "Anuncios" con:
  - Hablar de FORMATOS (no nombres específicos de ads que el cliente no entiende)
  - Ej: "Formato testimonial está generando buenos resultados, recomendable replicar"
  - Ej: "Formato carrusel con rendimiento bajo, evaluar para optimizar"
- Al final: "Para ver informe completo: [link al reporte]" (depende de Tarea 8 para el link real)
- Eliminar "Próximos pasos" y "Reporte generado por InforceReports"

### Tarea 7: Mejorar UI del análisis por horas
**Dónde:** Secciones de "Análisis — Por Horas" en ReportView (los bloques de Rendimiento actual, Campañas destacadas, Alertas, Acciones tráfico).

**Qué hacer:**
- Hacer el texto más conciso y escaneable
- Cada sección debería resaltar las cosas más relevantes de forma clara
- Mejor jerarquía visual: lo más importante destaca, lo secundario es más sutil
- El usuario dijo que actualmente es "un texto pegado" — debería ser más fácil de consumir para el cliente
- Considerar: sub-bullets, valores numéricos destacados, conclusiones al inicio de cada sección

### Tarea 8: URL routing limpio
**Dónde:** `src/main.jsx` y `src/App.jsx` — actualmente toda la app está en `portal.josehuila.com` sin importar la vista.

**Qué hacer:**
- Implementar routing con URLs limpias (NO hash):
  - `portal.josehuila.com/` → panel general (home)
  - `portal.josehuila.com/nara` → empresa Nara (company view)
  - `portal.josehuila.com/nara/reporte/[id]` → reporte específico
- URLs basadas en el slug de la empresa (`company.name.toLowerCase().replace(/\s+/g, "-")`)
- Agregar config en `vercel.json` para SPA fallback: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- El estado `view` y `selectedCompany`/`selectedReport` deben sincronizarse con la URL
- Links sencillos, fáciles de leer, fáciles de compartir
- El mensaje de WhatsApp incluye el link directo al reporte

### Tarea 9: Responsive mobile
**Dónde:** Todo `src/App.jsx` + `src/index.css`.

**Qué hacer:**
- Prioridad #1: **Vista del reporte final** (lo que ve el CLIENTE en su celular)
  - Cards de métricas: stack vertical en móvil (1 columna en vez de 3)
  - Tabla de campañas: scroll horizontal funcional en touch
  - Análisis sections: full-width con buen padding
  - Observaciones de anuncios: cards full-width
  - WhatsApp message: legible en móvil
  - Footer con botones de navegación accesibles
- Prioridad #2: Vista de empresa (company view)
  - Sidebar se convierte en menú hamburguesa o tabs superiores
  - Stats panel responsive
- Prioridad #3: Creación de reportes (nice-to-have)
- Usar `@media (max-width: 768px)` en index.css para overrides globales
- Usar inline `style` con detección de `window.innerWidth` donde sea necesario

### Tarea 10: Reordenar secciones del ReportView
**Dónde:** `function ReportView(...)` en `src/App.jsx`.

**Nuevo orden de secciones (de arriba a abajo):**
1. Header (empresa, período, tipo de reporte) — como está
2. Métricas primarias (con coloring de tarea 4)
3. Reconciliación (chip compacto — ya hecha)
4. Costo por compra, ROAS, Ticket promedio — como está
5. **Meta Ads Manager** (CampaignsAdsViewer con embudo mode de tarea 5) — SUBIR a esta posición
6. **Métricas clave vs objetivos** + simulación — después del viewer
7. **Análisis por horas** (mejorado por tarea 7)
8. **Observaciones de anuncios** (como está)
9. **Notas para copy** (como está)
10. **Mensaje WhatsApp** (rediseñado por tarea 6)
11. **Al final COLAPSADO:** Embudos detallados, Análisis de llamada, Accionables IA legacy, Subreportes por producto

---

## Notas técnicas
- El toggle de comparación (tarea 4) necesita acceso a reportes anteriores via `dbGetReports(companyId)` — ya existe esa función
- Para el routing (tarea 8): la app usa `view` state en `InforceReports()`. Necesita sincronizar con `window.history.pushState/popState`
- Para mobile (tarea 9): `src/index.css` ya tiene estilos base. Agregar media queries y posiblemente un `useIsMobile()` hook
- El archivo principal `src/App.jsx` tiene ~5500+ líneas. Tener cuidado con edits grandes
- La app tiene un `ErrorBoundary` exportado desde App.jsx que envuelve todo en main.jsx
- Hay un TeamApp lazy-loaded en `src/team/TeamApp.jsx` para `?zona=equipo` que NO debe tocarse
