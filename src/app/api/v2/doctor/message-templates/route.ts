import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';

async function authDoctor(request: NextRequest) {
  let userId: string | null = null;
  let userRole: string | null = null;
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    userId = session.user.id;
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    userRole = dbUser?.role || null;
  } else {
    const mobileUser = await verifyMobileAuth(request);
    if (mobileUser?.id) {
      userId = mobileUser.id;
      userRole = mobileUser.role;
    }
  }
  if (!userId || userRole !== 'DOCTOR') return null;
  return userId;
}

function validateTemplateInput(body: any) {
  const { name, channel } = body || {};
  if (!name || !channel) return 'name and channel are required';
  if (!['email', 'whatsapp', 'sms'].includes(channel)) return 'invalid channel';
  if (channel === 'email') {
    if (!body.subject && !body.html && !body.text && !body.mjml) return 'email requires at least one of subject/html/text/mjml';
  }
  if (channel === 'sms') {
    if (!body.text) return 'sms requires text';
  }
  if (channel === 'whatsapp') {
    if (!body.waTemplateName || !body.waLanguage) return 'whatsapp requires waTemplateName and waLanguage';
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const channel = searchParams.get('channel') || undefined;
    const search = searchParams.get('search')?.toLowerCase() || '';
    // Detect actual column casing present in DB
    const cols: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'message_templates'`
    );
    const has = (name: string) => cols.some(c => c.column_name === name);
    const qid = (identifier: string) => `"${identifier}"`;
    const col = (camel: string, snake: string) => qid(has(camel) ? camel : has(snake) ? snake : camel); // quoted fallback

    const cDoctorId = col('doctorId', 'doctor_id');
    const cCreatedAt = col('createdAt', 'created_at');
    const cUpdatedAt = col('updatedAt', 'updated_at');
    const cIsActive  = col('isActive',  'is_active');
    const cFromName  = col('fromName',  'from_name');
    const cFromEmail = col('fromEmail', 'from_email');
    const cReplyTo   = col('replyTo',   'reply_to');
    const cWaTemplateName = col('waTemplateName', 'wa_template_name');
    const cWaLanguage     = col('waLanguage',     'wa_language');
    const cWaCategory     = col('waCategory',     'wa_category');
    const cWaComponents   = col('waComponents',   'wa_components');
    const cWaStatus       = col('waStatus',       'wa_status');
    const cWaProviderId   = col('waProviderId',   'wa_provider_id');
    const cRenderStrategy = col('renderStrategy', 'render_strategy');
    const cVariablesSchema= col('variablesSchema','variables_schema');
    const cSampleVariables= col('sampleVariables','sample_variables');
    const cSmsMaxSegments = col('smsMaxSegments', 'sms_max_segments');

    // Build WHERE fragments and params safely
    const whereParts: string[] = [`${cDoctorId} = $1`];
    const params: any[] = [doctorId];
    let pIndex = params.length + 1;
    if (channel) { whereParts.push(`${qid('channel')} = $${pIndex++}`); params.push(channel); }
    if (search) { whereParts.push(`LOWER(${qid('name')}) LIKE $${pIndex++}`); params.push(`%${search}%`); }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Query rows with aliases to match Prisma shape expected by UI
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ${qid('id')} AS "id",
              ${qid('name')} AS "name",
              ${qid('channel')} AS "channel",
              ${cIsActive}   AS "isActive",
              ${cCreatedAt}  AS "createdAt",
              ${cUpdatedAt}  AS "updatedAt",
              ${qid('subject')} AS "subject",
              ${qid('html')} AS "html",
              ${qid('text')} AS "text",
              ${qid('mjml')} AS "mjml",
              ${cRenderStrategy} AS "renderStrategy",
              ${cFromName}  AS "fromName",
              ${cFromEmail} AS "fromEmail",
              ${cReplyTo}   AS "replyTo",
              ${qid('provider')} AS "provider",
              ${cWaTemplateName} AS "waTemplateName",
              ${cWaLanguage}     AS "waLanguage",
              ${cWaCategory}     AS "waCategory",
              ${cWaComponents}   AS "waComponents",
              ${cWaStatus}       AS "waStatus",
              ${cWaProviderId}   AS "waProviderId",
              ${cVariablesSchema} AS "variablesSchema",
              ${cSampleVariables} AS "sampleVariables",
              ${qid('tags')} AS "tags",
              ${cSmsMaxSegments} AS "smsMaxSegments"
       FROM message_templates
       ${whereSql}
       ORDER BY ${cCreatedAt} DESC
       OFFSET $${pIndex++} LIMIT $${pIndex}
      `,
      ...params, offset, limit
    );

    const countRes: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM message_templates ${whereSql}`,
      ...params
    );
    const total = Number(countRes?.[0]?.count || 0);

    return NextResponse.json({ success: true, data: rows, pagination: { total, limit, offset, hasMore: offset + limit < total } });
  } catch (error) {
    console.error('GET /api/v2/doctor/message-templates error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    const body = await request.json();
    const err = validateTemplateInput(body);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

    // Unique per doctor: name; and for WA also (doctorId, channel, waTemplateName, waLanguage)
    if (body.channel === 'whatsapp') {
      const dup = await prisma.messageTemplate.findFirst({ where: { doctorId, channel: 'whatsapp', waTemplateName: body.waTemplateName, waLanguage: body.waLanguage } });
      if (dup) return NextResponse.json({ success: false, error: 'WhatsApp template (name+language) already exists' }, { status: 409 });
    }
    const dupName = await prisma.messageTemplate.findFirst({ where: { doctorId, name: body.name } });
    if (dupName) return NextResponse.json({ success: false, error: 'Template name already exists' }, { status: 409 });

    const created = await prisma.messageTemplate.create({
      data: {
        doctorId,
        name: body.name,
        channel: body.channel,
        subject: body.subject ?? null,
        html: body.html ?? null,
        text: body.text ?? null,
        mjml: body.mjml ?? null,
        renderStrategy: body.renderStrategy ?? 'raw_html',
        fromName: body.fromName ?? null,
        fromEmail: body.fromEmail ?? null,
        replyTo: body.replyTo ?? null,
        provider: body.provider ?? null,
        waTemplateName: body.waTemplateName ?? null,
        waLanguage: body.waLanguage ?? null,
        waCategory: body.waCategory ?? null,
        waComponents: body.waComponents ?? null,
        waStatus: body.waStatus ?? null,
        waProviderId: body.waProviderId ?? null,
        variablesSchema: body.variablesSchema ?? null,
        sampleVariables: body.sampleVariables ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        smsMaxSegments: body.smsMaxSegments ?? null,
        isActive: body.isActive ?? true,
      },
    });

    // Auto-sync to WhatsApp (backend) if criteria met
    let sync: any = null;
    try {
      const isWhatsApp = body.channel === 'whatsapp';
      const hasProvider = !!body.provider;
      const hasWaBasics = !!(body.waTemplateName && body.waLanguage);
      const hasBody = (() => {
        try {
          const comps = typeof body.waComponents === 'string' ? JSON.parse(body.waComponents) : body.waComponents;
          return !!comps?.body?.text;
        } catch { return false; }
      })();
      const clinicId = body.clinicId as string | undefined;

      if (isWhatsApp && hasProvider && hasWaBasics && hasBody && clinicId) {
        // Call internal sync endpoint
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/v2/doctor/message-templates/sync-to-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: created.id, clinicId }),
        }).catch(async (e) => {
          // Fallback to relative fetch if absolute fails (during dev)
          try {
            return await fetch('/api/v2/doctor/message-templates/sync-to-whatsapp', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateId: created.id, clinicId })
            });
          } catch { throw e; }
        });
        const json = await res.json().catch(() => ({}));
        sync = { ok: res.ok, status: res.status, body: json };
      }
    } catch (e: any) {
      console.error('[AUTO_SYNC_WA] Failed to sync after creation:', e);
      sync = { ok: false, error: e?.message || String(e) };
    }

    return NextResponse.json({ success: true, data: created, sync }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v2/doctor/message-templates error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
