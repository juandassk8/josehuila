# Administración de Inforce

Panel y gestión de proxies publicados el 02/10/2026.
Release: `/opt/inforce/releases/20261002-proxy-pool`.
API, worker y scheduler admiten hasta diez conexiones ordenadas.
Ruta: `/equipo/administracion`, menú **Sistema → Administración**.

## Alcance

- Resumen global de empresas, integrantes activos, marcas, anuncios, archivos y consultas de las últimas 24 horas.
- Marcas con búsqueda por nombre/ID, filtro de atención, paginación, totales, empresas que las siguen, última consulta completa y siguiente fecha prevista.
- Solicitud manual de consulta mediante la cola existente. Conserva deduplicación, prioridad y límites del proveedor.
- Historial de consultas: estado, páginas, anuncios, cambios, motor e intentos; una consulta parcial nunca confirma ausencias.
- Configuración persistente: habilitar/pausar recolección, habilitar el respaldo Scrapling e intervalos según haya cambios, no haya cambios o falle una consulta.
- Actividad administrativa: responsable, momento y valores anteriores/nuevos. Consultas manuales registradas antes de enviarlas a la cola; si el envío no se confirma, se indica explícitamente.
- Estado de las colas de consultas/medios, señales del worker/programador y proxies principal/respaldo sin direcciones ni credenciales.

Los totales del catálogo son globales, no la suma de cada empresa. Los activos son
el estado de la última observación, no una medición en vivo. El espacio mostrado
suma archivos originales únicos registrados; no equivale a la factura de R2 ni al
uso de disco del VPS. Los medios pendientes incluyen los que registraron un error.

## Acceso y almacenamiento

`api/admin-operations.js` exige `requireTeamAdmin` para **todas** sus acciones.
No basta ser gestor de empresa, editor o tener un `access_override`. El menú y
la ruta aplican el mismo criterio, incluidos administradores desactivados.

`db/admin_operations.sql` agrega dos tablas y cuatro funciones. Tablas con RLS,
sin permisos para `anon`/`authenticated`; funciones solo `service_role`. La función
de escritura vuelve a comprobar que el actor autenticado sea administrador activo.

La actualización de configuración bloquea la fila y compara `revision` dentro de
una transacción junto con la auditoría. Un conflicto responde HTTP 409; el panel
conserva el borrador y permite recargar. No se aceptan campos desconocidos,
credenciales, decimales o intervalos fuera de rango.

La pestaña **Proxies** permite sustituir la conexión principal y el respaldo.
Se presenta como tabla con búsqueda, selección, DSN sin credenciales, uso,
estado, última comprobación y acciones. Agregar/editar abre un diálogo; eliminar
el respaldo exige confirmación y el principal sigue siendo obligatorio. El
contrato admite diez conexiones: un principal obligatorio y hasta nueve respaldos. La selección
múltiple comprueba secuencialmente y espera el intervalo de 15 segundos entre
peticiones. «Limpiar resultados» solo borra resultados de esta sesión en la
pantalla, no modifica conexiones ni pausas. Las comprobaciones no persisten al
recargar la página y muestran IP de salida, país, región/ciudad aproximadas, ISP, organización, ASN y zona horaria cuando el proveedor de diagnóstico responde.
Cada conexión tiene un identificador estable: eliminar un respaldo intermedio
conserva las credenciales de los demás, aunque cambie su número en la tabla.
Las dos conexiones antiguas se leen sin recifrar ni cambiar su configuración.
Solo admite proxies públicos HTTP/SOCKS5, con IPv4 o nombre que resuelva a IPv4
pública. Las credenciales se introducen por separado; no se aceptan en la URL.
Cada conexión puede conservar sus credenciales, reemplazarlas o quitar la
autenticación. Cambiar de servidor exige elegir de nuevo la autenticación para
evitar enviar una contraseña anterior a otro destino.

`admin_proxy_settings.sql` almacena la configuración cifrada con AES-256-GCM.
La clave `ADLIB_PROXY_ENCRYPTION_KEY` (32 bytes, hex) se conserva fuera de la base
en el entorno privado de API/worker y debe respaldarse junto con la base. No
rotarla sin recifrar las filas existentes. Contraseñas y usuarios no vuelven al
navegador ni se incluyen en auditorías; solo servidor, presencia de credenciales
y revisión. Todas las lecturas y acciones requieren administrador activo.
La escritura compara la revisión y registra la auditoría en una transacción.

**Probar conexión** verifica dos destinos fijos por el proxy, en paralelo:
TLS con `www.facebook.com:443` y una respuesta HTTPS de `ipwho.is`. La segunda
conexión obtiene su IP pública de salida y ubicación aproximada, ISP, organización,
ASN y zona horaria. No se confunde el servidor configurado con la salida observada.
El protocolo configurado (HTTP o SOCKS5) y la autenticación (usuario/contraseña o
sin credenciales) se muestran aparte de la verificación HTTPS hacia Meta.

Máximo 10 segundos por destino; respuesta JSON limitada a 32 KB, sin redirecciones,
certificados TLS verificados y campos permitidos. DNS del proxy se valida y fija a
una IPv4 pública. Las credenciales solo se envían al proxy, nunca al servicio de
ubicación. No se aceptan destinos arbitrarios. Una prueba correcta no garantiza
la extracción de anuncios. Si la ubicación falla, se conserva el resultado de Meta
sin inventar país ni IP. Rotar la salida puede cambiar el resultado entre conexiones.

[Documentación del proveedor de ubicación](https://ipwhois.io/documentation):
se usa su endpoint HTTPS gratuito, sin clave ni suscripción añadida. El resultado
no identifica por sí mismo si una IP es residencial, ni su reputación. Una prueba
por administrador cada 15 segundos; las pruebas de lista son secuenciales. No guarda
el borrador. Resultados y fecha se conservan en esta sesión de pantalla, no en DB;
recargar exige comprobar de nuevo para tener datos actuales.

Administración → **Solicitudes** muestra hasta 500 enlaces pendientes por empresa,
intentos, último diagnóstico sanitizado y siguiente intento. El cliente solo ve
que su biblioteca está en preparación. La cola durable está documentada en
[Marcas por URL](ad-library-brand-signals.md).

## Aplicación de los ajustes

Valores iniciales: recolección habilitada, 6 horas con cambios, 24 sin cambios,
6 tras un error ordinario, respaldo Scrapling permitido. El respaldo **también**
requiere `ADLIB_SCRAPLING_ENABLED=true`, URL/token y servicio en el servidor.
El panel no habilita por sí solo una infraestructura ausente.

- Worker: lee ajustes antes de cada trabajo. Una consulta en curso termina con
  su versión inicial. Si está pausado, conserva el trabajo mediante el limitador
  de BullMQ por 30 s, sin consumir reintentos ni consultar Meta.
- Proxies: ambos motores reciben las conexiones guardadas al empezar el trabajo.
  No hace falta reiniciar; no se borran pausas del proveedor. Si la configuración
  cifrada no puede leerse, falla cerrado, sin usar la salida directa ni las
  credenciales antiguas. Antes del primer guardado se admite la configuración
  heredada del entorno. El despliegue inicial importa y cifra las conexiones
  existentes, sin probarlas ni sustituirlas.
- Scheduler: lee ajustes antes de cada ciclo (5 min). Pausado no agrega trabajos.
- Pausar no elimina trabajos/datos ni interrumpe la descarga de medios.
- Al reanudar, puede quedar hasta 30 s de pausa interna, o una espera mayor que
  hubiera indicado el proveedor. Ninguna acción borra los límites de Meta/proxies.
- Los intervalos se aplican al finalizar la próxima consulta; no reescriben
  `next_crawl_at` existente ni el backoff de intentos de un mismo trabajo.
- Worker/programador publican una señal cada 30 s con TTL de 90 s en Redis.
  «Lee versión N» confirma lectura de configuración, no finalización de un crawl
  ni validación externa de un proxy. El panel se actualiza cada 30 s mientras está visible.
- Si faltan la tabla/configuración o la base, worker y scheduler fallan cerrados.
  No vuelven silenciosamente a valores por defecto que pudieran anular una pausa.
- La biblioteca reconoce la pausa administrativa sin atribuírsela a Meta.

ScrapeGraphAI permite configurar y comprobar la clave en Administración → APIs;
el piloto de anuncios sigue separado, pendiente de clave y presupuesto;
no hay llamadas pagas desde el panel. Foreplay figura como integración pendiente.
Este panel no administra cuentas de proveedores, facturación ni claves de otras integraciones.

## Despliegue y recuperación

1. Preparar una release que conserve el snapshot de Scrapling ya publicado y los
   cambios locales previos. No desplegar el `main` antiguo por encima del VPS.
2. Respaldar datos/configuración y aplicar `db/admin_operations.sql` después de
   `ad_library_collectors.sql`, seguido de `db/admin_proxy_settings.sql`; verificar
   que PostgREST recargó el esquema. Crear una clave de cifrado privada y compartirla
   entre API/worker; importar las rutas del entorno antes de activar la release.
3. Publicar API y frontend compilado. La API necesita el `ADLIB_REDIS_URL` privado
   existente para consultar la cola y `ADLIB_PROXY_ENCRYPTION_KEY` para los proxies.
4. Publicar y recrear **worker y scheduler** con estos archivos (no solo el worker).
   Conservar Scrapling, Redis y media-worker. Esperar trabajos activos antes del cambio.
5. Verificar acceso 401/403, administrador real, conteos, heartbeat de ambos procesos,
   igualdad de revisiones y configuración 6/24/6. Los pilotos locales no acreditan
   la integración con los servicios de producción hasta realizar estas comprobaciones.
6. Reversión: conservar las tablas aditivas. Volver a la API/frontend/imágenes anteriores.
   Un worker viejo no lee la pausa administrativa: si se revierte estando pausado,
   mantener la cola de BullMQ pausada hasta una reanudación operativa explícita.

## Pruebas

- 881 pruebas Vitest aprobadas, 8 del adaptador/seguridad Node. Al compartir recursos
  con build/Chrome fallaron pruebas existentes sensibles al tiempo (discovery OAuth
  y espera del script queue). La suite final pasó completa con
  `node node_modules/vitest/vitest.mjs run --maxWorkers 1`, sin modificar esas pruebas.
- Migración ejecutada dos veces en PostgreSQL real **temporal y separado**: datos
  sintéticos, restricciones, permisos de tablas/funciones, concurrencia optimista,
  auditoría atómica, agregado sin duplicar seguimientos y paginación comprobados.
  Script de aserciones: `scripts/admin-operations-db-smoke.sql`; nunca usarlo con
  una base que contenga datos reales. El proceso temporal se detiene al terminar.
- Chrome local con datos simulados: resumen, búsqueda/vacío, consulta manual,
  historial, validación, guardar, conflicto de revisión, actividad, modo oscuro,
  móvil con menú real de Inforce y acceso denegado. Sin errores de consola.
- Lint: 0 errores; 492 advertencias preexistentes. Build aprobado.
- Vistas previas y resultados locales ignorados por Git en `.backups/admin-preview/`.

## Proxies y validación del 02/10/2026

Se incorporó el panel al VPS junto con la gestión de proxies. Se conservan las
conexiones anteriores (actualmente denegadas por el proveedor) para que el
administrador pueda reemplazarlas. No se compraron proxies ni se cambió a salida
directa. ScrapeGraphAI y Foreplay continúan pendientes.

914 pruebas unitarias y 8 del servidor aprobadas antes del despliegue; PostgreSQL
temporal comprobó cifrado en el contrato, ausencia de secretos en auditoría,
permisos, validación y conflictos sin alterar la base real. Chrome: escritorio,
móvil, guardado de ambas conexiones, contraseña oculta, denegación, conflicto,
recarga y bloqueo del editor. Pruebas adicionales cubren la conexión explícita
de Redis: BullMQ 6 ya no expone `queue.client` ni `worker.client`; señales,
pruebas de proxy y pausas compartidas usan `commandsRedis()`.

El despliegue conserva copias de la base y configuración en
`/var/backups/inforce/admin-proxies-20261002T143210Z`. La clave de cifrado vive
en `/etc/inforce/api.env`, compartido con worker/scheduler. Si se revierte código,
conservar esta clave y la tabla cifrada para no perder las conexiones guardadas.
Sin cambios de dependencias, commit ni push.

La ampliación del pool requiere aplicar `db/admin_proxy_pool.sql` después de
`admin_proxy_settings.sql` y publicar API, worker y scheduler junto al frontend.
El cuerpo de administración admite 32 KB; la base recibe solo credenciales cifradas.
La migración reemplaza la función de guardado; no cambia las conexiones existentes.
Si ya se guardaron más de dos conexiones, no volver a un worker anterior: no
puede leer ese formato. Conservar el código compatible con el pool al revertir
solo la interfaz. El flujo de recolección conserva sus límites y pausas.

La redistribución del 02/10 conserva API, migraciones y contenedores. Chrome con
datos simulados verificó selección y separación de comprobaciones, búsqueda,
edición y conservación del otro proxy, credenciales ocultas y borradas al cerrar,
conflicto de revisión, cancelación, eliminar/agregar respaldo, teclado, claro y
oscuro; anchos 320/375/414/768/1680 sin desbordamientos. Se validaron lint y build.
