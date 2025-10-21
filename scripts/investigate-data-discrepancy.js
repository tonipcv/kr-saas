#!/usr/bin/env node
/**
 * Investigate discrepancy between DB and Frontend APIs.
 * - Connects directly to Postgres (DATABASE_URL) and prints counts/sample rows.
 * - Calls local APIs (default http://localhost:3000) and prints their response sizes/summaries.
 * - If your APIs require auth, pass SESSION_COOKIE env var with your browser cookie header
 *   e.g. SESSION_COOKIE="next-auth.session-token=...; next-auth.csrf-token=..."
 *
 * Usage:
 *   DATABASE_URL=postgres://... SESSION_COOKIE="..." node scripts/investigate-data-discrepancy.js
 *   BASE_URL=http://localhost:3000 node scripts/investigate-data-discrepancy.js
 */
const { Client: PgClient } = require('pg');
let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  try {
    // Prefer undici on Node 18+
    fetchFn = require('undici').fetch;
  } catch {
    try {
      // Fallback to dynamic import of node-fetch (ESM)
      fetchFn = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    } catch {}
  }
}

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

async function inspectDb(url) {
  const client = new PgClient({ connectionString: url });
  await client.connect();
  const qInt = async (sql) => {
    try { const r = await client.query(sql); return parseInt(r.rows[0].c, 10) || 0; } catch { return null; }
  };
  const meta = await client.query(
    `select current_user, current_database(), version() as server_version,
            (select setting from pg_settings where name='search_path') as search_path`);
  const m = meta.rows[0] || {};
  const tables = await client.query(
    `select table_schema, table_name from information_schema.tables
     where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
     and table_name in ('User','VerificationToken','clinics','products','referral_leads')
     order by table_schema, table_name`);

  const counts = {
    users: await qInt('select count(*) as c from "User"'),
    verificationTokens: await qInt('select count(*) as c from "VerificationToken"'),
    clinics: await qInt('select count(*) as c from clinics'),
    products: await qInt('select count(*) as c from products'),
    referralLeads: await qInt('select count(*) as c from referral_leads'),
  };

  // Sample rows (limited fields)
  const sample = {};
  try {
    const s = await client.query('select id, email, role, created_at from "User" order by created_at desc nulls last limit 3');
    sample.users = s.rows;
  } catch { sample.users = []; }
  try {
    const s = await client.query('select identifier, token, expires from "VerificationToken" order by expires desc limit 3');
    sample.verificationTokens = s.rows;
  } catch { sample.verificationTokens = []; }
  try {
    const s = await client.query('select id, name, ownerId, createdAt from clinics order by createdAt desc limit 3');
    sample.clinics = s.rows;
  } catch { sample.clinics = []; }

  await client.end();
  return { meta: { current_user: m.current_user, current_database: m.current_database, server_version: (m.server_version||'').split('\n')[0], search_path: m.search_path }, tables: tables.rows, counts, sample };
}

async function inspectApi(baseUrl, sessionCookie) {
  const endpoints = [
    { name: 'clinics', path: '/api/clinics' },
    { name: 'clinics_current', path: '/api/clinics/current' },
    { name: 'dashboard_summary', path: '/api/v2/doctor/dashboard-summary' },
    { name: 'referrals_manage', path: '/api/referrals/manage' },
    { name: 'profile', path: '/api/profile' },
  ];
  const headers = { 'Content-Type': 'application/json' };
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const results = {};
  for (const ep of endpoints) {
    const url = baseUrl.replace(/\/$/, '') + ep.path;
    try {
      const res = await fetchFn(url, { headers });
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      results[ep.name] = {
        url,
        status: res.status,
        ok: res.ok,
        summary: summarize(parsed),
      };
    } catch (e) {
      results[ep.name] = { url, error: String(e) };
    }
  }
  return results;
}

function summarize(payload) {
  if (payload == null) return null;
  if (typeof payload !== 'object') return String(payload).slice(0, 200);
  // Try to extract common shapes
  const s = {};
  if (Array.isArray(payload)) {
    s.array_length = payload.length;
  } else {
    if ('clinics' in payload && Array.isArray(payload.clinics)) s.clinics_length = payload.clinics.length;
    if ('leads' in payload && Array.isArray(payload.leads)) s.leads_length = payload.leads.length;
    if ('pagination' in payload) s.pagination = payload.pagination;
    if ('success' in payload) s.success = payload.success;
    if ('data' in payload && payload.data && typeof payload.data === 'object') {
      const d = payload.data;
      s.data_keys = Object.keys(d);
      ['totalPatients', 'activeProtocols', 'totalProtocols', 'completedToday'].forEach(k => { if (k in d) s[k] = d[k]; });
    }
    if ('user' in payload && payload.user) {
      const u = payload.user;
      s.user = { id: u.id, email: u.email, role: u.role };
    }
    if ('message' in payload) s.message = payload.message;
    if ('error' in payload) s.error = payload.error;
  }
  return s;
}

(async () => {
  let dbUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const sessionCookie = process.env.SESSION_COOKIE || '';

  // Fallback: read prisma/schema.prisma url if env not set
  if (!dbUrl) {
    try {
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
      if (fs.existsSync(schemaPath)) {
        const content = fs.readFileSync(schemaPath, 'utf8');
        const m = content.match(/datasource\s+db\s*{[\s\S]*?url\s*=\s*"([^"]+)"/);
        if (m) dbUrl = m[1];
      }
    } catch {}
  }

  console.log('DATABASE_URL:', redact(dbUrl));
  console.log('BASE_URL     :', baseUrl);
  console.log('SESSION_COOKIE set:', sessionCookie ? 'yes' : 'no');

  console.log('\n== DB Inspection ==');
  try {
    const db = await inspectDb(dbUrl);
    console.log('meta     :', db.meta);
    console.log('tables   :', db.tables);
    console.log('counts   :', db.counts);
    console.log('samples  :', db.sample);
  } catch (e) {
    console.error('DB inspection failed:', e);
  }

  console.log('\n== API Inspection ==');
  try {
    const api = await inspectApi(baseUrl, sessionCookie);
    console.dir(api, { depth: null });
  } catch (e) {
    console.error('API inspection failed:', e);
  }

  console.log('\nNotes:');
  console.log('- If DB counts are zero but API shows user/clinic in the summary, that likely comes from JWT session and client placeholders.');
  console.log('- Pass SESSION_COOKIE to authenticate API calls if endpoints return 401.');
  console.log('- Clear browser cookies and localStorage (selectedClinicId) to avoid stale UI context.');
})();
