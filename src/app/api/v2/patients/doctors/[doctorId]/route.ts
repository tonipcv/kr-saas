import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { Protocol, ProtocolPrescription, User, products } from '@prisma/client';

// Definindo tipos para os dados retornados pelo Prisma
type ProductItem = {
  products: products
};

type ProtocolWithProducts = Protocol & {
  protocol_products?: ProductItem[]
};

type PrescriptionWithProtocol = ProtocolPrescription & {
  protocol?: ProtocolWithProducts
};

// GET /api/v2/patients/doctors/[doctorId] - Obter informações do médico e suas prescrições para o paciente autenticado
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> }
) {
  try {
    // Extrair o ID do médico da URL (params precisa ser aguardado)
    const { doctorId } = await params;
    
    // Verificar autenticação e obter usuário do token JWT
    const user = await requireMobileAuth(request);
    if (!user) {
      return unauthorizedResponse();
    }

    // Usar o ID do paciente diretamente do token JWT
    const patientId = user.id;

    // Buscar o médico pelo ID
    const doctor = await prisma.user.findUnique({
      where: {
        id: doctorId,
        role: 'DOCTOR',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Médico não encontrado' 
        },
        { status: 404 }
      );
    }

    // Buscar prescrições que o médico fez para esse paciente
    const prescriptions = await prisma.protocolPrescription.findMany({
      where: {
        user_id: patientId,
        protocol: {
          doctor_id: doctorId,
        }
      },
      include: {
        protocol: {
          include: {
            protocol_products: {
              include: {
                products: true
              }
            }
          }
        }
      },
      orderBy: {
        prescribed_at: 'desc'
      }
    });

    // Formatar a resposta de acordo com o padrão JSON especificado
    const response = {
      success: true,
      data: {
        doctor: {
          id: doctor.id,
          name: doctor.name,
          email: doctor.email,
          role: doctor.role,
          image: doctor.image,
          prescriptions: prescriptions.map((prescription: PrescriptionWithProtocol) => ({
            id: prescription.id,
            protocolId: prescription.protocol_id,
            status: prescription.status,
            plannedStartDate: prescription.planned_start_date,
            plannedEndDate: prescription.planned_end_date,
            prescribedAt: prescription.prescribed_at,
            protocol: prescription.protocol ? {
              id: prescription.protocol.id,
              name: prescription.protocol.name,
              description: prescription.protocol.description,
              products: prescription.protocol.protocol_products?.map((p: ProductItem) => ({
                id: p.products.id,
                name: p.products.name,
                description: p.products.description || '',
                imageUrl: '' // O modelo products não tem a propriedade image_url
              })) || []
            } : null
          }))
        }
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao buscar detalhes do médico e prescrições:', error);
    return NextResponse.json(
      { 
        success: false,
        message: 'Erro ao buscar detalhes do médico e prescrições' 
      },
      { status: 500 }
    );
  }
}
