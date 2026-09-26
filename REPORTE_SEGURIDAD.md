# Auditoría de seguridad — portal.josehuila.com

**Portal:** `inforce-app` (Vite + React 19 + Supabase + Vercel Functions)
**Fecha:** 2026-05-25
**Alcance:** RLS de Postgres, autenticación/autorización de API, secretos en el bundle, XSS, headers de seguridad, flujo de auth.

> **Resumen en una frase:** el aislamiento multi-tenant a nivel de base de datos está roto — la app confía 100% en la capa de frontend para evitar que un cliente lea/modifique datos de otro, y eso es bypaseable con un `curl`.

---

## Severidad CRÍTICA (parchear ya)

### C1. RLS abierto en 15+ tablas de negocio — IDOR masivo a nivel REST API

**Archivos:** `db/company_guiones.sql:93-115`, `db/despliegue_creativo.sql:74-85`, `db/despliegue_slots.sql:117-120`, `db/team_members_schema.sql:31-36`, `db/creative_control_schema.sql:125-130`, `db/creative_numbering_and_ugcs.sql:31-33`, `db/guiones_schema.sql:59-62`, varios más. **Total 73 ocurrencias de `using (true)` en `db/*.sql`.**

Patrón:
```sql
CREATE POLICY ... FOR SELECT USING (true);
CREATE POLICY ... FOR ALL    USING (true) WITH CHECK (true);
```

Tablas afectadas (incompleto): `companies`, `company_team_members`, `company_voice_profile`, `company_script_formats`, `company_expertise_base`, `company_expertise_documents`, `company_scripts`, `despliegue_boards`, `despliegue_concepts`, `despliegue_variations`, `despliegue_slots`, `despliegue_weekly_plans`, `creative_items`, `creative_deliveries`, `creative_column_options`, `company_ugcs`, `voice_profile` (legacy), `scripts` (legacy).

**Impacto:** una cuenta de cliente A logueada puede hacer `curl https://<supabase>.supabase.co/rest/v1/despliegue_concepts?company_id=eq.<B>` con su propia anon key y leer/modificar TODOS los conceptos creativos de la empresa B. Lo mismo aplica a equipos, productos, scripts, voice profiles, slots. **Multi-tenancy roto a nivel DB.**

### C2. Algunas tablas le dan acceso a `anon` (sin login)

**Archivos:** `db/creative_control_schema.sql:128-130`, `db/despliegue_slots.sql:119-120`.
```sql
CREATE POLICY anon_all_creative_items ON creative_items
  FOR ALL TO anon USING (true) WITH CHECK (true);
```

**Impacto:** cualquier persona en internet con la URL de Supabase y la anon key (que es pública en el bundle) puede leer y modificar `creative_items`, `creative_deliveries`, `creative_column_options`, `despliegue_slots`, `despliegue_weekly_plans` **sin tener que crear cuenta**. Estos son los assets creativos finales y la planificación semanal de TODOS los clientes.

### C3. `ADMIN_PIN` hardcodeado y embedido en el bundle de producción

**Archivo:** `src/App.jsx:356`
```js
const ADMIN_PIN = "[REDACTADO]";
```

**Verificación:** `grep "inforce2026" dist/assets/index-*.js` → **encontrado**. El PIN se mina al bundle JS que se sirve desde `portal.josehuila.com`. Cualquier persona con DevTools (Sources → buscar "inforce2026") lo extrae en 30 segundos.

Uso del PIN (App.jsx:8652, 8814): borrar empresas, ver credenciales. Si alguien lo obtiene puede eliminar clientes desde la UI o usar el "modo admin" en cualquier cuenta.

### C4. IDOR en API endpoints — `companyId` viene del body sin validar pertenencia

**Archivos:** `api/extract-voice-patterns.js:64-96`, `api/save-feedback.js:28-91`, `api/generate-script.js:554-574`, probablemente más.

Patrón típico:
```js
const { companyId, ...rest } = req.body;
// ❌ NO se valida que el JWT del user pertenezca a esta companyId
const q = sb.from("company_voice_profile").select(...).eq("company_id", companyId);
```

**Impacto:** un user logueado puede mandar `companyId` de OTRA empresa en el body y el endpoint procede. Esto bypasea cualquier RLS bien escrita (porque el endpoint corre con `service_role` o similar). Es la causa de que el fix de RLS por sí solo no sea suficiente: hay que validar también en cada endpoint.

---

## Severidad ALTA

### A1. Tablas SIN RLS habilitado del todo

**Archivos:** `db/company_tasks.sql`, `db/company_token_usage.sql`, `db/platform_feedback.sql` — no incluyen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. (`company_tasks.sql` sí tiene policies pero no las habilita — equivalente a no tener.)

**Impacto:** mismas consecuencias de C1 — acceso libre cross-tenant a tareas, uso de tokens (información competitiva sobre cuánto consume cada cliente), y feedback (PII libre).

### A2. `/api/notify-password-reset` permite enumeración + spam + leakea PII a logs

**Archivo:** `api/notify-password-reset.js`

```js
const { email } = req.body || {};
if (!email) return res.status(400).json({ error: "email is required" });
console.log(`[password-reset-notify] User requested reset: ${email} at ${...}`);
// no rate limit, no captcha
```

**Impacto:** (1) atacante puede probar miles de emails — si la respuesta varía según existe o no, **enumeración masiva**. (2) sin rate limit puede spamear el endpoint y llenar logs / mandar muchos mails. (3) cada email del usuario queda **escrito en los logs de Vercel** (PII visible para cualquiera con acceso al dashboard de Vercel).

### A3. Sesión Supabase en `localStorage` + presencia de `innerHTML`

`src/App.jsx:5108` hace `s.innerHTML = '@media print { ... }'` con CSS estático — hoy no es vulnerable (no se interpolan datos del usuario), pero el patrón es peligroso si alguien le agrega una variable después. Y los tokens viven en `localStorage` (default de supabase-js), entonces **un único XSS** = robo total de sesión.

### A4. `detectTeamBypass` con `ilike` puede match incorrecto

**Archivo:** `api/generate-script.js:58-65`
```js
sb.from("team_members").select(...).ilike("email", user.email).maybeSingle();
```

`ilike` es case-insensitive. Si por error hay dos rows con emails que sólo se diferencian en mayúsculas, devuelve uno arbitrario. **Bajo riesgo en práctica, alto si en algún momento se crea una colisión.** Mejor `eq` con email normalizado lower().

---

## Severidad MEDIA

### M1. Supabase anon key hardcodeada como fallback

`api/generate-script.js:45`, `api/title-from-hook.js:16-17`:
```js
const anonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_CsjOfTMg858rWr6IBo4YBA_Hm2bXTsP";
```

La anon key es pública por diseño (se expone en frontend), pero hardcodearla impide rotarla sin redeploy y aplana el modelo de "key viva sólo en env vars".

### M2. `vercel.json` sin headers de seguridad

Falta `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, CSP, `Referrer-Policy`. Riesgo de clickjacking, MIME sniffing, fugas via referer.

### M3. Falta refresh token rotation / logout completo robusto

Hay que verificar que `signOut()` corra siempre que el user cambia. Si Supabase está con detectSessionInUrl + persistSession default, queda OK, pero conviene blindar.

### M4. PII en logs server-side

Más allá del email del password reset, varios `console.log` en endpoints API pueden estar imprimiendo emails o IDs en logs de Vercel. Hay que peinar `api/*.js` y `dist/server/*.js` para eliminar PII.

---

## Severidad BAJA

### L1. `dist/` (build) versionado al lado del código

No es vulnerabilidad de runtime, pero `dist/` está en el repo. Si por error se commiteara, expone el bundle completo. Verificar `.gitignore` (cuando se inicialice el repo).

### L2. Warning de chunk size > 500 kB

Pre-existente, no es seguridad pero sí superficie de ataque más grande y peor caching. Code-splitting recomendado.

---

## Plan de remediación priorizado

### Sprint 1 (urgente — 1-2 días)

1. **Quitar el `ADMIN_PIN` hardcodeado** (`src/App.jsx:356`).
   - Reemplazarlo por verificación server-side: agregar un endpoint `/api/admin-verify` que reciba el PIN, lo compare contra una env var `ADMIN_PIN` (sólo server) y devuelva un token corto firmado.
   - O eliminarlo y obligar a Jose a usar la cuenta admin propia con `is_owner` global / flag DB `is_admin_global`.

2. **Migración SQL: cerrar las RLS críticas** — escribir `db/rls_hardening_v1.sql` que:
   - Para cada tabla con `company_id`, reemplazar `USING (true)` por una policy del tipo:
     ```sql
     USING (
       EXISTS (
         SELECT 1 FROM company_team_members ctm
         WHERE ctm.company_id = <tabla>.company_id
           AND ctm.auth_user_id = auth.uid()
       )
       OR auth.jwt() ->> 'role' = 'service_role'
     )
     ```
   - Eliminar todas las policies `TO anon` que tengan `USING (true)`.
   - Habilitar RLS en `company_tasks`, `company_token_usage`, `platform_feedback`.
   - **Probar en staging primero** — varios queries de la app pueden romperse si dependen de leer cross-tenant sin querer.

3. **Validar `companyId` en API endpoints** — middleware compartido en `api/_lib/auth.js`:
   ```js
   export async function assertMemberOfCompany(req, companyId) {
     const user = await getUserFromAuthHeader(req);
     const { data } = await sb.from("company_team_members")
       .select("id").eq("auth_user_id", user.id).eq("company_id", companyId).maybeSingle();
     if (!data) throw new Error("forbidden");
     return user;
   }
   ```
   Llamarlo en TODOS los endpoints que reciben `companyId` del body.

### Sprint 2 (importante — 3-5 días)

4. **Rate limit + CAPTCHA** en `/api/notify-password-reset` y endpoints públicos. Sacar el `console.log(email)`.
5. **Sacar la anon key hardcodeada** de `api/*.js`, dejarla sólo en env vars.
6. **Headers de seguridad** en `vercel.json`:
   ```json
   "headers": [{
     "source": "/(.*)",
     "headers": [
       { "key": "X-Frame-Options", "value": "DENY" },
       { "key": "X-Content-Type-Options", "value": "nosniff" },
       { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
       { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
     ]
   }]
   ```

### Sprint 3 (mejora — semana 2)

7. **Auditoría de PII en logs** — peinar `console.log` en `api/*.js`.
8. **`ilike` → `eq` con lower()** en lookups por email.
9. **Considerar CSP estricta** — empezar con `Content-Security-Policy-Report-Only` para ver qué inline scripts/styles usa la app, después endurecer.
10. **MFA opcional** para owners — Supabase Auth lo soporta nativamente.

---

## Apéndice — qué NO encontré (cosas que sí están bien)

- No hay `service_role` key expuesto en el frontend.
- No hay `eval()`, `new Function()`, `document.write` en `src/`.
- No hay `dangerouslySetInnerHTML` que tome input de usuario.
- No hay claves de Anthropic / Meta hardcodeadas en `src/` — viven en env vars del backend.
- No hay credenciales de DB en el frontend.
- El fix anterior (canManageWorkspace) no introdujo nada nuevo.
- El flujo de signup pide confirmación de email (default de Supabase).
- Las contraseñas las maneja Supabase Auth (no las tocás vos).
