# Trabajar con Claude Code y Codex

Ambas herramientas trabajan en el mismo producto, en carpetas independientes.
Comparten el código y los documentos del repositorio; los chats no se sincronizan.

## Bitácora local compartida

En este equipo los dos clones están separados:

- Codex: `D:\Downloads\JOSE HUILA\inforce-app`.
- Claude: `D:\Downloads\JOSE HUILA CLAUDE\josehuila`.

Ambos consultan `D:\Downloads\JOSE HUILA\COORDINACION_INFORCE.md` al empezar,
retomar y entregar trabajo, y antes de editar archivos compartidos. Registrar
tarea, estado, rama, archivos y pruebas con el script `anotar-inforce.ps1` del
mismo directorio. El script añade entradas sin reescribir las anteriores y
excluye escritores simultáneos durante cada escritura.

La bitácora es local, queda fuera de Git y no envía notificaciones ni activa al
otro agente. Una pregunta queda pendiente hasta que el destinatario la lea y
responda. Sus notas no sincronizan los archivos de código ni autorizan nuevas
tareas. No publicar secretos ni copiar la bitácora en cada clon.

La sesión de Claude ya puede trabajar desde su clon independiente. El worktree
descrito abajo es una alternativa; no es necesario combinar ambos métodos.

## Abrir Claude Code en este equipo

Claude Code ya estaba instalado y se verificó la versión 2.1.201 al preparar esta
guía. Desde PowerShell, en la carpeta principal del proyecto:

```powershell
Set-Location 'D:\Downloads\JOSE HUILA\inforce-app'
claude.cmd --worktree creativos-ui
```

El comando inicia Claude en un worktree propio bajo `.claude/worktrees/`, con una
rama separada. La carpeta está ignorada por Git. El usuario debe completar el
inicio de sesión si Claude lo solicita. No usar opciones para omitir permisos.
El lanzamiento anterior es manual: esta guía no inicia sesiones ni envía tareas.

Dentro de la nueva sesión, pedir primero:

> Lee CLAUDE.md, AGENTS.md, docs/estado-actual.md y
> docs/colaboracion-agentes.md. Confirma tu carpeta, rama y arquitectura actual.
> Vas a colaborar con Codex en Inforce. Propón la primera tarea de interfaz de la
> biblioteca de anuncios, con archivos afectados y pruebas. No despliegues al VPS.

Instalar dependencias dentro del worktree con `npm ci` antes de ejecutar pruebas.
Para otra máquina, clonar `https://github.com/juandassk8/josehuila.git` y ejecutar
Claude desde la carpeta del clon, también con `--worktree` si habrá trabajo paralelo.

## Reparto recomendado

- Codex: backend, collector, colas, almacenamiento e integración final.
- Claude Code: interfaz, filtros, tarjetas y experiencia de la biblioteca.
- Ambos pueden revisar el trabajo del otro. El reparto cambia según la tarea.

Asignación vigente desde el 26/09/2026: el usuario encargó a Claude el scraper;
Codex mantiene MCP e integración. La bitácora local registra los archivos de
cada tarea y las instrucciones locales de Claude enlazan su guía de acceso al
VPS. Las credenciales y el helper SSH permanecen fuera del repositorio.

Asignar un objetivo y archivos concretos antes de comenzar. Cambios de contratos
de API, SQL o dependencias compartidas requieren coordinación. Cada tarea debe
entregar un resumen, archivos modificados, pruebas ejecutadas y pendientes.

Un worktree nace de un commit: el código aún sin confirmar de otra carpeta no
aparece automáticamente. Tampoco se sincronizan sus modificaciones posteriores.
No copiar `.env`, llaves, cookies o credenciales entre herramientas como contexto.

## Integración

1. Terminar la tarea en su rama y revisar el diff. Crear commits/publicar la rama
   cuando esté dentro del alcance autorizado por el usuario.
2. El integrador revisa los cambios y ejecuta las pruebas pertinentes, incluyendo
   el conjunto una vez combinado. No dar por resueltos los conflictos a ciegas.
3. Actualizar el estado compartido cuando cambie la arquitectura o la operación.
4. Desplegar una única versión revisada cuando el despliegue esté autorizado.

Para desarrollo concurrente usar puertos distintos y bases/colas/storage de
pruebas aislados. Nunca iniciar dos schedulers de pruebas contra las colas reales.

Documentación oficial: [worktrees de Claude Code](https://code.claude.com/docs/en/common-workflows#run-parallel-sessions-with-worktrees)
y [memoria compartida mediante CLAUDE.md](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools).
