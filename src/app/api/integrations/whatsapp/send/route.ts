import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clinic_integrations (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      clinic_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key_enc TEXT NOT NULL,
      iv TEXT NOT NULL,
      instance_id TEXT,
      phone TEXT,
      status TEXT,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { clinicId, to, patientId, message, useTemplate, templateName, templateLanguage, templateComponents, campaignId: rawCampaignId } = body;
    
    // Debug: log incoming request
    console.log('[WA Send] Request body:', JSON.stringify(body, null, 2));
    console.log('[WA Send] Session user:', session.user.id);
    
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    // Verify access
    const clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!clinic) return NextResponse.json({ error: 'Access denied to clinic' }, { status: 403 });

    await ensureTable();

    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; instance_id: string | null }>>(
      `SELECT api_key_enc, iv, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    
    console.log('[WA Send] DB query result:', rows?.length || 0, 'rows found');
    if (!rows || rows.length === 0) {
      console.log('[WA Send] No WhatsApp integration found for clinic:', clinicId);
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const row = rows[0];
    console.log('[WA Send] Integration found - instance_id:', row.instance_id ? 'present' : 'missing');
    if (!row.instance_id) return NextResponse.json({ error: 'WhatsApp phone number not set' }, { status: 400 });

    // Sanitize destination number: keep digits only (Graph expects international format without +)
    let target = (to || '').toString().trim();
    if (!target && patientId) {
      const patient = await prisma.user.findUnique({ where: { id: patientId }, select: { phone: true } });
      if (!patient?.phone) return NextResponse.json({ error: 'Patient has no phone' }, { status: 400 });
      target = patient.phone;
    }
    target = target.replace(/\D+/g, '');
    console.log('[WA Send] Target number after sanitization:', target);
    if (!target) return NextResponse.json({ error: 'Destination number is required' }, { status: 400 });
    if (target.length < 10) {
      return NextResponse.json({ error: 'Destination number looks invalid. Provide full international number with country code (e.g., 5511999999999).' }, { status: 400 });
    }

    const token = decryptSecret(row.iv, row.api_key_enc);
    console.log('[WA Send] Token decrypted, length:', token?.length || 0);
    console.log('[WA Send] Sending via template:', useTemplate, 'templateName:', templateName);
    
    let resp: any = null;
    try {
      if (useTemplate) {
        if (!templateName) {
          return NextResponse.json({ error: 'templateName is required when useTemplate=true' }, { status: 400 });
        }
        console.log('[WA Send] Calling sendWhatsAppTemplate with:', {
          phoneNumberId: row.instance_id,
          to: target,
          templateName,
          language: templateLanguage || 'pt_BR',
          hasComponents: Array.isArray(templateComponents) && templateComponents.length > 0
        });
        resp = await sendWhatsAppTemplate(
          token,
          row.instance_id,
          target,
          String(templateName),
          String(templateLanguage || 'pt_BR'),
          Array.isArray(templateComponents) ? templateComponents : undefined
        );
      } else {
        console.log('[WA Send] Calling sendWhatsAppText with message:', message?.substring(0, 50) + '...');
        resp = await sendWhatsAppText(token, row.instance_id, target, message || 'Olá!');
      }
      // Debug: log Graph immediate response
      console.log('[WA Send] Graph API response:', JSON.stringify(resp, null, 2));
    } catch (err: any) {
      const hint = useTemplate
        ? 'Check if the template name/language exist and are approved for this WABA.'
        : 'If the user did not message in the last 24h, you must use a pre-approved template to initiate the conversation.';
      try { console.error('[WA Send] error', err); } catch {}
      // Log failed job (best-effort)
      try {
        if (clinicId) {
          const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          try {
            // @ts-ignore
            if (prisma.campaignJob?.create) {
              // @ts-ignore
              await prisma.campaignJob.create({
                data: {
                  id,
                  doctorId: String(clinicId),
                  campaignId: String(rawCampaignId || `wa-${new Date().toISOString().slice(0,10)}`),
                  channel: 'whatsapp',
                  trigger: 'immediate',
                  scheduleAt: new Date(),
                  status: 'failed',
                  lastError: err?.message || 'WhatsApp send failed',
                }
              });
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status, last_error)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                id,
                String(clinicId),
                String(rawCampaignId || `wa-${new Date().toISOString().slice(0,10)}`),
                'whatsapp',
                'immediate',
                new Date(),
                'failed',
                err?.message || 'WhatsApp send failed'
              );
            }
            if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged whatsapp failed', { id, clinicId, campaignId: rawCampaignId });
          } catch (inner) {
            console.error('[jobs] whatsapp failed: raw insert error', inner);
          }
        } else {
          console.warn('[jobs] whatsapp failed: missing clinicId, skipping job log');
        }
      } catch (logErr) {
        console.error('[jobs] whatsapp failed: log error', logErr);
      }
      return NextResponse.json({ error: err?.message || 'WhatsApp send failed', hint }, { status: 400 });
    }

    const msgId = resp?.messages?.[0]?.id;
    if (!msgId) {
      const errObj = resp?.error || resp;
      return NextResponse.json({ success: false, error: 'WhatsApp did not return a message id', details: errObj }, { status: 400 });
    }

    // Fire conversation_started event (non-blocking on failure)
    try {
      await emitEvent({
        eventType: EventType.conversation_started,
        actor: EventActor.clinic,
        clinicId,
        customerId: patientId ?? null,
        metadata: { channel: 'whatsapp', to: target },
      });
    } catch (e) {
      console.error('[events] conversation_started emit failed', e);
    }

    // Log success (best-effort)
    try {
      if (clinicId) {
        const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          // @ts-ignore
          if (prisma.campaignJob?.create) {
            // @ts-ignore
            await prisma.campaignJob.create({
              data: {
                id,
                doctorId: String(clinicId),
                campaignId: String(rawCampaignId || `wa-${new Date().toISOString().slice(0,10)}`),
                channel: 'whatsapp',
                trigger: 'immediate',
                scheduleAt: new Date(),
                status: 'done',
              }
            });
          } else {
            await prisma.$executeRawUnsafe(
              `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              id,
              String(clinicId),
              String(rawCampaignId || `wa-${new Date().toISOString().slice(0,10)}`),
              'whatsapp',
              'immediate',
              new Date(),
              'done'
            );
          }
          if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged whatsapp done', { id, clinicId, campaignId: rawCampaignId });
        } catch (inner) {
          console.error('[jobs] whatsapp done: raw insert error', inner);
        }
      } else {
        console.warn('[jobs] whatsapp done: missing clinicId, skipping job log');
      }
    } catch (logErr) {
      console.error('[jobs] whatsapp done: log error', logErr);
    }
    return NextResponse.json({ success: true, messageId: msgId, response: resp });
  } catch (e: any) {
    console.error('WA send error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
