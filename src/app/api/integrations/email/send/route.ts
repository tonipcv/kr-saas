import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { prisma } from '@/lib/prisma';

const BASE_URL = 'https://api.sendpulse.com';

async function getAccessToken() {
  const clientId = process.env.SENDPULSE_CLIENT_ID;
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: 'Missing SENDPULSE_CLIENT_ID or SENDPULSE_CLIENT_SECRET in environment' } as const;
  }
  const res = await fetch(`${BASE_URL}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error_description || json?.error || `Auth failed (${res.status})` } as const;
  const token = json?.access_token;
  if (!token) return { error: 'No access_token returned by SendPulse' } as const;
  return { token } as const;
}

export async function POST(req: NextRequest) {
  try {
    const { clinicId, to, subject, message, campaignId: rawCampaignId } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    if (!to) {
      if (process.env.NODE_ENV !== 'production') console.log('[EmailSend] Validation failed: to required');
      return NextResponse.json({ error: 'to required', echoTo: to ?? null }, { status: 400 });
    }
    // Minimal email validation to avoid API 400s
    const toStr = String(to).trim();
    const looksEmail = /.+@.+\..+/.test(toStr);
    if (!looksEmail) {
      if (process.env.NODE_ENV !== 'production') console.log('[EmailSend] Validation failed: invalid to', { to: toStr });
      return NextResponse.json({ error: 'invalid to (email required)', echoTo: toStr }, { status: 400 });
    }
    // Resolve From (prefer clinic-verified sender from DB)
    let fromEmail = '';
    let fromName = '';
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl && clinicId) {
        const pool = new Pool({ connectionString: dbUrl });
        const rs = await pool.query(
          `SELECT email, sender_name FROM email_sender_verification
           WHERE clinic_id = $1 AND status = 'verified'
           ORDER BY created_at DESC LIMIT 1`,
          [String(clinicId)]
        );
        // Also fetch clinic display name to use as fromName when possible
        const rsClinic = await pool.query(`SELECT name FROM clinics WHERE id = $1 LIMIT 1`, [String(clinicId)]);
        await pool.end();
        if (rs.rows?.[0]?.email) {
          fromEmail = String(rs.rows[0].email);
          // Override name using stored sender_name first, then clinic name, then derivation
          const clinicName = rsClinic.rows?.[0]?.name ? String(rsClinic.rows[0].name) : '';
          const storedName = rs.rows?.[0]?.sender_name ? String(rs.rows[0].sender_name) : '';
          if (storedName) {
            fromName = storedName;
          } else if (clinicName) {
            fromName = clinicName;
          } else {
            const local = fromEmail.split('@')[0];
            fromName = local.charAt(0).toUpperCase() + local.slice(1);
          }
        }
      }
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[EmailSend] Failed to resolve clinic sender from DB, falling back to env FROM:', e?.message || e);
      }
    }
    // If no verified sender, fallback to envs
    if (!fromEmail) {
      fromEmail = process.env.EMAIL_FROM || '';
      fromName = process.env.EMAIL_FROM_NAME || 'Zuzz';
    }
    if (!fromEmail) return NextResponse.json({ error: 'Missing FROM: no clinic sender and no EMAIL_FROM env' }, { status: 500 });

    const auth = await getAccessToken();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 500 });

    const safeMsg = (message || '').toString();
    const text = safeMsg;
    const html = `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${safeMsg.replace(/</g,'&lt;')}</div></body></html>`;

    const res = await fetch(`${BASE_URL}/smtp/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        email: {
          subject: subject || 'Mensagem da clínica',
          from: { name: fromName, email: fromEmail },
          to: [{ email: toStr }],
          html,
          text,
        }
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[EmailSend] Request', {
        clinicId,
        to: toStr,
        hasSubject: !!subject,
        textBytes: Buffer.byteLength(text, 'utf8'),
        htmlBytes: Buffer.byteLength(html, 'utf8'),
        fromEmail,
        fromName,
      });
      console.log('[EmailSend] SendPulse response', { ok: res.ok, status: res.status, data });
    }
    if (!res.ok) {
      // Best-effort logging of failure (with fallback to raw SQL)
      try {
        if (clinicId) {
          const id = `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          try {
            // Prefer Prisma model if available
            // @ts-ignore
            if (prisma.campaignJob?.create) {
              // @ts-ignore
              await prisma.campaignJob.create({
                data: {
                  id,
                  doctorId: String(clinicId),
                  campaignId: String(rawCampaignId || `email-${new Date().toISOString().slice(0,10)}`),
                  channel: 'email',
                  trigger: 'immediate',
                  scheduleAt: new Date(),
                  status: 'failed',
                  lastError: data?.message || data?.error || `SendPulse error (${res.status})`,
                },
              });
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status, last_error)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                id,
                String(clinicId),
                String(rawCampaignId || `email-${new Date().toISOString().slice(0,10)}`),
                'email',
                'immediate',
                new Date(),
                'failed',
                data?.message || data?.error || `SendPulse error (${res.status})`
              );
            }
            if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged email failed', { id, clinicId, campaignId: rawCampaignId });
          } catch (inner) {
            console.error('[jobs] email failed: raw insert error', inner);
          }
        }
      } catch (logErr) { console.error('[jobs] email failed: log error', logErr); }
      return NextResponse.json({
        error: data?.message || data?.error || `SendPulse error (${res.status})`,
        details: data,
        status: res.status,
      }, { status: 400 });
    }

    // Best-effort logging of success (done) with fallback to raw SQL
    try {
      if (clinicId) {
        const id = `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          // @ts-ignore
          if (prisma.campaignJob?.create) {
            // @ts-ignore
            await prisma.campaignJob.create({
              data: {
                id,
                doctorId: String(clinicId),
                campaignId: String(rawCampaignId || `email-${new Date().toISOString().slice(0,10)}`),
                channel: 'email',
                trigger: 'immediate',
                scheduleAt: new Date(),
                status: 'done',
              },
            });
          } else {
            await prisma.$executeRawUnsafe(
              `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              id,
              String(clinicId),
              String(rawCampaignId || `email-${new Date().toISOString().slice(0,10)}`),
              'email',
              'immediate',
              new Date(),
              'done'
            );
          }
          if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged email done', { id, clinicId, campaignId: rawCampaignId });
        } catch (inner) {
          console.error('[jobs] email done: raw insert error', inner);
        }
      }
    } catch (logErr) { console.error('[jobs] email done: log error', logErr); }

    return NextResponse.json({ success: true, messageId: data?.id || data?.message_id || null, fromEmail, to: toStr });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
