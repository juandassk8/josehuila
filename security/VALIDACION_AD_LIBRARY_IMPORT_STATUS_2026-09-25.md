# Diagnóstico y corrección de importación — 25/26 septiembre de 2026

## Causa observada

Peluna pets, página `980804078453317`, estaba seguida por Inforce y en BullMQ con estado `waiting`, cero intentos y ninguna corrida. La cola tenía un worker disponible, no estaba pausada administrativamente y tenía dos jobs esperando. El TTL de rate limit global impedía ejecutarlos hasta `2026-09-26T07:22:25Z`, 02:22 de Colombia. Es una espera de seis horas configurada en Inforce tras el error de Meta, no un plazo de recuperación garantizado por Meta.

Los 71 anuncios de Bonapet proceden de una captura previa importada; no demuestran que el crawler del VPS haya terminado una consulta en vivo. Sigue pendiente validar un recorrido completo desde el VPS después de la espera.

## Corrección publicada

- Release activa: `/opt/inforce/releases/20260926-ad-import-status`; anterior conservada: `/opt/inforce/releases/20260926-ad-workspace`. Sin cambios de esquema ni vaciado de colas.
- Endpoint autorizado por empresa y seguimiento con estado de la importación: pendiente, en cola, activa, límite de fuente, reintento, fallo, pausa, indisponibilidad y consulta completa.
- Espera de primera importación visible; ya no se presenta como un catálogo vacío por filtros.
- Mensajes de seguir/sincronizar respetan la respuesta de la cola.
- Polling visible sin solapamientos, ignora respuestas de marcas anteriores, conserva la paginación si no cambió el catálogo y actualiza la vista al recibir progreso o una finalización.
- Worker publica progreso en BullMQ. La pausa de seis horas se conserva.

## Verificación

- 37 pruebas en 11 archivos del módulo: aprobadas.
- ESLint de los archivos afectados: aprobado.
- Build Vite: aprobado; aviso preexistente de chunks grandes.
- Backend: autenticación, renovación de sesión, aislamiento de empresas, privilegios, SSE, archivos y revocación: aprobado.
- Integración PostgreSQL/API: estado de consulta privado, filtros, paginación, historial, guardados privados, seguimiento compartido, observaciones y medios obsoletos: aprobado. Fixtures eliminados.
- Navegador sobre Peluna real: `rate_limited`, `queued:true`, `hasCompleteScan:false`, próximo intento desde `2026-09-26T07:22:25.831Z`.
- Actualización automática: simulación aislada en el navegador de consulta en curso → completada → anuncio visible sin clic adicional. No se hizo ninguna consulta a Meta ni se insertaron anuncios simulados en producción.
- Regresión en Bonapet: 71 anuncios, 30 iniciales, paginación, reproducción de video privado 720 × 1280, guardados, seis vistas y filtros: aprobado.
- Anchos 320/375/414/768 sin desbordamiento; cero errores JavaScript. Cuenta temporal eliminada.

Evidencia visual: `ad-library-workspace-import-wait.png`. No se afirma que Peluna ya tenga anuncios importados ni que se haya resuelto el límite de Meta.
