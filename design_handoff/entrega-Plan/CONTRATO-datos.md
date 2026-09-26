# Contrato de datos — para el Claude que arma los planes

Este archivo es para el chat que genera los **documentos HTML de los planes** y el JSON
(la skill de planes), no para el que programa el portal. Explica qué espera el portal.

---

## Las dos piezas y quién manda en qué

```
       skill de planes                          portal (Inforce Central)
  ┌──────────────────────────┐            ┌──────────────────────────────┐
  │ 3 llamadas → documento   │  JSON      │ vista de Plan                │
  │ HTML por cliente         │ ─────────► │ fases · accionables · %      │
  │ + planes-accionables.json│            │ marca lo hecho (única verdad)│
  └──────────┬───────────────┘            └───────────┬──────────────────┘
             │ iframe + postMessage                   │
             └───────────────────────────────────────►┘
                (el documento es el CONTEXTO: llamadas y estrategia)
```

- El **documento** manda en: las tres llamadas, la estrategia de venta (ángulos,
  objeciones, conciencia), el recorrido. Es de lectura.
- El **portal** manda en: qué está hecho, el porcentaje, fechas y responsables.
- Por eso al documento se le quitaron los checkboxes y la barra de progreso.
  **Nunca dos progresos.** Si vuelven a aparecer en el HTML, el portal queda mintiendo.

---

## Lo que el portal consume

Un solo archivo: `https://plan.josehuila.com/planes-accionables.json`, generado por
`extraer-accionables.js` a partir de los HTML. Hoy: 9 clientes, 188 accionables.

```jsonc
{
  "generado": "2026-07-26",
  "planes": [{
    "cliente": "artilleria-fox",                        // slug = id estable del plan
    "marca": "Artillería Fox",
    "documento": "https://plan.josehuila.com/artilleria-fox/",
    "total_fases": 6,
    "total_pasos": 16,
    "fases": [{
      "orden": 1,
      "id": "n1",                                       // estable
      "titulo": "Deja de perder los mensajes que ya estás pagando",
      "tiempo": "~1-2 semanas",                         // libre: "Continuo", "~1 mes"…
      "descripcion": "Tu fuga más grande hoy está en la atención, no en la pauta.",
      "a_futuro": false,
      "color": "#34C759",
      "pasos": [{
        "orden": 1,
        "id": "t1",                                     // estable
        "accionable": "Automatiza la atención de WhatsApp con ChateaPro o Dropi",
        "descripcion": "Hoy respondes manual y muchos mensajes…",
        "responsable": "Deison"                         // "José" | "Nath" | "Deison"
      }]
    }]
  }]
}
```

### Las 6 reglas que no se pueden romper

1. **Los ids son para siempre.** `fase.id` y `paso.id` son la llave con la que el portal
   guarda lo marcado. Si un id cambia, el cliente pierde su progreso en ese paso.
   Se pueden **agregar** pasos (`t17`, `t18`) y reordenar con `orden`; **no** renumerar.
2. **Borrar un paso no borra el progreso**: el portal ignora en silencio los ids que ya no
   existen. O sea, se puede corregir el plan sin miedo.
3. **La redacción se corrige libremente.** `accionable` y `descripcion` viven solo en el
   JSON; el portal no los copia a su base. Se arregla acá y aparece corregido en todos lados.
4. **`responsable` solo puede ser `José`, `Nath` o `Deison`** (con tilde en José). De ese
   valor el portal deriva a qué llamada salta el enlace *"ver el contexto"*:
   José → `llamada-1`, Nath → `llamada-2`, Deison → `llamada-3`. Un valor distinto rompe
   ese enlace.
5. **`a_futuro: true`** = fase opcional, siempre al final. El portal la pinta distinta y
   **no la cuenta** en el porcentaje. Es lo que evita que un plan arranque en 0% eterno.
6. **La `descripcion` del paso es el "por qué"** y se muestra completa al expandir: 2 a 4
   líneas con detalle técnico real (números, herramientas, configuraciones). No resumir.
   La de la **fase** es una sola línea: es el subtítulo del bloque.

### Secciones que el documento debe exponer

`bienvenida`, `recorrido`, `llamada-1`, `llamada-2`, `llamada-3`, `estrategia`,
`accionPlan` (Nubora y Yavora traen además `implementacion`). Los ids tienen que
existir en todos los documentos: el portal salta a ellos con `inforce-goto`.

### El puente `postMessage` (ya implementado en los HTML)

| Documento → portal | Cuándo |
|---|---|
| `inforce-ready` `{sections, height}` | al cargar |
| `inforce-height` `{height}` | al cargar, al abrir un nodo, al redimensionar |
| `inforce-scrolled` `{section, top}` | después de un `inforce-goto` |
| `inforce-nav` `{to:'plan'}` | clic en el botón del plan |

| Portal → documento | Para qué |
|---|---|
| `inforce-theme` `{theme}` | sincronizar claro/oscuro |
| `inforce-goto` `{section}` | saltar a una sección sin recargar |
| `inforce-height` | pedir que reporte el alto |

Si esto cambia, hay que avisarlo: el riel derecho del portal depende de `inforce-goto` y
del alto reportado.

---

## Lo único que falta del lado del generador

Las **etiquetas cortas** de las fases. En la barra de avance del portal cada fase es un
tramo con una etiqueta de una palabra (`Atención`, `Sistema`, `Despliegue`, `Instagram`,
`Tráfico`, `Adelante`). Hoy no existen en el JSON — están puestas a mano en el diseño.

Dos salidas, la primera es la buena:

1. Agregar `"corto": "Atención"` a cada fase en `extraer-accionables.js` (1–2 palabras).
2. Que el portal recorte el `titulo` — queda peor, porque los títulos son frases largas.

Regla del proyecto: **si falta un dato, se agrega al generador; no se parchea en el portal
ni se inventa en la base.**

---

## Checklist antes de publicar un plan

- [ ] Ids de fases y pasos iguales a los de la versión anterior (los que siguen existiendo).
- [ ] `responsable` exactamente `José` / `Nath` / `Deison`.
- [ ] La fase opcional va última y con `a_futuro: true`.
- [ ] Cada paso tiene `descripcion` con el porqué, no solo el título.
- [ ] El HTML no tiene checkboxes ni barra de progreso.
- [ ] Las secciones `llamada-1/2/3` y `estrategia` existen con esos ids.
- [ ] `total_fases` y `total_pasos` coinciden con el contenido.
