# Validación de la biblioteca visual de Inforce — 25/26 septiembre 2026

## Resultado

Desplegado en `/opt/inforce/releases/20260926-ad-workspace`, dentro de Creativos → Bibliotecas de anuncios. Mantiene integración y autorización del portal de clientes. Referencia funcional y límites: `docs/ad-library-reference-foreplay.md`.

- 71 anuncios reales de Bonapet en el catálogo: 42 videos y 29 imágenes.
- 69 archivos originales únicos. Los 42 videos tienen miniatura propia en R2.
- Las consultas producen cuatro rutas de destino y agrupan aperturas del copy y fechas de lanzamiento.
- API, nginx, PostgreSQL, Redis, crawler, scheduler y worker de medios comprobados activos al cierre.
- Meta continúa limitando las consultas del crawler. Esta entrega mejora la biblioteca y no afirma haber resuelto esa limitación.

## Verificación

- 26 pruebas unitarias en 9 archivos del módulo: aprobadas.
- ESLint de los archivos afectados: sin errores ni advertencias.
- Vite build: aprobado; conserva aviso preexistente de chunks grandes del resto de la aplicación.
- Migración validada primero con BEGIN/ROLLBACK sobre la base del VPS.
- Prueba de backend: login, refresh, autorización por empresa, prevención de escalamiento, SSE, archivos y revocación de logout: aprobada.
- Integración: filtros agregados, búsqueda literal de `%` y `_`, paginación por duración, rechazo de cursor de otro orden, destinos, historial y guardados: aprobada.
- Permisos: otra empresa no puede consultar anuncios/analítica; usuarios de la misma empresa no comparten guardados personales; catálogo, vista SQL y RPC no son públicos: aprobados.
- Navegador: 30 anuncios iniciales, paginación de los 71, seis vistas, búsqueda, guardado/retiro, modal de detalle, historial, filtro histórico, tema claro y oscuro: aprobados.
- Video privado reproducido: 720 × 1280, duración aproximada de 72.12 s.
- Responsividad del módulo: 320/375/414/768 px, scrollWidth igual a clientWidth. Menú móvil verificado abierto/cerrado.
- Cero errores de JavaScript. Se eliminaron las cuentas temporales de prueba.

El primer intento de activación revirtió correctamente porque el fixture de historial no había creado registros de versiones. Se completó el fixture y la siguiente activación pasó. La revisión móvil detectó además que el layout general reservaba 240 px para el sidebar; se ajustó específicamente la vista adlibrary para convertirlo en un menú desplegable.

Backup de activación: `/var/backups/inforce/ad-library-20260926T021750Z/database.dump`. La migración es aditiva. No se ha realizado todavía una prueba de carga con 500.000 anuncios.

## Evidencia visual

- `ad-library-workspace-desktop.png`
- `ad-library-workspace-mobile.png`
- `ad-library-workspace-mobile-creative.png`
- `ad-library-workspace-dark.png`

Hallmark: jerarquía centrada en creativos, tipografía y colores de Inforce, controles con foco visible, detalle nativo con Escape y restauración del foco. Revisión P5 H4 E4 S4 R4 V4. Los patrones de Foreplay se adaptaron; no se copiaron sus datos de ejemplo.
