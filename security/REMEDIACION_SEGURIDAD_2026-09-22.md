# Remediación de seguridad de Inforce

**Fecha:** 22 de septiembre de 2026 (America/Bogota)  
**Despliegue:** `https://144.91.92.87`  
**Resultado:** se corrigieron y desplegaron todos los ataques reproducidos. Dos tareas operativas externas siguen abiertas: rotar una credencial histórica en su proveedor original y configurar una copia de seguridad fuera del VPS.

## Estado de los hallazgos

| ID | Estado | Comprobación |
|---|---|---|
| SEC-01 | Corregido | Un propietario que falsifica `auth_user_id` recibe 403 y tampoco puede restablecer una identidad ya existente. |
| SEC-02 | Corregido | Un editor recibe 403 al restablecer cuentas o leer usuarios de onboarding de otra empresa. Finanzas y tokens de Drive exigen administrador real. |
| SEC-03 | Corregido | Las descargas del servidor exigen HTTPS, rechazan IPs y redes privadas, validan cada resolución y redirección, fijan la conexión a la IP validada, limitan tiempo y bytes y rechazan contenido que no sea imagen. El ataque contra loopback no publicó el recurso. |
| SEC-04 | Corregido | Desactivar un miembro invalida el inicio de sesión y las sesiones existentes; tareas, asignaciones y pausas exigen membresía activa. |
| SEC-05 | Corregido | HTTPS válido para la IP, redirección 80→443, cookie `Secure`, TLS 1.2/1.3 y HSTS. La renovación simulada del certificado pasó y el temporizador se ejecuta dos veces al día. |
| SEC-06 | Corregido | `npm audit` informa 0 avisos en producción y 0 en el conjunto completo. PDF.js, SheetJS y Tiptap quedaron actualizados y alineados. |
| SEC-07 | Corregido | `root` tiene la contraseña bloqueada y no puede entrar por SSH. Solo `inforce-admin` puede entrar mediante la llave fuerte; la contraseña SSH está desactivada. UFW permite únicamente 22/80/443 y Fail2ban protege SSH. |
| SEC-08 | Pendiente externo | El valor ya no está en el código actual ni lo usa este despliegue. Debe rotarse en el proveedor PostgreSQL original y, si el repositorio se comparte, limpiarse del historial Git. |
| SEC-09 | Corregido | Access token y sesión viven en memoria; se elimina el estado antiguo de `localStorage`; la contraseña generada solo vive durante la pestaña; `/debug` solo se compila en desarrollo. |
| SEC-10 | Corregido | El HTML entrega CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`. Nginx no publica su versión. |
| SEC-11 | Corregido | Nginx reemplaza las IP de proxy por `$remote_addr`; los límites usan `X-Real-IP` confiable o la dirección del socket. |
| SEC-12 | Corregido | `feedback-images` y `content-screenshots` exigen una sesión. Una prueba anónima recibe 401 y una sesión válida puede leer el archivo. Portadas y tutoriales permanecen públicos por diseño. |
| SEC-13 | Parcial | Existe un backup local previo al despliegue y servicios/logs persistentes. Falta una copia cifrada fuera del servidor y una restauración periódica probada. |

## Servidor endurecido

- Ubuntu reiniciado con kernel `6.8.0-139-generic`; servicios API, datos, Nginx, PostgreSQL, Fail2ban y renovación TLS activos.
- PostgreSQL y Node escuchan solo en loopback. UFW deniega por defecto toda entrada salvo SSH, HTTP y HTTPS.
- SSH efectivo: `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, tres intentos y únicamente `inforce-admin`.
- La llave autorizada está en `D:\Downloads\JOSE HUILA\inforce-vps-admin-ed25519`; su frase aleatoria está en el archivo local protegido `D:\Downloads\JOSE HUILA\inforce-vps-admin-ed25519.passphrase.txt`.
- Certificado Let’s Encrypt para `144.91.92.87`, emitido por YE1 y renovado automáticamente mediante `certbot-renew.timer`. La simulación de renovación terminó correctamente.

## Validación

- Frontend: 50 archivos de pruebas, 691 pruebas aprobadas.
- Backend nativo: 8 pruebas aprobadas.
- Compilación de producción: aprobada.
- ESLint: 0 errores; quedan 491 advertencias históricas de calidad de código.
- Dependencias: 0 avisos conocidos en producción y 0 en todas las dependencias según npm audit al 22 de septiembre de 2026.
- Contrato PostgreSQL: 490 consultas verificadas, 0 fallos.
- Smoke test público: login, refresh, aislamiento de empresas, bloqueo de privilegios, SSE, privacidad de archivos y revocación de logout aprobados.
- Regresión ofensiva: cuatro escalaciones bloqueadas con 403, usuario desactivado bloqueado con 401 y SSRF a loopback sin publicación.
- Limpieza: 0 usuarios y 0 empresas de prueba restantes.

La evidencia de ejecución está en [`regression-results.txt`](regression-results.txt), [`smoke-results.txt`](smoke-results.txt), [`schema-contract-results.txt`](schema-contract-results.txt), [`fixture-cleanup-results.txt`](fixture-cleanup-results.txt) y [`hardening-status.txt`](hardening-status.txt).

## Riesgo residual y mantenimiento

Ninguna aplicación conectada a Internet puede prometer riesgo cero. Este despliegue bloquea los fallos confirmados y reduce de forma importante la superficie expuesta, pero debe mantenerse: aplicar actualizaciones, revisar logs, renovar dependencias, probar restauraciones y repetir estas regresiones después de cambios en autenticación, permisos, almacenamiento o descargas externas.

Las siguientes acciones requieren acceso o una decisión fuera de este repositorio:

1. Rotar la credencial PostgreSQL histórica en el proveedor donde fue emitida.
2. Elegir un destino externo para backups cifrados y probar una restauración.
3. Mover la frase de la llave SSH a un gestor de contraseñas y borrar después el archivo local de frase.
4. Añadir MFA para administradores cuando se defina el proveedor de identidad definitivo.
