# Roadmap — Modelo de datos (publicar a Facebook + leer performance)

> **Estado: DISEÑO.** Este documento y `db/roadmap_foundations.sql` son las
> fundaciones de la capa de datos para dos capacidades futuras. El SQL es
> **aditivo** (solo crea tablas y agrega columnas, no toca datos existentes) y
> **idempotente**. **Nada está cableado al frontend todavía** — lo construye el
> dev del roadmap. Para Jose (dueño) + el dev que lo implemente.

## Qué habilita

1. **Publicar creativos como anuncios en Facebook/Meta.** Conectar la cuenta
   publicitaria de una empresa, publicar una variation como anuncio y trackear
   sus ids de FB + estado de publicación.
2. **Saber qué concepto/ángulo vende mejor.** Traer métricas diarias por anuncio
   (spend, compras, ROAS…) y poder agregarlas **por concepto** y **por ángulo**.

## Tablas y columnas

| Objeto | Tipo | Para qué |
|---|---|---|
| `meta_ad_accounts` | tabla nueva | Vincula una empresa con su cuenta Meta (ad_account_id, page_id, pixel_id) y guarda **una referencia** al token, no el token. |
| `despliegue_variations.fb_campaign_id / fb_adset_id / fb_ad_id / fb_creative_id` | columnas nuevas | Ids que devuelve Meta al publicar. `fb_ad_id` es la clave de join contra las métricas. |
| `despliegue_variations.publish_status` | columna nueva | `draft → queued → publishing → published / failed`. Default `draft`. |
| `despliegue_variations.published_at` | columna nueva | Cuándo se publicó. |
| `despliegue_variations.angle_id` | columna nueva (FK) | Ángulo **primario** de la variation → `creative_angles`. |
| `ad_publish_jobs` | tabla nueva | Una fila por intento de publicación (cola + auditoría): payload, resultado, error. |
| `creative_angles` | tabla nueva | Dimensión "ángulo" por empresa, con `norm_key` único por empresa. |
| `ad_metrics` | tabla nueva | **Tabla de hechos**, grano **diario** por anuncio. `UNIQUE (fb_ad_id, date)` para upsert. |

### Nota sobre el token (seguridad)

`meta_ad_accounts.token_secret_ref` guarda **una referencia** a un secreto
(id de Supabase Vault, nombre de env var, o clave en un gestor de secretos),
**nunca el access token en claro**. El backend resuelve el token real a partir
de esa referencia al momento de llamar a la Marketing API.

### Sobre `meta_ad_id` (columna vieja)

`despliegue_variations.meta_ad_id` ya existía muerta. La conservamos: al
publicar con éxito, el backend debe poblar `meta_ad_id = fb_ad_id` (mismo valor)
para no romper lecturas viejas. La **fuente de verdad nueva es `fb_ad_id`**.

## Por qué `angle_id` (un solo primario) y no join-table

- El ángulo hoy vive en `bank_labels->'angulo'` (jsonb). Agregar "mejor ángulo"
  sobre jsonb obliga a escanear/expandir arrays — lento y frágil.
- Modelarlo como **tabla referenciada** (`creative_angles`) hace que "agrupar por
  ángulo" sea un `JOIN` limpio e indexado.
- **Recomendación: un solo `angle_id` primario por variation** (más simple, y
  para "cuál ángulo vende mejor" se necesita un ángulo canónico por creativo).
  Los ángulos secundarios/legacy **siguen viviendo en `bank_labels`**, así no se
  pierde nada de lo ya etiquetado. Si en el futuro se necesita realmente
  many-to-many, se agrega una tabla `variation_angles (variation_id, angle_id)`
  sin tocar lo anterior.
- `creative_angles.norm_key` se calcula con el **mismo** `normLabel` de
  `src/despliegue/labels.js` (lowercase + NFD + acentos removidos + trim), para
  que "Ahorro", "ahorro" y "Áhorro" colapsen a la misma fila por empresa
  (`UNIQUE (company_id, norm_key)`).

## Flujo de publicación

```
draft ──(usuario da "publicar")──> queued
  │                                   │
  │                            (worker toma job)
  │                                   ▼
  │                              publishing ──(éxito)──> published
  │                                   │                    └─ setea fb_campaign_id,
  │                                   │                       fb_adset_id, fb_ad_id,
  │                                   │                       fb_creative_id, meta_ad_id=fb_ad_id,
  │                                   │                       published_at
  │                                (error)
  │                                   ▼
  └──────────────────────────────> failed  (ad_publish_jobs.error explica)
```

1. Se crea un `ad_publish_jobs` (status `queued`, `request_payload`) y la
   variation pasa a `publish_status = 'queued'`.
2. El worker lo toma (`running` / `publishing`), llama a la Marketing API usando
   el token resuelto de `meta_ad_accounts`.
3. Éxito → guarda los `fb_*` ids en la variation, `meta_ad_id = fb_ad_id`,
   `published_at = now()`, `publish_status = 'published'`, job `done` (con
   `result`). Error → `publish_status = 'failed'`, job `failed` (con `error`).

## Flujo de métricas

- Un cron diario pide los insights por anuncio a la Marketing API y hace
  **upsert** en `ad_metrics` con `ON CONFLICT (fb_ad_id, date)` (por eso el
  `UNIQUE`). Reprocesar un día es idempotente.
- `company_id` se guarda **denormalizado** en `ad_metrics` (y en
  `ad_publish_jobs`) porque `despliegue_variations` no tiene `company_id` propio;
  así la RLS scopea directo sin joins.
- Analítica: `ad_metrics.fb_ad_id → despliegue_variations.fb_ad_id`, y de ahí a
  `concept_id` (concepto) y `angle_id` (ángulo).

## Queries de ejemplo

**1. Top 5 ángulos por ROAS este mes (empresa `:company_id`):**

```sql
select a.name as angulo,
       sum(m.spend)   as spend,
       sum(m.revenue) as revenue,
       case when sum(m.spend) > 0 then sum(m.revenue) / sum(m.spend) end as roas
from ad_metrics m
join despliegue_variations v on v.fb_ad_id = m.fb_ad_id
join creative_angles a       on a.id = v.angle_id
where m.company_id = :company_id
  and m.date >= date_trunc('month', current_date)
group by a.name
order by roas desc nulls last
limit 5;
```

**2. Mejor concepto por empresa (ROAS del mes, un ganador por empresa):**

```sql
select distinct on (m.company_id)
       m.company_id,
       c.name as concepto,
       case when sum(m.spend) > 0 then sum(m.revenue) / sum(m.spend) end as roas
from ad_metrics m
join despliegue_variations v on v.fb_ad_id = m.fb_ad_id
join despliegue_concepts   c on c.id = v.concept_id
where m.date >= date_trunc('month', current_date)
group by m.company_id, c.id, c.name
order by m.company_id, roas desc nulls last;
```

**3. Anuncios publicados que aún no tienen métricas (cobertura del sync):**

```sql
select v.id, v.fb_ad_id, v.published_at
from despliegue_variations v
where v.publish_status = 'published'
  and v.fb_ad_id is not null
  and not exists (
    select 1 from ad_metrics m where m.fb_ad_id = v.fb_ad_id
  );
```

## Orden de migración

1. **Requisito previo:** `db/rls_hardening_v1.sql` ya corrido (define
   `is_team_admin()` y `accessible_company_ids()`, de los que dependen las
   políticas nuevas).
2. Correr `db/roadmap_foundations.sql` una vez (idempotente, se puede repetir).
   Crea las 4 tablas, agrega las columnas a `despliegue_variations`, aplica RLS
   tenant-scoped, triggers de `updated_at`, y hace `notify pgrst`.
3. No hay backfill destructivo: todo es aditivo. Poblar `angle_id` (desde
   `bank_labels->'angulo'`) y los `fb_*` es trabajo del dev del roadmap cuando
   cablee la UI y el backend.

## RLS

Todas las tablas nuevas siguen el patrón de `rls_hardening_v1.sql`: RLS activada
+ política `for all to authenticated` con
`is_team_admin() or company_id in (select accessible_company_ids())`. **Nunca**
`for all to anon using (true)`. Como todas las tablas nuevas tienen `company_id`
directo, el scope es directo (sin joins de policy).
