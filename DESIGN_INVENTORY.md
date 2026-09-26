> ⚠️ **DOCUMENTO DESACTUALIZADO — 26 de July de 2026**
>
> Desde que se escribió hubo **95 commits y +22.470 líneas**. No menciona la
> papelera de briefs, la sofisticación de mercado, la cadena de diagnóstico ni
> el banco de creativos, y varias cosas que da por pendientes ya se hicieron.
>
> **Para el estado real: [ESTADO.md](ESTADO.md).** Esto se conserva como
> historia de lo que se pensaba en julio, no como guía.

# Inforce Central — Inventario Maestro de Diseño

Fuente de verdad del **alcance** del rediseño: cada pantalla, sub-pantalla, botón,
filtro, modal, estado y permiso que existe HOY en la app. Leído del código real.

## Cómo usar este documento (Claude Design)

1. Diseñá **todas** las pantallas y sub-pantallas de la sección "Mapa de pantallas".
2. Para cada una, incluí **todos** los botones/filtros/modales/estados listados en su
   ficha del "Inventario detallado". No inventes elementos que no estén; no borres
   ninguno. Si algo sobra visualmente, va a un desplegable **"Opciones"**, nunca se elimina.
3. Cubrí **todos los estados**: vacío, cargando, error, selección, drag&drop, en curso
   (colas/guardando), y las variantes por **rol/permiso**.
4. Guardá cada pantalla como `design/<nombre>.html` en el repo.
5. Usá el **sistema de diseño** de abajo. Doble tema (oscuro/claro), **cero emoji** en la UI
   (iconos SVG de trazo), responsive.
6. Al terminar, recorré el "Mapa de pantallas" como checklist y confirmá que ninguna quedó
   sin diseñar.

## Sistema de diseño (tokens y reglas)

- Tokens en `src/index.css` (`:root` oscuro / `:root.light` claro) y `src/lib/design.js` (`DS`).
  Reglas visuales completas en `CLAUDE.md` (raíz).
- **Paleta**: fondo negro puro; superficies glass (`--surface`), líneas sutiles (`--line`);
  marca roja `--brand` (acción/alerta), azul `--sel` (selección/activo, NUNCA rojo),
  neón `--neon` (marca/acentos), verde/ámbar/púrpura/rosa/amarillo semánticos.
- **Tipografía**: Plus Jakarta Sans (texto) + JetBrains Mono (solo números que se comparan).
  Sin uppercase con tracking grande. Título de página 30px/700.
- **Componentes**: glass para toda superficie elevada; toolbars `sticky`; acciones
  secundarias en desplegable **"Opciones"** agrupado; modales centrados (nunca drawer lateral);
  chips/pills radio 999; cards radio 14–18; inputs/botones radio 10–12.
- **Iconos**: SVG de trazo `stroke-width 1.7–1.9`, `viewBox 0 0 24 24`. Cero emoji.

## Roles y permisos

- **Equipo (Inforce Central)**: `admin`, `member`, `editor`.
  - Editor: solo ve tareas asignadas a él; edita solo 5 campos de contenido; su "zona" es Contenido.
  - Excepción por nombre: miembro "Nat/Nath/Nathalia" ve Contenido.
  - Accesos por-miembro (`access_overrides`) pueden abrir/cerrar vistas puntuales.
- **Cliente (workspace por empresa)**: `owner`, `project_manager`, `copywriter`, `content`,
  `editor`, `designer`, `trafficker`.
  - owner/project_manager = todo. trafficker = home,reportes,plan,despliegue,control,tareas,equipo.
  - copywriter/content = home,plan,pipeline,tareas,equipo. editor/designer = home,pipeline,control,tareas,equipo.
  - Sin rol = home,tareas,equipo.
- Máscara global (`CensorButton`) censura nombres de empresa en varias vistas (demos).

---

## Mapa de pantallas (checklist)

### Equipo — Inforce Central (`src/team/**`, `src/despliegue/**`)
- [ ] Shell / Sidebar (marca, saludo+fecha, buscador ⌘K, nav en 3 grupos + "Más", espacios drag&drop, pie con engranaje+salir)
- [ ] War Room
- [ ] Mi Agenda · Mis tareas
- [ ] Tareas (Board, Lista, Modal, Filtros, Timer, Recurrencia, DatePicker)
- [ ] Equipo
- [ ] Contenido (Board, Calendar, Posted, Detalle)
- [ ] Espacios (SpaceView + SpaceModal)
- [ ] Empresas
- [ ] Banco de creativos (Grid, Tablero, Drawer detalle, modales)
- [ ] Bandeja
- [ ] Guionista (team)
- [ ] Despliegue Creativo (canvas)
- [ ] Finanzas (14 vistas + AI Advisor + captura por voz)
- [ ] Master Tracking
- [ ] North Star
- [ ] Ajustes · Feedback · Papelera

### Cliente — Workspace por empresa (`src/workspace/**`, reports en `src/App.jsx`)
- [ ] Login
- [ ] Workspace shell + nav
- [ ] Resumen (CompanyHome)
- [ ] Reportes (lista, ReportView, CompanyStats, CampaignsAdsViewer, Nuevo/Editar reporte)
- [ ] Plan de implementación
- [ ] Content Pipeline (Board, Calendar, Guiones)
- [ ] Control Creativos (hoja)
- [ ] Tareas
- [ ] Equipo
- [ ] Papelera
- [ ] Despliegue (vista cliente, read-only)

---

## Inventario detallado — EQUIPO

### Shell / Sidebar (`src/team/layout/Sidebar.jsx`, `TeamLayout.jsx`, `Topbar.jsx`)
- Marca (neón) + toggle de tema; saludo "Hola, {nombre}" grande + fecha "Viernes 25 de julio · semana 30"; buscador ⌘K.
- Nav en 3 grupos: **Tu día** (War Room, Mi agenda, Contenido) · **Creativos** (Empresas, Banco de creativos, Bandeja) · **Personas** (Equipo, Guionista). Badges de conteo (Mi agenda, Bandeja).
- Desplegable **"Más"**: Mi tiempo, Master Tracking, North Star, Finanzas, Feedback, Papelera (según rol).
- **Espacios**: grupos por dueño (Compartidos + privados), colapsables, drag&drop, contadores, candado si privado; "+" nuevo espacio; menú ⋯ por espacio (Editar, Crear subespacio, Archivar, Eliminar).
- Botón "Ver tutoriales". Pie: tarjeta de usuario + engranaje (Ajustes) + salir.
- Topbar: breadcrumb + título 30px + subtítulo; a la derecha presencia + acciones + acción primaria. Sin badge "LIVE".

### War Room (`src/team/warroom/WarRoom.jsx`)
- **Tabs**: Operaciones (azul) / Contenido (púrpura, con badge "Tu zona" para editores). Default por rol.
- Contenido → sub-tabs Board / Calendar.
- **Topbar** (Operaciones): pill "N de M en línea", "Mis tareas" (abre filtro), "+ Nueva tarea" (modal). Contador "N tareas abiertas".
- **StatCards** (5, no interactivas): Urgentes abiertas, Vencidas, Completadas hoy, Mis tareas abiertas, SLA de la semana. Cada una: punto de color + label + número + delta (verde/rojo, "—" sin base).
- **Equipo** (`TeamStrip`): tarjeta por miembro (click abre su workspace si es admin o uno mismo): avatar + punto online, nombre, rol · "en línea", "Tarea actual", filas Scorecard + Tracking (puntos ayer/hoy).
- **Board de Operaciones**: columnas Pendiente/En curso/Completado (dot+nombre+conteo+"+") con drag&drop; panel **Actividad** al lado (últimos 24h: avatar + "{nombre} {acción}" + tiempo).
- **Estados**: vacío (board/feed), drag activo, editor ve solo lo suyo.
- **Modales**: TaskModal (crear/editar).

### Mi Agenda · Mis tareas (`src/team/tasks/MyAgenda.jsx`, `MyTasks.jsx`)
- **Toggle** Lista / Tablero. Puede mostrar la agenda de otro miembro (título "Agenda de X" + "← Volver").
- Botones: "🎙 Priorizar con IA" (PrioritizeAIModal), Filtro, "+ Nueva tarea".
- Banner "Por editar hoy (N)" (items de contenido con edición hoy → abren ContentDetailPage).
- **PrioritizeAIModal**: paso 1 (grabar/subir audio + contexto + "Analizar con Claude"); paso 2 (sugerencias de re-priorización con Ignorar/Aplicar N). Estados loading/error/applying.
- Estados: vacío, filtro abierto, drag&drop, viendo-otro-miembro.

### Tareas — componentes compartidos (`src/team/tasks/**`)
- **TasksBoard**: 3 columnas fijas; header opcional; per-columna "+"; empty "+ Agregar tarea"; drag&drop optimista.
- **TasksList**: tabla por estado (Nombre/Asignado/Fecha/Prioridad/Tiempo) con editores inline (status, asignado, fecha, prioridad, timer); "+ Agregar Tarea" por grupo.
- **TaskCard**: botón de estado (○/◐/●), título (tachado si completado, ↻ si recurrente), descripción 2 líneas, pill de prioridad, timer o tiempo, etiquetas (espacio/empresa/fecha con punto de color), avatares (+N). Borde rojo si vencida.
- **TaskModal** (centrado): selector de contenedor (Espacio/Empresa) ▾; título + descripción; barra de pills (Estado, Asignados, Fecha con ×, Prioridad, ⋯, Timer); Actividad; pie: "Mover a papelera" (izq) / "Cancelar" + "Guardar cambios"/"Crear tarea" (der). Cierra con ×/backdrop/Esc.
- **FilterBar**: botón "Filtro (N)"; panel con filtros guardados (aplicar/borrar/guardar), reglas (conector Y/O, campo, operador, valor multi), "+ Agregar filtro", "Borrar todo"; SaveModal.
- **TaskTimer**: ▶/⏸ + tiempo + × reset; popup Cronómetro/Temporizador (presets + custom).
- **RecurrenceModal**, **DateTimePicker** (fechas rápidas + calendario + horas), dropdowns inline (Status/Priority/Assignee/Date).

### Equipo (`src/team/equipo/EquipoPage.jsx`)
- Grid de tarjetas de miembro (click → ProfileModal). Admin: toggle "Mostrar desactivados (N)", "+ Agregar integrante".
- Card: avatar (punto online), nombre (+ "DESACTIVADO"), rol, "live"/last-seen, bio, pills (📌 N abiertas, cumpleaños, email).
- **ProfileModal** (admin o uno mismo): Nombre, Rol, color (12), cumpleaños, teléfono, bio; admin: checkbox "recibe tareas de revisión", "Accesos personalizados" (13 vistas 3-estados Default/Permitir/Denegar), Desactivar/Reactivar.
- **CreateMemberModal**: Nombre, Email, Contraseña (👁/Generar), Rol (radio), color, "Copiar email+contraseña", "Crear integrante".

### Contenido (`src/team/contenido/ContenidoPage.jsx`)
- **Tabs**: Board / Calendar / Posted / Guiones (Guiones admin).
- **Board** (`ContentPipeline`): pills Todo/Videos/Historias/Posts; toggles "Archivadas (N)" y "Killed/Promoted (N)"; "+ Nuevo contenido"; ColumnFilter (columnas visibles); columnas dinámicas (idea→posted + trial/killed/promoted) con "+"; drag&drop. **ContentCard**: dot+título, sub-estado edición, "Falta link final", destinos IG/TikTok, fecha, ⋯ archivar.
- **Calendar**: sub-tabs Contenido/Historias/Edición; nav de mes (◀ ▶ Hoy); celdas con "+" agregar e items (→ abrir).
- **Posted**: tabla (Título/Fecha/Link/Views/Likes/Comm./Saves/Eng.Rate/Acción) + "+ Métricas" (MetricsModal).
- **ContentDetailPage** (inline): "← Volver", autosave (Guardando/Sin guardar/✓), 🗑 (admin); título; filas de propiedades (referencia, loom, crudo, video editado, fechas, Status, Estado edición, destinos); "Más opciones" (Tipo, Formato, kind, Categoría, Editor); editor RichText. Campos gateados por rol.

### Espacios (`src/team/tasks/SpaceView.jsx`, `src/team/spaces/SpaceModal.jsx`)
- **SpaceView**: toggle Lista/Tablero + scope Mías/Todas; Filtro; "+ Nueva tarea"; strip de subespacios; lista/board.
- **SpaceModal**: IconPicker (16 emoji) + nombre, descripción, color (9), permiso Compartido/Privado; Crear/Guardar/Crear subespacio.

### Empresas (`src/team/empresas/EmpresasPage.jsx`)
- **Range pills** Hoy/Ayer/7d/Este mes/30d/Todo; toggle "Archivadas (N)".
- Banner de migración (admin): "Migrar colaboradores" (CollaboratorMigrationModal).
- **Card empresa** (click → abre `/admin/<slug>`): avatar, nombre, "Último reporte hace N días", punto de salud (verde/amarillo/rojo/gris); métricas (Ventas/ROAS/Inversión/Reportes); iconos admin: archivar (⋯/↩), acceso cliente (🔓/🔑 → ClientAccessModal).
- **ClientAccessModal**: Crear (email+contraseña+Generar), Gestionar (nueva contraseña), Hecho (copiar creds+URL).
- Estados: loading, sin reportes en rango, archivada (dim), vacío.

### Banco de creativos (`src/team/concept_bank/ConceptBankPage.jsx`)
- **Toggle** Banco de creativos / Banco de contenido. **Vista** Grid / Tablero.
- **Toolbar sticky**: "+ Agregar concepto/contenido" + **"Opciones"** (Organizar: Gestor de etiquetas, Seleccionar varios · Enriquecer: Completar guiones y notas · Respaldos: Respaldar todo en Drive).
- **Filtros**: chips de etapa (Todos/TOFU/MOFU/BOFU + conteos), Formato, Empresa, Orden, "Nicho/Tag ▾" (multi), buscador, contador "N de M".
- **Card**: thumb, badge de etapa, "N refs" (+ N emp. si grupo), pill Ads/Orgánico, nombre, formato, "Vinculado · N empresas", empresa, nicho, tags; hover "Importar"; menú ⋯ (Ocultar, Eliminar definitivamente).
- **Tablero** (`ConceptBankBoardView`): canvas tipo Miro read-only, embudo TOFU→MOFU→BOFU × Estáticos|Video, zoom (+/⊙/−).
- **Barra flotante de selección**: Analizar con IA, Importar a empresa, Combinar (≥2), Eliminar, Cancelar.
- **Modales**: ConceptDetailDrawer (detalle + referencias con zoom/filtros/group + acciones bulk: Analizar, Respaldar, Etiquetar, Mover, Devolver a bandeja, Eliminar; abre MoveVariationModal, BulkTagRefsModal, BankVariationDetailModal, ConceptEditModal, AddVariationModal), ImportToCompanyModal (filtros + preview "N de M" + destino + Importar), LabelManagerModal (tabs por categoría, Unificar, Auto-organizar IA con plan aplicable), MergeConceptsModal, AddConceptModal, ExcludeConfirmModal.
- **Estados**: loading, error (hint de migración), vacío (sin conceptos / sin match), cola de IA, selección, en curso.

### Bandeja (`src/team/inbox/BandejaPage.jsx`)
- **Acciones header** (admin): Importar documento, Subir videos, Traer de una marca (Apify), Sincronizar Foreplay.
- **Barra de captura**: textarea de links; config sticky (empresa, pipeline Creativos/Contenido, etapa, media); concepto (Ninguno/Nuevo/Existente); nota; "Auto-analizar con IA"; "Agregar a la bandeja". Pill de cola + barra de progreso batch.
- **Tabs de estado**: Por revisar / Aprobados / Cargados / Rechazados (con conteos).
- **Filtros**: concepto (+ virtuales: Completos, Faltan video, Sin transcripción, Faltan Drive), Agrupar, Ocultar faltantes, empresa, buscar; acciones: Traer videos (Apify), Copiar faltantes, Borrar faltantes, Respaldar a Drive, Rellenar notas, "Cargar N al banco", Seleccionar.
- **Barra bulk**: Analizar, Forzar, Clasificar (ClassifyRefsModal), Cargar al banco, Aprobar, Rechazar, Asignar empresa, Eliminar.
- **InboxCard**: thumb, badge plataforma, "IA N%", días corriendo, Drive, empresa, título, link fuente, etapa+etiquetas, nota, "necesita video"; acciones por estado (Subir video, Analizar/Re-analizar, Editar → InboxItemModal, Cargar, Aprobar, Rechazar).
- **Modales**: InboxItemModal (detalle+editar+cargar al banco), ClassifyRefsModal, ForeplaySyncModal, discover (Apify), doc-import (2 pasos).

### Guionista (`src/team/guiones/GuionesPage.jsx`)
- **Tabs**: Ideas (N) / Guionizar / Formatos / Voz y Expertise.
- **Ideas**: cards (título, tipo/formato, referencia, "Guionizar esta idea").
- **Guionizar**: lista izquierda ("GUIONES (N)" + filtro + "+ Nuevo guion" + ✨ renombrar) + **ScriptGenerator** (input: idea, formato, tono, referencia con transcripción; "Guionizar"; output: título editable, ScriptDurationPill, Ajustar con IA, Aprobar/Rechazar, Copiar, editor RichText).
- **Formatos** (FormatLibrary + FormatModal). **Voz y Expertise** (VoiceExpertisePanel + ExpertiseDocuments).
- Estados: loading, streaming, rate-limit (en workspace), saved flash.

### Despliegue Creativo (`src/despliegue/DespliegueCreativo.jsx`)
- Canvas infinito (zoom/pan/drag). Texto editable (título, labels de etapa) por admin.
- **FloatingStatsPanel**: iconos (Importar del banco, Sincronizar, Config, Simulador), back, colapsar; PipelineTypeToggle (Anuncios/Orgánico); view toggle Referentes/Creados; "Estrategia de venta"; metas y cumplimiento por etapa.
- **CanvasFilterBar**: "Etiquetas" toggle; "Filtrar · N" (Resaltar/Ocultar, links, categorías). **ZoomControls** (+/⊙/−).
- **FormatBlock**: label + "+ Agregar" concepto; bucket droppable.
- **ConceptCard**: handle, nombre, descripción, "Referentes/Anuncios creados · N", grid de thumbs + "+".
- **Modales**: ExampleModal (read-only cliente / editar admin: media player, notas, guion, etiquetas), ConceptViewPanel, ConceptModal, ConfigModal (cadencia), StrategyModal, ScalingSimulatorModal, ConceptBankBrowserModal. (Pipeline: SlotModal, WeeklyPlanModal.)

### Finanzas (`src/team/finance/FinancePage.jsx`) — admin
- Nav: pills Cuaderno/Cuentas + "Más ▾" (12 vistas más). **14 vistas**: Cuaderno, Dashboard KPIs, Gastos, Cuentas, Presupuesto, AI Advisor, Acciones, Transacciones, Clientes, Suscripciones, Equipo, Deudas, Metas, Categorías.
- **AI Advisor**: lista de conversaciones, nuevo chat, prompts rápidos, input+enviar (streaming), acciones sugeridas "add"; voz (grabar/parar, auto-enviar).
- **Captura por voz** (FAB): grabar → parsear → VoiceConfirmModal.
- Cada vista secundaria tiene sus modales (Account/Budget/Client/TeamCost/Category/Transaction…).

### Master Tracking (`src/team/tracking/MasterTrackingPage.jsx`)
- Modos Todos / Cliente único; select de empresa; toggle "Archivadas (N)"; WeekSelector.
- ClientTrackingBlock por empresa (grilla semanal); modales ContenidoCell, PerformanceReport, Sla.

### North Star (`src/team/northstar/NorthStarPage.jsx`) — admin
- 3 tarjetas editables inline: Año → Mes → Semana (◀/▶ historial de semanas). Autosave.

### Ajustes · Feedback · Papelera
- **Ajustes** (`SettingsPage`): color neón (swatches + Guardar), cuenta (nombre/email + Cerrar sesión).
- **Feedback** (admin): FilterPills por estado + select de sección; filas (dot, badge, sección, capturas/loom, título); DetailModal (detalle, loom, capturas, contexto técnico, notas, cambiar estado, eliminar).
- **Papelera**: tabla (Tarea/Espacio/Eliminada/Acciones), Restaurar / eliminar definitivo / Vaciar; auto-limpieza 30 días.

---

## Inventario detallado — CLIENTE (workspace por empresa)

### Login (`src/landing/LoginPage.jsx`)
- Email + Contraseña; "Olvidé mi contraseña"; "Iniciar sesión" (busy "Entrando…"); "Empezar prueba gratis". Error box.

### Workspace shell + nav (`src/workspace/CompanyWorkspace.jsx`)
- Sidebar colapsable + main. **Nav** (según rol): Resumen, Reportes, Plan de implementación, Content Pipeline, Despliegue, Control Creativos, Tareas, Equipo, Papelera.
- Toggle de tema; colapsar/expandir sidebar; Censurar; filas de empresa (cambiar empresa activa); "Archivadas (N)"; "Ver tutoriales"; "← Panel general" (admin); tarjeta de colaborador + cerrar sesión.
- Estados: nav gateado por rol, highlight de tutorial, sección Empresas solo si aplica.

### Resumen — CompanyHome (`src/workspace/CompanyHome.jsx`)
- Tabs Operations / Content. Selector de período (Hoy/7d/30d/3m). Chip "Actualizado {fecha}". "Compartir link cliente".
- **KPIs** (5, con tooltip ⍰): Ventas, Compras, Costo/compra, ROAS, Equipo en línea.
- **Team Live strip** (hasta 5): avatar+online, nombre, 👑 dueño, rol, "Tarea actual", Scorecard.
- **Operations tab**: cumplimiento semanal, pipeline (6 estados → pipeline), 4 KPIs de tareas, board + "+ Nueva tarea", Actividad.
- **Content tab**: 3 tarjetas de embudo (TOFU/MOFU/BOFU) → canvas.
- Modales: CompanyMemberProfile, TaskModal.

### Reportes (`src/App.jsx`)
- **Lista**: topbar (empresa, "N reportes", "+ Nuevo reporte" [owner/trafficker/admin], Editar/Eliminar cliente [admin]); CompanyStats; colapsable Objetivos + Último reporte; Historial agrupado por tipo (cards: período, conversión, ROAS; hover editar/eliminar).
- **ReportView**: "← Volver", "↓ Descargar PDF"; métricas primarias (toggle vs Promedio/Objetivos); CampaignsAdsViewer; métricas clave vs objetivos; **Modo simulación** (activar, 7 sliders, resetear); secciones de análisis; observaciones de anuncios (admin: cambiar match).
- **CompanyStats**: selector de período + comparación; gráfico de ventas + KPIs con delta; campañas del período.
- **CampaignsAdsViewer**: tabs Campañas/Conjuntos/Anuncios; Embudo/Completo; "Solo con compras"; fullscreen; columnas ordenables/redimensionables; edición inline (admin).
- **NewReportForm** (3 pasos: fechas+métricas+imágenes+productos → análisis+observaciones → generar). **EditReportForm** (reclasificar tipo + editar).

### Plan (`src/workspace/PlanView.jsx`)
- iframe del plan; barra admin (Cambiar/Configurar URL); estados cargando/vacío (admin vs cliente).

### Content Pipeline (`src/workspace/CompanyContentPipeline.jsx`)
- Tabs Board / Calendar / Guiones.
- **Board** (`ContentPipeline` simpleMode): review-mode, multi-select, Exportar guiones, Planear semana, "+ Nuevo slot"; pipeline toggle ads/organic; pills Todos/Videos/Estáticos; barras bulk y de revisión. Modales SlotModal, WeeklyPlanModal, ExportScriptsModal.
- **Calendar**: grilla mensual, nav, sub-tabs Todos/Videos/Estáticos.
- **Guiones**: CompanyGuiones (full-edit admin/owner/PM/copywriter; resto read-only).

### Control Creativos (`src/control_creativos/ControlCreativos.jsx`)
- Hoja tipo Sheets por entrega. Header: "+ Fila", "+ 50 filas". Celdas editables (columnas: nº creativo, formato, hook, producto, tipo, editor, fecha, urls, estado, calidad); dropdowns de opciones editables; borrar filas; anchos redimensionables. Footer DeliveryTabs (crear/renombrar/eliminar entrega). Auto-sync a tarea de edición. Estados loading/error/"No hay entregas".
  - **Nota**: hoy no tiene gate de edición por rol (pendiente).

### Tareas (`src/workspace/CompanyTareas.jsx`)
- Toggle Tablero/Lista; "N de M tareas"; Filtro; "+ Nueva tarea". TasksBoard/TasksList. Modales TaskModal, SpaceManager. Cliente ve por defecto solo sus tareas.

### Equipo (`src/workspace/CompanyTeam.jsx`)
- Header: "Mi cuenta" (no-admin) / "+ Agregar persona" (admin). MemberCards (avatar, badges 👑/UGC, roles, bio). Sección de Roles (7 roles, cubiertos/sin cubrir, asignar). ProfileModal (roles gateados por admin, dueño/UGC, color, cumpleaños, teléfono, bio, email de acceso, eliminar).

### Papelera (`src/workspace/tasks/TrashPage.jsx`)
- "Vaciar papelera"; tabla (Tarea/Espacio/Eliminada/Acciones); Restaurar / eliminar definitivo; auto-limpieza 30 días.

### Despliegue (vista cliente)
- Igual que Despliegue Creativo pero **read-only** (sin drag/edición): reproducir video in-portal, ver notas/guion/etiquetas, filtrar/resaltar. ExampleModal en modo read-only.

---

## Checklist final (para Claude Design)
Recorré el "Mapa de pantallas" y confirmá que **cada** ítem tiene diseño con **todos**
sus botones, filtros, modales, estados (vacío/carga/error/selección/en curso) y variantes
por rol. Marca ✅ lo diseñado; lo que falte, diséñalo antes de cerrar.
