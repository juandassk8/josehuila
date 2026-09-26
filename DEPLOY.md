# Deploy

> **Procedimiento histórico de Supabase/Vercel.** El despliegue actual está en
> [deploy/vps/README.md](deploy/vps/README.md) y
> [deploy/ad-library/README.md](deploy/ad-library/README.md).
> No ejecutar el procedimiento de abajo sobre la instalación nueva.

## Regla de oro

**Producción sale SOLO desde `main`.** Nunca desde una rama de feature: se pisan
entre sí y revierten trabajo que ya estaba en prod.

No hay staging. Lo que se sube, se sube a los clientes.

---

## El flujo

```bash
# 1. Estar en main, con todo verificado
npm test -- --run && npm run lint && npm run build

# 2. Subir
git push origin main

# 3. Deployar
npx vercel --prod --yes
```

Vercel devuelve una URL `https://inforce-xxxxx-....vercel.app` y actualiza el
alias de producción solo.

---

## Verificar que salió (no te saltes esto)

```bash
npx vercel inspect https://portal.josehuila.com 2>&1 | grep -iE "url|created"
```

**Mirá la FECHA, no el estado.** `status ● Ready` lo dice también el deployment
viejo — es la trampa de este chequeo. Lo que importa es que `created` diga hace
segundos y que la `url` sea la del deployment que acabás de crear.

La prueba que no miente, porque compara el contenido y no la metadata:

```bash
curl -s https://portal.josehuila.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
ls dist/assets/index-*.js
```

Los dos hashes tienen que ser el mismo. Si difieren, tu código no está arriba
por más que Vercel diga "Ready".

⚠️ **Nunca mandes la salida del deploy a `/dev/null`.** Si falla, no te enterás y
vas a creer que subiste algo que no subió. Ya pasó: un arreglo estuvo 7 días sin
salir mientras todos lo daban por hecho, y el bug se siguió reproduciendo en
producción.

**Y si el cambio es de interfaz, verificá que el código llegue al bundle:**

```bash
IDX=$(curl -s https://portal.josehuila.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://portal.josehuila.com/$IDX" | grep -c "un texto único de tu feature"
```

Si da 0, buscalo en los otros chunks (`dist/assets/*.js` local te dice en cuál
quedó). Si no está en ninguno, tu componente está huérfano: compila pero nadie
lo monta. **Ya pasó** — ver `DECISIONES.md` §6.

---

## Migraciones SQL

Las migraciones **no corren solas**. Son 101 archivos en `db/` que se aplican a
mano, y no hay registro de cuáles corrieron.

Dos formas:

**Conexión directa** (preferida — se puede verificar el resultado en el acto):

```
host:   aws-1-us-west-2.pooler.supabase.com
port:   5432
user:   postgres.gfuxpggkmmeismrrjxqh
dbname: postgres
```

⚠️ El host `db.<ref>.supabase.co` **no resuelve** por IPv4. La región es
`us-west-2` y el prefijo `aws-1` (con `aws-0` da "tenant not found").

**SQL Editor de Supabase** — si no hay conexión directa a mano.
Ojo: el editor autocompleta mientras se pega y **se come texto en las líneas
largas**. Ya rompió una migración (quedó `accessible_company_idsdmin()`). Si el
SQL tiene líneas largas, envolvelo en `do $do$ ... execute '...' ... end $do$;`.

**Todas las migraciones tienen que ser idempotentes** (`add column if not
exists`, `create table if not exists`). Re-correr no puede romper.

**Después de una migración:** `notify pgrst, 'reload schema';` al final, o
PostgREST sigue con el esquema viejo.

---

## Rollback

```bash
npx vercel ls                          # buscá el deployment anterior
npx vercel promote <url-anterior> --yes
```

Esto revierte el frontend. **No revierte la base.** Si el deploy incluía una
migración, revertir el código deja la app vieja hablando con un esquema nuevo —
generalmente funciona (las columnas nuevas se ignoran), pero verificalo.

---

## Backups

No hay backup propio. Se depende de los **8 backups diarios de Supabase**
(~14:28 UTC = 9:28 AM Colombia). PITR no está contratado.

**Para recuperar datos borrados:** Dashboard → Database → Backups → pestaña
**"Restore to new project"**. Crea una copia aparte y producción no se toca.

⚠️ **Nunca uses el botón "Restore" de la primera pestaña**: devuelve la base
entera a ese momento y borra todo lo hecho desde entonces, en todas las empresas.

El procedimiento completo, con el caso real del 18 de agosto, está en
`ESTADO.md` §8.
