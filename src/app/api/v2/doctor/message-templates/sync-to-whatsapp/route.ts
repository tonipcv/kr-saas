import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';

/**
 * Sync a message template from our database to WhatsApp Business API
 * POST /api/v2/doctor/message-templates/sync-to-whatsapp
 */
export async function POST(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

    const body = await req.json();
    const { templateId, clinicId } = body || {};
    
    if (!templateId) return NextResponse.json({ success: false, error: 'templateId is required' }, { status: 400 });
    if (!clinicId) return NextResponse.json({ success: false, error: 'clinicId is required' }, { status: 400 });

    // Get template from database
    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (template.channel !== 'whatsapp') {
      return NextResponse.json({ success: false, error: 'Template is not a WhatsApp template' }, { status: 400 });
    }

    // Get WhatsApp integration for clinic
    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; waba_id: string | null; instance_id: string | null }>>(
      `SELECT api_key_enc, iv, waba_id, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not connected for this clinic' }, { status: 400 });
    }

    const row = rows[0];
    const token = decryptSecret(row.iv, row.api_key_enc);
    let wabaId = row.waba_id;
    const phoneNumberId = row.instance_id;

    // Try to infer missing wabaId from phone number
    if (!wabaId && phoneNumberId) {
      try {
        const inferUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account`;
        const r = await fetch(inferUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await r.json().catch(() => ({} as any));
        wabaId = j?.whatsapp_business_account?.id || null;
        if (wabaId) {
          await prisma.$executeRawUnsafe(
            `UPDATE clinic_integrations SET waba_id = $1, updated_at = now() WHERE clinic_id = $2 AND provider = 'WHATSAPP'`, 
            wabaId, clinicId
          );
        }
      } catch (e) {
        console.error('Error inferring WABA ID:', e);
      }
    }

    if (!wabaId) {
      return NextResponse.json({ success: false, error: 'Missing WABA ID; reconnect WhatsApp to populate it.' }, { status: 400 });
    }

    // Parse components from template
    let components: any[] = [];
    try {
      const waComponents = typeof template.waComponents === 'string' 
        ? JSON.parse(template.waComponents) 
        : template.waComponents;

      // Build components array for WhatsApp API
      if (waComponents?.header?.text) {
        components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: waComponents.header.text
        });
      }

      if (waComponents?.body?.text) {
        components.push({
          type: 'BODY',
          text: waComponents.body.text
        });
      }

      if (waComponents?.footer?.text) {
        components.push({
          type: 'FOOTER',
          text: waComponents.footer.text
        });
      }

      if (Array.isArray(waComponents?.buttons) && waComponents.buttons.length > 0) {
        const buttons = waComponents.buttons.map((button: any) => {
          if (button.type === 'url') {
            return {
              type: 'URL',
              text: button.url.display_text,
              url: button.url.url
            };
          } else if (button.type === 'reply') {
            return {
              type: 'QUICK_REPLY',
              text: button.reply.title
            };
          }
          return null;
        }).filter(Boolean);

        if (buttons.length > 0) {
          components.push({
            type: 'BUTTONS',
            buttons
          });
        }
      }
    } catch (e) {
      console.error('Error parsing template components:', e);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid template components format' 
      }, { status: 400 });
    }

    if (components.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Template must have at least one component' 
      }, { status: 400 });
    }

    // Send template to WhatsApp API
    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        name: template.waTemplateName,
        category: template.waCategory || 'UTILITY',
        language: template.waLanguage || 'pt_BR',
        components
      }),
    });

    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      const errMsg = (data?.error?.message || 
        (typeof data?.error === 'string' ? data.error : null) || 
        'Graph API error');
      
      return NextResponse.json({ 
        success: false, 
        error: errMsg, 
        details: data 
      }, { status: res.status });
    }

    // Update template with provider ID if available
    if (data?.id) {
      await prisma.messageTemplate.update({
        where: { id: templateId },
        data: { 
          waProviderId: data.id,
          waStatus: 'PENDING'
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      data,
      message: 'Template submitted to WhatsApp for approval'
    });
  } catch (e: any) {
    console.error('Error syncing template to WhatsApp:', e);
    return NextResponse.json({ 
      success: false, 
      error: e.message || 'Internal server error' 
    }, { status: 500 });
  }
}
