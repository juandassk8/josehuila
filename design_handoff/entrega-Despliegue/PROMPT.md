# Prompt para Claude Code

Copiá y pegá esto tal cual en Claude Code, con la carpeta `entrega-Despliegue/` dentro del repo
`inforce-app` (por ejemplo en `design_handoff/entrega-Despliegue/`).

---

Estás trabajando en el repo `inforce-app` (Vite + React + Supabase). Tenés que implementar el
rediseño de la pantalla **Despliegue creativo en su vista de CLIENTE (solo lectura)**.

**Antes de escribir código, leé en este orden:**

1. `design_handoff/entrega-Despliegue/README.md` — la especificación completa de la pantalla.
2. `design_handoff/entrega-Despliegue/Cliente - Despliegue.dc.html` — el diseño real. Es una
   referencia en HTML, **no** código para copiar: leelo para sacar medidas, colores, textos,
   jerarquía y comportamiento exactos. Es interactivo: si podés, abrilo y probalo.
3. `CLAUDE.md` (raíz) — reglas de UI del proyecto. **La Regla 0 manda: reskin, no rewrite.**
4. `DESIGN_INVENTORY.md` — ficha “Despliegue (vista cliente)”.
5. El código actual: `src/despliegue/DespliegueCreativo.jsx`, `ConceptCard.jsx`,
   `ConceptViewPanel.jsx`, `ExampleModal.jsx`, `CanvasFilterBar.jsx`, `StrategyModal.jsx`,
   `ConfigModal.jsx`, `constants.js`, `labels.js`, `db.js`, y
   `src/workspace/CompanyWorkspace.jsx` (el shell, que **no** se toca).

**Reglas duras:**

- No cambies props, estado, handlers, hooks, queries a Supabase ni lógica de permisos de lo que ya
  existe. No borres ninguna función: si algo sobra visualmente, va a un desplegable.
- No renombres estados de datos (`tofu/mofu/bofu`, `pending/produced/testing/winner/paused`, etc.).
- Usá los tokens de `src/index.css` y `DS` de `src/lib/design.js`. Nada de hex sueltos salvo los
  colores de etapa y de estrategia que el README lista explícitamente.
- Cero emoji en la UI: iconos SVG de trazo, `stroke-width 1.7–1.9`, `viewBox 0 0 24 24`.
- Doble tema obligatorio: revisá oscuro **y** claro. En claro no puede haber halos azules ni textos
  de etapa en neón (el README da las variantes oscuras).
- Esta vista es **solo lectura**: nada de drag & drop, agregar/editar conceptos, editar cadencia,
  simulador de escala ni sincronizar/importar. Eso queda intacto en la rama de admin.
- Cada control debe conservar el `data-action` que trae el HTML (sirve de trazabilidad). Los que
  empiezan con `new:` no existen hoy: construilos.

**Qué hay que implementar (resumen; el detalle está en el README):**

1. **Tablero como vista principal**, con canvas de zoom/pan y el embudo Top → Middle → Bottom de
   anchos decrecientes, con columnas Estáticos | Video por etapa.
2. **Tres layouts**: `Conceptos` (una tarjeta por concepto), `Colmena` (todas las referencias a la
   vez, miniaturas uniformes 52×65 y grilla que crece a lo ancho antes que a lo alto) y `Grilla`
   (lista secundaria con miniaturas 96×120).
3. **Panel flotante read-only**: Anuncios/Orgánico, Referentes/Creados, botón azul de Estrategia de
   venta, cumplimiento semanal total y por etapa, y ⚙ que abre la cadencia en lectura.
4. **Un solo botón “Opciones de filtro”** con popover de dos paneles (rail de categorías: Etapa,
   Formato, Marca, Nicho, Sub-nicho, Ángulo) + modo Resaltar / Ocultar resto + chips de filtro
   activo con ✕. El filtro evalúa **referencias** (AND entre categorías, OR dentro de cada una,
   insensible a acentos), y los contadores/miniaturas muestran solo lo que matchea.
5. **Modal de concepto**: por qué funciona / cómo se hace con Ver más, y la grilla de referencias
   respetando el aspecto real de cada archivo.
6. **Modal de referencia**: reproductor de video (o imagen si es estático), Descargar
   video/imagen, Ver en Meta, etiquetas, ficha de datos, notas y guion a todo el alto, y navegación
   ‹ › entre referencias sin cerrar.
7. **Estrategia de venta**: Ángulos (verde), Objeciones (rojo) y Conciencia (azul) en columnas
   simultáneas, con chips para ocultar/mostrar cada sección y Ver más por ítem; pensado para 3× más
   contenido.
8. **Cadencia de creativos en solo lectura**: números de la cuenta, presupuesto de prueba como
   línea 1×–10× con banda recomendada 3×–5×, distribución del presupuesto, creativos mínimos por
   semana y distribución por embudo.
9. **Estados**: cargando, sin despliegue todavía, vacío y sin match del filtro.

**Método de trabajo (una PR por paso):**

1. Escribí primero, como comentario al inicio del archivo, el **inventario** de todo lo que la
   pantalla hace hoy (botones, filtros, modales, estados, permisos por rol).
2. Implementá el diseño respetando ese inventario.
3. Al final, recorré el inventario y confirmá que cada ítem sigue accesible y sigue disparando el
   mismo handler.
4. Revisá tema oscuro y claro, y que el ⌘+scroll haga zoom **solo dentro del tablero** (listener
   `wheel` nativo no pasivo + `preventDefault`), nunca zoom de la página.
5. Cuando termines, listame: qué archivos tocaste, qué controles `new:` construiste y con qué
   handler, y qué quedó pendiente.

Si algo del diseño choca con una restricción real del código o de los datos, **pará y preguntame**
antes de improvisar.
