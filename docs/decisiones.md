# Onboarding · Decisiones

Fuente de verdad operativa del formulario de onboarding. Aquí queda cada decisión que José respondió por chat. **Si algo choca con `formulario-onboarding.md`, manda este archivo.** Regla: cada decisión nueva se escribe aquí en el mismo turno en que se toma.

Documentos hermanos: `estandar-inforce.md` (la pieza madre: las diez dimensiones), `roadmap-onboarding.md` (los bloques A–G), `formulario-onboarding.md` (el guion pantalla por pantalla).

## Alcance de la primera entrega (2026-09-20)

Entra: link único por cliente · formulario tipo quiz con guardado por respuesta y retomar · las cuatro ramas · recompensas · cálculos automáticos · creación de cuenta con credenciales generadas y con sesión iniciada · socios del 1.6 como usuarios de la misma marca · badge de "formulario completo" en Empresas.

No entra: la pantalla de onboarding donde el equipo califica, el informe, el diagnóstico, el perfil de marca que el cliente ve al entrar, el recordatorio de 48 horas, el bloqueo de agenda, el cálculo de huecos del 9.4 (la lista de roles por nivel todavía no existe). "Entrar al portal" lleva al home actual de la empresa.

## Arquitectura

- Ruta pública `/inicio/<token>` (la `/onboarding` ya era del wizard SaaS).
- `anon` no lee nada: todo pasa por `api/onboarding-form.js` con service_role. El token es la única llave. Al completar, el token deja de devolver datos.
- Código en `src/formulario/` (la carpeta `src/onboarding/` es de los tours).
- **Opción A:** el link se genera desde una empresa que ya existe en Empresas. La 1.2 actualiza el nombre si el cliente lo escribe distinto; no crea nada.
- **Es para clientes nuevos.** Si lo llena una marca que ya tiene cuenta, se saltan C.1 y C.2 y ve: "Listo, [Nombre]. Ya tienes cuenta, entra con tu correo de siempre." → Entrar al portal. No se toca su contraseña ni se crean usuarios.
- **Socios:** sin correo transaccional (en Colombia el WhatsApp llega y el correo se pierde). Sus accesos se generan y se copian desde el modal de Empresas — ver «El acceso lo crea el portal».
- ~~Estética Inforce (skill `estetica-inforce`)~~ **Cambió el 2026-09-20:** el formulario lleva el branding de **inforceconsulting.com** — la escena oscura con la constelación de puntos — documentado en `/Users/josemanuelhuila/inforce-auditoria/BRANDING.md` (implementación de referencia en ese repo: `globals.css`, `Constelacion.tsx`, `Revelar.tsx`, `informe/Cifra.tsx`). **No** la skill `estetica-inforce`, que es la estética blanca de los planes. Solo cambia lo visual: lógica, datos y flujos no se tocan.
- Pruebas contra una empresa de prueba que se archiva, no se borra. Sin deploy hasta que José lo diga.

### Diseño (2026-09-20)

- Branding de inforceconsulting.com (escena oscura + constelación). **Todo en negro**: el formulario es una pantalla a la vez, no una página larga; la alternancia de bandas negro/claro queda para el perfil de marca. **El botón dorado con destello va solo en «Entrar al portal»** (es la señal de premium; en cada «Seguir» perdería el significado).
- **Todo centrado:** la pregunta va en la mitad de la pantalla, con titular, instrucción y rótulo centrados, en una sola columna también en escritorio. La bienvenida igual. (José: «hay mucho espacio desperdiciado».)
- `Constelacion.jsx`, `Revelar.jsx` y `Cifra.jsx` son copia tal cual de inforce-auditoria (solo sin tipos). No se editan acá.

### El acceso lo crea el portal, no el cliente (2026-09-20, aprobado)

Reemplaza la C.1 y la C.2 del spec. **El cliente no escribe ni correo ni contraseña.** Clientes que ya tenían cuenta: no cambia nada, siguen entrando con su correo de siempre.

**Dos consecuencias que hay que tener presentes:**

1. **Recuperar la contraseña por correo no va a funcionar nunca**, ni cuando se monten los correos: `@inforce.team` no es un buzón del cliente. El hueco es permanente. La única salida es que el equipo genere una contraseña nueva desde Empresas y la mande por el grupo. **Existe desde el día uno.**
2. **El usuario parece un correo, así que la gente lo va a tratar como correo.** Por eso el campo se llama **«Tu usuario»**, nunca «Tu correo».

**Reglas de generación** (`src/formulario/acceso.js`):

- Usuario: `<marca>.<primer nombre>@inforce.team`. Minúsculas, sin tildes, sin espacios, la ñ pasa a n. «La Milenaria» + «José» = `lamilenaria.jose@inforce.team`. Lo arma el servidor.
- Si ya existe (dos Josés en la misma marca, dos marcas con el mismo nombre), lleva número: `lamilenaria.jose2`.
- Contraseña: la marca adelante + 8 caracteres al azar: `Milenaria-7K4P-9XQ2`. Sin 0/O ni 1/l/I: se va a dictar por teléfono. (José había propuesto «el mismo correo + #1»; se descartó porque con saber la marca y el nombre se entraba al portal de cualquier cliente.)

**Pantallas:**

| Pantalla | Lo que dice | Botón |
| --- | --- | --- |
| C.1 | **Listo, [Nombre].** — Con esto ya podemos estudiar [Marca] antes de hablar contigo. Solo falta una cosa: tu acceso. — *Tu usuario: [generado]* — *Tu contraseña: [generada]* — en gris: «Te los creamos para que no tengas que inventarte nada. Guárdalos ahora — son con los que vas a entrar de aquí en adelante.» | **Copiar y crear mi acceso** (uno solo) |
| C.2 | **Tu cuenta está lista.** Aquí va a vivir todo tu proceso con Inforce: tu diagnóstico, tu plan y tus llamadas. — **Ya puedes escribirnos por el grupo para agendar tu primera llamada.** — debajo, en chiquito: usuario y contraseña otra vez, con botón de copiar. | **Entrar al portal** |

«Primera llamada» y no «reunión»: en todo el proceso se les dice llamadas.

El botón copia **un solo bloque**, listo para pegarlo en sus notas o mandárselo a sí mismo por WhatsApp:

```
Portal Inforce
[url del portal]
Usuario: lamilenaria.jose@inforce.team
Contraseña: Milenaria-7K4P-9XQ2
```

**Instrucción de la 1.6** (cambió): «Inclúyete tú. El correo y el teléfono son para contactarlos; el acceso al portal de cada uno lo creamos nosotros al final.» El correo real de cada socio queda en su ficha de Equipo, para contacto; ya no es el usuario.

**Socios:** cada uno recibe su propio usuario con el mismo formato. **No se le muestran al cliente que llenó el formulario.** Se ven en el modal de Empresas.

**Modal de Empresas — obligatorio:** lista «Usuarios del portal» de la marca, con un botón **Generar contraseña nueva** por cada uno. Muestra la nueva una sola vez, con «Copiar acceso» (el mismo bloque), para mandarla por el grupo. Es la única forma de recuperar un acceso perdido, y es también como se le entrega el suyo a cada socio. Las cuentas del equipo Inforce que tengan ficha en la marca no aparecen ahí.

**El link después de completado:** sigue sirviendo siete días y lo único que muestra es el acceso. *Cómo quedó implementado:* **la contraseña no se guarda en el servidor, ni en claro ni cifrada** — eso era justo lo que José no quería («de pronto lo roban y paila»), y un link de WhatsApp que devuelve usuario y contraseña durante una semana es una llave rodando. Entonces: el servidor devuelve el **usuario** durante siete días; la **contraseña** la recuerda el navegador donde se creó la cuenta (siete días). En el mismo celular ve las dos con su botón de copiar; en otro aparato ve el usuario y «escríbenos por el grupo y te generamos una nueva». Pendiente de que José confirme que le sirve así.

Nota técnica: las contraseñas van a Supabase Auth, que solo guarda el hash.

## Modelo de datos

- `onboarding_forms`: el link y su estado. **No hay índice de pantalla**: dónde quedó el cliente se calcula de las respuestas (`siguientePantalla` en `flujo.js`), así aguanta que cambie una rama.
- `brand_profile_data`: una fila por **dato**, con `campo` como clave estable y `puntos_estandar text[]` como etiqueta. Nunca "pregunta 9". Los calculados van en la misma tabla con `origen = 'calculado'` y se rehacen en cada guardado.
- Si el cliente cambia de rama, lo que respondió en la otra **no se borra**: queda guardado por fuera del flujo y de los cálculos.
- Calculados con etiqueta: la cadena del margen → `{2.1}`, `conoce_numeros` → `{2.2}`. Ventas, inversión, utilidad y nivel van **sin etiqueta**: son insumos del diagnóstico, no puntos calificables.

## Mapa pantalla → punto del Estándar

| Pantalla | campo | puntos_estandar |
| --- | --- | --- |
| 1.1 | contacto_nombre | perfil |
| 1.2 | marca_nombre | perfil |
| 1.3 | tipo_marca | — (bisagra global) |
| 1.4 | web_url | 6.3, 6.4, 6.5, 6.6, 6.7, 6.8 (es la evidencia, no una calificación) |
| 1.5 | instagram | 7.1 (evidencia de toda la D7) |
| 1.6 | socios | perfil, 9.1 |
| 2.1 | maneja_categorias | 1.0 |
| 2.2 | num_categorias | 1.0 |
| 2.3 | num_productos | 1.0 |
| 2.4 | productos_principales | 1.0, 2.0 |
| 2.5 | margen_por_producto | 2.1, 2.2 |
| 2.6 | categorias_detalle | 1.0, 2.1, 2.2 |
| 2.7 | margen_tienda_confirmado | 2.1 |
| 3.1 | facturacion_mes_pasado | 2.0 |
| 3.2 | facturacion_promedio_3m | 2.0 |
| 3.3 | facturacion_objetivo_3m | 2.0, 1.11 — y define el nivel |
| 3.4 | ticket_promedio | 2.0 |
| 3.5 | gasto_pauta_30d | 2.0, 5.0 |
| 3.6 | cpa_30d (+ crudo `compras_30d`) | 2.1, 2.2 |
| 3.7 | roas_30d (+ crudo `ingresos_pauta_30d`) | 2.1, 2.2 |
| 3.8 | responsable_iva | 2.1 |
| 3.8b | iva_futuro | 2.1 |
| 3.9 | reparto_pago | 2.1 |
| 3.10 | tasa_entrega | 2.1 |
| 3.11 | margen_deseado | 2.1 |
| 4.1 | tasa_conversion | 6.1, 2.2 |
| 4.2 | porcentaje_carga | 6.2, 2.2 |
| 5.1 | recompra | 8.2, 2.2 |
| 5.2 | base_datos_clientes | 8.3 |
| 6.1 | equipo | 9.1, 9.2, 9.4 |

- Los **x.0** (1.0, 2.0, 5.0) son datos de base de esa dimensión, no puntos calificables. Así los llama el Estándar; se deja esa convención.
- **La 1.3 no es un punto, es un interruptor global.** Cambia los pesos de las dimensiones, qué puntos se ocultan (el 1.9 no aplica en marcas de necesidad) y cuatro puntos aspiracionales que solo existen si la marca es aspiracional. Nada de eso se construye en esta entrega; el dato queda limpio en su propio campo.
- Los crudos de "Calcúlalo por mí" heredan la etiqueta de su pregunta (decisión de Claude, pendiente de confirmar).

## "No lo sé"

- Existe solo en cuatro casillas: **margen** (2.5, o 2.6 por la rama de categorías — es la misma casilla), **tasa de conversión** (4.1), **% de carga** (4.2), **recompra** (5.1).
- **El CPA y el ROAS no la llevan.** No se le acepta a una marca que no sepa lo que paga por una venta, pero tampoco se le tranca el formulario: botón "Calcúlalo por mí", se pide el dato crudo que sí tiene a la mano y el portal hace la división. El crudo se guarda igual.
- Corte del 2.2 con cuatro casillas: **0 = Sí · 1 o 2 = a medias · 3 o 4 = No.** (En el Estándar había quedado "3 o más = No" sobre seis casillas.)
- **"No lo sé" en el margen: la 2.7 no se salta, se transforma.** Si lo marcó en todos los productos (o en todas las categorías), la 2.7 pasa a: *"Entonces dinoslo a ojo: de cada $100.000 que vendes, ¿cuánto te queda limpio?"* con la instrucción *"Sin este número no podemos decirte cuánto puedes pagar por una venta, que es la mitad de lo que vamos a revisar contigo. No tiene que ser exacto — un estimado tuyo vale más que nada."* Es obligatorio. La casilla permite no hacer el costeo fino por referencia, **no evadir el dato**. Se guarda con `aproximado = true` para que el diagnóstico lo diga. La casilla del 2.5 se sigue contando para el 2.2. Así el CPA máximo siempre existe y la recompensa del bloque 3 nunca se cae.
- En la 2.5 y la 2.6 la casilla va por fila. Con una sola marcada ya cuenta para el 2.2 (decisión de Claude, pendiente de confirmar); la 2.7 solo se transforma si están marcadas todas.

## Productos

- **Uno mínimo, hasta tres.** Hay marcas muy buenas que viven de un solo producto. Arranca con una fila y "Agregar otro producto". El promedio de la 2.7 se hace sobre los que llenó.
- Más de 20 productos en la 2.3 → se llena por categoría (2.6) y la 2.4 y la 2.5 se saltan.

## Fórmulas

- **0,8403 del IVA:** se paga el 19% sobre el valor agregado, no sobre la venta entera: 0,19 ÷ 1,19 = 15,97% del margen. Solo si respondió que es responsable. Si no lo es pero le va a tocar (3.8b), se guardan las dos versiones.
- **Margen efectivo** = margen × (% contraentrega × tasa de entrega + % anticipado). Es optimista: no descuenta el flete de los devueltos. Sirve para el diagnóstico; no se vende como exacto.
- **El 34% de la 2.7:** promedio **simple** de los márgenes porcentuales de los productos (o categorías), justamente porque no tenemos la mezcla de ventas. Si el cliente corrige, el corregido manda en todo y el calculado queda aparte (`margen_pct_promedio`).
- **Utilidad proyectada: se guardan las dos.** `utilidad_proyectada_actual` = ventas necesarias × (margen efectivo − CPA actual); `utilidad_proyectada_objetivo` con el CPA objetivo. La diferencia es el argumento del diagnóstico. En la recompensa no se muestra ninguna.
- **Inversión en la recompensa: a CPA de hoy** ("es el número honesto y es el que pega"). La versión a CPA objetivo se guarda (`inversion_necesaria_objetivo`) pero no se muestra ahí.
- **Nivel** (calculado, sale de la 3.3): BASE si la meta es menor a 100 millones al mes, ESCALA de 100 a 500, ÉLITE de 500 en adelante. Habiendo meta nunca es null. Por encima de 1.000 millones sigue siendo ÉLITE con `sobre_escala = true`: esa marca merece una conversación aparte, y eso lo maneja José, no el formulario.
- **Semáforo del 2.1** (aire = (CPA máximo − CPA) ÷ CPA máximo): 40% o más verde · 15% a 40% amarillo · menos de 15% rojo · negativo rojo profundo. No mide el margen: mide qué tan pegado está al techo.

## Copy que no estaba en el spec

**Recompensas — no todos los bloques llevan.** Forzar una donde no hay nada que devolver se siente falso. Bloque 1: sin. Bloque 2: la 2.7 es la recompensa. Bloque 3: la grande. Bloque 4: condicional. Bloques 5 y 6: sin. Donde no hay, pasa directo al respiro siguiente.

**Respiros:** B4 "Ahora tu web. Son dos preguntas y las dos salen del mismo par de reportes." · B5 "Dos preguntas sobre la gente que ya te compró." · B6 "Y lo último: quién está detrás de [Marca]."

**Recompensa del bloque 3.** Título: "Estos son tus números, [Nombre]." Tres bloques: "Tu CPA máximo es $[X]" / "Es lo máximo que puedes pagar por una venta sin perder plata." · "Tu ROAS de equilibrio es [X]" / "Por debajo de ahí, cada venta te cuesta en vez de dejarte." · "Para facturar $[meta] necesitas [N] ventas al mes" / "Con tu CPA de hoy eso son $[inversión] en pauta." Línea condicional: CPA pasó el máximo → "Ojo: hoy estás pagando $[CPA] por venta y tu techo es $[CPA máximo]. De eso hablamos en la llamada." · aire bajo 15% sin ser negativo → "Estás a $[diferencia] de tu techo. De eso hablamos en la llamada." · 15% o más → ninguna línea ("no le inventes un problema al que no lo tiene"). Botón: Seguir.

**Recompensa del bloque 4.** Carga bajo 80% → "De cada 100 personas que le dan clic a tus anuncios, [100−X] nunca alcanzan a ver tu página. Eso es plata que pagas por gente que no vio nada." · 80% o más y hay conversión → "Tu web convierte al [X]% y [X]% de tus clics alcanzan a cargarla." · "no lo sé" en las dos → sin recompensa.

**Salida de dropshipping:** "Gracias, [Nombre]. El dropshipping lo medimos con otro estándar — este formulario está hecho para marcas y las preguntas que siguen no aplicarían a tu operación. Te escribimos en las próximas horas con el tuyo. No tienes que llenar nada más aquí." Sin botón. Status `salida_dropshipping` y el token deja de servir.

**"¿Estás seguro?" de la 3.3** (pantalla intermedia, no error rojo): "Pusiste una meta más baja de lo que facturaste el mes pasado ($[X])." · *Sí, es a propósito* · *No, la corrijo* · "A veces pasa — por ejemplo si el mes pasado fue un pico por una fecha especial. Solo queremos estar seguros de contra qué número vamos a medir todo."

**Calcúlalo por mí — CPA:** "¿Cuántas compras te entraron en esos mismos 30 días?" / "Administrador de anuncios → columna "Compras", con el mismo rango de 30 días. Si vendes contraentrega, cuenta los pedidos entregados. Con eso y lo que ya nos dijiste que invertiste, sacamos tu CPA." → en la misma pantalla: "Tu CPA es $[X]. Eso es lo que te cuesta conseguir una venta." → Seguir.

**Calcúlalo por mí — ROAS:** "¿Cuánto facturaste con esos anuncios en esos 30 días?" / "Administrador de anuncios → columna "Valor de conversión de compras", mismo rango. Es lo que trajo la pauta, no tu facturación total del mes." → "Tu ROAS es [X]. Por cada peso que metes en pauta entran [X]." → Seguir.

## Aviso interno

Barato: no un correo, un **badge en la lista de Empresas** que dice "formulario completo" con la fecha, y se pone rojo si el CPA quedó por encima del máximo o si marcó tres o más "no lo sé".

## Feedback de José recorriendo el formulario (2026-09-21)

José es el dueño del copy: lo que dice aquí le gana al spec.

- **Bienvenida:** «Hola, bienvenido a **Inforce** 🦾» (con «Hola,» adelante), centrada. **15 minutos**, no 20. Nada de un bloque de texto: bajada corta («Llegamos a tus llamadas con tu caso ya estudiado.») y **tres bloquecitos** con icono — 15 minutos · Te decimos dónde está cada dato · Para y sigue cuando quieras.
- **1.3:** la pregunta es **«¿Qué tipo de marca es [Marca]?»**. Se quitó la instrucción («poco clara»); **el ejemplo va dentro de cada tarjeta**. Los ejemplos los puso Claude Code y están pendientes de que José los cambie: «Suplementos, cuidado de la piel, productos para mascotas» · «Ropa, accesorios, joyería, calzado» · «Vendes productos de un proveedor, sin marca propia».
- **1.5:** acepta el arroba **o el link** del perfil.
- **1.6:** el teléfono se valida (un celular son 10 dígitos; de otro país, con + e indicativo). Antes pasaba cualquier cosa de 7 dígitos o más.
- **Cambios de sección (respiros):** se tienen que sentir como cambio de sección — gráfico, título grande, bajada corta, cuántas preguntas trae la parte, botón. Los textos se reescribieron porque «nadie va a entender qué significa eso»:
  - B2 «Ahora hablemos de **lo que vendes.**» — Tus productos y lo que te deja cada uno. Con eso sabemos qué vale la pena pautar.
  - B3 «Ahora, **tus números.**» — Es la parte que más sirve. En cada pregunta te decimos dónde encontrar el dato, y al final te mostramos cuánto puedes pagar por una venta.
  - B4 «Ahora **tu web.**» · B5 «Ahora **tus clientes.**» · B6 «Y lo último: **tu equipo.**»
- **2.1:** el ejemplo ya no habla de «sabores» de shampoo: cuidado vs. accesorios, y «el mismo shampoo en tres tamaños es una sola».
- **2.4:** el precio es **el total que paga el cliente: con IVA y con envío**. «Agregar otro producto» es más visible y dice «1 de 3».
- **2.5 y 2.6: sin «no lo sé».** «Ellos lo deberían saber sí o sí.» Las casillas pasan de cuatro a **tres** (conversión, carga, recompra). El margen se pide **en % por defecto** (en pesos sigue disponible). Instrucción más corta. *Consecuencias:* la variante «a ojo» de la 2.7 ya no se dispara; el corte del 2.2 quedó **0 = Sí · 1 = a medias · 2 o 3 = No** (propuesto por Claude Code, pendiente de confirmar), y la alerta roja de «tres o más no lo sé» ahora significa las tres.
- **3.2: se pide el TOTAL de los últimos tres meses**, no el promedio: «el cliente va a buscar el número total y te lo va a pasar». Campo `facturacion_3m_total`; el promedio (`facturacion_promedio_3m`) lo calcula el portal. El total no puede ser menor que el mes pasado.
- **Instrucciones más cortas** en 2.5, 2.7, 3.8, 4.2, 5.1 y 6.1.
- **Botón «← Atrás»** con su palabra, arriba a la izquierda, siempre que haya a dónde volver (también al retomar).
- **Avisos «¿estás seguro?»** (no rechazan, preguntan; el botón pasa a «Sí, así está bien»). Salieron de un caso real: José puso la pauta con tres ceros de más, el CPA dio $23 millones, el ROAS dio 0 y el formulario no dijo nada. Ahora pregunta cuando: la pauta es mayor que la facturación del mes · el CPA es mayor que el ticket · el margen en pesos es menos del 2% del precio («¿no será 22%?») · el margen pasa de 85% · la meta es más de 10× lo facturado · el ticket es más de un quinto de la facturación · la facturación del mes es menor a un millón · el ROAS es menor a 0,5. Y **un ROAS que redondea a cero se rechaza** con «revisa cuánto pusiste que invertiste en pauta».
- **Velocidad:** el formulario avanza de una y guarda en segundo plano (cola en orden, con reintentos y «Guardando… / Guardado» arriba). Si un guardado falla, devuelve al cliente a esa pregunta. En el servidor, guardar pasó de cinco viajes a la base a dos.

## Segunda ronda de feedback de José (2026-09-21)

- **Todo el bloque 3 va sobre EL MES PASADO**, no «últimos 30 días»: la facturación ya se pedía del mes pasado, y mezclar los dos periodos confunde y descuadra. Inversión en pauta, CPA, ROAS, compras e ingresos de la pauta: rango **«Mes pasado»** en el Administrador de anuncios. La tasa de conversión (4.1) también. Los campos se renombraron: `gasto_pauta_mes`, `cpa_mes`, `roas_mes`, `compras_mes`, `ingresos_pauta_mes`.
- **La 3.11 cambió: «¿Cuál es tu CPA objetivo?»** (en pesos). Se quitó «¿qué parte de tu margen quieres que te quede?»: «usualmente la empresa no piensa así». El CPA objetivo ya no se calcula, lo da el cliente (`cpa_objetivo`); el portal deriva al revés qué parte del margen le queda con ese CPA (`margen_que_le_queda` = 1 − CPA objetivo ÷ CPA máximo), **y eso no se le menciona al cliente**. Inversión y utilidad «a CPA objetivo» siguen igual, usando el dato del cliente. Avisa si el objetivo es más alto que el CPA de hoy.
- **El margen es ANTES de pagar la pauta, y va en el título de la 2.5**: «¿Cuánto te queda de cada uno, antes de pagar la pauta?». Salió de un caso real: José respondió 20% pensando en lo que le queda *después de todo, pauta incluida*, y el CPA máximo le dio $15.996 cuando él esperaba unos $35.000. La fórmula estaba bien; la pregunta se prestaba para leerla mal. **Pendiente de José** (ver abajo): su 20% también ya descontaba devoluciones, y el portal vuelve a descontar lo que no se entrega.
- **La recompensa muestra de dónde sale el CPA máximo**, en letra chica bajo la cifra: «$104.000 de ticket × 20% que te queda = $20.800 · menos el IVA = … · menos los contraentrega que no se entregan = …».
- **2.1:** la explicación larga se cambió por un **ejemplo dibujado, lado a lado**: «Sí maneja» (marca de mascotas: Cuidado + Accesorios = 2 categorías) y «No maneja» (marca de shampoo: el mismo producto en tres tamaños es una sola). Rotulado «Ejemplo».
- **4.2:** la pregunta es **«¿Cuál es el porcentaje de carga de tu página?»** y la fórmula va **dibujada como fracción** (Visitas a la página de destino ÷ Clics en el enlace × 100), no en un párrafo.
- **5.1:** el «cada cuánto» es **seleccionable**: «Cada [número] [Días | Meses | Años]», más la casilla «Lo mío se compra una sola vez».
- **6.1:** cada persona lleva **roles seleccionables, uno o varios**, más un campo libre opcional. La lista la propuso Claude Code y José la puede ajustar: Dueño / gerencia · Pauta (trafficker) · Estrategia creativa · Guiones / copy · Grabación / UGC · Edición de video · Diseño · Redes / community · Servicio al cliente / WhatsApp · Logística / despachos · Web / tienda · Finanzas. (Esto además deja servido el 9.4: ya no hay que interpretar texto libre.)
- **Aviso nuevo:** margen menor al 5% («¿Seguro que solo te queda el 1%?»).
- **C.2 rediseñada** con la misma gramática de la bienvenida: gráfico de chulo verde, título, tres bloquecitos con icono (diagnóstico, plan, llamadas), la isla «Tus datos de acceso» con su botón de copiar, la tarjeta «Ya puedes escribirnos por el grupo…» y el botón dorado al final.

## La rentabilidad es UNA pregunta (José, 2026-09-21) — reemplaza toda la cadena del margen

José: «Yo simplemente les preguntaría cuál es tu margen neto: de cada venta que haces, ¿cuánta plata te queda a vos?, ya habiendo contado todo. No me voy a meter en la logística de la empresa.»

- **Pantalla 3.8 (nueva): «De cada venta, ¿cuánto te queda a ti ya pagando todo?»** — «Tu rentabilidad neta por pedido, en promedio: después de producto, envío, devoluciones, pauta y todo lo demás.» En **%** (por defecto) o en pesos, y debajo muestra la equivalencia («De una venta de $104.000 te quedan $20.800»). Adentro lleva el selector del IVA: *Ya tiene descontado el IVA · Todavía no le he descontado el IVA · No soy responsable de IVA*. Campo `rentabilidad_neta` = `{ valor, unidad, iva }`, etiqueta `{2.1}`. Cero es válido («hoy no me queda nada»).
- **Se quitaron:** la 2.5 (margen por producto), la 2.7 (confirmar el margen), el margen por categoría de la 2.6 (queda categoría + ticket), la 3.8 y la 3.8b del IVA. Bloque 2 queda en 2.1 · 2.2 · 2.3 · 2.4 (o 2.6). **Ya no hay recompensa en el bloque 2.**
- **Fórmulas nuevas:**
  - `rentabilidad_por_venta` = ticket × % (o los pesos que dio). Si dijo «todavía no le he descontado el IVA», × 0,8403.
  - **CPA máximo = lo que le queda por venta + lo que hoy paga por la venta** (`rentabilidad_por_venta + cpa_mes`). Si el CPA sube hasta ahí, esa venta ya no le deja nada. Ese mismo número es el `margen_antes_de_pauta`.
  - ROAS de equilibrio = ticket ÷ CPA máximo. Aire del 2.1 = (CPA máximo − CPA) ÷ CPA máximo, con los mismos cortes 40% / 15%. Inversión y utilidad proyectada, igual que antes sobre ese techo.
  - Los ejemplos del spec siguen dando lo mismo: $100.000 con $30.000 de margen y CPA $18.000 = le quedan $12.000 → techo $30.000 → 40% verde.
  - El caso de José: ticket $104.000, le queda 20% ($20.800), paga $22.915 → **CPA máximo $43.715**, ROAS de equilibrio 2,4, 47,6% de aire (verde). Antes le daba $15.996.
- **El reparto contraentrega/anticipado (3.9) y la tasa de entrega (3.10) se siguen preguntando, pero ya NO entran a la fórmula:** la rentabilidad que da el cliente ya trae las devoluciones. Quedan como dato (`{2.0}`). Si José prefiere quitar la 3.10, se quita.
- **Avisos de coherencia** («esas matemáticas tienen que hacer sentido con su CPA»): si puso $22 en vez de 22% · si le queda menos del 3% · si le queda más del 50% · y si lo que le queda + lo que paga por la venta pasa del 80% del ticket («es lo que te queda DESPUÉS de pagar la pauta»).
- **El badge rojo de Empresas cambió de regla:** con este modelo el CPA no puede «pasar el máximo» (el máximo es lo que paga más lo que le queda), así que el rojo ahora es **semáforo en rojo: menos de 15% de aire** (motivo `margen_en_rojo`), o las tres casillas «no lo sé». Pendiente de que José lo confirme.
- La recompensa dice de dónde sale el techo: «$20.800 que te quedan por venta + $22.915 que pagas hoy por conseguirla = $43.715».
- Casillas «no lo sé»: siguen siendo tres (conversión, carga, recompra).

## Se quitó la pregunta del ROAS (José, 2026-09-21)

«No importa esta pregunta, no es necesario.» La 3.7 («¿Cuál es tu ROAS?») y su «Calcúlalo por mí» («¿Cuánto vendieron tus anuncios el mes pasado?») salen del formulario. El bloque 3 queda en 9 preguntas (10 con contraentrega) y el formulario en **23 a 25**. El portal guarda como calculado el **ROAS general** (`roas_general` = facturación del mes ÷ pauta del mes), que no es el «ROAS de compras» de Meta y por eso lleva otro nombre. El «Calcúlalo por mí» del CPA se queda.

## «Corregir» en la recompensa de números (José, 2026-09-21)

«Para no cagarla»: cada ficha de «Estos son tus números» muestra con qué datos se armó y un botón **Corregir** al lado de cada uno. CPA máximo → *Lo que te queda por venta* (3.8) y *Lo que pagas hoy por venta* (3.6) · ROAS de equilibrio → *Tu ticket promedio* (3.4) · Ventas necesarias → *Tu meta a tres meses* (3.3). Al corregir y guardar, vuelve derecho a la recompensa, con los números recalculados.

## Un solo toque (José, 2026-09-21)

En celular había que tocar dos veces para avanzar. Dos causas, dos arreglos: (1) con el teclado abierto, tocar «Seguir» le quitaba el foco al campo, el teclado se cerraba, la pantalla centrada se corría y el toque caía en el vacío — ahora los botones no roban el foco; (2) en las preguntas de tarjetas (tipo de marca, Sí/No) había que elegir y además darle a «Seguir» — ahora **elegir la tarjeta avanza de una**. Única excepción: «Dropshipping», que cierra el formulario sin vuelta atrás, sí pide confirmar con «Seguir».

## Pieza 2 · Pantalla de onboarding del equipo (arrancó el 2026-09-21)

Primera versión de las fichas de José, Nath y Deison. Código en `src/estandar/`.

- **Ruta:** `/equipo/onboarding/<companyId>`, a pantalla completa y sin el menú del War Room (se comparte en la llamada con el cliente mirando). Se entra desde Empresas con el botón 🧭 de cada tarjeta. La ven admin y member, igual que Empresas.
- **Catálogo:** `src/estandar/catalogo.json`, sacado **literal** de `docs/estandar-inforce.md` — 111 puntos + 4 aspiracionales, cada uno con cómo se califica, qué es un 10, qué es un 1, el ejemplo, su sección y de dónde sale (llamada · formulario · se calcula solo · se revisa antes de la llamada). Si el Estándar cambia, se regenera el catálogo; el texto no se edita a mano.
- **Tres llamadas** (el reparto del mapa del Estándar): José D1, D2, D3, D6, D8, D9 · Nath D4, D7 · Deison D5, D10. Cada quien abre en la suya. **Cada uno edita lo suyo y lee lo de los demás; un admin puede corregir cualquier punto** (pendiente de que José confirme si Nath, que es admin, debe poder tocar lo de José).
- **Cada punto es una ficha:** la calificación (1 a 10 con color según la nota · Sí/No · la distribución de conciencia del 1.7 que suma 100 · el nivel 1–5 del 1.8 · un campo de dato para los que piden números), las anclas «qué es un 10 / qué es un 1», el ejemplo y la descripción. **Guarda solo**, por punto.
- **Lo que ya dijo el cliente** aparece arriba de cada dimensión y dentro del punto que alimenta (sale de `brand_profile_data` por su etiqueta `puntos_estandar`). El **2.1 y el 2.2 no se califican**: salen calculados del formulario.
- **Puntos que se apagan solos:** marca aspiracional → 1.5 y 1.9 no aplican y entran A.1–A.4 · el 1.9 solo si el grueso del mercado está en conciencia 1–2 (lee la distribución del 1.7) · el 8.1 en No apaga incentivos y canales (8.6, 8.7, 8.8). Lo que no aplica no cuenta en el progreso y se lista abajo con el porqué.
- **Datos:** tabla `standard_scores` (una fila por marca y punto: `calificacion` jsonb, `descripcion`, `no_aplica`, `origen` equipo/ia). Solo equipo por ahora; la marca la leerá cuando exista el informe.
- **Fuera de esta primera versión:** que la IA llene las descripciones con el transcript de Fathom, las contradicciones formulario-vs-llamada, los pesos por tipo de marca, el corte por nivel, y el informe/diagnóstico (pieza 3).
- **El Estándar tiene numeración vieja mezclada** en la prosa (conciencia como 1.6, «10.5» que no existe, falta el 7.16, el mapa del inicio declara conteos distintos a las tablas). El catálogo usa los ids de las TABLAS, que son los buenos. Hay que limpiar el documento.

### Feedback de José a la pantalla de onboarding (2026-09-21)

- **Color por llamada:** José azul (#5e87f5) · Nath morado (#af52de) · Deison verde (#34c759). Cambia el acento de toda la pantalla (pestaña, dimensión activa, barras, resplandor) y cada pestaña lleva su punto de color aunque no esté activa.
- **El fondo no distrae:** en esta pantalla NO va la constelación; queda la retícula y el resplandor, quietos y más apagados. «La atención va a lo que hay dentro de la pantalla.»
- **«Lo que ya dijo el cliente»** es una rejilla de cifras (rótulo chico arriba, cifra grande abajo, con color si significa algo: el aire del margen en verde/ámbar/rojo) y las listas —productos, categorías, dueños, equipo— van como fichitas, una por ítem.
- **Fichas sin muro de texto:** «qué es un 10 / qué es un 1» y el ejemplo van **plegados**. Se abren por punto («Ver guía») o todos desde arriba («Mostrar guías»).
- **Fondo claro u oscuro** con un botón arriba; queda guardado por navegador. El oscuro es el predeterminado.

### Tercera pasada a la pantalla de onboarding (José, 2026-09-21): «que no se sienta un interrogatorio»

- **Paso a paso:** la dimensión ya no es una lista de catorce fichas. Se recorre de a pocas (una sección del Estándar por paso; si es larga, tandas de tres) con **Anterior · puntitos · Siguiente** abajo, y al terminar una dimensión el botón dice «Seguir con [la siguiente]». Al abrir, retoma en el primer paso con algo pendiente.
- **Sin contadores:** se quitaron «3 de 64», «0/14», «3 de 10 puntos · nota 6». El avance se ve en barritas; el cliente está mirando y un número así le dice que va para largo. La dimensión completa muestra un ✓.
- **Encabezado mínimo:** volver · marca · dos chips (tipo de marca, estado del formulario) · «Mostrar guías» · «Fondo claro». Se fueron el nivel, el rótulo «Onboarding» y el texto de guardado (pasó abajo, junto a los botones).
- **Todo alineado a un solo riel:** encabezado, pestañas, barra de dimensiones y contenido comparten los mismos bordes. La barra de dimensiones va pegada al borde izquierdo y justo debajo del encabezado (antes quedaba flotando con un hueco).
- **«Lo que ya dijo el cliente»:** con pocos datos va en una sola tira (rótulo · 8 productos · Producto A $104.000 · Producto B $89.900); con muchos (números del negocio) sigue la rejilla, que a José sí le gustó. Solo aparece en el primer paso de la dimensión.

- **Cuarta pasada (2026-09-21):** «Lo que ya dijo el cliente» es una tarjeta con dos zonas — cifras a la izquierda y las listas (productos, categorías, dueños, equipo) como **tabla** a la derecha, nombre a un lado y valor al otro; pasa a dos columnas con más de seis filas, así aguanta 1 producto o 30 categorías. Y el **encabezado ahora sí se queda pegado arriba** (tenía el `sticky` pisado por otra regla): por eso la barra de dimensiones quedaba flotando con un hueco al bajar.

## Integración en el portal (José, 2026-09-21) — «montalo»

- **Cambia la Opción A:** ahora el link también **crea la empresa**. En Empresas hay un botón **«＋ Link para cliente nuevo»**: crea la empresa (nombre provisional «Cliente nuevo …») y su link de una, y abre el modal para copiar el mensaje de WhatsApp. **Apenas el cliente responde la 1.2, la empresa toma el nombre de su marca** (y su slug). El 📝 de una empresa que ya existe sigue funcionando igual.
- **«NUEVO»:** la tarjeta de una marca cuyo formulario llegó y que esa persona todavía no ha abierto va con borde y chip dorados. Se recuerda por navegador.
- **Todo lo que respondió el cliente queda guardado** en `brand_profile_data` y se ve desde el 📝 («Ver todo lo que respondió el cliente»), además de aparecer dentro de cada dimensión del onboarding. Solo lo ve el equipo.
- **Sección Onboarding en el 📝:** una fila por llamada (José · Estrategia, Nath · Contenido y marca, Deison · Tráfico y datos) con su estado — Pendiente / En curso — y el botón **«Iniciar onboarding» / «Continuar»**, que abre la pantalla directo en esa llamada. Todo queda en `standard_scores`, que es de donde va a salir el plan de implementación.
- **Pendiente siguiente:** la misma sección dentro del portal de la empresa (`/admin/<slug>`), «marcar llamada como finalizada», y la vista del cliente.
- **Fathom (para después):** José quiere que las descripciones se llenen solas con lo que él dice en la llamada. Hay que investigar la API de Fathom (transcript por reunión) → pasarlo por la IA con el catálogo → proponer `descripcion` por punto con `origen='ia'` para que el humano corrija. La tabla ya tiene ese campo.

- **El portal no está adaptado a celular (2026-09-21).** Al terminar el formulario desde un celular, en vez del botón «Entrar al portal» sale: «El portal todavía no está adaptado a celular. Ábrelo desde un computador con este link: …» con **«Copiar el link del portal»** y, chiquito, «Entrar de todas formas». En computador sigue el botón dorado de siempre. Adaptar el portal a celular queda para después.

- **Finalizar la llamada (2026-09-21):** al llegar al último paso de su última dimensión, el botón pasa a **«Finalizar la llamada de [José/Nath/Deison]»**. Queda marcada (pestaña con ✓; se puede reabrir) y el 📝 de Empresas muestra cada llamada como **Pendiente · En curso · Finalizada**. Se guarda en `standard_scores` con el punto `llamada:<id>` (no choca con los puntos N.M del Estándar), sin tabla nueva.

- **Onboarding dentro del portal de la empresa (2026-09-21):** cuando alguien del equipo entra a una empresa desde el panel, en el menú de la izquierda, grupo «Operación», aparece **Onboarding** de primero. Abre la pantalla de las tres llamadas de esa marca. **El cliente no ve ese ítem.** Las marcas de prueba (`obf-prueba*`, «ZZ Prueba…») quedaron archivadas.

## Pendiente de José

- ~~Qué margen se pide, y si se descuenta dos veces.~~ Resuelto: ver «La rentabilidad es UNA pregunta».

- ~~La 3.11 está en revisión.~~ Resuelto: ver «Segunda ronda». (Texto anterior:) José: «uno no le pregunta al cliente cuánta plata crees que te quede; le pregunta cuánta le está quedando ahorita», y lo que el cliente sí tiene claro es su **CPA actual y su CPA objetivo**. Propuesta de Claude Code: la 3.11 pasa a preguntar el **CPA objetivo** del cliente en pesos, y el portal deriva al revés qué parte del margen le queda con ese CPA (1 − CPA objetivo ÷ CPA máximo). Falta el copy de la pregunta y de su instrucción. Hasta que se decida, la 3.11 sigue como en el spec.

- La línea que cambia en la instrucción de la 2.5 para la marca **aspiracional** (el costo de las devoluciones). El spec dice que cambia pero no trae el texto; hoy va la misma instrucción para todos.
- Recompensa del bloque 4 cuando hay conversión pero marcó "no lo sé" en la carga: hoy no muestra nada, porque ninguno de los dos textos aplica.
- Una marca que **no ha pautado** (gasto de pauta en 0): hoy el formulario exige gasto, CPA y ROAS mayores que cero.
