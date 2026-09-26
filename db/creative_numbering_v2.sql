-- Fase 2.1: ajustes a la nomenclatura automática.
--
-- 1. creative_number solo se asigna cuando el slot entra a scripting (o más
--    adelante), NO cuando se crea como idea. Si una idea vuelve a scripting
--    después, el trigger la numera entonces.
-- 2. Backfill: limpia creative_number en slots que están en "idea" (evita que
--    al pasarlos después a scripting hereden un número viejo del backfill v1).
--
-- Idempotente. Correr en Supabase SQL Editor.

-- ───── 1. Reemplazar la función del trigger ─────
create or replace function public.assign_creative_number()
returns trigger language plpgsql as $$
declare cid text; maxn integer;
begin
  -- Si ya tiene número, lo respetamos.
  if new.creative_number is not null then
    return new;
  end if;

  -- Las ideas NO se numeran todavía. Al pasar a scripting/to_film/etc,
  -- el trigger vuelve a dispararse (por UPDATE) y asigna.
  if new.status = 'idea' then
    return new;
  end if;

  select company_id into cid
  from public.despliegue_boards
  where id = new.board_id;

  if cid is null then
    new.creative_number := 1;
    return new;
  end if;

  select coalesce(max(s.creative_number), 0) + 1 into maxn
  from public.despliegue_slots s
  join public.despliegue_boards b on b.id = s.board_id
  where b.company_id = cid;

  new.creative_number := maxn;
  return new;
end $$;

-- ───── 2. Reemplazar el trigger: ahora se dispara en INSERT y UPDATE ─────
drop trigger if exists trg_despliegue_slots_assign_creative_number
  on public.despliegue_slots;

create trigger trg_despliegue_slots_assign_creative_number
  before insert or update on public.despliegue_slots
  for each row execute function public.assign_creative_number();

-- ───── 3. Backfill: limpiar slots aún en "idea" ─────
-- Estos slots habían recibido número por el trigger v1 (BEFORE INSERT). Ahora
-- los reseteamos — cuando entren a scripting, recibirán el siguiente número
-- disponible (sin huecos ni adelantos).
update public.despliegue_slots
  set creative_number = null
  where status = 'idea' and creative_number is not null;

notify pgrst, 'reload schema';
