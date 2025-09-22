import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/whatsapp';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { classifyIntent, generateReply, shouldAutoReply } from '@/lib/ai/auto-reply';
import { sendWhatsAppText } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  try {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
    if (!VERIFY_TOKEN) return NextResponse.json({ error: 'VERIFY_TOKEN not set' }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const result = await verifyWebhook(searchParams, VERIFY_TOKEN);
    if (result.ok) {
      return new NextResponse(result.challenge ?? '', { status: 200 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // WhatsApp will deliver events here
    const body = await req.json().catch(() => ({}));
    console.log('[WA Webhook] event', JSON.stringify(body));

    const enabled = String(process.env.WHATSAPP_AI_AUTOREPLY_ENABLED || '').toLowerCase() === 'true';

    const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id || value?.phone_number_id;
        const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
        const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
        const clinicRow = phoneNumberId
          ? await prisma.$queryRawUnsafe<any[]>(
              `SELECT clinic_id, api_key_enc, iv FROM clinic_integrations WHERE provider = 'WHATSAPP' AND instance_id = $1 LIMIT 1`,
              phoneNumberId,
            )
          : [];
        const clinicId: string | undefined = clinicRow?.[0]?.clinic_id;

        // attempt to recover access token
        let accessToken: string | null = null;
        if (clinicRow?.[0]?.api_key_enc && clinicRow?.[0]?.iv) {
          try {
            const { decryptSecret } = await import('@/lib/crypto');
            accessToken = decryptSecret(clinicRow[0].iv, clinicRow[0].api_key_enc);
          } catch {}
        }

        // Log delivery/read/failed statuses for troubleshooting
        for (const st of statuses) {
          try {
            const status = st?.status;
            const recipientId = st?.recipient_id;
            const messageId = st?.id;
            const errors = Array.isArray(st?.errors) ? st.errors : [];
            console.log('[WA Status]', { status, recipientId, messageId, errors });
          } catch (e) {
            console.error('[WA Status] parse error', e);
          }
        }

        for (const msg of messages) {
          const from = msg?.from; // e.g., "5511999999999"
          const text = msg?.text?.body || '';
          const timestamp = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

          // Session detection (24h): only emit conversation_started if no recent start for this sender
          if (clinicId && from) {
            try {
              const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const recent = await prisma.$queryRawUnsafe<any[]>(
                `SELECT 1 FROM events WHERE clinic_id = $1 AND event_type = 'conversation_started' AND metadata->>'from' = $2 AND timestamp >= $3 LIMIT 1`,
                clinicId,
                String(from),
                cutoff,
              );
              if (!recent || recent.length === 0) {
                await emitEvent({
                  eventType: EventType.conversation_started,
                  actor: EventActor.customer,
                  clinicId,
                  metadata: { channel: 'whatsapp', from: String(from) },
                  timestamp,
                } as any);
              }
            } catch (e) {
              console.error('[events] conversation_started emit failed', e);
            }
          }

          // If this is a reply to a campaign, emit campaign_replied (MVP: emit when text exists)
          if (clinicId && text) {
            try {
              await emitEvent({
                eventType: EventType.campaign_replied,
                actor: EventActor.customer,
                clinicId,
                metadata: { campaign_id: value?.campaign_id || 'unknown', message_text: text, from: String(from || '') },
                timestamp,
              } as any);
            } catch (e) {
              console.error('[events] campaign_replied emit failed', e);
            }
          }

          // Auto-reply MVP behind flag
          if (enabled && accessToken && phoneNumberId && from && text && clinicId) {
            const ci = classifyIntent(text);
            if (shouldAutoReply(ci)) {
              const reply = generateReply(ci);
              if (reply) {
                try {
                  await sendWhatsAppText(accessToken, phoneNumberId, from, reply);
                  // Emit dedicated ai_autoreply_sent event when available; fallback to prediction_made for type-safety
                  try {
                    const evt = (EventType as any).ai_autoreply_sent ?? EventType.prediction_made;
                    const metadata = (EventType as any).ai_autoreply_sent
                      ? { intent: ci.intent, confidence: ci.confidence }
                      : { model: 'next_best_reply', score: ci.confidence, details: { intent: ci.intent } };
                    await emitEvent({
                      eventType: evt,
                      actor: EventActor.system,
                      clinicId,
                      metadata,
                      timestamp: new Date(),
                    } as any);
                  } catch (e) {
                    console.error('[events] ai_autoreply_sent emit failed', e);
                  }
                } catch (e) {
                  console.error('[WA] auto-reply send failed', e);
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('[WA Webhook] error', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
