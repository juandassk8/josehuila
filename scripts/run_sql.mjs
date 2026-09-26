import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL || !process.argv[2]) throw new Error('Define DATABASE_URL y pasa la ruta del archivo SQL');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(process.argv[2], 'utf8'));
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
