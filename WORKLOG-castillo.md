# WORKLOG — Castillo (sesión nocturna autónoma)

Jose: acá te dejo TODO lo que avancé mientras dormías, con qué está **en producción** (ya lo probé/verifiqué) y qué dejé en **preview** para que lo pruebes vos antes de montarlo. Cada cambio pasó `build + tests + lint` en verde.

Producción: **portal.josehuila.com** · Preview estable: **inforce-design-jose.vercel.app**

---

## ✅ YA EN PRODUCCIÓN (verificado, podés usarlo)

1. **Seguridad (Fase 0)** — RLS cerrada, 7 endpoints protegidos, login parametrizado.
2. **Batch 1 (cimientos)** — fuente única de Supabase, Prettier+ESLint+Vitest (tests), CI en GitHub Actions, bundle más liviano (988→793KB), y **4 bugs reales** arreglados.
3. **Batch 2 (orden + etiquetas)** — App.jsx 9429→8876 líneas (lógica de reportes a módulos ordenados), fix del **VSL en TOFU** (los creativos propios ya no se mueven al embudo del banco), y dedup de etiquetas ("Ryze"/"ryze" = una sola).
4. **Fix del BRINCO admin→cliente** — ya no flashea el "Panel general / No hay empresas aún". Ahora spinner → workspace directo.
5. **Loader elegante (BrandLoader)** — bolt de Inforce con glow, anillos girando y mensajes rotativos. En toda carga full-page.

### 🧪 Qué probar de lo que está en prod
- Entrá a una empresa → confirmá que ves el loader lindo (no el panel vacío) y saltás directo.
- En el banco: etiquetá algo con mayúscula y luego minúscula → debe quedar **un solo chip**.

---

## 🟢 CONSOLIDADO EN PRODUCCIÓN (2026-07-28) — Jose probó login admin+cliente, OK
Los refactors (split App.jsx 9429→8327 + logger) **y los 6 fixes de estabilidad** ya están promovidos a `portal.josehuila.com`. La base quedó **unificada** (prod = main = último código), sólida y sin esos bugs. Verificado por chunk + marcador.

## 🟡 PENDIENTE DE TU ACCIÓN (cuando quieras, no urge)

### 📐 Fundaciones de datos para el roadmap (FB + métricas) — DIFERIDO por Jose
_(Jose: lo dejamos para cuando el roadmap esté concreto. El SQL está listo si algún día lo querés.)_
### 📐 Fundaciones de datos para el roadmap (FB + métricas) — REVISAR Y CORRER SQL
Diseñé (NO corrí) el esquema para que el dev externo pueda: **publicar en Facebook** y **medir qué ángulo/concepto vende mejor**. Archivos:
- `db/roadmap_foundations.sql` — migración aditiva, idempotente, con RLS tenant-scoped (mismo patrón de seguridad que ya usamos). Crea: `meta_ad_accounts`, `creative_angles`, `ad_publish_jobs`, `ad_metrics` (tabla de hechos diaria) + columnas `fb_*`/`publish_status`/`angle_id` en `despliegue_variations`.
- `db/ROADMAP_DATA_MODEL.md` — explicación + 3 queries de ejemplo ("top 5 ángulos por ROAS", etc.).

**Antes de correrlo, verificá los supuestos** (están en el .md). Yo ya confirmé 2 revisando el esquema: `despliegue_variations.id` es **UUID** (FK correcto) y `company_id` es **TEXT** en toda la base (convención). Falta que confirmes vos que **`rls_hardening_v1.sql` ya está aplicado** (las policies dependen de `is_team_admin()`/`accessible_company_ids()`). Es 100% aditivo — no toca datos existentes. **Corrélo vos en Supabase cuando lo revises.**

---

**👉 PREVIEW CON LOS REFACTORS (split + logger):** https://inforce-bc84vm8uu-manuelhuila123-4095s-projects.vercel.app
_(prod NO cambió con esto — sigue estable en el build con loader/brinco arreglado)_

### 🧩 Más orden de `App.jsx` (split cont.) — PROBAR LOGIN antes de montar
Seguí ordenando el archivo gigante: **`App.jsx` 9429 → 8327 líneas** en total. Extraje a módulos propios (código idéntico, solo reubicado):
- `src/lib/authAccess.js` — resolvers de acceso (quién ve qué empresa)
- `src/lib/db.js` — capa de base de datos (sbFetch + dbGet/Save/Delete)
- `src/features/auth/PinScreen.jsx` — la pantalla de login

Pasó build+tests+lint. **PERO toca el flujo de login/auth**, así que por prudencia lo dejé en **preview** (link abajo cuando lo suba): **probá entrar como admin y como cliente, y navegar a una empresa**. Si el login funciona bien, lo promovemos. (Es relocación mecánica, riesgo bajo, pero login es login.)

### 🪵 Logger central (hygiene) — en el mismo preview
Reemplacé los `console.*` sueltos del cliente por un `logger` central (silencia ruido en prod, mantiene errores). Sin cambio visible. Va junto al split en preview.

### 🐛 AUDITORÍA DE BUGS — 6 bugs reales encontrados y ARREGLADOS (en el preview)
Corrí una auditoría de bugs de verdad sobre el código existente. Encontró y arreglé:
1. **CRASH potencial** — un hook (`useCompanyMask`) se llamaba después de returns condicionales en el componente raíz → podía tirar "Rendered more hooks" en transiciones de login. Subido al tope.
2. **Contaminación entre reportes** — al cambiar de reporte, el de transcript/análisis de llamada se "pegaba" del reporte anterior (faltaba `key`). Arreglado.
3. **CRASH potencial en Mi Agenda** — al abrir un item de contenido se llamaban menos hooks → posible pantalla blanca. Arreglado.
4. **"∞" / "NaN%" / "$∞"** en el embudo y el simulador cuando el tracking de pixel viene incompleto (división por 0). Ahora muestra 0 en vez de infinito.
5. **Data-loss silencioso** — 8 guardados/borrados se tragaban el error con `.catch(() => {})`: si fallaba (sin conexión/permiso), veías "guardado" pero se perdía. Ahora **te avisa con un toast** ("No se pudo guardar…").

Todo con build+79 tests+lint en verde. **Nota:** el fix #1 toca el render del login, por eso todo esto va en el mismo preview que necesita tu prueba de login.

## ✅ CHECKLIST DE TU MAÑANA (orden sugerido)
1. **Prod (ya live):** entrá a una empresa → confirmá loader lindo + sin brinco. Probá etiquetas duplicadas (mayús/minús → un chip).
2. **Preview refactors** (link arriba): probá **login admin + login cliente + navegar a una empresa**. Si todo entra bien → decime "montá los refactors" y los promuevo a prod.
3. **SQL de fundaciones** (`db/roadmap_foundations.sql`): revisá el `.md`, confirmá que `rls_hardening_v1.sql` está aplicado, y **corrélo vos** en Supabase cuando quieras (es aditivo, no urge).

## ⏭️ LO QUE DEJÉ PARA DESPUÉS (no lo hice para no arriesgar la prod dormido)
- **Deduplicar árboles paralelos** (`team/guiones` vs `workspace/guiones` = 12 files iguales; `team/tasks` vs `workspace/tasks` = 15). Es el refactor de mayor impacto "orden" que queda, pero es **riesgoso** (toca features vivas de equipo y cliente) → mejor hacerlo con vos despierto para probar ambos lados. Cada bug hoy se arregla 2 veces por esta duplicación.
- **Seguir el split de App.jsx**: faltan los componentes UI de Reportes (ReportView 1204 líneas, NewReportForm, CampaignsAdsViewer…) → `features/reportes/`. Más orden, pero grande.
- **Primitivas UI compartidas** (Modal/Button/Card sobre design.js) — migración incremental.

## 📋 Notas
- Todo commiteado en `main`, commit por commit (fácil de revertir si algo no te gusta).
- Nada cambia cómo se ve la plataforma para tus clientes, salvo el loader (mejora) y los fixes.
- Regla de deploy que respeté: prod solo desde `main`; lo de auth/refactor quedó en preview para tu prueba.
