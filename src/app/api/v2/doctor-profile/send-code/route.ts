import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomInt } from 'crypto';
import { sendVerificationCode } from '@/lib/email';

/**
 * POST /api/v2/doctor-profile/send-code
 * Sends a verification code to the user's email
 */
export async function POST(request: NextRequest) {
  try {
    const { email, doctorId } = await request.json();

    if (!email || !doctorId) {
      return NextResponse.json(
        { success: false, message: 'Email and doctor ID are required' },
        { status: 400 }
      );
    }

    // Verify doctor exists
    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        role: 'DOCTOR',
        is_active: true
      },
      select: {
        id: true,
        name: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, message: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        is_active: true
      }
    });

    // Flag indicating whether this is a new or existing user
    const isNewUser = !user;
    
    // If new user, check if a temporary user already exists for this email
    let userId: string = '';
    
    if (isNewUser) {
      // Check if a user already exists with this email (including temporary users)
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase()
        }
      });
      
      if (existingUser) {
        // If a user already exists with this email, use its ID
        userId = existingUser.id;
      } else {
        // Generate a unique ID for the temporary user
        const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        try {
          // Create temporary user
          const tempUser = await prisma.user.create({
            data: {
              id: tempUserId,
              email: email.toLowerCase(),
              name: 'Temporary User',
              role: 'PATIENT',
              is_active: false, // Inactive until registration is completed
              password: '', // Empty password, will be set on full registration
              doctor_slug: null
            }
          });
          
          userId = tempUser.id;
        } catch (error) {
          console.error('Error creating temporary user:', error);
          return NextResponse.json(
            { success: false, message: 'Error processing request' },
            { status: 500 }
          );
        }
      }
    } else {
      // Existing user: use their ID
      userId = user!.id;
      
      // Verify the user has prescriptions for this doctor
      const hasPrescriptions = await prisma.protocolPrescription.findFirst({
        where: {
          patient: {
            id: user.id
          },
          protocol: {
            doctor_id: doctor.id
          }
        }
      });

      if (!hasPrescriptions) {
        return NextResponse.json(
          { success: false, message: 'You do not have active protocols with this doctor.' },
          { status: 403 }
        );
      }
    }

    // Generate 6-digit code
    const verificationCode = randomInt(100000, 999999).toString();
    
    // Save code with 15-minute expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Create verification code entry
    await prisma.verificationCode.create({
      data: {
        code: verificationCode,
        user_id: userId, // Use existing or temporary user ID
        doctor_id: doctor.id,
        expires_at: expiresAt,
        type: 'DOCTOR_LINK'
      }
    });

    // Send email with the code
    await sendVerificationCode(email, verificationCode, doctor.name || 'your doctor');

    return NextResponse.json({
      success: true,
      message: 'Code sent successfully'
    });
  } catch (error) {
    console.error('Error sending verification code:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
