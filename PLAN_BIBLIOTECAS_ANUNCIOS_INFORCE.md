# Bibliotecas de anuncios dentro de Inforce

Actualizado: 25 de septiembre de 2026 (Bogotá).

## Primera versión implementada

La sección vive en **Creativos → Bibliotecas de anuncios**. Reutiliza React/Vite, API Node, sesiones, empresas, roles, PostgreSQL y PostgREST de Inforce. Introducir Next.js, NestJS o Prisma en esta sección duplicaría servicios y mecanismos ya existentes; no se añadieron.

```text
Empresa sigue una página
  → API autenticada → seguimiento privado en PostgreSQL
  → BullMQ → worker de recolección → Collector reemplazable
  → Normalizer → catálogo global e historial en PostgreSQL
  → cola de medios → validación y SHA-256 → storage S3 / Cloudflare R2
  → API comprueba empresa y seguimiento → enlaces temporales → frontend
```

Una página pública se recoge una sola vez para todos los países disponibles y se comparte entre las empresas que la siguen. Agregar otra empresa a una marca actualizada reutiliza el catálogo sin volver a consultar Meta. Los alias y seguimientos son privados por empresa.

El collector predeterminado es `MetaWebCollector`, con Playwright y una sesión pública aislada. `MetaOfficialCollector` permanece disponible como alternativa. Ambos entregan anuncios normalizados por páginas. `S3MediaStorage` y `R2MediaStorage` separan el almacenamiento del proveedor.

La primera colección recorre los resultados que la fuente entrega; tras una colección completa se consulta el conjunto activo. Se conservan IDs, primera y última observación, fecha publicada de inicio, texto, CTA, destino y versiones por hash. Los medios se deduplican por SHA-256 en R2 privado. Las URL temporales del CDN no forman parte de las versiones guardadas.

Una ejecución solo cuenta como completa cuando la fuente confirma el fin de la paginación. Dos recorridos completos sin un anuncio permiten marcarlo como «Ya no observado», sin afirmar que Meta confirmó su pausa. Una ejecución parcial no marca ausencias; repetir el cierre de la misma ejecución tampoco cuenta una segunda ausencia.

El scheduler revisa marcas vencidas cada cinco minutos. Programa seis horas cuando hubo cambios y 24 horas cuando no los hubo. Los errores normales tienen reintentos y espera exponencial. Un límite de consultas de Meta detiene toda la cola de recolección durante seis horas; las descargas de medios y la consulta del catálogo siguen separadas.

## Infraestructura instalada

- VPS Contabo `144.91.92.87`, app en `https://144.91.92.87/equipo`.
- Release `/opt/inforce/releases/20260926-ad-library`, activo mediante `/opt/inforce/current`.
- PostgreSQL y API existentes; Redis y tres procesos de Docker Compose: collector, medios y scheduler.
- Redis solo en localhost. Worker de navegador limitado a 1,5 GiB; medios a 512 MiB; scheduler a 256 MiB.
- Bucket privado R2 `inforce-ad-library-media`; configuración privada en `/etc/inforce/ad-library.env`.
- Respaldo previo a migraciones: `/var/backups/inforce/ad-library-20260926T011636Z`.
- Acceso SSH operativo como `inforce-admin`; administración mediante `sudo`. Root remoto continúa deshabilitado.

## Evidencia y limitación de la fuente

La prueba pública local de Bonapet, página `646751588512715`, obtuvo **71 anuncios únicos** en seis páginas. Esa captura completa se importó conservando la observación del `2026-09-26T00:41:59.814Z`, y se registra como `collection_method=stored_capture` para distinguirla de una recolección en vivo del VPS.

Desde el VPS se obtuvieron 29 anuncios iniciales, pero la siguiente página devolvió `1675004`, asociado a límite de consultas. Esa prueba **no fue completa**. El collector ahora reconoce ese error incluso con HTTP 200, detiene la lectura y aplica espera. No se garantiza todavía una recolección automática completa desde ese servidor.

R2 pasó una prueba de escritura, lectura privada y eliminación del objeto de prueba. PostgreSQL pasó comprobaciones reales de aislamiento entre empresas, catálogo inaccesible por REST directo de usuarios, marca compartida sin repetir crawl, preservación de `first_seen`, cierre idempotente de scans y rechazo de medios de versiones obsoletas.

## Próximas etapas

1. **Estabilizar la fuente:** comprobar recuperaciones tras la espera y medir varias marcas durante varios días. Si la limitación persiste, integrar un proveedor autorizado mediante la misma interfaz; no cambiar el modelo de datos ni el frontend.
2. **Validar capacidad:** subir gradualmente hacia 100 marcas y 500.000 anuncios, midiendo memoria, duración de cada colección, tamaño real de medios, operaciones y crecimiento de PostgreSQL. Esa capacidad aún no está probada.
3. **Operación:** alertas de fallos sostenidos y presupuesto, respaldo externo de PostgreSQL y prueba de restauración. Separar los workers del VPS de la app cuando la carga lo justifique.
4. **Descubrimiento y sugerencias:** perfil de negocio y nicho por empresa, marcas candidatas, agrupación de creativos y propuestas de briefs. Se implementará después del catálogo estable. La actividad prolongada de un anuncio no demuestra ventas ni rentabilidad.

Notas, favoritos, recomendaciones con IA y búsqueda automática de nuevas marcas quedan fuera de esta primera entrega. El histórico disponible comienza con nuestras observaciones y con lo que la fuente conserve; no se promete reconstruir anuncios que Meta ya no entregue.

La guía de operación está en [deploy/ad-library/README.md](deploy/ad-library/README.md).
