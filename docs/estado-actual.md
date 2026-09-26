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

El collector público tiene límites reales. La última consulta manual con Chrome
guardó 30 anuncios activos de Peluna y archivó sus medios (27 archivos únicos),
pero Meta limitó la segunda página. La corrida es parcial y no prueba que se
pueda importar una marca completa desde el VPS. Bonapet tenía 71 anuncios de una
captura previa importada. Prodental todavía no tenía una importación completada.

Release de esta publicación: `/opt/inforce/releases/20260926-mcp-discovery`.
Conserva las dependencias de `/opt/inforce/releases/20260926-creative-mcp`;
no borrar esa release mientras el enlace `node_modules` siga usándola.
La imagen del crawler se fijó en `inforce-ad-library:chrome-stable`. Los videos
y las imágenes van a R2 privado, deduplicados por SHA-256. No se versionan aquí.

## Creación de imágenes: prueba MCP

Creativos → Crear imágenes permite preparar la conexión de cada usuario de
ChatGPT a una empresa y consultar las imágenes recibidas. Incluye OAuth,
referencias guardadas, productos y recepción de archivos en R2 privado.
El conector está activo; falta probar la generación nativa y la devolución del
archivo con una cuenta Pro real. Inforce no invoca la suscripción como una API.
Ver [alcance, pruebas y conexión](creative-images-mcp.md).

La entrega MCP forma parte de esta base de código. La versión exacta instalada
se registra en `/opt/inforce/current/SOURCE_COMMIT`. Actualizar las ramas de
trabajo desde `origin/main` y consultar la bitácora compartida antes de desplegar
trabajo de otro agente. La entrega móvil de Claude se mantiene en su propia rama
hasta corregir y revisar el hallazgo pendiente.

## Límites y pendientes

- Falta demostrar recorridos completos sostenidos desde el VPS y medir capacidad
  antes de afirmar soporte operativo para 100 marcas/500.000 anuncios.
- Recomendaciones por nicho e IA para sugerencias creativas son una etapa futura.
- `scripts/ad-library-ui-smoke.mjs` contiene una expectativa histórica de Peluna
  sin anuncios. Ajustar la prueba a una fixture aislada antes de reutilizarla;
  ahora Peluna sí tiene resultados parciales.
- `npm run dev` sirve Vite y los handlers de `/api`; no inicia PostgreSQL,
  PostgREST, autenticación, Redis ni workers. El frontend usa `/backend` por
  defecto. El acceso a datos necesita un backend de desarrollo configurado.
- El plugin local `devApi.js` puede leer `.env.prod`; no copiar configuración
  de producción a un entorno de pruebas. Las credenciales quedan fuera de Git.
- Los scripts de migración, pruebas de integración y despliegue pueden escribir
  datos. Leer su alcance y utilizar un entorno apropiado antes de ejecutarlos.

Los reportes redactados se conservan en `security/*.md`; capturas, resultados
crudos y archivos comprimidos de diagnóstico permanecen locales.
