# Bibliotecas de anuncios de Meta — plan anterior

**Actualización:** el plan vigente es [PLAN_BIBLIOTECAS_ANUNCIOS_INFORCE.md](PLAN_BIBLIOTECAS_ANUNCIOS_INFORCE.md). Bibliotecas de anuncios será una sección de Creativos dentro de Inforce; la restricción anterior de usar solo la API oficial de Meta fue sustituida por un diseño de collectors intercambiables, sujeto a permiso y prueba de viabilidad. El contenido siguiente se conserva como antecedente de la evaluación de la API oficial.

Fecha: 22 de septiembre de 2026. Estado: plan para revisión; no se ha activado una conexión nueva ni un proceso diario. El propietario indicó que todavía debe solicitar acceso a la API oficial de Meta.

## Prueba rápida realizada

Se añadió `scripts/meta-ad-library-probe.mjs`, un comprobador de solo lectura para consultar hasta cinco anuncios de una página exacta o un término, filtrados por país. Usa `META_AD_LIBRARY_TOKEN` desde el entorno y lo envía en el encabezado `Authorization`; no lo incorpora a la URL ni imprime `ad_snapshot_url` o `paging.next`, que Meta puede devolver con el token. Ejemplo, una vez configurado el secreto fuera del repositorio:

```sh
node scripts/meta-ad-library-probe.mjs --page-id=123456789 --country=CO
node scripts/meta-ad-library-probe.mjs --search=Colombia --country=US --type=POLITICAL_AND_ISSUE_ADS
```

El 22 de septiembre se confirmó conectividad con `graph.facebook.com/ads_archive`: con un token de prueba deliberadamente inválido, Meta respondió HTTP 401 / OAuthException 190. Tres pruebas locales de formato de consulta y protección del token pasaron. **No se ha obtenido ningún anuncio real ni se ha validado la cobertura**, porque todavía no existe un token autorizado.

## Decisión de producto

La sección vivirá en **Creativos → Bibliotecas de anuncios**, junto a Banco de creativos y Bandeja. La fuente será exclusivamente la API oficial de Meta Ad Library, según la preferencia indicada. No se usarán Apify ni Foreplay para esta sección.

La [documentación oficial](https://es-la.facebook.com/ads/library/api) describe acceso a anuncios de cualquier tipo entregados en la Unión Europea o Reino Unido durante el último año, y a anuncios sobre temas sociales, elecciones o política entregados globalmente durante siete años. Su descripción del filtro de países también advierte que los anuncios sin entrega en la UE solo aparecen si son de esa categoría política/social; esta diferencia con la mención del Reino Unido se debe comprobar con una cuenta autorizada antes de prometer cobertura británica. Por tanto, **la API oficial no permite monitorear por API todos los anuncios comerciales de competidores de Colombia y del resto del mundo**. La biblioteca web muestra más anuncios que la API; esa diferencia debe ser visible en la interfaz.

Para **Colombia y Estados Unidos**, los anuncios comerciales mostrados únicamente en esos países quedan fuera de la API. Si una marca colombiana o estadounidense también entrega el mismo anuncio en la UE/UK, ese anuncio puede entrar en la cobertura correspondiente; el país de origen de la marca no determina la disponibilidad. Los anuncios políticos/sociales de Colombia y Estados Unidos sí forman parte de la cobertura global, con impresiones expresadas en rangos. La biblioteca web oficial permite consultar anuncios activos más amplios, pero no ofrece mediante esta API una extracción comercial automatizada equivalente.

Meta ofrece fecha de publicación, página, texto, plataformas y vínculo al anuncio para todos los anuncios que sí devuelve. El campo `impressions` es un rango disponible para anuncios políticos/sociales. Para anuncios con entrega en la UE existe `eu_total_reach`; `total_reach_by_location` puede desglosar alcance estimado para UE, Reino Unido o Brasil según el caso. **Alcance estimado no equivale a impresiones globales**. El producto nunca mostrará alcance como si fueran impresiones, ni atribuirá ventas, ROAS o rentabilidad de un competidor.

## Experiencia prevista

1. El administrador añade una marca mediante su página de Facebook o ID de página y elige la empresa de Inforce a la que quiere asociar ese seguimiento. Se confirma el nombre e ID exactos para evitar anuncios de homónimos.
2. La sección muestra marcas seguidas, última sincronización, cobertura disponible y errores de conexión. Los usuarios internos pueden filtrar por marca, fecha, plataforma, país y anuncios nuevos.
3. Una tarea diaria consulta los anuncios accesibles para cada página, guarda cambios y evita duplicados por ID de biblioteca. El panel **Nuevos hoy** muestra los detectados desde la corrida anterior.
4. El panel **Señales de tracción** ordena solo anuncios con métrica comparable. Para anuncios de la UE, usa la variación del alcance estimado observado entre dos o más capturas, con una ventana de antigüedad configurable. Las estimaciones de Meta pueden revisarse; el cambio entre capturas es una señal orientativa, no una medición exacta de impresiones diarias. Para política/social, muestra el rango de impresiones y una estimación conservadora por día. Cada tarjeta dice exactamente qué métrica y región se usaron. Los tipos de métrica se muestran por separado.
5. Si Meta no publica una métrica, la tarjeta aparece como **Sin datos de alcance**. Puede mostrarse por novedad o permanencia, pero no como “ganador”. La actividad publicitaria no demuestra conversiones.
6. Cada anuncio abre su ficha oficial en Meta y puede enviarse manualmente a la Bandeja existente para análisis, clasificación y posterior incorporación al Banco de creativos. Los hallazgos no se importan automáticamente al Banco.

Una mejora útil para el trabajo creativo es **Cambios de mensaje**: agrupar anuncios nuevos por marca y resaltar textos, ofertas y formatos que aparecen por primera vez. Esa señal existe aunque no haya impresiones y ayuda a decidir qué referentes revisar. Una segunda mejora es comparar esos patrones con el rendimiento de anuncios propios cuando se conecte, con permiso, la cuenta publicitaria de cada cliente; la API de biblioteca por sí sola no proporciona el rendimiento del competidor.

## Implementación propuesta

- PostgreSQL: `ad_library_follows` (página exacta, empresa, región, activo), `ad_library_ads` (ID de Meta, contenido y fechas normalizadas), `ad_library_observations` (captura diaria y métricas disponibles), `ad_library_sync_runs` (estado, paginación, errores y conteos). Índices únicos por página e ID de anuncio; RLS para miembros internos autorizados.
- Servidor: cliente de `ads_archive` con token solo en variables de entorno, paginación, límites de tiempo y volumen, reintentos moderados y validación de campos. `ad_snapshot_url` y las URLs de paginación pueden contener el token: se usan únicamente en el servidor, se depuran antes de cualquier registro y no se persisten ni envían al navegador. El enlace visible a Meta se construye a partir del ID público del anuncio.
- Tarea programada: temporizador diario en el VPS, con ejecución manual para la primera sincronización, exclusión de ejecuciones superpuestas y registro de fallos. Una marca cuya consulta falla conserva su última captura y muestra la fecha de datos.
- Interfaz React: nuevo elemento en `src/team/layout/Sidebar.jsx`, vista en `src/team/TeamApp.jsx`, componentes bajo `src/team/ad_library/`; reuso de estilos, autenticación y función de envío a Bandeja.
- Pruebas: normalización, paginación, deduplicación, ranking de métricas estimadas, ausencia de métricas, control de acceso, fallo o expiración del token y ejecución diaria idempotente.

## Condiciones para activar la conexión real

Se necesita una app de Meta for Developers autorizada para Ad Library API, su token de acceso configurado **solo en el VPS**, y dos o tres páginas concretas para validar resultados. Según [la guía de Meta](https://es-la.facebook.com/ads/library/api), el propietario debe confirmar identidad y ubicación, crear su cuenta de Meta for Developers y registrar una app antes de obtener acceso. Esta parte requiere que el propietario complete el trámite en su cuenta de Meta; la app puede prepararse mientras tanto, pero no se puede validar una consulta real sin acceso y token.

Con la restricción de “solo API oficial”, la funcionalidad comercial global fuera de la cobertura oficial seguirá indisponible aunque la implementación esté terminada. Antes de desarrollar y activar una versión con cobertura parcial, debe confirmarse que esa versión satisface el objetivo de negocio.

## Criterios de aceptación

- Añadir y pausar marcas sin duplicados; mostrar nombre e ID de página confirmados.
- Sincronización diaria automática y manual; fecha, volumen y errores visibles.
- Anuncios nuevos y cambios diarios correctos, sin perder capturas anteriores.
- Ranking explicable únicamente con métricas que Meta haya entregado, con nombre y región precisos.
- Envío manual de un anuncio a la Bandeja sin duplicarlo.
- Pruebas de autorización y de ausencia de token en respuestas, HTML y logs.
- Estado explícito **Sin cobertura oficial** para mercados o categorías que Meta no entrega.
