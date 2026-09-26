# Contributing — Inforce Portal

> How to work in this repo. Read `ARCHITECTURE.md` first for the system map, and
> `ROADMAP.md` for what to work on. Codebase comments are in Spanish; match the
> surrounding style.

---

## Prerequisites

- **Node 20** (CI pins `node-version: '20'`).
- npm (the repo ships `package-lock.json`; use `npm ci` for reproducible installs).
- Access to the Supabase project (URL + anon key). Env is symlinked from the
  sibling `inforce-app` checkout: `.env.local` → `~/inforce-app/.env.local`.
  Vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both have hardcoded
  fallbacks in `src/lib/supabase.js`, so the app boots without them).
- For `api/*` functions locally: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  Supabase **service-role** key, and provider keys (Apify/Foreplay/Google/Resend)
  as needed.

---

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Preview built app | `npm run preview` |
| Run tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Lint | `npm run lint` |
| Format | `npm run format` (check: `npm run format:check`) |

CI (`.github/workflows/ci.yml`) runs **lint → build → test** on every push and
on PRs to `main`. Lint currently emits warnings but no errors, so the gate is
effectively **build + test must pass**.

---

## Deploy flow

Production is `portal.josehuila.com`. Full detail in `DEPLOY.md`; the rules:

1. **Deploy ONLY from `main`.** Never deploy a feature branch to prod — they
   clobber each other and revert work.
2. Manual promote (no auto-deploy wired yet):
   ```bash
   npx vercel --yes                                              # → returns a deployment URL
   npx vercel alias set <that-url> inforce-design-jose.vercel.app
   npx vercel promote <that-url> --yes
   ```
   `vercel --prod` returns "Not authorized" on this project — use alias + promote.
3. **Verify by chunk, not by `index` hash** (the index hash is not reliable):
   ```bash
   curl -s https://portal.josehuila.com/assets/<Chunk>-<hash>.js -o /dev/null -w "%{http_code}"   # expect 200
   ```
4. ⚠️ Never deploy the `bandeja-mejoras` branch alone — it overwrites the
   redesign in prod. Merge to `main` first.

Do **not** commit or deploy as part of a normal change unless explicitly asked —
open a PR and let CI + a human review it.

---

## Coding conventions

### Styling

- **Inline styles from `DS` tokens** (`src/lib/design.js`) are the house style —
  not CSS modules, not utility classes. Example:
  ```jsx
  <div style={{ background: DS.bgCard, border: DS.border, borderRadius: DS.radius, color: DS.textPrimary }}>
  ```
- **Theme-aware** via CSS variables in `src/index.css` (`var(--ink)`,
  `var(--surface)`, `var(--brand)`, …). `DS` is mutated by `applyTheme()`, and
  the `.light` class on `<html>` flips the CSS vars — never hardcode a hex where
  a token exists.
- Compose alpha with `withAlpha(color, "22")`, never string-concat
  (`rgba(...)22` is invalid CSS).
- Use `BrandLoader` for loading states (theme-aware) and the `.glass` /
  `.card-hover` utility classes for standard surfaces.

### Data & modules

- **One `*Db.js` per module** owns that module's Supabase access. Don't scatter
  `sbFetch` / `supabase.from(...)` calls across components — add a function to
  the module's db file and call it from a hook.
- **Hook + db.js pattern:** components consume a `use*` hook; the hook calls the
  module `*Db.js`; the db file talks to Supabase. Team hooks are global;
  workspace hooks are company-scoped (`useCompany*(companyId)` / context).
- Company data goes through `src/lib/db.js` (`dbGetCompanies`, `dbGetReports`,
  `dbSaveReport`, …). The `reports` table is schemaless — the report shape lives
  in the JSON `data` column, so keep the JS report object self-consistent.

### Errors & logging

- **Use `logger` (`src/lib/logger.js`), never `console`.** `logger.debug/info`
  are silenced in prod; `warn`/`error` always pass.
- **Never swallow a failed save/delete with an empty `.catch(() => {})`.**
  Surface it to the user with `toast` (`src/lib/toast.js`):
  ```js
  dbSaveCompany(updated).catch((e) => {
    logger.error("dbSaveCompany falló", e);
    toastError("No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
  });
  ```

### Labels (despliegue / concept bank)

- **Every write to `bank_labels` must go through `normLabel` / `mergeLabelValue`**
  (`src/despliegue/labels.js`). `mergeLabelValue(arr, value)` dedups by
  normalized key (lowercase + accent-stripped) while preserving casing — this is
  what prevents "Ryze"/"ryze" duplicate chips. Do not push raw strings into a
  label array.

### Routing

- In-zone navigation: `usePathRoute({prefix})` → `navigate(sub)` / `replace(sub)`.
- Cross-zone navigation is a **full page reload** via `goPath` / `replacePath`.
- If you add a new top-level route, add it to `RESERVED_ZONES` in
  `src/lib/router.jsx:14` so it isn't mistaken for a client slug.

---

## Where does my component go? `shared/` vs `team/` vs `workspace/`

This is the most common structural decision in the repo.

| Put it in… | When |
|---|---|
| `src/shared/` | The component is **byte-identical** for team and workspace — a pure presentational/utility leaf that takes everything as props and never imports a data layer. (See the 12 files already there.) Both `team/*` and `workspace/*` then re-export it with `export * from "../../shared/…"`. |
| `src/team/` | The component is **global** — no single company in scope. It reads global hooks and shows data across all companies (War Room). |
| `src/workspace/` | The component is **company-scoped** — it needs a `companyId` (via prop or `useCompanyId` context) and shows one company's data. |

**Rule of thumb:** if two copies drift only because of their **data-layer
import** (which `*Db.js` they call), that's a scope difference — the *UI* can
still be shared by injecting the db/config as props (see "Dedup Phase 2" in
`ROADMAP.md`). If they drift because of **different features/props/layout**,
keep them forked.

The team app has **no company context** at all (`useCompanyId` /
`CompanyContext` appear only under `workspace/`), so anything referencing a
current company belongs in `workspace/`.

---

## Testing conventions

- Tests live in `src/**/__tests__/**` or `src/**/*.{test,spec}.{js,jsx}`
  (`vitest.config.js`), run in the **node** environment.
- **Test pure functions**, not React trees. The existing suites cover
  `lib/reportes/{csv,reportRanges}`, `despliegue/{labels,dedup}`,
  `lib/{scriptDuration,scriptParse,urls,recurrence,driveLinks}`.
- When you extract logic out of a component (the ongoing refactor direction),
  add a test for the extracted pure function — that's the payoff of extraction.

---

## PR & CI expectations

- Branch off `main`; open a PR into `main`.
- CI must be green: **lint (no new errors)**, **build**, **test**.
- Don't introduce new ESLint **errors**. New **warnings** should be avoided but
  won't fail CI; prefer fixing the rule locally (esp. `react-hooks/rules-of-hooks`
  and `exhaustive-deps` — those flag real bugs). See `ROADMAP.md §lint`.
- Keep commits focused. Prefer extracting a component into `src/features/…` or
  `src/shared/…` over adding more code to `App.jsx`.
- Do not commit secrets — the anon key is publishable, but service-role keys and
  provider keys are server-only (`api/*` env), never in `src/`.
