import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sign } from 'jsonwebtoken';

/**
 * POST /api/v2/doctor-profile/verify-code
 * Verifies the code and returns an authentication token
 */
export async function POST(request: NextRequest) {
  try {
    const { email, code, doctorId } = await request.json();

    if (!email || !code || !doctorId) {
      return NextResponse.json(
        { success: false, message: 'Email, code, and doctor ID are required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        is_active: true
      }
    });
    
    // Flag indicating if this is a new user
    const isNewUser = !user;

    // Verify doctor exists
    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        role: 'DOCTOR',
        is_active: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, message: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Find a valid verification code
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        code,
        user_id: user?.id, // Opcional para novos usuários
        doctor_id: doctor.id,
        type: 'DOCTOR_LINK',
        expires_at: {
          gt: new Date()
        },
        used_at: null
      }
    });

    if (!verificationCode) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired code' },
        { status: 400 }
      );
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: {
        id: verificationCode.id
      },
      data: {
        used_at: new Date()
      }
    });

    // Check if this is a temporary user (ID starts with 'temp_')
    const isTemporaryUser = user?.id.startsWith('temp_');
    
    // If temporary or new user, return success without generating a token
    // Token will be generated after full registration
    if (isNewUser || isTemporaryUser) {
      return NextResponse.json({
        success: true,
        isNewUser: true,
        message: 'Code verified successfully. Continue registration.',
        email: email.toLowerCase(),
        doctorId: doctor.id
      });
    }
    
    // For existing users, generate JWT token
    const secret = process.env.NEXTAUTH_SECRET || 'default-secret-key';
    console.log('Generating JWT token for existing user:', user!.email);
    
    const token = sign(
      {
        id: user!.id,
        email: user!.email,
        role: user!.role,
        doctorId: doctor.id,
        type: 'doctor-link'
      },
      secret,
      { expiresIn: '7d' }
    );

    console.log('Token generated successfully, first characters:', token.substring(0, 20) + '...');
    
    // Access log for existing users (commented out as there is no log model in the schema)
    // TODO: Implement log recording when an appropriate model is available
    console.log(`Access via doctor link ${doctor.id} by user ${user!.id}`);

    // Verify token was generated correctly
    if (!token) {
      console.error('Error: Token was not generated correctly');
      return NextResponse.json(
        { success: false, message: 'Error generating token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Code verified successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
