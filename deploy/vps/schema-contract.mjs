// Extrae consultas literales del código y comprueba su contrato contra PostgreSQL real.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const queries = new Map();
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) { if (!entry.name.includes('test')) await scan(path); continue; }
    if (!/\.jsx?$/.test(path) || path.includes('.test.')) continue;
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\.from\(\s*["'](\w+)["']\s*\)([^;]*?)(?=\.from\(|;)/g)) {
      const table = match[1];
      const chain = match[2].split(/\.from\(/)[0];
      const select = chain.match(/\.select\(\s*["']([^"']+)["']/)?.[1] || '*';
      queries.set(table + ':' + select, { table, select, path });
      const filterFields = [...chain.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|is|in|order|not|ilike|contains)\(\s*["']([a-z_]+)["']/g)].map(m => m[1]);
      if (filterFields.length) {
        const fields = [...new Set(filterFields)].join(',');
        queries.set(table + ':' + fields, { table, select: fields, path });
      }
    }
  }
}
await scan('src'); await scan('api');
let errors = 0;
for (const { table, select, path } of queries.values()) {
  const params = new URLSearchParams({ select, limit: '0' });
  const res = await fetch(`http://127.0.0.1:3001/backend/rest/v1/${table}?${params}`, { headers: { Authorization: `Bearer ${process.env.BACKEND_SERVICE_KEY}` } });
  if (!res.ok) { errors++; console.error(path, table, select, res.status, await res.text()); }
}
console.log(`${queries.size} query contracts checked; ${errors} failures`);
process.exitCode = errors ? 1 : 0;
