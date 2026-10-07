# Universo de marca · primera fase de la beta

7 de octubre de 2026. Reunión Daniel/José del 3 de octubre: contexto manual de
marca y producto antes de biblioteca → mapa creativo → guion → producción.
Se conserva el frontend `/nueva` y el backend propio de Inforce. No hay generación
IA, consultas al scraper ni conexión a servicios de pago en este módulo.

## Funciones

- Perfil: nicho, descripción, público, diferenciación y posicionamiento.
- Productos: crear, buscar y editar; preguntas específicas del nicho, beneficios,
  público, precio con moneda, oferta/condiciones, enlace y contexto adicional.
- Fotos: hasta 12 por producto, JPG/PNG/WebP de 8 MB como máximo; portada y
  descripción. Se suben al guardar. No se introducen imágenes de demostración
  en datos reales. Un fallo de foto conserva el resto del formulario.
- Documentos del producto: importar texto de PDF, DOCX, TXT o MD (10 MB), revisar
  y quitar de la ficha; máximo 20. Se conserva el texto extraído, no el original.
- Voz: tono, estructura, frases propias y expresiones/propuestas que evitar.
- Conocimiento de marca: crear manualmente/importar texto, editar y quitar con
  confirmación. Se leen también los campos históricos raw_content y summary.
  Un documento escaneado sin texto requiere transcripción manual.

## Contratos para Mapa creativo y Guiones

- `company_voice_profile` conserva `company_id`, `id`, `updated_at`, `niche`,
  `products` y las cuatro reglas de voz. La columna nueva `brand_context` es JSON
  con `description`, `audience`, `differentiation`, `positioning`.
- `products` continúa siendo un array JSON. Los productos conservan su `id` y
  campos desconocidos (incluidos touchpoints y metadata histórica). Una edición
  del catálogo asigna UUID a productos heredados sin ID. No asociar por índice.
  IDs repetidos se rechazan para evitar enlazar referencias al producto errado.
- Campos añadidos de producto: `benefits` cuando no hay pregunta específica del
  nicho, `offer`, `purchase_url`, `images`. Campos históricos `benefit`, `promise`,
  `avatar`, `price`, `context`, `documents`, `info_brief` siguen disponibles.
- `images`: array de `{id, path, name, alt}`. Primera imagen = portada.
  `path` es `company_id/uuid.ext`, nunca una URL pública o firmada persistida.
  Leer con sesión en `/backend/storage/v1/object/company-assets/{path}`.
  `src/nueva/universe/model.js:photoUrl` restringe la ruta a la empresa actual.
- `documents` de producto mantiene `{name,content}` y añade `id` en nuevos.
- Documentos globales de la marca siguen en `company_expertise_documents`.
  Al editar se guardan `content` y `raw_content`; se limpia un resumen anterior
  para que no contradiga el texto nuevo. `category` y `source_type` se conservan.
- `brand_profile_data` y el formulario de onboarding no se modifican. Sus datos
  anteriores se muestran en el perfil; no se reemplazan por el nuevo contexto.

## Persistencia y permisos

Migración aditiva `db/company_brand_context.sql`: columna brand_context y
updated_at de documentos; trigger de versión para cubrir ediciones de la
interfaz anterior. Se detectan conflictos sin sobrescribir silenciosamente.
Actualizaciones por empresa e ID, con versión original; no se envía el texto
completo en filtros URL.

RLS mantiene aislamiento por empresa y añade restricciones de escritura que
coinciden con `can_manage_company`: equipo activo, dueño o responsable del
proyecto. Los demás integrantes autorizados pueden leer.

Fotos en el almacenamiento local existente; bucket nuevo `company-assets`.
Cada GET/HEAD/POST verifica sesión activa y acceso a la empresa con el RLS actual.
POST además exige permiso de gestión y JWT (cookies solas no autorizan escritura).
No admite lectura pública, sobrescritura ni borrado físico desde el cliente.
Formatos comprobados por cabecera de bytes, límite de tamaño y rutas restringidas.
Lectura `private, no-store` y `nosniff`. Repetir la misma carga no duplica el archivo.
Quitar una foto de la ficha no elimina físicamente el original; se conserva
para evitar romper referencias y facilitar recuperación. La limpieza de archivos
sin referencia y las cuotas comerciales se abordan en la fase de almacenamiento.

## Validación

- Pruebas de adaptadores, IDs heredados, metadata, documentos antiguos, versión,
  URLs por empresa y lecturas de documentos largos sin filtros URL extensos.
- Pruebas Node de almacenamiento: sin sesión, otra empresa, rol sin gestión,
  subida inválida, lectura privada, reintento sin duplicar y fallo de autorización.
- Migración ejecutada dos veces en PostgreSQL temporal aislado: conservación de
  datos, lectura por empresa, permiso de gestión y edición simultánea.
- Navegador con API aislada y CSP del VPS: editar perfil/voz, crear y editar
  producto, subir foto real de prueba, importar TXT, editar documento, recargar,
  conservar metadata y recuperar un fallo de red. Catálogo/modal en
  320/375/414/768 px, teclado y estados vacíos.

## Publicación y reversión

Release desplegada `20261007-universo-marca`, desde `20261006-sidebar-selection`.
Se respaldó la base antes de la migración y se verificaron las huellas y el build.
Solo se reinició `inforce-api` para habilitar almacenamiento privado. Los tres
procesos del scraper conservaron su arranque y su contador de reinicios.
Comprobaciones públicas: nueve rutas 200, cuarenta assets/fuentes verificados,
salud 200 y endpoints privados anónimos 401. Almacenamiento: permisos de dueño,
administrador, cookies y otra empresa; bytes inválidos rechazados sin escribir
archivos. Sesiones temporales revocadas después de verificar.
Para revertir, restaurar el enlace de la release anterior y reiniciar la API.
Las columnas añadidas son compatibles y conservan información; no borrarlas.
El usuario autorizó después el commit y push a `codex/creative-mcp` para Claude.
