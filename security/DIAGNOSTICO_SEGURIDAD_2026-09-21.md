# Diagnóstico de seguridad de Inforce

> **Actualización del 22 de septiembre de 2026:** los hallazgos explotables de este informe fueron corregidos y desplegados. La evidencia y los asuntos operativos pendientes están en [`REMEDIACION_SEGURIDAD_2026-09-22.md`](REMEDIACION_SEGURIDAD_2026-09-22.md). Este documento conserva el estado original para trazabilidad.

**Fecha:** 21 de septiembre de 2026 (America/Bogota)  
**Aplicación:** `josehuilaa/inforce-app` desplegada en `144.91.92.87`  
**Resultado:** riesgo crítico; no se recomienda ingresar datos reales ni entregar cuentas a clientes antes de corregir SEC-01, SEC-02, SEC-03 y SEC-05.

## Resumen ejecutivo

El aislamiento básico de PostgreSQL está mejor de lo que suele encontrarse en una migración reciente: las 101 tablas públicas tienen RLS, el rol anónimo no tiene acceso a ellas, PostgreSQL y los dos servicios de datos escuchan solo en loopback, los tokens manipulados se rechazan y los secretos de ejecución tienen permisos de archivo restrictivos.

La capa de API que utiliza credenciales de servicio anula esas protecciones en varios puntos. Se reprodujo una toma de cuenta completa: el propietario de una empresa pudo crear una ficha de su propia empresa enlazada al UUID de una cuenta administradora ajena, pedir un cambio de contraseña y entrar con la nueva contraseña. También se comprobó que cualquier miembro activo del equipo, incluso con rol `editor`, puede cambiar la contraseña del dueño de otra empresa y leer sus usuarios de onboarding.

Se reprodujo además una SSRF: un miembro del equipo entregó al endpoint de portadas una URL de loopback, el servidor descargó su propio `/healthz`, guardó la respuesta como si fuera una imagen y la publicó sin autenticación. La prueba se limitó deliberadamente al endpoint inocuo de salud de esta misma aplicación.

El despliegue solo ofrece HTTP. Por eso el inicio de sesión, el token de acceso y la cookie de renovación viajan sin cifrado. Este riesgo es inmediato mientras la aplicación se use por IP.

Se registran **1 hallazgo crítico, 7 altos y 5 medios**. Las pruebas activas utilizaron cuatro usuarios y dos empresas desechables. La limpieza posterior confirmó cero usuarios, empresas y tareas con el prefijo de auditoría, y no quedó ningún archivo temporal en el directorio de uploads. No se consultó ni se modificó la cuenta administradora real.

## Alcance y método

Se revisaron el frontend React/Vite, las rutas `api/`, el backend nativo de autenticación/REST/archivos/SSE, SQL y políticas RLS, configuración de Nginx y systemd, dependencias npm y configuración efectiva del VPS. Se hicieron solicitudes HTTP autenticadas con fixtures desechables para comprobar límites de autorización, revocación, aislamiento entre empresas y SSRF.

El host inspeccionado ejecutaba Ubuntu 24.04.5 LTS, Nginx 1.24.0, Node 22.23.2 y PostgreSQL 16.15. Estaban públicos únicamente SSH en el puerto 22 y HTTP en el 80; Node, PostgREST y PostgreSQL estaban ligados a loopback. Los servicios `inforce-api`, `inforce-data`, Nginx y PostgreSQL estaban activos.

Quedaron fuera una prueba de carga, restauración real del backup, ataque a proveedores externos y explotación de las vulnerabilidades de librerías. Las integraciones de IA, correo, Drive y Apify no tenían claves configuradas, por lo que se analizó su código pero no se invocaron terceros.

## Hallazgos

| ID | Severidad | Hallazgo | Estado |
|---|---:|---|---|
| SEC-01 | Crítica | Un propietario puede cambiar la contraseña de una identidad ajena mediante un vínculo falsificado | Explotación confirmada con fixture |
| SEC-02 | Alta | Un miembro `editor` puede administrar usuarios y datos de cualquier empresa | Explotación confirmada con fixtures |
| SEC-03 | Alta | SSRF en el rehosting de portadas y publicación de la respuesta interna | Explotación confirmada contra `/healthz` |
| SEC-04 | Alta | Desactivar un miembro no revoca la sesión ni todo su acceso a datos | Escritura confirmada tras desactivación |
| SEC-05 | Alta | Credenciales y tokens se transmiten por HTTP | Confirmado en el despliegue |
| SEC-06 | Alta | Dependencias de producción con avisos de seguridad | 5 paquetes altos, 3 moderados |
| SEC-07 | Alta | SSH permite `root` mediante contraseña; sin UFW ni fail2ban | Confirmado en configuración efectiva |
| SEC-08 | Alta condicional | Una credencial de PostgreSQL permanece en el historial Git | Exposición confirmada; vigencia no probada |
| SEC-09 | Media | Contraseña generada y token de acceso permanecen en `localStorage`; `/debug` los muestra | Confirmado por código |
| SEC-10 | Media | Cabeceras de seguridad desaparecen en la ruta principal y no existe CSP | Confirmado por respuesta HTTP |
| SEC-11 | Media | Límites por IP confían en un `X-Forwarded-For` manipulable | Confirmado por código y Nginx |
| SEC-12 | Media | Archivos de cuatro buckets son públicos para quien conozca su ruta | Confirmado por código y prueba HTTP |
| SEC-13 | Media | Backup y registros no cubren una recuperación o investigación completa | Confirmado por configuración |

### SEC-01 — Toma de cuenta por vínculo de identidad falsificado

Las políticas permiten que el propietario administre filas de `company_team_members` de su empresa, incluyendo `auth_user_id`. El endpoint de restablecimiento carga esa fila con el cliente de servicio y toma `member.auth_user_id` como identidad a modificar. Comprueba que la ficha pertenece a una empresa administrable, pero no que ese UUID pertenezca realmente a la persona o a una identidad que el propietario tenga derecho a administrar.

Prueba realizada:

1. Se creó un propietario y un administrador desechables.
2. El propietario insertó en su empresa una ficha con correo inocuo y `auth_user_id` del administrador desechable.
3. `POST /api/admin-create-client-user` con `action=reset-member` respondió 200.
4. El inicio de sesión del administrador con la contraseña devuelta respondió 200.

Evidencia: [`permissions.sql`](../deploy/vps/permissions.sql), líneas 9-11 y 74-80; [`admin-create-client-user.js`](../api/admin-create-client-user.js), líneas 74-100 y 120-152; resultado `owner_resets_unrelated_admin_fixture` en [`diagnostic-results.jsonl`](diagnostic-results.jsonl).

Corrección: hacer inmutables para clientes `auth_user_id`, `email`, `is_owner` y `roles`; crear vínculos únicamente desde una invitación firmada y verificada por el servidor; antes de cambiar una contraseña comprobar por ID que el usuario objetivo pertenece a la empresa y no es una cuenta interna o compartida; limitar el cambio de credenciales globales a administradores reales o al flujo de recuperación del propio usuario. Añadir pruebas de regresión con UUID y correo falsificados.

### SEC-02 — Administración cruzada entre empresas

`requireTeamMember()` solo exige una fila activa en `team_members`; no distingue administrador de editor ni limita una empresa. Varias rutas usan después el cliente de servicio. En `admin-create-client-user`, las acciones generales aceptan un `companyId` suministrado por el cliente y permiten modificar al dueño de esa empresa. En `onboarding-form`, las acciones `usuarios` y `nueva-clave` se protegen solo con `requireTeamMember()`.

Con un editor desechable se obtuvieron los usuarios de una empresa ajena y se cambió la contraseña de su dueño; el inicio de sesión con la nueva contraseña confirmó la toma. El mismo patrón alcanza a `finance-ai` y al token compartido de Drive cuando esas integraciones sean habilitadas.

Evidencia: [`auth.js`](../api/_lib/auth.js), líneas 39-53; [`admin-create-client-user.js`](../api/admin-create-client-user.js), líneas 50-57 y 228-247; [`onboarding-form.js`](../api/onboarding-form.js), líneas 407-424; resultados `editor_resets_other_company_owner` y `editor_reads_other_company_onboarding_users`.

Corrección: implementar funciones centrales `requireRealAdmin` y `requireCompanyManager(companyId)`; derivar la empresa desde el registro objetivo cuando sea posible; no confiar en un `companyId` del body; usar el cliente sujeto a RLS para operaciones ordinarias; reservar el cliente de servicio para una operación pequeña y validada. Aplicar explícitamente la misma matriz de roles a finanzas, onboarding y Drive.

### SEC-03 — SSRF y publicación de contenido interno

`rehost-covers` acepta hasta 30 URLs de cualquier miembro activo. `bajar()` hace `fetch()` con redirecciones automáticas, sin validar protocolo, hostname, resolución DNS ni rangos privados. Lee toda la respuesta antes de aplicar el límite de 8 MB y, si los bytes no reconocen una imagen, los etiqueta como JPEG. El resultado se guarda en un bucket público.

Se pidió `http://127.0.0.1:3001/healthz`; la API respondió 200, publicó el archivo y una lectura anónima recuperó `{"status":"ok"}`. No se sondearon metadata cloud, otros puertos ni recursos sensibles. `drive-backup` sí valida la URL inicial como HTTPS, pero sigue redirecciones sin volver a validar cada destino y también carga el cuerpo completo antes del límite.

Evidencia: [`rehost-covers.js`](../api/rehost-covers.js), líneas 12-24; [`covers.js`](../api/_lib/covers.js), líneas 19-45; [`drive-backup.js`](../api/drive-backup.js), líneas 22-46; resultado `ssrf_loopback_health_published`.

Corrección: usar una lista cerrada de hosts CDN requeridos; resolver DNS y rechazar loopback, RFC1918, link-local, IPv6 local y direcciones reservadas; desactivar redirecciones automáticas y repetir la validación en cada salto; fijar la IP resuelta para evitar DNS rebinding; agregar timeout, streaming y corte por bytes; rechazar todo contenido que no sea una imagen válida; añadir cuotas por usuario y empresa.

### SEC-04 — La desactivación no revoca todo el acceso

El backend valida `auth.users.disabled`, versión de token y sesión, pero no consulta `team_members.active`. Las políticas de varias tablas tampoco requieren miembro activo para caminos como `created_by=auth.uid()`. Tras poner `active=false` a un editor desechable, su token vigente pudo modificar una tarea propia y el cambio quedó persistido.

Evidencia: [`backend.mjs`](../deploy/vps/backend.mjs), líneas 51-57; [`permissions.sql`](../deploy/vps/permissions.sql), líneas 44-70; resultado `inactive_editor_still_writes_own_tasks`.

Corrección: definir el efecto exacto de “desactivar” y aplicarlo de forma atómica: revocar sesiones, incrementar `token_version` o deshabilitar la identidad cuando corresponde; exigir membresía activa en las políticas de recursos internos; conservar acceso de cliente solo mediante una relación de cliente explícita. Añadir una prueba que recorra todas las familias de tablas con una cuenta recién desactivada.

### SEC-05 — HTTP sin TLS

Nginx escucha en el puerto 80 y no existe listener 443. `PUBLIC_BASE_URL` usa HTTP, de modo que la cookie de renovación se emite `HttpOnly; SameSite=Lax` pero sin `Secure`. El token de acceso se guarda en el navegador y viaja como Bearer por la red. Una persona que observe o altere el tráfico puede robar credenciales, tokens y contenido.

Evidencia: [`backend.mjs`](../deploy/vps/backend.mjs), líneas 35-40; configuración efectiva del VPS y respuesta de `http://144.91.92.87`.

Corrección: emitir un certificado para un dominio o para la IP si el proveedor elegido lo admite, habilitar 443, redirigir 80 a 443, cambiar `PUBLIC_BASE_URL` a HTTPS y comprobar que la cookie lleve `Secure`. Después agregar HSTS, inicialmente con una duración corta y luego ampliarla.

### SEC-06 — Dependencias vulnerables

`npm audit --omit=dev` informó 8 paquetes vulnerables: 5 altos y 3 moderados. Los directos de mayor interés son `pdfjs-dist@5.6.205` y `xlsx@0.18.5`; ambos procesan archivos suministrados por usuarios. La aplicación llama `pdfjs.getDocument({data})` y `XLSX.read()` en el navegador. No se intentó explotar un documento malicioso, por lo que el alcance exacto de cada aviso en este modo de uso queda por verificar.

SheetJS 0.18.5 está afectado por avisos de prototype pollution y ReDoS; npm no ofrece una versión corregida del paquete. PDF.js requiere actualización mayor según el reporte. El conjunto completo, incluyendo herramientas de desarrollo, informó 19 paquetes: 11 altos, 7 moderados y 1 bajo. Las dependencias de desarrollo no están servidas por el VPS.

Evidencia: [`dependency-audit-summary.json`](dependency-audit-summary.json), los reportes crudos `inforce-audit-production.json` e `inforce-audit-all.json`, y usos en [`extractFileText.js`](../src/workspace/guiones/extractFileText.js), líneas 28-55, y [`ProductInfoPanel.jsx`](../src/workspace/guiones/ProductInfoPanel.jsx), líneas 641-643. Referencias: [SheetJS GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) y [PDF.js GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).

Corrección: actualizar y probar Tiptap y sus dependencias; migrar PDF.js a una versión corregida; reemplazar la distribución npm de SheetJS por una versión corregida obtenida del canal oficial o por otra librería mantenida. Añadir límites de tamaño y complejidad antes de analizar PDF/XLSX y procesarlos en un worker aislado. No aplicar `npm audit fix --force` sin revisar los cambios mayores.

### SEC-07 — Acceso administrativo del VPS expuesto por contraseña

La configuración efectiva de SSH tiene `PermitRootLogin yes`, `PasswordAuthentication yes` y seis intentos. UFW está inactivo y fail2ban no está instalado/activo. El servidor sí puede tener filtrado en el proveedor, pero no se verificó desde el host. La contraseña de root se compartió durante el despliegue, por lo que debe considerarse expuesta aunque este informe no la reproduce.

Corrección: crear una cuenta administrativa nominal con sudo, instalar y probar su llave SSH en una segunda sesión, rotar la contraseña de root y después desactivar el login de root y la autenticación por contraseña. Activar un firewall con 22/80/443 inicialmente; cerrar 80 al terminar la redirección si la política lo permite. Añadir protección contra fuerza bruta. El host además indicaba reinicio pendiente; programarlo después de verificar servicios y backup.

### SEC-08 — Credencial en historial Git

El commit base contiene URIs de PostgreSQL con credencial en `scripts/run_sql.mjs` (líneas 12-16) y `scripts/setup-inforce-central.mjs` (línea 7). La copia de trabajo ya eliminó ese valor, pero borrarlo del archivo actual no lo quita del historial. No se intentó usar esa credencial contra el servicio original y no se confirmó si sigue vigente.

Corrección: rotar la credencial en el proveedor original; revisar logs de acceso; limpiar el historial si el repositorio se distribuye; agregar detección de secretos en pre-commit y CI. La base PostgreSQL independiente del VPS usa autenticación local y no depende de esa contraseña histórica.

### SEC-09 — Secretos del navegador visibles y persistentes

La sesión, incluido el access token, se guarda en `localStorage` bajo `inforce-local-auth`. El formulario guarda durante siete días el correo y la contraseña generada en texto claro. La ruta pública `/debug` enumera y muestra todo `localStorage` y `sessionStorage`. Cualquier XSS en el mismo origen, extensión maliciosa o acceso al perfil del navegador puede recuperar esos valores; `/debug` también facilita exponerlos por captura de pantalla o soporte remoto.

Evidencia: [`localClient.js`](../src/lib/localClient.js), líneas 3-18; [`FormularioPage.jsx`](../src/formulario/FormularioPage.jsx), líneas 382-395; [`DebugPage.jsx`](../src/landing/DebugPage.jsx), líneas 11-47; ruta en [`App.jsx`](../src/App.jsx), líneas 6823-6824.

Corrección: mantener access y refresh token en cookies `HttpOnly`, `Secure` y con protección CSRF; no persistir contraseñas. Mostrarlas una sola vez y ofrecer regeneración. Retirar `/debug` de builds de producción o enmascarar valores y protegerlo con rol administrador.

### SEC-10 — Cabeceras del documento principal incompletas

Nginx declara `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` en el servidor, pero `location /` declara su propio `add_header Cache-Control`; en Nginx 1.24 esto evita heredar los anteriores. La respuesta real del HTML solo mostró `Cache-Control: no-store`. No hay Content-Security-Policy.

Evidencia: [`nginx.conf`](../deploy/vps/nginx.conf), líneas 10-13 y 42-44; cabeceras observadas en la respuesta del VPS.

Corrección: incluir todas las cabeceras dentro de `location /` o reutilizar un archivo `include`; añadir una CSP probada, empezando en `Report-Only`; usar `frame-ancestors`, `object-src 'none'`, `base-uri 'self'` y una política estricta para scripts y conexiones.

### SEC-11 — Evasión de límites por IP

Nginx concatena el encabezado entrante con `$proxy_add_x_forwarded_for`. `onboarding-form` y `notify-password-reset` toman el primer elemento de `X-Forwarded-For`. Un cliente puede enviar su propio primer valor y variar el límite. El login nativo usa `X-Real-IP`, que Nginx sobrescribe correctamente, por lo que este hallazgo no afecta ese límite concreto.

Evidencia: [`nginx.conf`](../deploy/vps/nginx.conf), líneas 16-33; [`onboarding-form.js`](../api/onboarding-form.js), línea 56; [`notify-password-reset.js`](../api/notify-password-reset.js), línea 28.

Corrección: con un único proxy, reemplazar el valor por `$remote_addr` o consumir exclusivamente `X-Real-IP`; si se añade CDN, configurar explícitamente proxies confiables y validar la cadena desde el salto confiable más cercano.

### SEC-12 — Almacenamiento público por ruta

Los buckets `despliegue-examples`, `feedback-images`, `tutorials` y `content-screenshots` aceptan lecturas anónimas bajo `/object/public/`. No existe autorización por empresa al leer; la única barrera es conocer o adivinar el nombre. Las capturas de feedback y contenido pueden contener información sensible. La prueba SSRF confirmó una lectura anónima real.

Evidencia: [`backend.mjs`](../deploy/vps/backend.mjs), líneas 168-182; [`feedback_db.js`](../src/feedback/feedback_db.js), líneas 47-54.

Corrección: clasificar los buckets; mantener público solo material destinado a publicación; servir feedback y capturas mediante rutas autenticadas con comprobación de empresa, o URLs firmadas cortas. Añadir cuota total por empresa y validar el tipo real del archivo, no solo el encabezado enviado.

### SEC-13 — Recuperación y trazabilidad incompletas

El backup diario existe, está protegido con permisos 700/600 y se produjo una copia inicial válida para `pg_restore --list`. Sin embargo, permanece en el mismo VPS, no tiene retención explícita ni copia externa, y no se hizo restauración completa. Tampoco existe un registro de auditoría de cambios de contraseña, gestión de usuarios y operaciones de servicio; los logs actuales permiten ver solicitudes y errores, pero no reconstruir con fiabilidad quién cambió qué.

Corrección: cifrar y copiar backups fuera del VPS, definir retención, alertar fallos y hacer restauraciones periódicas; registrar actor, objetivo, empresa, acción, resultado, IP confiable y fecha para operaciones sensibles, sin guardar contraseñas ni tokens.

## Controles que sí funcionaron

- Una solicitud anónima a tablas devolvió 401 y un propietario no pudo ver filas de otra empresa mediante REST.
- Un editor no pudo elevar su propio rol ni agregarse a otra empresa mediante `client_users`; ambas operaciones devolvieron 403.
- Un JWT alterado devolvió 401.
- Las 101 tablas públicas tenían RLS habilitado y el rol `anon` no tenía privilegios de tabla.
- PostgreSQL, PostgREST y Node estaban ligados a `127.0.0.1`/`::1`.
- Las contraseñas se almacenan con scrypt (`N=32768, r=8, p=1`, salt aleatorio); cambiar una contraseña incrementa la versión de token y revoca sesiones.
- Los access tokens duran 15 minutos; los refresh tokens aleatorios se almacenan como SHA-256 y la cookie es `HttpOnly; SameSite=Lax`.
- Los archivos de entorno eran `600`, sus directorios `700`, y los servicios se ejecutaban sin privilegios de root.
- `unattended-upgrades` estaba activo.

## Orden recomendado de remediación

1. Bloquear hoy los cambios de contraseña y vínculos de identidad de SEC-01/SEC-02, o restringir temporalmente esas rutas a un administrador real.
2. Desactivar temporalmente `rehost-covers` hasta corregir la SSRF.
3. Habilitar HTTPS antes de distribuir credenciales o usar la app fuera de una red controlada.
4. Corregir la semántica de desactivación y revocar las sesiones de miembros desactivados.
5. Rotar accesos de infraestructura e históricos: root y la credencial antigua de PostgreSQL.
6. Actualizar dependencias y aislar los parsers de documentos.
7. Corregir cabeceras, almacenamiento del navegador, rate limits y privacidad de archivos.
8. Completar backup externo, restauración probada y auditoría de acciones.

## Evidencia reproducible

El script [`diagnostic.mjs`](diagnostic.mjs) requiere la variable explícita `SECURITY_AUDIT_ALLOW_FIXTURES=1`, usa nombres únicos y elimina sus fixtures en `finally`. Sus resultados preservados están en [`diagnostic-results.jsonl`](diagnostic-results.jsonl). El resumen de dependencias está en [`dependency-audit-summary.json`](dependency-audit-summary.json); los JSON crudos de npm audit se conservaron fuera de esta carpeta para no alterar sus datos.
