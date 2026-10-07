# Piloto de la API gestionada de ScrapeGraphAI

Preparado el 29/09/2026; conexión administrativa añadida el 06/10/2026.
La clave se conectó el 06/10 desde Administración. Los dos primeros pilotos de
Firulabs terminaron con timeout; la prueba posterior del usuario en la interfaz
del proveedor sí devolvió 29 anuncios identificables con otros ajustes, detallados
abajo. **No se ha habilitado como tercer motor automático**. La recuperación
operativa posterior de capturas se describe a continuación; no importa Foreplay.

## Recuperación de solicitudes, 06/10/2026

La prueba del proveedor y la solicitud web eran recorridos separados: Firulabs
seguía esperando en la cola de Meta aunque existía evidencia válida. El comando
`scripts/ad-library-import-partial.mjs` conecta explícitamente una captura revisada
con su solicitud y empresa. Por defecto solo previsualiza; `--execute` usa la RPC
de `db/ad_library_import_partial.sql`. Reanaliza la respuesta fuente, valida página,
país, fecha e integridad; no acepta JSON inventado por un extractor generativo.
Repetirlo es seguro: conserva anuncios existentes, fechas, observaciones completas
y cancelaciones; registra cobertura parcial y solo encola archivos identificados.
No hace nuevas llamadas a ScrapeGraphAI. Se requieren las migraciones habituales
y `ad_library_brand_requests.sql` antes de aplicar la nueva RPC, solo de servicio.

Firulabs: 29 anuncios y 5 JPEG comprobados; 24 videos sin archivo. Bonapet GT:
2 anuncios, ambos con video sin archivo; una consulta adicional costó 1 crédito,
saldo posterior485. El usuario confirmó página1200241039828235; el encabezado y
las tarjetas enlazan la fanpage61574360236347. Guardamos la evidencia original y
su URL verificada por separado. Ni siquiera coincidir con los2resultados anunciados
certifica la paginación completa. La cola normal conserva las próximas consultas.

## Ajuste validado desde el VPS, 06/10/2026

El cliente corregido devuelve **29 anuncios normalizados, 5 con imágenes JPEG
descargadas y verificadas y 24 videos sin archivo disponible**. Las 29 tarjetas
tienen identidad de Firulabs, ID, texto, fecha y destino; ninguna se rechazó.
La fuente anuncia aproximadamente 44 resultados, sin evidencia de recorrido
completo. El resultado permanece `complete=false`, `coverage=partial`.

Cambios: modo `auto`, sin stealth, sin espera y sin scroll por defecto; formato
Markdown a 1 crédito previsto. El HTML del proveedor elimina los scripts JSON
que esperaba el parser anterior. Ahora se leen tarjetas visibles, sin extracción
con IA: requieren una URL de fanpage confirmada, coincidencia de identidad en
cabecera y tarjeta, ID, estado y fecha válidos. Se reconocen etiquetas de pocas
impresiones y tiempo activo, sin convertirlas en estimaciones de rendimiento.
Los avatares anteriores a `Sponsored` no cuentan como creativos. Una tarjeta
desconocida se separa y rechaza, sin mezclar sus medios con la anterior.

Se conserva la respuesta original privada antes de normalizarla, incluso si
falla el parser; así puede corregirse la lectura sin pagar otra extracción.
Las fechas visibles tienen precisión de día y el texto puede estar truncado.
El formato HTML sigue disponible para diagnóstico y solo normaliza JSON de Meta
cuando efectivamente existe. No se inventan URLs de videos ni se declara una
captura parcial como inventario completo.

Pruebas reales dentro de un presupuesto durable de 20 créditos, directorio
`/var/lib/inforce/pilots/firulabs-adjust-20261006/`:

| Intento | Ajustes | Resultado |
| --- | --- | --- |
| 001 | Auto, HTML + Markdown, 0 scrolls | 7 s, 29 IDs; HTML sin scripts ni videos |
| 002 | Auto, HTML + Markdown, 3 scrolls | 12 s, mismos 29 IDs, sin videos |
| 003 | Ficha individual, auto, HTML | 4 s, ID correcto, sin fuente de video |
| 004 | JS sin stealth, 1 scroll, espera 2 s, HTML | 10 s, 29 IDs, sin fuente de video |
| 005 | Ficha individual, modo fast | Error del servicio; reserva conservada |
| 006 | Cliente corregido, Markdown, auto | 29 normalizados, 5 imágenes, 24 videos pendientes, 0 rechazados |
| 007 | Ficha individual, JS sin stealth, espera 10 s | 15 s, error de reproducción persistente, sin fuente de video |

Intento 006: `a80f6b2b-e1c8-49e1-96ff-2d894790af0b`, diferencia de saldo 1 crédito.
Se verificaron las cinco imágenes con el mismo descargador y validación de tipo
que usa Inforce, guardándolas solo en el directorio privado del piloto. No hay
importación al catálogo ni gasto periódico activado. La disponibilidad completa
de videos y la cobertura continúan sin resolverse con las variantes probadas.
Se reservaron 9 de los 20 créditos del alcance; los fallos no liberan reservas.
El saldo de la cuenta es compartido y no se atribuye toda su variación a estos
intentos. La integración automática sigue sin habilitarse.

## Primera prueba real: Firulabs, 06/10/2026

Solicitud del usuario: probar `https://www.firulabs.co/`. El sitio respondió 200
y su título confirmó Firulabs, pero no publicó enlaces a Facebook. Tampoco había
una identidad de Firulabs en el catálogo. Se consultó la biblioteca de Meta por
la palabra `Firulabs`, país ALL y todos los estados, con HTML normal, JavaScript,
stealth y cinco scrolls. No se inventó un ID de fanpage ni se importaron coincidencias.

Una sola petición pagada, con reserva durable máxima de 6 créditos, intento
`firulabs-keyword-001`. El historial del proveedor confirmó `failed`, mensaje
`Request timed out`, 55.043 ms, sin resultado. ID de solicitud:
`e1b00c1b-f692-4aa0-83b5-15fe75133917`, inicio 19:13:30 de Colombia.
El GET de historial no ejecutó una segunda extracción.

Saldos observados: antes 500 disponibles/0 usados; inmediatamente después
500/6; tras consultar el historial, 500/0 otra vez. No interpretar el cambio
transitorio como cobro definitivo ni prometer un mecanismo de devolución.
La prueba no demuestra ausencia de anuncios ni un bloqueo específico de Meta:
solo acredita que esa petición del proveedor agotó su tiempo de espera.

Registro y diagnóstico privados en `/var/lib/inforce/pilots/firulabs-20261006/`.
No se recibieron creativos y no se verificaron medios ni paginación. Siguiente
prueba recomendable: enlace directo de biblioteca/fanpage confirmada para separar
la resolución de marca del acceso a anuncios; requiere un nuevo alcance explícito
del piloto, sin borrar/ampliar la reserva anterior.

Antes del POST se detectó que faltaba publicar `scripts/lib/pilotBudget.mjs`.
Se corrigió en `/opt/inforce/releases/20261006-scrapegraph-setup-r2`, agregando
solo esa dependencia. El primer fallo de importación no hizo llamadas ni reservas.
1333 archivos verificados; recolectores e imágenes conservados, sin commit/push.

## Qué comprobar primero

### Segunda prueba: enlace directo suministrado por el usuario

El 06/10, a las 19:18:58 de Colombia, se probó el enlace exacto de biblioteca
`web.facebook.com`, página `659211333932219`, anuncios activos, todos los países
y orden solicitado por impresiones. Se conservaron los parámetros del usuario.
HTML normal/JS/stealth/5 scrolls; una sola extracción, reserva máxima 6 créditos
en `/var/lib/inforce/pilots/firulabs-page-20261006/` y sin reintentos.

`GET /credits` respondió 200. `POST /scrape` respondió **504** a los 55.104 ms.
El historial confirmó `failed`, `Request timed out`, 55.063 ms y ningún resultado,
ID `de012190-3bfc-4738-a3de-3b3dc6c27a40`. Saldo antes500/0, temporal500/6 y
final500/0 (disponibles/usados). No se recibieron anuncios ni medios; esto tampoco
demuestra ausencia de anuncios. El enlace directo no resolvió el fallo con la
configuración probada. No atribuirlo específicamente a un bloqueo de Meta sin
evidencia adicional. El respaldo automático continúa sin habilitar; ninguna
modificación de código de producción, procesos, colas o datos del catálogo.

### Comparación con la ejecución exitosa de la interfaz

El usuario confirmó que el mismo enlace directo funcionó en la interfaz de
ScrapeGraphAI. Se verificó mediante `GET /history` y `GET /history/:id`, sin
ejecutar otra extracción. Registro `528e7aa7-e104-4157-be26-eb27d730fd74`, creado
el 06/10 a las 19:21:54 de Colombia: servicio `scrape`, estado `completed`,
duración 10.031 ms. Las dos solicitudes comparadas usan el mismo destino y
filtros; la codificación de los corchetes en la URL es equivalente.

| Parámetro | Piloto API que agotó el tiempo | Interfaz del usuario |
| --- | --- | --- |
| Formato | HTML normal | Markdown normal |
| Modo de carga | `js` | `auto` |
| Stealth | `true` | `false` |
| Scrolls | 5 | 0 |
| Espera adicional | 2.000 ms | 0 ms |
| Timeout solicitado | 60.000 ms | 60.000 ms |
| Resultado | `failed`, 55.063 ms | `completed`, 10.031 ms |

Ninguna petición incluye cookies ni cabeceras de destino personalizadas. También
difieren el agente del cliente (`node`/`scrapegraph-dashboard`), los tipos MIME
aceptados y una opción de procesamiento PDF de la interfaz. No se ha aislado qué
parámetro, combinación o condición temporal causó el timeout: el historial
confirma la diferencia de ajustes, no una causa única. La conclusión de que el
proveedor no puede leer Meta sería incorrecta.

Resultado almacenado: 48.731 bytes de Markdown, **29 `Library ID` distintos**, con
nombre Firulabs, textos y fechas de inicio. El encabezado indica **~44 resultados**;
esa cifra aproximada no significa que se hayan extraído todos. Hay un enlace
`See more`, 24 mensajes de error de reproducción y **ninguna URL de video
reproducible identificada**. Los 36 enlaces de imagen no se han descargado ni
validado como creativos originales; incluyen al menos recursos de interfaz y
foto de perfil. No afirmar cobertura completa ni disponibilidad de medios.

Saldo observado después: 499 disponibles/1 usado en la cuenta, frente a 500/0
al terminar los pilotos fallidos. Es coherente con una extracción Markdown sin
stealth; el historial no aporta un desglose independiente de facturación.
Los registros privados están en `/var/lib/inforce/pilots/firulabs-compare-20261006/`.

En ese momento, el siguiente perfil a evaluar debía partir de los ajustes que
funcionaron. El parser anterior solo consumía JSON
real dentro de HTML: cambiar la salida a Markdown por sí solo no integra estos
29 anuncios. Faltaba adaptar y validar evidencia, paginación y obtención de medios
antes de incorporar este proveedor a la cadena automática. Esta comparación
solo corrigió el diagnóstico y la documentación; no modificó el cliente, el
catálogo ni los procesos del VPS.

### Criterios de validación

La independencia de infraestructura es útil solo si devuelve los anuncios que
necesitamos. El perfil vigente solicita Markdown con carga automática; HTML es
una opción de diagnóstico. IDs, textos, fechas y medios deben proceder de los
bloques JSON reales o de tarjetas visibles verificadas con la identidad de la
fanpage. No transforma texto generado por IA en fechas, IDs o actividad.

La API devuelve una captura, sin acreditar que incluya todas las respuestas
GraphQL recibidas durante el scroll. Por eso el resultado siempre indica
`complete=false`; será `partial` si contiene anuncios verificables o `unverified`
si no los contiene. Incluso un bloque con `has_next_page=false` no acredita que
se hayan capturado todos los anteriores. No llama a `ad_library_finish_crawl`,
no marca ausencias, no actualiza observaciones y no descarga medios.

Se debe comparar una marca pequeña y una paginada, incluyendo IDs después de la
primera pantalla, copy y disponibilidad de medios originales. Si faltan datos,
no habilitar el respaldo automático. La extracción JSON con IA puede evaluarse
después, acompañada de evidencia y un presupuesto propio.

## Costo y controles

El perfil vigente usa **Markdown o HTML, sin stealth: 1 crédito previsto por
petición**, según la [documentación de Scrape](https://docs.scrapegraphai.com/services/scrape).
Las primeras pruebas históricas usaban HTML + stealth (6 créditos). El perfil
de comparación HTML + Markdown reservó 2 por llamada. No se usa extracción con IA.
Revisar la tarifa antes de ejecutar: el límite local reserva créditos previstos,
no impone un tope contractual al proveedor si cambia su tarifa.

El cliente consulta el saldo con [GET /api/credits](https://docs.scrapegraphai.com/api-reference/endpoint/credits)
antes y después de una extracción recibida y normalizada. Un fallo conserva su
reserva; el operador puede consultar el saldo sin repetir el POST. La diferencia de saldo es orientativa si otra aplicación usa
la misma cuenta simultáneamente. La consulta de saldo está documentada sin costo.

- Sin `--execute`, solo muestra la petición preparada; no usa la red.
- La ejecución requiere `SGAI_API_KEY`, directorio privado y presupuesto explícito.
- Un registro en disco reserva 1 crédito **antes** del POST; tiene bloqueo
  exclusivo, escritura sincronizada y protección contra intentos duplicados.
- Fallos y timeouts mantienen la reserva: no se presume que el proveedor no cobró.
- No reintenta automáticamente ni compra saldo. No acepta redirects del API.
- Un reinicio conserva reservas. Un bloqueo que quede tras una caída requiere
  revisar proceso y registro antes de retirarlo; nunca borrarlo automáticamente.
- El presupuesto de ese directorio no se puede ampliar cambiando la opción en
  una ejecución posterior. No crear otro directorio para eludir el tope acordado.
- 401/403, 402, 429 y 5xx producen códigos distintos. Se conserva `Retry-After`
  del proveedor para decidir un intento posterior. [Errores oficiales](https://docs.scrapegraphai.com/api-reference/errors).

## Uso

### Conexión desde Administración

En **Administración → APIs → ScrapeGraphAI** se puede guardar/reemplazar/quitar
la clave y comprobar conexión/saldo. El panel no llama a `/scrape`; comprobar usa
únicamente `GET /credits`, gratuito según la documentación revisada el 06/10.
La comprobación tiene un plazo de 15 segundos y un intervalo global de 30 segundos.
Muestra la fecha del saldo y conserva el resultado al recargar. No valida todavía
la cobertura de anuncios. Tampoco activa el tercer motor automáticamente.

Aplicar `db/admin_scrapegraph.sql` después de las migraciones administrativas.
Solo el rol de servicio accede a la tabla/RPC; cada petición exige un administrador
activo. La clave se cifra con AES-256-GCM y AAD propio, usando la clave maestra
privada `ADLIB_PROXY_ENCRYPTION_KEY` ya instalada. Respaldar esa clave junto a la
base. API, auditoría y respuestas RPC nunca devuelven el secreto ni el cifrado.
Cada cambio invalida la comprobación previa. Una comprobación en curso no puede
validar una clave reemplazada: guarda el resultado solo si coincide la revisión.

El piloto puede leer esa clave sin duplicarla en otro archivo. En el VPS, cargar
el entorno privado de la API (incluye backend y clave de cifrado), sin imprimirlo:

```sh
cd /opt/inforce/current
set -a
. /etc/inforce/api.env
set +a
node scripts/ad-library-scrapegraph-pilot.mjs --admin-key --check-credits
```

Para una prueba pagada acordada, añadir `--admin-key` al comando de ejecución de
abajo y mantener directorio/presupuesto/identificador. Sin `--execute` ni
`--check-credits`, incluso con `--admin-key`, no se lee la base ni se usa la red.
La consulta real de Firulabs y sus limitaciones se registran arriba.

### Alternativa por entorno privado

Guardar `SGAI_API_KEY` fuera del repositorio, por ejemplo en
`/etc/inforce/scrapegraph.env`, con permisos 600. El script no carga `.env.prod`
ni las credenciales de PostgreSQL/R2. Requiere las dependencias Node de Inforce.

Preparar una consulta sin gastar créditos:

```sh
node scripts/ad-library-scrapegraph-pilot.mjs \
  --page 659211333932219 --page-url https://www.facebook.com/firulabs
```

Comprobar clave y saldo (no ejecuta una consulta de anuncios):

```sh
set -a
. /etc/inforce/scrapegraph.env
set +a
node scripts/ad-library-scrapegraph-pilot.mjs --check-credits
```

Solo después de acordar el piloto y su presupuesto, una consulta concreta:

```sh
node scripts/ad-library-scrapegraph-pilot.mjs \
  --page 659211333932219 --page-url https://www.facebook.com/firulabs \
  --execute --directory /ruta/privada/del/piloto-acordado \
  --max-credits 2 --attempt firulabs-prueba-001
```

El ejemplo permite como máximo dos peticiones de 1 crédito en ese directorio.
Usar `--admin-key` en el VPS con el entorno privado cargado. `--active-status`
admite `active` (predeterminado), `all` o `inactive`; `--country` es `ALL` por
defecto. `--format html` permite inspeccionar HTML, sin exigir `--page-url`;
Markdown siempre requiere la identidad confirmada. Una segunda marca requiere otro `--attempt`
en el mismo directorio; volver a usar el primero no genera otra llamada pagada.
Mantener el directorio y sus resultados privados: incluyen textos y URLs de
medios. La consola muestra solo conteos y la ruta del resultado, nunca la clave.

Los resultados se guardan como `<attempt>.json`, la respuesta original y su
alcance como `<attempt>.evidence.json`, y las reservas como `budget.ndjson`.
Antes de integrar anuncios, revisar evidencia y cobertura; esos
archivos no son una importación lista para producción.

## Verificación

`npx vitest run api/_lib/adLibrary/scrapeGraphPilot.test.js api/_lib/adLibrary/scrapeGraphEvidence.test.js` comprueba normalización,
página equivocada, respuestas sin evidencia, límites, saldo, errores, ausencia
de reintentos y presupuesto concurrente/persistente. Las respuestas son simuladas.
Los dos pilotos API terminaron con timeout. La ejecución de la interfaz aportó
29 anuncios identificables en Markdown. La adaptación posterior se validó con
respuestas guardadas y una ejecución real del cliente corregido: 29 normalizados,
5 JPEG descargados y 24 videos sin archivo. Siguen pendientes videos, cobertura
e integración automática. 51 pruebas focales aprobadas incluyendo el panel de
clave/saldo y permisos administrativos; lint focal sin errores.
