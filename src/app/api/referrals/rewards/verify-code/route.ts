import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendRewardVerificationEmail } from '@/lib/referral-email-service';
import { randomBytes } from 'crypto';

// POST /api/referrals/rewards/verify-code
// Body: { code: string; email: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    console.debug('[verify-code] session', {
      doctorId: session.user.id,
      doctorEmail: session.user.email
    });

    const { code, email } = await req.json();
    if (!code || !email) {
      return NextResponse.json({ error: 'code e email são obrigatórios' }, { status: 400 });
    }
    
    const codeNorm = String(code).trim().toUpperCase();
    const emailNorm = String(email).trim().toLowerCase();
    console.debug('[verify-code] input', { codeNorm, emailNorm });

    // 1) Validar e identificar a recompensa a partir do código informado
    const codeRow = await prisma.referralRewardCode.findUnique({
      where: { code: codeNorm },
      select: { id: true, code: true, status: true, rewardId: true, redemptionId: true, reward: { select: { doctorId: true, title: true, costInCredits: true } } }
    });
    console.debug('[verify-code] codeRow', codeRow ? {
      id: codeRow.id,
      status: codeRow.status,
      rewardId: codeRow.rewardId,
      redemptionId: codeRow.redemptionId,
      rewardDoctorId: codeRow.reward?.doctorId,
      rewardTitle: codeRow.reward?.title
    } : null);

    if (!codeRow) {
      return NextResponse.json({ error: 'Código de recompensa inválido.' }, { status: 400 });
    }
    if (codeRow.reward?.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Este código não pertence a um reward seu.' }, { status: 403 });
    }

    // 2) Localizar paciente pelo e-mail
    const patient = await prisma.user.findFirst({
      where: { email: emailNorm },
      select: { id: true, name: true, email: true }
    });
    console.debug('[verify-code] patient', patient ? { id: patient.id, email: patient.email } : null);

    if (!patient) {
      return NextResponse.json({ error: 'Paciente não encontrado para este e-mail.' }, { status: 404 });
    }

    // 3) Exigir um resgate PENDING já existente para este paciente e recompensa
    const pending = await prisma.rewardRedemption.findFirst({
      where: {
        userId: patient.id,
        status: 'PENDING',
        rewardId: codeRow.rewardId,
      },
      orderBy: { redeemedAt: 'desc' }
    });
    console.debug('[verify-code] pending', pending ? { id: pending.id, status: pending.status } : null);

    if (!pending) {
      // Não há PENDING. Verificar se já existe APPROVED/FULFILLED para este paciente/reward
      const approved = await prisma.rewardRedemption.findFirst({
        where: {
          userId: patient.id,
          rewardId: codeRow.rewardId,
          status: { in: ['APPROVED', 'FULFILLED'] }
        },
        orderBy: { redeemedAt: 'desc' }
      });
      console.debug('[verify-code] approved', approved ? { id: approved.id, status: approved.status } : null);

      if (approved) {
        if (codeRow.status === 'USED' && codeRow.redemptionId === approved.id) {
          console.debug('[verify-code] already approved for this redemption and code matches');
          return NextResponse.json({
            success: true,
            alreadyApproved: true,
            message: 'Este resgate já foi aprovado para este paciente e este código já está vinculado ao resgate.'
          });
        }
        if (codeRow.status === 'USED' && codeRow.redemptionId && codeRow.redemptionId !== approved.id) {
          console.debug('[verify-code] code used in different redemption', { codeRedemptionId: codeRow.redemptionId, approvedId: approved.id });
          return NextResponse.json({ error: 'Este código já foi utilizado em outro resgate.' }, { status: 400 });
        }
        // Existe aprovado mas o código informado não está vinculado a ele
        console.debug('[verify-code] approved exists but code not linked to it');
        return NextResponse.json({
          error: 'O paciente já possui um resgate aprovado para esta recompensa. Não há necessidade de verificação.'
        }, { status: 409 });
      }

      return NextResponse.json({
        error: 'Nenhum resgate pendente encontrado para este paciente nesta recompensa. Peça ao paciente iniciar o resgate no app antes de verificar o código.'
      }, { status: 404 });
    }

    // Reservar o código para este resgate se ainda estiver UNUSED; se USED por outro, falhar
    if (codeRow.status === 'USED' && codeRow.redemptionId && codeRow.redemptionId !== pending.id) {
      console.debug('[verify-code] code used in another pending redemption mismatch', { codeRedemptionId: codeRow.redemptionId, pendingId: pending.id });
      return NextResponse.json({ error: 'Este código já foi utilizado em outro resgate.' }, { status: 400 });
    }
    if (codeRow.status === 'UNUSED') {
      const updated = await prisma.referralRewardCode.updateMany({
        where: { id: codeRow.id, status: 'UNUSED' },
        data: { status: 'USED', redemptionId: pending.id }
      });
      if (updated.count !== 1) {
        console.debug('[verify-code] failed to reserve code due to race condition');
        return NextResponse.json({ error: 'Falha ao reservar o código. Tente novamente.' }, { status: 409 });
      }
    }

    const redemptionId = pending.id;

    // 4) Criar token de verificação (reutilizando tabela VerificationToken)
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const identifier = `reward-confirm:${redemptionId}`;

    // Limpar tokens antigos para o mesmo resgate
    await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => {});

    await prisma.verificationToken.create({
      data: { identifier, token, expires }
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const confirmUrl = `${baseUrl}/api/referrals/rewards/confirm?token=${encodeURIComponent(token)}&rid=${encodeURIComponent(redemptionId)}`;

    await sendRewardVerificationEmail({
      to: patient.email!,
      doctorName: null,
      rewardTitle: codeRow.reward?.title || null,
      confirmUrl
    });

    console.debug('[verify-code] success: token created and email enqueued', { redemptionId });
    return NextResponse.json({ success: true, message: 'E-mail de confirmação enviado ao paciente. Código reservado para este resgate.' });
  } catch (error: any) {
    const message = error?.message || 'Erro interno do servidor';
    console.error('[verify-code] error', message, { stack: error?.stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
