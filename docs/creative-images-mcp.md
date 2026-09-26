# Crear imágenes desde ChatGPT: prueba MCP

Decisión del 26/09/2026: empezar desde ChatGPT conectado a Inforce. Cada usuario
conecta su cuenta de ChatGPT a **una empresa** en cada autorización. El usuario
inicial tiene Pro. No se configura una API de generación de pago ni se reutiliza
una cuenta central para generar por todos los clientes.

## Qué implementa esta prueba

- `Crear imágenes` dentro de Creativos, en equipo y portal de empresa.
- Conector `/api/creative-mcp`, Streamable HTTP sin sesiones en memoria.
- OAuth con consentimiento, PKCE S256, callback permitido explícitamente,
  código de un uso, tokens opacos guardados por hash, refresh rotatorio y
  revocación desde Inforce. Access token: una hora; autorización: 30 días.
- Cada autorización fija usuario y empresa. Las herramientas no aceptan un
  company_id. Se comprueban membresía actual, usuario activo y versión de cuenta
  en cada petición. Los JWT habituales de Inforce no sirven como tokens MCP.
- Referencias: últimas 30 imágenes guardadas por ese usuario en marcas seguidas.
  Productos: ficha existente `company_voice_profile.products`. La foto del
  producto se adjunta en ChatGPT en esta primera prueba.
- Recepción de PNG/JPG/WebP hasta 20 MB, con descarga HTTPS limitada y protección
  SSRF existente (IP pública validada y fijada, redirects validados). Los archivos
  quedan en R2 privado con SHA-256 y URLs temporales. No se confía en el MIME declarado.
- Hasta 50 guardados por empresa en 24 h para esta prueba; archivo repetido por
  usuario/empresa es idempotente. Guardar no publica anuncios ni modifica el embudo.

Herramientas: `consultar_creativos`, `preparar_creativo`, `guardar_creativo`,
`ver_creativos_guardados`. La escritura solicita `creatives:write`, la lectura
`creatives:read`. `guardar_creativo` declara `openai/fileParams` y exige un archivo
real. No genera imágenes ni transforma la suscripción ChatGPT en una API.

## Lo que falta demostrar en ChatGPT

Las pruebas de transporte y seguridad locales no prueban la compatibilidad de
la cuenta Pro con escritura MCP, ni que la imagen generada de manera nativa se
pueda pasar a una herramienta en el mismo chat. La documentación de ayuda y la
de desarrolladores describen disponibilidades distintas. Comprobar la cuenta
real antes de ofrecer esto como una función automatizada a todos los clientes.

Si no se puede transferir directamente, la alternativa para la prueba es adjuntar
el archivo generado al chat y pedir guardarlo. Si el plan no permite escritura
MCP, esa alternativa tampoco resuelve el permiso: hay que elegir un plan que lo
admita o una importación manual dentro de Inforce. No hacer scraping de ChatGPT.
La suscripción conserva sus límites y condiciones; Inforce no promete imágenes
ilimitadas. `origin=chatgpt_file` describe el canal de recepción, no certifica
que el archivo haya sido generado por IA.

## Activación en el VPS

1. Aplicar `db/creative_images.sql` como postgres sobre una base respaldada; no
   recrear tablas anteriores. El script es aditivo e idempotente y específico del
   backend PostgreSQL de Inforce. Registrar su checksum en `app_private.migrations`
   si se aplica fuera del migrador. Usa `auth.users` y el rol local `inforce`.
2. Instalar el lockfile nuevo con `npm ci --ignore-scripts`, construir el frontend
   y desplegar la release revisada. No cambiar el node_modules compartido de la
   release activa al preparar una nueva.
3. En `/etc/inforce/api.env` privado activar `CREATIVE_MCP_ENABLED=1`, comprobar
   `PUBLIC_BASE_URL` (origen HTTPS) y la configuración R2/S3 del proceso API.
4. Agregar las dos ubicaciones `/.well-known/` de `deploy/vps/nginx.conf`. Validar
   `nginx -t` antes de recargar. Descubrimiento y tokens llevan Cache-Control no-store.
5. Por defecto se acepta `https://chatgpt.com/connector_platform_oauth_redirect`.
   Si el panel del conector muestra otro callback, configurar SU URL EXACTA en
   `CREATIVE_MCP_REDIRECT_URIS` (lista separada por comas), sin comodines.
6. En ChatGPT habilitar modo desarrollador si está disponible, añadir el servidor
   con OAuth, revisar permisos y autorizar una empresa con la cuenta de Inforce.

Con el flag apagado, endpoints responden 503 y la sección explica que falta activar.
No hay API key de OpenAI ni contraseña de ChatGPT en Inforce. La conexión usa
credenciales propias de Inforce para autorizar acceso a sus datos.

## Prueba de aceptación

1. Guardar un anuncio de **imagen** con medios disponibles en una empresa de prueba
   y crear/seleccionar un producto de esa misma empresa.
2. En un chat con Inforce: «Muéstrame mis referencias y productos».
3. Elegir referencia/producto por IDs reales; adjuntar foto del producto y pedir
   generar una versión usando su composición y el texto aprobado.
4. Pedir «Guarda esta imagen en Inforce». Verificar qué archivo real recibe MCP;
   no inventar URLs o file IDs si ChatGPT no lo entrega.
5. Comprobar imagen en la galería y en R2 privado; otra empresa no debe poder leerla.
6. Repetir la llamada con el mismo archivo: debe conservar el ID sin duplicar.
7. Desconectar desde Inforce: el token anterior y su refresh deben dejar de servir.

La prueba usa transferencia acotada de un archivo ya generado. Los crawlers de
Meta siguen usando sus colas existentes; no hay un crawler ni generación de IA
en este endpoint. Un editor completo, fotos de producto dentro de Inforce,
inserción en etapas del embudo y generación automática mediante proveedor son
fases posteriores a validar el intercambio real con ChatGPT.

## Estado verificado: 26/09/2026

- Activo en `/opt/inforce/releases/20260926-creative-mcp` a las 06:02 UTC.
  Respaldo previo privado en `/var/backups/inforce/creative-mcp-20260926T060246Z`.
  La release anterior y sus dependencias se conservaron.
- Migración aditiva registrada con checksum; flag activado; API, PostgREST y
  Nginx activos. Descubrimiento OAuth público por HTTPS comprobado. MCP sin token
  devuelve 401 con desafío de autorización; galería sin sesión devuelve 401.
- Conector: `https://144.91.92.87/api/creative-mcp`. No abrirlo como una página:
  añadirlo como servidor MCP con OAuth en ChatGPT.
- 763 pruebas Vitest y 8 pruebas Node aprobadas; build aprobado. Lint general:
  cero errores y 492 avisos; archivos nuevos sin avisos. 32 pruebas específicas
  incluyen transporte con JSON ya parseado, archivos, scopes y aislamiento.
- PostgreSQL probado en una base temporal con datos ficticios y borrada al
  terminar. PKCE, código de un uso, refresh rotatorio, revocación y acceso privado
  comprobados. Después del despliegue solo se consultó el contexto real para
  validar compatibilidad de esquema, sin escribir imágenes ni referencias.
- UI probada con fixtures en 1440/768/375/320 px, sin desbordamiento, incluyendo
  autorización y revocación. No se utilizaron credenciales reales en esa prueba.
- Pendiente: sesión Pro real, autorización desde ChatGPT y una imagen generada
  que regrese a R2. El navegador disponible no tiene sesión de ChatGPT iniciada.
  Hay cero imágenes recibidas; no se afirma que la generación nativa funcione.
- La primera activación ocurrió antes del commit. La entrega para publicar
  incluye ahora MCP, pruebas y documentación. `SOURCE_COMMIT` en la release
  identifica el commit instalado; actualizar las ramas desde `origin/main`
  antes de integrar trabajo adicional. La bitácora compartida registra cada
  publicación y los trabajos de Claude que siguen separados.

Fuentes verificadas:
- [Autenticación MCP](https://developers.openai.com/plugins/build/auth).
- [Entradas de archivos](https://developers.openai.com/plugins/reference#file-apis).
- [Conectar y probar](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- [Disponibilidad por plan](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
- [Facturación separada](https://help.openai.com/en/articles/9039756).
