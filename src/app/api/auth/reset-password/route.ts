import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }
    
    // Hash the token to match what's stored in the database
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // Find user with valid reset token (select only safe fields)
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
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    // Hash the new password
    const hashedPassword = await hash(password, 12);

    // Update user password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_token: null,
        reset_token_expiry: null,
        email_verified: new Date() // Mark email as verified when password is set
      },
      select: { id: true }
    });

    console.log(`✅ Password updated successfully for user: ${user.email}`);

    return NextResponse.json({
      message: 'Password updated successfully',
      email: user.email // Include email in response to help with redirect
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 