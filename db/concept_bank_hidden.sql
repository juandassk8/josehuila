-- Banco de creativos: flag para ocultar un concepto del banco SIN borrarlo
-- del despliegue de su empresa origen.
--
-- Casos de uso:
--   - Concepto duplicado / probado en banco
--   - Concepto que ya no es relevante como referencia cross-empresa
--   - Después de un merge, los origenes se ocultan automáticamente
--
-- La columna sigue siendo `false` por default → todos los conceptos existentes
-- aparecen en el banco como antes. El user excluye on-demand vía UI.
--
-- Idempotente — seguro de correr múltiples veces.

alter table public.despliegue_concepts
  add column if not exists bank_hidden boolean not null default false;

create index if not exists idx_despliegue_concepts_bank_hidden
  on public.despliegue_concepts (bank_hidden) where bank_hidden = false;

-- PostgREST necesita reload del schema para ver la columna nueva.
notify pgrst, 'reload schema';
