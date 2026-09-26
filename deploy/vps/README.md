# Instalación independiente con PostgreSQL

Instalación: https://inforceconsulting.online/equipo. Administrador: juanda2494@gmail.com.
La contraseña inicial está en un archivo privado fuera del repositorio. No se reutiliza la contraseña SSH.

## Componentes y peticiones

- Nginx sirve `dist/` y reenvía `/api/` y `/backend/` a Node en `127.0.0.1:3001`.
- `server.mjs` adapta los endpoints existentes de `api/`. Conserva JSON, multipart y streaming.
- `backend.mjs` implementa autenticación, sesiones revocables, archivos locales y notificaciones SSE.
- PostgREST, un proyecto independiente, traduce consultas REST a PostgreSQL. Escucha exclusivamente en `127.0.0.1:3002`.
- PostgreSQL 16 contiene una base `inforce` nueva. La aplicación y PostgREST entran por socket Unix con usuarios del sistema separados; no se publica el puerto de datos.
- `shared/postgres-client.js` y `src/lib/localClient.js` sustituyen el SDK de Supabase. No se necesita una cuenta, clave ni servicio de Supabase.

El navegador envía correo y contraseña a `/backend/auth/v1/token`. Node comprueba el hash scrypt y crea una sesión. Cada consulta envía el JWT; Node verifica firma, vencimiento, versión del usuario y estado de la sesión antes de reenviarlo a PostgREST. PostgreSQL aplica las políticas RLS usando la identidad firmada. Los endpoints internos pueden usar una clave de servicio que nunca se incluye en el frontend.

## Credenciales y permisos

- Contraseñas: scrypt con salt aleatorio por contraseña; nunca se guardan en texto en la base.
- JWT de acceso: HS256, 15 minutos; guardado en el almacenamiento local del navegador.
- Renovación: token aleatorio en cookie `HttpOnly; SameSite=Lax`, 30 días. PostgreSQL solo guarda su SHA-256. Cerrar sesión revoca la sesión también para sus JWT pendientes.
- Cambiar contraseña revoca todas las sesiones del usuario. El registro público está desactivado.
- Configuración privada: `/etc/inforce/api.env` y `/etc/inforce/postgrest.env`, permisos 600.
- Las políticas históricas se completan con reglas restrictivas en `permissions.sql`: aislamiento entre empresas, tareas propias, límites de administración y bloqueo de elevación de rol.
- SSE transmite solo nombres de tablas y eventos. Los registros se vuelven a consultar con RLS.
- Archivos: `/var/lib/inforce/uploads`, nombres físicos UUID y metadatos privados en PostgreSQL. Los enlaces de archivos son públicos como en el comportamiento original; subir y borrar requieren sesión. HTML/SVG y otros formatos no permitidos para visualización se descargan como adjuntos.

La URL pública redirige HTTP, `www` y la IP anterior al dominio HTTPS canónico.
Las cookies de sesión incorporan `Secure` bajo HTTPS. Al pasar de la IP al dominio
hay que iniciar sesión otra vez: el almacenamiento y las cookies pertenecen a cada origen.

## Dominio y certificados

- DNS: `A @ → 144.91.92.87`; `CNAME www → inforceconsulting.online`.
- `/etc/inforce/api.env`: `PUBLIC_BASE_URL=https://inforceconsulting.online`.
  OAuth obtiene su issuer, endpoints y recurso MCP de ese origen.
- Nginx: `/etc/nginx/sites-available/inforce`, basado en `nginx.conf` de esta carpeta.
  El certificado del dominio cubre apex y `www`; el bloque TLS por defecto conserva
  el certificado de la IP para clientes que no envían SNI al abrir la dirección antigua.
- Certbot: `/opt/certbot-5.4/bin/certbot`, autenticación webroot en
  `/var/lib/letsencrypt`. El certificado del dominio está en
  `/etc/letsencrypt/live/inforceconsulting.online/`.
- `certbot-renew.timer` comprueba ambos certificados dos veces al día y recarga
  Nginx cuando renueva. `ProtectSystem=strict` necesita los tres `ReadWritePaths`
  declarados en la unidad; sin ellos Certbot falla al crear su archivo de bloqueo.

Para emitir el certificado antes de instalar una configuración que lo referencie,
el DNS debe resolver al VPS y HTTP debe servir `/.well-known/acme-challenge/`:

```sh
/opt/certbot-5.4/bin/certbot certonly --webroot -w /var/lib/letsencrypt \
  --cert-name inforceconsulting.online \
  -d inforceconsulting.online -d www.inforceconsulting.online --non-interactive
nginx -t
systemctl reload nginx
systemctl status certbot-renew.timer
```

El cambio de dominio del 26/09/2026 se aplicó a `/etc`, sin sustituir la release
de Claude ni reiniciar los workers. Respaldo privado de configuración y estado:
`/var/backups/inforce/domain-20260926T211113Z`. No copiar el `nginx.conf` histórico
de una release antigua sobre esta configuración al desplegar el scraper.

## Migraciones

`bootstrap.sql` crea las tablas iniciales que faltaban en el histórico del repositorio. `migrate-db.mjs` ordena y registra los scripts aplicados, traduce la publicación de cambios y omite configuración específica del antiguo proveedor.

Se excluyen semillas con datos personales/operativos, cron del proveedor anterior y backfills exclusivos de datos antiguos. `taxonomia_angulos.sql` y `taxonomia_formatos.sql` dependían de una función/columna manual ausente del repositorio y transformaban el banco original; no se importan esos datos. Se conservan los catálogos definidos por los demás scripts. La firma final del temporizador usa espacios.

Detener la API antes de ejecutar migraciones durante una actualización:

```sh
systemctl stop inforce-api
cd /opt/inforce/current
sudo -u postgres /usr/local/bin/node deploy/vps/migrate-db.mjs
systemctl start inforce-api
```

Solo continuar con el inicio si la migración termina correctamente. No ejecutar estos scripts sobre la base original de Inforce.

## Operación

Código activo: `/opt/inforce/current`. El 26/09/2026 apunta a
`/opt/inforce/releases/20260926-proxy-failover`, que integra MCP y el scraper
de Claude (`6303344`) con recuperación mediante el proxy de respaldo. Consultar
el enlace, `SOURCE_COMMIT`, el manifiesto y la bitácora antes de cada despliegue.

```sh
systemctl status inforce-api inforce-data nginx postgresql
journalctl -u inforce-api -n 100 --no-pager
curl http://127.0.0.1:3001/healthz
```

Las unidades se reinician automáticamente y arrancan después de reiniciar el VPS. Nginx limita cargas a 25 MB. `healthz` comprueba el proceso; las pruebas de humo verifican también autenticación, base y archivos.

Respaldo diario local: `inforce-backup.timer`, a las 08:00 UTC con hasta 5 minutos de dispersión. Guarda PostgreSQL, archivos y configuración en `/var/backups/inforce` con permisos privados. No elimina respaldos automáticamente. Verificar espacio y configurar una copia externa más adelante: un respaldo en el mismo VPS no protege frente a su pérdida. Para una restauración consistente, detener la API, restaurar el dump en una base vacía y restaurar los archivos y secretos del mismo respaldo.

## Validación y pendientes

```sh
npm test
node --test deploy/vps/server.test.mjs deploy/vps/security.test.mjs
npm run build
npm run lint
# En el VPS, como root, sin imprimir el archivo de secretos:
set -a; . /etc/inforce/api.env; set +a
node deploy/vps/smoke-test.mjs
node deploy/vps/schema-contract.mjs
```

Las pruebas de humo generan registros temporales con identificadores únicos y eliminan solo esos registros al terminar.
La verificación del esquema contrasta consultas y filtros literales del código con la API real. No sustituye las pruebas funcionales de todos los módulos.

Por decisión del usuario quedan sin configurar IA (OpenAI/Anthropic), Google OAuth, correo de recuperación y demás integraciones con credenciales externas. Los planes y datos de clientes de la instalación original no se copian; el archivo público local de planes empieza vacío. Las funciones que necesitan esas integraciones requieren configuración posterior.
