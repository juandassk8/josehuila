# Preparación de la publicación en josehuila

Destino autorizado por el usuario: `https://github.com/juandassk8/josehuila`.
La API de GitHub informó visibilidad pública y permisos de escritura en la
comprobación previa. La publicación no cambia la visibilidad ni despliega el VPS.

## Alcance

Se prepara el código actual, las migraciones, las pruebas y la documentación.
Se excluyen `.env`, llaves, respaldos, `node_modules`, builds, capturas y resultados
operativos crudos. Los archivos privados del directorio padre tampoco forman
parte del repositorio. Los medios siguen en R2 y los datos en PostgreSQL.

La revisión de patrones del árbol actual y de los 255 commits anteriores detectó
contraseñas literales en una versión histórica de
`scripts/setup-inforce-central.mjs`, eliminado del árbol actual. Esos valores no
aparecen en los archivos candidatos de esta publicación. Las coincidencias de
tokens del código actual corresponden a fixtures, un hash ficticio de comparación
y cadenas de una imagen embebida; el PIN del reporte anterior está redactado.
Esta revisión acota lo que se publica; no constituye una auditoría exhaustiva.

Por ese motivo, el nuevo repositorio comienza con un commit raíz del estado actual.
El historial previo se conserva en una rama local de archivo y no se envía a
GitHub. No usar `push --all` ni `push --mirror` desde la copia local, pues podrían
publicarlo accidentalmente. No se sobrescribe ningún historial remoto existente.

## Validación local

- Vitest: 62 archivos y 731 pruebas aprobadas.
- Pruebas Node del servidor y autenticación: 8 aprobadas.
- ESLint: 0 errores; 491 advertencias preexistentes.
- Vite: compilación aprobada; conserva advertencias por chunks mayores de 500 kB.
- Instrucciones comunes en `AGENTS.md`, importadas desde `CLAUDE.md`.
- CI configurado con Node 22, lint, build, Vitest y las pruebas Node del servidor.

Estas comprobaciones no ejecutan nuevas consultas a Meta ni modifican producción.
El resultado de GitHub Actions se consulta después de la publicación.
