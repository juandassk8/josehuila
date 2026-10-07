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

La primera prueba desde el VPS obtuvo 29 anuncios y después Meta devolvió `1675004`; no terminó la paginación. Los 71 anuncios iniciales se importaron desde la captura previa mediante `ad-library-import-capture.mjs`, preservando la fecha de observación y registrando `collection_method=stored_capture`. El 26/09/2026, ya con proxies, las consultas LIVE terminaron completas: Bonapet 71, Peluna 266 y ProdentaCol 9. La versión de recuperación volvió a consultar ProdentaCol completa a las 22:12 UTC. No confundir aquellas capturas importadas con estas verificaciones en vivo.

Comprobaciones: `ad-library-queue-smoke.mjs` procesa un job temporal con deduplicación y reintento; `ad-library-integration-smoke.mjs` crea y elimina dos empresas de prueba para verificar límites de acceso e historial; `ad-library-ui-smoke.mjs` usa una cuenta temporal de lectura y comprueba la biblioteca en el navegador.

Antes de ampliar a 100 marcas o 500.000 anuncios hay que medir estabilidad, memoria del navegador, volumen real de medios y respaldo/restauración. Los resultados dependen de lo que Meta publique y permita cargar en cada consulta. El tiempo activo no demuestra ventas o rentabilidad. El descubrimiento con IA es una etapa posterior.

## Recuperación con proxy y navegador limpio

Desde el 26/09/2026, por instrucción del usuario, se sustituye la espera fija de
seis horas tras un límite de Meta:

1. Cada intento usa un proceso de Chrome nuevo y un contexto sin cookies ni
   almacenamiento local previo. Al finalizar se cierran contexto, navegador y
   puente SOCKS5. No se usa un perfil persistente ni cookies de usuarios.
   No se cargan imágenes, videos ni fuentes en esa página: el collector obtiene
   los anuncios de las respuestas de datos y el worker de medios archiva los
   originales. Esto reduce memoria y tráfico en catálogos largos; Lummia mostró
   un cierre por memoria al renderizar las vistas previas con el límite de 1.5 GiB.
2. Ante `META_RATE_LIMITED` o `META_PROXY_UNAVAILABLE`, se intenta el otro proxy
   configurado una vez, incluso si el primero entregó datos parciales. La consulta
   empieza de nuevo y deduplica por anuncio/versión antes de guardar. Un recorrido
   se declara completo únicamente si una salida termina la paginación.
3. El worker recuerda temporalmente qué proxy recibió el límite y lo omite en
   las siguientes marcas hasta que venza su pausa. En la versión del 26/09 ese
   estado era local al proceso; la etapa del 28/09 descrita abajo lo conserva en
   Redis y lo comparte con Scrapling. La pausa global también permanece en Redis.
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

El límite de memoria del collector se configura en `deploy/ad-library/.env`
(el archivo que Compose lee con `--env-file`), mediante
`ADLIB_WORKER_MEMORY_LIMIT`; por defecto sigue en `1536m`. En este VPS de 12 GB
se establece `4g` tras confirmar más de 10 GB disponibles y cierres `oom_kill`
durante Lummia incluso sin imágenes de vista previa. Esto limita memoria máxima,
no reserva 4 GB permanentemente. Comprobar memoria disponible antes de aumentar
este valor en otra instalación; no cambia los límites de medios o Redis.

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

## Etapa local del 28/09: coordinador y Scrapling opcional

Código preparado el 28/09 y **desplegado el 29/09**, con piloto desde el VPS.
`ADLIB_SCRAPLING_ENABLED=false` es el valor predeterminado. No se conectan todavía
ScrapeGraphAI ni Foreplay y no se consumen sus créditos.

El worker exige ahora un evento terminal con motor, página de Meta, país, filtro
de actividad y evidencia `pagination_end`. Un generador vacío o que termine sin
ese evento falla como `COLLECTION_INCOMPLETE`. La prueba se publica después de
cerrar el intento; solo entonces se concilian ausencias. Los anuncios válidos de
una consulta parcial se conservan. La importación de capturas existente emite su
propia evidencia `stored_capture`; esto no implementa el histórico de Foreplay.

El coordinador mantiene `meta_web` como identidad del catálogo aunque un intento
lo ejecute Scrapling. Deduplica anuncios/versión/estado entre intentos. Se puede
pasar al respaldo una vez si faltan datos de búsqueda, se estanca la paginación,
vence el tiempo de consulta o falta evidencia terminal. Un límite de Meta,
necesidad de login, cambio de esquema, proxy agotado o fallo de infraestructura
detiene esa secuencia. Cada motor conserva el máximo de 500 páginas y 15 minutos
por ruta; como hay hasta dos rutas por motor, el trabajo completo puede durar más.
BullMQ mantiene sus reintentos ordinarios; Scrapling no añade reintentos internos.

Las pausas de rutas se guardan en Redis mediante claves SHA-256 del servidor y
usuario del proxy, sin credenciales legibles. Los motores comparten el tiempo
restante y un reinicio no lo elimina. HTTP `Retry-After` válido prevalece sobre
la pausa configurable, incluso si pide más de una hora. La configuración de
15 minutos se utiliza cuando la fuente no proporciona ese plazo. Se mantiene
la frecuencia de consultas exitosas de 6/24 horas.

`services/scrapling` usa Python y Scrapling 0.4.15 con Patchright 1.62.1. Abre un
contexto nuevo por consulta; captura JSON inicial y respuestas GraphQL posteriores
al scroll. Node reutiliza el normalizador existente y verifica la página de Meta
y el final de paginación. El servicio solo escucha en `127.0.0.1:3081`, requiere
token y permite una consulta a la vez. No recibe credenciales de DB ni storage.
No acepta URLs de destino arbitrarias: Node envía ID de página, filtros, límites
y el proxy explícito. Los medios siguen en su cola independiente.
Si Node desconecta la consulta, el servicio cancela la captura y espera su
limpieza antes de liberar el turno para otra consulta.

### Preparación del piloto en Linux

1. Respaldar y aplicar `db/ad_library_collectors.sql` **antes de iniciar el nuevo
   worker**, incluso si Scrapling queda desactivado. El migrador existente descubre
   este archivo automáticamente. Refrescar el esquema de PostgREST. Añade
   `collector_attempts`, `collector_engine` y `completion_evidence` al registro de
   corridas; no cambia anuncios existentes.
2. Instalar el código/imagen nuevos del worker con el respaldo desactivado.
   Comprobar que la consulta ordinaria registra evidencia terminal y los intentos.
3. Generar un token privado aleatorio de al menos 32 caracteres. Guardar el mismo
   `ADLIB_SCRAPLING_TOKEN` en `/etc/inforce/ad-library.env` y en un archivo exclusivo
   `/etc/inforce/scrapling.env` con permisos 600. Este último contiene **solo ese
   token**; no reutilizar el archivo con claves de DB, R2 o de otros servicios.
4. Revisar RAM disponible y mantener **una sola instancia del worker de crawls**,
   con `ADLIB_WORKER_CONCURRENCY=1`. El arranque rechaza otra concurrencia cuando
   Scrapling está habilitado. El máximo del sidecar es 4 GiB; no reserva esa RAM.
   El coordinador cierra el navegador anterior antes de iniciar otro motor.
5. Construir/iniciar solo el sidecar opcional:

   ```sh
   docker compose -f deploy/ad-library/compose.yml --profile scrapling up -d --build scrapling
   ```

   No exponer el puerto 3081 en nginx ni en el firewall. El perfil está pensado
   para la red host del VPS Linux. Verificar salud y ejecutar primero la prueba
   offline de navegador dentro de esa imagen, montando `test_capture.py` en `/app`.
6. Para un piloto acotado, configurar `ADLIB_SCRAPLING_ENABLED=true` y
   `ADLIB_SCRAPLING_URL=http://127.0.0.1:3081` en el archivo privado del worker y
   recrear solo ese worker. Comprobar una marca pequeña y otra paginada mediante
   un entorno de prueba aislado. No provocar límites reales de Meta para activar
   el respaldo. Comparar IDs, medios, páginas, duración, memoria y evidencia final.

Reversión del respaldo: poner `ADLIB_SCRAPLING_ENABLED=false`, recrear el worker
y detener el sidecar cuando no tenga una consulta en curso. Conservar las nuevas
columnas y el registro de corridas; son compatibles con la versión anterior.
No borrar datos ni las pausas de Redis.

### Pruebas locales de esta etapa

```sh
npx vitest run api/_lib/adLibrary services/ad-library/worker.test.js
python -m unittest discover -s services/scrapling -v
SCRAPLING_BROWSER_TEST=1 python -m unittest discover -s services/scrapling -v
```

La última prueba requiere instalar `services/scrapling/requirements.txt` en un
entorno aislado y `python -m patchright install chromium`. Toda la navegación
de esa prueba se intercepta con datos sintéticos; no consulta Meta. En Windows
puede usarse `SCRAPLING_TEST_CHROME=1` para probar con el Chrome ya instalado.
Se comprobó lectura inicial + GraphQL tras scroll con Chrome en Windows. El
Chromium descargado no arrancó por una dependencia de Windows (`WinError 14001`);
no se modificó el sistema para resolverla. Docker no estaba iniciado localmente:
la construcción y el navegador del contenedor Linux quedan para el piloto.

El éxito de estas pruebas acredita transporte, validación y recuperación local;
no demuestra cobertura ni acceso sostenido a Meta. Los límites de autorización,
presupuesto y cobertura de los proveedores pagos siguen pendientes del piloto.

Verificación de esta entrega: 834 pruebas Vitest y 8 pruebas Node del servidor
aprobadas; 90 pruebas focales repetidas tras el ajuste final de cierre. Siete
pruebas Python sin navegador y la prueba con Chrome real aprobadas. También pasó
el smoke existente de cambio de proxy con dos navegadores y respuestas sintéticas.
Lint completo sin errores (492 advertencias existentes), lint de los JS nuevos
y modificados sin errores, build aprobado y Compose validado con el perfil
opcional. Hubo un timeout inicial en una prueba de OAuth al ejecutar varias
verificaciones a la vez; pasó aislada y en la repetición completa, sin modificarla.

### Activación y piloto en VPS del 29/09/2026

Activa: `/opt/inforce/releases/20260929-scrapling`. Worker
`inforce-ad-library:scrapling-coordinator` (`f9baab422279`), sidecar
`inforce-scrapling:0.4.15` (`a987a94950bb`). Scrapling está habilitado como respaldo
para los fallos recuperables definidos arriba; la ruta principal sigue siendo
`meta_web`. Una instancia del worker, concurrencia 1 y límite 4 GiB por motor.
Scheduler, Redis y media-worker conservaron sus contenedores.

La versión parte de `4d482b1` más los cambios locales de CODEX-010, **sin un nuevo
commit Git**. `PATCH_MANIFEST.json` y `SOURCE_MANIFEST.json` identifican el contenido
desplegado. No asumir que `origin/main` ya contiene esta entrega.
Respaldo: `/var/backups/inforce/scrapling-20260929T153612Z`, con dump y configuración.
La migración `ad_library_collectors.sql` fue aplicada y registrada; el backend
verificó acceso a las columnas nuevas antes de reanudar la cola.

Las ocho pruebas Python, incluido Chromium real y scroll, pasaron en Linux
`--network none`. También pasó el smoke del worker con dos navegadores y 429
sintético. El piloto real de Scrapling usó los proxies configurados y no escribió
en el catálogo: ProdentaCol 9 anuncios/1 página/8,7 s; Bonapet 42 anuncios/3 páginas/
15,3 s. Todos tenían medios identificados; el piloto no descargó ni archivó esos
medios. Los 42 de Bonapet coinciden con los activos del catálogo, que conserva 71
registros históricos en total. No implica cobertura histórica completa.

Una consulta ordinaria por la cola, ya con el worker nuevo, terminó ProdentaCol
con 9 anuncios y `collector_engine=meta_web` a las 15:39:22 UTC. Guardó los intentos
y la evidencia terminal; esta consulta sí actualizó el catálogo mediante el flujo
normal. Salud pública 200, MCP 401 esperado sin credenciales y cola reanudada con
un worker, sin TTL ni trabajos pendientes al terminar la verificación.

La etapa siguiente tiene un [cliente y piloto de ScrapeGraphAI](../../docs/ad-library-scrapegraph-pilot.md)
preparados **localmente**, con presupuesto persistente y validación de evidencia.
El usuario confirmó que todavía no tiene clave. No está incluido como respaldo
automático ni se ejecutaron llamadas de pago. Foreplay sigue pendiente.
