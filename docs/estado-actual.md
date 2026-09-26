# Estado de esta instalación de Inforce

Referencia del código preparado para `https://github.com/juandassk8/josehuila`
el 26 de septiembre de 2026. Las observaciones del VPS de abajo son las últimas
verificaciones registradas, no una consulta de estado en tiempo real.

## Dónde empezar

- [Instalación PostgreSQL y API](../deploy/vps/README.md).
- [Biblioteca de anuncios, colas y storage](../deploy/ad-library/README.md).
- [Referencia visual de Foreplay](ad-library-reference-foreplay.md).
- [Colaboración entre Claude Code y Codex](colaboracion-agentes.md).

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
