-- =====================================================================
-- db/rls_hardening_v1.sql  — RLS hardening v1 (blindaje multi-tenant)
--
-- Cierra la brecha por la que hoy cualquiera con la anon key lee/escribe los
-- datos de TODOS los clientes. Deja: team = god-mode; cada cliente = solo sus
-- empresas (por owner_user_id / client_users / company_team_members email|uid);
-- anon = bloqueado en todo lo tenant.
--
-- IMPORTANTE: correr en el SQL Editor de Supabase como `postgres` (owner con
-- BYPASSRLS) — necesario para que las funciones SECURITY DEFINER lean tablas
-- tenant sin recursión de RLS. Idempotente.
--
-- PRECONDICIONES (ver plan): (1) todos los dueños/colaboradores de empresas
-- activas migrados a Supabase Auth; (2) frontend cambiado a company_login_lookup
-- + PIN retirado + sbFetch con JWT. Sin esto, bloquea usuarios reales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. HELPERS (SECURITY DEFINER, STABLE, search_path fijo)
-- ---------------------------------------------------------------------
create or replace function public.is_team_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.team_members t where t.id = auth.uid());
$$;

create or replace function public.accessible_company_ids()
returns setof text language sql stable security definer set search_path = public, pg_temp as $$
  select c.id from public.companies c where c.owner_user_id = auth.uid()
  union
  select cu.company_id from public.client_users cu where cu.user_id = auth.uid()
  union
  select ctm.company_id from public.company_team_members ctm
   where ctm.auth_user_id = auth.uid()
      or ( nullif(lower(auth.jwt() ->> 'email'), '') is not null
           and lower(ctm.email) = lower(auth.jwt() ->> 'email') );
$$;

create or replace function public.accessible_board_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select b.id from public.despliegue_boards b
   where public.is_team_admin() or b.company_id in (select public.accessible_company_ids());
$$;

create or replace function public.accessible_concept_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select cn.id from public.despliegue_concepts cn
   where cn.board_id in (select public.accessible_board_ids());
$$;

create or replace function public.accessible_delivery_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select d.id from public.creative_deliveries d
   where public.is_team_admin() or d.company_id in (select public.accessible_company_ids());
$$;

create or replace function public.accessible_task_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select t.id from public.company_tasks t
   where public.is_team_admin() or t.company_id in (select public.accessible_company_ids());
$$;

create or replace function public.accessible_identity_keys()
returns setof text language sql stable security definer set search_path = public, pg_temp as $$
  select 'team:'||auth.uid()::text where auth.uid() is not null
  union all
  select 'member:'||ctm.id::text from public.company_team_members ctm
   where ctm.auth_user_id = auth.uid()
      or ( nullif(lower(auth.jwt() ->> 'email'), '') is not null
           and lower(ctm.email) = lower(auth.jwt() ->> 'email') )
  union all
  select 'owner:'||c.slug from public.companies c where c.owner_user_id = auth.uid()
  union all
  select 'admin' where public.is_team_admin();
$$;

grant execute on function
  public.is_team_admin(), public.accessible_company_ids(),
  public.accessible_board_ids(), public.accessible_concept_ids(),
  public.accessible_delivery_ids(), public.accessible_task_ids(),
  public.accessible_identity_keys()
to authenticated;

-- Bootstrap del login (pre-auth): solo columnas NO sensibles (nunca pin/email).
create or replace function public.company_login_lookup(p_slug text)
returns table (id text, name text, slug text, owner_user_id uuid, has_email boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.name, c.slug, c.owner_user_id, (c.email is not null)
  from public.companies c
  where c.slug = p_slug or lower(c.name) = lower(p_slug)
  limit 1;
$$;
grant execute on function public.company_login_lookup(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- B. companies (RLS on; sin acceso base para anon)
-- ---------------------------------------------------------------------
alter table public.companies enable row level security;
drop policy if exists "companies tenant" on public.companies;
create policy "companies tenant" on public.companies for all to authenticated
  using ( public.is_team_admin() or owner_user_id = auth.uid()
          or id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or owner_user_id = auth.uid()
          or id in (select public.accessible_company_ids()) );

-- B2. reports (tabla original del portal; también filtra a anon)
alter table public.reports enable row level security;
drop policy if exists "reports tenant" on public.reports;
create policy "reports tenant" on public.reports for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

-- ---------------------------------------------------------------------
-- C. Tablas tenant con company_id directo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'company_team_members','company_scripts','company_voice_profile',
    'company_expertise_base','company_expertise_documents','company_script_formats',
    'company_tasks','company_task_spaces','company_task_activity',
    'company_token_usage','company_ugcs'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "read %s"  on public.%I', t, t);
      execute format('drop policy if exists "write %s" on public.%I', t, t);
      execute format('drop policy if exists %I on public.%I', t||' tenant', t);
      execute format($f$create policy %I on public.%I for all to authenticated
        using (public.is_team_admin() or company_id in (select public.accessible_company_ids()))
        with check (public.is_team_admin() or company_id in (select public.accessible_company_ids()))$f$,
        t||' tenant', t);
    end if;
  end loop;
end $$;

-- company_script_structures (company_id nullable + is_global → global legible por todos)
alter table public.company_script_structures enable row level security;
drop policy if exists "all_script_structures" on public.company_script_structures;
drop policy if exists "company_script_structures tenant" on public.company_script_structures;
create policy "company_script_structures tenant" on public.company_script_structures for all to authenticated
  using ( public.is_team_admin() or is_global = true
          or (company_id is not null and company_id in (select public.accessible_company_ids())) )
  with check ( public.is_team_admin()
          or (company_id is not null and company_id in (select public.accessible_company_ids())) );

-- company_task_assignees (sin company_id → via company_tasks)
alter table public.company_task_assignees enable row level security;
drop policy if exists "read company_task_assignees"  on public.company_task_assignees;
drop policy if exists "write company_task_assignees" on public.company_task_assignees;
drop policy if exists "company_task_assignees tenant" on public.company_task_assignees;
create policy "company_task_assignees tenant" on public.company_task_assignees for all to authenticated
  using ( public.is_team_admin() or task_id in (select public.accessible_task_ids()) )
  with check ( public.is_team_admin() or task_id in (select public.accessible_task_ids()) );

-- ---------------------------------------------------------------------
-- D. Despliegue (boards directo; hijos por parent). Drop auth_all + anon_all.
-- ---------------------------------------------------------------------
alter table public.despliegue_boards enable row level security;
drop policy if exists auth_all_despliegue_boards on public.despliegue_boards;
drop policy if exists anon_all_despliegue_boards on public.despliegue_boards;
drop policy if exists "despliegue_boards tenant" on public.despliegue_boards;
create policy "despliegue_boards tenant" on public.despliegue_boards for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

alter table public.despliegue_concepts enable row level security;
drop policy if exists auth_all_despliegue_concepts on public.despliegue_concepts;
drop policy if exists anon_all_despliegue_concepts on public.despliegue_concepts;
drop policy if exists "despliegue_concepts tenant" on public.despliegue_concepts;
create policy "despliegue_concepts tenant" on public.despliegue_concepts for all to authenticated
  using ( board_id in (select public.accessible_board_ids()) )
  with check ( board_id in (select public.accessible_board_ids()) );

alter table public.despliegue_variations enable row level security;
drop policy if exists auth_all_despliegue_variations on public.despliegue_variations;
drop policy if exists anon_all_despliegue_variations on public.despliegue_variations;
drop policy if exists "despliegue_variations tenant" on public.despliegue_variations;
create policy "despliegue_variations tenant" on public.despliegue_variations for all to authenticated
  using ( concept_id in (select public.accessible_concept_ids()) )
  with check ( concept_id in (select public.accessible_concept_ids()) );

alter table public.despliegue_slots enable row level security;
drop policy if exists auth_all_despliegue_slots on public.despliegue_slots;
drop policy if exists anon_all_despliegue_slots on public.despliegue_slots;
drop policy if exists "despliegue_slots tenant" on public.despliegue_slots;
create policy "despliegue_slots tenant" on public.despliegue_slots for all to authenticated
  using ( board_id in (select public.accessible_board_ids()) )
  with check ( board_id in (select public.accessible_board_ids()) );

alter table public.despliegue_weekly_plans enable row level security;
drop policy if exists auth_all_despliegue_weekly_plans on public.despliegue_weekly_plans;
drop policy if exists anon_all_despliegue_weekly_plans on public.despliegue_weekly_plans;
drop policy if exists "despliegue_weekly_plans tenant" on public.despliegue_weekly_plans;
create policy "despliegue_weekly_plans tenant" on public.despliegue_weekly_plans for all to authenticated
  using ( board_id in (select public.accessible_board_ids()) )
  with check ( board_id in (select public.accessible_board_ids()) );

-- scaling_scenarios (company_id directo; puede no estar deployada aún)
do $$ begin if to_regclass('public.scaling_scenarios') is not null then
  execute 'alter table public.scaling_scenarios enable row level security';
  execute 'drop policy if exists "read scaling_scenarios" on public.scaling_scenarios';
  execute 'drop policy if exists "write scaling_scenarios" on public.scaling_scenarios';
  execute 'drop policy if exists "scaling_scenarios tenant" on public.scaling_scenarios';
  execute $f$create policy "scaling_scenarios tenant" on public.scaling_scenarios for all to authenticated
    using (public.is_team_admin() or company_id in (select public.accessible_company_ids()))
    with check (public.is_team_admin() or company_id in (select public.accessible_company_ids()))$f$;
end if; end $$;

-- ---------------------------------------------------------------------
-- E. Creative control (deliveries/column_options directo; items via delivery)
-- ---------------------------------------------------------------------
alter table public.creative_deliveries enable row level security;
drop policy if exists auth_all_creative_deliveries on public.creative_deliveries;
drop policy if exists anon_all_creative_deliveries on public.creative_deliveries;
drop policy if exists "creative_deliveries tenant" on public.creative_deliveries;
create policy "creative_deliveries tenant" on public.creative_deliveries for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

alter table public.creative_column_options enable row level security;
drop policy if exists auth_all_creative_column_options on public.creative_column_options;
drop policy if exists anon_all_creative_column_options on public.creative_column_options;
drop policy if exists "creative_column_options tenant" on public.creative_column_options;
create policy "creative_column_options tenant" on public.creative_column_options for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

alter table public.creative_items enable row level security;
drop policy if exists auth_all_creative_items on public.creative_items;
drop policy if exists anon_all_creative_items on public.creative_items;
drop policy if exists "creative_items tenant" on public.creative_items;
create policy "creative_items tenant" on public.creative_items for all to authenticated
  using ( delivery_id in (select public.accessible_delivery_ids()) )
  with check ( delivery_id in (select public.accessible_delivery_ids()) );

-- ---------------------------------------------------------------------
-- F. Polimórficas (feedback/notifications/onboarding)
-- ---------------------------------------------------------------------
alter table public.platform_feedback enable row level security;
drop policy if exists "read platform_feedback"  on public.platform_feedback;
drop policy if exists "write platform_feedback" on public.platform_feedback;
drop policy if exists "platform_feedback tenant" on public.platform_feedback;
create policy "platform_feedback tenant" on public.platform_feedback for all to authenticated
  using ( public.is_team_admin() or (company_id is not null and company_id in (select public.accessible_company_ids())) )
  with check ( public.is_team_admin() or (company_id is not null and company_id in (select public.accessible_company_ids())) );

do $$ begin if to_regclass('public.notifications') is not null then
  execute 'alter table public.notifications enable row level security';
  execute 'drop policy if exists "read notifications" on public.notifications';
  execute 'drop policy if exists "write notifications" on public.notifications';
  execute 'drop policy if exists "notifications tenant" on public.notifications';
  execute $f$create policy "notifications tenant" on public.notifications for all to authenticated
    using (public.is_team_admin() or recipient_key in (select public.accessible_identity_keys())
           or (company_id is not null and company_id in (select public.accessible_company_ids())))
    with check (public.is_team_admin() or recipient_key in (select public.accessible_identity_keys())
           or (company_id is not null and company_id in (select public.accessible_company_ids())))$f$;
end if; end $$;

do $$ begin if to_regclass('public.user_onboarding_progress') is not null then
  execute 'alter table public.user_onboarding_progress enable row level security';
  execute 'drop policy if exists "read user_onboarding_progress" on public.user_onboarding_progress';
  execute 'drop policy if exists "write user_onboarding_progress" on public.user_onboarding_progress';
  execute 'drop policy if exists "user_onboarding_progress tenant" on public.user_onboarding_progress';
  execute $f$create policy "user_onboarding_progress tenant" on public.user_onboarding_progress for all to authenticated
    using (public.is_team_admin() or identity_key in (select public.accessible_identity_keys()))
    with check (public.is_team_admin() or identity_key in (select public.accessible_identity_keys()))$f$;
end if; end $$;

-- ---------------------------------------------------------------------
-- G. client_users (arreglar el hueco "admin manage all = cualquier auth")
-- ---------------------------------------------------------------------
alter table public.client_users enable row level security;
drop policy if exists "authenticated read own" on public.client_users;
drop policy if exists "admin manage all"       on public.client_users;
drop policy if exists "client_users read own"  on public.client_users;
drop policy if exists "client_users team admin" on public.client_users;
create policy "client_users read own" on public.client_users
  for select to authenticated using ( user_id = auth.uid() or public.is_team_admin() );
create policy "client_users team admin" on public.client_users
  for all to authenticated using ( public.is_team_admin() ) with check ( public.is_team_admin() );

-- ---------------------------------------------------------------------
-- H. Internas (solo equipo Inforce). using(true) → is_team_admin().
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'team_members','spaces','tasks','task_assignees',
    'content_items','content_metrics','content_milestones','performance_reports','sla_support',
    'scorecard_kpis','scorecard_entries','scorecard_notes','sops',
    'script_formats','voice_profile','expertise_base','scripts',
    'time_tracker_categories','time_tracker_sessions','time_tracker_spaces','time_tracker_tasks',
    'finance_accounts','finance_categories','finance_clients','finance_team_costs',
    'finance_subscriptions','finance_transactions','finance_debts','finance_goals',
    'finance_scopes','finance_petty_expenses','finance_ai_conversations','finance_ai_messages',
    'finance_voice_logs','finance_actions','finance_budget_items',
    'north_star_year','north_star_months','north_star_weeks'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "authenticated all" on public.%I', t);
      execute format('drop policy if exists "auth all" on public.%I', t);
      execute format('drop policy if exists %I on public.%I', t||' team only', t);
      execute format($f$create policy %I on public.%I for all to authenticated
        using (public.is_team_admin()) with check (public.is_team_admin())$f$, t||' team only', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- J. Storage — sacar escritura anon; mantener lectura pública de buckets públicos
-- ---------------------------------------------------------------------
drop policy if exists "public read despliegue-examples" on storage.objects;
drop policy if exists "upload despliegue-examples"      on storage.objects;
drop policy if exists "update despliegue-examples"      on storage.objects;
drop policy if exists "delete despliegue-examples"      on storage.objects;
drop policy if exists "despliegue-examples read"   on storage.objects;
drop policy if exists "despliegue-examples insert" on storage.objects;
drop policy if exists "despliegue-examples update" on storage.objects;
drop policy if exists "despliegue-examples delete" on storage.objects;
create policy "despliegue-examples read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'despliegue-examples');
create policy "despliegue-examples insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'despliegue-examples');
create policy "despliegue-examples update" on storage.objects
  for update to authenticated using (bucket_id = 'despliegue-examples') with check (bucket_id = 'despliegue-examples');
create policy "despliegue-examples delete" on storage.objects
  for delete to authenticated using (bucket_id = 'despliegue-examples');

do $$ begin
  drop policy if exists "feedback_images_read"   on storage.objects;
  drop policy if exists "feedback_images_write"  on storage.objects;
  drop policy if exists "feedback_images_update" on storage.objects;
  drop policy if exists "feedback_images_delete" on storage.objects;
  drop policy if exists "feedback_images read"   on storage.objects;
  drop policy if exists "feedback_images insert" on storage.objects;
  create policy "feedback_images read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'feedback-images');
  create policy "feedback_images insert" on storage.objects
    for insert to authenticated with check (bucket_id = 'feedback-images');
  create policy "feedback_images update" on storage.objects
    for update to authenticated using (bucket_id = 'feedback-images') with check (bucket_id = 'feedback-images');
  create policy "feedback_images delete" on storage.objects
    for delete to authenticated using (bucket_id = 'feedback-images');
exception when others then null; end $$;

notify pgrst, 'reload schema';
-- =====================================================================
-- FIN. Rollback de emergencia por tabla (si un usuario real rompe):
--   drop policy if exists "<tbl> tenant" on public.<tbl>;
--   create policy "<tbl> open auth" on public.<tbl> for all to authenticated
--     using (true) with check (true);
--   notify pgrst, 'reload schema';
-- =====================================================================
