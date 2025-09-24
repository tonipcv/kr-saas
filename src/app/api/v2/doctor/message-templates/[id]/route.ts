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
  const channel = body.channel;
  if (channel && !['email', 'whatsapp', 'sms'].includes(channel)) return 'invalid channel';
  if (channel === 'email') {
    if (!body.subject && !body.html && !body.text && !body.mjml) return 'email requires at least one of subject/html/text/mjml';
  }
  if (channel === 'sms') {
    if (body.text !== undefined && !body.text) return 'sms requires text';
  }
  if (channel === 'whatsapp' || body.waTemplateName || body.waLanguage) {
    if (!body.waTemplateName || !body.waLanguage) return 'whatsapp requires waTemplateName and waLanguage';
  }
  return null;
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const { id } = context.params;

    const row = await prisma.messageTemplate.findFirst({ where: { id, doctorId } });
    if (!row) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/v2/doctor/message-templates/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const { id } = context.params;
    const body = await request.json();

    const exists = await prisma.messageTemplate.findFirst({ where: { id, doctorId } });
    if (!exists) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

    const err = validateTemplateInput({ ...exists, ...body });
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

    // If changing WA identifiers, enforce uniqueness
    if ((body.channel === 'whatsapp' || exists.channel === 'whatsapp') && (body.waTemplateName || body.waLanguage)) {
      const waTemplateName = body.waTemplateName ?? exists.waTemplateName;
      const waLanguage = body.waLanguage ?? exists.waLanguage;
      if (waTemplateName && waLanguage) {
        const dup = await prisma.messageTemplate.findFirst({
          where: {
            doctorId,
            channel: 'whatsapp',
            waTemplateName,
            waLanguage,
            NOT: { id },
          },
        });
        if (dup) return NextResponse.json({ success: false, error: 'WhatsApp template (name+language) already exists' }, { status: 409 });
      }
    }

    if (body.name && body.name !== exists.name) {
      const dupName = await prisma.messageTemplate.findFirst({ where: { doctorId, name: body.name, NOT: { id } } });
      if (dupName) return NextResponse.json({ success: false, error: 'Template name already exists' }, { status: 409 });
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        channel: body.channel ?? undefined,
        subject: body.subject ?? undefined,
        html: body.html ?? undefined,
        text: body.text ?? undefined,
        mjml: body.mjml ?? undefined,
        renderStrategy: body.renderStrategy ?? undefined,
        fromName: body.fromName ?? undefined,
        fromEmail: body.fromEmail ?? undefined,
        replyTo: body.replyTo ?? undefined,
        provider: body.provider ?? undefined,
        waTemplateName: body.waTemplateName ?? undefined,
        waLanguage: body.waLanguage ?? undefined,
        waCategory: body.waCategory ?? undefined,
        waComponents: body.waComponents ?? undefined,
        waStatus: body.waStatus ?? undefined,
        waProviderId: body.waProviderId ?? undefined,
        variablesSchema: body.variablesSchema ?? undefined,
        sampleVariables: body.sampleVariables ?? undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        smsMaxSegments: body.smsMaxSegments ?? undefined,
        isActive: body.isActive ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /api/v2/doctor/message-templates/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const { id } = context.params;

    const exists = await prisma.messageTemplate.findFirst({ where: { id, doctorId } });
    if (!exists) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

    // Ensure not used by sequences steps
    const used = await prisma.messageSequenceStep.findFirst({ where: { templateId: id } });
    if (used) return NextResponse.json({ success: false, error: 'Template in use by a sequence step' }, { status: 409 });

    await prisma.messageTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id }, message: 'Template deleted' });
  } catch (error) {
    console.error('DELETE /api/v2/doctor/message-templates/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
