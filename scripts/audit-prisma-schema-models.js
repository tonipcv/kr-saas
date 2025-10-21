#!/usr/bin/env node
/**
 * Audit Prisma schema models vs actual DB tables.
 * - Reads prisma/schema.prisma
 * - Parses model blocks and detects mapped table name via @@map("...") when present
 * - Connects to Postgres using DATABASE_URL (or falls back to schema.prisma url)
 * - Checks which models have corresponding tables and which do not
 * - Optionally writes a cleaned copy of the schema containing only models with existing tables
 *
 * Usage:
 *   node scripts/audit-prisma-schema-models.js
 *   WRITE_CLEANED=true node scripts/audit-prisma-schema-models.js
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

function readSchemaFile() {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.prisma not found at ${schemaPath}`);
  }
  return { content: fs.readFileSync(schemaPath, 'utf8'), schemaPath };
}

function parseModels(schemaContent) {
  // Naive block parser for `model Name { ... }`
  const models = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(schemaContent)) !== null) {
    const name = m[1];
    const body = m[2];
    // Look for @@map("table_name")
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const mappedTable = mapMatch ? mapMatch[1] : null;
    models.push({ name, body, mappedTable, start: m.index, end: re.lastIndex });
  }
  return models;
}

async function listTables(url) {
  const client = new PgClient({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
    `);
    return r.rows.map((row) => ({ schema: row.table_schema, name: row.table_name }));
  } finally {
    await client.end().catch(() => {});
  }
}

function possibleTableNames(model) {
  const names = new Set();
  if (model.mappedTable) names.add(model.mappedTable);
  // Default Prisma table name is model name unless @@map overrides; support common variants for safety
  names.add(model.name); // e.g., User -> information_schema will have name as stored (quoted)
  // Heuristic snake_case
  const snake = model.name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
  names.add(snake);
  return Array.from(names);
}

(async () => {
  // Resolve DB URL
  const envUrl = process.env.DATABASE_URL || null;
  const { content, schemaPath } = readSchemaFile();
  let schemaUrl = null;
  const ds = content.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  if (ds) schemaUrl = ds[1];
  const dbUrl = envUrl || schemaUrl;

  console.log('Schema file       :', schemaPath);
  console.log('DATABASE_URL (env):', redact(envUrl));
  console.log('Schema URL        :', redact(schemaUrl));
  console.log('Using DB URL      :', redact(dbUrl));

  const models = parseModels(content);
  console.log(`\nFound ${models.length} model(s) in prisma/schema.prisma`);

  let tables = [];
  try {
    tables = await listTables(dbUrl);
  } catch (e) {
    console.error('Failed to list DB tables:', e.message || e);
    process.exitCode = 1;
    return;
  }
  const tableSet = new Set(tables.map((t) => `${t.schema}.${t.name}`));

  const report = [];
  const existing = [];
  const missing = [];

  for (const model of models) {
    const candidates = possibleTableNames(model);
    const exists = tables.some((t) => candidates.includes(t.name));
    report.push({ model: model.name, mappedTable: model.mappedTable || null, matches: candidates, exists });
    if (exists) existing.push(model);
    else missing.push(model);
  }

  console.log('\nModel vs Table report:');
  for (const r of report) {
    console.log(`- ${r.model} => ${r.exists ? 'TABLE FOUND' : 'NO TABLE'} | mapped: ${r.mappedTable || '-'} | candidates: ${r.matches.join(', ')}`);
  }

  // Optionally write cleaned schema copy containing only models with existing tables
  if (process.env.WRITE_CLEANED === 'true') {
    const beforeModels = content.split(/\nmodel\s+\w+\s*\{/)[0] || content; // header and everything before first model
    // Build a new schema: keep everything, but filter model blocks
    // Simpler approach: reconstruct by slicing; but safer to rebuild by replacing model blocks
    let cleaned = content;
    for (const m of missing) {
      // Remove the entire model block (model Name { ... }) including trailing closing bracket
      const re = new RegExp(`\\n?model\\s+${m.name}\\s*\\{[\\s\\S]*?\\n\\}`, 'g');
      cleaned = cleaned.replace(re, '\n');
    }
    const outPath = path.resolve(process.cwd(), 'prisma', 'schema.cleaned.prisma');
    fs.writeFileSync(outPath, cleaned, 'utf8');
    console.log(`\nWritten cleaned schema copy (without models missing tables): ${outPath}`);
  } else {
    console.log('\nSet WRITE_CLEANED=true to output a cleaned copy without models that have no tables.');
  }
})();
