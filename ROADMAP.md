> ⚠️ **DOCUMENTO DESACTUALIZADO — 28 de julio de 2026**
>
> Desde que se escribió hubo **95 commits y +22.470 líneas**. No menciona la
> papelera de briefs, la sofisticación de mercado, la cadena de diagnóstico ni
> el banco de creativos, y varias cosas que da por pendientes ya se hicieron.
>
> **Para el estado real: [ESTADO.md](ESTADO.md).** Esto se conserva como
> historia de lo que se pensaba en julio, no como guía.

# Roadmap — What to work on

> Prioritized tech-debt and feature backlog for an incoming developer. Each item
> is a concrete task with file references, rough effort, and risk. Read
> `ARCHITECTURE.md` for context and `CONTRIBUTING.md` for conventions.
>
> Effort: **S** ≈ hours · **M** ≈ 1–3 days · **L** ≈ 1+ week.

---

## Priority overview

| # | Item | Status | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| 1 | Break up the `App.jsx` God-component | Pending | L | Med–High | — |
| 2 | De-duplicate reportes logic (`calcMetrics` ×3) | Pending | S–M | Med | part of #1 |
| 3 | Dedup Phase 2 (FilterBar / taskFilters / TaskTimer / FormatLibrary) | Pending | M | Low | — |
| 4 | Shared UI primitives (Modal/Button/Card/Field over DS) | Pending | M | Low | — |
| 5 | Burn down real ESLint warnings (rules-of-hooks, exhaustive-deps) | Pending | M | Med | — |
| 6 | Fix despliegue client "TOFU stacked" bug | Pending | S | Low | — |
| 7 | Two latent despliegue issues (dead `soloStage` width; `to_design` status) | Pending | S | Low | — |
| 8 | Error-boundary coverage per zone | Pending | S | Low | — |
| 9 | Finish RLS hardening (Phases B–D) | Partial | L | **High** | Supabase Auth migration |
| 10 | Wire the roadmap data foundations (FB publishing + `ad_metrics`) | Pending (SQL designed) | L | Med | #9 |

---

## 1. Break up the `App.jsx` God-component — **L, Med–High risk**

`src/App.jsx` is **~8,368 lines**. It mixes auth, routing, data-loading, the
client workspace shell, and the entire Reportes UI.

Still inside `App.jsx` and ripe for extraction into `src/features/reportes/`:

| Component | Location | ~Lines |
|---|---|---|
| `InforceReports` (root) | `App.jsx:5995` | 2,295 |
| `ReportView` | `App.jsx:4223` | 1,205 |
| `NewReportForm` | `App.jsx:2733` | 761 |
| `CampaignsAdsViewer` | `App.jsx:3495` | 716 |
| `Step2Ads` | `App.jsx:2050` | 617 |
| `OpportunityCards` | `App.jsx:363` | 416 |
| `CsvImporter` / `ImageUploader` / `ReportTypeSelector` / `EditReportForm` / `CompanyStats` | various | — |
| Pure helpers to move to `lib/` | inline `calcMetrics` (`App.jsx:262`), `callAI` (`:896`), `processAdsText`, `processAnalysisText`, `rematchSingleAd`, `generateRecommendations`, `renderMarkdown` | — |

**Approach:** extract leaf-first (pure helpers → `lib/reportes/`, then
presentational components → `features/reportes/`, then the `NewReportForm` /
`ReportView` containers). Keep `InforceReports` as the thin orchestrator that
owns `authMode` / routing / data-loading. Add a test for each pure function you
pull out (that's the payoff). **Risk:** this file is the auth + routing hub, so
regressions here break login and navigation — extract incrementally, verify by
running the app after each step.

## 2. De-duplicate reportes logic — **S–M, Med risk**

`calcMetrics` exists in **three** places: inline in `App.jsx:262`,
`src/lib/reports/metrics.js`, and effectively again via `src/lib/reportes/`. Date
helpers overlap between `lib/reportes/reportRanges.js` and
`lib/reports/{periods,ranges}.js` (`parsePeriodDates`, `getReportDates`,
`selectReportsForRange` all appear twice). These are flagged in-code as "must be
kept in sync" — a bug magnet.

**Task:** pick `src/lib/reportes/` as the single source of truth, delete
`src/lib/reports/` (or make it re-export), and point `App.jsx` at the lib copy.
Covered by the existing `lib/reportes/__tests__` suites — extend them before
deleting the duplicates. Naturally folds into #1.

## 3. Dedup Phase 2 — **M, Low risk**

Phase 1 already moved 12 identical leaf components to `src/shared/`. Remaining
`team/*` vs `workspace/*` pairs split into two buckets:

**Keep forked (intentional scope/feature difference):**
- `TaskModal` — team takes `companies` + `defaultCompanyId` + a space/company container toggle; workspace is single-`companyId`.
- `ScriptGenerator` (`team/guiones` vs `workspace/guiones`) — workspace enforces `tokenLimits`, reads `useCompanyId`, and shims content-items onto despliegue **slots**.
- `GuionesPage` — different tabs and workspace-only Topbar / `onOpenDespliegue`.

**Dedup candidates (differ only by data-layer/config import):**
- `FilterBar.jsx` — **byte-identical** across `team/tasks` and `workspace/tasks`.
- `taskFilters` — differ by one agenda default rule (team adds `due_date is_not_set`).
- `TaskTimer` — differ only by the db import line.
- `FormatLibrary` — differ only by passing `companyId` into `createFormat`.

**Approach — scope injection:** move the shared UI to `src/shared/tasks|guiones/`
and pass the differences in as props/config: the db module (`{ createTask,
updateTask, ... }`), the `companyId` (or `null` for team), and the one differing
filter rule. The team and workspace files become thin wrappers that inject their
db + scope. Add these to `shared/` per the `CONTRIBUTING.md` rule.

## 4. Shared UI primitives — **M, Low risk**

There's no `Modal` / `Button` / `Card` / `Field` primitive — every component
re-implements them with inline `DS` styles (`darkCard`, `darkBtn`, `darkInput`).
Build a small `src/shared/ui/` (or `src/lib/ui/`) set on top of the DS tokens and
migrate opportunistically. Reduces the surface area that #1 and #3 have to
touch. Low risk (additive); do it alongside other work rather than as a big-bang
migration.

## 5. ESLint warnings — **M, Med risk (only for the real ones)**

**446 warnings, 0 errors.** Rules are intentionally `warn` so CI stays green
(`eslint.config.js`). Triage:

| Rule | Count | Verdict |
|---|---|---|
| `no-unused-vars` | 174 | Noise — cosmetic cleanup |
| `react-hooks/set-state-in-effect` | 70 | **Mostly advisory** (react-compiler hint); a few real render-loop risks — check the load/route effects incl. `App.jsx:6399` cache effect |
| `react-refresh/only-export-components` | 64 | Noise (HMR hint) |
| `no-empty` | 38 | Empty `catch {}` — migrate to `logger` + `toast` |
| `react-hooks/exhaustive-deps` | 29 | **Some real stale-closure bugs** — review individually |
| `react-hooks/rules-of-hooks` | 16 | **Highest-value — review each; conditional/looped hooks are real bugs** |
| `react-hooks/static-components`, `preserve-manual-memoization`, `purity`, `refs`, `immutability` | ~20 | Advisory compiler hints |

**Task:** fix the 16 `rules-of-hooks` and the 29 `exhaustive-deps` first (real
bugs), then promote those two rules back to `error` in `eslint.config.js`. Leave
the advisory/noise rules as warnings.

## 6. Despliegue client "TOFU stacked" bug — **S, Low risk**

**Symptom:** in the client view (`DespliegueClienteView.jsx`), long-running /
older companies render the funnel **stacked in one column** instead of side-by-side.

**Root cause (confirmed — NOT a schema / old-vs-new data issue):** it's a CSS
flex-wrap artifact correlated with concept *volume*. The two format groups
(Estáticos | Video) sit in `display:flex; flexWrap:"wrap"; justifyContent:center`
inside a `width:"fit-content"` frame capped at `maxWidth:"min(94vw,2400px)"`
(`DespliegueClienteView.jsx:576, 589`). Each block's width scales with concept
count (`cCols * 208` / `cCols * 172`, `:595, 607, 614`). Once a stage (TOFU has
the most concepts) exceeds the frame max, `flexWrap` pushes Video **below**
Estáticos → they "stack." Companies with few concepts stay side-by-side; older
companies accumulate enough TOFU concepts to cross the threshold.

`stage` / `format` have been `NOT NULL CHECK` on both `despliegue_concepts` and
`despliegue_slots` since the original schema — **there is no legacy data shape**
and no per-company renderer branch. The admin canvas never stacks because it uses
a fixed `gridTemplateColumns:"auto auto"` grid (`DespliegueCreativo.jsx:868-874`).

**Fix (around `DespliegueClienteView.jsx:589`):** either `flexWrap:"nowrap"` +
`overflowX:"auto"` on the frame (horizontal scroll instead of wrap), or reduce
the per-block widths so both columns fit within the cap. **Do not touch the
schema.**

## 7. Two latent despliegue issues — **S, Low risk**

- **Dead `soloStage` width** (`DespliegueClienteView.jsx:572`):
  `const width = soloStage ? "100%" : STAGE_WIDTH[st.key]` is computed but never
  applied (the frame uses `width:"fit-content"`), so the intended funnel
  narrowing (`STAGE_WIDTH={tofu:"100%",mofu:"84%",bofu:"68%"}`, `:64`) is inert
  on the client. Either wire it up or delete it.
- **`to_design` status mismatch:** `pipeline_db.js:18-26` defines a 7th slot
  status `to_design` that is **not** in the SQL `CHECK` constraint on
  `despliegue_slots.status` (`db/despliegue_slots.sql`). A slot set to
  `to_design` will fail the DB constraint. Add `to_design` to the CHECK
  constraint via a migration, or remove it from `PIPELINE_STATUSES`.

## 8. Error-boundary coverage — **S, Low risk**

There is a **single** top-level `ErrorBoundary` (`src/main.jsx:171`). Any throw
anywhere blanks the entire app. Add per-zone boundaries around `<TeamApp/>`,
`<InforceReports/>`, and the heavy lazy features (despliegue, pipeline, finance)
so a failure in one surface degrades gracefully instead of whitescreening.

## 9. Security posture — **DONE (multi-tenant RLS enforced); keep it that way**

> Status: **complete and verified in production.** This is documented here so a
> new dev does NOT accidentally re-open the tenant boundary.

Multi-tenant Row-Level Security is **applied and enforced**:
- `db/rls_hardening_v1.sql` is live: `is_team_admin()` + `accessible_company_ids()`
  (SECURITY DEFINER) scope every tenant table; storage buckets locked down.
- Client login is 100% Supabase Auth (email + password) — the legacy PIN path was
  fully retired and the plaintext `pin` columns were dropped from the DB.
- Verified: `anon` reads/writes are blocked on all tenant tables; a client sees
  **only** its own company; a wrong-tenant JWT gets 0 rows. The audit query
  `select tablename, policyname from pg_policies where 'anon' = any(roles) and qual = 'true'`
  returns **0 rows**.
- API endpoints under `api/*` require a JWT and check `requireCompanyAccess` /
  `requireTeamMember` (verified: unauthenticated calls return 401).

**Rules for contributors (do not regress):**
- Any NEW table with tenant data MUST enable RLS with the `is_team_admin() or
  company_id in (select accessible_company_ids())` policy — **never**
  `FOR ALL TO anon USING (true)`. (That pattern was the original breach.)
- Never add a plaintext credential column. Never bypass `sbFetch`'s JWT.
- New `api/*` endpoints must gate on `requireCompanyAccess`/`requireTeamMember`.

See memory `project_security_hardening` for the full history (Phases A–D, all done).

## 10. Roadmap data foundations — FB publishing + analytics — **L, Med risk**

`db/roadmap_foundations.sql` + `db/ROADMAP_DATA_MODEL.md` design (but do **not**
yet wire) two capabilities:

1. **Publish creatives as Meta ads** — `meta_ad_accounts`, `ad_publish_jobs`, and
   `despliegue_variations.{fb_campaign_id, fb_adset_id, fb_ad_id, fb_creative_id,
   publish_status, published_at, angle_id}`.
2. **Per-concept / per-angle performance** — `ad_metrics` (daily fact table,
   `UNIQUE(fb_ad_id, date)` for idempotent upsert), `creative_angles`
   (`norm_key` computed with the same `normLabel` from `despliegue/labels.js`).

The SQL is additive + idempotent and depends on `rls_hardening_v1.sql` being run
first (uses `is_team_admin()` / `accessible_company_ids()`). **Nothing is wired
to the frontend** — building the publish worker, the metrics cron, and the UI is
open work. Blocked by #9.

---

## Quick-win starter set (for a new dev's first week)

- **#6** TOFU stacking fix (one file, self-contained, visible impact).
- **#7** the two latent despliegue issues (a CHECK-constraint migration + a dead-code cleanup).
- **#2** collapse the duplicate reportes logic behind existing tests.
- A slice of **#5** — fix the 16 `rules-of-hooks` warnings.

These are low-risk, well-scoped, and teach the codebase's data/label/routing
patterns before tackling the `App.jsx` extraction (#1).
