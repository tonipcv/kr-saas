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
      // Get latest row for this clinic (optionally filtered by email), join clinic name for fallback
      const params: any[] = [clinicId];
      let sql = `
        SELECT esv.clinic_id, esv.email, esv.status, esv.created_at,
               COALESCE(esv.sender_name, c.name) AS sender_name
        FROM email_sender_verification esv
        LEFT JOIN clinics c ON c.id = esv.clinic_id
        WHERE esv.clinic_id = $1
      `;
      if (email) {
        sql += ` AND lower(esv.email) = lower($2)`;
        params.push(email);
      }
      sql += ` ORDER BY esv.created_at DESC LIMIT 1`;

      const { rows } = await pool.query(sql, params);
      if (!rows.length) {
        return NextResponse.json({ exists: false, status: 'DISCONNECTED' });
      }
      const row = rows[0];
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
