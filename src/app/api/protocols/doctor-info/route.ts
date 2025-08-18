import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Fetching doctor info for user:', session.user.id);

    // Get the user's data with their relationships
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        patient_relationships: {
          where: {
            isActive: true,
            isPrimary: true
          },
          include: {
            doctor: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          },
          take: 1
        }
      }
    });

    console.log('User data:', { 
      userId: user?.id, 
      role: user?.role,
      relationships: user?.patient_relationships?.map(rel => ({
        doctorId: (rel as any).doctorId ?? (rel as any).doctor_id,
        doctorName: rel.doctor?.name,
        isPrimary: (rel as any).isPrimary ?? (rel as any).is_primary
      })) ?? []
    });

    // Function to get clinic logo for a doctor
    const getClinicLogo = async (doctorId: string) => {
      try {
        // First try to find clinic where doctor is owner
        const ownedClinic = await prisma.clinic.findFirst({
          where: { ownerId: doctorId },
          select: { logo: true, name: true }
        });

        if (ownedClinic?.logo) {
          return { logo: ownedClinic.logo, clinicName: ownedClinic.name };
        }

        // Then try to find clinic where doctor is a member
        const memberClinic = await prisma.clinicMember.findFirst({
          where: { 
            userId: doctorId,
            isActive: true 
          },
          include: {
            clinic: {
              select: { logo: true, name: true }
            }
          }
        });

        if (memberClinic?.clinic?.logo) {
          return { logo: memberClinic.clinic.logo, clinicName: memberClinic.clinic.name };
        }

        return { logo: null, clinicName: null };
      } catch (e) {
        console.error('Error in getClinicLogo()', {
          doctorId,
          error: e instanceof Error ? e.message : e,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return { logo: null, clinicName: null };
      }
    };

    // If the user IS a doctor, return their own info
    if (user?.role === 'DOCTOR') {
      console.log('User is a doctor, returning their own info');
      const clinicInfo = await getClinicLogo(user.id);
      
      const response = NextResponse.json({
        success: true,
        doctor: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          clinicLogo: clinicInfo.logo,
          clinicName: clinicInfo.clinicName
        }
      });
      
      // Add cache-busting headers
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      
      return response;
    }

    // If patient has a directly linked doctor_id, use that first
    if ((user as any)?.doctor_id) {
      console.log('Using user.doctor_id to resolve doctor');
      const doctor = await prisma.user.findUnique({
        where: { id: (user as any).doctor_id as string },
        select: { id: true, name: true, email: true, image: true }
      });
      if (doctor) {
        const clinicInfo = await getClinicLogo(doctor.id);
        const response = NextResponse.json({
          success: true,
          doctor: {
            id: doctor.id,
            name: doctor.name,
            email: doctor.email,
            image: doctor.image,
            clinicLogo: clinicInfo.logo,
            clinicName: clinicInfo.clinicName
          }
        });
        response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        return response;
      }
    }

    // For patients, get their primary doctor from relationships
    const primaryRelationship = user?.patient_relationships[0];
    if (primaryRelationship?.doctor) {
      console.log('Using primary doctor relationship:', primaryRelationship.doctor);
      const clinicInfo = await getClinicLogo(primaryRelationship.doctor.id);
      
      const response = NextResponse.json({
        success: true,
        doctor: {
          id: primaryRelationship.doctor.id,
          name: primaryRelationship.doctor.name,
          email: primaryRelationship.doctor.email,
          image: primaryRelationship.doctor.image,
          clinicLogo: clinicInfo.logo,
          clinicName: clinicInfo.clinicName
        }
      });
      
      // Add cache-busting headers
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      
      return response;
    }

    // Fallback: Buscar protocolos ativos do usuário que mostram informações do médico
    const activeProtocols = await prisma.protocolPrescription.findMany({
      where: {
        user_id: session.user.id,
        protocol: {
          show_doctor_info: true
        }
      },
      include: {
        protocol: {
          include: {
            doctor: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        }
      },
      orderBy: {
        planned_start_date: 'desc'
      },
      take: 1 // Pegar apenas o protocolo mais recente
    });

    console.log('Active protocols with doctor info:', activeProtocols.length);

    // Se encontrou um protocolo ativo com médico
    if (activeProtocols.length > 0 && activeProtocols[0].protocol.doctor) {
      const doctor = activeProtocols[0].protocol.doctor;
      
      console.log('Using protocol doctor:', doctor);
      
      const clinicInfo = await getClinicLogo(doctor.id);
      
      const response = NextResponse.json({
        success: true,
        doctor: {
          id: doctor.id,
          name: doctor.name,
          email: doctor.email,
          image: doctor.image,
          clinicLogo: clinicInfo.logo,
          clinicName: clinicInfo.clinicName
        }
      });
      
      // Add cache-busting headers
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      
      return response;
    }

    // Se não encontrou nenhum médico
    console.log('No doctor found for user');
    const response = NextResponse.json({
      success: true,
      doctor: null
    });
    
    // Add cache-busting headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;
  } catch (error) {
    // Log detailed error information to help debug 500s
    const err = error as any;
    console.error('[doctor-info] Unhandled error fetching doctor info', {
      message: err?.message ?? 'Unknown error',
      name: err?.name,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}