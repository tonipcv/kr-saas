import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinicId');
    const email = url.searchParams.get('email');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return NextResponse.json({ error: 'Missing DATABASE_URL' }, { status: 500 });
    }

    const pool = new Pool({ connectionString });
    try {
      // Prefer the most recent VERIFIED entry; if none, fallback to latest entry.
      const params: any[] = [clinicId];
      const byEmail = email ? ' AND lower(esv.email) = lower($2)' : '';
      if (email) params.push(email);

      const verifiedSql = `
        SELECT esv.clinic_id, esv.email, esv.status, esv.created_at,
               COALESCE(esv.sender_name, c.name) AS sender_name
        FROM email_sender_verification esv
        LEFT JOIN clinics c ON c.id = esv.clinic_id
        WHERE esv.clinic_id = $1 AND lower(esv.status) = 'verified' ${byEmail}
        ORDER BY esv.created_at DESC
        LIMIT 1
      `;
      const latestSql = `
        SELECT esv.clinic_id, esv.email, esv.status, esv.created_at,
               COALESCE(esv.sender_name, c.name) AS sender_name
        FROM email_sender_verification esv
        LEFT JOIN clinics c ON c.id = esv.clinic_id
        WHERE esv.clinic_id = $1 ${byEmail}
        ORDER BY esv.created_at DESC
        LIMIT 1
      `;

      const verified = await pool.query(verifiedSql, params);
      const chosen = verified.rows.length ? verified.rows[0] : (await pool.query(latestSql, params)).rows[0];
      if (!chosen) {
        return NextResponse.json({ exists: false, status: 'DISCONNECTED' });
      }
      const row = chosen;
      // Normalize to UI statuses
      const map: Record<string, 'VERIFIED' | 'PENDING' | 'DISCONNECTED'> = {
        verified: 'VERIFIED',
        pending: 'PENDING',
        expired: 'DISCONNECTED',
        cancelled: 'DISCONNECTED',
        bounced: 'DISCONNECTED',
      };
      const normalized = map[String(row.status).toLowerCase()] || 'DISCONNECTED';
      return NextResponse.json({ exists: true, status: normalized, email: row.email, senderName: row.sender_name || null, createdAt: row.created_at });
    } finally {
      await pool.end();
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
