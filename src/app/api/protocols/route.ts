import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/protocols - Listar protocolos do médico
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Get clinicId from query params
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    // Buscar o usuário para verificar o role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem acessar protocolos.' }, { status: 403 });
    }

    // Verify doctor has access to the clinic if clinicId is provided
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: user.id },
            {
              members: {
                some: {
                  userId: user.id,
                  isActive: true
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
      }
    }

    // Build where condition for protocols
    let protocolWhere: any = {
      doctor_id: session.user.id
    };

    // If clinicId is provided, ensure the doctor is a member of that clinic
    if (clinicId) {
      // Verify the user is a member of the specified clinic
      const isMember = await prisma.clinicMember.findFirst({
        where: {
          clinicId: clinicId,
          userId: session.user.id,
          isActive: true
        }
      });

      if (!isMember) {
        // If not a member but is the owner, still allow access
        const isOwner = await prisma.clinic.findFirst({
          where: {
            id: clinicId,
            ownerId: session.user.id
          }
        });

        if (!isOwner) {
          return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
        }
      }
    }

    const protocols = await prisma.protocol.findMany({
      where: protocolWhere,
      include: {
        days: {
          include: {
            sessions: {
              include: {
                tasks: {
                  include: {
                    ProtocolContent: true
                  }
                }
              }
            }
          },
          orderBy: {
            dayNumber: 'asc'
          }
        },
        prescriptions: {
          where: {
            status: { in: ['ACTIVE', 'PRESCRIBED'] }
          },
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Transformar dados para formato esperado pelo frontend
    const transformedProtocols = protocols.map(protocol => ({
      ...protocol,
      days: protocol.days.map(day => ({
        ...day,
        tasks: day.sessions.flatMap(session => 
          session.tasks.map(task => ({
            ...task,
            contents: task.ProtocolContent || []
          }))
        ),
        contents: day.sessions.flatMap(session => 
          session.tasks.flatMap(task => task.ProtocolContent || [])
        )
      })),
      // Map prescriptions to assignments format expected by the frontend
      assignments: protocol.prescriptions.map(prescription => ({
        id: prescription.id,
        user: prescription.patient,
        isActive: prescription.status === 'ACTIVE' || prescription.status === 'PRESCRIBED',
        startDate: prescription.planned_start_date,
        endDate: prescription.planned_end_date
      }))
    }));

    return NextResponse.json(transformedProtocols);
  } catch (error) {
    console.error('Error fetching protocols:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json({ error: 'Erro ao buscar protocolos' }, { status: 500 });
  }
}

// POST /api/protocols - Criar novo protocolo
export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { name, description, coverImage: cover_image, days } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: "Protocol name is required" },
        { status: 400 }
      );
    }

    // Create protocol
    const protocol = await prisma.protocol.create({
      data: {
        name,
        description,
        cover_image,
        doctor_id: session.user.id,
        days: {
          create: days.map((day: any) => ({
            dayNumber: day.dayNumber,
            title: day.title,
            sessions: {
              create: day.sessions.map((session: any) => ({
                sessionNumber: session.order + 1,
                title: session.name,
                description: '',
                tasks: {
                  create: session.tasks.map((task: any) => ({
                    title: task.title,
                    description: task.description,
                    type: task.type,
                    orderIndex: task.orderIndex
                  }))
                }
              }))
            }
          }))
        }
      },
      include: {
        days: {
          include: {
            sessions: {
              include: {
                tasks: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json(protocol);
  } catch (error) {
    console.error("Error creating protocol:", error);
    return NextResponse.json(
      { error: "Error creating protocol" },
      { status: 500 }
    );
  }
} 