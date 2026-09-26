-- Estructuras de guion (frameworks de copy: PAS, AIDA, BAB, etc.)
-- company_id null → estructura global (compartida entre todas las empresas).
-- company_id != null → custom de esa empresa.
-- Idempotente.

create table if not exists public.company_script_structures (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  name text not null,
  description text,
  template text not null,
  steps jsonb default '[]'::jsonb,
  is_global boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_script_structures_company_idx
  on public.company_script_structures(company_id) where company_id is not null;
create index if not exists company_script_structures_global_idx
  on public.company_script_structures(is_global) where is_global = true;

alter table public.company_script_structures enable row level security;
drop policy if exists "all_script_structures" on public.company_script_structures;
create policy "all_script_structures" on public.company_script_structures
  for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.company_script_structures;
exception when duplicate_object then null; end $$;

drop trigger if exists company_script_structures_updated_at on public.company_script_structures;
create trigger company_script_structures_updated_at
  before update on public.company_script_structures
  for each row execute function public.set_updated_at();

-- Seed: 7 estructuras globales clásicas. Idempotente vía ON CONFLICT.
-- Usamos un valor sentinela en company_id ('__global__') para detectar
-- duplicados, pero la tabla guarda NULL. Por eso usamos un truco:
-- borramos las globales con estos nombres antes de insertar.
delete from public.company_script_structures
 where company_id is null
   and is_global = true
   and name in ('PAS', 'AIDA', 'BAB', 'Identificativo',
                'Hook + Promesa + Reveal',
                'Si tienes esto, además tienes esto',
                'Antes / Después / Cómo');

insert into public.company_script_structures (company_id, name, description, template, steps, is_global) values
(null, 'PAS', 'Problem · Agitate · Solution. Clásico que valida un dolor antes de vender.',
'Framework PAS:
1. PROBLEM — Identificá un dolor concreto del avatar (1-2 frases).
2. AGITATE — Profundizá en las consecuencias si no se resuelve. Hacelo sentir.
3. SOLUTION — Presentá el producto/servicio como la respuesta directa al dolor.

Cerrá con un CTA claro y específico. Tono empático en P y A; resuelve y confiado en S.',
'[{"label":"Problem"},{"label":"Agitate"},{"label":"Solution"}]'::jsonb, true),

(null, 'AIDA', 'Attention · Interest · Desire · Action. El más usado en ads de respuesta directa.',
'Framework AIDA:
1. ATTENTION — Hook impactante en los primeros 3 segundos. Frase corta, contraintuitiva o estadística.
2. INTEREST — Crea relevancia (pregunta, dato sorprendente, identificación con la situación del avatar).
3. DESIRE — Beneficios concretos + prueba (testimonio, antes/después, resultado medible).
4. ACTION — CTA específico, urgente y de bajo riesgo.',
'[{"label":"Attention"},{"label":"Interest"},{"label":"Desire"},{"label":"Action"}]'::jsonb, true),

(null, 'BAB', 'Before · After · Bridge. Perfecto para mostrar transformaciones.',
'Framework BAB:
1. BEFORE — Pintá el estado actual del avatar (problema vivido, frustración).
2. AFTER — Mostrá el estado deseado (cómo se ve la vida ya resuelto).
3. BRIDGE — El puente entre ambos: tu producto / método / sistema.

Tono storytelling, sentimientos primero. Cerrá con CTA suave hacia el bridge.',
'[{"label":"Before"},{"label":"After"},{"label":"Bridge"}]'::jsonb, true),

(null, 'Identificativo', 'Si te pasa X, este contenido es para vos. Filtra y conecta rápido.',
'Framework Identificativo:
1. IDENTIFICACIÓN — Abrí con "Si te pasa X..." o "Si sos Y que...". Filtra audiencia y crea identificación inmediata.
2. EMPATÍA — Reconocé el dolor/deseo en 1-2 frases (el avatar siente que lo entendés).
3. SOLUCIÓN — Presentá tu propuesta como la respuesta natural.
4. CTA — Cómo conseguirlo.

Tono conversacional, en segunda persona. Frases cortas, ritmo cercano.',
'[{"label":"Identificación"},{"label":"Empatía"},{"label":"Solución"},{"label":"CTA"}]'::jsonb, true),

(null, 'Hook + Promesa + Reveal', 'Frase impactante → qué prometo → cómo lo cumplo. Ideal para reels educativos.',
'Framework Hook + Promesa + Reveal:
1. HOOK — Frase cortante e impactante en los primeros 3 segundos. Ej: "Estoy a punto de revelarte X" / "El error que TODOS cometen con Y" / "Si haces esto, paras de Z".
2. PROMESA — Qué le vas a entregar al usuario por seguir mirando (claro, específico, valioso).
3. REVEAL — La explicación/educación que cumple la promesa. Sé generoso con info.
4. CTA suave al final (no agresivo).

Ritmo rápido, frases cortas, sin filler.',
'[{"label":"Hook"},{"label":"Promesa"},{"label":"Reveal"}]'::jsonb, true),

(null, 'Si tienes esto, además tienes esto', 'Listado encadenado de síntomas + diagnóstico común.',
'Framework Si-tienes-esto-también-tienes-esto:
1. APERTURA ENCADENADA — "Si te pasa X, también te pasa Y, también Z...". Lista 3-5 síntomas/características que filtran al avatar.
2. DIAGNÓSTICO — La causa común detrás de todos esos síntomas (insight valioso).
3. SOLUCIÓN — Tu producto resuelve la causa raíz, no los síntomas individuales.
4. CTA.

Útil para mostrar que entendés al avatar mejor que él mismo.',
'[{"label":"Apertura encadenada"},{"label":"Diagnóstico"},{"label":"Solución"},{"label":"CTA"}]'::jsonb, true),

(null, 'Antes / Después / Cómo', 'Comparativo storyteller. Después → Antes → Cómo, casi confesional.',
'Framework Antes/Después/Cómo:
1. ANTES — Cómo era la persona antes: situación dolorosa, intentos fallidos, frustración. Detalles específicos para que el avatar se identifique.
2. DESPUÉS — Cómo es ahora: el resultado deseable, vivido en presente. Pintá la nueva realidad.
3. CÓMO — El método/producto que lo hizo posible. Acá entra el CTA.

Tono storytelling, casi confesional. Funciona muy bien con UGC y testimoniales.',
'[{"label":"Antes"},{"label":"Después"},{"label":"Cómo"}]'::jsonb, true);

notify pgrst, 'reload schema';
