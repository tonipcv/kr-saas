import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateUniqueSlugForClinic, getUserClinic } from '@/lib/clinic-utils';

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem atualizar configurações da clínica.' }, { status: 403 });
    }

    const { name, description, logo, email, phone, address, city, state, zipCode, country, website } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome da clínica é obrigatório' }, { status: 400 });
    }

    // Buscar clínica do médico
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { ownerId: session.user.id },
          {
            members: {
              some: {
                userId: session.user.id,
                role: { in: ['ADMIN', 'OWNER'] },
                isActive: true
              }
            }
          }
        ]
      }
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clínica não encontrada ou você não tem permissão para editá-la' }, { status: 404 });
    }

    // Verificar se o nome mudou para gerar novo slug
    let newSlug = clinic.slug;
    if (name.trim() !== clinic.name) {
      newSlug = await generateUniqueSlugForClinic(name.trim(), clinic.id);
    }

    // Atualizar clínica
    const updatedClinic = await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        name: name.trim(),
        slug: newSlug,
        description: description?.trim() || null,
        logo: logo?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        country: country?.trim() || null,
        website: website?.trim() || null,
        updatedAt: new Date()
      }
    });

    console.log(`✅ Configurações da clínica atualizadas: ${updatedClinic.name}`);

    // Buscar clínica completa (com members, owner e subscription unificada)
    const fullClinic = await getUserClinic(session.user.id);

    return NextResponse.json({ 
      success: true,
      clinic: fullClinic,
      message: 'Configurações da clínica atualizadas com sucesso'
    });

  } catch (error) {
    console.error('Erro ao atualizar configurações da clínica:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 