import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        google_review_link: true,
        public_cover_image_url: true,
        public_page_template: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        email_verified: true,
        password: true,
        reset_token: true,
        reset_token_expiry: true,
        verification_code: true,
        verification_code_expiry: true,
        doctor_id: true,
        referral_code: true,
        phone: true,
        birth_date: true,
        gender: true,
        address: true,
        emergency_contact: true,
        emergency_phone: true,
        medical_history: true,
        allergies: true,
        medications: true,
        notes: true,
        stripe_connect_id: true,
        ai_assistant_settings: true,
        doctor_slug: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar perfil' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { name, image, phone, google_review_link, doctor_slug, public_cover_image_url, public_page_template } = body;

    // Get current user to check role
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, id: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = { name, image };
    if (typeof phone === 'string') {
      updateData.phone = phone.trim();
    }

    // Only doctors can update google_review_link
    if (currentUser.role === 'DOCTOR' && google_review_link !== undefined) {
      updateData.google_review_link = google_review_link;
    }

    // Only doctors can update public cover image and template
    if (currentUser.role === 'DOCTOR') {
      if (typeof public_cover_image_url === 'string' || public_cover_image_url === null) {
        updateData.public_cover_image_url = public_cover_image_url || null;
      }
      if (typeof public_page_template === 'string') {
        const allowed = ['DEFAULT', 'MINIMAL', 'HERO_CENTER', 'HERO_LEFT'];
        const upper = public_page_template.toUpperCase();
        if (!allowed.includes(upper)) {
          return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
        }
        updateData.public_page_template = upper as any;
      }
    }

    // Allow doctors to update doctor_slug with validation
    if (currentUser.role === 'DOCTOR' && typeof doctor_slug === 'string') {
      const raw = doctor_slug.trim();
      if (raw.length === 0) {
        updateData.doctor_slug = null;
      } else {
        // normalize: lower-case, only a-z0-9 and hyphens, collapse spaces
        const normalized = raw
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

        if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
          return NextResponse.json({ error: 'Slug inválido. Use letras, números e hífens, sem começar/terminar com hífen.' }, { status: 400 });
        }

        // Uniqueness check (exclude current user)
        const exists = await prisma.user.findFirst({
          where: {
            doctor_slug: normalized,
            NOT: { id: currentUser.id },
          },
          select: { id: true },
        });
        if (exists) {
          return NextResponse.json({ error: 'Este slug já está em uso. Escolha outro.' }, { status: 409 });
        }

        updateData.doctor_slug = normalized;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar perfil' },
      { status: 500 }
    );
  }
}
 
