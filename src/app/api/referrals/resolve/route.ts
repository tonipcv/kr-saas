import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/referrals/resolve?doctor_slug=dr-foo&code=ABC123
// Public endpoint to resolve a doctor (by slug, case-insensitive) and a patient (by referral_code)
// Returns minimal safe data for both, with helpful error messages.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorSlug = searchParams.get('doctor_slug')?.trim();
    const code = searchParams.get('code')?.trim();

    if (!doctorSlug || !code) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing parameters',
          details: {
            required: ['doctor_slug', 'code'],
            received: { doctor_slug: doctorSlug ?? null, code: code ?? null },
          },
        },
        { status: 400 }
      );
    }

    // Find doctor by slug (case-insensitive)
    const doctor = await prisma.user.findFirst({
      where: {
        role: 'DOCTOR',
        doctor_slug: { equals: doctorSlug, mode: 'insensitive' },
        is_active: true,
      },
      select: { id: true, name: true, email: true, image: true, doctor_slug: true },
    });

    if (!doctor) {
      // Suggest close slugs if possible
      const suggestions = await prisma.user.findMany({
        where: {
          role: 'DOCTOR',
          is_active: true,
          OR: [
            { doctor_slug: { contains: doctorSlug.slice(0, 10), mode: 'insensitive' } },
            { name: { contains: doctorSlug.slice(0, 10), mode: 'insensitive' } },
          ],
        },
        select: { doctor_slug: true, name: true },
        take: 5,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Doctor not found by slug',
          details: {
            requested_slug: doctorSlug,
            suggestions,
            hint: 'Confirme o slug no perfil do médico e tente novamente. O match é case-insensitive, mas precisa ser exato.',
          },
        },
        { status: 404 }
      );
    }

    // Find patient by referral_code
    const patient = await prisma.user.findFirst({
      where: { referral_code: code, role: 'PATIENT', is_active: true },
      select: { id: true, name: true, email: true, image: true, referral_code: true },
    });

    if (!patient) {
      return NextResponse.json(
        {
          success: false,
          error: 'Patient not found by referral code',
          details: {
            code,
            hint: 'Verifique se o código de indicação está correto. O paciente precisa ter referral_code gerado.',
          },
        },
        { status: 404 }
      );
    }

    // Optional: validate existing active relationship between doctor and patient
    // Keeping it soft for now; uncomment to enforce
    // const relationship = await prisma.doctorPatientRelationship.findFirst({
    //   where: { doctor_id: doctor.id, patient_id: patient.id, isActive: true },
    //   select: { id: true, isActive: true, isPrimary: true },
    // });
    // if (!relationship) {
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       error: 'No active relationship between doctor and patient',
    //       details: {
    //         doctor_id: doctor.id,
    //         patient_id: patient.id,
    //         hint: 'Crie/ative o vínculo em patient_relationships ou remova esta validação.',
    //       },
    //     },
    //     { status: 403 }
    //   );
    // }

    return NextResponse.json({
      success: true,
      data: {
        doctor,
        patient,
      },
    });
  } catch (error) {
    console.error('Error resolving referral:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
