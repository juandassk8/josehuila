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

Último release registrado: `/opt/inforce/releases/20260926-ad-import-status`.
La imagen del crawler se fijó en `inforce-ad-library:chrome-stable`. Los videos
y las imágenes van a R2 privado, deduplicados por SHA-256. No se versionan aquí.

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
