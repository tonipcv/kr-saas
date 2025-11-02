import nodemailer from 'nodemailer';

// Configuração do transporter de email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

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
      name: 'KRX',
      address: process.env.SMTP_FROM as string
    };

    await transporter.sendMail({
      from: from || defaultFrom,
      to,
      subject,
      html,
      replyTo,
      attachments
    });

    console.log(`Email enviado com sucesso para: ${to}`);
    return true;
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
