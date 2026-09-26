# Entrega de diseño — Despliegue creativo (vista CLIENTE, read-only)

Repo destino: **josehuilaa/inforce-app** · rama `main`
Pantalla del inventario: **“Despliegue (vista cliente)”** en `DESIGN_INVENTORY.md`
Archivos del repo que reemplaza/afecta: `src/despliegue/DespliegueCreativo.jsx` (rama cliente),
`ConceptCard.jsx`, `ConceptViewPanel.jsx`, `ExampleModal.jsx`, `CanvasFilterBar.jsx`,
`StrategyModal.jsx`, `ConfigModal.jsx` (versión lectura), `constants.js`, `labels.js`.

---

## 1. Qué es esto

`Cliente - Despliegue.dc.html` es una **referencia de diseño en HTML**: un prototipo que muestra
cómo debe verse y comportarse la pantalla. **No es código para copiar y pegar.** La tarea es
**recrear este diseño dentro de la app React existente** (Vite + React + Supabase), usando sus
patrones actuales: `DS` de `src/lib/design.js`, tokens de `src/index.css`, componentes y hooks que
ya existen. Nada de librerías nuevas.

**Fidelidad: alta (hi-fi).** Colores, tipografías, tamaños y espaciados son finales: replicarlos.

**Regla 0 del repo sigue vigente (`CLAUDE.md`)**: reskin, no rewrite. No cambiar props, estado,
handlers, queries ni permisos de lo que ya existe. Ninguna función se elimina.

**La pantalla es de SOLO LECTURA.** El cliente ve; no edita. Nada de drag & drop, ni agregar/editar
conceptos, ni editar cadencia, ni simulador de escala, ni sincronizar/importar del banco: eso vive
en la vista de equipo (`isAdmin`).

---

## 2. Marco y navegación

El sidebar y el topbar los aporta **`CompanyWorkspace.jsx`** (en el diseño están marcados
`data-shell="cliente"` y no se rediseñan). Del topbar de esta pantalla:

- Breadcrumb `Natucer / Despliegue` + título **“Despliegue creativo”** (30px/700, `-0.032em`).
- **Sin** subtítulo, **sin** botón Exportar (se quitaron a pedido del cliente).
- A la derecha un chip **“Solo lectura”** (pill `--chip`, 11.5px/600, ícono de ojo) con tooltip:
  “Esta vista es de solo lectura: tu equipo de Inforce es quien arma y edita el despliegue.”

---

## 3. Estructura de la pantalla

```
main
├─ header (shell)
└─ scroller  padding 0 28px 40px
   ├─ toolbar sticky (top:0, z-25, degradado del fondo)
   │   ├─ segmented: Conceptos | Colmena | Grilla
   │   ├─ contador “N conceptos · M referencias”
   │   └─ botón “Opciones de filtro · N” (popover)
   ├─ fila de chips de filtro activo (solo si hay filtro)
   └─ vista activa:
       ├─ TABLERO (Conceptos o Colmena) → canvas con zoom/pan
       └─ GRILLA (lista por etapa y formato)
modales: Concepto · Referencia · Estrategia de venta · Cadencia
```

### 3.1 Canvas (vistas Conceptos y Colmena)

- Contenedor: `border-radius 20px`, borde `--line`, alto `calc(100vh - 216px)` (mín. 540px),
  fondo `--canvas` con patrón de puntos `radial-gradient(--canvas-dot 1px, transparent 1px)`,
  `background-size: 26px 26px`, `overflow: hidden`, cursor `grab` / `grabbing`.
- Contenido transformado: `translate(panX, panY) scale(scale)`, `transform-origin: 50% 0`.
- **Zoom/pan solo dentro del canvas**: listener `wheel` **nativo y no pasivo** en el elemento
  (`addEventListener("wheel", h, { passive: false })` + `preventDefault()` + `stopPropagation()`).
  ⌘/Ctrl + scroll = zoom (`scale *= exp(-deltaY*0.006)`, límites 0.28–2.2); scroll normal = pan.
  Arrastre con botón izquierdo, ignorando clicks sobre `[data-action]`.
- Título del canvas: “Embudo de {empresa}” 38px/800 `-0.035em` + subtítulo 14px `--ink-3`
  (“Referentes que inspiran cada concepto” / “Anuncios creados para tu cuenta”).
- Un **frame por etapa**, con anchos decrecientes: TOFU 100%, MOFU 84%, BOFU 68%
  (si se filtra una sola etapa, esa pasa a 100%). Paredes: `border-left/right: 2px solid <wall>`,
  `border-radius: 24px`, padding `22px 26px 28px`.
- Título de etapa 26px/800 en **capital inicial** (“Top Of The Funnel”, nunca todo en mayúsculas),
  con `text-shadow` de glow solo en tema oscuro, y subtítulo 13px.
  **No** va ninguna línea de “N conceptos · N refs · meta” debajo (se quitó).
- Flecha entre etapas: línea `2px × 24px` en `--ink-3` (opacidad .55) + chevron en `--ink-2`
  (blanca, no de color).
- Por etapa, dos columnas: etiqueta **Estáticos** / **Video** en pill (`background: --ink`,
  `color: --bg`, 11.5px/700, `letter-spacing .04em`).
- Bucket vacío: texto itálico 12.5px `--ink-4` — “sin conceptos en este bucket” o
  “nada coincide con el filtro”.

### 3.2 Vista Conceptos — tarjeta (156→172px de ancho)

Orden vertical, exactamente este:

1. **Portada** 104px de alto: fondo `--raised` + rayas diagonales
   `repeating-linear-gradient(135deg, rgba(180,200,225,.10) 0 6px, transparent 6px 13px)`,
   ícono de formato centrado (film/grid) en `--ink-4` al 60%.
2. Título 12.5px/700, 2 líneas (`-webkit-line-clamp: 2`).
3. Descripción corta 11px/1.45 `--ink-3`, 2 líneas.
4. Hasta **2 etiquetas** (chips 9.5px/600, radio 999, `max-width 78px` con elipsis) con el color de
   su categoría.
5. Pie separado por `border-top`: label “N referencias” (9.5px/600, `--ink-4`) y **grilla de 4
   miniaturas clicables** (`aspect-ratio 4/5`, radio 6px) — las 3 primeras muestran la marca
   abreviada y la cuarta “+N” si hay más. Click en miniatura abre la referencia; click en la
   tarjeta abre el concepto.

**No** va chip de estado (Winner/Pausado…), **ni** el texto de métrica (“Apagado · CPA alto”),
**ni** pill Ads/Orgánico, **ni** la línea de marcas en la tarjeta.

### 3.3 Vista Colmena — todas las referencias a la vez

- Un panel por concepto: ancho **calculado** = `cols*52 + (cols-1)*6 + 28` px, radio 16, fondo
  `--surface`, `box-shadow: var(--shadow)`.
- Cabecera clicable (abre el concepto): título 13px/700 + descripción 11px a 2 líneas, separada
  por `border-bottom`.
- Label “N referencias” 9.5px/600 `--ink-4`.
- **Grilla de miniaturas todas del MISMO tamaño: 52×65 px**, radio 7, gap 6, con la marca en
  8px/600 centrada. Click → modal de referencia.
- **Regla de la colmena** (nunca más filas que columnas):
  `cols = n <= 6 ? 3 : clamp(4, ceil(sqrt(n)), 8)`.
  → 6 refs = 3 col; 12 = 4 col × 3 filas; 20 = 5×4; 25 = 5×5; 30 = 6×5.

### 3.4 Vista Grilla (secundaria)

Una `section` por etapa (radio 20, `--surface`, barra de color de 3px a la izquierda), con dos
columnas Estáticos | Video. Cada tarjeta: título 13.5px/700, descripción 12px, **miniaturas de
96×120 px** (radio 10, con la marca en 10px/600) en `grid-template-columns: repeat(auto-fill, 96px)`
gap 8, y al pie “N referencias” + hasta 2 chips de etiqueta en una fila que envuelve
(`row-gap: 6px`). Máximo 16 miniaturas por tarjeta.

### 3.5 Panel flotante (FloatingStatsPanel, read-only)

Arriba a la izquierda del canvas, `top/left 16px`, ancho **286px** expandido / **150px** colapsado,
radio 18, `--surface-solid`, `shadow-lg`.

- Cabecera: “DESPLIEGUE” 10.5px/600 `letter-spacing .08em` + nombre de la empresa 15px/700;
  botón ⚙ (abre **Cadencia**) y botón de colapsar (chevron que rota 90°/-90°).
- Segmented **Anuncios | Orgánico** (pipeline, pill 999).
- Segmented **Referentes | Creados** (vista).
- Botón **“Estrategia de venta”** en azul: borde `rgba(111,184,255,.42)`, fondo `--sel-soft`,
  texto `--sel` (antes era ámbar; el cliente lo pidió azul). Es el **único** acceso a estrategia:
  no hay ícono duplicado en la cabecera.
- **Cumplimiento semanal**: total “N / M” + barra, y una fila por etapa con “hechos / meta” y su
  propia barra. Color del total: verde ≥80%, ámbar ≥40%, rojo por debajo.
- Nota al pie 11px `--ink-4`: “Arrastrá para mover · ⌘ + scroll para zoom.”

### 3.6 Controles del canvas

- Zoom abajo a la derecha: `+ / ⊙ / −`, botones 38×38, radio 11, `--surface-solid`.
- Abajo a la izquierda: `%` de zoom + contador “N conceptos · M referencias”.
  (Se quitó la leyenda de estados: el cliente no ve estados de producción.)

---

## 4. Filtros — un solo botón

Botón **“Opciones de filtro · N”** (13px/600, radio 12, `--surface`, se tiñe con `--sel-soft` y
borde `rgba(111,184,255,.5)` cuando hay filtros). Popover 392px, `max-height 62vh`, radio 18,
`shadow-lg`, animación `popIn .16s cubic-bezier(.16,1,.3,1)`.

Layout del popover: **dos paneles** `grid-template-columns: 138px minmax(0,1fr)`:

- **Rail izquierdo** (categorías): Etapa · Formato · Marca · Nicho · Sub-nicho · Ángulo.
  Ítem activo `--sel-soft`/`--sel`; a la derecha, contador de valores seleccionados en el color de
  la categoría.
- **Panel derecho**: frase de ayuda de la categoría + chips de valores (radio 999, 12px/600) con el
  conteo de referencias de cada valor. Multi-selección en las categorías de etiqueta; selección
  única en Etapa y Formato.
- Pie: “Al filtrar” + segmented **Resaltar | Ocultar resto** + botón **Limpiar**.
- **No hay grupo “Links”** (se quitó; `linkMatches` queda en el modelo pero sin UI).

**Semántica del filtro (igual que `CanvasFilterBar.jsx`)**: el filtro se evalúa sobre las
**referencias** (`despliegue_variations.bank_labels`), AND entre categorías y OR dentro de cada
categoría, insensible a mayúsculas/acentos (`normLabel`).

- Un concepto queda visible si le queda **al menos una** referencia que matchea.
- Contadores y miniaturas muestran **solo** las referencias que matchean (“3 de 8 referencias”).
- Modo **Resaltar**: los conceptos que no matchean quedan en `opacity: 0.26`.
- Modo **Ocultar resto**: desaparecen del embudo; si no queda ninguno, se muestra el estado vacío
  “Nada coincide con este filtro” con botón **Limpiar filtros**.

Debajo de la toolbar, fila de **chips activos** (“Resaltando:” / “Ocultando lo que no coincide:”)
con ✕ por chip y **Limpiar todo**.

---

## 5. Modales

### 5.1 Concepto (read-only) — espeja `ConceptViewPanel.jsx`

Overlay `rgba(8,8,14,.62)` + `blur(3px)`, centrado, `max-width 780px`, radio 20, `height: fit-content`.

- Cabecera: chip de etapa (punto + nombre), chip de formato, hasta 2 chips de etiqueta, título
  22px/700 `-0.028em`, descripción corta, y ✕ (cierra con ✕, overlay y **Escape**).
- Dos tarjetas: **“Por qué funciona”** y **“Cómo se hace”**, texto 13px/1.65 recortado a
  **4 líneas** con botón **Ver más / Ver menos** (expande in-place).
- **Referentes / Anuncios creados**: título + contador (“3 de 8” si hay filtro) + marcas de las
  referencias; grilla `repeat(auto-fill, minmax(136px,1fr))` con tarjetas: preview con
  `aspect-ratio` **real de la referencia** (9:16, 4:5 o 1:1), botón de play (video) o ícono de
  imagen (estático), badge con duración o relación de aspecto, marca 11.5px/700 y título 11px.

### 5.2 Referencia (read-only) — espeja `ExampleModal.jsx` en modo cliente

Overlay `rgba(6,7,12,.72)` + `blur(4px)`, `max-width 1000px`, `align-items: flex-start`.

- Cabecera: **marca** 16px/700 + título 13px, y meta “concepto · etapa”.
  A la derecha: **‹ , “i / n”, ›** para pasar a la referencia anterior/siguiente **sin cerrar**
  (circular dentro de la lista del concepto) y luego ✕.
- Columna izquierda (380px, borde derecho):
  - **Video**: `<video controls playsinline preload="metadata">` con `aspect-ratio 9/16`,
    `max-height 52vh`, `object-fit: contain`. En producción: `drive_url` / archivo real.
  - **Estático**: placeholder con la relación de aspecto real y su etiqueta (9:16 / 4:5 / 1:1);
    en producción, la imagen.
  - Botones: **“Descargar video”** o **“Descargar imagen”** según el tipo (Drive:
    `driveDownloadUrl`), y **“Ver en Meta”** (`meta_ads_library_url`, `target="_blank"`).
    Si el link no existe, el botón no se muestra (como hoy en `ExampleModal`).
  - **Etiquetas**: todos los chips de `bank_labels` con el color de su categoría.
  - Ficha de datos (filas con `border-bottom`): Formato (`Video 0:24` / `Estático 4:5`),
    Días corriendo, Meta Ads Library (Disponible / Sin link), Archivo en Drive.
- Columna derecha: **Notas del equipo** (13px/1.65) y **Guion / transcripción** en bloque
  `white-space: pre-wrap`, 12.5px/1.75, que **ocupa todo el alto disponible** con scroll interno
  (no queda espacio muerto abajo).

### 5.3 Estrategia de venta (read-only) — espeja `StrategyModal.jsx`

`max-width 900px`, `align-items: flex-start`. Las **tres taxonomías se ven al mismo tiempo**, una
por columna: `grid-template-columns: repeat(<visibles>, minmax(0,1fr))`.

- Fila **“Mostrar”** con un chip por sección para **ocultar/mostrar** (mismo patrón que los
  filtros); al ocultar una, el grid se recalcula.
- Colores por sección (oscuro / claro):
  **Ángulos** `#34C08A` / `#17976A` · **Objeciones** `#E24B4A` / `#C4302F` ·
  **Conciencia** `#58A6FF` / `#2664CC`. (Ángulos es **verde**, no ámbar.)
- Cada columna: cabecera `position: sticky; top: 0` con tinte de su color, nombre 13px/700,
  contador y la frase guía de la sección (misma copy que `StrategyModal`).
- Ítems: tarjeta con borde izquierdo de 2px del color, fondo `--surface-2` (en claro **#FFFFFF**),
  título 12.5px/700, cuerpo 12px/1.6 recortado a **3 líneas** + **Ver más / Ver menos** por ítem.
  Está pensado para escalar a 3× más contenido: la zona scrollea, no crece el modal.

### 5.4 Cadencia de creativos (read-only) — `ConfigModal.jsx` sin edición

`max-width 880px`, `align-items: flex-start`, contenido scrolleable. Copy de cabecera:
“Cuántos creativos se producen por semana según tu inversión. **La configura tu equipo.**”

1. **Números de la cuenta** (`repeat(auto-fit, minmax(168px,1fr))`, valor 21px/700 `tabular-nums`):
   Inversión semanal `$10.000.000` · Costo por compra (CPA) `$100.000` ·
   Ticket promedio (AOV) `$500.000` · ROAS objetivo `3,2×`.
2. **Presupuesto de prueba por creativo**: **línea de 1× a 10×** con la banda **3×–5×** resaltada
   en verde translúcido, marcador con el valor vigente (`3×`) sobre la línea, ticks 1×…10× (los de
   la banda en verde/700) y la nota “Entre 3× y 5× es el rango recomendado para tu CPA actual.”
3. **Distribución del presupuesto**: dos tarjetas — ESCALAR GANADORES `70 %` ≈ `$7.000.000 COP`,
   TESTING `30 %` ≈ `$3.000.000 COP` — con su explicación.
4. **Creativos mínimos por semana**: banda verde con el número grande (42px/800) y la fórmula
   “Presupuesto de testing ÷ (CPA × presupuesto de prueba)”.
5. **Distribución por embudo**: TOFU `60 %` ≈ 24 creativos (16 video · 8 estáticos),
   MOFU `30 %` ≈ 12 (8 · 4), BOFU `10 %` ≈ 4 (2 · 2).

**No** va “Ritmo de entrega” ni “Creativos al aire” (se quitaron). Todos los valores son de lectura;
la edición sigue siendo del admin en `ConfigModal`.

---

## 6. Estados

| Estado | Cuándo | Qué se ve |
|---|---|---|
| **Cargando** | fetch en curso | Canvas con tres frames punteados y tarjetas 130×150 en `breathe 1.4s`, más “Cargando tu despliegue…” con spinner (`spin 1s linear`). |
| **Sin despliegue todavía** | la empresa no tiene despliegue | Caja punteada, ícono de embudo, “Tu despliegue todavía no está armado” + explicación + botón “Escribirle a tu equipo”. |
| **Vacío** | despliegue sin conceptos | “Todavía no hay conceptos” + misma caja. |
| **Sin match** | filtro sin resultados en modo Ocultar resto | “Nada coincide con este filtro” + **Limpiar filtros** + “Escribirle a tu equipo”. |

En el prototipo se recorren con la prop `estado` (`listo` / `cargando` / `vacio` / `sin-despliegue`).
En la app: derivar de `loading`, del despliegue de la empresa y del resultado del filtro.
`CompanyHome.jsx` hoy se traga la excepción del `useEffect`; si se agrega estado de error, usar la
misma caja con un botón reintentar.

---

## 7. Estado de UI necesario

```
theme            'dark' | 'light'      (ya existe: applyTheme)
layout           'conceptos' | 'colmena' | 'grilla'
view             'referentes' | 'creados'      (existe: view toggle)
pipeline         'ads' | 'organic'             (existe: PipelineTypeToggle)
stage            'all' | 'tofu' | 'mofu' | 'bofu'
format           'all' | 'static' | 'video'
filters          { marca:[], nicho:[], subnicho:[], angulo:[] }   (CanvasFilterContext)
mode             'resaltar' | 'filtrar'
filterOpen, filterTab
panelOpen
scale, panX, panY, panning
conceptRef, refId
whyOpen, howOpen
strategyOpen, strategyHidden{}, strategyExpanded{}
cadenceOpen
```

Escape cierra en cascada: referencia → concepto → estrategia/cadencia → popover de filtros.
Click fuera cierra el popover (listener en `window` que ignora `[data-menu-root]`).

---

## 8. Inventario de controles (`data-action`)

Los `data-action` están en el HTML, uno por control. Los que llevan prefijo **`new:`** no existen
hoy en el código y hay que construirlos.

| `data-action` | Qué hace | Estado en el repo |
|---|---|---|
| `despliegue.cambiar-vista` | Referentes ↔ Creados | existe (view toggle) |
| `despliegue.cambiar-pipeline` | Anuncios ↔ Orgánico | existe (`PipelineTypeToggle`) |
| `despliegue.filtrar` | abre el popover de filtros | existe (`CanvasFilterBar`) |
| `despliegue.filtro-categoria` | chip de marca/nicho/sub-nicho/ángulo | existe |
| `despliegue.filtro-modo` | Resaltar ↔ Ocultar resto | existe |
| `despliegue.limpiar-filtros` | limpia todo | existe |
| `despliegue.abrir-concepto` / `cerrar-concepto` | panel de concepto | existe (`ConceptViewPanel`) |
| `despliegue.abrir-referencia` / `cerrar-referencia` | modal de referencia | existe (`ExampleModal` read-only) |
| `despliegue.reproducir-video` | player inline | existe |
| `despliegue.descargar-video` | descarga (video o imagen) | existe (`driveDownloadUrl`) |
| `despliegue.ver-en-meta` | abre Meta Ads Library | existe |
| `despliegue.estrategia-de-venta` / `cerrar-estrategia` | modal de estrategia | existe (`StrategyModal`, en lectura) |
| `despliegue.colapsar-panel` | colapsa el panel flotante | existe |
| `despliegue.zoom` | + / ⊙ / − | existe (`ZoomControls`) |
| `new:despliegue.cambiar-layout` | Conceptos / **Colmena** / **Grilla** | **nuevo**: hoy solo existe el canvas por conceptos |
| `new:despliegue.filtrar-etapa` | filtro por etapa dentro del popover | **nuevo** en despliegue (existe en el Banco) |
| `new:despliegue.filtrar-formato` | filtro por formato | **nuevo** en despliegue |
| `new:despliegue.ver-cadencia` / `despliegue.cerrar-cadencia` | cadencia en **solo lectura** | **nuevo**: `ConfigModal` es editable y de admin |
| `new:despliegue.ver-mas-concepto` | Ver más en “por qué funciona” / “cómo se hace” | **nuevo** |
| `new:despliegue.estrategia-seccion` | ocultar/mostrar Ángulos · Objeciones · Conciencia | **nuevo** |
| `new:despliegue.estrategia-ver-mas` | Ver más por ítem de estrategia | **nuevo** |
| `new:despliegue.referencia-anterior` / `referencia-siguiente` | navegar entre referencias sin cerrar | **nuevo** |
| `new:despliegue.contactar-equipo` | CTA de los estados vacíos | **nuevo** |

---

## 9. Datos que necesita la pantalla

Todo sale de lo que ya existe en `src/despliegue/db.js` y `pipeline_db.js`:

- **Concepto** (`despliegue_concepts`): `id`, `stage` (`tofu|mofu|bofu`), `format`
  (`static|video`), `pipeline_type` (`ads|organic`), `name`, `description` (descripción corta),
  `why` → hoy `description` larga / `execution` (“cómo se hace”), y sus referencias.
- **Referencia / variación** (`despliegue_variations`): `id`, marca (de `bank_labels.marca`),
  `title`, tipo (video o estático), relación de aspecto del archivo, duración, días corriendo,
  `notes`, `transcript`, `meta_ads_library_url`, `drive_url`, `bank_labels`
  (`{marca, nicho, subnicho, angulo, formato}`).
- **Metas de cadencia** (`config` del despliegue): inversión, CPA, AOV, presupuesto de prueba,
  split escalar/testing, mínimos por semana, distribución por embudo, y metas por etapa para el
  cumplimiento semanal.
- **Estrategia** (`config.touchpoints`): `angles`, `objections`, `awareness`, cada ítem con
  `title` + `body`.

La relación de aspecto de cada referencia hay que exponerla (o derivarla del archivo) porque el
diseño la usa: en **Conceptos** y en el detalle las previews respetan el aspecto real, y en
**Colmena** todas se normalizan a 52×65.

---

## 10. Design tokens

Todos están en `tokens.css` (espejo de `src/index.css` + `src/lib/design.js`): usar esos, no hex
sueltos. Extras propios de esta pantalla:

| Uso | Oscuro | Claro |
|---|---|---|
| TOFU | `#27E38F` (texto y relleno) | texto `#0F8F5B`, relleno `#27E38F` |
| MOFU | `#FFD23F` | texto `#8A6A12` |
| BOFU | `#FF5A5A` | texto `#C4302F` |
| Fondo de app | `var(--bg)` + `var(--ambient)` | `#F5F6F8`, **sin** halos |
| Papel del canvas | `var(--canvas)` + puntos `var(--canvas-dot)` | `#FBFBFC` + puntos `rgba(30,45,80,.12)` |
| Ángulos / Objeciones / Conciencia | `#34C08A` / `#E24B4A` / `#58A6FF` | `#17976A` / `#C4302F` / `#2664CC` |
| Tarjeta de estrategia | `var(--surface-2)` | `#FFFFFF` |

Radios: pill 999 · card 14–20 · botón/input 10–12 · chip 6–10.
Miniaturas: colmena **52×65**, grilla **96×120**, tarjeta de concepto 4/5 en 4 columnas.
Tipografía: Plus Jakarta Sans. **JetBrains Mono solo** para códigos tipo `A-141`; los números de la
cadencia y de los contadores van en Plus Jakarta Sans con `font-variant-numeric: tabular-nums`
(el cliente rechazó la mono para esas cifras).
Animaciones: `popIn .18s cubic-bezier(.16,1,.3,1)`, `fadeIn .14s`, `breathe 1.4s`, `spin 1s`,
transiciones de opacidad `.18s ease`.

---

## 11. Accesibilidad y detalles que el cliente pidió explícitamente

1. Títulos de etapa en **capital inicial**, nunca en mayúsculas completas.
2. **Sin** la línea de “N conceptos · N refs · X/Y de la meta” bajo cada etapa.
3. En **Colmena**, todas las miniaturas del **mismo tamaño**, y la grilla crece a lo ancho antes
   que a lo alto.
4. En **Conceptos**, las miniaturas van **abajo** de la tarjeta, no arriba.
5. Miniaturas de la **Grilla** grandes (96×120), no diminutas.
6. **Un solo** botón de filtros (nada de dos desplegables suelos + toggle de etiquetas).
7. **Sin** selector de semana, **sin** botón Exportar, **sin** subtítulo del header.
8. Botón de estrategia en **azul** y sin ícono duplicado.
9. **Ángulos en verde.**
10. Zoom/pan **solo dentro del tablero**, nunca zoom de toda la página.
11. Tema claro sin azules raros y con contraste real en los colores de etapa.
12. Modales sin espacio muerto: se ajustan al contenido y el guion ocupa el alto disponible.
13. Navegación **‹ ›** entre referencias sin cerrar el modal.

---

## 12. Archivos de este paquete

| Archivo | Qué es |
|---|---|
| `Cliente - Despliegue.dc.html` | El diseño. Se abre en el navegador; el prototipo es interactivo (filtros, zoom, modales, tema claro/oscuro). |
| `Shell Cliente.dc.html` | El marco (sidebar + topbar) que ya existe: **no se rediseña**, solo se referencia. |
| `tokens.css` | Tokens compartidos: espejo de `src/index.css` + `src/lib/design.js`. |
| `support.js` | Runtime del prototipo. **No** se lleva a la app. |
| `PROMPT.md` | Prompt listo para pegarle a Claude Code. |

Para ver el prototipo: abrir `Cliente - Despliegue.dc.html` en el navegador (los cuatro archivos
tienen que quedar en la misma carpeta).
