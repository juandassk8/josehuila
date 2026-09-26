-- =====================================================================
-- db/pipeline_papelera.sql — que un brief borrado se pueda recuperar
--
-- Hasta hoy, borrar un brief era un `delete` real, y el `on delete cascade`
-- de pipeline_slots se llevaba todos sus contenidos —guiones, referentes,
-- métricas— sin dejar rastro. Se verificó contra la base: de un brief
-- borrado no queda NADA. Ni slots sueltos, ni el link público, ni la tarea.
-- No hay de dónde reconstruirlo. La única vía era restaurar un backup
-- entero de Supabase, que devuelve la base al día anterior y pisa todo lo
-- que se hizo después.
--
-- Con esto, borrar pasa a ser marcar la fecha. La fila y sus slots quedan
-- intactos; solo dejan de mostrarse. Recuperar es poner la fecha en null.
--
-- Por qué una columna nueva y no la `archived` que ya está: `archived` no
-- la escribe nadie —solo se lee— y "archivado" y "borrado" no son lo mismo.
-- Además la fecha es la que hace falta para poder decir "borrado hace 3
-- días" en la papelera; un booleano no lo sabe.
--
-- No hay purga automática. Un brief en la papelera no molesta a nadie y no
-- ocupa nada; borrarlo de verdad es una decisión explícita desde la
-- papelera. Una limpieza automática sería exactamente el borrado en
-- silencio que este archivo viene a sacar.
--
-- Correr en el SQL Editor de Supabase. Idempotente.
-- =====================================================================

alter table pipeline_briefs add column if not exists deleted_at timestamptz;

-- Listar los briefs de una empresa separando vivos de papelera es la consulta
-- de cada carga del módulo.
create index if not exists pipeline_briefs_papelera_idx
  on pipeline_briefs (company_id, deleted_at);

-- Nada más. Las policies de RLS de pipeline_briefs ya cubren el update: quien
-- puede borrar un brief es quien puede editarlo, y borrar ahora ES un update.
