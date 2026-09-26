# Cómo trabajamos el rediseño — Claude Design ↔ Claude Code

Guía del flujo para que el rediseño quede **completo, exacto y bien conectado**, y para
que vos (José) dejes de sentir que sos un intermediario pesado.

## TL;DR

- **El repo es el canal.** Claude Design guarda `design/*.html` en el repo; Claude Code los
  lee y los porta a React. Vos no copiás-pegás HTML: solo decís "pantalla X lista".
- **Una pantalla = un archivo = un chat.** Menos contexto por chat = menos créditos y más
  orden. Los shells (sidebar/topbar) y los componentes de Tareas van primero (6 pantallas
  los reusan). Finanzas al final (14 sub-vistas).
- **Cada control lleva `data-action`.** Es su identidad. Así, muevas / quites / agregues una
  opción, Claude Code la reconoce y la conecta al handler correcto.
- **Quitar un control = quitar una función.** Claude Code te avisa antes de eliminar nada.

---

## 1. Los tres roles

- **Vos (director):** elegís cómo se ve y qué va dónde en Claude Design. Dirigís, no cableás.
  Tu única entrega hacia Claude Code: "esta pantalla ya está en `design/`".
- **Claude Design (visual):** diseña el HTML de cada pantalla. Etiqueta cada control con
  `data-action`. Guarda el archivo en el repo.
- **Claude Code / yo (implementación):** porto cada HTML a React pixel-perfect, conecto cada
  control a su handler real, y verifico contra `DESIGN_INVENTORY.md` que no se pierda nada.

## 2. Estructura en Claude Design (plan confirmado)

- **Una pantalla por página/chat.** Cada archivo mapea 1:1 con su componente del repo
  (`Equipo — War Room.dc.html` → `WarRoom.jsx`). Así porto uno sin tocar los otros.
- **Shells aparte.** El sidebar y el topbar viven en `Shell Equipo` y `Shell Cliente`. Las
  pantallas son **solo contenido**.
- **`tokens.css` compartido** = espejo de `src/index.css` + `src/lib/design.js` del repo.
  La paleta se cambia en UN lugar; Claude Code sincroniza el otro. (Fuente de verdad final:
  `index.css`/`design.js`.)
- **Orden:** Shell Equipo → Shell Cliente → Tareas (board/lista/card/modal/filtros/timer) →
  War Room → Mi Agenda → Equipo → Contenido → Espacios → Empresas → Banco → Bandeja →
  Guionista → Despliegue → (cliente: Resumen → Reportes → Plan → Pipeline → Control → Tareas →
  Equipo → Papelera) → Master Tracking → North Star → Ajustes/Feedback/Papelera → **Finanzas**.

## 3. La pieza clave: `data-action` (para que mover/quitar/agregar quede bien)

Cada elemento interactivo del diseño lleva un atributo estable:

```html
<button data-action="banco.completar-guiones">Completar guiones y notas</button>
```

- Convención: `data-action="<pantalla>.<verbo>"`. Los ids salen del `DESIGN_INVENTORY.md`.
- Controles **nuevos** (feature que no existe hoy): `data-action="new:<descripcion>"`.
- El id es la **identidad** del control, independiente de dónde esté o cómo se llame. Es lo
  que me deja re-conectarlo aunque lo muevas o lo renombres.

> Aunque Claude Design no ponga bien el `data-action`, igual mapeo por **etiqueta + el
> inventario** (yo sé qué es cada control). El `data-action` solo lo hace a prueba de balas.

## 4. Qué pasa cuando VOS cambiás algo (tu pregunta principal)

| Lo que hacés en Claude Design | Cómo lo detecto | Qué hago |
|---|---|---|
| **Mover** un control a otro lado o meterlo en un desplegable | mismo `data-action`, nueva ubicación | lo conecto al **mismo** handler → funciona igual |
| **Renombrar / restilizar** un control | mismo `data-action` | igual, sin drama |
| **Agregar** un control que ya existe en otra pantalla | `data-action` existente | lo conecto a su handler |
| **Agregar** un control **nuevo** (feature nueva) | `data-action="new:…"` o sin match | **construyo el handler**; si necesita backend/datos, te digo exactamente qué falta |
| **Quitar** un control | su `data-action` desaparece del diseño | **TE AVISO**: "estás quitando la función X". Confirmás antes de que la elimine. Nunca borro una función en silencio. |

Regla de oro: **si algo estorba visualmente, muévelo a "Opciones" — no lo borres.** Borrar UI
= perder una función. Por eso el "quitar" siempre pasa por tu confirmación.

## 5. El canal es git (para que no seas un intermediario pesado)

1. Claude Design guarda `design/<pantalla>.html` en el repo (commit o PR — tiene acceso).
2. Vos me decís **"pantalla X lista"** (o el nombre del branch del PR).
3. Yo la leo del repo, la porto a React, conecto handlers, y te dejo un **preview**.
4. Cada cambio que yo hago, lo subo al repo → Claude Design ve la última versión.

Tu carga se reduce a **dos cosas**: dirigir el diseño en Claude Design, y avisarme qué está
listo. Nada de copiar-pegar código.

## 6. Bloque para pegar en cada chat nuevo de Claude Design

> Leé `handoff/WORKFLOW.md`, `design/tokens.css`, el shell correspondiente
> (`Shell Equipo`/`Shell Cliente`) y la ficha de **<PANTALLA>** en `DESIGN_INVENTORY.md`.
> Diseñá SOLO el contenido de esa pantalla (el shell ya existe), con **todos** sus botones,
> filtros, modales y estados (vacío/carga/error/selección/permisos por rol). Etiquetá cada
> control interactivo con `data-action="<pantalla>.<verbo>"` (los nuevos con `new:`). Guardalo
> como `design/<PANTALLA>.html`. Al final, recorré la ficha del inventario ítem por ítem y
> listá qué cubriste y qué quedó pendiente.

## 7. Checklist que yo (Claude Code) corro al portar cada pantalla

1. Cada control del inventario está **presente y cableado**, o marcado como **movido** (mismo
   handler) o **quitado con tu confirmación**.
2. Estados cubiertos: vacío, carga, error, selección, permisos por rol.
3. Doble tema (oscuro/claro). Responsive.
4. Build limpio + deploy a preview.
5. Diff de `data-action`: te reporto qué se movió, qué se agregó (y si necesita handler nuevo)
   y qué se quitó — para que confirmes lo que se elimina.

---

**En una línea:** el inventario define el alcance, el `data-action` define la identidad de cada
control, y git es el canal. Con eso podés mover/quitar/agregar en Claude Design con total
libertad, que yo lo re-conecto bien y te aviso si algo pierde una función.
