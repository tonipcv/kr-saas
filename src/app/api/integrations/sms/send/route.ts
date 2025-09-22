import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Provider: SMSDev (same used in public register flow)
const SMSDEV_ENDPOINT = 'https://api.smsdev.com.br/v1/send';

function onlyDigits(s: string) {
  return (s || '').replace(/\D+/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { to, message, refer, clinicId, campaignId: rawCampaignId } = await req.json();
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SMS Send] Request', { clinicId, to: String(to||'').slice(0, 6)+'…', hasMsg: !!message, refer, campaignId: rawCampaignId });
    }
    const apiKey = process.env.SMSDEV_KEY;
    if (!apiKey) {
      console.error('[integrations/sms/send] Missing SMSDEV_KEY');
      return NextResponse.json({ error: 'Missing SMSDEV_KEY' }, { status: 500 });
    }

    const number = onlyDigits(to);
    if (!number) {
      return NextResponse.json({ error: 'Invalid phone "to"' }, { status: 400 });
    }

    const msg = String(message ?? '').trim();
    if (!msg) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const params = new URLSearchParams({
      key: apiKey,
      type: '9',
      number,
      msg,
    });
    if (refer) params.set('refer', String(refer).slice(0, 100));

    const url = `${SMSDEV_ENDPOINT}?${params.toString()}`;
    console.log('[integrations/sms/send] provider url', url.replace(apiKey, '***'));

    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok) {
      // Best-effort logging of failure
      try {
        if (clinicId) {
          const id = `sms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          try {
            // Prefer Prisma model if available
            // @ts-ignore
            if (prisma.campaignJob?.create) {
              // @ts-ignore
              await prisma.campaignJob.create({
                data: {
                  id,
                  doctorId: String(clinicId),
                  campaignId: String(rawCampaignId || `sms-${new Date().toISOString().slice(0,10)}`),
                  channel: 'sms',
                  trigger: 'immediate',
                  scheduleAt: new Date(),
                  status: 'failed',
                  lastError: typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}),
                }
              });
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status, last_error)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                id,
                String(clinicId),
                String(rawCampaignId || `sms-${new Date().toISOString().slice(0,10)}`),
                'sms',
                'immediate',
                new Date(),
                'failed',
                typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {})
              );
            }
          } catch (inner) {
            console.error('[jobs] sms failed: raw insert error', inner);
          }
          if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged sms failed', { id, clinicId, campaignId: rawCampaignId });
        }
      } catch (e) { console.error('[jobs] sms failed: log error', e); }
      return NextResponse.json({ error: 'SMS send failed', providerStatus: res.status, providerBody: parsed ?? text }, { status: 502 });
    }

    // Best-effort logging of success
    try {
      if (clinicId) {
        const id = `sms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          // @ts-ignore
          if (prisma.campaignJob?.create) {
            // @ts-ignore
            await prisma.campaignJob.create({
              data: {
                id,
                doctorId: String(clinicId),
                campaignId: String(rawCampaignId || `sms-${new Date().toISOString().slice(0,10)}`),
                channel: 'sms',
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
              String(rawCampaignId || `sms-${new Date().toISOString().slice(0,10)}`),
              'sms',
              'immediate',
              new Date(),
              'done'
            );
          }
        } catch (inner) {
          console.error('[jobs] sms done: raw insert error', inner);
        }
        if (process.env.NODE_ENV !== 'production') console.log('[jobs] logged sms done', { id, clinicId, campaignId: rawCampaignId });
      }
    } catch (e) { console.error('[jobs] sms done: log error', e); }

    return NextResponse.json({ success: true, providerStatus: res.status, providerBody: parsed ?? text });
  } catch (e: any) {
    console.error('[integrations/sms/send] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e?.message || String(e) }, { status: 500 });
  }
}
