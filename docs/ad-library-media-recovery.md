# Recuperación de medios, 02/10/2026

Wei Nutrition tenía 32 anuncios registrados, pero ningún archivo asociado. Un
trabajo de video llevaba más de 3 h 45 min activo y bloqueaba la cola de medios
(un consumidor, 3371 trabajos pendientes). No era un error de reproducción del
navegador. Al repetir la lectura, el CDN respondió y el objeto ya existía en R2;
la operación original no había terminado de asociarlo en la base.

Se reinició solo media-worker, conservando sus trabajos y reintentos de BullMQ,
y se adelantaron sus 32 trabajos vigentes, sin duplicarlos. Los 32 quedaron
archivados (10 anuncios de video, 22 de imagen). La descarga global volvió a
avanzar; las miniaturas también pasan por la cola y pueden aparecer después.

`S3MediaStorage.put` tenía HEAD/PUT sin límite explícito. Ahora comparte un plazo
total de 90 segundos entre comprobación, escritura y reintentos del SDK; al vencer
aborta y devuelve `MEDIA_STORAGE_TIMEOUT`, conservando el archivo previo y los
reintentos ordinarios. `read` cancela también el cuerpo si se bloquea después de
recibir cabeceras. No cambia deduplicación, URLs privadas ni validación de medios.

Release activa y verificada el 06/10: `/opt/inforce/releases/20261002-media-timeout`. Imagen de medios
`inforce-ad-library:media-timeout-20261002`, separada mediante
`ADLIB_MEDIA_IMAGE_TAG` en el archivo privado de Compose. Si esa variable falta,
mantiene el comportamiento anterior con `ADLIB_IMAGE_TAG`. El despliegue no
requiere migración ni cambios visuales y conserva worker/scheduler/proxies.

Validación: 18 pruebas focales (almacenamiento, descarga, asociación, miniaturas y
API). Incluyen HEAD y PUT bloqueados, reutilización tras respuesta perdida,
rechazo de credenciales y cuerpo GET bloqueado. No hacer pruebas destructivas ni
vaciar la cola para recuperar un trabajo. Las consultas pendientes de Lummia son
un problema separado de esta recuperación de medios.

Comprobación 06/10: 32/32 anuncios de Wei con medios, cola vacía y sin errores. Chrome autenticado reprodujo un video 720×1280 de 61.1 s, sin errores de página. Sesión de prueba revocada.
