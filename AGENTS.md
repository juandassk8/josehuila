# Inforce: instrucciones compartidas

Inforce es una aplicación existente. La biblioteca de anuncios pertenece a
**Creativos → Bibliotecas de anuncios**, también disponible en el portal de empresa.

## Arquitectura actual

- React 19, Vite 8 y JavaScript. Conservar la arquitectura existente.
- API Node en `api/`, adaptada para el VPS por `deploy/vps/server.mjs`.
- Autenticación propia, PostgreSQL y PostgREST; clientes de compatibilidad en
  `src/lib/localClient.js` y `shared/postgres-client.js`. Esta instalación ya no
  depende de un proyecto de Supabase ni de Vercel.
- Biblioteca: `src/team/ad_library/`, `api/_lib/adLibrary/`,
  `api/ad-library.js`, `services/ad-library/` y `db/ad_library*.sql`.
- Collector reemplazable, normalización, PostgreSQL, almacenamiento S3/R2 y API.
  BullMQ/Redis ejecuta crawls y medios fuera de las peticiones web.
- Leer `docs/estado-actual.md` y la documentación del área que se va a modificar.
  Los documentos antiguos que describen Supabase/Vercel son contexto histórico.

## Trabajo en paralelo

- Cada herramienta trabaja en una carpeta y rama propias, con una tarea concreta.
  Consultar `docs/colaboracion-agentes.md` para el procedimiento.
- No sobrescribir cambios ajenos, reiniciar el árbol de trabajo ni cambiar de
  rama en una carpeta que esté usando otro agente.
- Acordar primero cambios de contratos de API, esquema y dependencias compartidas.
- Mantener el alcance solicitado; documentar cambios, pruebas y pendientes al
  entregar. Una persona o agente integra y despliega una versión revisada.
- Los entornos de pruebas deben tener base, colas y almacenamiento separados de
  producción. Un worktree no aísla los servicios externos.
- No publicar secretos, `.env`, llaves SSH, dumps ni datos privados de clientes.
  No ejecutar pruebas con escrituras sobre producción sin autorización aplicable.

## Invariantes de la biblioteca

- Catálogo global por marca; seguimientos privados por empresa y guardados por
  usuario/empresa. Validar la pertenencia a la empresa en cada acceso.
- Archivos pesados en storage privado; deduplicación SHA-256 y URLs temporales.
- Una consulta parcial o limitada no confirma ausencia de anuncios. Conservar
  `first_seen`, `last_seen`, versiones y la evidencia de cada crawl.
- Respetar el límite global, los reintentos y el backoff. Chrome no garantiza
  acceso a Meta. La duración observada no demuestra ventas ni ROAS.
- SQL de producción aditivo y guardado en `db/`; no recrear bases existentes.

## Verificación

```sh
npm ci
npm test
node --test deploy/vps/server.test.mjs deploy/vps/security.test.mjs
npm run lint
npm run build
```

Para cambios pequeños, ejecutar las verificaciones relevantes. Las pruebas de
integración y los scripts operativos requieren servicios/configuración propios;
leerlos antes de ejecutarlos. No confundir pruebas locales con validación del VPS.

## Onboarding de clientes

Antes de cambiar onboarding, leer en orden `docs/decisiones.md`,
`docs/formulario-onboarding.md`, `docs/estandar-inforce.md` y
`docs/roadmap-onboarding.md`. Registrar allí las decisiones de onboarding del
usuario. Conservar el copy aprobado, español de Colombia, tuteo y diseño móvil.
Las respuestas se guardan por `campo` estable y `puntos_estandar`, nunca por número
de pregunta. El código está en `src/formulario/` y `api/onboarding-form.js`.
