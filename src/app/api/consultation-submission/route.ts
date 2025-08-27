import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { createConsultationRequestEmail } from '@/email-templates/notifications/consultation-request';
import { createConsultationConfirmationEmail } from '@/email-templates/patient/consultation-confirmation';

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// POST /api/consultation-submission - Submit consultation form
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { 
      formId, 
      doctorId, 
      name, 
      email, 
      whatsapp, 
      age, 
      specialty, 
      message, 
      referralCode 
    } = data;

    // Validate required fields
    if (!formId || !doctorId || !name || !email || !whatsapp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if the form exists and is active
    const form = await prisma.consultationForm.findUnique({
      where: { 
        id: formId,
        doctorId,
        isActive: true
      },
      include: {
        doctor: {
          include: {
            clinicMemberships: {
              where: { isActive: true },
              include: {
                clinic: {
                  select: {
                    name: true,
                    logo: true
                  }
                }
              },
              take: 1
            }
          }
        }
      }
    });

    if (!form) {
      return NextResponse.json({ error: 'Form not found or inactive' }, { status: 404 });
    }

    // Check referral code if provided
    let referrer = null;
    if (referralCode) {
      referrer = await prisma.user.findUnique({
        where: { referral_code: referralCode }
      });
    }

    // Get IP and User Agent
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create submission
    const submission = await prisma.consultationSubmission.create({
      data: {
        formId,
        doctorId,
        submissionData: {
          name,
          email,
          whatsapp,
          age: age || undefined,
          specialty: specialty || undefined,
          message: message || undefined,
          referralCode: referralCode || undefined,
          ipAddress,
          userAgent
        },
        status: 'NEW'
      }
    });

    const clinicName = form.doctor.clinicMemberships?.[0]?.clinic?.name || form.doctor.name || 'Zuzz';
    const clinicLogo = form.doctor.clinicMemberships?.[0]?.clinic?.logo || undefined;
    const doctorName = form.doctor.name || '';

    // Send email to the doctor
    try {
      const doctorEmailHtml = createConsultationRequestEmail({
        patientName: name,
        patientEmail: email,
        patientPhone: whatsapp,
        patientAge: age?.toString() || undefined,
        specialty: specialty || undefined,
        message: message || undefined,
        referrerName: referrer?.name || undefined,
        referralCode: referralCode || undefined,
        clinicName,
        clinicLogo,
        doctorName
      });

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: form.doctor.email!,
        subject: `[Zuzz] New Consultation Request - ${name}`,
        html: doctorEmailHtml
      });
    } catch (emailError) {
      console.error('Error sending email to doctor:', emailError);
    }

    // Send auto-reply if configured
    if (form.thankYouMessage) {
      try {
        const patientEmailHtml = createConsultationConfirmationEmail({
          patientName: name,
          doctorName,
          specialty: specialty || undefined,
          whatsapp,
          message: form.thankYouMessage,
          clinicName,
          clinicLogo
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: `[Zuzz] Consultation Request Confirmation - ${form.doctor.name}`,
          html: patientEmailHtml
        });
      } catch (emailError) {
        console.error('Error sending auto-reply:', emailError);
      }
    }

    // If there is a valid referral code, create credit for the referrer
    if (referrer) {
      try {
        await prisma.referralCredit.create({
          data: {
            userId: referrer.id,
            amount: 1,
            type: 'CONSULTATION_REFERRAL'
          }
        });
      } catch (creditError) {
        console.error('Error creating referral credit:', creditError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      submissionId: submission.id,
      message: 'Form submitted successfully!'
    });

  } catch (error) {
    console.error('Error processing submission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}