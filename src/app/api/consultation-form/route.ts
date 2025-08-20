import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/consultation-form - Fetch doctor's form
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied. Doctors only.' }, { status: 403 });
    }

    // Fetch existing form
    const form = await prisma.consultationForm.findUnique({
      where: { doctorId: session.user.id }
    });

    if (!form) {
      // Return a default form if none exists
      return NextResponse.json({
        id: null,
        doctorId: session.user.id,
        title: 'Consultation Form',
        description: 'Please fill in the details below to schedule your consultation',
        fields: [],
        isActive: true,
        allowAnonymous: false,
        requireAuth: false,
        autoCreatePatient: true,
        emailNotifications: true,
        smsNotifications: false,
        thankYouMessage: 'Thank you! We will contact you soon.',
        redirectUrl: null,
        customCss: null,
        // Campos de compatibilidade com o frontend
        welcomeMessage: null,
        successMessage: 'Thank you! We will contact you soon.',
        nameLabel: 'Full name',
        emailLabel: 'Email',
        whatsappLabel: 'WhatsApp',
        showAgeField: false,
        ageLabel: 'Age',
        ageRequired: false,
        showSpecialtyField: false,
        specialtyLabel: 'Specialty',
        specialtyOptions: null,
        specialtyRequired: false,
        showMessageField: true,
        messageLabel: 'Message',
        messageRequired: false,
        primaryColor: '#3B82F6',
        backgroundColor: '#FFFFFF',
        textColor: '#1F2937',
        requireReferralCode: false,
        autoReply: true,
        autoReplyMessage: 'We have received your request and will contact you soon.'
      });
    }

    // Transform to the format expected by the frontend
    const transformedForm = {
      ...form,
      // Extrair campos do JSON fields para compatibilidade
      welcomeMessage: null,
      successMessage: form.thankYouMessage || 'Thank you! We will contact you soon.',
      nameLabel: 'Full name',
      emailLabel: 'Email',
      whatsappLabel: 'WhatsApp',
      showAgeField: false,
      ageLabel: 'Age',
      ageRequired: false,
      showSpecialtyField: false,
      specialtyLabel: 'Specialty',
      specialtyOptions: null,
      specialtyRequired: false,
      showMessageField: true,
      messageLabel: 'Message',
      messageRequired: false,
      primaryColor: '#3B82F6',
      backgroundColor: '#FFFFFF',
      textColor: '#1F2937',
      requireReferralCode: false,
      autoReply: form.emailNotifications,
      autoReplyMessage: form.thankYouMessage || 'We have received your request and will contact you soon.'
    };

    return NextResponse.json(transformedForm);
  } catch (error) {
    console.error('Error fetching form:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/consultation-form - Create or update form
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied. Doctors only.' }, { status: 403 });
    }

    const data = await request.json();

    // Validate required data
    if (!data.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Build fields based on received data
    const fields = [];
    
    if (data.nameLabel) {
      fields.push({
        type: 'text',
        name: 'name',
        label: data.nameLabel,
        required: true,
        placeholder: 'Enter your full name'
      });
    }
    
    if (data.emailLabel) {
      fields.push({
        type: 'email',
        name: 'email',
        label: data.emailLabel,
        required: true,
        placeholder: 'Enter your email'
      });
    }
    
    if (data.whatsappLabel) {
      fields.push({
        type: 'tel',
        name: 'whatsapp',
        label: data.whatsappLabel,
        required: true,
        placeholder: 'Enter your WhatsApp'
      });
    }
    
    if (data.showAgeField) {
      fields.push({
        type: 'number',
        name: 'age',
        label: data.ageLabel || 'Age',
        required: data.ageRequired || false,
        placeholder: 'Enter your age'
      });
    }
    
    if (data.showSpecialtyField) {
      fields.push({
        type: 'select',
        name: 'specialty',
        label: data.specialtyLabel || 'Specialty',
        required: data.specialtyRequired || false,
        options: data.specialtyOptions || []
      });
    }
    
    if (data.showMessageField) {
      fields.push({
        type: 'textarea',
        name: 'message',
        label: data.messageLabel || 'Message',
        required: data.messageRequired || false,
        placeholder: 'Enter your message'
      });
    }

    // Create or update form
    const form = await prisma.consultationForm.upsert({
      where: { doctorId: session.user.id },
      update: {
        title: data.title,
        description: data.description || null,
        fields: fields,
        isActive: data.isActive !== undefined ? data.isActive : true,
        allowAnonymous: !data.requireReferralCode,
        requireAuth: false,
        autoCreatePatient: true,
        emailNotifications: data.autoReply !== undefined ? data.autoReply : true,
        smsNotifications: false,
        thankYouMessage: data.successMessage || data.autoReplyMessage || 'Thank you! We will contact you soon.',
        redirectUrl: null,
        customCss: data.primaryColor || data.backgroundColor || data.textColor ? 
          `:root { --primary-color: ${data.primaryColor || '#3B82F6'}; --bg-color: ${data.backgroundColor || '#FFFFFF'}; --text-color: ${data.textColor || '#1F2937'}; }` : 
          null
      },
      create: {
        doctorId: session.user.id,
        title: data.title,
        description: data.description || null,
        fields: fields,
        isActive: data.isActive !== undefined ? data.isActive : true,
        allowAnonymous: !data.requireReferralCode,
        requireAuth: false,
        autoCreatePatient: true,
        emailNotifications: data.autoReply !== undefined ? data.autoReply : true,
        smsNotifications: false,
        thankYouMessage: data.successMessage || data.autoReplyMessage || 'Thank you! We will contact you soon.',
        redirectUrl: null,
        customCss: data.primaryColor || data.backgroundColor || data.textColor ? 
          `:root { --primary-color: ${data.primaryColor || '#3B82F6'}; --bg-color: ${data.backgroundColor || '#FFFFFF'}; --text-color: ${data.textColor || '#1F2937'}; }` : 
          null
      }
    });

    // Transform response to the expected format
    const transformedForm = {
      ...form,
      welcomeMessage: data.welcomeMessage,
      successMessage: form.thankYouMessage,
      nameLabel: data.nameLabel,
      emailLabel: data.emailLabel,
      whatsappLabel: data.whatsappLabel,
      showAgeField: data.showAgeField,
      ageLabel: data.ageLabel,
      ageRequired: data.ageRequired,
      showSpecialtyField: data.showSpecialtyField,
      specialtyLabel: data.specialtyLabel,
      specialtyOptions: data.specialtyOptions,
      specialtyRequired: data.specialtyRequired,
      showMessageField: data.showMessageField,
      messageLabel: data.messageLabel,
      messageRequired: data.messageRequired,
      primaryColor: data.primaryColor,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      requireReferralCode: !form.allowAnonymous,
      autoReply: form.emailNotifications,
      autoReplyMessage: form.thankYouMessage
    };

    return NextResponse.json(transformedForm);
  } catch (error) {
    console.error('Error saving form:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
 