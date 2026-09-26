import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  console.log("connected");

  const cols = await client.query(`
    select column_name, data_type, column_default
    from information_schema.columns
    where table_schema='public' and table_name='company_voice_profile'
    order by ordinal_position
  `);
  console.log("\n=== company_voice_profile COLUMNS ===");
  console.table(cols.rows);

  const rows = await client.query(`
    select company_id, niche,
           case when products is null then null else jsonb_array_length(products) end as n_products,
           updated_at
    from public.company_voice_profile
    order by updated_at desc nulls last limit 20
  `);
  console.log("\n=== company_voice_profile ROWS ===");
  console.table(rows.rows);

  const companies = await client.query(`select id, name from public.companies order by created_at desc limit 20`);
  console.log("\n=== companies ===");
  console.table(companies.rows);

  const masc = await client.query(`
    select company_id, niche, products, updated_at
    from public.company_voice_profile
    limit 10
  `);
  console.log("\n=== voice profile ALL ===");
  for (const r of masc.rows) {
    console.log("company_id:", r.company_id, "niche:", r.niche, "updated_at:", r.updated_at);
    console.log("products:", JSON.stringify(r.products).slice(0, 600));
  }

  await client.end();
}

main().catch((e) => { console.error("ERROR:", e.message, "\nCODE:", e.code); process.exit(1); });
