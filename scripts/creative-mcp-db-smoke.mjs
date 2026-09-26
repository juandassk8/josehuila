// Run ONLY against a disposable database. It creates synthetic rows, never production data.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approve, authenticate, challenge, exchange, registerClient } from '../api/_lib/creativeImages/oauth.js';
import { access, contextFor, pickReference } from '../api/_lib/creativeImages/db.js';

const database = process.env.PGDATABASE;
if (!/^inforce_test_creative_[a-z0-9_]+$/.test(database || '')) throw new Error('Use a disposable inforce_test_creative_* database');
const admin = new pg.Pool({ host: process.env.PGHOST || '/var/run/postgresql', user: 'postgres', database });
const runtime = new pg.Pool({ host: process.env.PGHOST || '/var/run/postgresql', user: 'postgres', database, options: '-c role=inforce', max: 2 });
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ad = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const cfg = { issuer: 'https://inforce.test', resource: 'https://inforce.test/api/creative-mcp', redirects: ['https://chatgpt.com/connector_platform_oauth_redirect'] };
try {
  await admin.query(`create schema auth;
    create table auth.users(id uuid primary key,email text,token_version integer default 0,disabled boolean default false);
    create table public.companies(id text primary key,name text,owner_user_id uuid);
    create table public.team_members(id uuid,role text,active boolean);
    create table public.client_users(user_id uuid,company_id text);
    create table public.company_team_members(company_id text,auth_user_id uuid,email text);
    create table public.company_voice_profile(company_id text,products jsonb);
    create table public.ad_library_ads(id uuid primary key,brand_id uuid,page_name text,title text,body text,content_hash text,media_content_hash text);
    create table public.ad_library_saves(company_id text,user_id uuid,ad_id uuid,created_at timestamptz default now());
    create table public.ad_library_follows(company_id text,brand_id uuid,active boolean);
    create table public.ad_library_ad_media(ad_id uuid,sha256 text,kind text,position integer);
    create table public.ad_library_media(sha256 text,object_key text,mime_type text);
    grant usage on schema auth to inforce; grant select on auth.users to inforce;`);
  const migration = await readFile(new URL('../db/creative_images.sql', import.meta.url), 'utf8');
  await admin.query(migration); await admin.query(migration); // Idempotent migration.
  await admin.query(`insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test');`, [a,b]);
  await admin.query(`insert into companies values('company-a','Empresa A',$1),('company-b','Empresa B',$2)`, [a,b]);
  await admin.query(`insert into company_voice_profile values('company-a','[{"id":"product-a","name":"Producto A"}]'),('company-b','[{"id":"product-b","name":"Producto B"}]')`);
  await admin.query(`insert into ad_library_ads values($1,$1,'Marca prueba','Referencia','Copy','h','h');
  `, [ad]);
  await admin.query(`insert into ad_library_saves(company_id,user_id,ad_id) values('company-a',$1,$2);`, [a,ad]);
  await admin.query(`insert into ad_library_follows values('company-a',$1,true)`, [ad]);
  await admin.query(`insert into ad_library_ad_media values($1,'hash','image',0)`, [ad]);
  await admin.query(`insert into ad_library_media values('hash','test/never-read','image/png')`);
  await access(runtime,a,'company-a'); await assert.rejects(access(runtime,a,'company-b'));
  const context = await contextFor(runtime,{ user_id:a,company_id:'company-a' });
  assert.equal(context.references.length,1); assert.equal(context.products[0].id,'product-a');
  assert.throws(() => pickReference(context,ad,'product-b'));
  await assert.rejects(contextFor(runtime,{ user_id:b,company_id:'company-a' }));
  const client = await registerClient(runtime,{ redirect_uris:cfg.redirects },cfg);
  const verifier = 'a'.repeat(43);
  const input = { client_id:client.client_id,redirect_uri:cfg.redirects[0],resource:cfg.resource,
    response_type:'code',code_challenge_method:'S256',code_challenge:challenge(verifier),state:'state',scope:'creatives:read creatives:write' };
  await assert.rejects(approve(runtime,a,'company-b',input,cfg));
  const consent = await approve(runtime,a,'company-a',input,cfg);
  const code = new URL(consent.redirect).searchParams.get('code');
  assert.equal(new URL(consent.redirect).searchParams.get('iss'),cfg.issuer);
  const tokenInput = { ...input,code,code_verifier:verifier,grant_type:'authorization_code' };
  await assert.rejects(exchange(runtime,{ ...tokenInput,code_verifier:'b'.repeat(43) },cfg));
  const tokens = await exchange(runtime,tokenInput,cfg);
  await assert.rejects(exchange(runtime,tokenInput,cfg)); // Single use, including after a bad verifier.
  const request = token => ({ headers:{ authorization:`Bearer ${token}` } });
  assert.equal((await authenticate(runtime,request(tokens.access_token),cfg)).company_id,'company-a');
  const refreshed = await exchange(runtime,{ grant_type:'refresh_token',client_id:client.client_id,resource:cfg.resource,refresh_token:tokens.refresh_token },cfg);
  await assert.rejects(authenticate(runtime,request(tokens.access_token),cfg));
  await assert.rejects(exchange(runtime,{ grant_type:'refresh_token',client_id:client.client_id,resource:cfg.resource,refresh_token:tokens.refresh_token },cfg));
  const grant = await authenticate(runtime,request(refreshed.access_token),cfg);
  await runtime.query('update app_private.creative_mcp_grants set revoked_at=now() where id=$1',[grant.id]);
  await assert.rejects(authenticate(runtime,request(refreshed.access_token),cfg));
  await assert.rejects(exchange(runtime,{ grant_type:'refresh_token',client_id:client.client_id,resource:cfg.resource,refresh_token:refreshed.refresh_token },cfg));
  await assert.rejects(admin.query('set role authenticated; select * from app_private.creative_images'));
  console.log('PASS: migration twice; tenant isolation; product scope; OAuth S256; one-use code; refresh rotation; revocation; private table access. Synthetic data only.');
} finally { await runtime.end(); await admin.end(); }
