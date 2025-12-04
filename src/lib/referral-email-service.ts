import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { createReferralEmail } from '@/email-templates/notifications/referral';
import { createCreditEmail } from '@/email-templates/notifications/credit';

// Transporter configurável + logs em dev
const smtpPort = Number(process.env.SMTP_PORT || '465');
const smtpSecure = typeof process.env.SMTP_SECURE === 'string'
  ? process.env.SMTP_SECURE === 'true'
  : smtpPort === 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  logger: process.env.NODE_ENV !== 'production',
  debug: process.env.NODE_ENV !== 'production'
});

/**
 * Envia e-mail de verificação para o paciente confirmar o benefício do reward
 */
export async function sendRewardVerificationEmail(params: {
  to: string;
  doctorName?: string | null;
  rewardTitle?: string | null;
  confirmUrl: string;
}) {
  const { to, doctorName, rewardTitle, confirmUrl } = params;
  if (!to) return;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Confirm your reward</h2>
      ${doctorName ? `<p style=\"margin: 0 0 8px;\">Doctor: <strong>${doctorName}</strong></p>` : ''}
      ${rewardTitle ? `<p style=\"margin: 0 0 8px;\">Reward: <strong>${rewardTitle}</strong></p>` : ''}
      <p style="margin: 0 0 12px;">To confirm your reward, click the button below:</p>
      <p style="margin:16px 0;">
        <a href="${confirmUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Confirm reward</a>
      </p>
      <p style="margin: 8px 0 0;color:#475569;font-size:14px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string,
      },
      to,
      subject: 'Confirm your reward',
      html,
    });
  } catch (err) {
    console.error('[email] sendRewardVerificationEmail failed:', err);
  }
}

// Sends a minimal doctor login confirmation email with a black button
export async function sendDoctorLoginConfirmationEmail(params: {
  to: string;
  doctorName?: string | null;
  confirmUrl: string;
}): Promise<boolean> {
  const { to, doctorName, confirmUrl } = params;
  if (!to) return false;

  const requiredEnv = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[email] Missing SMTP env vars:', missing.join(', '));
    return false;
  }

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Confirmar login</h2>
      ${doctorName ? `<p style=\"margin: 0 0 8px;\">Olá, <strong>${doctorName}</strong></p>` : ''}
      <p style="margin: 0 0 12px;">Para concluir seu login como médico, clique no botão abaixo:</p>
      <p style="margin:16px 0;">
        <a href="${confirmUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Confirmar login</a>
      </p>
      <p style="margin: 8px 0 0;color:#475569;font-size:14px;">Se você não solicitou este acesso, ignore este e-mail.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string,
      },
      to,
      subject: 'Confirme seu login',
      html,
    });
    return Boolean(info?.messageId || info?.response);
  } catch (err) {
    console.error('[email] sendDoctorLoginConfirmationEmail failed:', err);
    return false;
  }
}

/**
 * Envia e-mail para o paciente confirmar o USO presencial do reward (FULFILLED)
 */
export async function sendRewardFulfillConfirmationEmail(params: {
  to: string;
  doctorName?: string | null;
  rewardTitle?: string | null;
  confirmUrl: string;
}) {
  const { to, doctorName, rewardTitle, confirmUrl } = params;
  if (!to) return false;
  // Basic SMTP config validation to surface clear errors in dev/staging
  const requiredEnv = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[email] Missing SMTP env vars:', missing.join(', '));
    return false;
  }

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Confirm your reward usage</h2>
      ${doctorName ? `<p style=\"margin: 0 0 8px;\">Doctor: <strong>${doctorName}</strong></p>` : ''}
      ${rewardTitle ? `<p style=\"margin: 0 0 8px;\">Reward: <strong>${rewardTitle}</strong></p>` : ''}
      <p style="margin: 0 0 12px;">To confirm that you used this reward at the clinic, click the button below:</p>
      <p style="margin:16px 0;">
        <a href="${confirmUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Confirm usage</a>
      </p>
      <p style="margin: 8px 0 0;color:#475569;font-size:14px;">If you didn't authorize this, please contact your clinic.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string
      },
      to,
      subject: 'Confirm reward usage',
      html
    });
    return Boolean(info?.messageId || info?.response);
  } catch (err) {
    console.error('[email] sendRewardFulfillConfirmationEmail failed:', err);
    return false;
  }
}

/**
 * Envia notificação quando uma recompensa é rejeitada para o paciente
 */
export async function sendRewardRejectedNotification(redemptionId: string, reason?: string) {
  try {
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: {
        user: { select: { name: true, email: true } },
        reward: { select: { title: true } }
      }
    });

    if (!redemption || !redemption.user?.email) {
      console.error('Resgate não encontrado ou email do usuário inválido:', redemptionId);
      return;
    }

    const rewardTitle = redemption.reward?.title || 'Reward';
    const reasonText = reason?.trim() || (redemption as any)?.notes || undefined;

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Your reward was rejected</h2>
        <p style="margin: 0 0 8px;">Your request for '<strong>${rewardTitle}</strong>' was rejected.</p>
        ${reasonText ? `<p style=\"margin: 0 0 8px;\"><strong>Reason:</strong> ${reasonText}</p>` : ''}
        <p style="margin: 16px 0 0;color:#475569;font-size:14px;">If you have questions, please contact your clinic.</p>
      </div>
    `;

    await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string
      },
      to: redemption.user.email,
      subject: 'Reward rejected',
      html
    });

    console.log('Notificação de recompensa rejeitada enviada para:', redemption.user.email);
  } catch (error) {
    console.error('Erro ao enviar notificação de rejeição de recompensa:', error);
  }
}

/**
 * Envia notificação quando uma recompensa é aprovada para o paciente
 */
export async function sendRewardApprovedNotification(redemptionId: string) {
  try {
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: {
        user: { select: { name: true, email: true } },
        reward: { select: { title: true } }
      }
    });

    if (!redemption || !redemption.user?.email) {
      console.error('Resgate não encontrado ou email do usuário inválido:', redemptionId);
      return;
    }

    const code = (redemption as any).uniqueCode || '';
    const rewardTitle = redemption.reward?.title || 'Reward';

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Your reward was approved!</h2>
        <p style="margin: 0 0 8px;">Your reward '<strong>${rewardTitle}</strong>' has been approved.</p>
        <p style="margin: 0 0 8px;">Use your exclusive code:</p>
        <div style="display:inline-block;padding:10px 16px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:16px;letter-spacing:0.08em;">${code}</div>
        <p style="margin: 16px 0 0;color:#475569;font-size:14px;">Keep this code safe. If you have any questions, contact your clinic.</p>
      </div>
    `;

    await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string
      },
      to: redemption.user.email,
      subject: 'Reward approved',
      html
    });

    console.log('Notificação de recompensa aprovada enviada para:', redemption.user.email);
  } catch (error) {
    console.error('Erro ao enviar notificação de aprovação de recompensa:', error);
  }
}

/**
 * Envia notificação quando uma nova indicação é recebida
 */
export async function sendReferralNotification(leadId: string) {
  try {
    const lead = await prisma.referralLead.findUnique({
      where: { id: leadId },
      include: {
        doctor: { select: { name: true, email: true } }
      }
    });

    if (!lead || !lead.doctor?.email) {
      console.error('Lead não encontrado ou email do médico inválido:', leadId);
      return;
    }

    // Buscar referrer separadamente se existir
    let referrer = null;
    if (lead.referrerId) {
      referrer = await prisma.user.findUnique({
        where: { id: lead.referrerId },
        select: { name: true, email: true }
      });
    }

    // Buscar informações da clínica para personalizar o email
    let clinicInfo = null;
    try {
      if (lead.doctorId) {
        const clinic = await prisma.clinic.findFirst({
          where: {
            members: {
              some: {
                userId: lead.doctorId,
                isActive: true
              }
            }
          },
          select: { name: true, logo: true }
        });
        clinicInfo = clinic;
      }
    } catch (error) {
      console.log('Clínica não encontrada, usando informações do médico');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Email para o médico
    const doctorEmailHtml = createReferralEmail({
      referralName: lead.name,
      referrerName: referrer?.name || 'Unknown',
      doctorName: lead.doctor.name || '',
      clinicName: clinicInfo?.name || 'htps.io',
      clinicLogo: clinicInfo?.logo || undefined
    });

    await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string
      },
      to: lead.doctor.email,
      subject: 'New referral',
      html: doctorEmailHtml
    });

    console.log('Notificação de indicação enviada com sucesso para:', lead.doctor.email);
  } catch (error) {
    console.error('Erro ao enviar notificação de indicação:', error);
  }
}

/**
 * Envia notificação quando um crédito é concedido
 */
export async function sendCreditNotification(creditId: string) {
  try {
    const credit = await prisma.referralCredit.findUnique({
      where: { id: creditId },
      include: {
        user: true,
        referral_leads: {
          select: { name: true }
        }
      }
    });

    if (!credit || !credit.user?.email) {
      console.error('Crédito não encontrado ou email do usuário inválido:', creditId);
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const leadName = credit.referral_leads?.name;

    const emailHtml = createCreditEmail({
      name: credit.user.name || '',
      amount: Number(credit.amount),
      type: 'CONSULTATION_REFERRAL',
      clinicName: 'htps.io'
    });

    await transporter.sendMail({
      from: {
        name: 'htps.io',
        address: process.env.SMTP_FROM as string
      },
      to: credit.user.email,
      subject: 'New credit',
      html: emailHtml
    });

    console.log('Notificação de crédito enviada com sucesso para:', credit.user.email);
  } catch (error) {
    console.error('Erro ao enviar notificação de crédito:', error);
  }
} 