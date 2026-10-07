# Estado de esta instalación de Inforce

Referencia del código preparado para `https://github.com/juandassk8/josehuila`,
actualizada el 7 de octubre de 2026. Las observaciones del VPS de abajo son las últimas
verificaciones registradas, no una consulta de estado en tiempo real.

## Dónde empezar

- [Instalación PostgreSQL y API](../deploy/vps/README.md).
- [Biblioteca de anuncios, colas y storage](../deploy/ad-library/README.md).
- [Referencia visual de Foreplay](ad-library-reference-foreplay.md).
- [Colaboración entre Claude Code y Codex](colaboracion-agentes.md).
- [Panel de administración y proxies](admin-operations.md).
- [Marcas por URL y señales de creativos](ad-library-brand-signals.md).
- [Nueva interfaz y próximos módulos](nueva-interfaz.md).
- [Encargo vigente para Claude: Mapa creativo](encargo-claude-mapa-creativo.md).

## Universo de marca (07/10/2026)

Release desplegada `20261007-universo-marca`, desde `20261006-sidebar-selection`:
contexto manual de marca/público, productos con precio/oferta/fotos/documentos,
voz y gestión de conocimiento. Reutiliza backend y datos; añade contexto JSON,
versionado de documentos y almacenamiento de fotos privado por empresa. Ver
[contratos, permisos, pruebas y publicación](universo-de-marca.md). Mapa creativo
asignado a Claude mediante encargo compartido; no forma parte de esta publicación.

El usuario autorizó el 07/10 publicar en GitHub todos los cambios pendientes de
esta base, en la rama `codex/creative-mcp`, para sincronizar Claude. El encargo
completo y el contexto de la reunión están en `docs/encargo-claude-mapa-creativo.md`.
Los registros anteriores que dicen «sin commit/push» describen su momento de
entrega, no una restricción sobre esta publicación autorizada.

Validación antes de publicar la rama: 1045 pruebas Vitest aprobadas con
`--maxWorkers=2`, 11 pruebas Node y 7 Python. La prueba de navegador Scrapling
se omite localmente porque requiere su instalación específica. La primera
ejecución de Vitest, simultánea a build/lint y sin limitar workers, tuvo dos
fallos de temporización en pruebas existentes de cola y OAuth; el conjunto
completo pasó con concurrencia acotada, sin modificar esas pruebas. Build
aprobado y lint sin errores (492 advertencias existentes).

## Base de nueva interfaz (06/10/2026)

Nueva interfaz en `/nueva`, preparada como release `20261006-nueva-interfaz-v2`:
login único dentro de esa experiencia, Universo de marca (perfil, productos,
voz y documentos actuales), Biblioteca reutilizada y administración separada.
Mismo backend, sesiones, datos y permisos; sin SQL ni cambios de API/collector.
La interfaz anterior permanece disponible. Registro público y recuperación por
correo siguen sujetos a la configuración actual: cuenta habilitada por el
administrador y recuperación asistida. Las invitaciones multiusuario quedan
para la siguiente fase. Ver [alcance, pruebas y reversión](nueva-interfaz.md).

Agrupación por evidencia en `/opt/inforce/releases/20261006-brand-network`:
«Fanpages y dominios» muestra dominios exactos, páginas, cantidad de anuncios,
fechas y enlaces de prueba. El selector permite consultar agrupaciones y fanpages
individuales. Se agrupa solo por destinos observados o websites explícitos de
una Page verificada: varios dominios por fanpage o varias fanpages por dominio.
Un par aislado 1:1 no se une con otros; los nombres parecidos y los TLD distintos
no aportan evidencia. Destinos compartidos conocidos (WhatsApp, redes sociales,
acortadores, marketplaces) no unen marcas. Las relaciones históricas se conservan.
Las migraciones aditivas `ad_library_brand_network.sql` y
`ad_library_workspace_scope.sql` mantienen identidades/historial y permisos por
empresa. Worker y scheduler usan `brand-network-20261006`; media-worker no cambia.
No se habilita ScrapeGraphAI automático ni se hacen extracciones pagadas nuevas.
Ver [reglas y validación](ad-library-brand-signals.md#agrupación-por-fanpages-y-dominios-06102026).


Recuperación de solicitudes en `/opt/inforce/releases/20261006-brand-request-recovery`:
las identidades ya verificadas en el catálogo se resuelven antes de la cola de
consultas externas, incluso si Meta está en pausa. La interfaz distingue
«En espera» de «Identificando marca». El importador operativo de evidencia parcial
vincula la solicitud y su empresa de forma atómica, inserta solo anuncios nuevos,
conserva fechas y datos nativos y nunca confirma ausencia ni inventario completo.
Se validó en PostgreSQL aislado (permisos, empresa, cancelación, lease, rollback y
repetición). Capturas verificadas: Firulabs 29 anuncios/5 imágenes/24 videos sin
archivo; Bonapet GT 2 anuncios/2 videos sin archivo, página1200241039828235. El
dominio bonapet.net responde403 al VPS y sus enlaces sociales son placeholders;
el usuario confirmó su biblioteca. Se conserva separada de Bonapet Colombia.
El respaldo pagado automático continúa pendiente: guardar la clave y comprobar
saldo no activa consultas. Esta recuperación usa capturas revisadas explícitamente.

La entrega anterior fue `/opt/inforce/releases/20261006-scrapegraph-evidence`. Administración → APIs
permite guardar/reemplazar/quitar la clave de ScrapeGraphAI cifrada y comprobar
conexión/saldo. La clave fue añadida por el usuario después de publicar el panel.
Prueba real Firulabs: una petición de 6 créditos reservados terminó con timeout
del proveedor tras 55 s, sin datos; saldo final reportado 500 disponibles/0 usados.
La segunda prueba con el enlace directo de la página659211333932219 también
respondió504 a los55s; historial confirmó timeout sin resultado y saldo final500/0.
Después, la interfaz de ScrapeGraphAI sí completó el mismo enlace en 10 s con
Markdown, modo auto, sin stealth, scroll ni espera adicional. Su resultado
guardado contiene 29 IDs de anuncios frente a ~44 resultados anunciados, textos
y fechas, pero ninguna URL de video reproducible identificada. Saldo observado
499 disponibles/1 usado. Comparación mediante GET de historial, sin nueva
extracción ni importación. La diferencia de ajustes está confirmada; no se ha
aislado la causa exacta del timeout.

El ajuste posterior del piloto ya se validó desde el VPS: perfil automático sin
stealth, sin scroll ni espera adicional y Markdown (1 crédito previsto). Parser
de tarjetas visibles con fanpage confirmada: 29 anuncios normalizados y 5 JPEG
descargados/verificados, 24 videos todavía sin archivo. Se conserva evidencia
original privada para repetir el análisis sin pagar. No se confunden avatares
con creativos ni capturas parciales con inventarios completos. 51 pruebas focales
y lint aprobados. Variantes de scroll, renderizado y ficha individual tampoco
aportaron los videos; el modo fast falló. No hay importación al catálogo.
La ficha individual con diez segundos de espera también devolvió error de
reproducción. Presupuesto de esta tanda: 9 créditos reservados de un máximo de
20; no implica atribuir todos los movimientos del saldo compartido a la prueba.
No se habilitó el tercer respaldo automático. El piloto con presupuesto puede
usar la clave del panel con `--admin-key`. Ver [piloto y conexión](ad-library-scrapegraph-pilot.md).

R2 añadió el módulo `scripts/lib/pilotBudget.mjs` que faltaba en la release,
antes de ejecutar la petición pagada. 1333 huellas verificadas. No se reiniciaron
servicios ni se cambiaron datos del catálogo para el piloto. La validación del
panel original, descrita debajo, ocurrió antes de que se guardara la clave.

Migración aditiva `admin_scrapegraph.sql`, solo administradores, revisión
optimista, auditoría sin secretos; la comprobación de una clave anterior no
valida una nueva. Backup `/var/backups/inforce/scrapegraph-20261007T000431Z`
(06/10 en Colombia). Worker/scheduler conservan `proxy-requests-20261006` y medios
`media-timeout-20261002`; no se reiniciaron ni se pausaron las colas.

985 pruebas Vitest, 8 Node, lint 0 errores/492 advertencias heredadas y build.
SQL aislado aplicado dos veces: roles/RLS, revisión, invalidación, auditoría y
borrado. Chrome local con flujos simulados y producción autenticada: escritorio,
móvil y recarga, sin errores. API anónimo401/administrador200/cliente403;
sesiones temporales revocadas. 1332 huellas de release y 10 assets públicos
verificados; servicios activos, dos colas sin pausa. Sin commit/push.

### Entrega anterior de proxies y solicitudes persistentes

Activa `/opt/inforce/releases/20261006-proxy-requests`; worker/scheduler usan
`inforce-ad-library:proxy-requests-20261006` (4aea38a08862). Medios conserva
`inforce-ad-library:media-timeout-20261002`. API/data/nginx activos, ambas colas
reanudadas. Backup `/var/backups/inforce/proxy-requests-20261006T174252Z`.

Alta de marcas con solicitudes persistentes privadas por empresa y reintentos del
servidor, selección de fanpage si hay varias y autorresolución si hay una. Bonapet
está guardada en preparación: sus búsquedas anteriores fallaron al leer la web;
no se afirma que sus anuncios estén importados. Diagnósticos en Administración →
Solicitudes, sin errores de proveedor en el flujo de alta del cliente.

Prueba de proxy ampliada: IP de salida observada, país/región/ciudad aproximados,
ISP/ASN/zona horaria, protocolo, autenticación y TLS Meta separados. Resultado
real 06/10 12:42 Colombia: rutas 1/2 timeout; ruta3 conecta, salida mexicana;
ruta4 conecta, salida brasileña. Configuración preservada: revisión3, cuatro rutas.
Los resultados del panel son de la sesión, no se guardan al recargar.

970 pruebas Vitest y 8 Node, lint0errores/492warningsheredados, build aprobado.
SQL aislado aplicado dos veces: RLS/tenant, lease/recuperación, seguimiento atómico,
cancelación e idempotencia. Chrome local375/768/1440/light-dark y producción:
Bonapet persiste tras recargar, solicitudes internas y prueba real de proxy.
API: solicitudes anónimo401/admin200/empresaajena403; panelcliente403.
1281 archivos de release y92 por worker/scheduler comprobados; UI pública coincide
con build. Sin commit/push. La entrega anterior continúa abajo como historial.

### Entrega anterior de marcas por URL y señales

Activa `/opt/inforce/releases/20261006-brand-signals-r2`; worker/scheduler usan
`inforce-ad-library:brand-signals-20261006-r2` (92dc7b37efc4). Medios conserva
`inforce-ad-library:media-timeout-20261002`. Los estados de las secciones siguientes
son históricos y no deben usarse como la release actual.

Alta por URL web/fanpage/Ad Library con nombre público compartido. Resolución
asíncrona y caché de identidades conocidas; elección de fanpage cuando hay varias.
Nueva vista Señales: indicador relativo 0–100, evolución diaria UTC, antigüedad y
estados. La migración `db/ad_library_signals.sql` es aditiva. Solo guarda consultas
completas activas con orden solicitado comprobado; no hay datos históricos de
posición inventados ni estimaciones de ventas/ROAS. Método y límites en el enlace.

Diabeskin (706819455849348): 50 anuncios y sus 50 medios conservados. Meta limita
las consultas tras tres páginas (`META_RATE_LIMITED`); el tercer proxy funciona,
los dos primeros siguen agotando el tiempo. La web diabeskin.com.co responde 403
al servidor. Su enlace de biblioteca y fanpage por ID sí se reconocen desde el
catálogo, comprobado en la interfaz real. El piloto externo de nuevas identidades
y orden sigue sin confirmarse: al vencer la pausa, la lectura de fanpage devolvió META_RATE_LIMITED otra vez. La UI informa falta de
observaciones comparables. No se han retirado los límites ni reintentos.

Validación: 950 pruebas completas y 8 Node; 13 focales tras ajustar día UTC y
límites GraphQL en resolución. SQL aislado real, permisos API 401/403/200,
Chrome simulado y autenticado, 1230 hashes y 89 por worker/scheduler verificados.
La cola de medios quedó vacía; Wei32/32 disponibles y video real reproducido.
Snapshot local sin commit/push. Backup final previo a activación:
`/var/backups/inforce/brand-signals-20261006T164437Z`.

## Administración y proxies (02/10/2026)

Nueva sección `/equipo/administracion`, restringida a administradores activos:
resumen global, marcas, historial de consultas, ajustes de recolección y auditoría.
Worker/scheduler leen la configuración persistida y reportan señales sin secretos.
Activa en `/opt/inforce/releases/20261002-proxy-pool`, conservando el scraper
y sidecar Scrapling de la entrega anterior. Migraciones `admin_operations.sql` y
`admin_proxy_settings.sql` y `admin_proxy_pool.sql`. Pestaña Proxies: hasta diez conexiones HTTP o
SOCKS5 en orden (principal y respaldos), credenciales cifradas, prueba acotada, auditoría sin contraseñas y lectura
por cada nuevo trabajo. Worker y scheduler actualizados; pausas conservadas.
ScrapeGraphAI sigue pendiente de clave/piloto y Foreplay de integración.

Diagnóstico del 02/10: 2.541 anuncios conservados; los dos proxies existentes
aceptan autenticación pero deniegan conexiones (SOCKS REP=2) tanto a Meta como al
dominio de Inforce. El administrador debe reemplazarlos o resolver la restricción
con el proveedor. La última consulta completa fue el 30/09 a las 17:33 de Colombia.
Los recorridos largos de Lummia también registraron cierres de Chrome por memoria;
la gestión de proxies no soluciona por sí sola ese problema.

El producto usa React/Vite, API Node, autenticación propia, PostgreSQL/PostgREST,
Redis/BullMQ, Playwright con Google Chrome y Cloudflare R2. Los documentos raíz
`ARCHITECTURE.md`, `DEPLOY.md` y `ESTADO.md` describen la instalación anterior y
no deben usarse como instrucciones del VPS actual.

## Biblioteca de anuncios

Está integrada en Creativos, tanto para el equipo como para cada empresa. Incluye
biblioteca, duración, lanzamientos, destinos, ganchos del copy y guardados.
El catálogo se comparte por marca; el acceso a cada seguimiento es privado.

El collector público tiene límites reales. El 26/09/2026 se verificaron recorridos
LIVE completos desde el VPS: Peluna 266 anuncios, Bonapet 71 y ProdentaCol 9,
todos con medios archivados. Estas corridas reemplazan las primeras observaciones
parciales y la captura importada de Bonapet como evidencia de acceso en vivo.
No demuestran cobertura permanente de Meta ni capacidad para cualquier catálogo.

Release de esta entrega: `/opt/inforce/releases/20260926-proxy-recovery`.
Integra los ocho archivos de `claude/scraper` (`6303344`), MCP, el dominio y la
recuperación automática mediante el proxy de respaldo. `SOURCE_COMMIT` y
`SOURCE_MANIFEST.json` identifican sus archivos versionados. La configuración
activa de dominio en `/etc` se conserva y no se reinstala durante este cambio.
Conserva las dependencias de `/opt/inforce/releases/20260926-creative-mcp`;
no borrar esa release mientras el enlace `node_modules` siga usándola.
Worker usa `inforce-ad-library:proxy-failover-lite`; scheduler conserva
`inforce-ad-library:scraper-proxy` y media-worker `inforce-ad-library:local`. Los videos
y las imágenes van a R2 privado, deduplicados por SHA-256. No se versionan aquí.

Actualización de esta entrega: se integra `claude/scraper` y se amplía la
recuperación a límites de Meta, con navegador/contexto nuevo por intento y
deduplicación al reiniciar mediante el respaldo. La pausa fija por bloqueo de
seis horas se reemplaza por 15 minutos configurables, solo cuando se agotan las
salidas. Ver [operación y pruebas](../deploy/ad-library/README.md). Antes de
activar esta entrega, los tres recorridos LIVE de la versión de Claude terminaron:
ProdentaCol 9 anuncios, Bonapet 71 y Peluna 266 (245 anuncios nuevos en conjunto).
La versión inicial de recuperación volvió a consultar ProdentaCol completa en
8 segundos. La prueba de Lummia detectó un cierre de Chrome por falta de memoria
(`oom_kill` en el contenedor de 1.5 GiB); se omiten las imágenes de vista previa
en el navegador. El worker de medios sigue descargando los originales por separado.
Omitir imágenes permitió avanzar hasta 476 anuncios, pero no bastó para Lummia.
El VPS dispone de 12 GB; se amplía el máximo del collector a 4 GB mediante
`ADLIB_WORKER_MEMORY_LIMIT=4g`, conservando los límites de los otros contenedores.

## Despliegue del 29/09: respaldo Scrapling

Etapa posterior a la release histórica indicada arriba, ahora activa en
`/opt/inforce/releases/20260929-scrapling`.
El coordinador exige evidencia explícita de paginación completa, registra cada
motor intentado y comparte las pausas de proxies en Redis. Se preparó un servicio
Scrapling opcional y privado; el respaldo está **habilitado en este VPS** y sigue
desactivado por defecto para nuevas instalaciones. Conserva
el catálogo, el normalizador, las colas de medios y la frecuencia de 6/24 horas.

Se aplicó `db/ad_library_collectors.sql`. El piloto Linux de Scrapling terminó
ProdentaCol (9 anuncios) y Bonapet (42 anuncios, 3 páginas), con medios identificados
y sin escribir al catálogo. Tras activar, una consulta ordinaria de ProdentaCol
por `meta_web` terminó con 9 anuncios y evidencia registrada. Ver [respaldo,
imágenes, verificación y reversión](../deploy/ad-library/README.md#activación-y-piloto-en-vps-del-29092026).
No demuestra acceso sostenido ni cobertura histórica total. El código desplegado
es `4d482b1` más el snapshot local identificado por los manifiestos; no se hizo
commit ni push de esta entrega.

La siguiente fase, [piloto ScrapeGraphAI](ad-library-scrapegraph-pilot.md), está
implementada y probada localmente con respuestas simuladas. Incluye consulta de
saldo, presupuesto persistente y validación de anuncios basada en JSON de Meta.
El usuario aún no tiene clave: no se activó como tercer motor ni se hicieron
llamadas pagas. El histórico único de Foreplay continúa pendiente.

## Creación de imágenes: prueba MCP

Creativos → Crear imágenes permite preparar la conexión de cada usuario de
ChatGPT a una empresa y consultar las imágenes recibidas. Incluye OAuth,
referencias guardadas, productos y recepción de archivos en R2 privado.
El conector está activo; falta probar la generación nativa y la devolución del
archivo con una cuenta Pro real. Inforce no invoca la suscripción como una API.
Ver [alcance, pruebas y conexión](creative-images-mcp.md).

La entrega MCP y el scraper de Claude forman parte de esta base de código.
Consultar también cambios posteriores en la bitácora antes de desplegar. Actualizar las ramas de
trabajo desde `origin/main` y consultar la bitácora compartida antes de desplegar
trabajo de otro agente. La entrega móvil de Claude se mantiene en su propia rama
hasta corregir y revisar el hallazgo pendiente.

URL pública: https://inforceconsulting.online/equipo. El MCP usa
`https://inforceconsulting.online/api/creative-mcp`. HTTPS y descubrimiento OAuth
verificados desde fuera del VPS; falta la autorización real desde la cuenta Pro.

## Límites y pendientes

- Falta demostrar recorridos completos sostenidos desde el VPS y medir capacidad
  antes de afirmar soporte operativo para 100 marcas/500.000 anuncios.
- Recomendaciones por nicho e IA para sugerencias creativas son una etapa futura.
- `scripts/ad-library-ui-smoke.mjs` contiene una expectativa histórica de Peluna
  sin anuncios. Ajustar la prueba a una fixture aislada antes de reutilizarla;
  ahora Peluna sí tiene una consulta completa.
- `npm run dev` sirve Vite y los handlers de `/api`; no inicia PostgreSQL,
  PostgREST, autenticación, Redis ni workers. El frontend usa `/backend` por
  defecto. El acceso a datos necesita un backend de desarrollo configurado.
- El plugin local `devApi.js` puede leer `.env.prod`; no copiar configuración
  de producción a un entorno de pruebas. Las credenciales quedan fuera de Git.
- Los scripts de migración, pruebas de integración y despliegue pueden escribir
  datos. Leer su alcance y utilizar un entorno apropiado antes de ejecutarlos.

Los reportes redactados se conservan en `security/*.md`; capturas, resultados
crudos y archivos comprimidos de diagnóstico permanecen locales.
