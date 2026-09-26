# Inforce — instalación PostgreSQL y biblioteca de anuncios

Repositorio actual: [juandassk8/josehuila](https://github.com/juandassk8/josehuila).
Aplicación existente de Inforce, con inteligencia competitiva dentro de Creativos.

**React 19 + Vite 8 · API Node · PostgreSQL/PostgREST · Redis/BullMQ ·
Playwright/Chrome · almacenamiento S3-compatible/Cloudflare R2.**

La instalación actual usa autenticación propia y no requiere Supabase ni Vercel.
Empezar por [estado actual](docs/estado-actual.md), [API y VPS](deploy/vps/README.md)
y [biblioteca de anuncios](deploy/ad-library/README.md).

## Inicio local

Usar Node.js 22.12 o superior dentro de la rama 22, y npm.

```sh
git clone https://github.com/juandassk8/josehuila.git
cd josehuila
npm ci
npm run dev
```

Vite inicia el frontend y el adaptador de `/api`; **no inicia el backend de
autenticación, PostgreSQL, PostgREST ni las colas**. El acceso a datos requiere
un entorno de desarrollo configurado. No hay fallback al Supabase anterior.
`devApi.js` lee `.env.prod` si existe; usar solo configuración de desarrollo.
Nunca copiar credenciales de producción al repositorio.

## Pruebas locales

```sh
npm test
node --test deploy/vps/server.test.mjs deploy/vps/security.test.mjs
npm run lint
npm run build
```

Las pruebas de integración, migraciones y despliegues se ejecutan por separado.
Los scripts pueden escribir datos: consultar primero su documentación.

## Claude Code y Codex

Las instrucciones comunes están en [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md)
las importa para Claude Code. Seguir la [guía de colaboración](docs/colaboracion-agentes.md)
para trabajar en carpetas y ramas independientes.

Esta publicación inicial contiene el código actual. El historial anterior se
conserva localmente y no se publica porque incluía contraseñas en versiones viejas.
No se incluyen secretos, dependencias instaladas, builds, bases ni archivos de R2.

---

## Documentación histórica de la instalación anterior

> El contenido restante describe Supabase/Vercel y la instalación anterior. Se
> conserva como referencia histórica, no como instrucciones del VPS actual.
> Para configuración y despliegue vigentes, usar los enlaces del inicio.

### Portal Inforce anterior

Sistema operativo de una consultoría de paid media, con un portal por cliente.
En producción en **https://portal.josehuila.com**.

**React 19 + Vite 8 · Supabase (Postgres + Auth + Storage) · Vercel · JavaScript
sin TypeScript.**

---

## ⚠️ Leé esto antes de correr nada

**Sin configuración, la app se conecta a la base de datos de PRODUCCIÓN.**

La URL de Supabase y la clave anónima están hardcodeadas como fallback en
`src/lib/supabase.js:16`. Si clonás y hacés `npm run dev` sin ningún `.env`,
arranca igual — y le está pegando a los datos reales de 32 empresas.

No es un descuido: la clave anónima es pública por diseño y RLS es lo que
protege los datos. Pero significa que **no hay una base de desarrollo separada**.
Si te logueás con una cuenta real y borrás algo, lo borraste de verdad.

Mientras no exista un proyecto de staging (ver `ESTADO.md` §9):
- Para mirar la UI, no hace falta loguearse. Andá tranquilo.
- Para probar escrituras, pedile a José una empresa de prueba.
- Nunca corras un script contra la base sin leer `DEPLOY.md`.

---

## Instalación

Necesitás **Node 20 o superior** (el CI fija la 20; funciona en 22 y 24).

```bash
git clone https://github.com/josehuilaa/inforce-app.git
cd inforce-app
npm ci
```

Usá `npm ci` y no `npm install`: respeta el `package-lock.json` y te da el mismo
árbol de dependencias que el CI.

```bash
npm run dev
```

Abre en `http://localhost:5173`.

### Qué levanta `npm run dev`

Las dos mitades, en un solo comando:

- **El frontend**, por Vite.
- **Las funciones de `/api`**, por un plugin propio (`devApi.js`).

Eso segundo es una particularidad de este repo. En producción cada archivo de
`api/` es una función serverless de Vercel; en local las sirve `devApi.js`, que
importa el handler y le arma un `req`/`res` con la forma que espera Vercel.

**No hace falta `vercel dev`.** Y como el plugin reimporta el handler en cada
request, podés editar un endpoint y ver el cambio sin reiniciar.

### Otros comandos

```bash
npm test            # 464 pruebas (vitest, entorno node)
npm run test:watch
npm run lint        # eslint
npm run build       # build de producción a dist/
npm run preview     # sirve dist/ para verificar el build
npm run format      # prettier
```

El CI (`.github/workflows/ci.yml`) corre lint + build + test en cada push.

---

## Variables de entorno

Son **dos archivos con propósitos distintos**, y confundirlos es el error clásico.

### `.env.local` — el frontend

Lo lee Vite. Todo lo que tenga prefijo `VITE_` **termina en el bundle del
navegador**, así que acá nunca va un secreto.

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx
```

**Opcional.** Sin este archivo la app usa el fallback hardcodeado y apunta a
producción (ver el aviso de arriba).

### `.env.prod` — las funciones de `/api`

Lo lee `devApi.js` y viven **solo en el proceso de Node**. Nunca llegan al
navegador. Acá sí van los secretos.

Se genera con el pull de Vercel:

```bash
npx vercel link      # una vez, para vincular el proyecto
npx vercel env pull .env.prod
```

### Qué necesita cada cosa

Ninguna de estas variables impide que la app arranque. Lo que hacen es **apagar
funciones**: si falta una, la parte que la usa devuelve error y el resto anda.

| Variable | Sin ella no funciona |
|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Todo endpoint que escriba en la base: guiones, feedback, alta de usuarios. **Es la más importante.** |
| `ANTHROPIC_API_KEY` | Guionista, generador de guiones del slot, clasificador de anuncios, extractor de conocimiento, organizador de etiquetas |
| `OPENAI_API_KEY` | Transcripción de audio y video (Whisper) |
| `APIFY_TOKEN` + `APIFY_ACTOR` | Importación de anuncios de la biblioteca de Meta |
| `FOREPLAY_API_KEY` | Sincronización con Foreplay |
| `SCRAPERAPI_KEY` / `SCRAPINGBEE_API_KEY` | Descarga de creativos para respaldo y transcripción |
| `GOOGLE_DRIVE_*` (5 vars) | Subida y respaldo de creativos a Drive |
| `RESEND_API_KEY` + `ADMIN_EMAIL` | Aviso por mail cuando alguien pide reset de contraseña |

`devApi.js` te avisa al arrancar cuántas variables cargó y si falta
`ANTHROPIC_API_KEY`, que es la que más se usa.

**Para trabajar en UI no necesitás ninguna.** Solo cuando toques features de IA.

---

## Mapa de carpetas

```
src/
├── App.jsx                 8.601 líneas. Routing, reportes, auth y layout,
│                           todo junto. Es la deuda técnica #1 del proyecto
│                           (ESTADO.md §7). Vas a chocar con esto el día 1.
│
├── workspace/       93 arch · 19.700 líneas — EL PORTAL DEL CLIENTE
│   ├── guiones/            (32) el Guionista de la empresa
│   ├── tasks/              (36) centro de tareas: 3 vistas, espacios, timer
│   ├── permissions/        (3)  qué puede tocar cada rol
│   ├── member_access.js         qué SECCIONES ve cada rol. Archivo chico y
│   │                            fuente única — empezá por acá si tocás permisos
│   ├── CompanyWorkspace.jsx     el armazón: sidebar y navegación
│   └── CompanyTeam.jsx          el cliente carga a su gente y le da credenciales
│
├── team/           248 arch · 57.700 líneas — INFORCE CENTRAL (back-office)
│   ├── pipeline/          (32) Content Pipeline: briefs, slots, guiones con IA
│   ├── concept_bank/      (19) banco de creativos, 10.532 referencias
│   ├── inbox/             (10) bandeja de anuncios candidatos
│   ├── tasks/             (20) tablero interno
│   ├── finance/           (57) ⚠️ 57 archivos y 3 filas de datos. Muerto.
│   ├── tracking/ warroom/ northstar/ scorecard/ timetrack/
│   ├── guiones/ contenido/ empresas/ equipo/ planimpl/
│   └── layout/            (4)  sidebar y navegación del equipo
│
├── despliegue/      56 arch · 17.250 líneas — EL MÓDULO MÁS USADO
│   │                        Tableros de creativos. 30 de 32 empresas.
│   ├── scaling_simulator/ (9)  planificador inverso de escala
│   ├── cadencia.js             tope → producción 40% → reparto 60/30/10
│   ├── labels.js               las 5 categorías de etiquetas
│   └── DespliegueClienteView.jsx  la vista del cliente, solo lectura
│
├── lib/             58 arch · 5.500 líneas — COMPARTIDO
│   ├── reportes/          (9)  parser de CSV de Meta, matcheo, diagnóstico
│   ├── __tests__/         (10) acá vive buena parte de la suite
│   ├── supabase.js             cliente único. Ojo con el fallback (ver arriba)
│   ├── member_access / permisos.js
│   └── design.js               tokens de estilo (no hay Tailwind)
│
├── landing/          8 arch — landing pública, signup, login, onboarding
├── control_creativos/ 7 arch — control de producción de creativos
├── onboarding/       9 arch — tours (react-joyride) y videos
├── shared/          12 arch — componentes compartidos
├── feedback/ notifications/ features/
│
api/                 21 endpoints serverless + _lib/
├── generate-slot-script.js    el Guionista del pipeline. Dos pasadas:
│                              blueprint del referente → guion. Muy comentado.
├── generate-script.js         el Guionista libre
├── classify-ad.js             clasifica anuncios en los 5 ejes
├── apify-ad.js                importa de la biblioteca de Meta
├── transcribe.js              Whisper
└── _lib/                      lógica compartida del servidor, CON TESTS
    ├── auth.js                requireCompanyAccess / requireTeamMember
    ├── hookArchetypes.js      los 10 arquetipos de hook
    ├── scriptChecks.js        chequeos de calidad del guion
    ├── sofisticacion.js       niveles 1-5 de mercado
    └── rateLimit.js           tope de tokens por empresa

db/                  101 migraciones SQL. Se aplican A MANO (ver DEPLOY.md).
                     No hay herramienta de migración ni registro de cuáles
                     corrieron.

scripts/             utilidades sueltas (auth de Drive, correr SQL)
design/              tokens y mockups
design_handoff/      entregas de diseño anteriores
public/              estáticos
```

### Dónde NO mirar

- **`src/team/finance/`** — 57 archivos, 3 filas de datos. Nadie lo usa.
- **`src/workspace/guiones/ProductInfoPanel.jsx`** y **`CompanyGuiones.jsx`** —
  código muerto, reemplazados por el Content Pipeline. Ya hicieron perder tiempo:
  alguien construyó una función ahí, compiló, pasó los tests, y no aparecía en
  pantalla porque nadie monta ese componente.
- **`ROADMAP.md`, `TAREAS_PENDIENTES.md`** y otros marcados como desactualizados
  — son de julio y describen un producto anterior.

---

## Las dos aplicaciones

Mismo código, dos productos:

**Portal del cliente** — `/cliente/<slug>`
Resumen · Reportes · Despliegue · Content Pipeline · Plan · Tareas · Equipo ·
Papelera. Qué ve cada persona depende de su rol.

**Inforce Central** — `/?zona=equipo`
War Room · Empresas · Banco de creativos · Bandeja · Guionista · Tracking ·
Finanzas · y más.

---

## Antes de tu primer commit

1. **Leé [`DECISIONES.md`](DECISIONES.md).** Varias reglas que parecen
   complejidad innecesaria existen porque algo se rompió en producción. Está
   corto y te ahorra romper lo mismo otra vez.

2. **Si agregás una tabla, probá su RLS con una sesión de cliente real.**
   `authenticated` **no** significa "el equipo": los clientes también tienen
   login. Cómo probarlo: `ESTADO.md` §10.

3. **Si agregás UI, verificá que llegue al bundle.** Build, lint y los 464 tests
   pasan igual con un componente huérfano:
   ```bash
   npm run build && grep -rl "un texto único de tu feature" dist/assets/*.js
   ```

4. **Extraé la lógica a funciones puras.** No hay jsdom, así que los componentes
   no se testean. Toda decisión no trivial va a un archivo aparte —
   `cadencia.js`, `diagnostico.js`, `scriptChecks.js` son los ejemplos a copiar.

5. **Los comentarios se escriben en español** y explican **por qué**, no qué.

---

## Documentación

| | |
|---|---|
| **[ESTADO.md](ESTADO.md)** | Qué existe, qué se usa de verdad, qué está roto. Con números de producción. |
| **[DECISIONES.md](DECISIONES.md)** | Por qué las cosas son como son. |
| [DEPLOY.md](DEPLOY.md) | Deploy, migraciones, rollback, backups. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Mapa técnico (en inglés, parcialmente desactualizado). |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Convenciones. |
| [db/README.md](db/README.md) | Migraciones. |
