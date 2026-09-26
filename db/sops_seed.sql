-- =========================================================
-- SOPs seed — Central Command de Deison y Nath.
-- URLs de Loom y Documento quedan NULL: José los llena después desde la UI.
-- Correr DESPUÉS de sops_schema.sql.
-- =========================================================

-- DEISON (Performance Auditor) -------------------------------
insert into public.sops (owner_id, group_title, group_subtitle, group_sort, title, focus_text, loom_url, doc_url, sort_order)
select tm.id, g.group_title, g.group_subtitle, g.group_sort, i.title, i.focus_text, null, null, i.sort_order
from public.team_members tm
cross join (values
  (1, 'SECCIÓN 1: El ADN del Cargo',              'El punto de partida para entender por qué auditamos con rigor.'),
  (2, 'SECCIÓN 2: La Operación Diaria',           'Cómo se organiza tu tiempo para que las auditorías sean un reloj.'),
  (3, 'SECCIÓN 3: El Sistema (Auditoría con IA)', 'Aquí es donde aprendes a usar la tecnología de Inforce para ver lo que otros no ven.'),
  (4, 'SECCIÓN 4: Control de Clientes y Rendimiento', 'Las herramientas donde traqueamos que todo esté bajo control.'),
  (5, 'SECCIÓN 5: Estructura y Futuro',           'Hasta dónde llega tu poder y cómo vas a escalar tus ingresos.')
) as g(group_sort, group_title, group_subtitle)
cross join lateral (
  select * from (values
    (1, 1, '1. Misión y Visión de InForce', 'Entender que no solo mandas reportes, sino que eres el guardián que evita que los clientes pierdan dinero.'),
    (2, 1, '2. Ciclo AM/PM y Manual Diario', 'El rigor de los horarios (10 AM y 8 PM) y el SLA de respuesta de menos de 2 horas.'),
    (3, 1, '3. El Artefacto de Claude y Extracción de Data', 'Aprender a filtrar el Ads Manager correctamente y cómo alimentar la IA para que el reporte sea quirúrgico.'),
    (4, 1, '4. Master Tracking de Auditoría (Dashboard)', 'Cómo mantener actualizado el estado de cada cuenta y las métricas principales de cada cliente.'),
    (4, 2, '5. Scorecard de Inforce (Auto-reporte)', 'El hábito de reportar tus 1s y 0s cada día según tu puntualidad y agudeza técnica.'),
    (5, 1, '6. Niveles de Decisión y Comunicación', 'Entender que tu rol es recomendar y diagnosticar, no operar las cuentas directamente. Qué cosas escalas a Jose y qué manejas tú.'),
    (5, 2, '7. Plan de Carrera y Talent Farm', 'La ruta para llegar a Senior, cobrar el 7% de comisión y alcanzar los $7.2 millones de sueldo.')
  ) as x(grp, sort_order, title, focus_text)
  where x.grp = g.group_sort
) as i(grp, sort_order, title, focus_text)
where lower(tm.name) like 'deison%'
  and not exists (select 1 from public.sops s where s.owner_id = tm.id and s.title = i.title);

-- NATH (Client Success & Content Lead) -----------------------
insert into public.sops (owner_id, group_title, group_subtitle, group_sort, title, focus_text, loom_url, doc_url, sort_order)
select tm.id, g.group_title, g.group_subtitle, g.group_sort, i.title, i.focus_text, null, null, i.sort_order
from public.team_members tm
cross join (values
  (1, 'SECCIÓN 1: El ADN del Cargo',               'El punto de partida para entender por qué hacemos lo que hacemos.'),
  (2, 'SECCIÓN 2: La Operación Diaria',            'Cómo se organiza tu tiempo para que la agencia funcione como un reloj.'),
  (3, 'SECCIÓN 3: La Vara (Estándares de Calidad)','Aquí es donde calibras tu ojo para decidir qué sale a pauta y qué se repite.'),
  (4, 'SECCIÓN 4: Control de Clientes y Rendimiento','Las herramientas donde traqueamos que todo esté bajo control.'),
  (5, 'SECCIÓN 5: Estructura y Futuro',            'Hasta dónde llega tu poder y cómo vas a ganar más dinero aquí.')
) as g(group_sort, group_title, group_subtitle)
cross join lateral (
  select * from (values
    (1, 1, '1. Misión y Visión de InForce', 'Entender el impacto de tu trabajo en el crecimiento de las empresas y la visión a largo plazo de la agencia.'),
    (2, 1, '2. Ciclo Semanal y Manual Diario', 'Los horarios de apertura, los días de "presión" a clientes y las tareas recurrentes que no pueden fallar.'),
    (3, 1, '3.1 La Vara de Calidad: Anuncios Estáticos', 'Aprender a dar feedback de alto nivel para que los creativos realmente vendan.'),
    (3, 2, '3.2 La Vara de Calidad: Anuncios de Video', 'Aprender a dar feedback de alto nivel para que los creativos realmente vendan.'),
    (4, 1, '4. Seguimiento de Inforce Consulting (Master Tracking)', 'Cómo mantener actualizado el semáforo de los clientes y el estado de cada producción.'),
    (4, 2, '5. Scorecard de Inforce (Auto-reporte)', 'El hábito de reportar tus 1s y 0s cada tarde antes de cerrar tu jornada.'),
    (5, 1, '6. Niveles de Decisión', 'Qué cosas puedes solucionar tú sola y en qué momentos debes levantar la mano para avisarle a Jose.'),
    (5, 2, '7. Plan de Carrera y Compensación', 'La ruta para pasar de Junior a Senior y cómo funcionan tus bonos de retención y comisiones.')
  ) as x(grp, sort_order, title, focus_text)
  where x.grp = g.group_sort
) as i(grp, sort_order, title, focus_text)
where (lower(tm.name) like 'nath%' or lower(tm.name) like 'nat%' or lower(tm.name) like 'nathalia%')
  and not exists (select 1 from public.sops s where s.owner_id = tm.id and s.title = i.title);

-- Verificación
select tm.name, s.group_title, s.title from public.sops s
  join public.team_members tm on tm.id = s.owner_id
  order by tm.name, s.group_sort, s.sort_order;
