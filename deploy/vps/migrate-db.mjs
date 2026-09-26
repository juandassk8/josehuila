import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const client = new pg.Client({ host: process.env.PGHOST || '/var/run/postgresql', database: process.env.PGDATABASE || 'inforce', user: process.env.PGUSER || 'postgres' });

// Parte sentencias sin romper funciones $$, cadenas, comentarios ni DO blocks.
export function statements(source) {
  const out = []; let start = 0, quote = null, dollar = null, comment = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (dollar) { if (source.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) { if (c === quote) { if (next === quote) i++; else quote = null; } continue; }
    if (c === '-' && next === '-') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '$') { const tag = source.slice(i).match(/^\$[a-zA-Z_0-9]*\$/); if (tag) { dollar = tag[0]; i += dollar.length - 1; continue; } }
    if (c === ';') { out.push(source.slice(start, i + 1)); start = i + 1; }
  }
  if (source.slice(start).trim()) out.push(source.slice(start));
  return out;
}
function localSql(source) {
  return statements(source).filter(statement => {
    const code = statement.replace(/--[^\n]*/g, '').trim();
    // Storage y cron ahora son servicios locales; no crear dependencias del proveedor anterior.
    return !/\bstorage\.(buckets|objects)\b/i.test(code) && !/^(begin|commit|rollback)\s*;/i.test(code);
  }).join('\n').replaceAll('supabase_realtime', 'inforce_changes');
}
async function main() {
  await client.connect();
  await client.query(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  const skip = new Set(['import_jobs_cron.sql', 'team_seed.sql', 'rutina_seed_jose.sql', 'scorecard_seed.sql', 'sops_seed.sql', 'renombra_conceptos.sql', 'taxonomia_fusiones.sql', 'backfill_owner_roles.sql', 'taxonomia_angulos.sql', 'taxonomia_formatos.sql']);
  // El orden histórico importa para los cambios que redefinen políticas o defaults.
  const first = ['team_schema.sql','team_members_schema.sql','add_company_email.sql','client_auth_schema.sql','saas_signup.sql','company_members_auth.sql','company_guiones.sql','guiones_schema.sql','despliegue_creativo.sql','despliegue_v2.sql','despliegue_v3.sql','despliegue_slots.sql','company_tasks.sql','content_schema.sql','creative_control_schema.sql','finance_os_schema.sql','time_tracker_schema.sql','master_tracking_schema.sql','content_pipeline.sql'];
  const last = ['rls_hardening_v1.sql','rls_hardening_v2.sql','google_login_email_match.sql','company_team_members_rls.sql','company_tasks_rls.sql','rls_tablas_abiertas.sql','roles_reales.sql','functions_fixed_search_path.sql'];
  const available = (await readdir(new URL('db/', root))).filter(name => name.endsWith('.sql') && !skip.has(name));
  const ordered = [...first, ...available.filter(n => !first.includes(n) && !last.includes(n)).sort(), ...last].filter(n => available.includes(n));
  const { rows } = await client.query('select name from app_private.migrations');
  let pending = ordered.filter(n => !rows.some(r => r.name === n));
  const errors = new Map();
  while (pending.length) {
    const failed = []; let applied = 0;
    for (const name of pending) {
      const original = await readFile(new URL(`db/${name}`, root), 'utf8');
      let sql = localSql(original);
      if (name === 'time_tracker_tasks.sql') sql = 'drop function if exists public.switch_time_session(uuid,uuid,uuid,text,text);\n' + sql;
      if (name === 'rls_tablas_abiertas.sql') sql = sql.replace(/\] loop/g, '] loop\n    if to_regclass(t) is null then continue; end if;');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into app_private.migrations(name,sha256) values($1,$2)', [name, createHash('sha256').update(original).digest('hex')]);
        await client.query('commit');
        console.log('Applied', name); applied++;
      } catch (error) { await client.query('rollback'); errors.set(name, `${error.code}: ${error.message}`); failed.push(name); }
    }
    pending = failed;
    if (!applied) break;
  }
  if (pending.length) {
    for (const name of pending) console.error('PENDING', name, errors.get(name));
    process.exitCode = 1;
  } else {
    await client.query(await readFile(new URL('./local-schema.sql', import.meta.url), 'utf8'));
    // La firma con espacios reemplaza definitivamente a la histórica con categorías.
    await client.query(localSql(await readFile(new URL('db/time_tracker_spaces.sql', root), 'utf8')));
    await client.query(await readFile(new URL('./permissions.sql', import.meta.url), 'utf8'));
    console.log('Database migrations and local permissions ready');
  }
  await client.end();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exit(1); });
