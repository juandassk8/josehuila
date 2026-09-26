# Estado real del portal

> **Este informe corresponde a la instalación anterior.** Sus mediciones no
> describen la base nueva del VPS. Consultar [docs/estado-actual.md](docs/estado-actual.md)
> para el código y la operación de esta instalación.

> **Este es el documento de la verdad.** Dice qué existe, qué se usa y qué no,
> con números medidos contra la base de producción — no contra el código.
>
> La diferencia importa: `finance_*` son 15 tablas y miles de líneas, y tiene
> **3 filas de datos**. `despliegue_variations` es una tabla y tiene **10.532**.
> Leyendo solo el código, Finanzas parece un módulo central. Está muerto.
>
> Medido el **22 de agosto de 2026**. Si vas a planear sobre esto y pasaron
> semanas, volvé a correr las consultas de la última sección.

---

## 1. Qué es

Sistema operativo de una consultoría de paid media que además le abre un portal
a cada cliente.

- **Del lado del equipo (Inforce Central):** banco de anuncios de referencia,
  guiones con IA, producción de creativos, tareas, reportes, finanzas.
- **Del lado del cliente:** cada empresa entra a su portal y ve su despliegue
  creativo, su plan de implementación, sus contenidos en producción, sus tareas.

Producción: **https://portal.josehuila.com** — Vercel, desde la rama `main`.
Repo: `github.com/josehuilaa/inforce-app` (privado).

---

## 2. Escala real

| | |
|---|---|
| Empresas cargadas | 32 |
| Usuarios con login | 44 |
| Referencias en el banco | 10.532 |
| Contenidos en producción | 259 |
| Tareas internas | 3.485 |
| Reportes de performance | 174 |
| Tablas en la base | 74 |
| Líneas de código | ~118.700 (src) + 6.552 (api) |

---

## 3. Uso real por módulo

**Esta tabla es la que hay que mirar antes de priorizar cualquier cosa.**
Un módulo con 3 empresas no justifica el mismo esfuerzo que uno con 30.

| Módulo | Empresas que lo usan | de 32 |
|---|---|---|
| Despliegue creativo (tablero creado) | 30 | 94% |
| Al menos una persona con login | 26 | 81% |
| Despliegue con creativos cargados | 24 | 75% |
| Plan de implementación | 12 | 38% |
| Content Pipeline | 11 | 34% |
| Tareas | 9 | 28% |
| Reportes | 6 | 19% |
| Guiones | 3 | 9% |

**El Despliegue es el corazón del producto.** Todo lo demás es periferia, y
varias cosas que parecen módulos son experimentos que nadie adoptó.

---

## 4. Qué funciona hoy

### Completo y en uso

**Despliegue creativo** — tablero por empresa con conceptos y variaciones,
canvas con zoom, drag & drop. Vista de cliente aparte, solo lectura.

**Banco de creativos** — 10.532 referencias etiquetadas en 5 ejes (marca, nicho,
subnicho, ángulo, formato). Vista cross-empresa. Gestor de etiquetas que detecta
duplicados de escritura y etiquetas que viven en dos categorías a la vez.

**Bandeja de referentes** — 1.204 anuncios candidatos importados vía Apify, con
clasificación por IA antes de cargarlos al banco.

**Content Pipeline** — briefs (tandas) con contenidos que avanzan por 6 etapas:
`idea → scripting → film → edit → campaign → feedback`. Guion por contenido,
referentes pegados, carpeta de Drive, métricas, papelera con deshacer.

**Guionista con IA** — genera 5 hooks + body + CTA a partir de un anuncio de
referencia. Dos pasadas: del referente saca un esqueleto estructural (cacheado),
y con ese esqueleto escribe. Ver `DECISIONES.md` §4 para las reglas.
Rate limit por empresa: 60k tokens/hora, 150k/día, 300k/semana.

**Centro de tareas** — 3 vistas (estado, fecha, persona), espacios, timer,
papelera. Se alimenta solo desde el Content Pipeline.

**Reportes de performance** — importación de CSV de Meta, matcheo de anuncios,
clasificación por severidad de CPA, y la cadena de diagnóstico (§4 de
`DECISIONES.md`).

**Plan de implementación** — pasos, subtareas y metas semanales por cliente. El
contenido vive en un JSON externo; el portal guarda el avance.

**Equipo del cliente** — el dueño carga a su gente, le asigna roles y le crea
credenciales.

**Simulador de escala** y **calculadora de cadencia** — de facturación objetivo
a creativos por semana, con reparto por embudo.

**Landing + self-signup** — trial de 14 días, wizard de 3 pasos.
⚠️ Hay precios en la landing pero **no hay cobro conectado**.

**Link público de brief** — hoja de rodaje para creadoras UGC, sin login.

### Construido pero muerto

| Módulo | Estado |
|---|---|
| Finanzas | 15 tablas, **3 filas**. Nadie lo usa. |
| North Star / Scorecard | tablas creadas, casi vacías |
| Módulo "Contenido" viejo | 205 filas, reemplazado por Content Pipeline y no borrado |
| SOPs | 21 manuales, solo visibles al equipo interno |

---

## 5. Cómo se organiza un cliente

La tabla `companies` es la raíz:

```
id (text)              timestamp como id
name, slug
objectives (jsonb)     objetivos del cliente
kpi_targets (jsonb)
email, registration_code
archived (bool)
owner_user_id (uuid)
trial_started_at / trial_ends_at
created_via            'panel' | 'self_signup'
```

**Dos caminos de creación:**
- `panel` → cliente de la agencia. No ve precios.
- `self_signup` → desde la landing. Ve su precio por asiento.

Todo lo del cliente cuelga de `company_id`: tablero de despliegue, briefs y
contenidos, tareas, guiones, perfil de voz (nicho, productos, reglas,
sofisticación), consumo de IA, equipo.

### Roles

**Equipo Inforce** (`team_members`): `admin` | `member` | `editor`.
Acceso total a cualquier empresa.

**Cliente** (`company_team_members`, roles como array — una persona puede tener
varios): `owner`, `project_manager`, `copywriter`, `content`, `editor`,
`designer`, `trafficker`.

Cada rol ve un subconjunto del menú. La matriz está en
`src/workspace/member_access.js` — es un archivo chico y es la fuente única.

---

## 6. Secciones del portal

**Portal del cliente** (`/cliente/<slug>`):
Resumen · Reportes · Despliegue · Content Pipeline · Plan de implementación ·
Tareas · Equipo · Papelera

**Inforce Central** (`/?zona=equipo`):
War Room · Tu día · Mi agenda · Empresas · Banco de creativos · Bandeja ·
Contenido · Guionista · Plan de implementación · Equipo · Personas · Mi tiempo ·
Master Tracking · North Star · Finanzas · Feedback · Papelera

---

## 7. Deudas técnicas

Ordenadas por cuánto frenan a alguien que entre nuevo:

**1. `src/App.jsx` tiene 8.601 líneas.**
Mezcla routing, reportes, auth y layout. Es el principal freno para tocar
cualquier cosa sin miedo. Cualquier dev que entre va a chocar con esto el primer
día.

**2. No hay historial de cambios.**
Salvo `company_task_activity`, no se registra quién cambió qué. Cuando se borró
el Content Pipeline de un cliente entero (§8), no había forma de saber quién fue.

**3. Sin router de verdad.**
La navegación es estado de React + `window.location.pathname` a mano.

**4. Sin TypeScript.** 118 mil líneas de JS sin tipos.

**5. Las migraciones SQL son 101 archivos sueltos.**
Sin herramienta de migración, sin orden garantizado, se aplican a mano. No hay
forma de saber cuáles corrieron sin revisar la base.

**6. Código muerto conviviendo con el vivo.**
El módulo "Contenido" viejo, `CompanyGuiones` y `ProductInfoPanel` (reemplazados
y no borrados). Ya provocó que se construyera una función en un componente que
nadie monta — compiló, pasó los tests, y no aparecía en pantalla.

**7. Los componentes no se testean.**
464 pruebas, todas sobre lógica pura extraída. No hay jsdom configurado. Un
componente puede estar huérfano y el CI pasa igual.

**8. Higiene de datos.**
Dos empresas con el mismo nombre. 14 de 32 archivadas, algunas con su historial
de reportes adentro y sin forma de que el cliente lo vea. 8 personas cargadas sin
credencial, 4 de ellas dueñas de su empresa.

---

## 8. Incidentes que hay que conocer

**18 de agosto de 2026 — se perdió el Content Pipeline completo de un cliente.**
89 contenidos, 72 con guion escrito. `deleteBriefRow` era un `delete` real y el
`on delete cascade` se llevaba todo. No había forma de recuperarlo desde el
producto: se restauró un backup de Supabase a un proyecto aparte y se
re-insertaron las filas conservando sus IDs originales.

De ahí nació la papelera (`db/pipeline_papelera.sql`). **Cualquier borrado nuevo
que se construya tiene que nacer con papelera**, no agregársela después.

**Agosto 2026 — nueve tablas quedaron legibles por clientes.**
Tenían `using (true)` para el rol `authenticated`, que dejó de significar "el
equipo" cuando los clientes pasaron a tener login. Un cliente podía leer —y
borrar— los 94 guiones internos y la base de conocimiento. Cerrado en
`db/rls_tablas_abiertas.sql`.

**Lección de las dos:** este producto creció rápido y las suposiciones de ayer
dejan de valer sin avisar. Antes de confiar en que algo está protegido, probalo
con una sesión real (§10).

---

## 9. Lo que NO existe y haría falta para escalar

| | |
|---|---|
| Cobros | Hay precios en la landing y campos de trial. **Stripe no está conectado.** |
| Cursos / formación | Nada. Ni tabla, ni progreso, ni reproductor. |
| Notificaciones | Ningún email de producto. Solo un aviso al admin en reset de contraseña. |
| Auditoría | Ver §7.2 |
| Observabilidad | Sin Sentry, sin alertas, sin monitoreo de errores |
| Staging | Se despliega directo a producción desde `main` |
| API de Meta | Los CSV se cargan a mano |
| Backups propios | Se depende de los 8 diarios de Supabase. PITR no está contratado. |

---

## 10. Cómo verificar esto vos mismo

Los números de arriba salieron de acá. Si pasó tiempo, volvé a correrlos.

**Conexión directa a Postgres** (el host `db.*` NO resuelve; usar el pooler):

```
host:     aws-1-us-west-2.pooler.supabase.com
port:     5432
user:     postgres.gfuxpggkmmeismrrjxqh
dbname:   postgres
```

La contraseña está en las variables de entorno, no en el repo.

**Uso real por módulo:**

```sql
select
  (select count(*) from companies) as empresas,
  (select count(distinct company_id) from despliegue_boards) as con_despliegue,
  (select count(distinct company_id) from pipeline_slots) as con_pipeline,
  (select count(distinct company_id) from company_tasks) as con_tareas,
  (select count(distinct company_id) from company_scripts) as con_guiones,
  (select count(distinct company_id) from company_team_members
     where auth_user_id is not null) as con_login;
```

**Probar RLS como un cliente real, sin tener su cuenta:**

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<auth_user_id>","email":"<email>","role":"authenticated"}', true);
select count(*) from la_tabla_que_quieras_probar;
rollback;
```

Esto es lo que descubrió el agujero de RLS de §8. Vale la pena correrlo cada vez
que se agregue una tabla.
