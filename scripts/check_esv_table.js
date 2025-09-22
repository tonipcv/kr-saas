// scripts/check_esv_table.js
// Verifica se a tabela email_sender_verification existe e lista colunas/contagens
require('dotenv').config();
const { Client } = require('pg');

function mask(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '***';
  }
}

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[CheckESV] DATABASE_URL não definida. Configure no .env.');
    process.exit(1);
  }
  console.log('[CheckESV] Conectando em', mask(connectionString));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const exists = await client.query("SELECT to_regclass('public.email_sender_verification') AS obj");
    const hasTable = !!exists.rows[0].obj;
    console.log('email_sender_verification:', hasTable ? 'EXISTS' : 'MISSING');
    if (hasTable) {
      const cols = await client.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='email_sender_verification' ORDER BY ordinal_position"
      );
      console.log('Columns:');
      for (const r of cols.rows) console.log('-', r.column_name, r.data_type);
      const counts = await client.query("SELECT status, COUNT(*)::int AS count FROM email_sender_verification GROUP BY status ORDER BY status");
      console.log('Counts by status:', counts.rows);
    }
  } catch (err) {
    console.error('[CheckESV] Erro:', err?.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
