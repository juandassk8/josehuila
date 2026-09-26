# Referencia de Foreplay aplicada a Creativos de Inforce

Decisión del usuario (25 de septiembre de 2026): usar como referencia las seis capturas de Foreplay, tanto por la presentación de los creativos como por la información de cada marca. Se adapta el patrón al diseño y los permisos de Inforce; no es otra aplicación.

## Lo implementado

| Referencia | Implementación | Fuente |
| --- | --- | --- |
| Creativos grandes con reproducción | Tarjetas verticales, miniaturas propias, video privado, archivos alternativos y detalle | Medios archivados en R2 |
| Analítica por marca | Conteo total, mezcla de formatos, destinos frecuentes y aperturas por duración | Agregaciones SQL del catálogo completo filtrado |
| Rankings | Vista Duración, orden descendente, número de anuncios activos con 30 días o más | Inicio publicado o primera observación; fin observado |
| Pruebas creativas por fecha | Vista Lanzamientos con grupos UTC y barras de duración | Fecha de inicio; primera observación como alternativa indicada |
| Landing pages | Agrupación por ruta sin query ni fragmento; acceso a anuncios y URL original | landing_url |
| Hooks | Ganchos del copy: primera línea, hasta 220 caracteres; copiar y consultar anuncios relacionados | Texto recogido, sin transcripción de audio |
| Swipe file | Mis guardados, privados por usuario y empresa | Tabla independiente con acceso exclusivo por API |
| Historial | Hasta 50 versiones observadas por anuncio, fechas y estado | ad_library_versions |

Se conserva la navegación Creativos → Bibliotecas de anuncios y la ruta del portal de clientes. Colores y tipografía proceden del sistema DS de Inforce. Las capturas de Foreplay solo son una referencia visual; no se incorporan sus anuncios ni sus métricas como datos de Inforce.

## Semántica y límites

- Activo significa activo en la última observación. La duración inclusiva se calcula hasta last_seen, limitada por source_stop_at si existe, nunca prolongando automáticamente la observación hasta hoy.
- Coincidir en una fecha no demuestra una prueba A/B. Longevidad no demuestra ventas, ROAS, inversión ni rentabilidad.
- Las rutas de destino pueden agrupar URLs con parámetros funcionales distintos. El detalle conserva el enlace completo.
- La deduplicación de los archivos originales y sus miniaturas es por SHA-256. No se afirma que dos anuncios distintos sean la misma variante publicitaria.
- Las miniaturas se generan en la cola de medios con ffprobe/ffmpeg, concurrencia 1, lectura máxima de 100 MiB, protocolos file/pipe, límite de tiempo y eliminación del directorio temporal. No se ejecutan desde una request web.
- Los enlaces de lectura siguen siendo firmados y temporales. Actualizar resultados renueva los enlaces.
- No se incorpora todavía transcripción de video, recomendaciones con IA, estimación de ganadores ni asociación automática con colaboradores externos.
- Esta entrega no cambia ni elimina la limitación de consultas de Meta desde el VPS. Se mantienen el backoff y los datos ya archivados.
- Las vistas agrupadas muestran hasta 60 grupos ordenados, con ese límite visible. El catálogo usa paginación por cursor y un máximo de 50 anuncios por request. Los totales de la analítica no se limitan a esa página.
- No se ha hecho una prueba de carga de 500.000 anuncios en esta entrega.

## Archivos principales

- Pantalla: src/team/ad_library/AdLibraryWorkspace.jsx, workspaceUi.jsx, workspaceHelpers.js, adLibrary.css, tokens.css. AdLibraryPage.jsx conserva la entrada pública.
- API: api/ad-library.js, api/_lib/adLibrary/workspace.js.
- Migración aditiva: db/ad_library_workspace.sql.
- Miniaturas: services/ad-library/preview.mjs; media-worker.mjs; storage.js y queue.js; Dockerfile.
- Recuperación de miniaturas existentes: scripts/ad-library-preview-backfill.mjs.
- Pruebas: workspace.test.js, preview.test.js y ampliaciones a integration-smoke y ui-smoke.
