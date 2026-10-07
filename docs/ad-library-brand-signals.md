# Marcas por URL y señales de creativos

## Identidad de la marca

El alta acepta un sitio web HTTPS, una fanpage de Facebook o un enlace de Meta Ad
Library con `view_all_page_id` (también un anuncio individual con `id`). Un ID de
anuncio nunca se interpreta como ID de página. Los enlaces de búsqueda por texto
sin página seleccionada no identifican una marca y se rechazan.

Para sitios web se leen enlaces explícitos a fanpages, con validación DNS pública,
redirecciones validadas, 20 segundos y 1 MB de HTML. Si hay varias páginas,
el usuario elige una identidad confirmada; si no hay ninguna, se pide la fanpage.
No se adivina el nombre usando el título o el dominio. Facebook se lee en Chrome
con rutas Meta permitidas, sin sesiones personales, usando el pool configurado.
Los límites y pausas existentes se conservan. Los sitios que solo publican sus
redes mediante JavaScript pueden requerir pegar la fanpage directamente.

Desde el 06/10 el alta guarda primero una solicitud durable en
`ad_library_brand_requests`, privada por empresa y deduplicada por URL normalizada.
La respuesta HTTP confirma ese guardado, incluso si Redis no está disponible.
El programador vuelve a enviar solicitudes pendientes cada cinco minutos y recupera
leases vencidos. El recolector conserva los límites globales y por proxy.

Estados: pending/resolving, needs_selection, ready y cancelled. Una identidad
verificada se sigue automáticamente; varias requieren elección. La creación del
seguimiento y el paso a ready son una transacción, sin nombres o IDs inventados.
El catálogo conocido por ID evita una lectura nueva de Meta. Los errores transitorios
reintentan con espera de 15 minutos hasta 6 horas; un sitio sin enlace a fanpage se
revisa cada 24 horas. Un bloqueo de Meta respeta su pausa. No se promete una fecha
de finalización. Si falta información en la fuente, la resolución puede requerir
revisión administrativa o un enlace de fanpage distinto.

La biblioteca muestra «Preparando tus bibliotecas», conserva las solicitudes al
recargar y permite agregar otras o cancelarlas. El usuario ve solo sus solicitudes;
los intentos, códigos de error y fechas internas están en Administración → Solicitudes.
Los endpoints heredados resolve-brand/resolution siguen compatibles, pero el nuevo
formulario usa request-brand/brand-requests/select-brand-request/cancel-brand-request.
La solicitud sigue existiendo sin navegador abierto y sin depender de la retención de Redis.
No hay notificaciones externas ni llamadas a API de pago.

Aplicar `db/ad_library_brand_requests.sql` antes de API, worker y scheduler.
Tablas/funciones solo de servicio; la API verifica permisos de empresa y de gestión
para crear, seleccionar o cancelar. No crear marcas globales ficticias para enlaces
pendientes. Las bajas existentes de marca se conservan; volver a solicitar un enlace
ya resuelto reactiva únicamente el seguimiento de esa empresa.

## Señales v1

No conocemos las ventas, ROAS, inversión ni impresiones numéricas de estos anuncios.
El orden solicitado a Meta es una señal ordinal, no una medición de resultados.
No se presupone que sea el orden predeterminado: el collector pide explícitamente
`total_impressions` descendente y requiere observar ese modo en los parámetros
GraphQL de una respuesta con anuncios de la página buscada. Si no se puede
comprobar, no se genera puntuación. Esto verifica la solicitud, no una auditoría de
la clasificación interna de Meta.

Solo se guarda un snapshot cuando la consulta `meta_web` en vivo termina completa,
con anuncios activos, país comparable y entre 5 y 10000 anuncios. Se excluyen
importaciones, primeras consultas con estado `all`, consultas parciales y motores
sin evidencia de orden. Una segunda consulta completa activa inicia la serie.
Un fallo al guardar el indicador no invalida el inventario completo; genera
`SIGNAL_SNAPSHOT_FAILED` en el log para operación.

Se conserva una observación por día UTC y país, sustituyéndola con la última
consulta completa de ese día. No se rellenan días perdidos. Las variantes que
Meta entrega en un mismo grupo comparten posición media; no se inventa un orden
entre ellas. Las comparaciones usan hasta 21 días recientes, dentro de una marca.

Para N anuncios, posición relativa P = 100 × (N − posición) / (N − 1).
Cambio Δ = P actual − P del día observado anterior del mismo anuncio.
Antigüedad A se calcula desde el inicio publicado por Meta, nunca desde first_seen.
Puntuación = media ponderada de P (65 %), clamp(50 + Δ, 0, 100) (20 %)
y P × exp(−A / 14) (15 %). Se omiten componentes sin evidencia y se renormaliza.
El resultado 0–100 es heurístico, no probabilidad de ganar. La composición del
catálogo también puede cambiar la posición relativa sin cambiar las impresiones.

Estados: nuevo destacado (A ≤ 7 y P ≥ 80), en ascenso (Δ ≥ 15), pierde posiciones
(Δ ≤ −15), retoma posiciones (P ≥ 70 tras una observación ≤ 40 precedida por otra
≥ 70), posición sostenida (tres observaciones ≥ 70), primera observación o sin
cambio destacado. La cobertura se expresa como días observados. Después de dos
días sin una comparación nueva, se avisa que la evidencia está desactualizada.
Ausencia o fallo de recolección nunca se convierten en caída o cero impresiones.

## Operación

Aplicar `db/ad_library_signals.sql` antes de iniciar el nuevo worker/API. Tabla
con RLS, sin lectura para anon/authenticated y acceso de servicio. API verifica
seguimiento y pertenencia a empresa. GET signals devuelve páginas de 50, sin
exponer datos privados de otros seguimientos. Migración aditiva e idempotente.

UI: «Seguir marca» para resolver enlaces y «Señales» para comparar dentro de una
marca. Muestra método, fecha, posición, antigüedad, días observados y evolución.
No ofrece historial ficticio anterior a la instalación.

## Diagnóstico Diabeskin, 06/10/2026

Fanpage 706819455849348. A las 11:01 de Colombia había 50 anuncios conservados.
Tres consultas consecutivas terminaron META_RATE_LIMITED después de tres páginas,
no por una página equivocada. El tercer proxy conectó TLS con Meta en 982 ms;
los dos anteriores seguían agotando el tiempo. Los reintentos permanecen en cola.
Un proxy que conecta no garantiza que Meta permita completar el catálogo.

## Validación

Pruebas de URL/SSRF, selección de identidad, aislamiento usuario/empresa,
reutilización de catálogo, conservación de orden, fechas faltantes, días repetidos,
país, subidas/caídas/recuperación y exclusión de evidencia incompleta. PostgreSQL
real aislado: idempotencia, unicidad diaria, RLS y roles. Chrome con API simulada:
varias fanpages, nombre confirmado, espera, error, historial, estados vacíos y
anchos 375/768/1440 sin desbordes. Separar estas pruebas del piloto real con Meta.

Comprobación final del 06/10 a las 11:51 de Colombia: tras esperar el cooldown
vigente, una lectura acotada de la fanpage devolvió META_RATE_LIMITED. No se probó
el orden con una petición adicional después de ese límite. La cola se reanudó y
se conserva la pausa por proxy. Está confirmado el flujo de identidades existentes
en producción; sigue pendiente comprobar nuevas identidades y puntuaciones con
una respuesta completa real de Meta. No confundir las pruebas simuladas con esa
validación externa. Sitio diabeskin.com.co: HTTP403, sin fanpage extraíble.

## Agrupación por fanpages y dominios (06/10/2026)

Implementada según la aclaración del usuario: solo relaciones positivas observadas.
Una fanpage con varios dominios, o varias fanpages hacia el mismo dominio exacto,
forman una agrupación automática. Un par aislado de una fanpage y un dominio no
crea una agrupación. Los componentes conectados son transitivos; nunca se unen
por nombre, país, parecido entre URLs, extensión o dominio raíz inferido.
`www.` y los puertos HTTP/HTTPS estándar se normalizan; otros subdominios y TLD
se conservan separados. Las rutas de producto se reúnen bajo su dominio exacto.

La evidencia proviene de destinos de anuncios (incluidas tarjetas de carrusel),
versiones almacenadas o websites explícitos publicados por una Page identificada.
El enlace introducido por el usuario y los botones de una web que apuntan a
Facebook no prueban la relación inversa. Servicios compartidos, redes sociales,
acortadores y marketplaces conocidos aparecen en monitoreo pero no unen marcas.
La agrupación describe relaciones publicitarias; no acredita propiedad societaria.

`db/ad_library_brand_network.sql` agrega evidencia persistente con tipo, anuncio,
URL de origen/destino y primera/última observación. Conserva vínculos históricos
cuando cambian los destinos. El backfill usa únicamente fechas y contenidos
almacenados, sin inventar observaciones anteriores. Los websites de la fanpage
se registran cuando una nueva resolución devuelve ese campo de forma explícita;
no se asume cobertura de perfiles que todavía no lo han entregado.

`db/ad_library_workspace_scope.sql` agrega RPC compatibles con filtros de grupo
y dominio, paginación, búsqueda y guardados. Las relaciones se consultan por las
fanpages seguidas activamente por la empresa autorizada. La API calcula los
miembros; no acepta una lista de IDs del navegador. Catálogo e historial por
fanpage permanecen intactos. Las señales se comparan dentro de cada fanpage.
Las agrupaciones usan un miembro como identificador, no una nueva identidad
fusionada. Si se supera el límite de 5.000 relaciones, no se agrupa un grafo
incompleto. Dejar de seguir una página puede cambiar el grupo visible.

Interfaz: selector «Marcas agrupadas» y «Fanpages individuales»; pestaña «Fanpages
y dominios» con procedencia, fechas y enlaces de evidencia; «Destinos» y «Destinos
más usados» muestran las fanpages que utilizan cada ruta. Es posible filtrar
los anuncios de un grupo o dominio y regresar a una fanpage individual.

Bonapet Guatemala (bonapet.net, página 1200241039828235) y Colombia
(bonapet.shop, página 646751588512715) se mantienen separadas salvo evidencia
futura real que conecte sus destinos; compartir nombre no crea un vínculo.

Validación: 1.013 pruebas Vitest, ocho de API/seguridad del VPS, PostgreSQL aislado
con RLS, empresa, historial, carrusel, enlace de perfil, guardados, filtros,
paginación e idempotencia; interfaz simulada de escritorio y 375 píxeles sin
desborde de página. Las tablas móviles tienen desplazamiento horizontal interno.
Esta función no ejecuta nuevas consultas pagadas ni elimina pausas del scraper.
