# Biblioteca de anuncios de Inforce

Se integra en **Creativos → Bibliotecas de anuncios**, tanto en el equipo como en el portal de la empresa. Reutiliza React/Vite, autenticación, API Node, PostgreSQL y PostgREST existentes. El collector público recorre una sola vez cada página, para todos los países disponibles, y comparte el catálogo; los seguimientos son privados por empresa.

## Recolección y almacenamiento

- `MetaWebCollector` es la fuente predeterminada (`ADLIB_COLLECTOR=meta_web`). Playwright lee los datos de búsqueda que la página pública de Meta entrega al navegador y avanza mediante scroll. No requiere el token de Meta ni las cookies del usuario. La API oficial sigue disponible como collector alternativo, con su cobertura limitada.
- La primera importación recorre todos los resultados disponibles; después de una corrida completa consulta activos. Los IDs y hashes evitan duplicar anuncios y versiones. La expiración de las firmas del CDN no crea versiones nuevas.
- Solo el fin explícito de la paginación confirma una corrida completa. Fallos, límites, cambios de formato o una página distinta no marcan anuncios ausentes. Se requieren dos recorridos completos sin observar un anuncio para pasar a `not_observed`, que no afirma una pausa confirmada por Meta.
- BullMQ ejecuta los crawls y las descargas de medios en colas separadas, con tres intentos y backoff exponencial. El scheduler consulta marcas únicas vencidas cada cinco minutos; programa seis horas si hubo cambios y 24 horas si no los hubo.
- El error de Meta `1675004` o HTTP 429 produce `META_RATE_LIMITED`. El collector
  cierra el navegador e intenta el siguiente proxy configurado, sin volver a
  emitir versiones de anuncios ya entregadas en esa consulta. Si se agotan las
  salidas, la pausa global es configurable y vale **15 minutos** por defecto.
  Las colas de medios siguen siendo independientes. Un error de GraphQL con HTTP
  200 tampoco se trata como éxito.
- Las descargas solo aceptan URLs de medios de Meta, validan DNS/redirecciones, firma del tipo de archivo y un máximo de 100 MiB por archivo. Se procesan de una en una. No se descargan las landing pages.
- R2 privado guarda los bytes por SHA-256; PostgreSQL guarda metadatos, versiones y referencias. Una fuente de medio ya archivada se reutiliza entre anuncios. Un trabajo obsoleto no puede reemplazar el creativo de una versión posterior.
- `S3MediaStorage` y `R2MediaStorage` implementan `put`, `signedRead` y `close`. `MEDIA_STORAGE_PROVIDER=s3` permite configurar otro endpoint mediante `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`.

## Despliegue

1. Guardar la configuración de [env.example](env.example) en `/etc/inforce/ad-library.env`, permisos 600, fuera del repositorio. El bucket es `inforce-ad-library-media`. Para el collector web no hace falta token de Meta.
2. Preparar un release, instalar dependencias con `npm ci --omit=dev --legacy-peer-deps` (el frontend ya compilado en `dist`), y construir la imagen del worker. `ioredis` es una dependencia explícita de producción. `activate-release.sh` respalda PostgreSQL, comprueba Redis con un job temporal, aplica migraciones, cambia el symlink y valida la API. Restaura el release anterior si falla la activación; las migraciones nuevas son aditivas.
3. Instalar `inforce-api-adlib.conf` como `/etc/systemd/system/inforce-api.service.d/ad-library.conf`. Recargar systemd y reiniciar la API después de una migración exitosa.
4. Ejecutar `docker compose -f deploy/ad-library/compose.yml up -d --build`. El proyecto tiene nombre fijo `inforce-ad-library`, independiente de la carpeta de cada release. Redis solo publica en `127.0.0.1:6379`.
5. Verificar `node scripts/r2-connectivity-smoke.mjs` con el archivo privado cargado, salud de los servicios y una marca real. Las URLs de R2 son temporales y se renuevan con **Actualizar resultados**.

Los workers usan el backend interno y su clave de servicio; ninguna credencial llega al frontend. Las tablas del catálogo tienen RLS cerrado al acceso directo de los usuarios. La API comprueba empresa, rol y seguimiento antes de listar o firmar medios.

## Operación y límites

`docker compose -f deploy/ad-library/compose.yml logs worker media-worker scheduler` muestra IDs y códigos de error; las corridas quedan en `ad_library_crawl_runs`. Para pausar la recolección, detener `worker`, `media-worker` y `scheduler`; el catálogo guardado sigue disponible.

El 25 de septiembre de 2026, la prueba local con Bonapet (`646751588512715`) terminó seis páginas, 71 anuncios únicos y 71 con medios identificados. El contador aproximado de la web mostraba 72. Esto valida esa corrida, no garantiza cobertura permanente ni todos los anuncios históricos de Meta.

La prueba desde el VPS obtuvo 29 anuncios y después Meta devolvió `1675004`; no terminó la paginación. Los 71 anuncios iniciales se importaron desde la captura previa mediante `ad-library-import-capture.mjs`, preservando la fecha de observación y registrando `collection_method=stored_capture`. La recolección automática del VPS aún necesita demostrar recorridos completos tras el período de espera. No confundir una captura importada con una consulta en vivo exitosa del servidor.

Comprobaciones: `ad-library-queue-smoke.mjs` procesa un job temporal con deduplicación y reintento; `ad-library-integration-smoke.mjs` crea y elimina dos empresas de prueba para verificar límites de acceso e historial; `ad-library-ui-smoke.mjs` usa una cuenta temporal de lectura y comprueba la biblioteca en el navegador.

Antes de ampliar a 100 marcas o 500.000 anuncios hay que medir estabilidad, memoria del navegador, volumen real de medios y respaldo/restauración. Los resultados dependen de lo que Meta publique y permita cargar en cada consulta. El tiempo activo no demuestra ventas o rentabilidad. El descubrimiento con IA es una etapa posterior.

## Recuperación con proxy y navegador limpio

Desde el 26/09/2026, por instrucción del usuario, se sustituye la espera fija de
seis horas tras un límite de Meta:

1. Cada intento usa un proceso de Chrome nuevo y un contexto sin cookies ni
   almacenamiento local previo. Al finalizar se cierran contexto, navegador y
   puente SOCKS5. No se usa un perfil persistente ni cookies de usuarios.
2. Ante `META_RATE_LIMITED` o `META_PROXY_UNAVAILABLE`, se intenta el otro proxy
   configurado una vez, incluso si el primero entregó datos parciales. La consulta
   empieza de nuevo y deduplica por anuncio/versión antes de guardar. Un recorrido
   se declara completo únicamente si una salida termina la paginación.
3. El worker recuerda temporalmente qué proxy recibió el límite y lo omite en
   las siguientes marcas hasta que venza su pausa. Este estado vive en memoria
   del worker; la pausa global al agotar las salidas se conserva en Redis.
4. Si ambas salidas están limitadas, el job conserva su lugar y reintenta cuando
   venza el intervalo restante. `ADLIB_RATE_LIMIT_COOLDOWN_SECONDS` acepta de 60 a
   3600 segundos; valores ausentes o inválidos usan 900. El próximo intento de la
   marca refleja ese mismo plazo. No se repiten proxies en un bucle continuo.
5. Errores de esquema, página incorrecta o necesidad de iniciar sesión detienen
   la consulta. Si hay proxies configurados, nunca se añade como alternativa la
   IP directa del VPS. Los logs no contienen direcciones ni credenciales de proxy.

La frecuencia ordinaria tras una consulta exitosa sigue siendo de seis horas
cuando hubo cambios y 24 horas cuando no los hubo. Esa frecuencia es distinta
de la pausa por limitación. Los reintentos ordinarios de errores de conexión
mantienen los tres intentos y el backoff existente de BullMQ.

Prueba de aceptación aislada, sin Meta, base de datos, Redis ni credenciales:

```sh
docker run --rm --network none --memory 1g --shm-size 256m \
  inforce-ad-library:proxy-failover \
  node scripts/ad-library-proxy-failover-smoke.mjs
```

Usa Chrome real con respuestas sintéticas: una página parcial seguida de 429,
respaldo con resultados repetidos, cookies y localStorage deliberadamente
creados en el primer navegador, y ambos proxies limitados. Comprueba limpieza,
cierre de navegadores, deduplicación y pausa acotada. No provoca bloqueos reales
de Meta para probar el mecanismo.


## Actualización de la biblioteca visual (referencia Foreplay)

Release: `/opt/inforce/releases/20260926-ad-workspace`.
La migración `db/ad_library_workspace.sql` añade consultas de analítica, guardados personales y metadata de miniaturas. El catálogo sigue privado; los RPC solo son ejecutables por el backend. El menú de Inforce se puede desplegar en móvil al entrar en esta sección.

El worker de medios procesa `preview-media` además de `archive-media`. FFmpeg está incluido en la imagen. Las miniaturas se guardan en el mismo storage por hash; el original se mantiene intacto. Para recuperar previews que falten, ejecutar `scripts/ad-library-preview-backfill.mjs` desde un contenedor de la imagen con las variables privadas del servicio, Redis y el directorio `scripts` montado. Se pagina por SHA y no se consulta Meta. Los fallos conservan hasta 100 jobs para diagnóstico; un administrador puede reintentarlos en BullMQ.

Las URLs firmadas duran diez minutos. El botón Actualizar resultados renueva los enlaces. La UI expone la antigüedad de la última observación y mantiene el aviso de rate limit de Meta. Los ganchos son texto del copy; no hay transcripción ni ROAS estimado.

Validación ampliada: `scripts/ad-library-integration-smoke.mjs` y `scripts/ad-library-ui-smoke.mjs`. Las cuentas temporales se eliminan al finalizar. La prueba UI usa el catálogo real de Bonapet; genera capturas en `/tmp/inforce-ad-library-checks` mediante el volumen `/checks`.

Esta versión reutiliza `node_modules` de la release anterior mediante un enlace. Conservar `/opt/inforce/releases/20260926-ad-library` mientras ese enlace siga vigente, o instalar las dependencias propias antes de limpiar versiones.

## Estado de importación por marca

La corrección del 25/26 de septiembre está en `/opt/inforce/releases/20260926-ad-import-status`. No requiere migración. `GET /api/ad-library?action=collection&companyId=…&brandId=…` combina el último crawl con el estado del job, la disponibilidad del worker y el TTL del límite global. Comprueba el acceso a la empresa y que siga la marca antes de leer su estado. No encola trabajos ni modifica el límite al consultar.

La interfaz distingue una primera importación en espera de una consulta completa sin resultados. Consulta el estado cada 10 segundos durante la ejecución, 15 segundos para jobs en cola/reintento y 60 segundos en los demás casos; pausa las consultas con la pestaña oculta. Actualiza el catálogo al cambiar el estado o el progreso, y mientras los archivos visibles estén pendientes. Un TTL que varía ligeramente no reinicia la paginación. El worker publica páginas y anuncios procesados en BullMQ. Los mensajes de seguir/sincronizar informan si no se logró encolar.

Diagnóstico de Peluna (`980804078453317`): el job existía en `waiting`, sin intentos ni corridas en PostgreSQL. La cola global mantenía la espera de la prueba previa de Meta hasta `2026-09-26T07:22:25Z` (02:22 de Colombia). La corrección preservó ese límite. Esa hora permite un nuevo intento; no garantiza que Meta entregue anuncios ni que el recorrido se complete.

La prueba de navegador comprueba ese estado real y simula después la llegada de un anuncio solo dentro del navegador para validar la actualización automática. Esa simulación no es evidencia de una consulta real a Meta ni escribe anuncios ficticios en el catálogo.

## Google Chrome en el recolector

La imagen instala Google Chrome estable mediante el CLI de Playwright y selecciona `PLAYWRIGHT_CHANNEL=chrome`. Conserva Chromium para las verificaciones existentes. El collector ya admite este canal; usa el Chrome instalado dentro de Docker, sin necesitar una ventana de escritorio en el VPS ni una sesión personal de Facebook.

`scripts/ad-library-browser-smoke.mjs` comprueba lanzamiento, DOM y JavaScript sin red externa. Su éxito solo verifica compatibilidad del navegador, no acceso a Meta. El cambio de navegador no elimina el límite global ni demuestra que el navegador anterior causara la restricción. Mantener el período de espera y evaluar el resultado de la siguiente consulta ordinaria.

Activación verificada el 25/26 de septiembre de 2026: imagen `inforce-ad-library:chrome-stable`, Chrome `154.0.8037.57`, canal `chrome`. Se recreó solo `worker`; Redis, scheduler y medios continuaron en sus contenedores. La etiqueta se fija en `deploy/ad-library/.env` del VPS (`ADLIB_IMAGE_TAG=chrome-stable`, sin secretos); los comandos operativos pueden especificar `docker compose --env-file deploy/ad-library/.env -f deploy/ad-library/compose.yml …`. La imagen previa se conserva con etiqueta `before-chrome` para reversión. La prueba offline pasó y la cola conservó sus dos jobs esperando con el TTL de Meta vigente.
