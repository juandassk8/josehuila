-- Libera company_scripts.format_id del FK a company_script_formats.
-- Ahora el campo apunta a despliegue_concepts.id (sin FK duro cross-module).
-- Los "formatos" del guionista son los conceptos del despliegue creativo —
-- son la misma cosa desde el punto de vista del cliente.

alter table public.company_scripts
  drop constraint if exists company_scripts_format_id_fkey;

-- Opcional: alias explícito `concept_id` para claridad en queries futuras.
-- Por ahora solo liberamos el FK; format_id sigue almacenando el UUID del
-- concepto seleccionado al guionizar.
