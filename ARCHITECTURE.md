> **Instalación anterior.** Para la arquitectura actual con PostgreSQL, API propia
> y biblioteca de anuncios, consultar [docs/estado-actual.md](docs/estado-actual.md).
> Las referencias a Supabase y Vercel de este documento no describen el VPS actual.

> ⚠️ **PARCIALMENTE DESACTUALIZADO (28 de julio de 2026)**
>
> El mapa general sigue sirviendo, pero **las referencias `archivo:línea` ya no
> son confiables**: `App.jsx` pasó de ~6.000 a 8.601 líneas desde entonces.
> Tampoco cubre el Content Pipeline (`pipeline_briefs` / `pipeline_slots`), que
> es un módulo entero posterior.
>
> Para qué existe y qué se usa hoy: **[ESTADO.md](ESTADO.md)**.
> Para por qué las cosas son como son: **[DECISIONES.md](DECISIONES.md)**.

# Architecture — Inforce Portal

> System map for developers joining the project. Accurate as of the current
> `main`. File references use `path:line`. Codebase comments are Spanish; this
> doc uses English headings + prose. See also `CONTRIBUTING.md` (how to work
> here) and `ROADMAP.md` (what to work on).

---

## 1. Overview

Inforce Portal is a **multi-tenant marketing-ops SaaS**. An agency (Inforce)
manages client companies across performance **reportes**, creative **despliegue**
(deployment), a **content pipeline**, **guiones** (scripts), **tareas** (tasks)
and **finance**.

There are effectively **three surfaces**:

| Surface | URL | Rendered by | Audience |
|---|---|---|---|
| **Client workspace** | `/cliente/<slug>` | `src/App.jsx` (`InforceReports`) | The customer: their reports, despliegue, pipeline, scripts, tasks, team |
| **Admin / Reportes app** | `/` (root), `/admin` | `src/App.jsx` (`InforceReports`) | Jose (agency owner): all companies + the reporting engine |
| **Team "War Room"** | `/equipo` | `src/team/TeamApp.jsx` (lazy) | Inforce staff: global tasks, content, finance, scorecards, concept bank, reference inbox, time-tracking |

The admin app and the client workspace are the **same component** (`App.jsx`),
gated by `authMode` (`"admin"` vs `"client"`). The team app is a **separate
lazy-loaded tree**.

### Entry flow

```
src/main.jsx
  └─ applyCompatRedirects()          (main.jsx:46)  ── normalize legacy URLs BEFORE first render
  └─ createRoot(...).render(
        <ErrorBoundary>              (single top-level boundary)
          <ThemeProvider>            (lib/theme.jsx — applies DS + CSS class)
            <CensorProvider>         (lib/censor.jsx — privacy blur)
              <OnboardingHost>       (onboarding/ — global tours)
                <Router/>            (main.jsx:106)
              <NotificationsBell/>   (global, survives zone changes)
              <GlobalFeedback/>      (global floating feedback)
```

`applyCompatRedirects()` (`main.jsx:46-104`) rewrites old URLs *before* mount so
the first render lands in the right zone:

- `?zona=equipo` → `/equipo`
- `?cliente=slug` → `/cliente/slug` (preserving subpath)
- legacy `#/empresas`, `#/warroom` hashes → canonical paths
- bare `/<slug>` (single non-reserved segment) → `/cliente/<slug>`

`Router()` (`main.jsx:106`) reads `matchZone(pathname)` (`lib/router.jsx:26`):
the **first path segment** decides the zone.

- `equipo` → lazy `<TeamApp/>` (`main.jsx:140`)
- `cliente` / `admin` / root / `legacy` / public landing → `<InforceReports/>`
- root **with** a Supabase session → `replacePath("/equipo")` (`main.jsx:126`)

There is **no `react-router`**. Routing is a hand-rolled pathname mini-router
(`lib/router.jsx`) — `usePathRoute({prefix})` returns `{segments, navigate,
replace}` and fires a custom `pathchange` event; cross-zone navigation is a
full page reload via `goPath`/`replacePath`.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 (`react@^19.2`), no framework router |
| Build | Vite 8 (rolldown engine), `@vitejs/plugin-react` |
| Backend data | Supabase (Postgres + PostgREST + Auth + Realtime + Storage) via `@supabase/supabase-js@^2.103` |
| Serverless | Vercel functions under `api/*` (Node runtime) |
| Charts | `recharts@^3` |
| Rich text | TipTap 3 + ProseMirror |
| Drag & drop | `@dnd-kit/*`, `react-zoom-pan-pinch` |
| Docs/export | `xlsx`, `mammoth`, `pdfjs-dist`, `jspdf` (all lazy-imported) |
| Tours | `react-joyride` |
| Tests | Vitest 4 |
| Lint/format | ESLint 9 (flat config) + Prettier |
| AI | Anthropic Claude (via `api/*` proxies); OpenAI Whisper for transcription |

Styling is **inline styles driven by JS design tokens** (`lib/design.js`), not
CSS modules or a utility framework. See §8.

---

## 3. Directory map

### `src/lib/` — shared kernel

The cross-cutting foundation, imported by both `App.jsx` and `team/*`.

| File | Purpose |
|---|---|
| `supabase.js` | The **single** Supabase client (anon key, `storageKey:"inforce-team-auth"`). Env-overridable with hardcoded fallback. |
| `db.js` | PostgREST data layer for `companies`/`reports`: `sbFetch` + `dbGet*/dbSave*/dbDelete*`. |
| `authAccess.js` | Tenant resolvers: `resolveUserAccess`, `loadAccessibleCompaniesByEmail`, `resolveClientMember`, `slugifyCompany`. |
| `router.jsx` | `matchZone`, `usePathRoute`, `replacePath`, reserved-zone list. |
| `design.js` | `DS` tokens + mutable style presets + `applyTheme` + `withAlpha`. |
| `theme.jsx` | `ThemeProvider` / `useTheme`. |
| `toast.js` | Imperative non-React toast for surfacing errors. |
| `logger.js` | Central logger (silences debug/info in prod). |
| `censor.jsx` | Privacy-blur context (`useCompanyMask`). |
| `reportes/` | Pure reporting logic (csv, adMatching, reportRanges, format). |
| `reports/` | Second (partial) copy of report logic: `metrics.js` (`calcMetrics`), `periods.js`, `ranges.js`. See §5. |
| `tokenLimits.js` | Per-company AI token rate-limit math. |
| `niches.js` | Niche taxonomy. `dates.js`, `weeks.js`, `recurrence.js`, `urls.js`, `scriptParse.js`, `scriptToHtml.js`, `scriptDuration.js` — misc pure helpers. |

### `src/shared/` — deduped leaf components

12 identical presentational/utility components used by **both** team and
workspace. Each `team/*` and `workspace/*` copy is a one-line
`export * from "../../shared/…"`.

- `shared/tasks/` — `AssigneeDropdown`, `DateDropdown`, `DateTimePicker`, `PriorityDropdown`, `RecurrenceModal`, `StatusDropdown`, `statusCycle.js`
- `shared/guiones/` — `AudioUpload`, `FormatModal`, `ScriptCard`, `ScriptChat`, `ScriptDisplay`

### `src/features/auth/`

`PinScreen.jsx` — the login screen for both `admin` and `client` modes
(PIN is retired; email + password only).

### `src/despliegue/` — creative deployment (admin + client)

The largest feature. Lazy-loaded from `App.jsx:20-31`. See §6.

- `DespliegueCreativo.jsx` (admin Miro-style canvas), `DespliegueClienteView.jsx` (client read-only funnel), `ContentPipeline.jsx` (company-scoped slot kanban)
- `labels.js` (bank_labels), `db.js` + `pipeline_db.js` + `ugcs_db.js` (data)
- `SlotModal.jsx`, `WeeklyPlanModal.jsx`, `ConfigModal.jsx`, `ExampleModal.jsx`, `export_pdf.js`
- `scaling_simulator/` (inverse planner + week-by-week simulation → `scaling_scenarios`)

### `src/workspace/` — per-company CLIENT workspace

Mounted **from `App.jsx`** (not its own router). Company-scoped throughout.

- `CompanyWorkspace.jsx` (branded sidebar shell + ⌘K), `CompanyHome.jsx` (Resumen KPIs), `PlanView.jsx` (strategy), `CompanyTeam.jsx` (client's own roster)
- `CompanyTareas.jsx`, `CompanyGuiones`, `CompanyAgenda.jsx`, `CompanyContentPipeline.jsx`
- Subdirs: `tasks/`, `guiones/`, `pipeline/`, `data/`, `permissions/slot_permissions.js`
- Access mapping: `member_access.js` (role → visible nav)

### `src/team/` — Inforce staff War Room (admin)

`TeamApp.jsx` gates on `useTeamAuth` (must be in `team_members`) and routes via
`usePathRoute({prefix:"/equipo"})` + `canAccessView` (`team/lib/permissions.js`).
**No company context** — all views are global across companies.

| Subdir | What |
|---|---|
| `layout/` | `Sidebar.jsx` (nav shell) |
| `tasks/` | Global task board |
| `guiones/` | Global script generator/library |
| `contenido/` | `ContentPipeline.jsx` over `content_items` (distinct from despliegue pipeline) |
| `finance/` | Finance OS (lazy) — budget tables, AI advisor |
| `concept_bank/` | Cross-company creative bank |
| `inbox/` | `BandejaPage.jsx` — reference/candidate ad staging |
| `data/` | Per-domain `*Db.js` |
| `hooks/` | Global `use*` hooks |
| `warroom/`, `empresas/`, `equipo/`, `northstar/`, `scorecard/`, `tracking/`, `settings/`, `spaces/`, `timetrack/`, `workspace/` | War Room dashboards, company stats, roster, north-star, scorecards, master tracking, settings, task spaces, time tracking, per-member SOPs |

### Other `src/` directories

| Dir | Purpose | Surfaces |
|---|---|---|
| `onboarding/` | `OnboardingHost.jsx` (mounted at root) + `VideoOnboarding.jsx` + joyride tours | Both |
| `landing/` | Public SaaS site + auth: `LandingPage`, `SignupPage`, `LoginPage`, `ForgotPasswordPage`, `OnboardingWizard`, `auth_db.js` | Public |
| `notifications/` | `NotificationsBell.jsx` (global realtime bell) | Both |
| `feedback/` | `FeedbackWidget.jsx` (global floating feedback) | Both |
| `control_creativos/` | `SheetView.jsx` — spreadsheet-style creative-delivery grid | Client workspace |

### `api/*` — Vercel serverless functions

18 functions + shared `api/_lib/`. See §9 for the full inventory and auth gates.
`api/_lib/auth.js` provides `serviceClient()` (service-role, RLS-bypass, never
shipped to the browser), `getUser`, `requireTeamMember`, `requireCompanyAccess`.

### `db/*.sql` — schema + migrations + RLS

~85 SQL files, grouped by domain:

| Domain | Representative files |
|---|---|
| Auth / RLS | `rls_hardening_v1.sql`, `client_auth_schema.sql`, `saas_signup.sql`, `google_login_email_match.sql` |
| Despliegue | `despliegue_creativo.sql`, `despliegue_slots.sql`, `despliegue_v2/v3.sql`, `variation_labels.sql`, `pipeline_type_split.sql` |
| Finance | `finance_os_schema.sql` + `finance_os_v2/v3/v4.sql`, `finance_os_fase2.sql` |
| Content | `content_schema.sql`, `content_pipeline_trial_destinations.sql`, `content_edit_*` |
| Guiones | `guiones_schema.sql`, `company_guiones.sql`, `script_structures*.sql`, `voice_learning_loop.sql` |
| Tasks / time | `company_tasks.sql`, `tasks_*_migration.sql`, `time_tracker_*.sql` |
| Team / tracking | `team_schema.sql`, `team_members_*.sql`, `master_tracking_*.sql`, `scorecard_*.sql`, `north_star.sql`, `sops_*.sql` |
| Concept bank / inbox | `concept_bank_*.sql`, `concept_groups.sql`, `reference_inbox.sql` |
| Roadmap (design-only) | `roadmap_foundations.sql` + `ROADMAP_DATA_MODEL.md` |

Design docs live at `db/README.md` and `db/ROADMAP_DATA_MODEL.md`.

---

## 4. Auth & multi-tenancy

**All auth is Supabase Auth (email + password).** PINs are retired.
`PinScreen` (`features/auth/PinScreen.jsx`) drives both `admin` and `client`
modes.

### Login handlers (`App.jsx`)

- `handleAdminEmail` (`App.jsx:6488`) → `signInWithPassword` → `resolveUserAccess(session)` (`App.jsx:6496`). Only `role:"admin"` proceeds; sets `authMode="admin"`, caches `localStorage inforce_auth="admin"`.
- `handleClientEmail` (`App.jsx:6569`) → sign-in → `resolveUserAccess` → picks the company matching the slug → `resolveClientMember(company, user, {assumeOwner})` (`App.jsx:6625`) → `loadAccessibleCompaniesByEmail` for the tenant switcher.

### Tenant resolvers (`src/lib/authAccess.js`)

```
resolveUserAccess(session) → { role: "admin"|"client"|"none", companies: [...] }
```

- **Admin** iff `auth.uid` (or verified email) is in `team_members` (`authAccess.js:25-41`).
- **Client** access unions **three sources** (`authAccess.js:44-73`):
  1. `companies.owner_user_id = user.id` (+ `companies.email` for Google logins with a fresh uid)
  2. `client_users.user_id = user.id`
  3. `company_team_members.email = user.email`

`loadAccessibleCompaniesByEmail(email, session)` (`authAccess.js:108`) mirrors
the same 4 sources to populate the tenant switcher.

`resolveClientMember(company, user, {assumeOwner})` (`authAccess.js:167`)
populates `currentMember` (roles / `is_owner`). Critical: without it a
self-signup owner entered with `currentMember=null`, which made
`canManageWorkspace` / `isFullAccess` false and locked every owner feature. It
synthesizes an owner row when the signup's `team_member` insert failed
(`authAccess.js:213-221`).

### Role flags in the app (`App.jsx`)

```js
const isAdmin  = authMode === "admin";                 // App.jsx:6848
const isClient = authMode === "client";                // App.jsx:6849
// canManageWorkspace: admin OR owner OR project_manager of THIS company
const canManageWorkspace = isAdmin || currentMember?.is_owner ||
  currentMember?.roles?.includes("project_manager");   // App.jsx:6860
// Report CRUD: owner / trafficker / admin-global
const canManageRpts = canManageReports(reportsEffectiveMember); // App.jsx:6870
```

### RLS enforcement (`db/rls_hardening_v1.sql`)

Model: **team = god-mode; each client = only their companies; anon = blocked on
all tenant tables.**

Two `SECURITY DEFINER STABLE` helpers with a fixed `search_path`:

```sql
-- rls_hardening_v1.sql:21
create function public.is_team_admin() returns boolean ... as $$
  select exists (select 1 from public.team_members t where t.id = auth.uid());
$$;

-- rls_hardening_v1.sql:26  (company ids are TEXT)
create function public.accessible_company_ids() returns setof text ... as $$
  select c.id from public.companies c where c.owner_user_id = auth.uid()
  union select cu.company_id from public.client_users cu where cu.user_id = auth.uid()
  union select ctm.company_id from public.company_team_members ctm
   where ctm.auth_user_id = auth.uid()
      or lower(ctm.email) = lower(auth.jwt() ->> 'email');
$$;
```

Derived accessors for child tables that lack a direct `company_id`:
`accessible_board_ids` / `accessible_concept_ids` (despliegue variations scope
through `concept_id`), `accessible_delivery_ids`, `accessible_task_ids`,
`accessible_identity_keys` (`rls_hardening_v1.sql:38-74`).
`company_login_lookup(slug)` (`:84`) is the **only** function granted to `anon`
(pre-auth bootstrap; non-sensitive columns only).

Policy shapes:

1. Direct-`company_id` tables → `is_team_admin() or company_id in (select accessible_company_ids())`.
2. Child tables → scoped through the parent accessor.
3. Team-internal tables (finance, scorecard, time_tracker, content, north_star, sops) → `is_team_admin()` only. **This is the hard client/team line.**

`sbFetch` sends the **user's JWT** (not the anon key) so PostgREST evaluates RLS
as the logged-in user (`lib/db.js:11-15`).

> **Status:** RLS multi-tenant is **applied and enforced in production.** All
> clients authenticate via Supabase Auth (the legacy PIN path was retired and the
> plaintext `pin` columns dropped). `anon` is blocked on every tenant table
> (audit: 0 policies with `qual = true` for `anon`); a client sees only its own
> company. Any NEW tenant table must follow the same policy — never
> `FOR ALL TO anon USING (true)`. See `ROADMAP.md` §9 and memory
> `project_security_hardening`.

---

## 5. Data layer

### `src/lib/db.js`

```js
sbFetch(path, options)   // db.js:7  — PostgREST wrapper; prefers session JWT, falls back to anon key
dbGetCompanies()         // db.js:35
dbGetReports(companyId)  // db.js:45 — report payload lives in a JSON `data` column: { id, ...r.data }
dbSaveCompany(company)   // db.js:51 — upsert via Prefer: resolution=merge-duplicates
dbSaveReport(id, report) // db.js:67
dbDeleteCompany / dbDeleteReport / dbSetCompanyArchived
```

> **The `reports` table is schemaless.** Only `id / company_id / period` are
> real columns; the entire report shape lives in the JSON `data` column
> (`db.js:48, 72`). There is no DB-level validation of report structure.

### Per-module `*Db.js`

Each module owns its own Supabase access (no shared ORM):

- Despliegue: `despliegue/db.js` (649 lines), `pipeline_db.js`, `ugcs_db.js`
- Team: `team/data/{db,contentDb,guionesDb,scorecardDb,trackingDb,sopsDb}.js`
- Workspace: `workspace/tasks/workspace_tasks_db.js`, `workspace/guiones/workspace_guiones_db.js`
- Large ones: `team/concept_bank/db.js` (1170 lines), `team/inbox/inboxDb.js` (1476 lines)
- Also: `control_creativos/db.js`, `landing/auth_db.js`, `notifications/notifications_db.js`

### Hook layer

- **Team** = global hooks (`team/hooks/use{Members,Tasks,Spaces,Companies,Content,Scorecard,...}`).
- **Workspace** = company-scoped `useCompany*(companyId)` hooks threaded via
  React context (`workspace/guiones/context.js`, `workspace/tasks/TareasDataContext.jsx`).

### localStorage stale-while-revalidate cache (`App.jsx:6395-6467`)

Navigating between companies triggers a full page reload, which used to refetch
**all** companies + **all** report history each time. The cache fixes that:

```
key = `inforce_data_${authMode}_${clientSlug || "admin"}`
1. Hydrate companies+reports from localStorage → instant render (App.jsx:6435)
2. dbGetCompanies() + per-company dbGetReports() revalidate in background
3. Rewrite the cache; re-sync the open company to fresh data (App.jsx:6457-6462)
```

Auth is also cached (`inforce_auth`, `inforce_member_id`) but now **validated
against the real Supabase session** to close a spoofing hole where anyone could
`localStorage.setItem("inforce_auth","client:slug")` (`App.jsx:6113-6126`).

### `src/lib/supabase.js`

One `createClient`, env-overridable URL / anon key with hardcoded fallbacks (the
anon key is *publishable* by design — RLS protects the data),
`persistSession + autoRefreshToken + detectSessionInUrl`,
`storageKey:"inforce-team-auth"`, realtime capped at 10 events/s.

---

## 6. Reportes engine

Lives in `InforceReports` (`App.jsx:5995`, ~2,295 lines) plus the whole
report UI inline in `App.jsx`. Pure logic is extracted to `src/lib/reportes/`
(primary) and a partial parallel copy `src/lib/reports/`.

### Flow

```
ReportTypeSelector (App.jsx:2668)
  → NewReportForm (App.jsx:2733) ── import data 3 ways:
        • CSV     → CsvImporter (App.jsx:1793) → parseMetaCsv (reportes/csv.js:228)
        • Image   → ImageUploader (App.jsx:1982) → OCR via /api/ai
        • Text/audio → callAI (App.jsx:896)
  → handleGenerate (App.jsx:2957) builds the report object
  → saveReport (App.jsx:6745) → dbSaveReport
  → ReportView (App.jsx:4223, ~1,205 lines) → calcMetrics + CampaignsAdsViewer (App.jsx:3495)
```

### Pure lib (`src/lib/reportes/`)

| File | Provides |
|---|---|
| `csv.js` | `parseCsvText`, `parseCsvNumber` (ES `1.234,56` + EN `1,234.56`), `META_CSV_COLUMNS` (~30 metric regexes ES/EN), `classifyObjective`, `matchCsvColumns`, `parseMetaCsv` |
| `adMatching.js` | 3-tier fuzzy ad-name matching (`findBestMatch`), metric-fallback matching, `classifyAdSeverity`, `getAdSeverityStyle` |
| `reportRanges.js` | `parsePeriodDates`, `getReportDates`, `selectReportsForRange` (greedy non-overlapping), `distributeDaily` |
| `format.js` | `fmt / fmtM / pct / num` |
| `reports/metrics.js` | `defaultObjectives`, **`calcMetrics`** (roas/ctr/cpc/cpm/checkoutRate/costPerPurchase…) |

> **Known duplication:** `calcMetrics` exists in **three** places (inline in
> `App.jsx`, `lib/reports/metrics.js`), and date helpers overlap between
> `lib/reportes/reportRanges.js` and `lib/reports/{periods,ranges}.js`. Flagged
> in-code as "must be kept in sync." See `ROADMAP.md`.

All report AI funnels through one `/api/ai` proxy via `callAI` (`App.jsx:896`)
with 529-overload retry.

---

## 7. Despliegue creativo

### Data model: boards → concepts → variations + slots

```
despliegue_boards          (one active per company × pipeline_type)
  ├─ despliegue_concepts    (the strategic buckets: stage × format)
  │    └─ despliegue_variations  (visual instances / reference thumbnails / produced ads)
  └─ despliegue_slots       (weekly production kanban; optionally references a concept)
```

- **`despliegue_boards`** (`db/despliegue_creativo.sql:10`) — `config JSONB`
  (`db/despliegue_v3.sql:4`) holds cadence, distribution, labels, touchpoints,
  strategy. `pipeline_type ∈ {ads, organic}` (default `ads`,
  `db/pipeline_type_split.sql`).
- **`despliegue_concepts`** (`db/despliegue_creativo.sql:22`) —
  `stage TEXT NOT NULL CHECK IN ('tofu','mofu','bofu')`,
  `format TEXT NOT NULL CHECK IN ('static','video')`, `weekly_target`,
  `concept_group_id` (cross-company sharing).
- **`despliegue_variations`** (`db/despliegue_creativo.sql:38`) — `concept_id`,
  `state`, drive/meta links, `bank_labels jsonb` (`db/variation_labels.sql`),
  and **`source_type CHECK IN ('reference','produced')`**
  (`db/despliegue_variations_source_type.sql`). The client view uses
  `source_type` to split **Referentes vs Creados**
  (`DespliegueClienteView.jsx:125-130`). Has **no direct `company_id`** — RLS
  scopes it via `concept_id`.
- **`despliegue_slots`** (`db/despliegue_slots.sql:13`) — its **own**
  denormalized `stage` + `format`, plus `status CHECK IN
  ('idea','scripting','to_film','to_edit','in_campaign','feedback')`,
  scripting/production/review fields.

**pipeline → canvas loop:** when a slot enters `in_campaign`, a `produced`
variation is auto-created under its concept
(`db/despliegue_slot_variation_link.sql`), closing the loop from the production
kanban back to the strategic canvas.

### TOFU / MOFU / BOFU funnel

Defined once in `src/despliegue/constants.js:3-13`:

| Stage | Meaning | Color |
|---|---|---|
| `tofu` | Top — attract new audience | green |
| `mofu` | Middle — consider & trust | yellow |
| `bofu` | Bottom — convert & close | red |

Every concept and slot carries `stage` + `format`. Cadence distributes weekly
targets per stage (`db.js:112-144`); `board.config.distribution` holds
`{tofu:60,mofu:30,bofu:10}`.

### Labels (`src/despliegue/labels.js`)

`bank_labels` is `{marca, nicho, subnicho, angulo, formato}`, each an array of
strings (`labels.js:7-13`). Two primitives every label write must go through:

```js
// labels.js:64 — canonical key: lowercase → NFD → strip accents → trim
normLabel(s)          // "Calzado" / "calzado" / "CALZADO " → same key

// labels.js:73 — append value UNLESS a normLabel-equal one exists;
// preserves original casing; returns a NEW array; drops empties
mergeLabelValue(arr, value)   // prevents "Ryze"/"ryze" duplicate chips
```

Other helpers: `getLabels` (tolerant read), `groupVariations` (group by first
value of a category), `variationMatches` (AND across categories, OR within,
accent-insensitive). The same `normLabel` is the intended key for the roadmap's
`creative_angles.norm_key`.

### Surfaces

- **Admin canvas** — `DespliegueCreativo.jsx` (fixed 20000px canvas, dnd-kit +
  zoom-pan-pinch). Never stacks: `StageRow` uses a fixed
  `gridTemplateColumns:"auto auto"` (`DespliegueCreativo.jsx:868-874`).
- **Client view** — `DespliegueClienteView.jsx` (read-only funnel; Conceptos /
  Colmena / Grilla layouts). Groups concepts by `stage` into columns, split by
  `format`. **Known bug** (flex-wrap stacking) documented in `ROADMAP.md`.
- **Pipeline** — `ContentPipeline.jsx` (company-scoped slot kanban with
  realtime). Reused by the client workspace via `CompanyContentPipeline.jsx`.
  Distinct from `team/contenido/ContentPipeline.jsx`, which is a **global**
  kanban over `content_items`.

---

## 8. Design system & conventions

### Tokens (`src/lib/design.js`)

- `DS` — a mutable object of colors, `radius`, `font` (`Plus Jakarta Sans`).
- Mutable presets: `darkCard`, `darkInput`, `darkBtn`, `darkBtnGhost`, `darkBtnRed`.
- `applyTheme(isDark)` (`design.js:115`) **mutates `DS` + presets in place** and
  toggles `document.documentElement.classList.light`.
- `withAlpha(color, hexAlpha)` (`design.js:157`) safely composes alpha for hex
  and `rgba()` inputs.

### CSS variables (`src/index.css`)

`:root` = dark theme; `:root.light` = premium light override. Tokens:
`--ink/--ink-2..4`, `--neon`, `--brand`, `--surface`, `--line`, `--bg`,
`--ambient`, `--glow`, `--shadow`. Legacy names (`--glass-bg`, `--spinner-*`)
are mapped forward. Utility classes: `.glass`, `.card-hover`, `.gradient-text`,
`.anim-*`. Responsive `@media` at 768px / 480px (sidebar → overlay, metric &
funnel grids).

### Theme (`src/lib/theme.jsx`)

`ThemeProvider` reads `localStorage inforce-theme`, calls `applyTheme`
**synchronously before render**, exposes `{isDark, toggleTheme}`.

### Conventions

- **Inline styles from `DS`** are the norm (not CSS modules). New CSS-var-based
  components read `var(--...)` from `index.css`.
- **`BrandLoader.jsx`** is the theme-aware spinner used as every lazy fallback.
- **`toast.js`** — imperative toast for surfacing errors that were previously
  swallowed by empty `.catch()` (silent data-loss).
- **`logger.js`** — use instead of `console`. Silences debug/info in prod;
  `warn`/`error` always pass. Single future hook for Sentry.
- **Routing** — `usePathRoute({prefix})` for in-zone nav; `goPath`/`replacePath`
  for full-reload cross-zone nav (fires `pathchange`). Reserved top segments
  (`cliente/admin/equipo/api/signup/login/...`) never get legacy-redirected
  (`router.jsx:14-24`).

---

## 9. Build / deploy / tooling

### Vite (`vite.config.js`)

`manualChunks` splits vendors: `react-vendor`, `charts` (recharts + d3),
`editor` (tiptap + prosemirror), `supabase`. **Lazy chunks:**
`DespliegueCreativo`, `DespliegueClienteView`, `ContentPipeline`,
`CompanyContentPipeline`, `ControlCreativos` (`App.jsx:20-35`), `TeamApp`
(`main.jsx:15`), finance; plus dynamic imports for `xlsx`, `mammoth`,
`pdfjs-dist`, `jspdf`.

### `api/*` serverless (18 functions)

Shared `api/_lib/auth.js`: `serviceClient()` (service-role, RLS-bypass, never in
the browser bundle), `getUser`, `requireTeamMember`, `requireCompanyAccess`.

| Function | What / external service | Gate |
|---|---|---|
| `ai.js` | Generic Claude proxy (sonnet → haiku fallback, 529 retry) | any authed user |
| `classify-ad.js` (50KB) | FB Ads Library → Whisper → Claude classification | team-only |
| `generate-script.js` (54KB) | Script generation; **per-company token rate-limits** 60k/hr · 150k/day · 300k/wk (team bypass) | special |
| `finance-ai.js` | Opus streaming finance advisor | team-only |
| `foreplay-sync.js`, `apify-ad.js` | Ad-library ingestion (Foreplay / Apify) | team-only |
| `organize-labels.js` | AI label cleanup | team-only |
| `drive-backup.js`, `drive-upload-token.js` | Google Drive backup / signed upload | team-only |
| `extract-knowledge.js`, `extract-product-info.js` | Claude extraction | any authed |
| `extract-voice-patterns.js` | Voice-rule extraction | client tenant-scoped |
| `transcribe.js` | OpenAI Whisper | any authed |
| `title-from-hook.js`, `save-feedback.js` | Claude title / feedback save | client tenant-scoped |
| `admin-create-client-user.js`, `admin-create-member.js` | Provision users (service role) | team-only |
| `notify-password-reset.js` | Resend email | public |

Every AI endpoint has explicit auth to stop free-LLM-proxy / financial DoS
(see `ai.js:16-22`).

### Tests

Vitest (`vitest.config.js`, node env). 9 suites under `src/**/__tests__` and
`src/lib/reportes/__tests__` — pure functions only (csv, reportRanges,
scriptDuration, urls, recurrence, driveLinks, dedup, labels).

### CI (`.github/workflows/ci.yml`)

On push + PRs to `main`: `npm ci` → **lint → build → test**. Lint runs but most
rules are `warn` (see `ROADMAP.md`), so CI is gated on **build + test**, not on
burning down legacy lint debt.

### Deploy (`DEPLOY.md`)

- Production (`portal.josehuila.com`) deploys **only from `main`**.
- Manual flow: `npx vercel --yes` → `vercel alias set <url> inforce-design-jose.vercel.app` → `vercel promote <url> --yes`. (`vercel --prod` returns "Not authorized" on this project.)
- **Verify by chunk**, not the `index` hash: `curl` the changed
  `assets/<Chunk>-<hash>.js` for a `200`.

---

## Appendix — key file index

| Concern | Entry point |
|---|---|
| App entry / zones | `src/main.jsx`, `src/lib/router.jsx` |
| Admin + client app | `src/App.jsx` (`InforceReports`, `App.jsx:5995`) |
| Team app | `src/team/TeamApp.jsx` |
| Auth resolvers | `src/lib/authAccess.js`, `src/features/auth/PinScreen.jsx` |
| Data layer | `src/lib/db.js`, `src/lib/supabase.js` |
| RLS | `db/rls_hardening_v1.sql` |
| Reportes | `src/App.jsx:5995` + `src/lib/reportes/*` |
| Despliegue | `src/despliegue/*` + `db/despliegue_*.sql` |
| Design system | `src/lib/design.js`, `src/index.css`, `src/lib/theme.jsx` |
| Roadmap data model | `db/ROADMAP_DATA_MODEL.md`, `db/roadmap_foundations.sql` |
| Deploy | `DEPLOY.md` |
