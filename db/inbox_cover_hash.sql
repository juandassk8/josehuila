-- Huella de la portada: dedupe por IMAGEN, no por dirección.
--
-- El problema, medido: de un scrape de 8 anuncios, 5 eran el mismo creativo con
-- la misma portada, y los 5 se transcribieron y clasificaron por separado. Cinco
-- veces Whisper, cinco veces Claude, para un solo video.
--
-- Por qué el dedupe existente no los agarra: al importar, cada portada se baja de
-- fbcdn y se sube a nuestro Storage con un nombre único hecho con la hora y un
-- aleatorio. La MISMA imagen bajada cinco veces queda con cinco direcciones
-- distintas. Comparar `cover_url` después de eso no puede funcionar — de hecho,
-- una consulta de portadas repetidas en la bandeja devuelve cero grupos, y no
-- porque no haya repetidos.
--
-- `creative_key` (marca|nombre-de-archivo del video) tampoco alcanza: Meta sirve
-- el mismo video con nombres distintos según la campaña, y los anuncios de solo
-- imagen no tienen video del que sacar el nombre.
--
-- La huella se calcula sobre los BYTES de la imagen, en el momento en que ya la
-- tenemos en memoria para subirla. Cuesta cero pedir nada de más.
--
-- Idempotente. Correr en el SQL Editor de Supabase.

alter table public.reference_inbox
  add column if not exists cover_hash text;

comment on column public.reference_inbox.cover_hash is
  'SHA-256 de los bytes de la portada original. Dedupe por imagen: la misma portada bajada N veces da N URLs distintas pero un solo hash.';

-- El dedupe consulta por lotes de huellas entrantes (`cover_hash in (...)`).
create index if not exists reference_inbox_cover_hash_idx
  on public.reference_inbox(cover_hash)
  where cover_hash is not null;

-- Mismo campo en el banco, para no reimportar al banco algo que ya está.
alter table public.despliegue_variations
  add column if not exists cover_hash text;

create index if not exists despliegue_variations_cover_hash_idx
  on public.despliegue_variations(cover_hash)
  where cover_hash is not null;

notify pgrst, 'reload schema';
