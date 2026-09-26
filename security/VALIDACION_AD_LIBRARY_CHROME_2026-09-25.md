# Google Chrome para el recolector — 25/26 septiembre de 2026

- Imagen: `inforce-ad-library:chrome-stable`, construida desde el Dockerfile del repositorio.
- Instalación de Chrome oficial mediante `npx playwright install --with-deps chrome`.
- Versión verificada: `154.0.8037.57`; canal activo del worker: `chrome`.
- `scripts/ad-library-browser-smoke.mjs`: arranque del navegador, carga de HTML, interacción y ejecución de JavaScript aprobados con red desactivada.
- ESLint del script: aprobado.
- Se reemplazó solo el contenedor del crawler; imagen anterior conservada como `inforce-ad-library:before-chrome`.
- Antes del cambio: dos trabajos esperando, ninguna consulta activa, TTL de rate limit `11307704` ms.
- Después: dos trabajos esperando, ninguna consulta activa, cero trabajos fallidos, TTL `11305897` ms. El cambio no eliminó ni reinició la espera.
- No se realizaron consultas adicionales a Meta ni se utilizaron sesiones personales durante esta comprobación.

La prueba valida la compatibilidad y selección de Google Chrome en el VPS. No valida una importación real de Meta, no demuestra que Chromium causara el error anterior y no garantiza menos restricciones. La siguiente ejecución ordinaria de la cola utilizará Chrome y conservará el manejo de límites vigente.

## Consulta manual posterior, solicitada por el usuario

El usuario solicitó ejecutar inmediatamente una consulta. Se creó un trabajo temporal de BullMQ con un único intento, sin reintentos automáticos, dirigido exclusivamente a Peluna (`980804078453317`). Se utilizó el pipeline normal de persistencia y medios, Google Chrome y un máximo de 20 páginas/120 segundos. La cola ordinaria no se liberó para otras marcas.

- Inicio: `2026-09-26T04:18:56.144Z`; final: `2026-09-26T04:19:05.468Z`.
- Primera página: 30 anuncios nuevos, todos con formato video; guardados en PostgreSQL.
- Al continuar: `META_RATE_LIMITED`. La corrida quedó `failed`, `complete_scan=false`, una página y 30 anuncios. No se marcaron ausencias ni se declaró completa la biblioteca.
- La primera comprobación de medios encontró 20 de 30 anuncios archivados, cero errores y trabajos restantes en curso.
- Comprobación final: 30 anuncios activos, todos con medios archivados y cero errores. Corresponden a 27 archivos únicos; 23 miniaturas estaban listas y las restantes seguían en procesamiento.
- Se aplicó nuevamente la espera interna de seis horas, con próximo intento permitido desde `2026-09-26T10:19:05.512Z` (05:19, Colombia). No es un plazo de recuperación garantizado por Meta.
- La cola temporal se eliminó tras cerrar su worker. Las tres marcas de la cola ordinaria conservaron sus trabajos pendientes.

Resultado: Chrome pudo obtener la primera página, pero no evitó el límite durante esta prueba. La biblioteca de Peluna contiene una importación parcial real.
