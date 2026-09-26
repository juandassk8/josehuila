// Ejecutar como postgres una sola vez. La contraseña queda en un archivo privado.
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { randomToken, hashPassword } from './security.mjs';
const email = process.env.ADMIN_EMAIL;
if (!email || !process.env.ADMIN_CREDENTIAL_FILE) throw new Error('Define ADMIN_EMAIL y ADMIN_CREDENTIAL_FILE');
const client = new pg.Client({ host: '/var/run/postgresql', user: 'postgres', database: 'inforce' });
await client.connect();
try {
  const existing = await client.query('select id from auth.users where email=$1', [email]);
  if (existing.rowCount) throw new Error('La cuenta ya existe; no se cambiará su contraseña');
  const password = randomToken();
  await client.query('begin');
  const user = await client.query('insert into auth.users(email,encrypted_password,email_confirmed_at) values($1,$2,now()) returning id', [email, await hashPassword(password)]);
  await client.query("insert into public.team_members(id,name,email,role,active) values($1,$2,$3,'admin',true)", [user.rows[0].id, process.env.ADMIN_NAME || 'Administrador', email]);
  await writeFile(process.env.ADMIN_CREDENTIAL_FILE, JSON.stringify({ url: 'http://144.91.92.87/equipo', email, password }, null, 2), { mode: 0o600, flag: 'wx' });
  await client.query('commit');
  console.log('Cuenta administradora creada; credenciales guardadas en el archivo privado');
} catch (error) { await client.query('rollback'); throw error; }
finally { await client.end(); }
