import nodemailer from 'nodemailer';

// SMTP transporter com pool e rate limit básico
const smtpEnabled = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASSWORD || process.env.SMTP_PASS)
);

const transporter = smtpEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS) as string,
      },
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 2),
      maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 50),
      rateDelta: Number(process.env.SMTP_RATE_DELTA_MS || 1000),
      rateLimit: Number(process.env.SMTP_RATE_LIMIT || 3),
    })
  : null;

const resendEnabled = Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FALLBACK_ALLOWED);

async function sendViaResend({
  to,
  subject,
  html,
  text,
  from,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from: { name: string; address: string };
}) {
  if (!resendEnabled) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from.name ? `${from.name} <${from.address}>` : from.address,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[email][resend] send failed', res.status, data);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[email][resend] error', (e as any)?.message || e);
    return false;
  }
}

function isTransientOrThrottle(err: any) {
  const code = Number(err?.responseCode || 0);
  const msg = String(err?.response || err?.message || '').toLowerCase();
  return (
    code === 451 ||
    code === 421 ||
    (code >= 500 && code < 600) ||
    msg.includes('too many') ||
    msg.includes('rate') ||
    msg.includes('throttle') ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'ECONNECTION'
  );
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: {
    name: string;
    address: string;
  };
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Função genérica para envio de emails
 * @param options Opções do email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { to, subject, html, from, replyTo, attachments } = options;

    const defaultFrom = {
      name: process.env.MAIL_FROM_NAME || 'KRX',
      address: (process.env.SMTP_FROM || process.env.MAIL_FROM) as string,
    };

    const fromHeader = from || defaultFrom;

    // SMTP disabled flag short-circuit
    if (String(process.env.SMTP_DISABLED).toLowerCase() === 'true') {
      console.warn('[email] SMTP_DISABLED=true, skipping SMTP send');
      // try Resend directly if allowed
      if (resendEnabled) {
        const okResend = await sendViaResend({ to, subject, html, text: undefined, from: fromHeader });
        if (okResend) return true;
      }
      return false;
    }

    if (!transporter) {
      console.warn('[email] transporter not configured');
      if (resendEnabled) {
        const okResend = await sendViaResend({ to, subject, html, text: undefined, from: fromHeader });
        if (okResend) return true;
      }
      return false;
    }

    // Try SMTP first
    try {
      await transporter.verify().catch(() => undefined);
      await transporter.sendMail({
        from: fromHeader,
        to,
        subject,
        html,
        replyTo,
        attachments,
      });
      console.log(`[email][smtp] sent to ${to}`);
      return true;
    } catch (smtpErr: any) {
      console.warn('[email][smtp] send failed', smtpErr?.responseCode || '', smtpErr?.message || smtpErr);
      if (isTransientOrThrottle(smtpErr) && resendEnabled) {
        const okResend = await sendViaResend({ to, subject, html, text: undefined, from: fromHeader });
        if (okResend) return true;
      }
      return false;
    }

  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return false;
  }
}

/**
 * Envia um email de código de verificação
 * @param email Email do destinatário
 * @param code Código de verificação
 * @param doctorName Nome do médico
 */
export async function sendVerificationCode(
  email: string,
  code: string,
  doctorName: string
): Promise<boolean> {
  const subject = `Access code for Dr. ${doctorName}'s protocols`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${process.env.NEXT_PUBLIC_APP_URL}/logo.png" alt="KRX Logo" style="max-width: 150px;">
      </div>
      
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px; text-align: center;">Your access code</h1>
      
      <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello,</p>
      
      <p style="color: #555; font-size: 16px; line-height: 1.5;">Your access code for Dr. ${doctorName}'s protocols is:</p>
      
      <div style="background-color: #f7f7f7; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
        <h2 style="font-size: 32px; letter-spacing: 5px; color: #333; margin: 0;">${code}</h2>
      </div>
      
      <p style="color: #555; font-size: 16px; line-height: 1.5;">This code expires in 15 minutes.</p>
      
      <p style="color: #555; font-size: 16px; line-height: 1.5;">If you did not request this code, please ignore this email.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #888; font-size: 14px;">
        <p> ${new Date().getFullYear()} KRX. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    html
  });
}
