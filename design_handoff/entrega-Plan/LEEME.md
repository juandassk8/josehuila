# Entrega — Cliente · Plan de implementación

**Empezá por acá:**
- `HANDOFF-Claude-Code.md` → todo lo que Claude Code necesita para implementarlo (dónde va, datos, tabla, estados, permisos, data-actions, orden de PRs).
- `CONTRATO-datos.md` → para el Claude de la skill de planes: qué debe producir el generador y qué no se puede romper.

## Qué va al repo (josehuilaa/inforce-app)

| Archivo de este ZIP | Destino en el repo |
|---|---|
| `design/Cliente - Plan.dc.html` | `design/Cliente - Plan.dc.html` |
| `design/tokens.css` | `design/tokens.css` (ya está; solo si cambió) |
| `design/support.js` | `design/support.js` (runtime del formato .dc.html; ya está) |
| `contexto/brief-para-claude-code.md` | `handoff/brief-plan.md` |
| `contexto/integracion-portal.md` | `handoff/integracion-portal.md` |
| `contexto/planes-accionables.json` | `handoff/planes-accionables.json` (copia de referencia; en producción se lee de `https://plan.josehuila.com/planes-accionables.json`) |

Se abre en el navegador tal cual: `design/Cliente - Plan.dc.html` (necesita `support.js` y `tokens.css` al lado).

## Cómo mapea a React

`src/workspace/PlanView.jsx` — hoy solo embebe el iframe con la barra de admin para
configurar `companies.objectives.plan_url`. La vista de fases/accionables/progreso es nueva;
el iframe pasa a ser la sección de abajo ("El documento de tus tres llamadas").

## Props del diseño (Tweaks)

- `theme`: `dark` | `light` (además hay toggle en el sidebar)
- `estado`: `listo` | `cargando` | `error` | `sin-plan`

## v3 (feedback de José)

- Leyenda del avance: solo **completadas** y **en curso** (pendientes y "más adelante" se quitaron para no ocupar espacio).
- Se quitó la nota "Las fases marcadas…" del encabezado; la regla queda escrita dentro de la fase `a_futuro`.
- La etiqueta de `a_futuro` dice **Adelante**.
- El expandido tiene un solo botón: **Crear tarea**. La tarea del portal ya trae fecha y responsable, así que agendar/asignar dejaron de ser botones sueltos; cuando el paso ya tiene tarea se muestra una pastilla con la fecha y el asignado que la abre (`new:plan.agendar-paso`).
- Fondos del expandido y del embed corregidos en **tema claro** (el `--hover` azul se veía muy oscuro).
- **Quitado con confirmación de José:** `plan.imprimir` del topbar (Claude Code: la función de imprimir el plan se elimina, no se mueve).

## v2 (feedback de José)

- El archivo incluye el **marco** (sidebar + topbar) con `data-shell="cliente"`: lo aporta `Shell Cliente`, no se porta dos veces.
- Fuera el bloque "Objetivo del acompañamiento". Arriba va **Avance del acompañamiento**: % grande + **barra por fases** (un tramo por fase, ancho ∝ sus accionables, relleno = lo hecho) + leyenda de estados.
- Layout a **dos columnas** para no dejar espacio muerto: fases/accionables a la izquierda, riel derecho fijo con el **documento embebido** (4 secciones: llamada 1/2/3 + estrategia) y **Quién responde por qué** (filtra por José/Nath/Deison).
- `ver el contexto` ahora también **mueve el iframe** a la sección de esa llamada (`inforce-goto`), sin salir de la pantalla.

## Pendiente de datos

Las etiquetas cortas de los tramos de la barra ("Atención", "Sistema", "Despliegue"…) no
existen en el JSON: hoy salen de un campo `corto` del diseño. O se agrega `corto` al
generador `extraer-accionables.js`, o el portal recorta el `titulo` — no se inventa en la base.

## data-action de la pantalla

| `data-action` | Dónde | Estado |
|---|---|---|
| `plan.abrir-documento` | chip del encabezado + botón del embed | existe (iframe) |
| `plan.ver-contexto` | cada accionable (fila y expandido) | nuevo handler, deriva la sección del responsable |
| `new:plan.marcar-paso` | checkbox del accionable | persiste `(cliente, paso_id, completado, completado_en)` |
| `new:plan.expandir-paso` | título + chevron | solo UI |
| `new:plan.agendar-paso` | expandido | `agendado_para` |
| `new:plan.asignar-paso` | expandido | `asignado_a` |
| `new:plan.crear-tarea` | expandido | crea tarea en el espacio de la empresa |
| `new:plan.filtrar` | pills Todo/Pendientes/Completados/Más adelante | solo UI |
| `new:plan.colapsar-fase` / `new:plan.colapsar-todo` | cabecera de fase / barra | solo UI |
| `new:plan.ir-a-seccion` | tarjetas de sección del riel | `postMessage inforce-goto` |
| `new:plan.ir-a-fase` | tramos de la barra de avance | scroll a la fase |
| `new:plan.filtrar-responsable` | "Quién responde por qué" | filtra los accionables por consultor |
| `new:plan.reintentar` | estado de error | refetch del JSON |
| `new:plan.contactar-equipo` | error + sin plan | abre WhatsApp / mensaje al equipo |

*Inforce Consulting*
