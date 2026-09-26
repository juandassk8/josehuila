> ⚠️ **DOCUMENTO DESACTUALIZADO — 26 de julio de 2026**
>
> Desde que se escribió hubo **95 commits y +22.470 líneas**. No menciona la
> papelera de briefs, la sofisticación de mercado, la cadena de diagnóstico ni
> el banco de creativos, y varias cosas que da por pendientes ya se hicieron.
>
> **Para el estado real: [ESTADO.md](ESTADO.md).** Esto se conserva como
> historia de lo que se pensaba en julio, no como guía.

# Reporte: por qué a los clientes externos les faltan funciones

**Portal:** portal.josehuila.com (`inforce-app`)
**Fecha:** 2026-05-25
**Síntomas reportados (Jose):**

1. ❌ Cliente externo no puede **agregar productos**.
2. ❌ Cliente externo no ve **despliegue creativo** (o le falta funcionalidad ahí).
3. ❌ Cliente externo no ve la **proyección de creativos según ads** (scaling simulator).
4. ❌ Cliente externo no puede **crear nuevos conceptos creativos** ni **planear creativos**.
5. ❌ En general, "muchas funciones que me salen a mí" no le salen al cliente.

---

## 🎯 Causa raíz #1 (la grande): `isAdmin` mezcla "Jose admin global" con "owner del workspace"

El flag `isAdmin` se define **una sola vez** en `src/App.jsx`:

```js
// src/App.jsx:7694
const isAdmin = authMode === "admin";
```

Y `authMode === "admin"` **solo es `true` cuando vos (Jose) entrás con el PIN admin global** que ve todas las empresas. Cualquier persona que se inscribe vía signup público entra con `authMode === "client"` — para esa persona `isAdmin === false` **aunque sea owner de su propia empresa**.

Después ese `isAdmin` se pasa como prop a casi todos los componentes de workspace (`CompanyHome`, `CompanyTeam`, `CompanyGuiones`, `DespliegueCreativo`, `CompanyContentPipeline`, `CompanyAgenda`, `CompanyMemberProfile`, `CompanyTareas`, `CompanyWorkspace`) y se usa para **gatear features que los owners externos también necesitan**.

### Evidencia — features bloqueadas por este bug

#### A) Productos (síntoma 1) — `src/workspace/CompanyGuiones.jsx:71`

```jsx
<GuionesPage
  contentItems={contentItems}
  readOnly={!isAdmin}                  // ← Si no sos admin global, todo el panel de productos es read-only
  onOpenDespliegue={() => onNavigate?.("despliegue")}
  pipelineType={pipelineType}
/>
```

El botón "+ Agregar producto" vive en `ProductInfoPanel` y se renderiza dentro de `GuionesPage`; cuando `readOnly === true` el form de productos se oculta. Por eso el cliente **ve la sección pero no el botón para agregar**.

#### B) Scaling simulator / proyección de creativos (síntoma 3) — `src/despliegue/DespliegueCreativo.jsx:842-850`

```jsx
{isAdmin && onOpenBank && (
  <button onClick={onOpenBank} title="Importar del banco de creativos">📚</button>
)}
{isAdmin && (
  <button onClick={onOpenConfig} title="Configurar cadencia">⚙</button>
)}
{isAdmin && onOpenSimulator && (
  <button onClick={onOpenSimulator} title="Simulador de escala">🎯</button>     // ← Proyección de creativos según ads
)}
```

El cliente externo **nunca ve estos tres íconos** (banco de conceptos, configurar cadencia, simulador de escala) porque el render está condicionado a `isAdmin`.

#### C) Toggle Anuncios/Orgánico en despliegue — `DespliegueCreativo.jsx:858-864`

```jsx
{/* Toggle Anuncios / Orgánico — solo admin (workspace cliente NO
    recibe onPipelineTypeChange, siempre ve su tipo fijo). */}
{onPipelineTypeChange && (...)}
```

#### D) Otras features escondidas para cliente externo (en `src/App.jsx`, 40+ usos de `isAdmin`)

- Línea 7872, 7979: **"+ Nueva empresa"** (probablemente OK que no aparezca para cliente externo).
- Línea 7835, 7955: **Empresas archivadas** (OK).
- Línea 8637-8638: **"Editar cliente" / "Eliminar"** (OK).
- Línea 8648, 8655: **Mostrar credenciales / PIN** (OK).
- Línea 8079, 8125, 8495, 8784: **navegación de "Volver a Empresas"** (OK — cliente externo solo tiene su empresa).

**Las features de los puntos A, B, C son las que NO deberían depender de `isAdmin`** — deberían depender de si el usuario es owner/PM de **su propia** empresa.

### Hay un patrón correcto que ya se usa en otros lugares (modelo a seguir)

`src/workspace/CompanyHome.jsx:57`:

```js
const canShareClientLink = isAdmin || currentMember?.is_owner;
```

`src/workspace/CompanyTeam.jsx:162`:

```js
const canEditCard = isAdmin || isMyOwnCard;
```

Este es el patrón correcto. Es el que falta aplicar en `CompanyGuiones` (productos) y `DespliegueCreativo` (banco, simulador, cadencia).

---

## 🎯 Causa raíz #2 (silenciosa pero grave): fallback de signup que pierde `roles: ["owner"]`

`src/landing/auth_db.js:137-163` — `createOwnedCompany()`:

```js
const memberPayload = {
  company_id: company.id,
  name: user.email?.split("@")[0] || "Owner",
  email: user.email || null,
  is_owner: true,
  auth_user_id: user.id,
  roles: ["owner"],                    // ← Bien
};
const { data: member, error: mErr } = await supabase
  .from("company_team_members")
  .insert(memberPayload)
  .select()
  .single();
if (mErr) {
  // Fallback con "set mínimo" — pierde roles
  const { error: m2Err } = await supabase
    .from("company_team_members")
    .insert({
      company_id: company.id,
      name: memberPayload.name,
      email: memberPayload.email,
      is_owner: true,
      auth_user_id: user.id,
      // ❌ roles NO ESTÁ — se pierde "owner"
    });
```

Si el primer insert falla por cualquier razón (constraint, columna nueva en el cliente Supabase, RLS), el fallback inserta al miembro **sin `roles`**. Resultado:

- `member.is_owner === true` → `allowedNavForMember()` le devuelve todo el nav. **OK para navegación.**
- `member.roles === []` → `canCreateConceptCanvas(member)`, `canUseGuionista(member)`, `canManagePipeline(member)`, `canManageReports(member)` todos **devuelven `false`** salvo que pase por la rama `isFullAccess(member)` (que sí lo deja pasar porque `is_owner === true`).

> **Verificación importante**: revisá las tablas en producción. Si encontrás cuentas creadas via signup público con `is_owner = true` pero `roles = null` o `roles = []`, este fallback se disparó y hay miembros con permisos rotos por debajo de lo esperado.

---

## 🎯 Causa raíz #3 (riesgo, no bug directo): RLS muy permisivo

`db/team_members_schema.sql:31-36`:

```sql
CREATE POLICY "read company_team_members" ON company_team_members
  FOR SELECT USING (true);

CREATE POLICY "write company_team_members" ON company_team_members
  FOR ALL USING (true) WITH CHECK (true);
```

Otras tablas similares: `despliegue_concepts`, `creative_items`, `creative_deliveries`, `company_voice_profile`. Toda la seguridad está en la capa de aplicación. **No causa los síntomas que reportás**, pero implica que el día que alguien manipule directamente la API REST de Supabase puede leer/escribir datos de otras empresas. Aparte del fix de UX, vale arreglarlo.

---

## ✅ Fix concreto (orden recomendado)

### Fix 1 — Calcular `canManageWorkspace` upstream y usarlo donde hoy se usa `isAdmin` para gateos de owner

En `src/App.jsx`, justo después de la línea 7694:

```js
const isAdmin = authMode === "admin";
const isClient = authMode === "client";

// NUEVO: ¿puede gestionar este workspace como dueño?
// True para Jose (admin global) y para el owner real de la empresa actual.
// Esto desbloquea: agregar productos, scaling simulator, banco de conceptos,
// configurar cadencia, toggle anuncios/orgánico — features de gestión de la
// empresa actual, no de plataforma.
const canManageWorkspace =
  isAdmin || !!currentMember?.is_owner ||
  (Array.isArray(currentMember?.roles) && currentMember.roles.includes("project_manager"));
```

Después, en cada `<CompanyGuiones ... isAdmin={isAdmin}>` y `<DespliegueCreativo ... isAdmin={isAdmin}>` reemplazar el prop:

```diff
- <CompanyGuiones ... isAdmin={isAdmin} />
+ <CompanyGuiones ... isAdmin={canManageWorkspace} />

- <DespliegueCreativo ... isAdmin={isAdmin} />
+ <DespliegueCreativo ... isAdmin={canManageWorkspace} />
```

Líneas afectadas en `src/App.jsx` (renombrar el prop o, mejor, renombrar la variable interna del componente):
`8243, 8250, 8276, 8283, 8307, 8334, 8342, 8370, 8378, 8401, 8409, 8439, 8447, 8613`.

> **Más limpio**: renombrar la prop dentro de `CompanyGuiones`, `DespliegueCreativo`, `CompanyHome`, `CompanyTeam`, `CompanyAgenda`, `CompanyTareas`, `CompanyMemberProfile`, `CompanyContentPipeline`, `CompanyWorkspace` de `isAdmin` a `canManage` (o `isWorkspaceAdmin`) — pero el cambio mínimo es solo pasar el flag nuevo.

### Fix 2 — Mantener los gates de plataforma con `isAdmin` real

En `src/App.jsx`, **NO cambiar** los siguientes (son features que solo Jose debe ver):

- `+ Nueva empresa`, `Editar cliente`, `Eliminar`, `Mostrar credenciales/PIN`, `Empresas archivadas`, `← Empresas`, `otherCompanies={isAdmin ? appData.companies : accessibleCompanies}`.

### Fix 3 — Hacer el insert del owner idempotente

En `src/landing/auth_db.js`, reemplazar el bloque de `if (mErr)` por un upsert que siempre incluya `roles`:

```js
if (mErr) {
  // El primer insert puede fallar por columnas nuevas o por race con el wizard.
  // Reintentamos manteniendo roles explícitamente — sin esto los owners pierden
  // permisos en checks que NO miran is_owner (canCreateConceptCanvas, etc).
  const { error: m2Err } = await supabase
    .from("company_team_members")
    .upsert({
      company_id: company.id,
      name: memberPayload.name,
      email: memberPayload.email,
      is_owner: true,
      auth_user_id: user.id,
      roles: ["owner"],                              // ← ya no se pierde
    }, { onConflict: "company_id,auth_user_id" });   // ← idempotente
  if (m2Err) console.error("[createOwnedCompany] member insert failed:", m2Err);
}
```

(Asegurarse que exista el unique index `(company_id, auth_user_id)` en `company_team_members`. Si no existe, agregarlo en una migración.)

### Fix 4 — Backfill de cuentas existentes

Una query SQL en Supabase para reparar owners ya creados con `roles` vacío:

```sql
UPDATE company_team_members
SET roles = ARRAY['owner']
WHERE is_owner = true
  AND (roles IS NULL OR cardinality(roles) = 0);
```

Correrla una vez y verificar conteo afectado.

### Fix 5 (opcional pero recomendado) — Apretar RLS de Supabase

Reemplazar las policies abiertas de `company_team_members`, `despliegue_concepts`, `creative_items`, `creative_deliveries`, `company_voice_profile` por policies que filtren por `company_id` del JWT del usuario o por membership en `company_team_members`. Esto es trabajo aparte pero importante a mediano plazo.

---

## 🧪 Cómo verificar el fix

1. Aplicar Fixes 1 + 3 + 4.
2. Crear una cuenta de prueba nueva via signup público (`portal.josehuila.com/signup`).
3. Confirmar que esta cuenta:
   - ✅ Ve la sección **Productos** y puede **agregar un producto**.
   - ✅ En **Despliegue creativo** ve los íconos 📚 (banco), ⚙ (cadencia), 🎯 (simulador de escala).
   - ✅ Puede **crear un concepto nuevo** y **agregar variaciones**.
   - ✅ Ve el toggle Anuncios/Orgánico.
4. Confirmar que esta cuenta **NO** ve:
   - ❌ + Nueva empresa.
   - ❌ Editar cliente / Eliminar cliente.
   - ❌ PIN ni credenciales de otras empresas.
   - ❌ Otras empresas en el sidebar.

---

## Resumen

| # | Causa | Síntoma | Archivo |
|---|-------|---------|---------|
| 1 | `isAdmin = authMode === "admin"` se usa para gatear features de owner, no solo de plataforma | Productos, scaling simulator, banco, cadencia, toggle ads/organic invisibles para cliente externo | `src/App.jsx:7694`, `CompanyGuiones.jsx:71`, `DespliegueCreativo.jsx:842-850` |
| 2 | Fallback de signup omite `roles: ["owner"]` | Owners externos pueden quedar sin poder crear conceptos, usar guionista, gestionar pipeline | `src/landing/auth_db.js:153-161` |
| 3 | RLS Supabase abierto en tablas críticas | Riesgo de leak entre empresas vía API directa | `db/team_members_schema.sql:31-36` y otros |

Los **fixes 1 y 3** resuelven el 100% de los síntomas reportados. El **fix 4** repara las cuentas ya rotas. El **fix 5** es deuda técnica de seguridad.
