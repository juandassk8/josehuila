# Validación del despliegue de Bibliotecas de anuncios

Fecha: 25 de septiembre de 2026 (Bogotá).

- Sección: Creativos → Bibliotecas de anuncios, dentro de Inforce.
- URL: https://144.91.92.87/equipo
- Release activo: `/opt/inforce/releases/20260926-ad-library`.
- Empresa de la prueba real: Inforce (`1790107894757`).
- Página seguida: Bonapet (`646751588512715`).

## Resultado observado

71 anuncios, 71 versiones y 71 anuncios con sus medios archivados. R2 contiene 69 archivos únicos que suman 767.721.827 bytes. La importación repetida devolvió cero anuncios nuevos y cero cambios; no agregó versiones ni archivos.

La captura inicial fue obtenida previamente con el navegador público local. Su fecha original es `2026-09-26T00:41:59.814Z`; las corridas de importación se distinguen en PostgreSQL mediante `collection_method=stored_capture`. No se presenta esta importación como un crawl completo ejecutado desde el VPS.

El VPS obtuvo 29 anuncios en su prueba pública y luego recibió el error de Meta `1675004`. La recolección completa desde ese servidor sigue sin validar. El collector detecta el error, evita declarar ausencias a partir de datos incompletos y aplica una espera global de seis horas. La interfaz muestra la pausa. Los medios y la consulta del catálogo no dependen de esa cola.

## Comprobaciones completadas

- Suite local anterior: 714 pruebas. Después de los ajustes finales: 22 pruebas específicas del módulo, ESLint y build de producción correctos.
- Backend existente: ocho pruebas de Node y smoke de autenticación, refresh, aislamiento, privilegios, eventos y archivos correctos.
- PostgreSQL real: aislamiento entre empresas; editor sin asignación rechazado; catálogo cerrado al REST directo; marca reutilizada sin nueva colección; primera observación preservada; observación antigua no retrocede la última fecha; primera importación sin falsa etiqueta de modificación; scans incompletos sin ausencias; cierre repetido sin doble conteo; medio obsoleto rechazado.
- Redis real: trabajo único, procesamiento y reintento con espera exponencial. Las tareas de prueba se eliminaron.
- R2 real: escritura, GET privado y borrado del objeto de prueba. Medios reales descargados y archivados sin errores.
- Navegador: usuario temporal de lectura asignado a la empresa; 30 anuncios iniciales y 71 al completar paginación; controles de escritura ocultos; filtro histórico; reproducción privada de un video de 720 × 1280 y 72,12 segundos; cero errores JavaScript.
- Cuentas y empresas temporales eliminadas; cero cuentas `adlib-…@example.invalid` antes de la última prueba visual, cuya cuenta también se eliminó al terminar.
- API, nginx, PostgreSQL y los cuatro contenedores activos. Disco del VPS: 13 GB usados de 193 GB; 180 GB disponibles.

## Recuperación y evidencia

Respaldo previo: `/var/backups/inforce/ad-library-20260926T011636Z/database.dump`.

Respaldo después de importar anuncios: `/var/backups/inforce/ad-library-20260926T011636Z/after-import.dump`.

Configuraciones privadas fuera del repositorio: `/etc/inforce/api.env` y `/etc/inforce/ad-library.env`. No se incluyen valores secretos en este informe.

Captura: [ad-library-ui-2026-09-25.png](ad-library-ui-2026-09-25.png).

Pendiente: estabilidad de la fuente desde el VPS, prueba de capacidad hasta 100 marcas/500.000 anuncios, respaldo externo con restauración comprobada y posterior módulo de recomendaciones con IA.
