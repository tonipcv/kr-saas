import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    
    // Hash the token to match what's stored in the database
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        reset_token: hashedToken, // Use the hashed token for comparison
        reset_token_expiry: {
          gt: new Date() // Token must not be expired
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        doctor_id: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      email: user.email,
      name: user.name
    });

  } catch (error) {
    console.error('Error validating reset token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 