# Handoff a Claude Code — Cliente · Plan de implementación

Todo lo que hay que saber para portar `design/Cliente - Plan.dc.html` a React dentro de
Inforce Central, sin perder funciones y sin inventar datos.

Archivos que acompañan este handoff:

| Archivo | Para qué |
|---|---|
| `design/Cliente - Plan.dc.html` | el diseño aprobado (se abre en el navegador; necesita `support.js` y `tokens.css` al lado) |
| `contexto/brief-para-claude-code.md` | el proyecto completo: reparto portal↔documento, estructura de la data, reglas |
| `contexto/planes-accionables.json` | la data real: 9 clientes, 188 accionables |
| `contexto/integracion-portal.md` | el contrato `postMessage` + el `PlanEmbed` de referencia |
| `CONTRATO-datos.md` | qué tiene que producir el generador de planes (para el otro Claude) |

---

## 1. Dónde va

| | |
|---|---|
| Componente | `src/workspace/PlanView.jsx` |
| Ruta | la que ya usa el nav del workspace (`nav.plan`) |
| Shell | `CompanyWorkspace.jsx` — **el sidebar y el topbar NO se portan** |
| Tokens | `src/index.css` + `src/lib/design.js` |

En el archivo de diseño, el sidebar y el topbar están marcados con
`data-shell="cliente"`. Están ahí **solo para revisar la pantalla completa**. Al portar:
se descartan y el contenido arranca en el contenedor scrolleable
(`padding: 0 30px 44px`), igual que el resto de las pantallas de cliente.

Lo que sí se toma del topbar del diseño: el subtítulo (`6 fases · 16 accionables`) y el
botón primario **Abrir el documento** — van al topbar del shell, no dentro de la vista.

### Qué hace `PlanView.jsx` hoy (inventario, paso 1 del ciclo)

1. Lee `companies.objectives.plan_url` (jsonb, sin migración).
2. Barra de admin (`isAdmin`): configurar / cambiar la URL del plan, con Guardar y Cancelar.
3. Iframe a pantalla completa con `?theme=dark|light` y `postMessage({type:"inforce-theme"})` en `onLoad` y al cambiar de tema.
4. Estado "Cargando plan…".
5. Estado vacío "Todavía no hay plan de implementación" (con copy distinto para admin y cliente).

**Nada de eso se elimina.** El rediseño lo envuelve:

| Hoy | Después |
|---|---|
| iframe a pantalla completa | pasa al **riel derecho**, con las 4 secciones y su botón de abrir en pestaña nueva |
| barra de admin con la URL | se conserva igual, arriba del contenido, solo con `isAdmin` (`plan.configurar-url`) |
| "Cargando plan…" | esqueleto de carga del diseño (`estado: "cargando"`) |
| estado vacío | estado **sin plan** del diseño (`estado: "sin-plan"`) |
| — | **nuevo:** avance, fases, accionables, expandido, filtros, error |

---

## 2. La regla de arquitectura (no negociable)

| | Portal | Documento HTML |
|---|---|---|
| Fases y accionables con checkbox | ✅ fuente de verdad | ❌ mapa de lectura |
| Progreso, responsable, fechas | ✅ | ❌ |
| Las tres llamadas y su contexto | ❌ | ✅ fuente de verdad |
| Estrategia de venta (ángulos, objeciones, conciencia) | ❌ | ✅ |

**Nunca dos progresos.** El documento ya tiene los checkboxes y la barra quitados.
Y **la Estrategia de venta no entra al portal**: se ve dentro del iframe.

---

## 3. Datos

### 3.1 El JSON (solo lectura)

`https://plan.josehuila.com/planes-accionables.json` — lo regenera Inforce con
`extraer-accionables.js`. El portal **nunca** lo escribe.

```
{ generado, planes: [ { cliente, marca, documento, total_fases, total_pasos,
  fases: [ { orden, id, titulo, tiempo, descripcion, a_futuro, color,
    pasos: [ { orden, id, accionable, descripcion, responsable } ] } ] } ] }
```

- `cliente` es el slug y es el id estable del plan; se casa con el slug de la empresa.
- `fase.id` (`n1`, `n2`, …, `nf`) y `paso.id` (`t1`…`t16`) son **estables**: si el plan
  crece de 16 a 18 pasos, lo ya marcado no se pierde.
- `tiempo` es texto libre: `"~1-2 semanas"`, `"Continuo"`, `"Más adelante"`.
- `a_futuro: true` → fase opcional, va al final, se ve distinta y **no cuenta** para el %.
- `color` viene del JSON pero **el portal no lo usa** para pintar estados: el estado se
  deriva de lo marcado (ver 4.2). Ese hex es del documento.

Fetch: una sola vez por sesión, con caché en memoria + `sessionStorage`; se busca el plan
por `cliente === slug` de la empresa. Si el archivo no responde → estado **error** con
`new:plan.reintentar` (las marcas guardadas no se tocan). Si el JSON responde pero no hay
plan para ese slug → estado **sin plan**.

### 3.2 La tabla de estado (lo único que el portal escribe)

```sql
create table plan_pasos (
  cliente      text not null,          -- slug del plan (= companies.slug)
  paso_id      text not null,          -- id del paso dentro del plan
  completado   boolean not null default false,
  completado_en timestamptz,
  agendado_para date,
  asignado_a   uuid,                   -- fk al miembro
  tarea_id     uuid,                   -- tarea creada desde el accionable
  primary key (cliente, paso_id)
);
```

- **Cero textos duplicados.** Ni el título del accionable, ni la descripción, ni la fase.
  Cuando Inforce corrige la redacción, se actualiza en todos lados sin migración.
- **Paso huérfano:** si hay un `paso_id` en la tabla que ya no existe en el JSON, se
  ignora en silencio y no cuenta para nada. El diseño lo trae de muestra (`t99`).
- `completado_en` se escribe al marcar y se limpia al desmarcar.
- RLS: igual que el resto del workspace (miembros de esa empresa + admin de Inforce).

---

## 4. La vista, de arriba a abajo

### 4.1 Avance del acompañamiento

- **%** grande en JetBrains Mono (números que se comparan) + `N de M accionables` +
  `X de Y fases cerradas`.
- **La barra por fases**: un tramo por fase, `grid-template-columns` con `Nfr` donde
  `N = fase.pasos.length` (el ancho es proporcional a los accionables). El relleno de cada
  tramo es `hechos/total` de esa fase. Verde si la fase está completa, azul `--sel` si va
  en curso, ámbar punteado si es `a_futuro`. Debajo, `número + etiqueta corta`.
- **Leyenda**: solo *completadas* y *en curso* (decisión de José: pendientes y "adelante"
  se quitaron para no ocupar espacio).
- Click en un tramo → `new:plan.ir-a-fase` (scroll a esa fase; en el diseño resetea filtros).

**El cálculo del %:**

```js
const cuentan = plan.fases.filter(f => !f.a_futuro).flatMap(f => f.pasos.map(p => p.id));
const hechos  = cuentan.filter(id => estado[id]?.completado).length;
const pct     = cuentan.length ? Math.round(hechos / cuentan.length * 100) : 0;
```

Ojo: `cuentan` sale del JSON, no de la tabla → el huérfano queda fuera solo.

### 4.2 Fases

Estado **derivado**, nunca guardado:

| Estado | Cuándo | Color |
|---|---|---|
| Completada | todos sus pasos marcados | `--green` |
| En curso | alguno marcado | `--sel` (azul) |
| Pendiente | ninguno | `--ink-3` neutro |
| Adelante | `a_futuro: true` | `--amber` |

Cada fase: riel de color de 3px a la izquierda, número en mono (o check si está completa),
título, chip de estado, descripción corta, `tiempo`, `hechos/total` con mini barra, y
chevron para cerrarla (`new:plan.colapsar-fase`).

**Fases `a_futuro`:** borde punteado, sin `box-shadow` de vidrio, `opacity .78`, chip
ámbar **Adelante**, ratio `—` en vez de `0/1`, y al pie la nota
*"Opcional: no cuenta para tu porcentaje de avance."*

### 4.3 Accionables

Grid de columnas fijas (obligatorio, para que alineen entre filas):

```
grid-template-columns: 22px minmax(0,1fr) 128px 116px 24px;  gap: 11px;
```

checkbox · `nn` + título · responsable · *ver el contexto* · chevron.

- **Marcar** (`new:plan.marcar-paso`): optimista, y en el mismo tick recalcula el % y el
  estado de la fase. Título tachado y `--ink-4` cuando está hecho. El check es **verde**,
  nunca rojo.
- **Responsable**: pastilla con inicial en círculo. José = `--blue`, Nath = `--purple`,
  Deison = `--green`. Sale del JSON, el cliente no lo edita.

### 4.4 Accionable expandido

Uno abierto a la vez. Muestra:

1. **Por qué** — la `descripcion` completa del paso (2 a 4 líneas de detalle técnico real).
2. **Crear tarea** (`new:plan.crear-tarea`) — único botón de acción. Crea la tarea en el
   espacio/empresa con el título del accionable, y ahí mismo se le pone fecha y
   responsable; guarda `tarea_id`, `agendado_para`, `asignado_a`. Decisión de José: no van
   botones separados de agendar y asignar.
3. Si el paso **ya tiene tarea**, pastilla azul con `fecha · asignado` que la abre
   (`new:plan.agendar-paso`).
4. **Ver el contexto en la llamada N** (`plan.ver-contexto`) — ver 4.6.
5. Si está hecho: `Completado el <fecha>` en verde.

### 4.5 Filtros

Pills `Todo el plan / Pendientes / Completados / Adelante` con contador
(`new:plan.filtrar`), `Cerrar todo / Abrir todo` (`new:plan.colapsar-todo`), y en el riel
**Quién responde por qué** filtra por consultor (`new:plan.filtrar-responsable`).
Si el filtro no deja nada: bloque "Ningún accionable con este filtro" + volver a todas.

### 4.6 "Ver el contexto" — el enlace que no se puede perder

La sección **se deriva del responsable**, no hay campo nuevo en el JSON:

| responsable | sección |
|---|---|
| José | `llamada-1` |
| Nath | `llamada-2` |
| Deison | `llamada-3` |

Secciones disponibles en todos los documentos: `bienvenida`, `recorrido`, `llamada-1`,
`llamada-2`, `llamada-3`, `estrategia`, `accionPlan` (Nubora y Yavora traen además
`implementacion`).

Comportamiento aprobado: **no navega fuera**. Hace `setSeccion(seccion)` → el riel manda
`inforce-goto` al iframe y el documento cae en esa llamada. El `href` se conserva
(`/documento?section=llamada-2`) para abrir en pestaña nueva con cmd-click.

### 4.7 El riel derecho

- **Tus tres llamadas**: 4 tarjetas (`llamada-1`, `llamada-2`, `llamada-3`, `estrategia`)
  con la barrita de color del consultor; la activa en `--sel-soft`. Click →
  `new:plan.ir-a-seccion` → `postMessage({type:"inforce-goto", section})`.
- **El iframe** debajo (en el diseño es un placeholder rayado con la URL).
- **Quién responde por qué**: José / Nath / Deison con su `hechos/total` y filtro.
- Layout: `grid-template-columns: minmax(440px,1fr) minmax(304px,424px)`, riel
  `position: sticky; top: 0`. Bajo 1250px el riel pasa **debajo**, a una columna
  (media query en el `<helmet>`, es la única regla que no puede ir inline).

### 4.8 El embed

Se toma tal cual el `PlanEmbed` de `contexto/integracion-portal.md`:

- `scrolling="no"`, el alto lo controla el portal con lo que reporta `inforce-height`
  (nada de scroll dentro de scroll). En el riel, con `max-height` y el resto por `inforce-height`.
- Tema: `?theme=dark|light` en la carga inicial + `inforce-theme` en caliente (ya existe
  en `PlanView`, no recargar el iframe al cambiar de tema).
- `inforce-ready` → guardar `sections` y mandar el `inforce-goto` inicial.
- `inforce-nav {to:'plan'}` → el botón interno del documento; el portal navega a su
  propia vista de plan (con el riel ya montado, basta con hacer scroll al tope).
- Filtrar `e.source !== iframeRef.current?.contentWindow`.
- `origin: "*"` porque el documento vive en otro dominio; si se cierra, se cambia en las dos puntas.

---

## 5. Estados

| Estado | Cuándo | Qué se ve |
|---|---|---|
| `cargando` | fetch del JSON en vuelo | esqueleto del encabezado + 3 fases |
| `error` | el JSON no responde | tarjeta con `new:plan.reintentar` + `new:plan.contactar-equipo` |
| `sin-plan` | no hay plan para ese slug / sin `plan_url` | "Tu plan todavía no está publicado" (+ para admin: configurar URL) |
| `listo` | plan resuelto | la vista completa |
| sin match | el filtro no deja nada | bloque con "Ver todas las fases" |

En el diseño se cambian con el prop `estado`; en React salen del fetch.

---

## 6. Permisos

El nav del cliente ya gatea `plan` por rol en `member_access.js` /
`allowedNavForMember`: lo ven `owner`, `project_manager`, `trafficker`, `copywriter`,
`content`. **No se cambia la lógica de permisos.**

- Marcar / crear tarea: los mismos roles que ya pueden operar tareas del workspace.
- Barra de URL del plan: solo `isAdmin` (como hoy).

---

## 7. Reglas visuales que hay que respetar (de `CLAUDE.md`)

- **Tokens, no hex.** Todo sale de `index.css` / `DS`. Los únicos literales del diseño son
  los tintes que `withAlpha()` no puede resolver sobre `var()` (`rgba(52,192,138,0.13)`, etc.)
  y el `#FFFFFF` del texto sobre color lleno.
- **Rojo `--brand` es acción y alerta; azul `--sel` es selección.** Ni una fase ni un
  accionable seleccionado se pintan de rojo. El único rojo de la pantalla es el estado de error.
- Superficies elevadas: `.glass` / `box-shadow: var(--shadow)`. No repetir sombras.
- **Cero emoji** (el `PlanView` actual tiene 📋 🔗 ✏️ — se reemplazan por SVG de trazo
  `stroke-width` 1.7–1.9, `viewBox="0 0 24 24"`).
- Sin `uppercase`. JetBrains Mono **solo** en números que se comparan (%, `nn`, ratios).
- Layout con flex/grid + `gap`; listas con `display: grid` y columnas fijas.
- Revisar en **oscuro y claro**. Nota del light mode: `--hover` es un azul fuerte, así que
  el fondo del accionable expandido y las rayas del embed usan `rgba(30,82,170,0.035–0.05)`.

---

## 8. Mapa de `data-action`

| `data-action` | Dónde | Qué hay que cablear |
|---|---|---|
| `plan.abrir-documento` | topbar + riel | abre `plan_url` en pestaña nueva (ya existe la URL) |
| `plan.ver-contexto` | cada accionable (fila y expandido) | `inforce-goto` a la sección derivada del responsable |
| `plan.configurar-url` | barra de admin | **ya existe**: `companies.objectives.plan_url` |
| `new:plan.marcar-paso` | checkbox | upsert `(cliente, paso_id, completado, completado_en)` |
| `new:plan.expandir-paso` | título + chevron | solo UI |
| `new:plan.crear-tarea` | expandido | crea la tarea en el espacio de la empresa + guarda `tarea_id`, `agendado_para`, `asignado_a` |
| `new:plan.agendar-paso` | pastilla del paso con tarea | abre esa tarea |
| `new:plan.filtrar` | pills | solo UI |
| `new:plan.filtrar-responsable` | riel | solo UI |
| `new:plan.colapsar-fase` / `new:plan.colapsar-todo` | fase / barra | solo UI |
| `new:plan.ir-a-fase` | tramos de la barra | scroll a la fase |
| `new:plan.ir-a-seccion` | tarjetas del riel | `inforce-goto` |
| `new:plan.reintentar` | error | refetch del JSON |
| `new:plan.contactar-equipo` | error + sin plan | WhatsApp / mensaje al equipo |
| ~~`plan.imprimir`~~ | — | **quitado con confirmación de José**: la función de imprimir el plan se elimina, no se mueve |

Los `data-action` del sidebar y el topbar (`nav.*`, `shell-cliente.*`,
`new:buscador-cliente`, `new:alertas-cliente`) son del **shell**: no se portan acá.

---

## 9. Orden de PRs sugerido

1. **Fetch + modelo.** Cliente del JSON con caché y errores + tabla `plan_pasos` con RLS. Sin UI.
2. **La vista.** Avance, fases, accionables, expandido, filtros, estados. Con el iframe todavía a lo ancho.
3. **El riel + el puente.** Dos columnas, tarjetas de sección, `inforce-goto`, `inforce-height`, `inforce-nav`.
4. **Crear tarea.** Conexión con el módulo de tareas del workspace.

Checklist de cierre: cada ítem del inventario de la sección 1 sigue accesible; los 5
estados; doble tema; 924px / 1280px / 1512px; y un `paso_id` huérfano en la tabla no rompe nada.
