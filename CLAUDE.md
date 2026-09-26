# Inforce · Claude Code

@AGENTS.md

El estado actual y las limitaciones conocidas están en `docs/estado-actual.md`.
Para colaborar con Codex, leer `docs/colaboracion-agentes.md`. Trabajar dentro de
la carpeta aislada asignada; no asumir que el historial del chat de Codex está
disponible en esta sesión.

## Onboarding de clientes

Antes de tocar nada del onboarding, lee en este orden:

1. `docs/decisiones.md` — la fuente de verdad operativa. Si choca con el spec, manda este.
2. `docs/formulario-onboarding.md` — el guion del formulario, pantalla por pantalla.
3. `docs/estandar-inforce.md` — la pieza madre: las diez dimensiones con las que se audita una marca.
4. `docs/roadmap-onboarding.md` — qué sigue (plantillas de onboarding por llamada, informe y diagnóstico).

Reglas:

- **Cada decisión que José responda por chat se escribe en `docs/decisiones.md` en el mismo turno.**
- El copy de las pantallas es el del spec y el de `decisiones.md`, tal cual. No se reescribe ni se "mejora". Si algo queda ambiguo, se pregunta.
- Español de Colombia, tuteo. Mobile primero. Las instrucciones van debajo de cada pregunta, en gris, siempre visibles.
- Cada respuesta se guarda en `brand_profile_data` por `campo` estable y etiquetada con `puntos_estandar`. Nunca como "pregunta N".
- El código vive en `src/formulario/` (lógica pura con tests: `flujo.js`, `calculos.js`, `validaciones.js`, `formato.js`) y `api/onboarding-form.js`.
- La base es producción, sin staging: solo migraciones aditivas, y el `.sql` también en `db/`.
