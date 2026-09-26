# Brief — Vista de Plan de Implementación (Portal Inforce)

Este documento es el contexto completo del proyecto. Sirve tanto para la fase de diseño como para la de desarrollo.

---

## 1. Qué es Inforce y qué problema resuelve esta vista

Inforce Consulting acompaña marcas de e-commerce y dropshipping en LATAM. Cada cliente que entra pasa por **tres llamadas de consultoría**:

| Llamada | Consultor | Tema | Color |
|---|---|---|---|
| 1 | **José** | Estrategia | `#5E87F5` (azul) |
| 2 | **Nath** | Creativo y copy | `#AF52DE` (morado) |
| 3 | **Deison** | Tráfico y pauta | `#34C759` (verde) |

De esas tres llamadas sale un **plan de implementación**: entre 16 y 32 accionables agrupados en 4 a 10 fases, personalizados para ese cliente. Hoy hay **9 clientes con plan armado y 188 accionables en total**.

El problema: el cliente no tiene dónde ejecutar ese plan. Sabe qué tiene que hacer pero no tiene un lugar donde marcarlo, agendarlo ni ver cuánto lleva.

---

## 2. El reparto: dos piezas, cada una con una sola responsabilidad

Esto es la decisión de arquitectura más importante del proyecto y hay que respetarla.

| | **El portal** (lo que vamos a construir) | **El documento HTML** (ya existe) |
|---|---|---|
| Fases y accionables con checkbox | ✅ fuente de verdad | ❌ solo mapa de lectura |
| Progreso, responsable, fechas | ✅ | ❌ |
| Las tres llamadas y su contexto | ❌ | ✅ fuente de verdad |
| Estrategia de venta (ángulos, objeciones, conciencia) | ❌ | ✅ |

**El documento HTML ya está construido y desplegado.** Vive en `https://plan.josehuila.com/<cliente>/`, es autocontenido, tiene modo claro y oscuro, y ya se le quitaron los checkboxes y la barra de progreso justamente para que la ejecución viva en el portal.

**Nunca debe haber dos progresos.** Si el cliente marca en el portal, esa es la única verdad.

---

## 3. La data: de dónde salen los accionables

Los planes se publican como un solo archivo JSON junto a los documentos:

```
https://plan.josehuila.com/planes-accionables.json
```

Estructura real:

```jsonc
{
  "generado": "2026-07-26",
  "planes": [
    {
      "cliente": "artilleria-fox",                              // slug, id estable
      "marca": "Artillería Fox",
      "documento": "https://plan.josehuila.com/artilleria-fox/", // el HTML embebible
      "total_fases": 6,
      "total_pasos": 16,
      "fases": [
        {
          "orden": 1,
          "id": "n1",                                            // id estable dentro del plan
          "titulo": "Deja de perder los mensajes que ya estás pagando",
          "tiempo": "~1-2 semanas",                              // texto libre: "Continuo", "~1 mes"…
          "descripcion": "Tu fuga más grande hoy está en la atención, no en la pauta.",
          "a_futuro": false,                                     // true = fase opcional, más adelante
          "color": "#34C759",
          "pasos": [
            {
              "orden": 1,
              "id": "t1",                                        // id estable dentro del plan
              "accionable": "Automatiza la atención de WhatsApp con ChateaPro o Dropi",
              "descripcion": "Hoy respondes manual y muchos mensajes quedan sin contestar…",
              "responsable": "Deison"                            // "José" | "Nath" | "Deison"
            }
          ]
        }
      ]
    }
  ]
}
```

### Reglas de datos, importantes

1. **El JSON es de solo lectura para el portal.** Lo regenera Inforce desde los HTML con un script. El portal nunca lo escribe.
2. **El portal guarda solo estado**, en una tabla mínima:
   `cliente` (slug) · `paso_id` · `completado` (bool) · `completado_en` · `agendado_para` · `asignado_a`
   La clave es `(cliente, paso_id)`. Nada de textos duplicados en la base.
3. **Por qué así:** cuando Inforce corrige la redacción de un accionable, se actualiza en todos lados sin migraciones ni retipeo. Y si un plan crece de 16 a 18 pasos, los ya marcados no se pierden porque los ids son estables.
4. **Manejar el caso de paso huérfano:** si en la base hay un `paso_id` que ya no existe en el JSON, se ignora en silencio. No romper la vista.
5. **`a_futuro: true`** son fases opcionales que van al final, visualmente distintas (atenuadas o con una etiqueta "Más adelante") y **no cuentan** para el porcentaje de avance.

---

## 4. Qué hay que diseñar y construir

### 4.1 La vista de plan

Una página por cliente. De arriba a abajo:

- **Encabezado** con el objetivo del acompañamiento, el porcentaje completado y una barra de progreso. El porcentaje se calcula sobre los pasos de fases **no** `a_futuro`.
- **Las fases en orden**, cada una como un bloque con su número, título, tiempo estimado, descripción corta y un estado derivado: *Completada* (todos sus pasos marcados), *En curso* (alguno marcado), *Pendiente* (ninguno).
- **Los accionables dentro de cada fase**: checkbox, título, y el responsable a la derecha. Al marcarlo, el título va tachado y atenuado.
- **Al expandir un accionable** se muestra su `descripcion` completa (es el porqué, y suele tener 2 a 4 líneas con detalle técnico real), más la fecha agendada y a quién está asignado.
- **En cada accionable, un enlace "ver el contexto"** que abre el documento HTML en la llamada donde se habló de eso.

### 4.2 El mapeo accionable → sección del documento

No hace falta un campo nuevo: se deriva del `responsable`.

| responsable | sección del documento |
|---|---|
| José | `llamada-1` |
| Nath | `llamada-2` |
| Deison | `llamada-3` |

Secciones disponibles en todos los documentos: `bienvenida`, `recorrido`, `llamada-1`, `llamada-2`, `llamada-3`, `estrategia`, `accionPlan`. (Nubora y Yavora tienen además `implementacion`.)

### 4.3 El documento embebido

El HTML se muestra dentro del portal en un iframe y **ya trae un puente de `postMessage` implementado**. El portal solo tiene que hablarle.

**El documento le manda al portal:**

| Mensaje | Cuándo | Payload |
|---|---|---|
| `inforce-ready` | al cargar | `{ sections: [{id, title}], height }` |
| `inforce-height` | al cargar, al abrir un nodo, al redimensionar | `{ height }` |
| `inforce-scrolled` | después de un `inforce-goto` | `{ section, top }` |
| `inforce-nav` | clic en el botón del plan | `{ to: 'plan' }` |

**El portal le manda al documento:**

| Mensaje | Para qué | Payload |
|---|---|---|
| `inforce-theme` | sincronizar claro/oscuro | `{ theme: 'dark' \| 'light' }` |
| `inforce-goto` | saltar a una sección sin recargar | `{ section: 'llamada-2' }` |
| `inforce-height` | pedir que reporte el alto | — |

Detalles:

- El tema también se puede pasar en la carga inicial por querystring: `?theme=dark`.
- El iframe va con `scrolling="no"` y su altura la controla el portal con lo que reporta `inforce-height`. Así no queda scroll dentro de scroll.
- Filtrar por `e.source === iframeRef.current?.contentWindow` para no leer mensajes de otros iframes.
- El documento detecta solo si está embebido. Cuando lo está, su botón interno deja de ser un link externo y emite `inforce-nav`; el portal debe escucharlo y navegar a su propia vista de plan.

Hay un componente `PlanEmbed` de referencia en `integracion-portal.md`, en la misma carpeta que este brief.

---

## 5. Reglas de UI

El repositorio tiene un `CLAUDE.md` en la raíz que es la fuente de verdad visual. **Léelo antes de escribir una línea de estilo.** Los puntos que más pegan en esta vista:

- **Tokens, no hex.** Todo color sale de las variables CSS de `index.css` y de `DS` en `src/lib/design.js`. Nada hardcodeado.
- **Rojo `--brand` es acción y alerta. Azul `--sel` es selección y estado activo.** Un accionable seleccionado o una fase activa **nunca** se pintan de rojo.
- **Superficies elevadas usan la clase `.glass`.** No repetir sombras a mano.
- **Cero emoji en la UI.** Iconos SVG de trazo, `stroke-width` 1.7–1.9, `viewBox="0 0 24 24"`.
- **Nada de `text-transform: uppercase`** salvo el chip de prioridad.
- **JetBrains Mono solo para números que se comparan** (porcentajes, contadores). Nunca en etiquetas de texto.
- **Layout con flex/grid y `gap`.** Nunca margin por elemento.
- **Listas y tablas con `display: grid` y columnas fijas**, header incluido, para que las columnas alineen entre filas.
- **Revisar en tema oscuro y claro** antes de dar nada por terminado.

---

## 6. Qué no hacer

- No duplicar los textos de los accionables en la base de datos.
- No poner una segunda barra de progreso dentro del documento embebido.
- No inventar campos en el JSON: si falta algo, se avisa y se agrega al generador, no se parchea en el portal.
- No romper la vista si un `paso_id` guardado ya no existe en el JSON.
- No usar rojo para indicar selección.
- No meter la Estrategia de venta en el portal: eso vive en el documento.

---

## 7. Orden sugerido de trabajo

1. **Diseño de la vista de plan** — encabezado con progreso, fases, accionables, estado expandido de un accionable, y los tres estados de fase. En oscuro y en claro.
2. **Diseño del documento embebido** — cómo convive el iframe con el resto de la página y dónde va el enlace "ver el contexto".
3. **Modelo de datos y fetch del JSON**, con caché y manejo de error si el archivo no responde.
4. **La vista funcionando**, con el estado persistido.
5. **El embed y el puente de `postMessage`.**

---

## 8. Estado actual

- ✅ Los 14 documentos HTML están construidos, con modo oscuro y el puente de `postMessage` implementado.
- ✅ El JSON de planes está generado: 9 clientes, 188 accionables.
- ✅ Existe el script `extraer-accionables.js` que regenera el JSON desde los HTML.
- ⏳ Falta la vista de plan en el portal — eso es este trabajo.
- ⏳ Falta definir la URL del portal (hoy el botón del documento apunta a un placeholder).

---

*Inforce Consulting*
