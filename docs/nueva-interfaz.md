# Nueva interfaz de Inforce

Primera entrega, 6 de octubre de 2026. Ruta independiente `/nueva`.
Referencia: transcripción completa Daniel/José Huila del 3 de octubre y kit
`NUEVA INTERFAZ/kit-diseno`, especialmente login, sidebar y biblioteca.
La aclaración del usuario prevalece: **solo cambia el frontend**.

## Alcance y rutas

| Ruta | Contenido |
| --- | --- |
| `/nueva` o `/nueva/universo` | Universo de marca: perfil, productos, voz y documentos existentes. |
| `/nueva/biblioteca` | Biblioteca de anuncios completa, con seguimientos, guardados, señales y fanpages/dominios. |
| `/nueva/admin` | Administración de plataforma, fuera de la navegación de empresa y limitada al rol administrador actual. |
| `/nueva/login` | Único formulario de correo y contraseña de la nueva experiencia. |
| `/nueva/registro` | Entrada única de registro; explica la habilitación por administrador que admite hoy el backend. |
| `/nueva/recuperar` | Indicación de recuperación mediante el administrador, sin simular correos. |

Las rutas protegidas de esta experiencia llevan al nuevo login y conservan un
destino de retorno local bajo `/nueva`. Una cuenta autenticada no vuelve a ver
el formulario. El parámetro `empresa` solo selecciona empresas devueltas por
los permisos actuales; nunca amplía acceso. Las rutas anteriores se conservan
durante la migración. La aplicación anterior carga desde `src/LegacyRoot.jsx`.

## Mismo backend

- Mismos clientes `src/lib/backend.js`/`localClient.js`, cookie de sesión, API,
  PostgreSQL, PostgREST, RLS y membresías. Sin dependencias nuevas.
- Universo consulta `companies`, `company_voice_profile`,
  `brand_profile_data` y `company_expertise_documents`. Los productos y la voz
  se guardan en los campos existentes. Las ediciones comparan `updated_at`
  para detectar cambios concurrentes en lugar de sobrescribirlos en silencio.
- Se reutiliza `AdLibraryPage`; no se duplican catálogo, scraper, colas,
  conexiones, históricos ni guardados. Cambian únicamente el contenedor y la piel.
- Se reutiliza `AdministrationPage`; las API siguen comprobando permisos.
- El backend actual tiene registro público cerrado y correo de recuperación
  sin configurar. Estas pantallas no activan ni prometen ninguna de esas funciones.
- La base para varias personas por empresa es la pertenencia actual mediante
  `auth_user_id`. Crear invitaciones, correos y nuevos permisos queda para una
  fase posterior, como pidió el usuario. No se mandaron correos ni invitaciones.

## Dirección visual

Fondo azul muy oscuro, superficies de cristal, acento azul en acciones, Sora y
DM Mono. Fuentes incluidas localmente con sus licencias OFL para respetar la CSP
actual del VPS. Estilos acotados a `.nf-app`; los estilos globales anteriores no
se cargan al entrar a `/nueva`. Menú con solo dos módulos, selector de empresa,
usuario y cierre de sesión. Panel de administración independiente. Navegación
móvil en diálogo, foco visible, enlaces accesibles y movimiento reducido.
Por ajuste solicitado después de la primera revisión, la barra lateral de
escritorio está integrada al borde izquierdo, de alto completo, sin márgenes
exteriores, esquinas redondeadas ni sombra de tarjeta flotante.
Administración usa el mismo lateral integrado con sus ocho secciones, sin
selector de empresa ni módulos de cliente. La sección queda en
`/nueva/admin?seccion=proxies` (u otra sección), admite recarga y Atrás/Adelante.
Los accesos desde el resumen y los filtros de historial se conservan; el panel
anterior mantiene sus pestañas. En móvil se abre el menú de administración.

## Próximos pasos extraídos de la reunión

1. Consolidar esta base: universo/productos/voz y biblioteca de competidores.
   Revisar con usuarios reales antes de convertirla en interfaz principal.
2. Plan creativo por etapas del embudo y proyectos/tareas del equipo, con
   guiones apoyados en el contexto de la marca. Incorporar cada módulo cuando
   su flujo esté definido; no mostrar menús vacíos ni los módulos internos de
   gestión diaria a las empresas.
3. Invitaciones y administración de integrantes dentro de cada empresa;
   decidir correo, altas y permisos antes de cambiar el backend.
4. Creación de imágenes y luego video, referencias y activos de cada marca.
   Validar la integración con el ChatGPT propio de cada empresa sin asumir
   generación ilimitada ni capacidades todavía no comprobadas.
5. Publicación y métricas de canales publicitarios; después investigación y
   contenido orgánico. Definir alcance y costes antes de incorporar proveedores.

El nombre Inforce se conserva hasta una decisión de marca. No se introducen
planes, precios, promesas comerciales ni políticas de almacenamiento inventadas.

## Verificación de esta entrega

- 1.035 pruebas Vitest, incluidas 22 nuevas de rutas, roles, selección de empresa,
  carga y guardado con detección de conflictos; 8 pruebas de servidor/seguridad.
- Lint focal sin errores; avisos de efectos React y del código heredado. Build
  de producción revisado localmente y al preparar la release del VPS.
- Interfaz real contra API de pruebas aislada, sin credenciales ni escrituras
  de producción: login válido/inválido, producto, cambio de empresa, biblioteca,
  error de administración, menú móvil y rechazo de administración a un usuario
  de empresa. Anchuras revisadas: 320, 375, 414, 768 y escritorio.
- No confundir esas pruebas con un inicio de sesión de un cliente en producción.
  La publicación se comprueba por HTTP, archivos, CSP y pantalla de login.

## Publicación y reversión

Release prevista: `/opt/inforce/releases/20261006-nueva-interfaz-v2`, construida
desde `20261006-brand-network` tras verificar su manifiesto de 1.432 archivos.
El parche contiene solo `src/nueva`, entrada/router, documentos y fuentes.
Se conserva el frontend previo en la release anterior y sus assets con hash
para pestañas abiertas. No hay migraciones SQL, reinicios de API/worker/scheduler,
actualizaciones de contenedores, cambios de configuración ni nuevas extracciones.

Reversión: restablecer atómicamente `/opt/inforce/current` a
`/opt/inforce/releases/20261006-brand-network`; no requiere revertir datos.
El backend en ejecución conserva su proceso y directorio anterior.
No se hizo commit ni push para esta entrega.

La validación de navegador detectó que el CSS anterior importaba Google Fonts,
bloqueado por la CSP al cargarlo como chunk. Se revirtió la primera activación
y se incluyeron también las mismas fuentes antiguas localmente. Solo cambia
la fuente del import de `src/index.css`; sus reglas visuales se conservan.
La segunda compilación se verifica con la misma CSP antes de activar.

## Fotos de las fanpages en anuncios

Las tarjetas, el detalle y el selector de fanpage individual muestran la foto
pública de Facebook a partir del `meta_page_id` que ya entrega el backend. Cada
anuncio se relaciona por su `brand_id`, incluso al mezclar marcas o agrupaciones.
No se infiere el logo por nombre ni por dominio. El navegador carga la imagen
con carga diferida y sin enviar el referente de Inforce; si Facebook no responde
o falta el ID, conserva la inicial sin mostrar una imagen rota. Se comparte el
componente con la biblioteca anterior. No requiere migración, claves ni cambios
en los scrapers. La imagen se consulta a Facebook; no queda archivada en R2.

## Empresas archivadas en el selector

Los administradores activos pueden abrir las empresas archivadas que el backend
ya les permite consultar. Aparecen en el grupo «Empresas archivadas», marcadas
como «Archivada». Esto conserva el acceso a las bibliotecas y datos previos sin
desarchivar ni mover seguimientos. Las empresas activas siguen siendo la opción
por defecto. Para clientes y otros roles se mantiene el filtro de empresas
activas; los permisos del backend siguen aplicándose a todas las consultas.

## Menú y selector con el kit visual

La selección del menú usa el borde completo, fondo de cristal, tipografía e
indicador azul del kit original. Se comparte entre los módulos de empresa y
administración y conserva el lateral integrado sin márgenes exteriores.

El selector nativo de empresas se reemplaza por `WorkspaceSwitcher`: desplegable
oscuro con iniciales, empresa seleccionada y grupo de empresas archivadas. Usa
solo las empresas autorizadas que ya entrega `loadWorkspace`, conserva la ruta
del módulo al cambiar y no modifica permisos ni datos. Admite flechas,
Inicio/Fin, búsqueda por letras, Enter/Espacio, Escape, Tab y clic exterior;
Escape dentro del selector móvil lo cierra antes de cerrar el menú completo.
# Universo de marca ampliado · 07/10/2026

El punto 1 de la beta se desarrolla en el mismo módulo: perfil y público, fichas
de producto con precio/oferta, galería privada, documentos y voz. Ver
[Universo de marca](universo-de-marca.md) para el contrato de datos y validaciones.
El Mapa creativo es el punto 2 asignado a Claude, con archivos y ruta separados.
