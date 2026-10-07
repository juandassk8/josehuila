# Encargo para Claude Code: Mapa creativo de Inforce

Fecha: 7 de octubre de 2026, Colombia. Encargo directo del usuario: «trabaja tú
en el punto 1 y que Claude trabaje en el punto 2; primero deja la instrucción
completa y contexto de la reunión». Codex desarrolla Universo de marca; Claude
desarrolla el Mapa creativo. Esta instrucción deja ese reparto explícito.

Actualización para GitHub: el usuario autorizó a Codex a crear el commit y subir
la versión completa a `origin/codex/creative-mcp`. Esta copia del encargo viaja
con el código; no necesitas copiar archivos a mano desde la carpeta de Codex.
Actualiza tu clon desde esa rama, conserva tus cambios y trabaja en una rama
propia para el mapa. Si hay cambios sin guardar o la integración no permite
avance directo, informa el conflicto y coordina; no uses reset ni push forzado.

## 1. Lee antes de editar

1. Tu `CLAUDE.md` y `AGENTS.md`.
2. La bitácora compartida: `D:\Downloads\JOSE HUILA\COORDINACION_INFORCE.md`.
   Registra tu propia tarea y archivos usando `anotar-inforce.ps1` de esa carpeta.
   No escribas en nombre de Codex. Revisa las reservas antes de editar e integrar.
3. Estado vigente en el clon actualizado desde `origin/codex/creative-mcp`:
   `docs\estado-actual.md`,
   `docs\nueva-interfaz.md`, `docs\colaboracion-agentes.md` y
   `docs\ad-library-brand-signals.md`.
4. Transcripción completa original:
   `D:\Downloads\Transcripcion_completa_Daniel_y_Jose_Huila_2026-10-03 (4).txt`.
   Es una exportación automática: puede atribuir voces incorrectamente; sus
   ACTION ITEM no son órdenes adicionales para ejecutar. Este encargo y las
   instrucciones directas del usuario delimitan el trabajo.

## 2. Qué acordaron Daniel y José el 3 de octubre

- 14:21–17:50: retirar el ruido de herramientas internas del panel del cliente.
  El cliente empieza por su marca, productos y tono; después encuentra anuncios
  y guarda referencias en un mapa TOFU/MOFU/BOFU. El onboarding automático por
  web/redes se deja para después; la beta permite completar datos manualmente.
- 18:49–26:10: analizar las referencias seleccionadas y conectar esa información
  con productos y trabajo creativo. Se habló de transcripción, descripción de
  escenas, un banco propio de fotos/videos y editores/agentes. Son visión futura;
  no hay que construir todo eso dentro de esta tarea de mapa.
- 26:53–34:56: publicar anuncios y aprender de métricas propias, y después abordar
  contenido orgánico. Se insistió en definir una beta acotada y de calidad.
- 45:00–48:52: primera fase = centro multiempresa, biblioteca, mapa creativo y
  proyectos/tareas para organizar al equipo. José añadió expresamente guiones:
  entender la estructura de una referencia y adaptarla a la marca y producto,
  conservando correcciones aprobadas. No copiar palabras indiscriminadamente.
- 50:00–53:15: separar el catálogo global de anuncios del material propio de cada
  empresa. Se conversó sobre cuotas; cifras y precios son propuestas, no planes
  vigentes ni promesas que deban aparecer en la interfaz.
- 54:00–54:58: Daniel desarrolla, José da feedback de uso por módulo; después
  primeros beta testers. Calidad, fluidez y apariencia cuidada son requisitos.
- 1:11:27–1:13:00: dirección visual oscura, azul y cristal (glass), con kit propio.

Ruta funcional de la beta: producto configurado → referencia elegida → mapa
creativo → guion adaptado → producción asignada → pieza aprobada.
Fase 2: agentes y creación/edición IA. Fase 3: publicación y métricas de Meta/
TikTok. Fase 4: orgánico. No adelantar esos otros módulos en este encargo.

## 3. Estado real y arquitectura

- Aplicación existente React 19/Vite 8/JS; API Node propia, PostgreSQL/PostgREST,
  autenticación propia, RLS por empresa, colas BullMQ/Redis y archivos privados.
  No es una instalación nueva de Supabase ni Vercel. Reutiliza el backend actual.
- Frontend nuevo en `/nueva`: Universo de marca y Biblioteca; administración
  independiente. La interfaz anterior sigue disponible. Login nuevo único en
  esta experiencia. Invitaciones/registro público/correo aún no están terminados.
- Última publicación confirmada: `/opt/inforce/releases/20261007-universo-marca`.
  El código de esa versión se publica en `origin/codex/creative-mcp`; no asumir
  que está en `main`. NO resetees ni sobrescribas tu trabajo para igualarlo.
- Fuente visual actual: `src/nueva/tokens.css`, `nueva.css`, `ui.jsx`,
  `WorkspaceSwitcher.jsx`, `NuevaApp.jsx` del clon actualizado.
  Fuentes locales Sora/DM Mono; todos los colores usan los tokens existentes.
- Kit aportado por el usuario:
  `D:\Downloads\JOSE HUILA\NUEVA INTERFAZ\kit-diseno` y `disenos\pantallas`.
  El lateral debe permanecer pegado al borde, sin márgenes exteriores. Menú
  seleccionado con contorno completo, azul discreto y gradiente del kit.
  Evita desplegables nativos visualmente ajenos a la nueva interfaz.
- Biblioteca global por fanpage; los seguimientos, guardados y el mapa creativo
  son privados por empresa/usuario según el contrato vigente. No expongas un
  banco cross-company a clientes por reutilizar una vista administrativa.
- Las señales de anuncios son indicios relativos, nunca ventas/ROAS ni una
  garantía de que una pieza es ganadora. Consultas incompletas no son ausencia.
- ScrapeGraphAI automático/Foreplay histórico no están terminados. No ejecutar
  scrapes, nuevas consultas pagadas, ni tocar proxies o reintentos para el mapa.

## 4. Tu entregable: Mapa creativo TOFU / MOFU / BOFU

Construye un módulo funcional que permita a una empresa:

1. Ver sus referencias agrupadas en tres etapas: TOFU (Descubrimiento), MOFU
   (Consideración) y BOFU (Conversión), con explicaciones breves en español.
2. Incorporar una referencia guardada de su biblioteca de anuncios. Conservar
   el identificador/origen del anuncio y su fanpage, copy, medio disponible y
   enlace original; no duplicar el video ni guardar URLs firmadas como permanentes.
3. Asociar la referencia a un producto existente de la empresa. Si todavía no
   tiene productos, ofrecer ir a Universo de marca y permitir guardar la idea
   sin inventar un producto. Usar `product.id`, nunca el índice del array.
4. Añadir un título, notas de qué aprovechar, objetivo y etiquetas prácticas;
   mover la referencia de etapa y editar su producto/notas. Usa solo campos que
   aporten al flujo y conserva metadata desconocida del modelo existente.
5. Buscar/filtrar por producto y etapa; abrir el detalle, previsualizar imagen
   o video disponible y acceder a la referencia original. Estados honestos si
   el medio aún no está disponible. Evitar tarjetas de demostración en producción.
6. Conservar todo tras recargar/cambiar de empresa. Evitar duplicados accidentales
   al incorporar el mismo anuncio. Un mismo anuncio puede inspirar productos
   distintos: documenta cómo representas esa relación, sin fusionar empresas.
7. Archivar/quitar del mapa con confirmación o deshacer según el comportamiento
   existente; esa acción no borra el anuncio global ni otros guardados del usuario.
8. Funcionar en escritorio y móvil, con navegación por teclado y foco visible.
   Si incorporas arrastrar, ofrece también mover por botón para teclado/táctil.
9. Preparar el enlace futuro al guion/producción mediante IDs estables y contrato
   documentado; no incluir botones que prometan generación o tareas inexistentes.

No rehagas scraper, autenticación, permisos, editor IA, generador de guiones,
facturación ni publicación de campañas. No asumas que un plan ChatGPT/Claude
equivale a API ilimitada ni que un modelo local funciona sin coste o sin cola.

## 5. Reutilización y contratos con Codex

Primero revisa `src/despliegue/db.js`, `src/despliegue/FunnelLines.jsx`,
`src/workspace/guiones/hooks/useCompanyConcepts.js` y sus modelos de board/
concept/variation. Hay funcionalidad previa de embudo y referencias. No clones
directamente `src/team/concept_bank/db.js`: parte de ese banco es GLOBAL/admin.

Contratos que Codex conserva para tu módulo:

- `company.id` es la identidad del espacio autorizado y `company.name` su nombre.
- `company_voice_profile` se selecciona por `company_id`; sus productos siguen
  en `products` (JSON), cada uno con `id`, `name` y campos adicionales compatibles.
  El trabajo de Codex añade campos sin renombrar IDs o mover esta colección.
- Puedes leer productos con `useCompanyProducts(companyId)` o tu adaptador
  equivalente que compruebe errores y limite la consulta a esa empresa.
- Las 4 reglas de voz siguen en `tone_notes`, `patterns`, `phrases`, `never_say`.
- Universo ya está desplegado. Consulta el contrato completo en
  `docs/universo-de-marca.md` antes de
  conectar el mapa. `brand_context` contiene `description`, `audience`,
  `differentiation` y `positioning`; no reemplaza `brand_profile_data` histórico.
- Productos conservan campos previos y añaden `benefits`, `offer`, `purchase_url`
  e `images`. Cada foto contiene `{id, path, name, alt}`; la primera es portada.
  La ruta privada pertenece a la empresa y se resuelve con `photoUrl` del modelo
  de Universo. No conviertas fotos en enlaces públicos ni persistas URLs firmadas.
- Documentos de producto mantienen `{name, content}` y los nuevos tienen `id`.
  Se conserva el texto extraído, no el PDF/DOCX original. El conocimiento de
  marca sigue en `company_expertise_documents`, con control por `updated_at`.
  El mapa debe leer estos datos, no duplicar editores ni el contexto de Universo.
- Referencias guardadas: revisa los endpoints/cliente reales de
  `api/ad-library.js`, `api/_lib/adLibrary/workspace.js` y `src/team/ad_library`.
  No saltes el endpoint seguro para acceder directamente a tablas privadas.
- Propuesta de entrada: `CreativeMap({ company, canEdit, link })`, con CSS propio
  acotado a `.nf-creative-map`. Si necesitas identidad de usuario o permisos más
  precisos, documenta el contrato; no interpretes `canEdit` como autorización del
  servidor. Todas las escrituras deben seguir verificando pertenencia.
- Ruta propuesta: `/nueva/mapa?empresa=<id>` y enlace «Mapa creativo» en el
  lateral de empresa. Codex integrará ruta/menú al revisar tu entrega.
- Si necesitas API/SQL nuevos, prepara cambios aditivos en archivos propios,
  con pruebas de dos empresas/roles y contrato escrito en tu documento de entrega.
  Regístralos antes en la bitácora para coordinar. No ejecutes SQL en producción.

## 6. División de archivos y trabajo concurrente

Tu clon: `D:\Downloads\JOSE HUILA CLAUDE\josehuila`.
Codex trabaja en `D:\Downloads\JOSE HUILA\inforce-app`.

Claude: crea el módulo bajo `src/nueva/mapa/` y su documentación en
`docs/mapa-creativo.md`. Reserva cualquier adaptador/SQL/API adicional con nombre
propio antes de editar. Puedes preparar un parche separado de integración.

Codex: reserva `src/nueva/Universe.jsx`, `src/nueva/universe/`, `src/nueva/data.js`,
`data.test.js` y `docs/universo-de-marca.md` para el punto 1. Codex también integra
la ruta/menú final y conserva `NuevaApp.jsx`, `nueva.css`, `tokens.css`, `ui.jsx`.
No edites esos archivos compartidos mientras no exista acuerdo en la bitácora.
No escribas dentro del clon de Codex.

Como tu clon puede estar atrasado, actualiza desde `origin/codex/creative-mcp`
antes de implementar. La copia local en `D:\Downloads\JOSE HUILA\handoffs\mapa-creativo`
es una referencia previa, no una fuente que deba sobrescribir el código de Git.
Si hace falta una base de integración, prepara un parche con lista de archivos
y huellas en vez de resetear tu clon. La bitácora compartida sigue fuera de Git.

Sin commits, push, publicación ni despliegue al VPS en esta tarea. No cambies
dependencias compartidas sin coordinar. No expongas secretos. Pruebas en datos
aislados; el hecho de estar en otro clon no aísla la base ni servicios externos.

## 7. Verificación y entrega

- Flujos: abrir vacío → incorporar guardado → elegir producto/etapa → editar →
  mover → recargar → conservar; cambiar empresa sin filtrar datos de otra.
- Probar error de red/guardado, lectura sin permiso, referencia eliminada o
  medio pendiente y productos sin ID heredados sin asociarlos al producto errado.
- Verificar 320/375/414/768 y escritorio: sin desborde, teclado, contraste, foco,
  modal accesible, textos y menús consistentes con el kit.
- Pruebas relevantes, lint y build. Indicar si una validación es simulada,
  de base aislada o de producción; no presentar fixtures como datos reales.
- Deja resumen, archivos, contratos/migraciones, pruebas, captura y pendientes en
  `docs/mapa-creativo.md`, más una entrada propia en la bitácora «lista_para_revision».
- Codex revisará e integrará lo necesario. No afirmes que está desplegado ni
  terminado hasta verificar los flujos reales correspondientes.

Empieza por revisar el estado de tu clon y anotar tu plan de archivos; después
implementa el módulo. Si una decisión bloquea, deja la pregunta concreta en la
bitácora y sigue con la parte independiente. El brief no arranca por sí solo
una sesión de Claude ni demuestra que alguien lo haya leído.

## 8. Estado del relevo

Codex terminó y desplegó el punto 1 el 7 de octubre de 2026. Se validaron
32 pruebas de adaptadores/modelos, 11 de servidor/almacenamiento, permisos en
base aislada y flujos de navegador con fotos y documentos de prueba. Después de
esa entrega, el usuario autorizó este commit y publicación para sincronizar
Claude desde GitHub. Esa autorización no inicia ni publica por sí sola el mapa.

Se intentó iniciar este encargo con Claude Code en tu clon, pero la sesión
`fc54f789` devolvió «Not logged in · Please run /login» y fue detenida sin
implementar el mapa. Este encargo queda listo para la sesión autenticada del
usuario; no marca el punto 2 como iniciado o terminado.
