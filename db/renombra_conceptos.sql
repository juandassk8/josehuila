-- Los conceptos del banco pasan a llamarse como el catálogo.
--
-- `despliegue_concepts.name` traía la etapa pegada — «Venta (Tofu)»,
-- «Comparativo (Bofu)»— y errores de tipeo como «Podcats (Mofu)». Eso no es
-- solo feo en la grilla: el prompt de clasificación mostraba esos nombres como
-- «los formatos que ya existen, usá su nombre exacto», así que la IA los
-- copiaba y el catálogo curado perdía. Los conceptos volvían del análisis
-- llamándose «Venta (Tofu)» aunque el catálogo dijera «Venta».
--
-- La etapa ya vive en `stage`. Tenerla también dentro del nombre era duplicarla
-- en un lugar donde nadie la puede corregir.
--
-- NO se renombran los que chocarían: 50 filas donde el mismo tablero ya tenía
-- dos conceptos que colapsan al mismo nombre y etapa. Esos son duplicados
-- reales y hay que fusionarlos moviendo sus variaciones, que es otra operación.

create or replace function public.tax_concepto_canonico(nombre text)
returns text language sql stable as $$
  with base as (
    select public.tax_norm(regexp_replace(nombre, '\s*\(\s*(tofu|mofu|bofu|Tofu|Mofu|Bofu|TOFU|MOFU|BOFU)\s*\)\s*$', '')) as n
  )
  select coalesce(
    (select t.nombre from public.tax_conceptos t, base where public.tax_norm(t.nombre) = base.n),
    (select t2.nombre from public.tax_conceptos t2
       join public.tax_sinonimos s on s.eje = 'concepto' and s.hacia_slug = t2.slug, base
      where s.desde = base.n)
  )
$$;

with propuesto as (
  select c.id, c.board_id, c.stage, c.name,
         public.tax_concepto_canonico(c.name) as canonico
  from public.despliegue_concepts c
  where c.archived = false
),
choques as (
  select board_id, canonico, stage
  from propuesto where canonico is not null
  group by 1,2,3 having count(*) > 1
)
update public.despliegue_concepts c
set name = p.canonico
from propuesto p
where c.id = p.id
  and p.canonico is not null
  and p.canonico <> c.name
  and not exists (
    select 1 from choques ch
    where ch.board_id = p.board_id and ch.canonico = p.canonico
      and ch.stage is not distinct from p.stage
  );
