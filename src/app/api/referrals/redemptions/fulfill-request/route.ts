import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendRewardFulfillConfirmationEmail } from '@/lib/referral-email-service';

// POST /api/referrals/redemptions/fulfill-request
// Body: { redemptionId: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { redemptionId } = await req.json();
    if (!redemptionId) {
      return NextResponse.json({ error: 'redemptionId é obrigatório' }, { status: 400 });
    }

    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        reward: { select: { id: true, title: true, doctorId: true } }
      }
    });

    if (!redemption) {
      return NextResponse.json({ error: 'Resgate não encontrado' }, { status: 404 });
    }

    if (redemption.reward?.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Sem permissão para este resgate' }, { status: 403 });
    }

    if (!redemption.user?.email) {
      return NextResponse.json({ error: 'Paciente sem email válido' }, { status: 400 });
    }

    if (redemption.status === 'FULFILLED') {
      return NextResponse.json({ success: true, alreadyFulfilled: true, message: 'Resgate já está concluído (FULFILLED).' });
    }

    if (redemption.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Resgate precisa estar APPROVED para solicitar confirmação de uso.' }, { status: 409 });
    }

    // Gera token de confirmação de uso
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const identifier = `fulfill-confirm:${redemptionId}`;

    await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => {});
    await prisma.verificationToken.create({ data: { identifier, token, expires } });

    // Prefer configured public URL, else derive from request headers
    let rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!rawBaseUrl) {
      const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
      const proto = (req.headers.get('x-forwarded-proto') || 'http').trim();
      if (host) {
        rawBaseUrl = `${proto}://${host}`;
      } else {
        rawBaseUrl = 'http://localhost:3000';
      }
    }
    const baseUrl = rawBaseUrl.replace(/\/+$/, ''); // remove trailing slashes
    const confirmUrl = new URL(`/api/referrals/redemptions/fulfill-confirm?token=${encodeURIComponent(token)}&rid=${encodeURIComponent(redemptionId)}`, baseUrl).toString();

    const sent = await sendRewardFulfillConfirmationEmail({
      to: redemption.user.email,
      doctorName: null,
      rewardTitle: redemption.reward?.title || null,
      confirmUrl
    });

    if (!sent) {
      console.error('[fulfill-request] email not sent', {
        to: redemption.user.email,
        rewardId: redemption.rewardId,
        redemptionId,
      });
      return NextResponse.json({
        error: 'Falha ao enviar e-mail de confirmação. Verifique configuração SMTP e tente novamente.',
      }, { status: 502 });
    }

    console.log('[fulfill-request] email sent', {
      to: redemption.user.email,
      confirmUrl,
      redemptionId,
    });
    return NextResponse.json({ success: true, message: 'E-mail de confirmação de uso enviado ao paciente.' });
  } catch (error: any) {
    const message = error?.message || 'Erro interno do servidor';
    console.error('[fulfill-request] error', message, { stack: error?.stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
