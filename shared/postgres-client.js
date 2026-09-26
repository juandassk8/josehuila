// Cliente HTTP propio. PostgREST interpreta consultas y PostgreSQL aplica RLS.
export class Query {
  constructor(client, path) {
    this.client = client; this.path = path; this.params = new URLSearchParams();
    this.method = 'GET'; this.headers = {}; this.preferences = new Set();
  }
  select(columns = '*', options = {}) {
    this.params.set('select', columns);
    if (this.method !== 'GET' && this.method !== 'HEAD') this.preferences.add('return=representation');
    if (options.count) this.preferences.add(`count=${options.count}`);
    if (options.head) this.method = 'HEAD';
    return this;
  }
  insert(body) {
    this.method = 'POST'; this.body = body;
    if (Array.isArray(body) && body.length) this.params.set('columns', [...new Set(body.flatMap(row => Object.keys(row)))].map(key => JSON.stringify(key)).join(','));
    return this;
  }
  update(body) { this.method = 'PATCH'; this.body = body; return this; }
  delete() { this.method = 'DELETE'; return this; }
  upsert(body, options = {}) {
    this.insert(body);
    this.preferences.add(`resolution=${options.ignoreDuplicates ? 'ignore' : 'merge'}-duplicates`);
    if (options.onConflict) this.params.set('on_conflict', options.onConflict);
    // Las filas heterogéneas deben conservar los defaults de las columnas ausentes.
    this.preferences.add('missing=default');
    return this;
  }
  filter(column, op, value) { this.params.append(column, `${op}.${value}`); return this; }
  eq(k, v) { return this.filter(k, 'eq', v); }
  neq(k, v) { return this.filter(k, 'neq', v); }
  gt(k, v) { return this.filter(k, 'gt', v); }
  gte(k, v) { return this.filter(k, 'gte', v); }
  lt(k, v) { return this.filter(k, 'lt', v); }
  lte(k, v) { return this.filter(k, 'lte', v); }
  like(k, v) { return this.filter(k, 'like', v); }
  ilike(k, v) { return this.filter(k, 'ilike', v); }
  is(k, v) { return this.filter(k, 'is', v); }
  in(k, values) {
    const escaped = values.map(v => typeof v === 'string' ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : String(v));
    return this.filter(k, 'in', `(${escaped.join(',')})`);
  }
  contains(k, v) { return this.filter(k, 'cs', Array.isArray(v) ? `{${v.map(x => JSON.stringify(String(x))).join(',')}}` : JSON.stringify(v)); }
  not(k, op, v) { return this.filter(k, `not.${op}`, v); }
  or(value, options = {}) { this.params.append(options.foreignTable ? `${options.foreignTable}.or` : 'or', `(${value})`); return this; }
  match(values) { Object.entries(values).forEach(([k, v]) => this.eq(k, v)); return this; }
  order(column, options = {}) {
    const key = options.foreignTable ? `${options.foreignTable}.order` : 'order';
    const item = `${column}.${options.ascending === false ? 'desc' : 'asc'}${options.nullsFirst === undefined ? '' : options.nullsFirst ? '.nullsfirst' : '.nullslast'}`;
    this.params.set(key, [this.params.get(key), item].filter(Boolean).join(','));
    return this;
  }
  limit(n) { this.params.set('limit', n); return this; }
  range(from, to) { this.params.set('offset', from); this.params.set('limit', to - from + 1); return this; }
  single() { this.cardinality = 'one'; return this; }
  maybeSingle() { this.cardinality = 'optional'; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
  async execute() {
    try {
      const headers = { ...await this.client.headers(), ...this.headers };
      if (this.preferences.size) headers.Prefer = [...this.preferences].join(',');
      if (this.body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await this.client.fetch(`${this.client.url}/rest/v1/${this.path}?${this.params}`, {
        method: this.method, headers, body: this.body === undefined ? undefined : JSON.stringify(this.body),
      });
      const text = await response.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
      const countHeader = response.headers.get('content-range')?.split('/')[1];
      const count = countHeader && countHeader !== '*' ? Number(countHeader) : null;
      if (!response.ok) return { data: null, error: data || { message: `HTTP ${response.status}` }, count, status: response.status };
      if (this.cardinality) {
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (rows.length > 1 || (!rows.length && this.cardinality === 'one')) {
          return { data: null, error: { code: 'PGRST116', message: 'La consulta no devolvió exactamente una fila' }, count, status: 406 };
        }
        data = rows[0] || null;
      }
      return { data, error: null, count, status: response.status };
    } catch (error) { return { data: null, error: { message: error.message }, count: null, status: 0 }; }
  }
}

export function createDataClient(url, { headers = async () => ({}), fetch: transport = (...args) => globalThis.fetch(...args), publicUrl = url } = {}) {
  const client = { url: url.replace(/\/$/, ''), headers, fetch: transport };
  client.from = table => new Query(client, encodeURIComponent(table));
  client.rpc = (name, args = {}) => new Query(client, `rpc/${encodeURIComponent(name)}`).insert(args);
  client.storage = { from(bucket) {
    const encodedBucket = encodeURIComponent(bucket);
    const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
    return {
      getPublicUrl(path) { return { data: { publicUrl: `${publicUrl}/storage/v1/object/public/${encodedBucket}/${encodePath(path)}` } }; },
      async upload(path, body, options = {}) {
        try {
          const res = await transport(`${client.url}/storage/v1/object/${encodedBucket}/${encodePath(path)}`, {
            method: 'POST', headers: { ...await headers(), 'Content-Type': options.contentType || body.type || 'application/octet-stream', 'x-upsert': String(!!options.upsert) }, body,
          });
          const data = await res.json();
          return res.ok ? { data, error: null } : { data: null, error: data };
        } catch (error) { return { data: null, error: { message: error.message } }; }
      },
      async remove(paths) {
        const res = await transport(`${client.url}/storage/v1/object/${encodedBucket}`, { method: 'DELETE', headers: { ...await headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
        const data = await res.json();
        return res.ok ? { data, error: null } : { data: null, error: data };
      },
    };
  } };
  return client;
}
