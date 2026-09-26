-- La huella del creativo, para dejar de pagar dos veces por el mismo anuncio.
--
-- El `ad_id` de Meta ya se dedupea bien: es 100% único en la bandeja. Lo que se
-- cuela es el MISMO video con distinto ad_id — una marca corre el mismo creativo
-- en varias campañas y Meta le da un id nuevo a cada una. Medido: 60 repetidos
-- en las últimas 600 importaciones.
--
-- El código ya calculaba la huella correcta (`marca|archivo`), pero solo la
-- comparaba DENTRO de la tanda que se estaba importando. Contra la base no había
-- con qué comparar, porque la URL original de fbcdn no se guardaba: guardamos
-- nuestro respaldo en Storage. Esta columna es ese "con qué".
--
-- Importa porque el análisis corre solo al importar: cada repetido que entra es
-- una descarga de video, un Whisper y un Claude tirados.
--
-- Idempotente.

alter table public.reference_inbox
  add column if not exists creative_key text;

-- El dedupe consulta por lotes de claves entrantes (`creative_key in (...)`).
create index if not exists reference_inbox_creative_key_idx
  on public.reference_inbox(creative_key)
  where creative_key is not null;

-- Backfill sin volver a scrapear: la URL original de fbcdn quedó guardada en
-- `ai_raw.video_url` aunque el archivo se haya rehospedado. Así el detector nace
-- sabiendo todo lo que ya se importó, en vez de empezar de cero.
--
-- La clave replica exactamente lo que hace `claveCreativo` en inboxDb.js:
-- marca en minúsculas + el nombre de archivo del video, sin el querystring
-- (fbcdn firma cada URL distinto, pero el nombre del archivo es estable).
--
-- Solo videos: para un estático la marca viene de la etiqueta y no del scrape,
-- así que se deja que lo calcule el código al importar.
update public.reference_inbox
set creative_key = lower(coalesce(suggested_labels->'marca'->>0, ''))
  || '|'
  || regexp_replace(split_part(ai_raw->>'video_url', '?', 1), '^.*/', '')
where creative_key is null
  and coalesce(ai_raw->>'video_url', '') <> ''
  and split_part(ai_raw->>'video_url', '?', 1) like '%/%';

-- PostgREST cachea el esquema: sin esto no ve la columna nueva.
notify pgrst, 'reload schema';
