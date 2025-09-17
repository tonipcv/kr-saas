import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

// POST /api/v2/public/register/[slug]
// Body: { name, email, phone, password }
// Resolves clinic by slug OR subdomain, picks a doctor, then creates/links patient + profile and sets credentials.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
) {
  try {
    const { slug } = await Promise.resolve(params as any);
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { name, email, phone, password, birthDate } = body || {};
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
    }

    // Resolve clinic by slug or subdomain
    let clinic: { id: string; ownerId: string | null } | null = null;
    try {
      const rows = await prisma.$queryRaw<{ id: string; ownerId: string | null }[]>`
        SELECT id, "ownerId" FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
      `;
      clinic = rows && rows[0] ? rows[0] : null;
    } catch {}

    // Pick a doctor for this clinic
    let doctor = null as null | { id: string };
    if (clinic?.ownerId) {
      const ownerDoc = await prisma.user.findFirst({ where: { id: clinic.ownerId, role: 'DOCTOR' } as any, select: { id: true } });
      if (ownerDoc) doctor = ownerDoc as any;
    }
    if (!doctor && clinic) {
      const member = await prisma.clinicMember.findFirst({
        where: { clinicId: clinic.id, isActive: true, user: { role: 'DOCTOR' } } as any,
        include: { user: { select: { id: true } } },
      });
      if (member?.user) doctor = member.user as any;
    }
    if (!doctor) {
      // Fallback: allow doctor slug directly
      const doc = await prisma.user.findFirst({ where: { doctor_slug: slug, role: 'DOCTOR' } as any, select: { id: true } });
      if (doc) doctor = doc as any;
    }
    if (!doctor) {
      return NextResponse.json({ error: 'Doctor/Clinic not found for identifier' }, { status: 404 });
    }

    // Upsert user by email
    const existing = await prisma.user.findUnique({ where: { email } });
    let userId: string;

    if (existing) {
      // Update basic fields; set password only if not set
      const data: any = { name: name?.trim() || existing.name, is_active: true };
      if (!existing.password) {
        data.password = await hash(password, 12);
      }
      if (birthDate !== undefined) {
        data.birth_date = birthDate ? new Date(birthDate) : null;
      }
      const updated = await prisma.user.update({ where: { email }, data, select: { id: true } });
      userId = updated.id;
    } else {
      const newId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const created = await prisma.user.create({
        data: {
          id: newId,
          name,
          email,
          phone: phone || null,
          password: await hash(password, 12),
          role: 'PATIENT',
          is_active: true,
          birth_date: birthDate ? new Date(birthDate) : null,
        },
        select: { id: true },
      });
      userId = created.id;
    }

    // Ensure doctor-patient relationship (active)
    const rel = await prisma.doctorPatientRelationship.findUnique({
      where: { patientId_doctorId: { patientId: userId, doctorId: doctor.id } },
      select: { id: true, isActive: true },
    });
    if (!rel) {
      await prisma.doctorPatientRelationship.create({
        data: { doctorId: doctor.id, patientId: userId, isActive: true, isPrimary: false },
      });
    } else if (!rel.isActive) {
      await prisma.doctorPatientRelationship.update({ where: { id: rel.id }, data: { isActive: true } });
    }

    // Upsert per-doctor PatientProfile with provided fields
    await prisma.patientProfile.upsert({
      where: { doctorId_userId: { doctorId: doctor.id, userId } },
      create: {
        doctorId: doctor.id,
        userId,
        name,
        phone: phone || null,
        isActive: true,
      },
      update: { name, phone: phone || null, isActive: true },
    });

    // Emit event
    try {
      let clinicId: string | null = null;
      if (clinic?.id) clinicId = clinic.id;
      if (!clinicId) {
        const owned = await prisma.clinic.findFirst({ where: { ownerId: doctor.id }, select: { id: true } });
        if (owned?.id) clinicId = owned.id;
      }
      if (!clinicId) {
        const membership = await prisma.clinicMember.findFirst({ where: { userId: doctor.id, isActive: true }, select: { clinicId: true } });
        if (membership?.clinicId) clinicId = membership.clinicId;
      }
      if (clinicId) {
        await emitEvent({
          eventType: existing ? EventType.customer_updated : EventType.customer_created,
          actor: EventActor.customer,
          clinicId,
          customerId: userId,
          metadata: existing ? { changes: { name, phone } } : { nome: name, canal_origem: 'public_register' },
        });
      }
    } catch (e) {
      console.error('[events] public register emit failed', e);
    }

    return NextResponse.json({ success: true, userId });
  } catch (e) {
    console.error('public register error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
