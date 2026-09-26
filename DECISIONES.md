# Decisiones y por qué

> Las reglas que parecen arbitrarias y no lo son. Casi todas nacieron de algo que
> salió mal en producción.
>
> **Léelo antes de "simplificar" cualquier cosa.** Varias de estas reglas se ven
> como complejidad innecesaria hasta que entendés qué las provocó.

---

## 1. Reglas de producto

### El borrado nunca es real

Todo lo que se borre tiene que ir a una papelera con deshacer. Ver `ESTADO.md` §8:
se perdieron 89 contenidos con guion escrito porque el borrado era un `delete`
con cascade.

Y el aviso trae el botón de deshacer **adentro**. El momento en que uno se da
cuenta de que borró lo que no era es el segundo después de apretar, mirando el
toast — no cuando encuentra la papelera.

**Sin purga automática.** Un ítem en la papelera no molesta a nadie y no ocupa
nada. Una limpieza a los 30 días sería el mismo borrado en silencio que la
papelera vino a sacar.

### Si falta la migración, la operación falla — no cae al comportamiento viejo

`deleteBriefRow` propaga el error si falta `deleted_at`, en vez de hacer el
`delete` de antes.

Quedarse con un brief que se quiso borrar se arregla borrándolo otra vez.
Perderlo, no.

### "No sé todavía" no es lo mismo que un valor por defecto

El nivel de sofisticación de mercado es nullable y **sin default**. Poner 1 por
defecto haría que el Guionista escriba claims directos para mercados quemados —
justo el error que la función vino a corregir.

Mismo criterio en toda la app: si el dato no está, no se supone.

### Un diagnóstico incompleto se anuncia; nunca se hace pasar por completo

La cadena de diagnóstico no puede concluir "está todo bien" si hay eslabones sin
datos. Eso mandaría a rotar creativos sin haber mirado la web.

Hay **tres** estados distintos y se distinguen a propósito:
- `sin_datos` — falta la métrica
- `sin_umbral` — el dato está, pero nunca se fijó el número
- `ok` / `roto`

Meterlos en la misma bolsa haría que una decisión pendiente de José parezca un
problema técnico.

### Los umbrales del negocio no se inventan

Donde el material de referencia no fijó un número, el sistema **muestra el valor
y no juzga**. Inventarlo haría que el producto mande a rehacer ofertas sanas con
un criterio que no es el del dueño.

Umbrales que siguen pendientes de definir: CPA objetivo por producto, benchmarks
reales de hook/hold/CTR, reparto video/estático por etapa.

### A quien se dio de baja no se le reparte trabajo nuevo

Los miembros inactivos no aparecen en selectores. Pero **sí siguen apareciendo en
lo ya asignado**: una tarea vieja tiene que seguir diciendo su nombre, no quedar
en blanco. Se esconde a quien se *elige*, no a quien ya fue elegido.

---

## 2. El Guionista

La técnica completa está en el propio código, muy comentada:
`api/generate-slot-script.js`, `api/_lib/hookArchetypes.js`,
`api/_lib/scriptChecks.js`.

Lo que hay que saber antes de tocarlo:

### Dos pasadas, nunca una

1. **Blueprint** — del anuncio de referencia se extrae un esqueleto estructural
   (plantillas rellenables con `[huecos]`, sin el tema). Se cachea en
   `despliegue_variations.script_blueprint`.
2. **Generación** — con ese esqueleto + el producto propio, se escribe el guion.

**La segunda pasada nunca ve el texto del anuncio original.** Eso es lo que
impide que se copien claims ajenos. Si alguien "optimiza" esto a una sola pasada,
vuelve el bug de guiones que prometen "7 días, pagás después" de un producto que
no lo ofrece.

### Los 5 hooks prometen lo mismo

Hay un solo cuerpo, entonces hay una sola promesa, y el hook *es* esa promesa.
Lo que cambia entre los 5 es por dónde entran, nunca qué prometen.

Tres formas de romperlo, las tres pasadas de verdad, cada una con un chequeo
automático en `scriptChecks.js`:
1. Cambiar quién habla (el body en primera persona, el hook en segunda)
2. No plantar el marco (el body dice "después del primer día" y el hook nunca lo
   mencionó)
3. Cambiar de qué es la lista (el body enumera 4 beneficios, el hook promete
   "4 razones para evitar el veterinario")

### La diversidad se fuerza por construcción

Pedirle a un LLM "que sean diferentes" devuelve 5 variaciones de lo mismo con
sinónimos. Por eso existe la lista cerrada de 10 arquetipos: cada hook entra por
una puerta distinta y se valida que los 5 sean de arquetipos distintos.

### Aprende de las correcciones

Cuando se edita a mano un guion generado, se compara el borrador contra la
versión final y se extraen hasta 5 patrones de edición, que se acumulan por
empresa y entran en los prompts siguientes.

---

## 3. La cadencia de producción

Son **tres pasos encadenados**, y saltarse el del medio fue un bug real:

```
tope       = presupuesto de testeo ÷ (CPA × multiplicador de prueba)
producción = tope × 40%
reparto    = producción × (60/30/10)   TOFU / MOFU / BOFU
```

El reparto se aplica a la **producción**, no al tope. Cuando colgaba del tope, el
tablero pedía 45 creativos TOFU donde correspondían 18 — dos veces y media el
trabajo, todas las semanas. Una meta imposible no se cumple a medias: se ignora
entera.

### El 30% y el 40% no son el mismo número

Es la confusión más fácil de este módulo y por eso están pegados en la UI con
etiquetas distintas:

- **30%** (`budget_split.testing`) — porción de la **plata** que va a probar.
  El otro 70% escala lo que ya gana.
- **40%** (`cadence_pct`) — porción del **tope** que conviene producir bien.

Uno reparte dinero, el otro reparte trabajo. El 60% que no se produce **no es
sobra**: es el músculo con el que se escala. Por eso se muestra explícito.

---

## 4. El diagnóstico de anuncios

### La cadena corre antes que la fatiga, siempre

El mismo disparador —"el CPA sube"— activa dos rutas que ordenan cosas opuestas:
la cadena dice "puede ser la web, no tires el creativo"; la fatiga dice "rotá el
creativo o abrí público".

**La cadena primero.** Es gratis y puede revelar que el problema estaba en el
checkout, donde rotar creativos no arregla nada y cuesta producción. Los tres
remedios de la fatiga se pagan; el diagnóstico no.

### La frecuencia se lee como tendencia, no como nivel

No hay umbral de frecuencia y no debe haberlo. La fatiga es **frecuencia Y CPM
subiendo juntos** contra el período anterior.

Una frecuencia de 7 estable en BOFU es sana —le insistís a quien ya te conoce—;
la misma frecuencia subiendo con el CPM es fatiga. Leerlo así resuelve la
contradicción de tratar como fatigado todo BOFU normal, y evita inventar un
número que nadie fijó.

### La fatiga se resuelve de afuera hacia adentro

Niveles anidados: creativo ⊂ concepto ⊂ audiencia. Si el público entero está
quemado, da igual qué creativo mires: todos van a dar mal. Concluir "se fatigó
este video" sería quedarse con el síntoma más chico de un problema grande.

---

## 5. Arquitectura

### `listBriefs` no filtra por `deleted_at` en la consulta

Filtrar por una columna que todavía no existe hace que PostgREST rechace la
consulta **entera**, y el módulo se cae a modo demo. Se traen vivos y papelera
juntos y se parten en memoria.

Es un patrón general acá: **el read path tolera que falte una columna nueva.**
Solo el write path la requiere.

### `authenticated` ya no significa "el equipo"

39 de 54 miembros de empresas cliente tienen `auth_user_id`. Los clientes **son**
usuarios autenticados.

Cualquier policy nueva que diga `using (true)` para `authenticated` está abriendo
la tabla a todos los clientes. Ver `ESTADO.md` §8.

Los helpers a usar:
- `is_team_member()` — cualquiera del equipo Inforce activo (incluye editores)
- `is_team_admin()` — solo `admin` o `member`
- `accessible_company_ids()` — a qué empresas llega este usuario

### El acceso lo decide el rol, no `isAdmin`

`isAdmin` es `authMode === "admin"`, o sea el equipo de Inforce. Usarlo para
gatear features del cliente le niega a los clientes cosas que su rol sí permite.

Ya pasó dos veces: el Pipeline y Reportes mostraban "Coming Soon" a dueños y
traffickers. Usar `memberCanAccess(currentMember, "seccion")`.

### El id de una empresa es un timestamp en texto

Histórico. `companies.id` es `text`, no uuid. Al comparar contra columnas uuid
hace falta cast explícito (`::text` o `::uuid[]`).

---

## 6. Convenciones

**Idioma:** los comentarios y la UI van en **español**. Registro rioplatense /
colombiano. Los docs nuevos también.

**Los comentarios explican POR QUÉ, no qué.** El código ya dice qué hace. Si un
comentario se puede deducir leyendo la línea de abajo, sobra. Los que valen son
los que cuentan qué se rompió y por qué la solución es esa.

**La lógica se extrae a funciones puras.** No hay jsdom: los componentes no se
pueden testear. Por eso toda decisión no trivial vive en un archivo aparte
(`cadencia.js`, `diagnostico.js`, `scriptChecks.js`, `accesos_pendientes.js`) que
sí se testea con Vitest.

**Verificá que el código llegue al bundle, no solo que compile.**
Build, lint y 464 tests pasan igual con un componente que nadie monta. Ya pasó:

```bash
npm run build
grep -rl "un texto único de tu feature" dist/assets/*.js
```

Si no aparece, está huérfano.

---

## 7. Lo que quedó a medias, con nombre

- **`db/company_tasks_rls.sql`** — escrito y ya aplicado, pero sus policies
  quedaron duplicadas con las de la tanda general. Las duplicadas ya se sacaron.
- **Umbrales del negocio** — ver §1. Bloquean media funcionalidad de reportes.
- **Hook rate y hold rate** — son métricas personalizadas de Meta que hay que
  crear una vez en el administrador. El parser ya tiene los patrones puestos: el
  día que se exporten, entran solas.
- **Etiquetas del banco** — quedan duplicados que necesitan criterio humano.
  El caso claro: `Lipedema` (29 usos) vs `Lipodema` (294). El más usado es el que
  está **mal escrito**, así que fusionar hacia el mayoritario consagraría el
  error. Lo dejamos sin tocar a propósito.
