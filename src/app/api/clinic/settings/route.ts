import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma, ClinicRole } from '@prisma/client';
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

    const { name, description, logo, email, phone, address, city, state, zipCode, country, website, theme, buttonColor, buttonTextColor, subdomain } = await request.json();
    console.log('[CLINIC SETTINGS] Incoming payload', { name, hasLogo: !!logo, email, phone, city, state, website, subdomain });

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome da clínica é obrigatório' }, { status: 400 });
    }

    // Buscar clínica alvo: se vier clinicId na query e o usuário tiver acesso, usar ela; senão pegar a primeira do usuário
    const { searchParams } = new URL(request.url);
    const clinicIdParam = searchParams.get('clinicId');

    let clinic: Awaited<ReturnType<typeof prisma.clinic.findFirst>> = null;
    if (clinicIdParam) {
      // validar acesso
      clinic = await prisma.clinic.findFirst({
        where: {
          id: clinicIdParam,
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id, isActive: true } } }
          ]
        }
      });
    }
    if (!clinic) {
      // fallback para qualquer clínica do usuário (OWNER ou membro ativo)
      clinic = await prisma.clinic.findFirst({
        where: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id, isActive: true } } }
          ]
        }
      });
    }
    console.log('[CLINIC SETTINGS] Clinic resolved?', { found: !!clinic, clinicId: clinic?.id, ownerId: clinic?.ownerId });

    if (!clinic) {
      return NextResponse.json({ error: 'Clínica não encontrada ou você não tem permissão para editá-la' }, { status: 404 });
    }

    // Se não for owner, validar papel do membro (OWNER ou MANAGER)
    const isOwner = clinic.ownerId === session.user.id;
    if (!isOwner) {
      const membership = await prisma.clinicMember.findFirst({
        where: { clinicId: clinic.id, userId: session.user.id, isActive: true },
        select: { role: true }
      });
      console.log('[CLINIC SETTINGS] Membership role', { role: membership?.role });
      const roleVal = membership?.role as any; // pode ser string em DB legacy
      const allowed = roleVal === 'OWNER' || roleVal === 'MANAGER' || roleVal === ClinicRole.OWNER || roleVal === ClinicRole.MANAGER;
      if (!allowed) {
        return NextResponse.json({ error: 'Apenas OWNER ou MANAGER podem atualizar a clínica' }, { status: 403 });
      }
    }

    // Validar subdomain (optional)
    let nextSubdomain: string | undefined = undefined;
    if (typeof subdomain !== 'undefined') {
      const v = String(subdomain || '').trim().toLowerCase();
      if (v.length > 0) {
        if (!/^[a-z0-9-]{3,63}$/.test(v)) {
          return NextResponse.json({ error: 'Subdomínio inválido. Use apenas letras minúsculas, números e hífen (3-63 caracteres)' }, { status: 400 });
        }
        if (v.startsWith('-') || v.endsWith('-')) {
          return NextResponse.json({ error: 'Subdomínio não pode começar/terminar com hífen' }, { status: 400 });
        }
        const reserved = new Set(['www','api','assets','static']);
        if (reserved.has(v)) {
          return NextResponse.json({ error: 'Subdomínio reservado' }, { status: 400 });
        }
        // Unicidade
        const exists = await prisma.$queryRawUnsafe<any[]>(
          'SELECT id FROM clinics WHERE "subdomain" = $1 AND id <> $2 LIMIT 1',
          v, clinic.id
        );
        if (exists && exists[0]) {
          return NextResponse.json({ error: 'Subdomínio já está em uso' }, { status: 409 });
        }
        nextSubdomain = v;
      } else {
        // vazio -> ignorar (não limpar)
        nextSubdomain = undefined;
      }
    }

    // Validar branding
    let nextTheme: any = undefined;
    if (theme) {
      const up = String(theme).toUpperCase();
      if (up !== 'LIGHT' && up !== 'DARK') {
        return NextResponse.json({ error: 'Tema inválido. Use LIGHT ou DARK.' }, { status: 400 });
      }
      nextTheme = up;
    }

    const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const btnColor = buttonColor && typeof buttonColor === 'string' && hexRe.test(buttonColor) ? buttonColor : (buttonColor ? null : undefined);
    const btnTextColor = buttonTextColor && typeof buttonTextColor === 'string' && hexRe.test(buttonTextColor) ? buttonTextColor : (buttonTextColor ? null : undefined);

    // Verificar se o nome mudou para gerar novo slug
    let newSlug = clinic.slug;
    if (name.trim() !== clinic.name) {
      newSlug = await generateUniqueSlugForClinic(name.trim(), clinic.id);
    }

    // Primeiro, tentar atualizar branding (e subdomain) via RAW SQL para compatibilidade com versões antigas do Prisma Client
    try {
      const sets: string[] = [];
      const values: any[] = [];
      if (typeof nextSubdomain !== 'undefined') { sets.push('"subdomain" = $' + (values.length + 1)); values.push(nextSubdomain); }
      if (nextTheme) { sets.push('theme = $' + (values.length + 1) + '::"ClinicTheme"'); values.push(nextTheme); }
      if (btnColor !== undefined) { sets.push('"buttonColor" = $' + (values.length + 1)); values.push(btnColor); }
      if (btnTextColor !== undefined) { sets.push('"buttonTextColor" = $' + (values.length + 1)); values.push(btnTextColor); }
      if (sets.length > 0) {
        values.push(clinic.id);
        const sql = `UPDATE clinics SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length}`;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await prisma.$executeRawUnsafe(sql, ...values);
      }
    } catch (e) {
      // segue sem travar a requisição; o update abaixo garantirá o resto
      console.warn('[CLINIC SETTINGS] RAW branding update failed (non-fatal):', e);
    }

    // Atualizar clínica (com fallback para clientes Prisma antigos)
    let updatedClinic;
    try {
      updatedClinic = await prisma.clinic.update({
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
          updatedAt: new Date(),
          ...(nextTheme ? { theme: nextTheme } : {}),
          ...(btnColor !== undefined ? { buttonColor: btnColor } : {}),
          ...(btnTextColor !== undefined ? { buttonTextColor: btnTextColor } : {})
        }
      });
    } catch (e: any) {
      // Prisma Client antigo pode não conhecer os campos novos. Usa raw UPDATE para branding.
      const updates: string[] = [];
      const params: any[] = [];
      if (typeof nextSubdomain !== 'undefined') {
        updates.push('"subdomain" = $' + (params.length + 1));
        params.push(nextSubdomain);
        console.log('[CLINIC SETTINGS] Setting subdomain via raw SQL:', nextSubdomain);
      }
      if (nextTheme) {
        updates.push('theme = $' + (params.length + 1) + '::"ClinicTheme"');
        params.push(nextTheme);
      }
      if (btnColor !== undefined) {
        updates.push('"buttonColor" = $' + (params.length + 1));
        params.push(btnColor);
      }
      if (btnTextColor !== undefined) {
        updates.push('"buttonTextColor" = $' + (params.length + 1));
        params.push(btnTextColor);
      }
      if (updates.length) {
        params.push(clinic.id);
        const setClause = updates.join(', ');
        await prisma.$executeRawUnsafe(
          `UPDATE clinics SET ${setClause} WHERE id = $${params.length}`,
          ...params
        );
      }
      // Executa update sem os campos de branding (já atualizados acima)
      updatedClinic = await prisma.clinic.update({
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
          updatedAt: new Date(),
        }
      });
    }

    // Fetch fresh subdomain directly from DB to ensure we return what was actually saved
    let savedSubdomain: string | null = null;
    try {
      const row = await prisma.$queryRawUnsafe<{ subdomain: string | null }[]>(
        'SELECT "subdomain" FROM clinics WHERE id = $1 LIMIT 1',
        clinic.id
      );
      if (row && row[0]) {
        savedSubdomain = row[0].subdomain;
        console.log('[CLINIC SETTINGS] Fresh subdomain from DB:', savedSubdomain);
      }
    } catch (e) {
      console.error('[CLINIC SETTINGS] Error fetching subdomain:', e);
    }

    // Get updated clinic with fresh subdomain
    let fullClinic: any = null;
    try {
      const { getUserClinic } = await import('@/lib/clinic-utils');
      fullClinic = await getUserClinic(session.user.id);
      if (fullClinic && savedSubdomain !== null) {
        fullClinic = { ...fullClinic, subdomain: savedSubdomain };
      }
      console.log('[CLINIC SETTINGS] Returning clinic with subdomain:', fullClinic?.subdomain);
    } catch (e) {
      console.error('[CLINIC SETTINGS] Error getting clinic:', e);
    }

    console.log(`✅ Configurações da clínica atualizadas: ${updatedClinic.name}`);

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