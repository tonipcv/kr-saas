// scripts/run_esv_migration.js
// Executa um script SQL (texto) contra o banco apontado por DATABASE_URL.
// Uso:
//   node scripts/run_esv_migration.js scripts/sql/20250918_create_email_sender_verification.sql.txt
// Requisitos: pacote 'pg' já está no package.json (devDependency)

require('dotenv').config();
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
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

async function main() {
  const sqlPathArg = process.argv[2] || 'scripts/sql/20250918_create_email_sender_verification.sql.txt';
  const sqlPath = resolve(process.cwd(), sqlPathArg);
  let sql = readFileSync(sqlPath, 'utf8');
  // Remove outer transaction statements if present
  sql = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*BEGIN;?\s*$/i.test(line) && !/^\s*COMMIT;?\s*$/i.test(line))
    .join('\n');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[EsvMigration] DATABASE_URL não definida. Configure no .env.');
    process.exit(1);
  }

  console.log('[EsvMigration] Conectando em', mask(connectionString));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log('[EsvMigration] Migração aplicada com sucesso (sem transação externa).');
  } catch (err) {
    console.error('[EsvMigration] Falha ao aplicar migração:', err?.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[EsvMigration] Erro inesperado:', e?.message || e);
  process.exit(1);
});
